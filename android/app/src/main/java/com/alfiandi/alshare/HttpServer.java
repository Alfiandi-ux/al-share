package com.alfiandi.alshare;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class HttpServer {
    private final Context context;
    private final StorageManager storageManager;
    private final int port;
    private ServerSocket serverSocket;
    private ExecutorService threadPool;
    private volatile boolean isRunning = false;

    public HttpServer(Context context, StorageManager storageManager, int port) {
        this.context = context;
        this.storageManager = storageManager;
        this.port = port;
    }

    public synchronized void start() throws IOException {
        if (isRunning) return;
        serverSocket = new ServerSocket(port, 50, InetAddress.getByName("0.0.0.0"));
        serverSocket.setReuseAddress(true);
        threadPool = Executors.newCachedThreadPool();
        isRunning = true;

        new Thread(() -> {
            while (isRunning) {
                try {
                    Socket clientSocket = serverSocket.accept();
                    if (!isRunning) {
                        try { clientSocket.close(); } catch (Exception ignored) {}
                        break;
                    }
                    threadPool.execute(() -> handleClient(clientSocket));
                } catch (Exception e) {
                    if (!isRunning) break;
                }
            }
        }, "AlShareHttpServer").start();
    }

    public synchronized void stop() {
        isRunning = false;
        if (serverSocket != null) {
            try { serverSocket.close(); } catch (Exception ignored) {}
        }
        if (threadPool != null) {
            threadPool.shutdownNow();
        }
    }

    public boolean isRunning() {
        return isRunning;
    }

    public int getPort() {
        return port;
    }

    private void handleClient(Socket socket) {
        try (InputStream in = new BufferedInputStream(socket.getInputStream());
             OutputStream out = new BufferedOutputStream(socket.getOutputStream())) {

            // Read HTTP request line and headers
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;

            String method = parts[0].toUpperCase();
            String fullUri = parts[1];

            Map<String, String> headers = new HashMap<>();
            String headerLine;
            while ((headerLine = readLine(in)) != null && !headerLine.isEmpty()) {
                int colon = headerLine.indexOf(':');
                if (colon > 0) {
                    headers.put(headerLine.substring(0, colon).trim().toLowerCase(),
                            headerLine.substring(colon + 1).trim());
                }
            }

            // Handle OPTIONS preflight
            if ("OPTIONS".equals(method)) {
                sendResponseHeaders(out, 204, "No Content", "text/plain", 0, null);
                out.flush();
                return;
            }

            // Parse URL and Query parameters
            Uri uri = Uri.parse(fullUri);
            String path = uri.getPath();
            if (path == null) path = "/";

            if ("GET".equals(method)) {
                handleGet(path, uri, headers, out);
            } else if ("POST".equals(method)) {
                handlePost(path, uri, headers, in, out);
            } else if ("DELETE".equals(method)) {
                handleDelete(path, out);
            } else {
                sendError(out, 405, "Method Not Allowed");
            }

            out.flush();
        } catch (Exception ignored) {
        } finally {
            try { socket.close(); } catch (Exception ignored) {}
        }
    }

    private void handleGet(String path, Uri uri, Map<String, String> headers, OutputStream out) throws Exception {
        // API Info
        if ("/api/info".equals(path)) {
            List<String> ips = NetworkUtils.getLocalIpAddresses();
            JSONObject stats = storageManager.getStorageStats();
            JSONObject res = new JSONObject();
            res.put("name", "Al-share");
            res.put("version", "1.2.0");
            res.put("ips", new JSONArray(ips));
            res.put("port", port);
            res.put("storage", stats);
            sendJson(out, res);
            return;
        }

        // API Files
        if ("/api/files".equals(path)) {
            List<JSONObject> files = storageManager.listFiles();
            JSONObject res = new JSONObject();
            res.put("files", new JSONArray(files));
            sendJson(out, res);
            return;
        }

        // API QR Code (returns SVG)
        if ("/api/qr".equals(path)) {
            String primaryUrl = "http://" + NetworkUtils.getPrimaryIp() + ":" + port;
            String svg = generateSvgQr(primaryUrl);
            byte[] bytes = svg.getBytes(StandardCharsets.UTF_8);
            sendResponseHeaders(out, 200, "OK", "image/svg+xml", bytes.length, null);
            out.write(bytes);
            return;
        }

        // API Clipboard
        if ("/api/clipboard".equals(path)) {
            JSONArray arr = storageManager.getClipboardMessages();
            JSONObject res = new JSONObject();
            res.put("messages", arr);
            sendJson(out, res);
            return;
        }

        // File download & Streaming with HTTP Range Requests support
        if (path.startsWith("/download/") || path.startsWith("/api/download/")) {
            String filename = path.replace("/api/download/", "").replace("/download/", "");
            filename = URLDecoder.decode(filename, "UTF-8");
            handleFileDownload(filename, headers, out);
            return;
        }

        // Static Web Assets
        String assetPath = path.equals("/") ? "index.html" : path.substring(1);
        serveAsset("web/" + assetPath, out);
    }

    private void handlePost(String path, Uri uri, Map<String, String> headers, InputStream in, OutputStream out) throws Exception {
        int contentLength = 0;
        if (headers.containsKey("content-length")) {
            try { contentLength = Integer.parseInt(headers.get("content-length")); } catch (Exception ignored) {}
        }

        // API Init Chunked Upload
        if ("/api/upload/init".equals(path)) {
            byte[] body = readBytes(in, contentLength);
            JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
            String filename = json.optString("filename", "file");
            long totalSize = json.optLong("totalSize", 0);
            int totalChunks = json.optInt("totalChunks", 1);
            int chunkSize = json.optInt("chunkSize", 5 * 1024 * 1024);

            JSONObject res = storageManager.initChunkedUpload(filename, totalSize, totalChunks, chunkSize);
            sendJson(out, res);
            return;
        }

        // API Upload Chunk
        if ("/api/upload/chunk".equals(path)) {
            String uploadId = uri.getQueryParameter("upload_id");
            int chunkIndex = 0;
            try { chunkIndex = Integer.parseInt(uri.getQueryParameter("chunk_index")); } catch (Exception ignored) {}

            byte[] chunkData = readBytes(in, contentLength);
            JSONObject res = storageManager.writeChunk(uploadId, chunkIndex, chunkData);
            sendJson(out, res);
            return;
        }

        // API Complete Upload
        if ("/api/upload/complete".equals(path)) {
            String uploadId = uri.getQueryParameter("upload_id");
            if (uploadId == null && contentLength > 0) {
                byte[] body = readBytes(in, contentLength);
                JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
                uploadId = json.optString("upload_id");
            }
            JSONObject res = storageManager.completeChunkedUpload(uploadId);
            sendJson(out, res);
            return;
        }

        // API Cancel Upload
        if ("/api/upload/cancel".equals(path)) {
            String uploadId = uri.getQueryParameter("upload_id");
            if (uploadId == null && contentLength > 0) {
                byte[] body = readBytes(in, contentLength);
                JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
                uploadId = json.optString("upload_id");
            }
            JSONObject res = storageManager.cancelChunkedUpload(uploadId);
            sendJson(out, res);
            return;
        }

        // API Delete File
        if ("/api/file/delete".equals(path)) {
            byte[] body = readBytes(in, contentLength);
            JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
            String filename = json.optString("filename");
            boolean ok = storageManager.deleteFile(filename);
            if (ok) {
                JSONObject res = new JSONObject();
                res.put("status", "deleted");
                res.put("filename", filename);
                sendJson(out, res);
            } else {
                sendError(out, 404, "File tidak ditemukan atau gagal dihapus");
            }
            return;
        }

        // API Clipboard POST
        if ("/api/clipboard".equals(path)) {
            byte[] body = readBytes(in, contentLength);
            JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
            String text = json.optString("text", "").trim();
            String sender = json.optString("sender", "Android Device");
            if (!text.isEmpty()) {
                JSONObject msg = storageManager.addClipboardMessage(text, sender);
                JSONObject res = new JSONObject();
                res.put("status", "ok");
                res.put("message", msg);
                sendJson(out, res);
            } else {
                sendError(out, 400, "Teks tidak boleh kosong");
            }
            return;
        }

        sendError(out, 404, "Endpoint Not Found");
    }

    private void handleDelete(String path, OutputStream out) throws Exception {
        if ("/api/clipboard".equals(path)) {
            storageManager.clearClipboard();
            JSONObject res = new JSONObject();
            res.put("status", "cleared");
            sendJson(out, res);
            return;
        }
        sendError(out, 404, "Not Found");
    }

    private void handleFileDownload(String filename, Map<String, String> headers, OutputStream out) throws IOException {
        File file = storageManager.getFile(filename);
        if (file == null || !file.exists()) {
            sendError(out, 404, "Berkas tidak ditemukan");
            return;
        }

        long fileLen = file.length();
        String mime = StorageManager.getMimeType(filename);
        String range = headers.get("range");

        if (range != null && range.startsWith("bytes=")) {
            String[] parts = range.substring(6).split("-");
            long start = 0;
            long end = fileLen - 1;
            try {
                if (!parts[0].isEmpty()) start = Long.parseLong(parts[0]);
                if (parts.length > 1 && !parts[1].isEmpty()) end = Long.parseLong(parts[1]);
            } catch (Exception ignored) {}

            if (start > end || start >= fileLen) {
                sendResponseHeaders(out, 416, "Requested Range Not Satisfiable", "text/plain", 0, "bytes */" + fileLen);
                return;
            }

            long chunkLen = end - start + 1;
            sendResponseHeaders(out, 206, "Partial Content", mime, chunkLen, "bytes " + start + "-" + end + "/" + fileLen);

            try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
                raf.seek(start);
                byte[] buf = new byte[64 * 1024];
                long remaining = chunkLen;
                while (remaining > 0) {
                    int toRead = (int) Math.min(buf.length, remaining);
                    int read = raf.read(buf, 0, toRead);
                    if (read <= 0) break;
                    out.write(buf, 0, read);
                    remaining -= read;
                }
            }
        } else {
            sendResponseHeaders(out, 200, "OK", mime, fileLen, null);
            try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
                byte[] buf = new byte[64 * 1024];
                int read;
                while ((read = raf.read(buf)) > 0) {
                    out.write(buf, 0, read);
                }
            }
        }
    }

    private void serveAsset(String assetPath, OutputStream out) throws IOException {
        AssetManager am = context.getAssets();
        try (InputStream is = am.open(assetPath)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[16384];
            int n;
            while ((n = is.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, n);
            }
            byte[] bytes = buffer.toByteArray();
            String mime = getAssetMimeType(assetPath);
            sendResponseHeaders(out, 200, "OK", mime, bytes.length, null);
            out.write(bytes);
        } catch (Exception e) {
            // Fallback for offline.html or index.html
            try (InputStream is = am.open("web/index.html")) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] data = new byte[16384];
                int n;
                while ((n = is.read(data, 0, data.length)) != -1) {
                    buffer.write(data, 0, n);
                }
                byte[] bytes = buffer.toByteArray();
                sendResponseHeaders(out, 200, "OK", "text/html; charset=utf-8", bytes.length, null);
                out.write(bytes);
            } catch (Exception ignored) {
                sendError(out, 404, "Asset Not Found");
            }
        }
    }

    private String getAssetMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    private void sendJson(OutputStream out, JSONObject json) throws IOException {
        byte[] bytes = json.toString().getBytes(StandardCharsets.UTF_8);
        sendResponseHeaders(out, 200, "OK", "application/json; charset=utf-8", bytes.length, null);
        out.write(bytes);
    }

    private void sendError(OutputStream out, int code, String msg) throws IOException {
        byte[] bytes = msg.getBytes(StandardCharsets.UTF_8);
        sendResponseHeaders(out, code, msg, "text/plain; charset=utf-8", bytes.length, null);
        out.write(bytes);
    }

    private void sendResponseHeaders(OutputStream out, int code, String statusText, String contentType, long length, String contentRange) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 ").append(code).append(" ").append(statusText).append("\r\n");
        sb.append("Server: Al-share/1.2.0 (Android)\r\n");
        sb.append("Content-Type: ").append(contentType).append("\r\n");
        sb.append("Content-Length: ").append(length).append("\r\n");
        sb.append("Access-Control-Allow-Origin: *\r\n");
        sb.append("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n");
        sb.append("Access-Control-Allow-Headers: Content-Type, Range, X-Chunk-Index, X-Upload-Id\r\n");
        sb.append("Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length\r\n");
        sb.append("Accept-Ranges: bytes\r\n");
        if (contentRange != null) {
            sb.append("Content-Range: ").append(contentRange).append("\r\n");
        }
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    private String generateSvgQr(String text) {
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(text, BarcodeFormat.QR_CODE, 250, 250);
            int width = matrix.getWidth();
            int height = matrix.getHeight();

            StringBuilder svg = new StringBuilder();
            svg.append("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ")
               .append(width).append(" ").append(height)
               .append("\" shape-rendering=\"crispEdges\">\n");
            svg.append("<rect width=\"100%\" height=\"100%\" fill=\"#FFFFFF\"/>\n");

            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    if (matrix.get(x, y)) {
                        svg.append("<rect x=\"").append(x).append("\" y=\"").append(y)
                           .append("\" width=\"1\" height=\"1\" fill=\"#000000\"/>\n");
                    }
                }
            }
            svg.append("</svg>");
            return svg.toString();
        } catch (Exception e) {
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text x=\"10\" y=\"50\">QR Error</text></svg>";
        }
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\r') {
                int next = in.read();
                if (next == '\n' || next == -1) break;
                sb.append((char) c);
                sb.append((char) next);
            } else if (c == '\n') {
                break;
            } else {
                sb.append((char) c);
            }
        }
        if (sb.length() == 0 && c == -1) return null;
        return sb.toString();
    }

    private static byte[] readBytes(InputStream in, int length) throws IOException {
        byte[] bytes = new byte[length];
        int totalRead = 0;
        while (totalRead < length) {
            int read = in.read(bytes, totalRead, length - totalRead);
            if (read == -1) break;
            totalRead += read;
        }
        return bytes;
    }
}
