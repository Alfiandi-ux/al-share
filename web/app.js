/**
 * Al-share - Frontend Application Engine
 * High-performance unlimited file size chunked streaming,
 * WLAN data management, real-time speed/ETA metrics, and media previews.
 */

// Global App State
const state = {
    files: [],
    activeFilter: 'all',
    searchQuery: '',
    viewMode: localStorage.getItem('alshare_view_mode') || 'grid',
    theme: localStorage.getItem('alshare_theme')
        || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    info: null,
    uploadQueue: [],
    activeUploads: new Map(), // uploadId -> { file, status, xhr, ... }
    clipboard: []
};

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB slices

// DOM Element Selectors
const DOM = {
    // Nav & Theme
    themeToggle: document.getElementById('btnThemeToggle'),
    themeIconDark: document.getElementById('themeIconDark'),
    themeIconLight: document.getElementById('themeIconLight'),
    tabs: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    fileCountBadge: document.getElementById('fileCountBadge'),
    storageFreeText: document.getElementById('storageFreeText'),
    storageMiniFill: document.getElementById('storageMiniFill'),

    // Upload
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    folderInput: document.getElementById('folderInput'),
    uploadsPanel: document.getElementById('uploadsPanel'),
    uploadList: document.getElementById('uploadList'),
    uploadCount: document.getElementById('uploadCount'),
    btnClearCompleted: document.getElementById('btnClearCompleted'),

    // Files
    fileSearchInput: document.getElementById('fileSearchInput'),
    categoryFilters: document.getElementById('categoryFilters'),
    btnRefreshFiles: document.getElementById('btnRefreshFiles'),
    btnViewGrid: document.getElementById('btnViewGrid'),
    btnViewList: document.getElementById('btnViewList'),
    filesContainer: document.getElementById('filesContainer'),
    emptyState: document.getElementById('emptyState'),

    // Clipboard
    clipboardInput: document.getElementById('clipboardInput'),
    senderName: document.getElementById('senderName'),
    btnSendClipboard: document.getElementById('btnSendClipboard'),
    btnClearClipboard: document.getElementById('btnClearClipboard'),
    clipboardList: document.getElementById('clipboardList'),

    // Network & Modals
    networkIpList: document.getElementById('networkIpList'),
    networkQrContainer: document.getElementById('networkQrContainer'),
    serverFolderDisplay: document.getElementById('serverFolderDisplay'),
    btnOpenQr: document.getElementById('btnOpenQr'),
    qrModal: document.getElementById('qrModal'),
    qrModalBackdrop: document.getElementById('qrModalBackdrop'),
    btnCloseQrModal: document.getElementById('btnCloseQrModal'),
    modalQrBox: document.getElementById('modalQrBox'),
    modalLinks: document.getElementById('modalLinks'),

    // Preview Modal
    previewModal: document.getElementById('previewModal'),
    previewModalBackdrop: document.getElementById('previewModalBackdrop'),
    btnClosePreview: document.getElementById('btnClosePreview'),
    previewTitle: document.getElementById('previewTitle'),
    previewContent: document.getElementById('previewContent'),
    previewDownloadBtn: document.getElementById('previewDownloadBtn'),

    // Toasts
    toastContainer: document.getElementById('toastContainer'),

    // Native app shell (PWA)
    launchScreen: document.getElementById('launchScreen'),
    offlineBanner: document.getElementById('offlineBanner'),
    btnInstall: document.getElementById('btnInstall'),
    btnInstallCard: document.getElementById('btnInstallCard'),
    installSheet: document.getElementById('installSheet'),
    btnInstallSheet: document.getElementById('btnInstallSheet'),
    btnInstallDismiss: document.getElementById('btnInstallDismiss'),
    installStateText: document.getElementById('installStateText'),
    displayModeText: document.getElementById('displayModeText'),
    swStateText: document.getElementById('swStateText'),
    connStateText: document.getElementById('connStateText'),
    installHint: document.getElementById('installHint'),
    ptrIndicator: document.getElementById('ptrIndicator'),
    ptrLabel: document.getElementById('ptrLabel')
};

// Native shell state
const INSTALL_DISMISS_KEY = 'alshare_install_dismissed';
const ACTIVE_TAB_KEY = 'alshare_active_tab';
let deferredInstallPrompt = null;

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNativeShell();
    initTabs();
    initUploadEvents();
    initFileEvents();
    initClipboardEvents();
    initModals();
    initPullToRefresh();

    // Initial data fetch
    fetchServerInfo();
    fetchFiles();
    fetchClipboard();

    // Periodic lightweight background sync
    setInterval(fetchServerInfo, 10000);
    setInterval(fetchClipboard, 6000);
});

// ==========================================
// Theme Management
// ==========================================
function initTheme() {
    applyTheme(state.theme);

    DOM.themeToggle.addEventListener('click', () => {
        const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(next, true);
        haptic('light');
    });

    // Follow the OS theme until the user picks one explicitly.
    if (window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (e) => {
            if (!localStorage.getItem('alshare_theme')) applyTheme(e.matches ? 'dark' : 'light');
        };
        if (media.addEventListener) media.addEventListener('change', onChange);
    }
}

function applyTheme(theme, persist = false) {
    const dark = theme === 'dark';
    state.theme = dark ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', dark);
    document.body.classList.toggle('light-theme', !dark);
    DOM.themeIconDark.classList.toggle('hidden', !dark);
    DOM.themeIconLight.classList.toggle('hidden', dark);
    syncThemeColor();

    if (persist) localStorage.setItem('alshare_theme', state.theme);
}

function syncThemeColor() {
    const dark = document.body.classList.contains('dark-theme');
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
        meta.setAttribute('content', dark ? '#0b0b0b' : '#ffd93d');
    });
}

// ==========================================
// Tab Navigation
// ==========================================
function initTabs() {
    DOM.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            activateTab(btn.dataset.tab, { user: true });
        });
    });

    // Restore last tab, or jump straight to the tab requested by a PWA shortcut.
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    const initial = requested && document.getElementById(requested)
        ? requested
        : (saved && document.getElementById(saved) ? saved : 'tab-upload');

    activateTab(initial, { user: false });
}

function activateTab(tabId, options = {}) {
    const targetBtn = Array.from(DOM.tabs).find(btn => btn.dataset.tab === tabId);
    const targetContent = document.getElementById(tabId);
    if (!targetBtn || !targetContent) return;

    DOM.tabs.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    DOM.tabContents.forEach(content => content.classList.remove('active'));

    targetBtn.classList.add('active');
    targetBtn.setAttribute('aria-selected', 'true');
    targetContent.classList.add('active');

    if (options.user) {
        haptic('light');
        if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
        // Keep the URL shareable / shortcut friendly without reloading.
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tabId);
            history.replaceState(null, '', url);
        } catch (e) {}
    }

    try { localStorage.setItem(ACTIVE_TAB_KEY, tabId); } catch (e) {}

    if (tabId === 'tab-files') fetchFiles();
    if (tabId === 'tab-clipboard') fetchClipboard();
}

// ==========================================
// Native App Shell (PWA)
// ==========================================
function initNativeShell() {
    // 1. Native-style launch screen
    const hideLaunch = () => {
        const screen = DOM.launchScreen;
        if (!screen || screen.classList.contains('done')) return;
        screen.classList.add('done');
        setTimeout(() => screen.remove(), 450);
    };
    if (document.readyState === 'complete') {
        setTimeout(hideLaunch, 280);
    } else {
        window.addEventListener('load', () => setTimeout(hideLaunch, 280), { once: true });
    }
    setTimeout(hideLaunch, 2400); // Safety net if a resource hangs

    // 2. Standalone (installed app) detection
    document.body.classList.toggle('native-standalone', isStandalone());
    if (window.matchMedia) {
        const displayMode = window.matchMedia('(display-mode: standalone)');
        const syncMode = () => {
            document.body.classList.toggle('native-standalone', isStandalone());
            refreshNativeStatus();
        };
        if (displayMode.addEventListener) displayMode.addEventListener('change', syncMode);
    }

    // 3. Connectivity awareness
    const syncConnection = (announce) => {
        const offline = !navigator.onLine;
        document.body.classList.toggle('is-offline', offline);
        if (DOM.connStateText) DOM.connStateText.textContent = offline ? 'Offline' : 'Online';
        if (announce) {
            showToast(
                offline ? 'Koneksi terputus — menampilkan data terakhir' : 'Kembali online',
                offline ? 'danger' : 'success'
            );
        }
    };
    window.addEventListener('online', () => syncConnection(true));
    window.addEventListener('offline', () => syncConnection(true));
    syncConnection(false);

    // 4. Install flow
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        refreshNativeStatus();
        maybeOfferInstall();
    });
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        hideInstallSheet();
        refreshNativeStatus();
        haptic('success');
        showToast('Al-share berhasil dipasang sebagai aplikasi!', 'success');
    });

    if (DOM.btnInstall) DOM.btnInstall.addEventListener('click', promptInstall);
    if (DOM.btnInstallCard) DOM.btnInstallCard.addEventListener('click', promptInstall);
    if (DOM.btnInstallSheet) DOM.btnInstallSheet.addEventListener('click', promptInstall);
    if (DOM.btnInstallDismiss) {
        DOM.btnInstallDismiss.addEventListener('click', () => {
            hideInstallSheet();
            try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch (e) {}
        });
    }

    // 5. Desktop/installation metadata
    registerServiceWorker();
    refreshNativeStatus();

    // 6. Guard against accidentally closing the app mid-transfer
    window.addEventListener('beforeunload', (event) => {
        if (state.uploadQueue.some(task => task.status === 'uploading')) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

function isStandalone() {
    if (window.navigator.standalone === true) return true;
    if (!window.matchMedia) return false;
    return ['standalone', 'fullscreen', 'minimal-ui'].some(mode =>
        window.matchMedia(`(display-mode: ${mode})`).matches
    );
}

function refreshNativeStatus() {
    const standalone = isStandalone();
    const canInstall = Boolean(deferredInstallPrompt);
    const secure = window.isSecureContext;

    if (DOM.installStateText) {
        DOM.installStateText.textContent = standalone
            ? 'Terpasang'
            : (canInstall ? 'Siap dipasang' : 'Belum terpasang');
    }
    if (DOM.displayModeText) {
        DOM.displayModeText.textContent = standalone ? 'Standalone (native)' : 'Browser';
    }
    if (DOM.connStateText) {
        DOM.connStateText.textContent = navigator.onLine ? 'Online' : 'Offline';
    }

    if (DOM.btnInstall) {
        DOM.btnInstall.classList.toggle('hidden', !canInstall || standalone);
    }
    if (DOM.btnInstallCard) {
        DOM.btnInstallCard.classList.toggle('hidden', standalone);
        DOM.btnInstallCard.disabled = !canInstall;
    }

    if (DOM.installHint) {
        if (standalone) {
            DOM.installHint.textContent = 'Aplikasi berjalan dalam mode layar penuh dengan ikon sendiri.';
        } else if (canInstall) {
            DOM.installHint.textContent = 'Ketuk “Pasang Aplikasi” untuk menambahkan Al-share ke layar utama.';
        } else if (!secure) {
            DOM.installHint.textContent = 'Pemasangan penuh butuh HTTPS atau localhost. Untuk sekarang gunakan menu browser → “Tambahkan ke layar utama”.';
        } else {
            DOM.installHint.textContent = 'Buka menu browser → “Tambahkan ke layar utama” untuk memasang Al-share.';
        }
    }
}

function maybeOfferInstall() {
    if (!deferredInstallPrompt || isStandalone()) return;

    let offered = false;
    let dismissedAt = 0;
    try {
        offered = sessionStorage.getItem('alshare_install_offered') === '1';
        dismissedAt = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
    } catch (e) {}
    if (offered) return;
    if (dismissedAt && Date.now() - dismissedAt < 14 * 24 * 60 * 60 * 1000) return;

    try { sessionStorage.setItem('alshare_install_offered', '1'); } catch (e) {}
    setTimeout(showInstallSheet, 3200);
}

function showInstallSheet() {
    if (!DOM.installSheet || isStandalone() || !deferredInstallPrompt) return;
    DOM.installSheet.classList.add('show');
}

function hideInstallSheet() {
    if (DOM.installSheet) DOM.installSheet.classList.remove('show');
}

async function promptInstall() {
    if (!deferredInstallPrompt) {
        showToast('Gunakan menu browser → “Tambahkan ke layar utama”', 'info', 4500);
        return;
    }
    haptic('medium');
    deferredInstallPrompt.prompt();
    try {
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
            showToast('Memasang Al-share…', 'success');
        }
    } catch (e) {}
    deferredInstallPrompt = null;
    hideInstallSheet();
    refreshNativeStatus();
}

function registerServiceWorker() {
    if (!DOM.swStateText) return;
    if (!('serviceWorker' in navigator)) {
        DOM.swStateText.textContent = 'Tidak didukung';
        return;
    }
    if (!window.isSecureContext) {
        DOM.swStateText.textContent = 'Butuh HTTPS';
        return;
    }

    navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
            DOM.swStateText.textContent = 'Aktif';

            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        showToast('Versi baru Al-share tersedia — buka ulang untuk memperbarui.', 'info', 6000);
                    }
                });
            });
        })
        .catch(() => {
            DOM.swStateText.textContent = 'Gagal';
        });
}

// ==========================================
// Pull to Refresh (mobile)
// ==========================================
function initPullToRefresh() {
    const indicator = DOM.ptrIndicator;
    if (!indicator || !('ontouchstart' in window)) return;

    const THRESHOLD = 72;
    const MAX_PULL = 118;
    let startY = null;
    let distance = 0;
    let armed = false;

    window.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1 || window.scrollY > 0) return;
        if (event.target.closest('input, textarea, .modal.active, .install-sheet, .nav-tabs')) return;
        startY = event.touches[0].clientY;
        distance = 0;
        armed = true;
    }, { passive: true });

    window.addEventListener('touchmove', (event) => {
        if (!armed || startY === null) return;
        const delta = event.touches[0].clientY - startY;
        if (delta <= 0) {
            indicator.classList.remove('visible');
            return;
        }
        distance = Math.min(delta * 0.5, MAX_PULL);
        indicator.classList.add('visible');
        indicator.classList.toggle('refreshing', distance >= THRESHOLD);
        DOM.ptrLabel.textContent = distance >= THRESHOLD
            ? 'Lepas untuk menyegarkan'
            : 'Tarik untuk menyegarkan';
    }, { passive: true });

    window.addEventListener('touchend', () => {
        if (!armed) return;
        armed = false;
        startY = null;

        if (distance >= THRESHOLD) {
            indicator.classList.add('refreshing');
            DOM.ptrLabel.textContent = 'Menyegarkan…';
            haptic('medium');
            Promise.allSettled([fetchServerInfo(), fetchFiles(), fetchClipboard()]).then(() => {
                setTimeout(() => {
                    indicator.classList.remove('visible', 'refreshing');
                    showToast('Data disegarkan', 'success');
                }, 450);
            });
        } else {
            indicator.classList.remove('visible', 'refreshing');
        }
        distance = 0;
    });
}

// ==========================================
// Haptics
// ==========================================
function haptic(type = 'light') {
    if (!navigator.vibrate) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const patterns = {
        light: 8,
        medium: 18,
        success: [12, 40, 18],
        error: [26, 50, 26]
    };
    try { navigator.vibrate(patterns[type] ?? 8); } catch (e) {}
}

// ==========================================
// Server Info & Storage
// ==========================================
async function fetchServerInfo() {
    try {
        const res = await fetch('/api/info');
        if (!res.ok) return;
        const data = await res.json();
        state.info = data;

        // Update Storage Display
        if (data.storage) {
            DOM.storageFreeText.textContent = `${data.storage.free_formatted} Bebas`;
            DOM.storageMiniFill.style.width = `${data.storage.percent_used}%`;
            DOM.serverFolderDisplay.textContent = data.storage.folder;
        }

        // Update Network IP addresses
        if (data.ips && data.ips.length > 0) {
            renderNetworkInfo(data.ips, data.port);
        }
    } catch (e) {
        console.warn('Network info unavailable:', e);
    }
}

function renderNetworkInfo(ips, port) {
    const listHtml = ips.map(ip => {
        const url = `http://${ip}:${port}`;
        return `
            <div class="ip-badge">
                <a href="${url}" target="_blank">${url}</a>
                <button class="btn btn-sm btn-ghost" onclick="copyToClipboard('${url}')" title="Salin Tautan">
                    📋 Salin
                </button>
            </div>
        `;
    }).join('');

    DOM.networkIpList.innerHTML = listHtml;
    DOM.modalLinks.innerHTML = listHtml;

    // Load QR Code SVG
    const primaryUrl = `http://${ips[0]}:${port}`;
    fetch('/api/qr')
        .then(res => res.text())
        .then(svg => {
            DOM.networkQrContainer.innerHTML = svg;
            DOM.modalQrBox.innerHTML = svg;
        })
        .catch(() => {});
}

// ==========================================
// Unlimited File Chunked Upload Engine
// ==========================================
function initUploadEvents() {
    const zone = DOM.dropZone;

    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('dragover');
        });
    });

    zone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) handleIncomingFiles(files);
    });

    DOM.fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) handleIncomingFiles(files);
        DOM.fileInput.value = '';
    });

    DOM.folderInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) handleIncomingFiles(files);
        DOM.folderInput.value = '';
    });

    DOM.btnClearCompleted.addEventListener('click', () => {
        const items = DOM.uploadList.querySelectorAll('.upload-card.completed');
        items.forEach(item => item.remove());
        updateUploadCountBadge();
        if (DOM.uploadList.children.length === 0) {
            DOM.uploadsPanel.style.display = 'none';
        }
    });
}

function handleIncomingFiles(files) {
    DOM.uploadsPanel.style.display = 'block';
    files.forEach(file => {
        const uploadTask = {
            id: 'up_' + Math.random().toString(36).substr(2, 9),
            file: file,
            size: file.size,
            name: file.name,
            totalChunks: Math.ceil(file.size / CHUNK_SIZE) || 1,
            uploadedBytes: 0,
            status: 'queued', // queued, uploading, paused, completed, error
            speed: 0,
            eta: 0,
            lastTime: Date.now(),
            lastBytes: 0,
            abortController: null
        };

        state.uploadQueue.push(uploadTask);
        renderUploadCard(uploadTask);
    });

    updateUploadCountBadge();
    processUploadQueue();
}

function updateUploadCountBadge() {
    const count = DOM.uploadList.children.length;
    DOM.uploadCount.textContent = `${count} file`;
}

function renderUploadCard(task) {
    const card = document.createElement('div');
    card.className = 'upload-card';
    card.id = `card_${task.id}`;

    card.innerHTML = `
        <div class="upload-card-top">
            <div class="file-info-group">
                <div class="file-type-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <div class="file-name-meta">
                    <div class="file-title" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</div>
                    <div class="file-meta-sub" id="meta_${task.id}">
                        ${formatBytes(0)} / ${formatBytes(task.size)} • Menunggu giliran...
                    </div>
                </div>
            </div>
            <div class="upload-metrics">
                <span class="upload-speed" id="speed_${task.id}">-</span>
                <span class="upload-eta" id="eta_${task.id}">-</span>
                <button class="btn btn-sm btn-ghost text-danger" id="btnCancel_${task.id}" title="Batalkan">✕</button>
            </div>
        </div>
        <div class="progress-track">
            <div class="progress-fill" id="fill_${task.id}" style="width: 0%;"></div>
        </div>
    `;

    DOM.uploadList.prepend(card);

    document.getElementById(`btnCancel_${task.id}`).addEventListener('click', () => {
        cancelUploadTask(task);
    });
}

async function processUploadQueue() {
    const nextTask = state.uploadQueue.find(t => t.status === 'queued');
    if (!nextTask) return;

    nextTask.status = 'uploading';
    await startChunkedUpload(nextTask);
    processUploadQueue();
}

async function startChunkedUpload(task) {
    const metaEl = document.getElementById(`meta_${task.id}`);
    const speedEl = document.getElementById(`speed_${task.id}`);
    const etaEl = document.getElementById(`eta_${task.id}`);
    const fillEl = document.getElementById(`fill_${task.id}`);
    const cardEl = document.getElementById(`card_${task.id}`);

    task.abortController = new AbortController();

    try {
        // Step 1: Initialize upload handshake with server
        const initRes = await fetch('/api/upload/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: task.name,
                totalSize: task.size,
                totalChunks: task.totalChunks,
                chunkSize: CHUNK_SIZE
            }),
            signal: task.abortController.signal
        });

        if (!initRes.ok) throw new Error('Gagal memulai sesi upload');
        const initData = await initRes.json();
        const serverUploadId = initData.upload_id;

        // Step 2: Stream slice by slice directly to disk
        let uploadedBytes = 0;
        let lastSpeedCheck = Date.now();
        let bytesSinceLastCheck = 0;

        for (let chunkIdx = 0; chunkIdx < task.totalChunks; chunkIdx++) {
            if (task.status === 'cancelled') break;

            const start = chunkIdx * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, task.size);
            const chunkBlob = task.file.slice(start, end);

            const uploadUrl = `/api/upload/chunk?upload_id=${serverUploadId}&chunk_index=${chunkIdx}`;
            
            const chunkRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: chunkBlob,
                signal: task.abortController.signal
            });

            if (!chunkRes.ok) throw new Error(`Chunk ${chunkIdx} gagal terunggah.`);

            const chunkSizeActual = end - start;
            uploadedBytes += chunkSizeActual;
            bytesSinceLastCheck += chunkSizeActual;

            // Speed & ETA moving calculation every 500ms
            const now = Date.now();
            const elapsed = (now - lastSpeedCheck) / 1000;
            if (elapsed >= 0.5) {
                const currentSpeed = bytesSinceLastCheck / elapsed; // bytes per sec
                const remainingBytes = task.size - uploadedBytes;
                const etaSeconds = currentSpeed > 0 ? Math.ceil(remainingBytes / currentSpeed) : 0;

                speedEl.textContent = `${formatBytes(currentSpeed)}/s`;
                etaEl.textContent = etaSeconds > 0 ? formatEta(etaSeconds) : 'Selesai...';

                lastSpeedCheck = now;
                bytesSinceLastCheck = 0;
            }

            const percent = task.size > 0 ? ((uploadedBytes / task.size) * 100).toFixed(1) : 100;
            fillEl.style.width = `${percent}%`;
            metaEl.textContent = `${formatBytes(uploadedBytes)} / ${formatBytes(task.size)} (${percent}%)`;
        }

        // Step 3: Complete upload
        const completeRes = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ upload_id: serverUploadId }),
            signal: task.abortController.signal
        });

        if (!completeRes.ok) throw new Error('Gagal menyelesaikan file di server.');

        task.status = 'completed';
        cardEl.classList.add('completed');
        fillEl.classList.add('done');
        fillEl.style.width = '100%';
        metaEl.textContent = `${formatBytes(task.size)} • Selesai Terunggah!`;
        speedEl.textContent = '✓ 100%';
        etaEl.textContent = '';

        showToast(`File "${task.name}" berhasil terunggah!`, 'success');
        fetchFiles();
        fetchServerInfo();

    } catch (err) {
        if (task.status !== 'cancelled') {
            task.status = 'error';
            cardEl.classList.add('failed');
            metaEl.textContent = `Gagal: ${err.message}`;
            speedEl.textContent = 'Error';
            showToast(`Upload gagal: ${task.name}`, 'danger');
        }
    }
}

function cancelUploadTask(task) {
    task.status = 'cancelled';
    if (task.abortController) {
        task.abortController.abort();
    }
    const card = document.getElementById(`card_${task.id}`);
    if (card) card.remove();
    updateUploadCountBadge();
    showToast(`Upload "${task.name}" dibatalkan.`, 'info');
}

// ==========================================
// File Manager & Explorer
// ==========================================
function initFileEvents() {
    DOM.btnRefreshFiles.addEventListener('click', () => {
        fetchFiles();
        showToast('Daftar file diperbarui', 'info');
    });

    DOM.fileSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        renderFilesList();
    });

    DOM.categoryFilters.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            DOM.categoryFilters.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeFilter = chip.dataset.cat;
            renderFilesList();
        });
    });

    DOM.btnViewGrid.addEventListener('click', () => {
        state.viewMode = 'grid';
        localStorage.setItem('alshare_view_mode', 'grid');
        DOM.btnViewGrid.classList.add('active');
        DOM.btnViewList.classList.remove('active');
        DOM.filesContainer.className = 'files-display grid-view';
        renderFilesList();
    });

    DOM.btnViewList.addEventListener('click', () => {
        state.viewMode = 'list';
        localStorage.setItem('alshare_view_mode', 'list');
        DOM.btnViewList.classList.add('active');
        DOM.btnViewGrid.classList.remove('active');
        DOM.filesContainer.className = 'files-display list-view';
        renderFilesList();
    });

    if (state.viewMode === 'list') {
        DOM.btnViewList.click();
    }
}

async function fetchFiles() {
    try {
        const res = await fetch('/api/files');
        if (!res.ok) return;
        const data = await res.json();
        state.files = data.files || [];
        DOM.fileCountBadge.textContent = state.files.length;
        renderFilesList();
    } catch (e) {
        console.error('Failed to load files:', e);
    }
}

function renderFilesList() {
    const container = DOM.filesContainer;
    container.innerHTML = '';

    const filtered = state.files.filter(f => {
        const matchesCat = state.activeFilter === 'all' || f.category === state.activeFilter;
        const matchesSearch = !state.searchQuery || f.name.toLowerCase().includes(state.searchQuery);
        return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
        DOM.emptyState.style.display = 'block';
        return;
    } else {
        DOM.emptyState.style.display = 'none';
    }

    if (state.viewMode === 'grid') {
        filtered.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-item-card';
            card.innerHTML = `
                <div class="file-card-header">
                    <div class="file-icon-box icon-${file.category}">
                        ${getFileIconSvg(file.category)}
                    </div>
                    <div class="file-card-details">
                        <span class="file-card-title" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                        <div class="file-card-meta">
                            <span>${file.size_formatted}</span> • <span>${formatDate(file.modified)}</span>
                        </div>
                    </div>
                </div>
                <div class="file-card-actions">
                    <button class="btn btn-secondary" onclick="openPreview('${encodeURIComponent(file.name)}', '${file.category}')" title="Pratinjau">
                        👁️ Pratinjau
                    </button>
                    <a href="/download/${encodeURIComponent(file.name)}" class="btn btn-primary" download title="Unduh File">
                        ⬇️ Unduh
                    </a>
                    <button class="btn btn-icon text-danger" onclick="confirmDeleteFile('${encodeURIComponent(file.name)}')" title="Hapus">
                        🗑️
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    } else {
        filtered.forEach(file => {
            const row = document.createElement('div');
            row.className = 'file-item-row';
            row.innerHTML = `
                <div class="row-left">
                    <div class="file-icon-box icon-${file.category}">
                        ${getFileIconSvg(file.category)}
                    </div>
                    <div class="file-card-details">
                        <span class="file-card-title" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                        <div class="file-card-meta">
                            <span>${file.size_formatted}</span> • <span>${formatDate(file.modified)}</span>
                        </div>
                    </div>
                </div>
                <div class="row-actions">
                    <button class="btn btn-sm btn-secondary" onclick="openPreview('${encodeURIComponent(file.name)}', '${file.category}')">
                        Pratinjau
                    </button>
                    <a href="/download/${encodeURIComponent(file.name)}" class="btn btn-sm btn-primary" download>
                        Unduh
                    </a>
                    <button class="btn btn-sm btn-icon" onclick="copyFileDownloadLink('${encodeURIComponent(file.name)}')" title="Salin Tautan">
                        📋
                    </button>
                    <button class="btn btn-sm btn-icon text-danger" onclick="confirmDeleteFile('${encodeURIComponent(file.name)}')" title="Hapus">
                        🗑️
                    </button>
                </div>
            `;
            container.appendChild(row);
        });
    }
}

function getFileIconSvg(category) {
    switch (category) {
        case 'video': return '🎬';
        case 'image': return '🖼️';
        case 'audio': return '🎵';
        case 'document': return '📄';
        case 'archive': return '📦';
        case 'code': return '💻';
        default: return '📁';
    }
}

function copyFileDownloadLink(encodedName) {
    const fullUrl = `${window.location.origin}/download/${encodedName}`;
    copyToClipboard(fullUrl);
}

async function confirmDeleteFile(encodedName) {
    const rawName = decodeURIComponent(encodedName);
    if (!confirm(`Yakin ingin menghapus file "${rawName}"?`)) return;

    try {
        const res = await fetch('/api/file/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: rawName })
        });
        if (res.ok) {
            showToast(`File "${rawName}" dihapus.`, 'info');
            fetchFiles();
            fetchServerInfo();
        } else {
            showToast('Gagal menghapus file', 'danger');
        }
    } catch (e) {
        showToast('Error koneksi saat menghapus file', 'danger');
    }
}

// ==========================================
// Media & Text Previews
// ==========================================
async function openPreview(encodedName, category) {
    const rawName = decodeURIComponent(encodedName);
    const downloadUrl = `/download/${encodedName}`;
    const previewUrl = `/download/${encodedName}?preview=1`;

    DOM.previewTitle.textContent = rawName;
    DOM.previewDownloadBtn.href = downloadUrl;
    DOM.previewContent.innerHTML = '<div style="padding: 2rem; color: #fff;">Memuat pratinjau...</div>';
    DOM.previewModal.classList.add('active');

    if (category === 'video') {
        DOM.previewContent.innerHTML = `
            <video controls autoplay playsinline style="max-width:100%; max-height:70vh; background:#000;">
                <source src="${previewUrl}">
                Browser Anda tidak mendukung video HTML5.
            </video>
        `;
    } else if (category === 'audio') {
        DOM.previewContent.innerHTML = `
            <div style="padding: 3rem; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🎵</div>
                <audio controls autoplay style="width: 100%; max-width: 400px;">
                    <source src="${previewUrl}">
                </audio>
            </div>
        `;
    } else if (category === 'image') {
        DOM.previewContent.innerHTML = `
            <img src="${previewUrl}" alt="${escapeHtml(rawName)}" style="max-width:100%; max-height:70vh; object-fit: contain;">
        `;
    } else if (category === 'document' || category === 'code') {
        try {
            const res = await fetch(previewUrl);
            const text = await res.text();
            DOM.previewContent.innerHTML = `
                <div class="preview-text"><pre><code>${escapeHtml(text.slice(0, 100000))}</code></pre></div>
            `;
        } catch (e) {
            DOM.previewContent.innerHTML = '<div style="padding: 2rem;">Tidak dapat memuat teks pratinjau.</div>';
        }
    } else {
        DOM.previewContent.innerHTML = `
            <div style="padding: 3rem; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📦</div>
                <p>Pratinjau langsung tidak tersedia untuk format file ini.</p>
                <a href="${downloadUrl}" class="btn btn-primary" download style="margin-top: 1rem;">Unduh File Sekarang</a>
            </div>
        `;
    }
}

// ==========================================
// Clipboard Sharing
// ==========================================
function initClipboardEvents() {
    DOM.btnSendClipboard.addEventListener('click', async () => {
        const text = DOM.clipboardInput.value.trim();
        const sender = DOM.senderName.value.trim() || 'Perangkat Saya';
        if (!text) {
            showToast('Ketikkan teks terlebih dahulu', 'info');
            return;
        }

        try {
            const res = await fetch('/api/clipboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, sender })
            });
            if (res.ok) {
                DOM.clipboardInput.value = '';
                showToast('Teks berhasil dibagikan!', 'success');
                fetchClipboard();
            }
        } catch (e) {
            showToast('Gagal mengirim teks', 'danger');
        }
    });

    DOM.btnClearClipboard.addEventListener('click', async () => {
        if (!confirm('Hapus seluruh riwayat teks tersimpan?')) return;
        try {
            await fetch('/api/clipboard', { method: 'DELETE' });
            showToast('Riwayat clipboard dibersihkan', 'info');
            fetchClipboard();
        } catch (e) {}
    });
}

async function fetchClipboard() {
    try {
        const res = await fetch('/api/clipboard');
        if (!res.ok) return;
        const data = await res.json();
        state.clipboard = data.messages || [];
        renderClipboardList();
    } catch (e) {}
}

function renderClipboardList() {
    const list = DOM.clipboardList;
    list.innerHTML = '';

    if (state.clipboard.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Belum ada teks yang dibagikan.</div>';
        return;
    }

    state.clipboard.forEach(item => {
        const div = document.createElement('div');
        div.className = 'clipboard-item';
        div.innerHTML = `
            <div class="clipboard-item-header">
                <strong>${escapeHtml(item.sender)}</strong>
                <span>${formatDate(item.timestamp)}</span>
            </div>
            <div class="clipboard-item-text">${escapeHtml(item.text)}</div>
            <div class="clipboard-item-actions">
                <button class="btn btn-sm btn-secondary" onclick="copyToClipboard('${escapeJsString(item.text)}')">
                    📋 Salin Teks
                </button>
            </div>
        `;
        list.appendChild(div);
    });
}

// ==========================================
// Modals
// ==========================================
function initModals() {
    DOM.btnOpenQr.addEventListener('click', () => {
        DOM.qrModal.classList.add('active');
    });

    DOM.btnCloseQrModal.addEventListener('click', () => {
        DOM.qrModal.classList.remove('active');
    });

    DOM.qrModalBackdrop.addEventListener('click', () => {
        DOM.qrModal.classList.remove('active');
    });

    DOM.btnClosePreview.addEventListener('click', () => {
        DOM.previewModal.classList.remove('active');
        DOM.previewContent.innerHTML = '';
    });

    DOM.previewModalBackdrop.addEventListener('click', () => {
        DOM.previewModal.classList.remove('active');
        DOM.previewContent.innerHTML = '';
    });
}

// ==========================================
// Utility Helpers
// ==========================================
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Tersalin ke clipboard!', 'success');
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
    showToast('Tersalin ke clipboard!', 'success');
}

function showToast(message, type = 'info', duration = 3000) {
    // Native feedback: success/error buzz, info stays silent.
    if (type === 'danger') haptic('error');
    else if (type === 'success') haptic('success');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    // Keep the stack short, like a native snackbar queue.
    const toasts = DOM.toastContainer.querySelectorAll('.toast');
    if (toasts.length > 3) toasts[0].remove();

    let removed = false;
    const dismiss = () => {
        if (removed) return;
        removed = true;
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatEta(seconds) {
    if (seconds < 60) return `${seconds} dtk tersisa`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}d tersisa`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}j ${remMins}m tersisa`;
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJsString(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}
