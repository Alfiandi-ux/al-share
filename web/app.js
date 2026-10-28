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
    theme: localStorage.getItem('alshare_theme') || 'dark',
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
    toastContainer: document.getElementById('toastContainer')
};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initUploadEvents();
    initFileEvents();
    initClipboardEvents();
    initModals();

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
    if (state.theme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        DOM.themeIconDark.classList.add('hidden');
        DOM.themeIconLight.classList.remove('hidden');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        DOM.themeIconDark.classList.remove('hidden');
        DOM.themeIconLight.classList.add('hidden');
    }

    DOM.themeToggle.addEventListener('click', () => {
        if (document.body.classList.contains('light-theme')) {
            document.body.classList.replace('light-theme', 'dark-theme');
            localStorage.setItem('alshare_theme', 'dark');
            DOM.themeIconDark.classList.remove('hidden');
            DOM.themeIconLight.classList.add('hidden');
        } else {
            document.body.classList.replace('dark-theme', 'light-theme');
            localStorage.setItem('alshare_theme', 'light');
            DOM.themeIconDark.classList.add('hidden');
            DOM.themeIconLight.classList.remove('hidden');
        }
    });
}

// ==========================================
// Tab Navigation
// ==========================================
function initTabs() {
    DOM.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            DOM.tabs.forEach(t => t.classList.remove('active'));
            DOM.tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetContent = document.getElementById(tabId);
            if (targetContent) targetContent.classList.add('active');

            if (tabId === 'tab-files') fetchFiles();
            if (tabId === 'tab-clipboard') fetchClipboard();
        });
    });
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
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${escapeHtml(message)}</span>
    `;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
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
