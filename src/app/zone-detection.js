(function (global) {
    'use strict';
    function detectZone(bin, profileApi) {
        const value = String(bin || '').trim();
        const config = profileApi && profileApi.profile && profileApi.profile.zoneDetection || { mode: 'delimiter', delimiter: '-' };
        if (config.mode === 'regex' && config.pattern) {
            try {
                const match = new RegExp(config.pattern, config.flags || 'i').exec(value);
                if (match) return { zone: match[1] || match[0] || 'Unknown', aisle: match[2] || 'Misc' };
            } catch (error) { /* profile validation blocks invalid patterns; keep runtime safe */ }
        }
        const delimiter = config.delimiter || '-';
        const parts = value.split(delimiter);
        return { zone: parts[0] || 'Unknown', aisle: parts.length > 1 ? parts[1] : 'Misc' };
    }
    global.WarehouseApp = global.WarehouseApp || {};
    global.WarehouseApp.detectZone = detectZone;
})(window);

