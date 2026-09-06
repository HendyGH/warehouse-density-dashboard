(function (global) {
    'use strict';
    function categoryId(profile, value) { return profile && typeof profile.categoryId === 'function' ? profile.categoryId(value) || String(value || '').trim().toLowerCase() : String(value || '').trim().toLowerCase(); }
    function aggregateZoneCategories(rows, profile) {
        const ids = profile && typeof profile.getCategoryIds === 'function' ? profile.getCategoryIds() : [];
        const empty = () => Object.fromEntries(ids.map(id => [id, { pallets: 0, bins: 0, empty: 0 }]));
        const out = {};
        (Array.isArray(rows) ? rows : []).forEach(row => { const zone = String(row.zone || 'Unknown'); const category = categoryId(profile, row.binCat); if (!out[zone]) out[zone] = empty(); if (!out[zone][category]) out[zone][category] = { pallets: 0, bins: 0, empty: 0 }; const pallets = Number(row.palletCount) || 0; out[zone][category].bins += 1; out[zone][category].pallets += pallets; if (!pallets) out[zone][category].empty += 1; });
        return out;
    }
    function snapshotCategoryPallets(zoneStats, categoryIds) { const ids = Array.isArray(categoryIds) ? categoryIds : Object.keys(zoneStats || {}); const byCategory = zoneStats && (zoneStats.byCategory || zoneStats) || {}; const out = {}; ids.forEach(id => { const item = byCategory[id]; out[id] = item && Number(item.pallets) || 0; }); return out; }
    global.WarehouseApp = global.WarehouseApp || {};
    Object.assign(global.WarehouseApp, { aggregateZoneCategories, snapshotCategoryPallets });
})(window);

