#!/usr/bin/env python3
"""
   █████╗ ██╗      ███████╗██╗  ██╗ █████╗ ██████╗ ███████╗
  ██╔══██╗██║      ██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝
  ███████║██║█████╗███████╗███████║███████║██████╔╝█████╗  
  ██╔══██║██║╚════╝╚════██║██╔══██║██╔══██║██╔══██╗██╔══╝  
  ██║  ██║███████╗ ███████║██║  ██║██║  ██║██║  ██║███████╗
  ╚═╝  ╚═╝╚══════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

  Al-share: Professional WLAN Unlimited Size File Sharing
  Ultra-fast, zero-dependencies, direct disk streaming.
"""

import sys
import os
import argparse
import signal

# Add current directory to path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.network import get_local_ip_addresses, find_available_port
from core.qrcode import generate_terminal_qr
from core.storage import StorageManager
from core.server import ThreadedHTTPServer, AlShareHandler

# ANSI Color Codes
CYAN = "\033[1;36m"
BLUE = "\033[1;34m"
GREEN = "\033[1;32m"
YELLOW = "\033[1;33m"
PURPLE = "\033[1;35m"
BOLD = "\033[1m"
RESET = "\033[0m"
DIM = "\033[2m"

BANNER = f"""{CYAN}
   █████╗ ██╗      ███████╗██╗  ██╗ █████╗ ██████╗ ███████╗
  ██╔══██╗██║      ██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝
  ███████║██║█████╗███████╗███████║███████║██████╔╝█████╗  
  ██╔══██║██║╚════╝╚════██║██╔══██║██╔══██║██╔══██╗██╔══╝  
  ██║  ██║███████╗ ███████║██║  ██║██║  ██║██║  ██║███████╗
  ╚═╝  ╚═╝╚══════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝{RESET}
  {BOLD}⚡ WLAN Unlimited Data Sharing • Versi 1.0.0{RESET}
"""

def main():
    parser = argparse.ArgumentParser(
        description="Al-share: Berbagi data WLAN tanpa batas ukuran dengan UI profesional."
    )
    parser.add_argument(
        "-p", "--port",
        type=int,
        default=8080,
        help="Port TCP untuk server (default: 8080)"
    )
    parser.add_argument(
        "-d", "--dir",
        type=str,
        default=os.path.expanduser("~/alshare_downloads"),
        help="Folder penyimpanan file masuk (default: ~/alshare_downloads)"
    )
    parser.add_argument(
        "-b", "--bind",
        type=str,
        default="0.0.0.0",
        help="Alamat IP bind server (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--no-qr",
        action="store_true",
        help="Jangan tampilkan QR Code di terminal"
    )
    args = parser.parse_args()

    # Create target download directory
    target_dir = os.path.abspath(args.dir)
    os.makedirs(target_dir, exist_ok=True)

    # Detect network addresses
    ip_list = get_local_ip_addresses()
    primary_ip = ip_list[0] if ip_list else "127.0.0.1"

    # Find port
    port = find_available_port(args.port)
    primary_url = f"http://{primary_ip}:{port}"

    # Print Banner & Status
    os.system('cls' if os.name == 'nt' else 'clear')
    print(BANNER)
    print(f" {GREEN}●{RESET} {BOLD}Status:{RESET} Server aktif & mendengarkan koneksi")
    print(f" {BLUE}📁{RESET} {BOLD}Folder Penyimpanan:{RESET} {YELLOW}{target_dir}{RESET}")
    print(f" {PURPLE}🌐{RESET} {BOLD}Alamat Akses di Jaringan WiFi:{RESET}")

    for idx, ip in enumerate(ip_list):
        tag = f" {GREEN}(Utama){RESET}" if idx == 0 else ""
        print(f"    👉 {CYAN}http://{ip}:{port}{RESET}{tag}")

    # Terminal QR Code
    if not args.no_qr and primary_ip != "127.0.0.1":
        print(f"\n {BOLD}📱 Pindai QR Code ini dengan kamera HP untuk terhubung:{RESET}\n")
        qr_terminal = generate_terminal_qr(primary_url)
        print(qr_terminal)

    print(f"\n {DIM}Tekan Ctrl+C untuk menghentikan server.{RESET}\n")
    print("-" * 65)

    # Initialize Server
    storage_mgr = StorageManager(root_dir=target_dir)
    web_dir = os.path.join(BASE_DIR, "web")

    server = ThreadedHTTPServer((args.bind, port), AlShareHandler)
    server.storage_manager = storage_mgr
    server.web_dir = web_dir

    def shutdown_handler(sig, frame):
        print(f"\n\n{YELLOW}🛑 Menghentikan Al-share... Terima kasih!{RESET}")
        server.shutdown()
        server.server_close()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        shutdown_handler(None, None)

if __name__ == "__main__":
    main()
