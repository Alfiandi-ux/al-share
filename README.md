# ⚡ Al-share: Professional WLAN Unlimited Size File Sharing

[![Download Android APK](https://img.shields.io/badge/Download%20APK-Al--share%20v1.2.0-FFE600?style=for-the-badge&logo=android&logoColor=black)](https://github.com/Alfiandi-ux/al-share/releases/latest/download/Al-share.apk)
[![GitHub Release](https://img.shields.io/github/v/release/Alfiandi-ux/al-share?style=for-the-badge&color=00F0FF&label=Release)](https://github.com/Alfiandi-ux/al-share/releases)

**Al-share** adalah aplikasi berbagi data dan berkas berkecepatan tinggi melalui jaringan WiFi / WLAN lokal dengan kapasitas **tanpa batas ukuran (Unlimited File Size)** dan antarmuka web modern kelas profesional.

Kini tersedia dalam bentuk **Aplikasi Android Native (.apk)** mandiri dan **Python Server**!

---

## 📲 Unduh Aplikasi Android (.apk) Langsung ke HP

Untuk memasang Al-share di HP lain tanpa memerlukan Termux atau Python:

1. Buka tautan rilis langsung dari browser HP Anda:
   👉 **[Unduh Al-share.apk](https://github.com/Alfiandi-ux/al-share/releases/latest/download/Al-share.apk)**
   *(Atau kunjungi halaman [GitHub Releases](https://github.com/Alfiandi-ux/al-share/releases))*
2. Setelah file `.apk` selesai diunduh, ketuk untuk memasang (*Install*). Izinkan instalasi dari sumber tidak dikenal jika diminta oleh Android.
3. Buka aplikasi **Al-share**. Server akan langsung berjalan secara otomatis di latar belakang dan berkas yang diterima akan otomatis tersimpan di folder `Downloads/alshare` ponsel Anda!

---

## 🌟 Fitur Utama

### 1. 🚀 Transfer Tanpa Batas Ukuran (Unlimited Size)
- **Chunked Direct-to-Disk Streaming**: Berkas dipecah menjadi potongan (*chunks*) 4 MB secara transparan di sisi peramban (*browser*) dan langsung dialirkan ke disk penyimpanan. RAM perangkat tetap stabil dan hemat (hanya ~8 MB) meskipun mentransfer file ISO atau video 100 GB.
- **Dukungan HTTP Range Request (RFC 7233)**: 
  - Pratinjau video 4K/1080p langsung dari browser tanpa perlu mengunduh file utuh terlebih dahulu (*instant video seeking*).
  - Melanjutkan unduhan yang terputus (*resume download*).
  - Kompatibel penuh dengan download accelerator (IDM, aria2, curl, browser download manager).

### 2. 💎 Tampilan Neo-Brutalism (Bold & Fungsional)
- **Desain Kelas Industri**: Border tinta tebal, hard shadow tanpa blur, warna flat menyala, dan tipografi tebal ala neo-brutalism.
- **Toggle Tema Gelap / Terang**: Mode gelap *Ink Black* dan mode terang *Paper Cream* dengan 1 klik.
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

### 6. 📲 Mode Aplikasi Native (PWA)
- **Installable**: Web App Manifest + ikon PNG/SVG + splash screen membuat Al-share bisa dipasang ke layar utama.
- **Layar penuh tanpa address bar**: saat dipasang, aplikasi terbuka dalam mode `standalone` seperti aplikasi Android/iOS.
- **Bottom tab bar & bottom sheet**: navigasi di bawah (Kirim · File · Teks · WiFi) dan modal bergaya *sheet* saat di layar kecil.
- **App bar sticky + safe area**: ramah notch dan status bar, baik Android maupun iOS.
- **Getaran haptic**: umpan balik halus saat berpindah tab, menyalin, dan transfer selesai.
- **Pull-to-refresh**: tarik ke bawah untuk menyegarkan daftar file dan clipboard.
- **Pintasan aplikasi**: tekan lama ikon Al-share untuk langsung membuka Kirim, File, Teks, atau WiFi.
- **App shell offline**: kerangka antarmuka tersimpan di perangkat; saat server tidak terjangkau, muncul halaman *offline* bergaya Al-share.
- **Deteksi status**: kartu “Mode Aplikasi Native” di tab WiFi menampilkan status instalasi, mode tampilan, layanan offline, dan koneksi.

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

## 📲 Memasang sebagai Aplikasi (Mode Native)

1. Jalankan `alshare`, lalu buka alamat `http://<ip>:8080` di Chrome/Edge/Safari.
2. Ketuk tombol **Pasang** di header, atau buka menu browser lalu pilih **“Tambahkan ke layar utama”** / **“Instal aplikasi”**.
3. Al-share akan muncul dengan ikon sendiri dan terbuka layar penuh tanpa address bar.
4. Tekan lama ikonnya untuk memakai pintasan **Kirim**, **File**, **Teks**, dan **WiFi**.

> **Catatan HTTPS:** service worker (cache offline + prompt instal otomatis) hanya aktif pada *secure context*, yaitu **HTTPS** atau **http://localhost**. Saat diakses lewat `http://192.168.x.x`, seluruh tampilan native tetap berjalan, tetapi tombol pasang otomatis dan cache offline tidak tersedia. Untuk pengalaman penuh di perangkat lain, akses melalui reverse proxy HTTPS (mis. Caddy/Cloudflare Tunnel) atau buka di perangkat yang sama lewat `localhost`.

Ingin mengganti ikon aplikasi? Sunting `tools/make_icons.py`, lalu jalankan:
```bash
python3 tools/make_icons.py
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
├── tools/
│   └── make_icons.py   # Generator ikon PWA murni Python (PNG + SVG)
└── web/
    ├── index.html      # Tampilan antarmuka pengguna (app shell)
    ├── style.css       # Desain CSS Neo-Brutalism + native app shell responsif
    ├── app.js          # Mesin upload chunk, tab, haptics, PWA, pull-to-refresh
    ├── manifest.webmanifest  # Manifest PWA (nama, ikon, pintasan, standalone)
    ├── sw.js           # Service worker (app shell offline & cache runtime)
    ├── offline.html    # Halaman fallback saat server tidak terjangkau
    └── icons/          # Ikon aplikasi 192/512, maskable, apple-touch, favicon
```

---

## 💡 Panduan Penggunaan Antar-Perangkat
1. Pastikan kedua perangkat (misalnya HP dan Laptop) terhubung ke **jaringan WiFi yang sama** (atau HP sebagai Hotspot WiFi).
2. Jalankan perintah `alshare` di Termux.
3. Di perangkat lain, buka kamera lalu **pindai kode QR** yang muncul di terminal Termux, atau buka browser dan ketik alamat IP yang tertera (contoh: `http://192.168.1.5:8080`).
4. Anda siap mengunggah dan mengunduh data tanpa batas ukuran!
