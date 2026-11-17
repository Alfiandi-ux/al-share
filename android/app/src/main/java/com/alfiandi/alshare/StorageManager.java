package com.alfiandi.alshare;

import android.content.Context;
import android.media.MediaScannerConnection;
import android.os.Environment;
import android.os.StatFs;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public class StorageManager {
    private final Context context;
    private final File rootDir;
    private final File tempDir;
    private final Map<String, UploadSession> activeUploads = new HashMap<>();
    private final List<JSONObject> clipboardMessages = new ArrayList<>();

    public static class UploadSession {
        String uploadId;
        String filename;
        long totalSize;
        int totalChunks;
        int chunkSize;
        File tempFile;
        Set<Integer> chunksReceived = new HashSet<>();
        long createdAt;
    }

    public StorageManager(Context context) {
        this.context = context;

        // Try standard Download/alshare first, fallback to app-specific external storage
        File targetDir = null;
        try {
            File publicDownload = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            targetDir = new File(publicDownload, "alshare");
            if (!targetDir.exists()) {
                targetDir.mkdirs();
            }
        } catch (Exception ignored) {
        }

        if (targetDir == null || !targetDir.canWrite()) {
            File ext = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            targetDir = new File(ext != null ? ext : context.getFilesDir(), "alshare");
            targetDir.mkdirs();
        }

        this.rootDir = targetDir;
        this.tempDir = new File(this.rootDir, ".alshare_tmp");
        if (!this.tempDir.exists()) {
            this.tempDir.mkdirs();
        }
    }

    public File getRootDir() {
        return rootDir;
    }

    public String sanitizeFilename(String filename) {
        if (filename == null) return "file_" + (System.currentTimeMillis() / 1000);
        String clean = new File(filename).getName().trim();
        clean = clean.replace('\0', '_').replace('/', '_').replace('\\', '_');
        if (clean.isEmpty() || clean.startsWith(".")) {
            clean = "file_" + (System.currentTimeMillis() / 1000);
        }
        return clean;
    }

    public String getUniqueFilename(String filename) {
        String clean = sanitizeFilename(filename);
        File target = new File(rootDir, clean);
        if (!target.exists()) return clean;

        String nameWithoutExt = clean;
        String ext = "";
        int dot = clean.lastIndexOf('.');
        if (dot > 0) {
            nameWithoutExt = clean.substring(0, dot);
            ext = clean.substring(dot);
        }

        int counter = 1;
        while (target.exists()) {
            String newName = nameWithoutExt + " (" + counter + ")" + ext;
            target = new File(rootDir, newName);
            counter++;
        }
        return target.getName();
    }

    public synchronized JSONObject initChunkedUpload(String filename, long totalSize, int totalChunks, int chunkSize) throws Exception {
        String uploadId = UUID.randomUUID().toString();
        String safeName = getUniqueFilename(filename);
        File tempFile = new File(tempDir, uploadId + ".part");

        // Touch/create empty temp file
        if (tempFile.exists()) tempFile.delete();
        tempFile.createNewFile();

        UploadSession session = new UploadSession();
        session.uploadId = uploadId;
        session.filename = safeName;
        session.totalSize = totalSize;
        session.totalChunks = totalChunks;
        session.chunkSize = chunkSize;
        session.tempFile = tempFile;
        session.createdAt = System.currentTimeMillis();

        activeUploads.put(uploadId, session);

        JSONObject res = new JSONObject();
        res.put("upload_id", uploadId);
        res.put("filename", safeName);
        res.put("total_chunks", totalChunks);
        return res;
    }

    public synchronized JSONObject writeChunk(String uploadId, int chunkIndex, byte[] data) throws Exception {
        UploadSession session = activeUploads.get(uploadId);
        if (session == null) {
            throw new IllegalArgumentException("Session upload tidak ditemukan");
        }

        long offset = (long) chunkIndex * session.chunkSize;
        try (RandomAccessFile raf = new RandomAccessFile(session.tempFile, "rw")) {
            raf.seek(offset);
            raf.write(data);
        }

        session.chunksReceived.add(chunkIndex);
        int receivedCount = session.chunksReceived.size();
        int total = session.totalChunks;
        double percent = total > 0 ? Math.round(((double) receivedCount / total) * 1000.0) / 10.0 : 100.0;

        JSONObject res = new JSONObject();
        res.put("upload_id", uploadId);
        res.put("chunk_index", chunkIndex);
        res.put("received", receivedCount);
        res.put("total", total);
        res.put("percent", percent);
        return res;
    }

    public synchronized JSONObject completeChunkedUpload(String uploadId) throws Exception {
        UploadSession session = activeUploads.remove(uploadId);
        if (session == null) {
            throw new IllegalArgumentException("Session upload tidak ditemukan");
        }

        File destFile = new File(rootDir, session.filename);
        if (session.tempFile.exists()) {
            boolean renamed = session.tempFile.renameTo(destFile);
            if (!renamed) {
                // Try copy & delete fallback if across filesystems
                try (RandomAccessFile src = new RandomAccessFile(session.tempFile, "r");
                     RandomAccessFile dst = new RandomAccessFile(destFile, "rw")) {
                    byte[] buf = new byte[64 * 1024];
                    int len;
                    while ((len = src.read(buf)) > 0) {
                        dst.write(buf, 0, len);
                    }
                }
                session.tempFile.delete();
            }
        }

        // Notify MediaScanner so photos/videos appear in Gallery
        try {
            MediaScannerConnection.scanFile(context, new String[]{destFile.getAbsolutePath()}, null, null);
        } catch (Exception ignored) {
        }

        JSONObject res = new JSONObject();
        res.put("filename", session.filename);
        res.put("size", destFile.length());
        res.put("path", destFile.getAbsolutePath());
        res.put("success", true);
        return res;
    }

    public synchronized JSONObject cancelChunkedUpload(String uploadId) {
        UploadSession session = activeUploads.remove(uploadId);
        if (session != null && session.tempFile.exists()) {
            session.tempFile.delete();
        }
        JSONObject res = new JSONObject();
        try {
            res.put("status", "cancelled");
        } catch (Exception ignored) {
        }
        return res;
    }

    public List<JSONObject> listFiles() {
        List<JSONObject> list = new ArrayList<>();
        File[] files = rootDir.listFiles();
        if (files == null) return list;

        // Sort descending by modified date
        Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));

        for (File f : files) {
            if (f.getName().startsWith(".") || !f.isFile()) continue;
            try {
                JSONObject obj = new JSONObject();
                obj.put("name", f.getName());
                obj.put("size", f.length());
                obj.put("size_formatted", formatSize(f.length()));
                obj.put("modified", f.lastModified());
                String mime = getMimeType(f.getName());
                obj.put("mime", mime != null ? mime : "application/octet-stream");
                obj.put("category", categorizeMime(mime, f.getName()));
                list.add(obj);
            } catch (Exception ignored) {
            }
        }
        return list;
    }

    public boolean deleteFile(String filename) {
        String safe = sanitizeFilename(filename);
        File target = new File(rootDir, safe);
        if (target.exists() && target.isFile()) {
            boolean deleted = target.delete();
            if (deleted) {
                try {
                    MediaScannerConnection.scanFile(context, new String[]{target.getAbsolutePath()}, null, null);
                } catch (Exception ignored) {
                }
            }
            return deleted;
        }
        return false;
    }

    public File getFile(String filename) {
        String safe = sanitizeFilename(filename);
        File target = new File(rootDir, safe);
        return (target.exists() && target.isFile()) ? target : null;
    }

    public JSONObject getStorageStats() {
        JSONObject obj = new JSONObject();
        try {
            StatFs stat = new StatFs(rootDir.getAbsolutePath());
            long total = stat.getTotalBytes();
            long free = stat.getAvailableBytes();
            long used = total - free;
            double percent = total > 0 ? Math.round(((double) used / total) * 1000.0) / 10.0 : 0.0;

            obj.put("total", total);
            obj.put("used", used);
            obj.put("free", free);
            obj.put("total_formatted", formatSize(total));
            obj.put("used_formatted", formatSize(used));
            obj.put("free_formatted", formatSize(free));
            obj.put("percent_used", percent);
            obj.put("folder", rootDir.getAbsolutePath());
        } catch (Exception e) {
            try {
                obj.put("total", 0);
                obj.put("used", 0);
                obj.put("free", 0);
                obj.put("total_formatted", "N/A");
                obj.put("used_formatted", "N/A");
                obj.put("free_formatted", "N/A");
                obj.put("percent_used", 0);
                obj.put("folder", rootDir.getAbsolutePath());
            } catch (Exception ignored) {
            }
        }
        return obj;
    }

    public synchronized JSONObject addClipboardMessage(String text, String sender) {
        try {
            JSONObject msg = new JSONObject();
            msg.put("id", UUID.randomUUID().toString().substring(0, 8));
            msg.put("text", text);
            msg.put("sender", sender != null ? sender : "Device");
            msg.put("timestamp", System.currentTimeMillis());

            clipboardMessages.add(0, msg);
            if (clipboardMessages.size() > 50) {
                clipboardMessages.remove(clipboardMessages.size() - 1);
            }
            return msg;
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    public synchronized JSONArray getClipboardMessages() {
        JSONArray arr = new JSONArray();
        for (JSONObject m : clipboardMessages) {
            arr.put(m);
        }
        return arr;
    }

    public synchronized void clearClipboard() {
        clipboardMessages.clear();
    }

    public static String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format(Locale.US, "%.2f KB", bytes / 1024.0);
        if (bytes < 1024L * 1024 * 1024) return String.format(Locale.US, "%.2f MB", bytes / (1024.0 * 1024.0));
        return String.format(Locale.US, "%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }

    public static String getMimeType(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot >= 0) {
            String ext = filename.substring(dot + 1).toLowerCase(Locale.ROOT);
            return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        }
        return "application/octet-stream";
    }

    public static String categorizeMime(String mime, String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (mime != null) {
            if (mime.startsWith("image/")) return "image";
            if (mime.startsWith("video/")) return "video";
            if (mime.startsWith("audio/")) return "audio";
            if (mime.startsWith("text/") || mime.equals("application/pdf") || mime.contains("word") || mime.contains("document")) {
                return "document";
            }
        }
        if (lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z") || lower.endsWith(".tar") || lower.endsWith(".gz") || lower.endsWith(".apk") || lower.endsWith(".iso")) {
            return "archive";
        }
        if (lower.endsWith(".py") || lower.endsWith(".js") || lower.endsWith(".html") || lower.endsWith(".css") || lower.endsWith(".java") || lower.endsWith(".json") || lower.endsWith(".sh")) {
            return "code";
        }
        if (lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".txt") || lower.endsWith(".md")) {
            return "document";
        }
        return "other";
    }
}
