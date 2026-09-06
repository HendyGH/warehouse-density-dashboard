(function (global) {
    'use strict';

    function normalizeMarker(value) {
        if (global.WarehouseSharedState && typeof global.WarehouseSharedState.parseSharedV2Marker === 'function') {
            return global.WarehouseSharedState.parseSharedV2Marker(value);
        }
        let parsed = value;
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (error) { return null; }
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Number(parsed.stateSchemaVersion) !== 2 || !String(parsed.profileId || '').trim()) return null;
        return { stateSchemaVersion: 2, profileId: String(parsed.profileId).trim(), updatedAt: parsed.updatedAt == null ? '' : String(parsed.updatedAt) };
    }

    function classifySharedWarehouse(input) {
        const state = input || {};
        if (state.activeProfile) return { kind: 'configured-machine', profile: state.activeProfile };
        if (state.activeProfilePath) return { kind: 'configured-machine', profilePath: state.activeProfilePath };
        const hasSharedState = state.hasSharedState != null
            ? Boolean(state.hasSharedState)
            : Boolean(state.legacyV35Detected || state.legacyStateDetected);
        if (!hasSharedState) return { kind: 'fresh' };
        const marker = normalizeMarker(state.sharedMarker || state.marker);
        if (marker) return { kind: 'existing-v2', marker, profileId: marker.profileId };
        return { kind: 'legacy-v35' };
    }

    function decideMigration(input) {
        const state = input || {};
        if (state.activeProfile) return { action: 'keep', profile: state.activeProfile };
        if (state.activeProfilePath && !state.forceSharedClassification) return { action: 'keep', profilePath: state.activeProfilePath };
        if (state.legacyV35Detected || state.legacyStateDetected) {
            return { action: 'activate-compatibility', profilePath: './profiles/electronics-demo.json', preserveLegacyFiles: true };
        }

        const classification = classifySharedWarehouse(state);
        if (classification.kind === 'configured-machine') return { action: 'keep', profilePath: classification.profilePath };
        if (classification.kind === 'existing-v2') {
            const profileId = classification.profileId;
            if (profileId === 'generic' || profileId === 'electronics-demo') {
                return {
                    action: 'activate-existing-v2',
                    profileId,
                    profilePath: `./profiles/${profileId}.json`,
                    preserveLegacyFiles: true,
                    profileSelectionRequired: false
                };
            }
            return {
                action: 'profile-selection',
                profileId,
                profilePath: './profiles/generic.json',
                preserveLegacyFiles: true,
                profileSelectionRequired: true
            };
        }
        if (classification.kind === 'legacy-v35') {
            return { action: 'activate-compatibility', profilePath: './profiles/electronics-demo.json', preserveLegacyFiles: true };
        }
        return { action: 'onboarding', profilePath: './profiles/generic.json', preserveLegacyFiles: true };
    }

    async function migrate(machineConfig, detector) {
        const config = machineConfig || {};
        const result = decideMigration(Object.assign({}, config, await (detector ? detector() : {})));
        if (result.action === 'keep' || !global.MachineConfig) return result;
        if (result.profilePath) await global.MachineConfig.set('activeProfilePath', result.profilePath);
        await global.MachineConfig.set('migrationVersion', 2);
        if (result.profileId) await global.MachineConfig.set('sharedProfileId', result.profileId);
        if (result.profileSelectionRequired) await global.MachineConfig.set('profileSelectionRequired', true);
        if (result.action === 'activate-compatibility') await global.MachineConfig.set('migratedFrom', 'v35');
        return result;
    }

    global.WarehouseMigration = { normalizeMarker, classifySharedWarehouse, decideMigration, migrate };
})(window);

