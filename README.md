# ⚡ Al-share: Professional WLAN Unlimited Size File Sharing

**Al-share** adalah aplikasi berbagi data dan berkas berkecepatan tinggi melalui jaringan WiFi / WLAN lokal dengan kapasitas **tanpa batas ukuran (Unlimited File Size)** dan antarmuka web modern kelas profesional.

Dibuat menggunakan **Python 3 Standard Library** murni (zero external pip dependencies) dan teknologi **Chunked Disk Streaming**, Al-share mampu mentransfer file berukuran raksasa (10 GB, 50 GB, 100 GB+) dengan penggunaan RAM yang sangat rendah dan stabil.

---

## 🌟 Fitur Utama

### 1. 🚀 Transfer Tanpa Batas Ukuran (Unlimited Size)
- **Chunked Direct-to-Disk Streaming**: Berkas dipecah menjadi potongan (*chunks*) 4 MB secara transparan di sisi peramban (*browser*) dan langsung dialirkan ke disk penyimpanan. RAM perangkat tetap stabil dan hemat (hanya ~8 MB) meskipun mentransfer file ISO atau video 100 GB.
- **Dukungan HTTP Range Request (RFC 7233)**: 
  - Pratinjau video 4K/1080p langsung dari browser tanpa perlu mengunduh file utuh terlebih dahulu (*instant video seeking*).
  - Melanjutkan unduhan yang terputus (*resume download*).
  - Kompatibel penuh dengan download accelerator (IDM, aria2, curl, browser download manager).

### 2. 💎 Tampilan Profesional (Modern Glassmorphism UI)
- **Desain Kelas Industri**: Tema gelap bernuansa Tokyo Night / Midnight Slate dengan aksen neon cyan dan indigo.
- **Toggle Tema Gelap / Terang**: Dukungan mode terang (*Catppuccin Latte*) dan mode gelap dengan 1 klik.
- **Speedometer & Estimasi Waktu (ETA)**: Menampilkan kecepatan transfer *real-time* (MB/s atau KB/s) dan sisa waktu transfer.
- **Drag & Drop Dropzone**: Mendukung tarik-lepas banyak berkas sekaligus dan unggah seluruh folder.
- **File Manager Interaktif**:
  - Tampilan Kotak (*Grid*) dan Tampilan Baris (*List*).
  - Filter kategori instan: Video, Gambar, Musik, Dokumen, Arsip, dan Kode.
  - Pencarian berkas *real-time*.
  - Modal Pratinjau Media (Pemutar Video, Audio Player, Image Viewer, Text Viewer).
- **Indikator Penyimpanan**: Memantau sisa ruang disk penyimpanan internal secara langsung.

### 3. 📋 Papan Teks Bersama (Shared Clipboard)
- Berbagi catatan singkat, tautan URL, password WiFi, atau kode sumber antar perangkat secara instan tanpa perlu aplikasi perpesanan pihak ketiga.
- 1-klik tombol salin ke clipboard dengan notifikasi toast.

### 4. 📱 Sambungan Cepat dengan Kode QR
- **QR Code di Terminal**: Terminal Termux otomatis menampilkan kode QR berbasis karakter blok ANSI murni.
- **QR Code di Web**: Tampilan kode QR SVG beresolusi tinggi di layar untuk dipindai oleh ponsel atau tablet lain di jaringan yang sama.

### 5. 🛡️ Mandiri Tanpa Ketergantungan Tambahan (Zero Dependencies)
- Tidak memerlukan `pip install`.
- Mesin QR Code, HTTP server, dan pengatur berkas dirancang mandiri menggunakan pustaka standar Python 3.

---

## 🚀 Cara Menjalankan

### Cara 1: Menggunakan Perintah Langsung (Paling Praktis)
Cukup ketik perintah berikut dari mana saja di terminal Termux Anda:
```bash
alshare
```

### Cara 2: Menjalankan via Script Python
```bash
python3 ~/al-share/alshare.py
```

---

## ⚙️ Opsi & Pengaturan Tambahan

Anda dapat menambahkan parameter saat menjalankan Al-share:

| Opsi | Penjelasan | Contoh Penggunaan |
| :--- | :--- | :--- |
| `-p`, `--port` | Menentukan port TCP (default: `8080`) | `alshare -p 9000` |
| `-d`, `--dir` | Menentukan lokasi folder penyimpanan (default: `~/alshare_downloads`) | `alshare -d /sdcard/Download` |
| `-b`, `--bind` | Menentukan IP bind server (default: `0.0.0.0`) | `alshare -b 192.168.1.15` |
| `--no-qr` | Menyembunyikan kode QR di terminal | `alshare --no-qr` |

---

## 📂 Struktur Direktori Proyek

```
al-share/
├── alshare.py          # Script utama dan peluncur server
├── run.sh              # Skrip eksekusi cepat
├── README.md           # Dokumentasi lengkap
├── core/
│   ├── __init__.py
│   ├── network.py      # Pendeteksi antarmuka WiFi & alamat IP lokal
│   ├── qrcode.py       # Mesin generator QR Code murni Python (Terminal & SVG)
│   ├── server.py       # Multi-threaded HTTP server dengan Range & Chunked streaming
│   └── storage.py      # Pengelola berkas, chunk assembler, dan clipboard
└── web/
    ├── index.html      # Tampilan antarmuka pengguna (SPA)
    ├── style.css       # Desain CSS Glassmorphism responsif
    └── app.js          # Mesin pengunggah potongan file (Chunked Uploader)
```

---

## 💡 Panduan Penggunaan Antar-Perangkat
1. Pastikan kedua perangkat (misalnya HP dan Laptop) terhubung ke **jaringan WiFi yang sama** (atau HP sebagai Hotspot WiFi).
2. Jalankan perintah `alshare` di Termux.
3. Di perangkat lain, buka kamera lalu **pindai kode QR** yang muncul di terminal Termux, atau buka browser dan ketik alamat IP yang tertera (contoh: `http://192.168.1.5:8080`).
4. Anda siap mengunggah dan mengunduh data tanpa batas ukuran!
