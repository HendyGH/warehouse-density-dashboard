(function (global) {
    'use strict';
    const localInvoke = global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke;
    const prefCache = Object.create(null);
    const machineCache = Object.create(null);
    const prefFile = 'user_preferences_v2.json';
    const machineFile = 'machine_config_v2.json';
    const SHARED_V2_MARKER_KEY = '__warehouseAppV2';
    function browserGet(key) { try { return global.localStorage.getItem(key); } catch (error) { return null; } }
    function browserSet(key, value) { try { global.localStorage.setItem(key, value); } catch (error) {} }
    const SharedStore = { get(key, fallback = null) { const value = browserGet(key); return value == null ? fallback : value; }, set(key, value) { browserSet(key, value); return value; }, remove(key) { try { global.localStorage.removeItem(key); } catch (error) {} } };
    function parseSharedV2Marker(value) {
        let parsed = value;
        if (typeof parsed === 'string') {
            if (!parsed.trim()) return null;
            try { parsed = JSON.parse(parsed); } catch (error) { return null; }
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        if (Number(parsed.stateSchemaVersion) !== 2 || !String(parsed.profileId || '').trim()) return null;
        return {
            stateSchemaVersion: 2,
            profileId: String(parsed.profileId).trim(),
            updatedAt: parsed.updatedAt == null ? '' : String(parsed.updatedAt)
        };
    }
    function parseSharedState(raw) {
        if (raw && typeof raw === 'object') return raw;
        if (typeof raw !== 'string' || !raw.trim()) return null;
        try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch (error) { return null; }
    }
    function markerFromSharedState(raw) {
        const state = parseSharedState(raw);
        return parseSharedV2Marker(state && state[SHARED_V2_MARKER_KEY]);
    }
    function getSharedV2Marker(raw) {
        return raw === undefined ? parseSharedV2Marker(SharedStore.get(SHARED_V2_MARKER_KEY, null)) : markerFromSharedState(raw);
    }
    function markSharedWarehouseV2(profile) {
        const source = profile && profile.profile ? profile.profile : profile;
        const profileId = source && String(source.id || '').trim();
        if (!profileId) throw new Error('Cannot mark shared warehouse state without an active profile ID.');
        const marker = { stateSchemaVersion: 2, profileId, updatedAt: new Date().toISOString() };
        SharedStore.set(SHARED_V2_MARKER_KEY, JSON.stringify(marker));
        return marker;
    }
    function persist(invoke, file, value) { return invoke ? invoke('write_local_file_named', { name: file, content: JSON.stringify(value) }).catch(() => {}) : Promise.resolve(); }
    function durablePersist(invoke, file, value) { return invoke ? invoke('write_local_file_named', { name: file, content: JSON.stringify(value) }) : Promise.resolve(); }
    function waitForDatabaseFolder() {
        if (!localInvoke) return Promise.resolve();
        return localInvoke('get_config').then(config => {
            if (config && config.db_folder) return config;
            return new Promise(resolve => setTimeout(() => waitForDatabaseFolder().then(resolve), 100));
        }).catch(() => new Promise(resolve => setTimeout(() => waitForDatabaseFolder().then(resolve), 100)));
    }
    const UserPrefs = {
        get(key, fallback = null) { return Object.prototype.hasOwnProperty.call(prefCache, key) ? prefCache[key] : fallback; },
        set(key, value) { prefCache[key] = value; persist(localInvoke, prefFile, prefCache); return value; },
        remove(key) { delete prefCache[key]; persist(localInvoke, prefFile, prefCache); },
        load() { if (!localInvoke) return Promise.resolve(prefCache); return localInvoke('read_local_file_named', { name: prefFile }).then(raw => { if (!raw) return prefCache; let parsed; try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`User preferences file is corrupt: ${error.message}`); } if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('User preferences file has an invalid structure.'); Object.assign(prefCache, parsed); return prefCache; }); }
    };
    const MachineConfig = {
        get(key, fallback = null) { return Object.prototype.hasOwnProperty.call(machineCache, key) ? machineCache[key] : fallback; },
        set(key, value) {
            const had = Object.prototype.hasOwnProperty.call(machineCache, key), previous = machineCache[key];
            machineCache[key] = value;
            return durablePersist(localInvoke, machineFile, machineCache).catch(error => { if (had) machineCache[key] = previous; else delete machineCache[key]; throw error; });
        },
        remove(key) {
            const had = Object.prototype.hasOwnProperty.call(machineCache, key), previous = machineCache[key];
            delete machineCache[key];
            return durablePersist(localInvoke, machineFile, machineCache).catch(error => { if (had) machineCache[key] = previous; throw error; });
        },
        load() {
            if (!localInvoke) return Promise.resolve(machineCache);
            return waitForDatabaseFolder().then(() => localInvoke('read_local_file_named', { name: machineFile })).then(raw => {
                if (raw) { let parsed; try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`Machine configuration file is corrupt: ${error.message}`); } if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Machine configuration file has an invalid structure.'); Object.assign(machineCache, parsed); }
                return MachineConfig.refreshLegacyState().then(() => machineCache);
            });
        },
        refreshLegacyState() {
            if (!localInvoke) return Promise.resolve({ detected: false, config: machineCache });
            return localInvoke('read_file_named', { name: 'warehouse_state_v35.json' }).then(sharedRaw => {
                if (machineCache.activeProfile || machineCache.activeProfilePath) return { detected: false, config: machineCache };
                if (!sharedRaw) return { detected: false, config: machineCache };
                const marker = markerFromSharedState(sharedRaw);
                if (marker) {
                    const builtIn = marker.profileId === 'generic' || marker.profileId === 'electronics-demo';
                    machineCache.activeProfilePath = `./profiles/${builtIn ? marker.profileId : 'generic'}.json`;
                    machineCache.migrationVersion = 2;
                    machineCache.sharedProfileId = marker.profileId;
                    delete machineCache.migratedFrom;
                    if (builtIn) {
                        machineCache.onboardingCompleted = true;
                        delete machineCache.profileSelectionRequired;
                    } else {
                        machineCache.profileSelectionRequired = true;
                        machineCache.onboardingCompleted = false;
                    }
                    return durablePersist(localInvoke, machineFile, machineCache).then(() => ({ detected: false, existingV2: true, profileId: marker.profileId, config: machineCache }));
                }
                machineCache.activeProfilePath = './profiles/electronics-demo.json';
                machineCache.migratedFrom = 'v35';
                machineCache.migrationVersion = 2;
                delete machineCache.sharedProfileId;
                delete machineCache.profileSelectionRequired;
                return durablePersist(localInvoke, machineFile, machineCache).then(() => ({ detected: true, config: machineCache }));
            });
        }
    };
    global.SharedStore = SharedStore; global.UserPrefs = UserPrefs; global.MachineConfig = MachineConfig;
    global.WarehouseSharedState = { SHARED_V2_MARKER_KEY, parseSharedV2Marker, parseSharedState, markerFromSharedState, getSharedV2Marker, markSharedWarehouseV2 };
    global.UserPrefsReady = UserPrefs.load();
    global.MachineConfigReady = MachineConfig.load();
})(window);

