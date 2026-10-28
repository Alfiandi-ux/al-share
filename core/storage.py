"""
Al-share Storage Engine
Handles chunked disk streaming (unlimited file size), safe file operations,
disk usage tracking, and multi-device clipboard storage.
"""

import os
import shutil
import time
import uuid
import mimetypes
import threading

class StorageManager:
    def __init__(self, root_dir=None):
        if root_dir is None:
            root_dir = os.path.expanduser("~/alshare_downloads")
        self.root_dir = os.path.abspath(root_dir)
        os.makedirs(self.root_dir, exist_ok=True)

        self.temp_dir = os.path.join(self.root_dir, ".alshare_tmp")
        os.makedirs(self.temp_dir, exist_ok=True)

        # In-memory registry of active chunked uploads
        self.active_uploads = {}
        self.lock = threading.Lock()

        # Shared clipboard / text notes
        self.clipboard_messages = []

    def sanitize_filename(self, filename: str) -> str:
        """Sanitizes filename and prevents directory traversal."""
        clean = os.path.basename(filename).strip()
        # Remove null bytes and dangerous shell chars if any
        clean = clean.replace('\x00', '').replace('/', '_').replace('\\', '_')
        if not clean or clean.startswith('.'):
            clean = f"file_{int(time.time())}"
        return clean

    def get_unique_filename(self, filename: str) -> str:
        """Finds a non-colliding filename if a file with same name exists."""
        clean_name = self.sanitize_filename(filename)
        base, ext = os.path.splitext(clean_name)
        target_path = os.path.join(self.root_dir, clean_name)
        
        counter = 1
        while os.path.exists(target_path):
            new_name = f"{base} ({counter}){ext}"
            target_path = os.path.join(self.root_dir, new_name)
            counter += 1
        return os.path.basename(target_path)

    def init_chunked_upload(self, filename: str, total_size: int, total_chunks: int, chunk_size: int):
        """Initializes a new chunked upload session."""
        upload_id = str(uuid.uuid4())
        final_filename = self.get_unique_filename(filename)
        temp_filepath = os.path.join(self.temp_dir, f"{upload_id}.part")

        # Pre-allocate or open empty file
        with open(temp_filepath, "wb") as f:
            pass

        with self.lock:
            self.active_uploads[upload_id] = {
                "upload_id": upload_id,
                "filename": final_filename,
                "total_size": int(total_size),
                "total_chunks": int(total_chunks),
                "chunk_size": int(chunk_size),
                "temp_filepath": temp_filepath,
                "chunks_received": set(),
                "created_at": time.time(),
                "last_active": time.time()
            }

        return {
            "upload_id": upload_id,
            "filename": final_filename,
            "total_chunks": total_chunks
        }

    def write_chunk(self, upload_id: str, chunk_index: int, chunk_data: bytes):
        """
        Writes a chunk directly to the specified byte offset on disk.
        Does not load the file into memory, allowing unlimited file sizes.
        """
        with self.lock:
            if upload_id not in self.active_uploads:
                raise ValueError("Session upload tidak ditemukan atau telah kedaluwarsa.")
            session = self.active_uploads[upload_id]

        chunk_size = session["chunk_size"]
        offset = chunk_index * chunk_size
        temp_filepath = session["temp_filepath"]

        # Seek and write chunk directly
        with open(temp_filepath, "r+b") as f:
            f.seek(offset)
            f.write(chunk_data)

        with self.lock:
            session["chunks_received"].add(chunk_index)
            session["last_active"] = time.time()
            received_count = len(session["chunks_received"])
            total_chunks = session["total_chunks"]

        return {
            "upload_id": upload_id,
            "chunk_index": chunk_index,
            "received": received_count,
            "total": total_chunks,
            "percent": round((received_count / total_chunks) * 100, 1)
        }

    def complete_chunked_upload(self, upload_id: str):
        """Finalizes the upload and moves file to downloads folder."""
        with self.lock:
            if upload_id not in self.active_uploads:
                raise ValueError("Upload session not found")
            session = self.active_uploads.pop(upload_id)

        temp_filepath = session["temp_filepath"]
        final_filepath = os.path.join(self.root_dir, session["filename"])

        if os.path.exists(temp_filepath):
            # Atomic move / rename to destination
            shutil.move(temp_filepath, final_filepath)

        file_stat = os.stat(final_filepath)
        return {
            "filename": session["filename"],
            "size": file_stat.st_size,
            "path": final_filepath,
            "success": True
        }

    def cancel_chunked_upload(self, upload_id: str):
        """Cancels and purges temporary files."""
        with self.lock:
            session = self.active_uploads.pop(upload_id, None)

        if session and os.path.exists(session["temp_filepath"]):
            try:
                os.remove(session["temp_filepath"])
            except OSError:
                pass
        return {"status": "cancelled"}

    def get_upload_status(self, upload_id: str):
        """Returns the list of received chunks for upload resumption."""
        with self.lock:
            if upload_id not in self.active_uploads:
                return None
            session = self.active_uploads[upload_id]
            return {
                "upload_id": upload_id,
                "filename": session["filename"],
                "total_chunks": session["total_chunks"],
                "received_chunks": list(session["chunks_received"]),
                "percent": round((len(session["chunks_received"]) / session["total_chunks"]) * 100, 1)
            }

    def list_files(self):
        """Lists all files in downloads directory with detailed metadata."""
        files = []
        try:
            entries = os.scandir(self.root_dir)
        except OSError:
            return []

        for entry in entries:
            # Skip hidden files and temp directory
            if entry.name.startswith('.'):
                continue
            if not entry.is_file():
                continue

            try:
                stat = entry.stat()
                mime, _ = mimetypes.guess_type(entry.name)
                category = self._categorize_mime(mime, entry.name)

                files.append({
                    "name": entry.name,
                    "size": stat.st_size,
                    "size_formatted": self.format_size(stat.st_size),
                    "modified": int(stat.st_mtime * 1000),
                    "category": category,
                    "mime": mime or "application/octet-stream"
                })
            except OSError:
                continue

        # Sort by latest modified date first
        files.sort(key=lambda x: x["modified"], reverse=True)
        return files

    def delete_file(self, filename: str) -> bool:
        """Safely removes a file."""
        safe_name = os.path.basename(filename)
        target = os.path.join(self.root_dir, safe_name)
        if os.path.exists(target) and os.path.isfile(target):
            os.remove(target)
            return True
        return False

    def get_file_path(self, filename: str):
        """Resolves verified safe path for downloading."""
        safe_name = os.path.basename(filename)
        target = os.path.join(self.root_dir, safe_name)
        if os.path.exists(target) and os.path.isfile(target):
            return target
        return None

    def get_storage_stats(self):
        """Returns disk space usage."""
        try:
            total, used, free = shutil.disk_usage(self.root_dir)
            percent_used = round((used / total) * 100, 1) if total > 0 else 0
            return {
                "total": total,
                "used": used,
                "free": free,
                "total_formatted": self.format_size(total),
                "used_formatted": self.format_size(used),
                "free_formatted": self.format_size(free),
                "percent_used": percent_used,
                "folder": self.root_dir
            }
        except Exception:
            return {
                "total": 0, "used": 0, "free": 0,
                "total_formatted": "N/A", "used_formatted": "N/A",
                "free_formatted": "N/A", "percent_used": 0,
                "folder": self.root_dir
            }

    # Clipboard feature
    def add_clipboard_message(self, text: str, sender: str = "Anonymous"):
        with self.lock:
            msg = {
                "id": str(uuid.uuid4())[:8],
                "text": text,
                "sender": sender,
                "timestamp": int(time.time() * 1000)
            }
            self.clipboard_messages.insert(0, msg)
            # Keep max 50 recent messages
            if len(self.clipboard_messages) > 50:
                self.clipboard_messages.pop()
            return msg

    def get_clipboard_messages(self):
        with self.lock:
            return list(self.clipboard_messages)

    def clear_clipboard(self):
        with self.lock:
            self.clipboard_messages.clear()

    @staticmethod
    def _categorize_mime(mime, filename):
        ext = os.path.splitext(filename)[1].lower()
        if mime:
            if mime.startswith('image/'):
                return 'image'
            if mime.startswith('video/'):
                return 'video'
            if mime.startswith('audio/'):
                return 'audio'
            if mime.startswith('text/') or mime in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'):
                return 'document'
        if ext in ('.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso', '.apk'):
            return 'archive'
        if ext in ('.py', '.js', '.html', '.css', '.json', '.c', '.cpp', '.java', '.sh', '.rs', '.go'):
            return 'code'
        if ext in ('.pdf', '.doc', '.docx', '.txt', '.md', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'):
            return 'document'
        return 'other'

    @staticmethod
    def format_size(bytes_size: int) -> str:
        if bytes_size < 1024:
            return f"{bytes_size} B"
        elif bytes_size < 1024 ** 2:
            return f"{bytes_size / 1024:.2f} KB"
        elif bytes_size < 1024 ** 3:
            return f"{bytes_size / (1024 ** 2):.2f} MB"
        elif bytes_size < 1024 ** 4:
            return f"{bytes_size / (1024 ** 3):.2f} GB"
        else:
            return f"{bytes_size / (1024 ** 4):.2f} TB"
