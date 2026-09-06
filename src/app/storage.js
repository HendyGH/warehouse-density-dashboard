(function (global) {
    'use strict';
    const localInvoke = global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke;
    const prefCache = Object.create(null);
    const machineCache = Object.create(null);
    const prefFile = 'user_preferences_v2.json';
    const machineFile = 'machine_config_v2.json';
    function browserGet(key) { try { return global.localStorage.getItem(key); } catch (error) { return null; } }
    function browserSet(key, value) { try { global.localStorage.setItem(key, value); } catch (error) {} }
    const SharedStore = { get(key, fallback = null) { const value = browserGet(key); return value == null ? fallback : value; }, set(key, value) { browserSet(key, value); return value; }, remove(key) { try { global.localStorage.removeItem(key); } catch (error) {} } };
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
            return localInvoke('read_file_named', { name: 'warehouse_state_v35.json' }).then(legacy => {
                if (!legacy || machineCache.activeProfile || machineCache.activeProfilePath) return { detected: false, config: machineCache };
                machineCache.activeProfilePath = './profiles/electronics-demo.json';
                machineCache.migratedFrom = 'v35';
                machineCache.migrationVersion = 2;
                return durablePersist(localInvoke, machineFile, machineCache).then(() => ({ detected: true, config: machineCache }));
            });
        }
    };
    global.SharedStore = SharedStore; global.UserPrefs = UserPrefs; global.MachineConfig = MachineConfig;
    global.UserPrefsReady = UserPrefs.load();
    global.MachineConfigReady = MachineConfig.load();
})(window);

