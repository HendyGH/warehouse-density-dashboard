(function (global) {
    'use strict';

    function headerKey(value) { return String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function columnIndex(headers, spec) {
        if (Number.isInteger(spec)) return spec;
        const target = headerKey(spec);
        return (headers || []).findIndex(header => headerKey(header) === target);
    }
    function valueAt(columns, headers, spec, fallbackIndex) {
        const idx = columnIndex(headers, spec);
        return String(columns[idx >= 0 ? idx : fallbackIndex] == null ? '' : columns[idx >= 0 ? idx : fallbackIndex]).trim();
    }
    function mapDetailRow(columns, headers, mapping) {
        const m = mapping || {};
        return {
            partNumber: valueAt(columns, headers, m.partNumber, 0),
            description: valueAt(columns, headers, m.description, 1),
            category: valueAt(columns, headers, m.category, 2),
            quantity: valueAt(columns, headers, m.quantity, 3),
            batch: valueAt(columns, headers, m.batch, 4),
            bin: valueAt(columns, headers, m.bin, 5),
            handlingUnit: valueAt(columns, headers, m.handlingUnit, 6)
        };
    }
    function mapMasterRow(columns, headers, mapping, quantityMapping) {
        const m = mapping || {};
        const result = {
            bin: valueAt(columns, headers, m.bin, 0),
            palletCount: valueAt(columns, headers, m.palletCount, 3),
            category: valueAt(columns, headers, m.category, 4),
            binCategory: valueAt(columns, headers, m.binCategory, 5)
        };
        Object.keys(quantityMapping || {}).forEach(categoryId => {
            const field = quantityMapping[categoryId];
            result.categoryQuantities = result.categoryQuantities || {};
            result.categoryQuantities[categoryId] = valueAt(columns, headers, field, -1);
        });
        if (!result.categoryQuantities) result.categoryQuantities = {};
        return result;
    }
    function parseDelimited(text) {
        return String(text || '').split(/\r?\n/).filter(line => line.trim()).map(line => line.split('\t'));
    }
    global.WarehouseApp = global.WarehouseApp || {};
    global.WarehouseApp.headerKey = headerKey;
    global.WarehouseApp.mapDetailRow = mapDetailRow;
    global.WarehouseApp.mapMasterRow = mapMasterRow;
    global.WarehouseApp.parseDelimited = parseDelimited;
})(window);

