(function (global) {
    'use strict';
    const fields = {
        master: { bin: 'Storage bin', palletCount: 'Pallet count', category: 'Category', binCategory: 'Bin category' },
        detail: { partNumber: 'Part number', description: 'Description', category: 'Category', quantity: 'Quantity', batch: 'Batch', bin: 'Storage bin', handlingUnit: 'Handling unit' }
    };
    const optional = { master: ['category', 'binCategory'], detail: ['description', 'batch', 'handlingUnit'] };
    const aliases = { bin: ['Storage Bin', 'Bin', 'Location'], palletCount: ['Pallets', 'Pallet Count'], category: ['Category', 'Type'], binCategory: ['Bin Category', 'Type', 'Category'], partNumber: ['PN', 'SKU', 'Part Number'], description: ['Description', 'Name'], quantity: ['Quantity', 'Qty'], batch: ['Batch', 'Lot'], handlingUnit: ['HU', 'Handling Unit'] };
    function inspect(text) {
        const rows = global.WarehouseApp.parseDelimited(text);
        if (rows.length < 2) throw new Error('Include a header row and at least one data row.');
        const headers = rows[0].map(value => value.trim());
        const normalized = headers.map(global.WarehouseApp.headerKey);
        if (normalized.some(key => !key) || new Set(normalized).size !== headers.length) throw new Error('Give every column a unique, non-empty header.');
        return { headers, rows: rows.slice(1) };
    }
    function sample(profile) {
        const categories = profile.categories;
        const category = categories[0].label;
        return {
            master: ['Storage Bin\tPallets\tCategory\tBin Category' + categories.map(c => '\t' + c.label + ' Qty').join(''),
                'A-01\t1\t' + category + '\t' + category + categories.map((c, i) => '\t' + (i === 0 ? '1' : '0')).join('')].join('\n'),
            detail: 'PN\tDescription\tCategory\tQuantity\tBatch\tStorage Bin\tHU\nDEMO-001\tSample inventory\t' + category + '\t2\t\tA-01\tDEMO-HU'
        };
    }
    function open() {
        if (global.WarehouseAccess && !global.WarehouseAccess.canEdit) return;
        if (document.getElementById('warehouseImportAssistant')) return;
        const modal = document.createElement('div'); modal.id = 'warehouseImportAssistant'; modal.className = 'warehouse-dialog';
        modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Import assistant');
        const panel = document.createElement('div'); panel.className = 'warehouse-panel'; panel.style.width = '760px';
        modal.appendChild(panel); document.body.appendChild(modal);
        const previousFocus = document.activeElement;
        const close = () => { modal.remove(); if (previousFocus && previousFocus.focus) previousFocus.focus(); };
        let masterText = document.getElementById('rawDataInput').value, detailText = document.getElementById('detailedDataInput').value;
        function pasteStep() {
            panel.innerHTML = '<p class="warehouse-eyebrow">STEP 3 OF 3</p><h2>Bring in your inventory</h2><p>Copy spreadsheet cells with their column headers and paste them below. Preview before replacing the current inputs.</p><label>Bin master<textarea data-master placeholder="Paste bins and pallet counts"></textarea></label><label>Detailed stock (optional)<textarea data-detail placeholder="Paste item-level stock"></textarea></label><button data-sample>Try sample data</button><button data-next class="warehouse-primary">Match columns</button><button data-skip>Skip for now</button><div role="status"></div>';
            panel.querySelector('[data-master]').value = masterText;
            panel.querySelector('[data-detail]').value = detailText;
            panel.querySelector('[data-skip]').onclick = close;
            panel.querySelector('[data-sample]').onclick = () => { const data = sample(global.WarehouseProfile.profile); panel.querySelector('[data-master]').value = data.master; panel.querySelector('[data-detail]').value = data.detail; };
            panel.querySelector('[data-next]').onclick = () => {
                masterText = panel.querySelector('[data-master]').value; detailText = panel.querySelector('[data-detail]').value;
                try { matchStep(inspect(masterText), detailText.trim() ? inspect(detailText) : null); }
                catch (error) { panel.querySelector('[role=status]').textContent = error.message; }
            };
            panel.querySelector('[data-master]').focus();
        }
        function matchStep(master, detail) {
            panel.innerHTML = '<h2>Match your columns</h2><p>Check the suggested matches. Category quantities are optional and feed segregation checks; leave them unused only when those checks are not needed.</p><div data-fields></div><div data-preview></div><div role="status"></div><button data-back>Back</button><button data-preview-button class="warehouse-primary">Preview import</button><button data-apply class="warehouse-primary" disabled>Apply import</button><button data-close>Cancel</button>';
            const picks = { master: {}, detail: {}, categoryQuantityColumns: {} };
            const current = global.WarehouseProfile.profile.dataMappings || {};
            const container = panel.querySelector('[data-fields]');
            function addPick(kind, field, label, headers, allowEmpty, hints) {
                const labelElement = document.createElement('label'); labelElement.textContent = label;
                const select = document.createElement('select');
                const blank = document.createElement('option'); blank.value = ''; blank.textContent = allowEmpty ? 'Not used' : 'Choose a column'; select.appendChild(blank);
                headers.forEach((name, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = name; select.appendChild(option); });
                const configured = current[kind] && current[kind][field];
                let index = global.WarehouseApp.columnIndex(headers, configured);
                if (index < 0 && configured !== null) for (const hint of hints) { index = global.WarehouseApp.columnIndex(headers, hint); if (index >= 0) break; }
                select.value = index >= 0 ? String(index) : '';
                select.onchange = () => { panel.querySelector('[data-apply]').disabled = true; panel.querySelector('[data-preview]').textContent = ''; };
                labelElement.appendChild(select); container.appendChild(labelElement);
                picks[kind][field] = { select, headers, allowEmpty, label };
            }
            for (const kind of ['master', 'detail']) {
                const data = kind === 'master' ? master : detail; if (!data) continue;
                const heading = document.createElement('h3'); heading.textContent = kind === 'master' ? 'Bin master' : 'Detailed stock'; container.appendChild(heading);
                Object.entries(fields[kind]).forEach(([field, label]) => addPick(kind, field, label, data.headers, optional[kind].includes(field), aliases[field]));
            }
            global.WarehouseProfile.profile.categories.forEach(category => addPick('categoryQuantityColumns', category.id, category.label + ' quantity', master.headers, true, [category.label + ' Qty', category.id + ' Qty']));
            let draft;
            panel.querySelector('[data-back]').onclick = pasteStep;
            panel.querySelector('[data-close]').onclick = close;
            panel.querySelector('[data-preview-button]').onclick = async () => {
                const status = panel.querySelector('[role=status]'); status.textContent = '';
                panel.querySelector('[data-apply]').disabled = true;
                try {
                    draft = JSON.parse(JSON.stringify(global.WarehouseProfile.profile));
                    draft.dataMappings = { master: {}, detail: current.detail || {}, categoryQuantityColumns: {} };
                    if (detail) draft.dataMappings.detail = {};
                    for (const kind of Object.keys(picks)) for (const [field, pick] of Object.entries(picks[kind])) {
                        if (pick.select.value === '' && !pick.allowEmpty) throw new Error('Choose a column for ' + pick.label + '.');
                        if (kind === 'categoryQuantityColumns' && pick.select.value === '') continue;
                        draft.dataMappings[kind][field] = pick.select.value === '' ? null : pick.headers[Number(pick.select.value)];
                    }
                    const previewApi = await global.WarehouseProfile.load(draft);
                    const previous = global.WarehouseProfile;
                    let result;
                    try { global.WarehouseProfile = previewApi; result = global.parseDataset(masterText, detailText); }
                    finally { global.WarehouseProfile = previous; }
                    const output = panel.querySelector('[data-preview]'); output.textContent = '';
                    const summary = document.createElement('p'); summary.textContent = result.totalMasterBins + ' bins · ' + result.totalPallets + ' pallets · ' + result.detailed.length + ' stock rows'; output.appendChild(summary);
                    const tableWrap = document.createElement('div'); tableWrap.style.overflowX = 'auto';
                    const table = document.createElement('table');
                    const heading = document.createElement('tr'); ['Bin', 'Zone', 'Pallets', 'Category'].forEach(value => { const cell = document.createElement('th'); cell.textContent = value; heading.appendChild(cell); }); table.appendChild(heading);
                    result.data.slice(0, 5).forEach(row => { const tr = document.createElement('tr'); [row.bin, row.zone, row.palletCount, row.binCat].forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }); table.appendChild(tr); });
                    tableWrap.appendChild(table); output.appendChild(tableWrap);
                    const w = result.warnings;
                    if (!result.totalMasterBins || w.skippedMasterRows || w.skippedDetailRows || w.invalidMasterPalletRows || w.invalidQuantities || w.missingRequiredMappings.length) throw new Error('Some rows could not be imported cleanly. Check the data and column matches before applying.');
                    panel.querySelector('[data-apply]').disabled = false;
                    if (output.scrollIntoView) output.scrollIntoView({ block: 'nearest' });
                } catch (error) { status.textContent = error.message; }
            };
            panel.querySelector('[data-apply]').onclick = async () => {
                const apply = panel.querySelector('[data-apply]'); apply.disabled = true;
                try {
                    await global.ProfileManager.activate(draft, global.WarehouseProfile);
                    document.getElementById('rawDataInput').value = masterText;
                    document.getElementById('detailedDataInput').value = detailText;
                    global.processAllData(); close();
                } catch (error) { panel.querySelector('[role=status]').textContent = error.message; apply.disabled = false; }
            };
        }
        pasteStep();
    }
    global.WarehouseImportAssistant = { open, inspect, sample };
})(window);
