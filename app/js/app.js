Chart.register(ChartDataLabels);

const inputIds = ['rawDataInput', 'detailedDataInput', 'baseRawDataInput', 'baseDetailedDataInput'];
inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (localStorage.getItem(id)) el.value = localStorage.getItem(id);
    el.addEventListener('input', (e) => localStorage.setItem(id, e.target.value));
});

/* ---------- Input mode switch (Paste vs Upload) ---------- */
function setInputMode(mode) {
    localStorage.setItem('inputMode', mode);
    const upload = mode === 'upload';
    document.querySelectorAll('.paste-pane').forEach(el => el.classList.toggle('hidden', upload));
    document.querySelectorAll('.upload-pane').forEach(el => el.classList.toggle('hidden', !upload));
    document.getElementById('btnModePaste').classList.toggle('bg-white', !upload);
    document.getElementById('btnModePaste').classList.toggle('shadow', !upload);
    document.getElementById('btnModeUpload').classList.toggle('bg-white', upload);
    document.getElementById('btnModeUpload').classList.toggle('shadow', upload);
}

/* ---------- File ingestion (drag & drop / picker) via SheetJS ---------- */
async function ingestFile(file, targetId) {
    const label = document.querySelector(`.upload-pane[data-target="${targetId}"] .dz-name`);
    try {
        const name = file.name.toLowerCase();
        let tsv;
        if (name.endsWith('.txt') || name.endsWith('.tsv')) {
            tsv = (await file.text()).replace(/\r/g, '');
        } else {
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            tsv = XLSX.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
        }
        const el = document.getElementById(targetId);
        el.value = tsv.trim();
        localStorage.setItem(targetId, el.value);
        if (label) { label.textContent = file.name; label.classList.remove('text-slate-400'); label.classList.add('text-emerald-600'); }
    } catch (err) {
        if (label) { label.textContent = 'Could not read file'; label.classList.add('text-rose-600'); }
    }
}

function setupDropzones() {
    document.querySelectorAll('.dropzone').forEach(dz => {
        const targetId = dz.closest('.upload-pane').dataset.target;
        const input = dz.querySelector('input[type="file"]');
        dz.addEventListener('click', () => input.click());
        input.addEventListener('change', () => { if (input.files[0]) ingestFile(input.files[0], targetId); });
        ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); }));
        ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); }));
        dz.addEventListener('drop', e => { if (e.dataTransfer.files[0]) ingestFile(e.dataTransfer.files[0], targetId); });
    });
}

function showStatus(msg, type) {
    const el = document.getElementById('dataStatus');
    if (!el) return;
    if (!msg) { el.classList.add('hidden'); return; }
    const styles = { error: 'bg-rose-50 text-rose-700 border-rose-200', warn: 'bg-amber-50 text-amber-700 border-amber-200', ok: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    el.className = `text-sm font-bold px-4 py-2 rounded-lg border ${styles[type] || styles.ok}`;
    el.textContent = msg;
}

function clearMemory() {
    if (confirm("Are you sure you want to clear all pasted data?")) {
        inputIds.forEach(id => { document.getElementById(id).value = ''; localStorage.removeItem(id); });
        location.reload();
    }
}

let isAnalyticsVisible = true;

function toggleAnalytics() {
    const container = document.getElementById('chartCardContainer');
    const txt = document.getElementById('textToggleAnalytics');
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        txt.innerText = 'Hide Analytics';
    } else {
        container.classList.add('hidden');
        txt.innerText = 'Show Analytics';
    }
}

function toggleFilters() {
    const fb = document.getElementById('filterBarContainer');
    const icon = document.getElementById('iconToggleFilters');
    const txt = document.getElementById('textToggleFilters');
    if (fb.classList.contains('hidden')) {
        fb.classList.remove('hidden');
        txt.innerText = 'Hide Filters';
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>`;
    } else {
        fb.classList.add('hidden');
        txt.innerText = 'Show Filters';
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>`;
    }
}

let currentStats = { data: [], detailed: [], totalBins: 0, totalPallets: 0, contamBins: 0, totalMasterBins: 0, grStats: null };
let baseStats = { data: [], detailed: [], totalBins: 0, totalPallets: 0, contamBins: 0, zones: {}, totalMasterBins: 0, grStats: null };

let chartInstances = [];
let compareChart = null;
let deltaChart = null;
let contamChart = null;
let trendChart = null;
let filterState = { bin: '', zone: 'ALL', contaminatedOnly: false, highValueOnly: false, emptyOnly: false, hideEmpty: false };

const pcbaIconBlack = `<svg class="w-3.5 h-3.5 text-black drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>`;
const pcbaIconPurple = `<svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>`;
const phoneIconBlack = `<svg class="w-3.5 h-3.5 text-black drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;
const phoneIconBlue = `<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;

function isContaminated(row) {
    if (row.binCat === 'RAW MATERIAL') return row.batQty > 0 || row.packQty > 0;
    if (row.binCat === 'BATTERY') return row.rmQty > 0 || row.packQty > 0;
    if (row.binCat === 'PACKING') return row.rmQty > 0 || row.batQty > 0;
    return false;
}

function parseDataset(rawText, detailText, isBaseline = false) {
    let parsedGlobal = [];
    let parsedDetail = [];
    let zoneMetrics = {};
    let tBins = 0, tPal = 0, tCon = 0, tMasterBins = 0;

    let grUniqueHUs = new Set();
    let grHUToCats = {};
    let grHasPCBA = false;
    let grHasPhone = false;

    if (detailText) {
        const detLines = detailText.split('\n');
        for (let i = 0; i < detLines.length; i++) {
            let line = detLines[i].trim();
            if (!line || line.toLowerCase().includes('storage bin') || line.toLowerCase().includes('pn')) continue;
            let cols = line.split('\t');
            if (cols.length < 6) continue;

            let pn = cols[0].trim();
            let desc = cols[1].trim();
            let category = cols[2].trim();
            let rawQty = cols[3].trim().replace(/,/g, '');
            let qty = parseFloat(rawQty) || 0;
            let batch = cols[4].trim();
            let bin = cols[5].trim();
            let hu = cols.length > 6 ? cols[6].trim() : "";

            parsedDetail.push({ pn, desc, category, qty, batch, bin, hu });

            if (bin.toUpperCase() === 'GR-ZONE') {
                if (hu !== "") {
                    grUniqueHUs.add(hu);
                    if (!grHUToCats[hu]) grHUToCats[hu] = new Set();

                    let catUp = category.toUpperCase();
                    if (catUp.includes('RAW')) grHUToCats[hu].add('RAW MAT');
                    else if (catUp.includes('BAT')) grHUToCats[hu].add('BATTERY');
                    else if (catUp.includes('PACK')) grHUToCats[hu].add('PACKING');

                    if (pn.startsWith('52')) grHasPCBA = true;
                    if (pn.startsWith('90')) grHasPhone = true;
                }
            }
        }
    }

    let grCombos = { 'RAW MAT': 0, 'BATTERY': 0, 'PACKING': 0 };
    for (let hu in grHUToCats) {
        let cats = Array.from(grHUToCats[hu]).sort();
        if (cats.length === 0) continue;
        let comboName = cats.join(' + ');
        if (!grCombos[comboName]) grCombos[comboName] = 0;
        grCombos[comboName]++;
    }

    if (rawText) {
        const lines = rawText.split('\n');
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line.toLowerCase().includes('storage bin')) continue;
            let cols = line.split('\t');

            let bin = cols[0] || "Unknown";
            if (bin.toUpperCase() === 'GR-ZONE') continue;

            let palletCount = cols.length >= 4 ? parseInt(cols[3].trim()) || 0 : 0;
            let cat = cols.length >= 5 ? cols[4].trim() : "";
            let binCat = cols.length >= 6 && cols[5].trim() !== "" ? cols[5].trim().toUpperCase() : "UNASSIGNED";

            let rmQty = cols.length >= 7 ? parseInt(cols[6]) || 0 : 0;
            let batQty = cols.length >= 8 ? parseInt(cols[7]) || 0 : 0;
            let packQty = cols.length >= 9 ? parseInt(cols[8]) || 0 : 0;

            let binItems = parsedDetail.filter(d => d.bin === bin);
            let pcbaQty = binItems.filter(d => d.pn.startsWith('52')).reduce((sum, d) => sum + d.qty, 0);
            let phoneQty = binItems.filter(d => d.pn.startsWith('90')).reduce((sum, d) => sum + d.qty, 0);

            let parts = bin.split('-');
            let zone = parts[0] || "Unknown";
            let aisle = parts.length > 1 ? parts[1] : "Misc";

            let rowObj = { bin, zone, aisle, palletCount, category: cat, binCat, rmQty, batQty, packQty, pcbaQty, phoneQty };

            tMasterBins++;
            if (!zoneMetrics[zone]) zoneMetrics[zone] = { bins: 0, pallets: 0, contam: 0, ok: 0, masterBins: 0 };
            zoneMetrics[zone].masterBins++;

            if (palletCount > 0) {
                tBins++;
                tPal += palletCount;
                zoneMetrics[zone].bins++;
                zoneMetrics[zone].pallets += palletCount;
                if (isContaminated(rowObj)) {
                    tCon++;
                    zoneMetrics[zone].contam++;
                } else {
                    zoneMetrics[zone].ok++;
                }
            }

            parsedGlobal.push(rowObj);
        }
    }

    let finalGrStats = {
        combos: grCombos,
        total: grUniqueHUs.size,
        hasPCBA: grHasPCBA,
        hasPhone: grHasPhone
    };

    return { data: parsedGlobal, detailed: parsedDetail, zones: zoneMetrics, totalBins: tBins, totalPallets: tPal, contamBins: tCon, totalMasterBins: tMasterBins, grStats: finalGrStats };
}

function processAllData() {
    const raw = document.getElementById('rawDataInput').value;
    const det = document.getElementById('detailedDataInput').value;
    const bRaw = document.getElementById('baseRawDataInput').value;
    const bDet = document.getElementById('baseDetailedDataInput').value;

    if (!raw.trim()) { showStatus('Please provide Current Bin Master data first.', 'error'); return; }

    currentStats = parseDataset(raw, det, false);
    baseStats = parseDataset(bRaw, bDet, true);

    // Paste validation
    if (currentStats.totalMasterBins === 0) {
        showStatus('No valid bins found. Expected TAB-separated columns (Bin\u2009\u2192\u2009col1, Pallets\u2009\u2192\u2009col4). Check your data/file format.', 'error');
        return;
    }
    if (det.trim() && currentStats.detailed.length === 0) {
        showStatus('Bin Master loaded, but Detailed Stock has no valid rows (needs \u22656 TAB columns). Showing map without item details.', 'warn');
    } else {
        showStatus(`Loaded ${currentStats.totalMasterBins} bins, ${currentStats.totalPallets} pallets.`, 'ok');
    }

    populateZoneFilter();
    document.getElementById('filterBin').value = '';

    filterState = { bin: '', zone: 'ALL', contaminatedOnly: false, highValueOnly: false, emptyOnly: false, hideEmpty: false };
    document.getElementById('filterZone').value = 'ALL';
    document.getElementById('chkContam').checked = false;
    document.getElementById('chkHighValue').checked = false;
    document.getElementById('chkEmptyOnly').checked = false;
    document.getElementById('chkHideEmpty').checked = false;

    updateTopMetrics();
    updateGRZoneBanner();

    renderMainChart();
    renderHeatmap();
    renderTrendChart();
}

function formatDelta(current, base, isBadge = true) {
    if (base === undefined || base === null || isNaN(base)) return isBadge ? `<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md ml-2">No Base</span>` : "No Base";
    let diff = current - base;
    if (diff > 0) return isBadge ? `<span class="text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-md ml-2">\u2191 +${diff}</span>` : `<span class="text-rose-500 bg-rose-50 px-2 py-1 rounded-lg shadow-sm">\u2191 +${diff}</span>`;
    if (diff < 0) return isBadge ? `<span class="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-md ml-2">\u2193 ${diff}</span>` : `<span class="text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg shadow-sm">\u2193 ${diff}</span>`;
    return isBadge ? `<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md ml-2">-</span>` : `<span class="text-slate-400 bg-slate-50 px-2 py-1 rounded-lg shadow-sm">- No Change</span>`;
}

function updateTopMetrics() {
    let cap = currentStats.totalMasterBins;
    let pCur = currentStats.totalPallets;
    let pGr = currentStats.grStats.total;
    let pProj = pCur + pGr;

    let pctCur = cap ? Math.round((pCur / cap) * 100) : 0;
    let pctProj = cap ? Math.round((pProj / cap) * 100) : 0;

    let emptyNormal = cap - pCur;
    let emptyProj = cap - pProj;

    document.getElementById('metricBins').innerText = cap;

    document.getElementById('metricPallets').innerText = pCur;
    document.getElementById('metricPalletsPct').innerText = `(${pctCur}%)`;
    document.getElementById('metricEmptyNormal').innerText = emptyNormal >= 0 ? emptyNormal : 0;

    document.getElementById('metricProj').innerText = pProj;

    let projPctEl = document.getElementById('metricProjPct');
    let emptyProjEl = document.getElementById('metricEmptyProj');

    if (pctProj > 100) {
        projPctEl.innerHTML = `(<span class="text-rose-500">${pctProj}%</span> OVERLOAD)`;
        emptyProjEl.innerText = emptyProj;
        emptyProjEl.className = "text-sm font-black text-rose-500 bg-rose-100 px-2 py-0.5 rounded";
    } else {
        projPctEl.innerText = `(${pctProj}%)`;
        emptyProjEl.innerText = emptyProj;
        emptyProjEl.className = "text-sm font-black text-emerald-500";
    }

    document.getElementById('metricContam').innerText = currentStats.contamBins;
    let contamPct = currentStats.totalBins ? Math.round((currentStats.contamBins / currentStats.totalBins) * 100) : 0;
    document.getElementById('metricContamPct').innerText = `(${contamPct}%)`;

    const hasBase = document.getElementById('baseRawDataInput').value.trim() !== "";
    if (hasBase) {
        let baseProj = baseStats.totalPallets + (baseStats.grStats ? baseStats.grStats.total : 0);
        document.getElementById('deltaBins').innerHTML = formatDelta(cap, baseStats.totalMasterBins, false);
        document.getElementById('deltaPallets').innerHTML = formatDelta(pCur, baseStats.totalPallets, false);
        document.getElementById('deltaProj').innerHTML = formatDelta(pProj, baseProj, false);
        document.getElementById('deltaContam').innerHTML = formatDelta(currentStats.contamBins, baseStats.contamBins, false);
    } else {
        document.getElementById('deltaBins').innerHTML = "No Before Data";
        document.getElementById('deltaPallets').innerHTML = "No Before Data";
        document.getElementById('deltaProj').innerHTML = "No Before Data";
        document.getElementById('deltaContam').innerHTML = "No Before Data";
    }
}

function updateGRZoneBanner() {
    let gr = currentStats.grStats;
    let banner = document.getElementById('grZoneBanner');
    let badgesContainer = document.getElementById('grBadgesContainer');

    if (gr.total > 0) {
        banner.classList.remove('hidden');
        badgesContainer.innerHTML = '';

        const standardOrder = ['RAW MAT', 'BATTERY', 'PACKING'];

        function getGRBadgeStyle(name) {
            if (name === 'RAW MAT') return 'bg-slate-50 border-slate-200 text-slate-700';
            if (name === 'BATTERY') return 'bg-amber-50 border-amber-200 text-orange-500';
            if (name === 'PACKING') return 'bg-sky-50 border-sky-200 text-sky-600';
            return 'bg-purple-50 border-purple-300 text-purple-700 font-bold border-dashed';
        }

        standardOrder.forEach(cat => {
            let count = gr.combos[cat] || 0;
            let style = getGRBadgeStyle(cat);
            badgesContainer.innerHTML += `
                <div class="${style} border px-4 py-2.5 rounded-xl text-center min-w-[72px]">
                    <div class="text-[9px] font-black uppercase tracking-wider mb-1">${cat}</div>
                    <div class="font-black text-xl leading-none">${count}</div>
                </div>
            `;
        });

        Object.keys(gr.combos).forEach(combo => {
            if (standardOrder.includes(combo)) return;
            let count = gr.combos[combo];
            let style = getGRBadgeStyle(combo);
            badgesContainer.innerHTML += `
                <div class="${style} border px-4 py-2.5 rounded-xl text-center min-w-[95px]">
                    <div class="text-[9px] font-black uppercase tracking-wider mb-1">${combo}</div>
                    <div class="font-black text-xl leading-none">${count}</div>
                </div>
            `;
        });

        badgesContainer.innerHTML += `
            <div class="bg-blue-600 border border-blue-700 px-5 py-2.5 rounded-xl text-center shadow-sm ml-1">
                <div class="text-[9px] font-black text-blue-200 uppercase tracking-wider mb-1">Total Pallets</div>
                <div class="font-black text-white text-2xl leading-none">${gr.total}</div>
            </div>
        `;

        let alertContainer = document.getElementById('grHighValueAlert');
        alertContainer.innerHTML = '';

        if (gr.hasPCBA || gr.hasPhone) {
            let alertHtml = `<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 shadow-sm">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                High Value unsecured: 
            `;
            if (gr.hasPCBA) alertHtml += `<span class="flex items-center gap-0.5 bg-white text-slate-800 border border-slate-200 rounded px-1">${pcbaIconPurple} PCBA</span>`;
            if (gr.hasPhone) alertHtml += `<span class="flex items-center gap-0.5 bg-white text-slate-800 border border-slate-200 rounded px-1 ml-1">${phoneIconBlue} Phone</span>`;
            alertHtml += `</span>`;
            alertContainer.innerHTML = alertHtml;
        }
    } else {
        banner.classList.add('hidden');
    }
}

function renderMainChart() {
    const container = document.getElementById('chartCardContainer');
    const noDataMsg = document.getElementById('chartNoDataMsg');
    const chartsGrid = document.getElementById('chartsGrid');
    const btnAnalytics = document.getElementById('btnToggleAnalytics');

    if (currentStats.data.length === 0) {
        container.classList.add('hidden');
        btnAnalytics.classList.add('hidden');
        return;
    }

    btnAnalytics.classList.remove('hidden');
    container.classList.remove('hidden');

    const hasBase = baseStats && baseStats.totalMasterBins > 0;

    if (!hasBase) {
        chartsGrid && chartsGrid.classList.add('hidden');
        noDataMsg.classList.remove('hidden');
        return;
    }

    noDataMsg.classList.add('hidden');
    chartsGrid && chartsGrid.classList.remove('hidden');

    if (compareChart) compareChart.destroy();
    if (deltaChart) deltaChart.destroy();
    if (contamChart) contamChart.destroy();

    const sortedZones = Object.keys(currentStats.zones).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const labels = sortedZones.map(z => `Zone ${z}`);

    const sharedScaleOpts = {
        y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }
    };
    const sharedLayout = { padding: { top: 22, bottom: 22 } };

    const beforeData = sortedZones.map(z => baseStats.zones[z] ? baseStats.zones[z].pallets : 0);
    const currentData = sortedZones.map(z => currentStats.zones[z] ? currentStats.zones[z].pallets : 0);

    compareChart = new Chart(
        document.getElementById('compareChartCanvas').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Before',
                    data: beforeData,
                    backgroundColor: '#cbd5e1',
                    borderRadius: 3,
                    datalabels: {
                        anchor: ctx => ctx.dataset.data[ctx.dataIndex] < 0 ? 'start' : 'end',
                        align: 'top',
                        color: '#64748b',
                        font: { weight: 'bold', size: 9 },
                        formatter: v => v > 0 ? v : ''
                    }
                },
                {
                    label: 'Current',
                    data: currentData,
                    backgroundColor: '#3b82f6',
                    borderRadius: 3,
                    datalabels: {
                        anchor: ctx => ctx.dataset.data[ctx.dataIndex] < 0 ? 'start' : 'end',
                        align: 'top',
                        color: '#1e3a8a',
                        font: { weight: 'bold', size: 9 },
                        formatter: v => v > 0 ? v : ''
                    }
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, padding: 10 } } },
            scales: sharedScaleOpts, layout: sharedLayout
        }
    });

    const deltaData = sortedZones.map(z => {
        const b = baseStats.zones[z] ? baseStats.zones[z].pallets : 0;
        const c = currentStats.zones[z] ? currentStats.zones[z].pallets : 0;
        return c - b;
    });
    const deltaBgColors = deltaData.map(v =>
        v > 0 ? 'rgba(59,130,246,0.75)' : (v < 0 ? 'rgba(234,88,12,0.75)' : 'rgba(203,213,225,0.75)')
    );

    function makeTopLabelPlugin(colorPos, colorNeg) {
        return {
            id: 'topLabelPlugin',
            afterDatasetsDraw(chart) {
                const { ctx, scales } = chart;
                chart.data.datasets.forEach((dataset, di) => {
                    chart.getDatasetMeta(di).data.forEach((bar, i) => {
                        const v = dataset.data[i];
                        if (!v) return;
                        const label = v > 0 ? '+' + v : String(v);
                        const color = v > 0 ? colorPos : colorNeg;
                        const topY = v > 0 ? bar.y : scales.y.getPixelForValue(0);
                        ctx.save();
                        ctx.font = 'bold 9px system-ui, sans-serif';
                        ctx.fillStyle = color;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(label, bar.x, topY - 3);
                        ctx.restore();
                    });
                });
            }
        };
    }

    deltaChart = new Chart(
        document.getElementById('deltaChartCanvas').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Net Pallets',
                data: deltaData,
                backgroundColor: deltaBgColors,
                borderRadius: 3,
                datalabels: { display: false }
            }]
        },
        plugins: [makeTopLabelPlugin('#1d4ed8', '#c2410c')],
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: sharedScaleOpts, layout: sharedLayout
        }
    });

    const contamDeltaData = sortedZones.map(z => {
        const b = baseStats.zones[z] ? baseStats.zones[z].contam : 0;
        const c = currentStats.zones[z] ? currentStats.zones[z].contam : 0;
        return c - b;
    });
    const contamBgColors = contamDeltaData.map(v =>
        v > 0 ? 'rgba(244,63,94,0.8)' : (v < 0 ? 'rgba(16,185,129,0.75)' : 'rgba(203,213,225,0.75)')
    );

    contamChart = new Chart(
        document.getElementById('contamChartCanvas').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Contam Bins',
                data: contamDeltaData,
                backgroundColor: contamBgColors,
                borderRadius: 3,
                datalabels: { display: false }
            }]
        },
        plugins: [makeTopLabelPlugin('#be123c', '#065f46')],
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: sharedScaleOpts, layout: sharedLayout
        }
    });
}

function populateZoneFilter() {
    const zones = [...new Set(currentStats.data.map(d => d.zone))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const zoneSelect = document.getElementById('filterZone');
    zoneSelect.innerHTML = '<option value="ALL">All Zones</option>';
    zones.forEach(z => zoneSelect.innerHTML += `<option value="${z}">Zone ${z}</option>`);
}

function getFilteredData() {
    return currentStats.data.filter(row => {
        let matchBin = row.bin.toLowerCase().includes(filterState.bin);
        let matchZone = filterState.zone === 'ALL' || row.zone === filterState.zone;
        let matchContamination = !filterState.contaminatedOnly || isContaminated(row);
        let matchHighValue = !filterState.highValueOnly || (row.pcbaQty > 0 || row.phoneQty > 0);
        let matchEmptyOnly = !filterState.emptyOnly || (row.palletCount === 0);
        let matchHideEmpty = !filterState.hideEmpty || (row.palletCount > 0);

        return matchBin && matchZone && matchContamination && matchHighValue && matchEmptyOnly && matchHideEmpty;
    });
}

function applyFilters(event) {
    filterState.bin = document.getElementById('filterBin').value.toLowerCase();
    filterState.zone = document.getElementById('filterZone').value;
    filterState.contaminatedOnly = document.getElementById('chkContam').checked;
    filterState.highValueOnly = document.getElementById('chkHighValue').checked;
    filterState.emptyOnly = document.getElementById('chkEmptyOnly').checked;
    filterState.hideEmpty = document.getElementById('chkHideEmpty').checked;

    if (event && event.target) {
        if (event.target.id === 'chkEmptyOnly' && filterState.emptyOnly) {
            document.getElementById('chkHideEmpty').checked = false;
            filterState.hideEmpty = false;
        } else if (event.target.id === 'chkHideEmpty' && filterState.hideEmpty) {
            document.getElementById('chkEmptyOnly').checked = false;
            filterState.emptyOnly = false;
        }
    }
    renderHeatmap();
}

function getCatStyle(category) {
    if (category === 'RAW MATERIAL') return { bg: 'bg-slate-400 text-slate-900', border: 'border-slate-400' };
    if (category === 'BATTERY') return { bg: 'bg-orange-500 text-slate-900', border: 'border-orange-500' };
    if (category === 'PACKING') return { bg: 'bg-sky-500 text-slate-900', border: 'border-sky-500' };
    return { bg: 'bg-slate-300 text-slate-900', border: 'border-slate-300' };
}

function toggleZone(zoneName) {
    const body = document.getElementById(`body-${zoneName}`);
    if (body.classList.contains('hidden')) {
        body.classList.remove('hidden');
    } else {
        body.classList.add('hidden');
    }
}

function renderHeatmap() {
    const container = document.getElementById('heatmapContainer');
    container.innerHTML = '';

    chartInstances.forEach(c => c.destroy());
    chartInstances = [];

    const displayData = getFilteredData();
    if (displayData.length === 0) {
        container.innerHTML = `<div class="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
            <p class="text-sm text-slate-500 mt-2">No Bins Found for given filters.</p>
        </div>`;
        return;
    }

    const mapStructure = {};
    let zoneMetricsDisplay = {};

    displayData.forEach(row => {
        let z = row.zone; let bc = row.binCat; let a = row.aisle;

        if (!zoneMetricsDisplay[z]) zoneMetricsDisplay[z] = { bins: 0, pallets: 0, contam: 0, masterBins: 0 };
        if (!mapStructure[z]) mapStructure[z] = { subZones: {}, totalMasterBins: 0 };

        mapStructure[z].totalMasterBins++;
        zoneMetricsDisplay[z].masterBins++;

        if (!mapStructure[z].subZones[bc]) mapStructure[z].subZones[bc] = { aisles: {} };
        if (!mapStructure[z].subZones[bc].aisles[a]) mapStructure[z].subZones[bc].aisles[a] = { totalBins: 0, pallets: 0, rm: 0, bat: 0, pack: 0, pcba: 0, phone: 0 };

        mapStructure[z].subZones[bc].aisles[a].totalBins++;
        mapStructure[z].subZones[bc].aisles[a].pallets += row.palletCount;
        mapStructure[z].subZones[bc].aisles[a].rm += row.rmQty;
        mapStructure[z].subZones[bc].aisles[a].bat += row.batQty;
        mapStructure[z].subZones[bc].aisles[a].pack += row.packQty;
        mapStructure[z].subZones[bc].aisles[a].pcba += row.pcbaQty;
        mapStructure[z].subZones[bc].aisles[a].phone += row.phoneQty;

        if (row.palletCount > 0) {
            zoneMetricsDisplay[z].bins++;
            zoneMetricsDisplay[z].pallets += row.palletCount;
            if (isContaminated(row)) zoneMetricsDisplay[z].contam++;
        }
    });

    const sortedZones = Object.keys(mapStructure).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    sortedZones.forEach(zoneName => {
        const zMetrics = zoneMetricsDisplay[zoneName];
        const baseM = baseStats.zones[zoneName];

        let zTotalBins = zMetrics.masterBins;
        let zPalletPct = zTotalBins ? Math.round((zMetrics.pallets / zTotalBins) * 100) : 0;
        let zContamPct = zMetrics.bins ? Math.round((zMetrics.contam / zMetrics.bins) * 100) : 0;

        let deltaB = formatDelta(zTotalBins, baseM ? baseM.masterBins : null);
        let deltaP = formatDelta(zMetrics.pallets, baseM ? baseM.pallets : null);
        let deltaC = formatDelta(zMetrics.contam, baseM ? baseM.contam : null);

        let zColor = zPalletPct <= 33 ? 'text-emerald-500' : (zPalletPct <= 66 ? 'text-amber-500' : 'text-rose-500');

        const zoneCard = document.createElement('div');
        zoneCard.id = `card-${zoneName}`;
        zoneCard.className = 'bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-200 p-5 flex flex-col min-w-0 transition-all duration-300';

        zoneCard.innerHTML = `
            <div class="flex flex-col cursor-pointer hover:bg-slate-50 transition-colors rounded-xl p-2 -mx-2" onclick="toggleZone('${zoneName}')">
                <div class="flex justify-between items-center mb-3 border-b border-slate-100 pb-2.5">
                    <h2 class="text-2xl font-bold tracking-tight text-slate-900">Zone ${zoneName}</h2>
                    <div class="flex items-center gap-4">
                        <div class="text-right">
                            <div class="text-2xl font-bold ${zColor} leading-none">${zPalletPct}%</div>
                            <div class="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">${zMetrics.pallets}/${zTotalBins} Pallets</div>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-2 w-full">
                    <div class="w-1/2 flex flex-col justify-center gap-1.5 pr-2">
                        <div class="flex items-center"><span class="w-20 text-[10px] text-slate-400 uppercase font-semibold">Total Bins</span> <span class="text-sm font-bold text-slate-900">${zTotalBins}</span> ${deltaB}</div>
                        <div class="flex items-center"><span class="w-20 text-[10px] text-slate-400 uppercase font-semibold">Pallets</span> <span class="text-sm font-bold text-slate-900">${zMetrics.pallets} <span class="text-[10px] text-slate-400 font-semibold ml-0.5">(${zPalletPct}%)</span></span> ${deltaP}</div>
                        <div class="flex items-center"><span class="w-20 text-[10px] text-rose-500 uppercase font-semibold">Contam.</span> <span class="text-sm font-bold text-rose-600">${zMetrics.contam} <span class="text-[10px] text-rose-400 font-semibold ml-0.5">(${zContamPct}%)</span></span> ${deltaC}</div>
                    </div>
                    <div class="w-1/2 h-20 relative border-l border-slate-100 pl-2 pointer-events-none">
                        <canvas id="chart-${zoneName}"></canvas>
                    </div>
                </div>
            </div>
            
            <div id="body-${zoneName}" class="hidden flex flex-col gap-4 mt-6 pt-6 border-t border-slate-100"></div>
        `;

        container.appendChild(zoneCard);

        const ctx = document.getElementById(`chart-${zoneName}`).getContext('2d');
        const curOk = zMetrics.bins - zMetrics.contam;
        const curContam = zMetrics.contam;

        let labels = [];
        let okData = [];
        let contamData = [];

        if (baseM) {
            labels.push('Before');
            okData.push(baseM.bins - baseM.contam);
            contamData.push(baseM.contam);
        }

        labels.push('Current');
        okData.push(curOk);
        contamData.push(curContam);

        let cInst = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        data: contamData,
                        backgroundColor: '#ef4444',
                        stack: 'Stack 0',
                        barThickness: 16,
                        borderWidth: 0,
                        datalabels: { display: true, color: 'white', font: { weight: 'bold', size: 10 }, formatter: (v) => v > 0 ? v : '' }
                    },
                    {
                        data: okData,
                        backgroundColor: '#10b981',
                        stack: 'Stack 0',
                        barThickness: 16,
                        borderWidth: 0,
                        datalabels: { display: true, color: 'white', font: { weight: 'bold', size: 10 }, formatter: (v) => v > 0 ? v : '' }
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                    x: { stacked: true, display: false },
                    y: { stacked: true, display: true, ticks: { font: { size: 10, weight: 'bold' }, color: '#64748b' }, grid: { display: false, drawBorder: false } }
                }
            }
        });
        chartInstances.push(cInst);

        const subContainer = zoneCard.querySelector(`#body-${zoneName}`);
        const sortedCategories = Object.keys(mapStructure[zoneName].subZones).sort();

        sortedCategories.forEach(catName => {
            const subData = mapStructure[zoneName].subZones[catName];
            const catStyle = getCatStyle(catName);

            let catTotalBins = 0;
            let catPallets = 0;
            Object.values(subData.aisles).forEach(a => {
                catTotalBins += a.totalBins;
                catPallets += a.pallets;
            });

            let catDensity = catTotalBins > 0 ? Math.round((catPallets / catTotalBins) * 100) : 0;
            let catColor = catDensity <= 33 ? 'text-emerald-600' : (catDensity <= 66 ? 'text-amber-600' : 'text-rose-600');

            const subDiv = document.createElement('div');
            subDiv.className = `p-4 rounded-2xl border border-t-4 bg-slate-50/60 ${catStyle.border}`;
            subDiv.innerHTML = `
                <div class="flex items-center justify-between mb-4 border-b border-slate-200/60 pb-3">
                    <div class="px-3 py-1 text-[11px] font-bold tracking-wider rounded-lg shadow-sm uppercase ${catStyle.bg}">${catName}</div>
                    <div class="flex items-center gap-3 text-right">
                        <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">${catPallets}/${catTotalBins} Pallets</span>
                        <span class="text-sm font-bold ${catColor} bg-white px-2 py-0.5 rounded-lg shadow-sm border border-slate-200">${catDensity}%</span>
                    </div>
                </div>
                <div class="aisle-grid"></div>
            `;

            const aisleGrid = subDiv.querySelector('.aisle-grid');
            const sortedAisles = Object.keys(subData.aisles).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

            sortedAisles.forEach(aisleName => {
                const aData = subData.aisles[aisleName];
                const aDensity = aData.totalBins > 0 ? Math.round((aData.pallets / aData.totalBins) * 100) : 0;

                let aColor = aDensity <= 33 ? 'bg-emerald-500 text-white' : (aDensity <= 66 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white');

                let totalMat = aData.rm + aData.bat + aData.pack;
                let adaptiveHTML = '';

                if (totalMat > 0) {
                    let maxQ = Math.max(aData.rm, aData.bat, aData.pack);
                    let parts = [];
                    let labelAssigned = false;

                    if (aData.rm > 0) {
                        let isMax = maxQ === aData.rm && !labelAssigned;
                        if (isMax) labelAssigned = true;
                        parts.push({ w: (aData.rm / totalMat) * 100, c: 'bg-slate-400 text-slate-900', lbl: isMax ? 'RM' : '' });
                    }
                    if (aData.bat > 0) {
                        let isMax = maxQ === aData.bat && !labelAssigned;
                        if (isMax) labelAssigned = true;
                        parts.push({ w: (aData.bat / totalMat) * 100, c: 'bg-orange-500 text-slate-900', lbl: isMax ? 'BT' : '' });
                    }
                    if (aData.pack > 0) {
                        let isMax = maxQ === aData.pack && !labelAssigned;
                        if (isMax) labelAssigned = true;
                        parts.push({ w: (aData.pack / totalMat) * 100, c: 'bg-sky-500 text-slate-900', lbl: isMax ? 'PK' : '' });
                    }

                    parts.forEach((p, idx) => {
                        let border = idx < parts.length - 1 ? 'border-r border-slate-800' : '';
                        adaptiveHTML += `<div style="width: ${p.w}%" class="${p.c} ${border} h-full flex items-center justify-center text-[9px] font-black overflow-hidden">${p.lbl}</div>`;
                    });
                } else {
                    adaptiveHTML = `<div class="w-full bg-white h-full flex items-center justify-center text-[8px] font-black text-slate-400">EMPTY</div>`;
                }

                let specialIcons = '';
                if (aData.pcba > 0 || aData.phone > 0) {
                    specialIcons = '<div class="absolute top-1 right-1 flex gap-1 opacity-90 drop-shadow z-10">';
                    if (aData.pcba > 0) specialIcons += `<div title="Contains PCBA">${pcbaIconBlack}</div>`;
                    if (aData.phone > 0) specialIcons += `<div title="Contains Phone">${phoneIconBlack}</div>`;
                    specialIcons += '</div>';
                }

                const aisleBlock = document.createElement('div');
                aisleBlock.className = `h-20 lg:h-24 rounded-lg cursor-pointer relative border-2 border-slate-800 shadow-sm flex flex-col overflow-hidden transition-transform hover:scale-105 hover:shadow-lg`;
                aisleBlock.onclick = (e) => { e.stopPropagation(); openDrilldown(zoneName, catName, aisleName); };

                aisleBlock.innerHTML = `
                    <div class="h-4 lg:h-5 w-full flex border-b-2 border-slate-800 bg-white overflow-hidden">${adaptiveHTML}</div>
                    <div class="flex-1 flex flex-col items-center justify-center relative ${aColor}">
                        ${specialIcons}
                        <span class="text-[13px] lg:text-[15px] font-black drop-shadow-md">${aisleName}</span>
                        <span class="text-[10px] lg:text-xs font-bold">${aDensity}%</span>
                        <span class="text-[8px] lg:text-[9px] mt-0.5 opacity-90">(${aData.pallets}/${aData.totalBins})</span>
                    </div>
                `;
                aisleGrid.appendChild(aisleBlock);
            });
            subContainer.appendChild(subDiv);
        });
    });
}

function openDrilldown(zone, binCat, aisle) {
    const tbody = document.getElementById('modalTableBody');
    document.getElementById('modalTitle').innerText = `Zone ${zone} - Aisle ${aisle}`;

    let filteredData = getFilteredData().filter(d => d.zone === zone && d.binCat === binCat && d.aisle === aisle);
    filteredData.sort((a, b) => a.bin.localeCompare(b.bin, undefined, { numeric: true, sensitivity: 'base' }));
    tbody.innerHTML = '';

    filteredData.forEach((row, idx) => {
        let isContam = isContaminated(row);
        let binItems = currentStats.detailed.filter(d => d.bin === row.bin);
        let hasDetails = binItems.length > 0;

        let trClass = "hover:bg-slate-50 transition-colors border-l-4 border-l-transparent";
        if (isContam) trClass = "bg-rose-50 hover:bg-rose-100 transition-colors border-l-4 border-l-rose-500";

        let actionBadge = isContam ? `<span class="px-2 py-1 bg-rose-500 text-white rounded text-[11px] font-bold">CONTAMINATED</span>` : `<span class="text-slate-500 text-xs font-medium">OK</span>`;

        let rmTxt = row.rmQty > 0 ? `<span class="font-bold text-slate-900 bg-slate-200 px-2 py-0.5 rounded">${row.rmQty}</span>` : `<span class="text-slate-300">0</span>`;
        let batTxt = row.batQty > 0 ? `<span class="font-bold text-slate-900 bg-orange-200 px-2 py-0.5 rounded">${row.batQty}</span>` : `<span class="text-slate-300">0</span>`;
        let packTxt = row.packQty > 0 ? `<span class="font-bold text-slate-900 bg-sky-200 px-2 py-0.5 rounded">${row.packQty}</span>` : `<span class="text-slate-300">0</span>`;

        let expandIcon = hasDetails ? `<svg id="icon-${idx}" class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>` : ``;

        let binIcons = '';
        if (row.pcbaQty > 0) binIcons += pcbaIconPurple;
        if (row.phoneQty > 0) binIcons += phoneIconBlue;

        let binDisplay = binIcons ? `<div class="flex items-center gap-1.5" title="Special Items">${row.bin} ${binIcons}</div>` : row.bin;

        let tr = document.createElement('tr');
        tr.className = `${trClass} ${hasDetails ? 'cursor-pointer' : ''}`;
        if (hasDetails) tr.onclick = () => {
            document.getElementById(`detail-${idx}`).classList.toggle('open');
            let ic = document.getElementById(`icon-${idx}`);
            ic.innerHTML = document.getElementById(`detail-${idx}`).classList.contains('open') ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
        };

        tr.innerHTML = `
            <td class="px-2 py-2 text-center">${expandIcon}</td>
            <td class="px-4 py-2 font-bold text-slate-800">${binDisplay}</td>
            <td class="px-4 py-2 text-xs font-black text-slate-500">${row.binCat}</td>
            <td class="px-4 py-2 text-center font-bold text-slate-800">${row.palletCount}</td>
            <td class="px-4 py-2 text-center">${rmTxt}</td>
            <td class="px-4 py-2 text-center">${batTxt}</td>
            <td class="px-4 py-2 text-center">${packTxt}</td>
            <td class="px-4 py-2 text-center">${actionBadge}</td>
        `;
        tbody.appendChild(tr);

        if (hasDetails) {
            let detTr = document.createElement('tr');
            detTr.id = `detail-${idx}`;
            detTr.className = `details-row bg-slate-100/50 border-b border-slate-200`;
            let detHtml = `<td colspan="8" class="p-4"><div class="rounded border border-slate-200 bg-white shadow-inner overflow-hidden"><table class="min-w-full text-xs">
                <thead class="bg-slate-100 text-slate-500"><tr><th class="px-3 py-2 text-left">PN</th><th class="px-3 py-2 text-left">Description</th><th class="px-3 py-2 text-left">Category</th><th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2 text-left">Batch</th></tr></thead><tbody>`;
            binItems.forEach(item => {
                let isPcba = item.pn.startsWith('52');
                let isPhone = item.pn.startsWith('90');

                let catHighlight = isPcba ? `<span class="text-slate-800 font-bold flex items-center w-fit gap-1">${pcbaIconPurple} ${item.category}</span>` :
                    (isPhone ? `<span class="text-slate-800 font-bold flex items-center w-fit gap-1">${phoneIconBlue} ${item.category}</span>` :
                        `<span class="text-slate-600">${item.category}</span>`);

                let rowBgClass = isPcba ? 'bg-purple-50/30' : (isPhone ? 'bg-blue-50/30' : '');

                detHtml += `<tr class="border-b border-slate-50 hover:bg-slate-50 ${rowBgClass}">
                    <td class="px-3 py-2 font-mono text-slate-700">${item.pn}</td>
                    <td class="px-3 py-2 text-slate-600">${item.desc}</td>
                    <td class="px-3 py-2">${catHighlight}</td>
                    <td class="px-3 py-2 font-bold text-right">${item.qty}</td>
                    <td class="px-3 py-2 text-slate-500">${item.batch}</td>
                </tr>`;
            });
            detTr.innerHTML = detHtml + `</tbody></table></div></td>`;
            tbody.appendChild(detTr);
        }
    });
    document.getElementById('drilldownModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('drilldownModal').classList.add('hidden'); }

function downloadScreenshot() {
    const dashboardEl = document.getElementById('exportableDashboard');
    const btns = ['btnScreenshot', 'btnExportCSV', 'btnExportXLSX', 'btnToggleFilters', 'btnToggleAnalytics'].map(id => document.getElementById(id)).filter(Boolean);
    btns.forEach(b => b.style.visibility = 'hidden');

    html2canvas(dashboardEl, { scale: 2, backgroundColor: "#f8fafc" }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Warehouse_Map_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        btns.forEach(b => b.style.visibility = 'visible');
    });
}

function getMisplacedRows() {
    let binDesignationMap = {};
    currentStats.data.forEach(d => { binDesignationMap[d.bin] = d.binCat; });
    let rows = [];
    currentStats.detailed.forEach(item => {
        let designated = binDesignationMap[item.bin] || "UNASSIGNED";
        if (item.bin.toUpperCase() !== 'GR-ZONE' && designated !== "UNASSIGNED" && item.category.toUpperCase() !== designated.toUpperCase()) {
            rows.push({ Bin: item.bin, Designated: designated, ItemCategory: item.category, PN: item.pn, Description: item.desc, Qty: item.qty, Batch: item.batch, HU: item.hu });
        }
    });
    return rows;
}

function exportMisplacedCSV() {
    if (currentStats.detailed.length === 0 || currentStats.data.length === 0) {
        alert("Please load both Bin Master and Detailed Stock data first.");
        return;
    }
    const rows = getMisplacedRows();
    if (rows.length === 0) { alert("Great news! No misplaced materials were found in the provided data."); return; }

    let csvContent = "data:text/csv;charset=utf-8,Storage Bin,Designated Bin Category,Item Category,Part Number,Description,Quantity,Batch,HU\n";
    rows.forEach(r => {
        let safeDesc = String(r.Description).replace(/"/g, '""');
        csvContent += `${r.Bin},${r.Designated},${r.ItemCategory},${r.PN},"${safeDesc}",${r.Qty},${r.Batch},${r.HU}\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Misplaced_Materials_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportMisplacedXLSX() {
    if (currentStats.detailed.length === 0 || currentStats.data.length === 0) {
        alert("Please load both Bin Master and Detailed Stock data first.");
        return;
    }
    const rows = getMisplacedRows();
    if (rows.length === 0) { alert("Great news! No misplaced materials were found in the provided data."); return; }

    const header = ["Storage Bin", "Designated Bin Category", "Item Category", "Part Number", "Description", "Quantity", "Batch", "HU"];
    const aoa = [header, ...rows.map(r => [r.Bin, r.Designated, r.ItemCategory, r.PN, r.Description, r.Qty, r.Batch, r.HU])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 9 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Misplaced");
    XLSX.writeFile(wb, `Misplaced_Materials_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ---------- Snapshot history ---------- */
function getSnapshots() {
    try { return JSON.parse(localStorage.getItem('snapshots') || '[]'); } catch { return []; }
}

function saveSnapshot() {
    const raw = document.getElementById('rawDataInput').value;
    const det = document.getElementById('detailedDataInput').value;
    if (!raw.trim()) { alert("Nothing to snapshot \u2014 load current data first."); return; }
    const name = prompt("Snapshot name:", new Date().toLocaleString());
    if (name === null) return;
    const snaps = getSnapshots();
    snaps.unshift({ id: Date.now(), name: name || new Date().toLocaleString(), raw, det });
    localStorage.setItem('snapshots', JSON.stringify(snaps.slice(0, 30)));
    renderSnapshots();
}

function deleteSnapshot(id) {
    localStorage.setItem('snapshots', JSON.stringify(getSnapshots().filter(s => s.id !== id)));
    renderSnapshots();
}

function loadSnapshotAsBase(id) {
    const snap = getSnapshots().find(s => s.id === id);
    if (!snap) return;
    document.getElementById('baseRawDataInput').value = snap.raw;
    document.getElementById('baseDetailedDataInput').value = snap.det || '';
    localStorage.setItem('baseRawDataInput', snap.raw);
    localStorage.setItem('baseDetailedDataInput', snap.det || '');
    processAllData();
    showStatus(`Loaded snapshot "${snap.name}" as the Before baseline.`, 'ok');
}

function renderSnapshots() {
    const list = document.getElementById('snapshotList');
    if (!list) return;
    const snaps = getSnapshots();
    if (snaps.length === 0) { list.innerHTML = `<p class="text-xs text-slate-400 italic">No snapshots saved yet.</p>`; return; }
    list.innerHTML = snaps.map(s => `
        <div class="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <span class="text-xs font-bold text-slate-600 truncate" title="${s.name}">${s.name}</span>
            <span class="flex gap-2 flex-shrink-0">
                <button onclick="loadSnapshotAsBase(${s.id})" class="text-[11px] font-bold text-blue-600 hover:text-blue-800">Use as Before</button>
                <button onclick="deleteSnapshot(${s.id})" class="text-[11px] font-bold text-rose-500 hover:text-rose-700">Delete</button>
            </span>
        </div>
    `).join('');
    renderTrendChart();
}

function renderTrendChart() {
    const card = document.getElementById('trendCard');
    if (!card) return;
    const points = getSnapshots().slice().sort((a, b) => a.id - b.id).map(s => {
        const st = parseDataset(s.raw, s.det || '', false);
        return { label: s.name, util: st.totalMasterBins ? Math.round(st.totalPallets / st.totalMasterBins * 100) : 0, contam: st.contamBins };
    });
    if (currentStats && currentStats.totalMasterBins > 0) {
        points.push({ label: 'Current', util: Math.round(currentStats.totalPallets / currentStats.totalMasterBins * 100), contam: currentStats.contamBins });
    }
    if (points.length < 2) { card.classList.add('hidden'); if (trendChart) { trendChart.destroy(); trendChart = null; } return; }
    card.classList.remove('hidden');

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trendChartCanvas').getContext('2d'), {
        type: 'line',
        data: {
            labels: points.map(p => p.label),
            datasets: [
                { label: 'Utilization %', data: points.map(p => p.util), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', fill: true, tension: 0.3, yAxisID: 'y', datalabels: { display: false } },
                { label: 'Contaminated bins', data: points.map(p => p.contam), borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.1)', fill: false, tension: 0.3, yAxisID: 'y1', datalabels: { display: false } }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } } },
            scales: {
                y: { position: 'left', beginAtZero: true, suggestedMax: 100, title: { display: true, text: 'Utilization %', font: { size: 10 } }, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
                y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Contaminated bins', font: { size: 10 } }, grid: { display: false }, ticks: { font: { size: 10 }, precision: 0 } },
                x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } }
            }
        }
    });
}

window.addEventListener('load', function () {
    setInputMode(localStorage.getItem('inputMode') || 'paste');
    setupDropzones();
    renderSnapshots();
    if (localStorage.getItem('rawDataInput')) {
        processAllData();
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
