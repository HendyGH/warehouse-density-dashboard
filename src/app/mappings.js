(function (global) {
    'use strict';
    function headerKey(value) { return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, ''); }
    function hasExplicit(spec) { return spec !== undefined && spec !== null && String(spec).trim() !== ''; }
    function columnIndex(headers, spec) {
        if (Number.isInteger(spec)) return spec >= 0 ? spec : -1;
        if (!hasExplicit(spec)) return -1;
        const target = headerKey(spec);
        if (!target) return -1;
        const matches = (headers || []).map((header, index) => headerKey(header) === target ? index : -1).filter(index => index >= 0);
        return matches.length === 1 ? matches[0] : -1;
    }
    function valueAt(columns, headers, spec, fallbackIndex, diagnostics, field) {
        if (spec === null) return '';
        const explicit = hasExplicit(spec), idx = columnIndex(headers, spec);
        if (idx >= 0 && idx < columns.length) return String(columns[idx] == null ? '' : columns[idx]).trim();
        if (explicit) { if (diagnostics) diagnostics.missing.push(field || String(spec)); return ''; }
        return fallbackIndex >= 0 ? String(columns[fallbackIndex] == null ? '' : columns[fallbackIndex]).trim() : '';
    }
    function begin() { return { missing: [], invalid: [] }; }
    function mapDetailRow(columns, headers, mapping, diagnostics) {
        const m = mapping || {}, d = diagnostics || begin();
        const result = { partNumber: valueAt(columns, headers, m.partNumber, 0, d, 'partNumber'), description: valueAt(columns, headers, m.description, 1, d, 'description'), category: valueAt(columns, headers, m.category, 2, d, 'category'), quantity: valueAt(columns, headers, m.quantity, 3, d, 'quantity'), batch: valueAt(columns, headers, m.batch, 4, d, 'batch'), bin: valueAt(columns, headers, m.bin, 5, d, 'bin'), handlingUnit: valueAt(columns, headers, m.handlingUnit, 6, d, 'handlingUnit') };
        if (diagnostics) result.diagnostics = d; return result;
    }
    function mapMasterRow(columns, headers, mapping, quantityMapping, diagnostics) {
        const m = mapping || {}, d = diagnostics || begin();
        const result = { bin: valueAt(columns, headers, m.bin, 0, d, 'bin'), palletCount: valueAt(columns, headers, m.palletCount, 3, d, 'palletCount'), category: valueAt(columns, headers, m.category, 4, d, 'category'), binCategory: valueAt(columns, headers, m.binCategory, 5, d, 'binCategory'), categoryQuantities: {} };
        Object.keys(quantityMapping || {}).forEach(categoryId => { result.categoryQuantities[categoryId] = valueAt(columns, headers, quantityMapping[categoryId], -1, d, `categoryQuantities.${categoryId}`); });
        if (diagnostics) result.diagnostics = d; return result;
    }
    function parseDelimited(text) { return String(text || '').split(/\r?\n/).filter(line => line.trim()).map(line => line.split('\t')); }
    function prepareImport(text, mapping, kind, quantityMapping) {
        const rows = parseDelimited(text);
        const names = Object.values(mapping || {}).concat(Object.values(quantityMapping || {}))
            .filter(value => typeof value === 'string' && hasExplicit(value)).map(headerKey);
        const expected = Array.from(new Set(names));
        let headerIndex = -1;
        if (expected.length) {
            headerIndex = rows.findIndex(row => expected.every(name => row.some(cell => headerKey(cell) === name)));
        }
        if (headerIndex < 0) {
            headerIndex = rows.findIndex(row => {
                const keys = row.map(headerKey);
                return kind === 'detail' ? keys.includes('pn') && keys.includes('description')
                    : keys.includes('storagebin') && keys.includes('pallets');
            });
        }
        const headers = headerIndex >= 0 ? rows[headerIndex] : [];
        return { headers, rows: rows.filter((row, index) => index !== headerIndex &&
            !(headers.length && row.length === headers.length && row.every((cell, i) => headerKey(cell) === headerKey(headers[i])))) };
    }
    global.WarehouseApp = global.WarehouseApp || {};
    Object.assign(global.WarehouseApp, { headerKey, columnIndex, mapDetailRow, mapMasterRow, parseDelimited, prepareImport, mappingDiagnostics: begin });
})(window);

