(function (global) {
    'use strict';
    function profileSummary(profileApi) {
        const profile = profileApi && profileApi.profile || {};
        return {
            id: profile.id || '', name: profile.name || '', schemaVersion: profile.schemaVersion || null,
            categories: (profile.categories || []).map(item => ({ id: item.id, label: item.label, aliases: item.aliases || [] })),
            classifiers: (profile.classifiers || []).map(item => ({ id: item.id, tags: item.tags || [] })),
            specialLocations: (profile.specialLocations || []).map(item => ({ id: item.id, label: item.label, type: item.type || 'other' })),
            segregationEnabled: Boolean(profile.segregation && profile.segregation.enabled),
            putawayEnabled: Boolean(profile.putaway && profile.putaway.enabled),
            modules: profile.modules || {}
        };
    }
    function parseAndValidate(text, profileApi) {
        let value;
        try { value = JSON.parse(String(text || '')); } catch (error) { throw new Error(`Profile JSON is invalid: ${error.message}`); }
        if (!profileApi || typeof profileApi.validate !== 'function') throw new Error('Profile validator is unavailable.');
        return profileApi.validate(value);
    }
    function exportText(profileApi) { return JSON.stringify(profileApi && profileApi.profile || {}, null, 2); }
    function download(profileApi, filename) {
        const blob = new Blob([exportText(profileApi)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
        anchor.href = url; anchor.download = filename || `${profileApi.profile.id || 'warehouse-profile'}.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    function createDraft(options) {
        if (!global.WarehouseOnboarding || typeof global.WarehouseOnboarding.createDraft !== 'function') throw new Error('Profile onboarding is unavailable.');
        return global.WarehouseOnboarding.createDraft(options);
    }
    async function activate(textOrProfile, profileApi) {
        const validated = typeof textOrProfile === 'string' ? parseAndValidate(textOrProfile, profileApi || global.WarehouseProfile) : (profileApi || global.WarehouseProfile).validate(textOrProfile);
        if (global.MachineConfig && typeof global.MachineConfig.set === 'function') {
            await global.MachineConfig.set('activeProfile', validated);
        }
        global.WarehouseProfile = await (profileApi || global.WarehouseProfile).load(validated);
        return global.WarehouseProfile;
    }
    global.ProfileManager = { profileSummary, parseAndValidate, exportText, download, createDraft, activate };
})(window);

