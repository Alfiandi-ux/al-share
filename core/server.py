"""
Al-share Streaming HTTP Server
High-concurrency, multi-threaded server with native HTTP Range requests (206 Partial Content)
and chunked binary upload streaming for unlimited file size transfers.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.parse
import json
import os
import mimetypes
import traceback
from .network import get_local_ip_addresses
from .qrcode import generate_svg_qr

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handles requests in a separate thread for high concurrency."""
    daemon_threads = True
    allow_reuse_address = True

class AlShareHandler(BaseHTTPRequestHandler):
    # Buffer size for reading and sending large files (64 KB)
    BUFFER_SIZE = 64 * 1024

    def log_message(self, format, *args):
        """Custom clean logging to terminal."""
        # Suppress routine chunk logging to keep terminal tidy
        if "/api/upload/chunk" in self.path:
            return
        # Print clean status line
        print(f"[\033[1;34mAl-share\033[0m] {self.address_string()} - {format % args}")

    @property
    def storage(self):
        return self.server.storage_manager

    @property
    def web_dir(self):
        return self.server.web_dir

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range, X-Chunk-Index, X-Upload-Id")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        try:
            # API: Info & Network status
            if path == "/api/info":
                ips = get_local_ip_addresses()
                stats = self.storage.get_storage_stats()
                return self.send_json({
                    "name": "Al-share",
                    "version": "1.0.0",
                    "ips": ips,
                    "port": self.server.server_address[1],
                    "storage": stats
                })

            # API: List all shared files
            if path == "/api/files":
                files = self.storage.list_files()
                return self.send_json({"files": files})

            # API: QR Code SVG
            if path == "/api/qr":
                ips = get_local_ip_addresses()
                port = self.server.server_address[1]
                primary_url = f"http://{ips[0]}:{port}"
                svg_data = generate_svg_qr(primary_url)
                svg_bytes = svg_data.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(svg_bytes)))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(svg_bytes)
                return

            # API: Upload session status (for resuming)
            if path == "/api/upload/status":
                upload_id = params.get("upload_id", [""])[0]
                status = self.storage.get_upload_status(upload_id)
                if status:
                    return self.send_json(status)
                return self.send_json({"error": "Upload ID tidak ditemukan"}, 404)

            # API: Shared Clipboard Messages
            if path == "/api/clipboard":
                messages = self.storage.get_clipboard_messages()
                return self.send_json({"messages": messages})

            # File Download & Streaming Endpoint (with HTTP Range Request support!)
            if path.startswith("/download/") or path.startswith("/api/download/"):
                filename = path.replace("/api/download/", "").replace("/download/", "")
                filename = urllib.parse.unquote(filename)
                return self.handle_file_download(filename, params)

            # Static Assets
            if path == "/" or path == "/index.html":
                return self.serve_static_file("index.html", "text/html; charset=utf-8")
            elif path == "/style.css":
                return self.serve_static_file("style.css", "text/css; charset=utf-8")
            elif path == "/app.js":
                return self.serve_static_file("app.js", "application/javascript; charset=utf-8")

            # 404
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_json({"error": str(e)}, 500)
            except Exception:
                pass

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        try:
            # API: Init Chunked Upload
            if path == "/api/upload/init":
                content_len = int(self.headers.get("Content-Length", 0))
                raw_data = self.rfile.read(content_len).decode("utf-8")
                body = json.loads(raw_data)
                
                filename = body.get("filename")
                total_size = body.get("totalSize", 0)
                total_chunks = body.get("totalChunks", 1)
                chunk_size = body.get("chunkSize", 5 * 1024 * 1024)

                res = self.storage.init_chunked_upload(filename, total_size, total_chunks, chunk_size)
                return self.send_json(res)

            # API: Upload Chunk (Binary streaming directly to disk)
            if path == "/api/upload/chunk":
                upload_id = params.get("upload_id", [""])[0]
                chunk_index = int(params.get("chunk_index", ["0"])[0])
                content_len = int(self.headers.get("Content-Length", 0))

                if not upload_id or content_len <= 0:
                    return self.send_json({"error": "Parameter upload tidak valid"}, 400)

                # Read binary chunk from stream
                chunk_data = self.rfile.read(content_len)
                res = self.storage.write_chunk(upload_id, chunk_index, chunk_data)
                return self.send_json(res)

            # API: Complete Upload
            if path == "/api/upload/complete":
                content_len = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(content_len).decode("utf-8")) if content_len > 0 else {}
                upload_id = body.get("upload_id") or params.get("upload_id", [""])[0]

                res = self.storage.complete_chunked_upload(upload_id)
                return self.send_json(res)

            # API: Cancel Upload
            if path == "/api/upload/cancel":
                content_len = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(content_len).decode("utf-8")) if content_len > 0 else {}
                upload_id = body.get("upload_id") or params.get("upload_id", [""])[0]

                res = self.storage.cancel_chunked_upload(upload_id)
                return self.send_json(res)

            # API: Delete File
            if path == "/api/file/delete":
                content_len = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(content_len).decode("utf-8"))
                filename = body.get("filename")
                if self.storage.delete_file(filename):
                    return self.send_json({"status": "deleted", "filename": filename})
                return self.send_json({"error": "Gagal menghapus file atau file tidak ada"}, 404)

            # API: Post to Shared Clipboard
            if path == "/api/clipboard":
                content_len = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(content_len).decode("utf-8"))
                text = body.get("text", "").strip()
                sender = body.get("sender", "Device")
                if text:
                    msg = self.storage.add_clipboard_message(text, sender)
                    return self.send_json({"status": "ok", "message": msg})
                return self.send_json({"error": "Teks tidak boleh kosong"}, 400)

            # 404
            self.send_response(404)
            self.end_headers()

        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_json({"error": str(e)}, 500)
            except Exception:
                pass

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/clipboard":
            self.storage.clear_clipboard()
            return self.send_json({"status": "cleared"})
        self.send_response(404)
        self.end_headers()

    def serve_static_file(self, filename, content_type):
        filepath = os.path.join(self.web_dir, filename)
        if not os.path.exists(filepath):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Asset Not Found")
            return

        with open(filepath, "rb") as f:
            content = f.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(content)

    def handle_file_download(self, filename: str, params):
        """
        Transfers files of unlimited size using streaming buffers.
        Fully supports HTTP Range Requests (RFC 7233) for:
        - Instant seeking in 4K/1080p videos & audio
        - Resuming interrupted downloads
        - Multi-part download managers (IDM, aria2, curl, browsers)
        """
        filepath = self.storage.get_file_path(filename)
        if not filepath:
            self.send_response(404)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(b"File not found")
            return

        total_size = os.path.getsize(filepath)
        mime_type, _ = mimetypes.guess_type(filename)
        mime_type = mime_type or "application/octet-stream"

        # Check inline preview param
        is_preview = params.get("preview", ["0"])[0] == "1"
        disposition = "inline" if is_preview else f'attachment; filename="{os.path.basename(filename)}"'

        # Parse Range header if present
        range_header = self.headers.get("Range")
        if range_header and range_header.startswith("bytes="):
            try:
                range_spec = range_header.replace("bytes=", "").strip()
                parts = range_spec.split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if parts[1] else total_size - 1

                if start >= total_size or end >= total_size or start > end:
                    self.send_response(416)  # Range Not Satisfiable
                    self.send_header("Content-Range", f"bytes */{total_size}")
                    self.send_cors_headers()
                    self.end_headers()
                    return

                length = end - start + 1
                self.send_response(206)  # Partial Content
                self.send_header("Content-Type", mime_type)
                self.send_header("Content-Range", f"bytes {start}-{end}/{total_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Disposition", disposition)
                self.send_cors_headers()
                self.end_headers()

                with open(filepath, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk_to_read = min(self.BUFFER_SIZE, remaining)
                        data = f.read(chunk_to_read)
                        if not data:
                            break
                        self.wfile.write(data)
                        remaining -= len(data)
                return
            except (ValueError, IndexError):
                pass  # Fall through to full download if range invalid

        # Full file download (Status 200)
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(total_size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Disposition", disposition)
        self.send_cors_headers()
        self.end_headers()

        with open(filepath, "rb") as f:
            while True:
                data = f.read(self.BUFFER_SIZE)
                if not data:
                    break
                self.wfile.write(data)
