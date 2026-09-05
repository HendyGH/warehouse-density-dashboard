(function (global) {
    'use strict';
    const localInvoke = global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke;
    const prefCache = Object.create(null);
    const prefFile = 'user_preferences_v2.json';
    function browserGet(key) { try { return global.localStorage.getItem(key); } catch (error) { return null; } }
    function browserSet(key, value) { try { global.localStorage.setItem(key, value); } catch (error) { /* compatibility storage may be unavailable during boot */ } }
    const SharedStore = {
        get(key, fallback = null) { const value = browserGet(key); return value == null ? fallback : value; },
        set(key, value) { browserSet(key, value); return value; },
        remove(key) { try { global.localStorage.removeItem(key); } catch (error) {} }
    };
    const UserPrefs = {
        get(key, fallback = null) { return Object.prototype.hasOwnProperty.call(prefCache, key) ? prefCache[key] : fallback; },
        set(key, value) { prefCache[key] = value; if (localInvoke) localInvoke('write_local_file_named', { name: prefFile, content: JSON.stringify(prefCache) }).catch(() => {}); return value; },
        remove(key) { delete prefCache[key]; if (localInvoke) localInvoke('write_local_file_named', { name: prefFile, content: JSON.stringify(prefCache) }).catch(() => {}); },
        load() {
            if (!localInvoke) return Promise.resolve(prefCache);
            return localInvoke('read_local_file_named', { name: prefFile }).then(raw => {
                if (!raw) return prefCache;
                let parsed;
                try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`User preferences file is corrupt: ${error.message}`); }
                if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('User preferences file has an invalid structure.');
                Object.assign(prefCache, parsed);
                return prefCache;
            });
        }
    };
    const MachineConfig = {
        get(key, fallback = null) { return browserGet(`__warehouse_machine_${key}`) || fallback; },
        set(key, value) { browserSet(`__warehouse_machine_${key}`, value); return value; }
    };
    global.SharedStore = SharedStore;
    global.UserPrefs = UserPrefs;
    global.MachineConfig = MachineConfig;
    global.UserPrefsReady = UserPrefs.load();
})(window);

