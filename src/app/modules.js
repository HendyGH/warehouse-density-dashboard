(function (global) {
    'use strict';
    const DEFAULTS = { density: true, snapshots: true, segregation: false, putaway: false, actionCenter: false, highValueTracking: false, npi: false, floorSheet: false, lab: false };
    function isEnabled(profileApi, id) {
        const modules = Object.assign({}, DEFAULTS, profileApi && profileApi.profile && profileApi.profile.modules || {});
        return modules[id] !== false;
    }
    function applyModuleVisibility(profileApi, root) {
        const doc = root || document;
        const controls = {
            snapshots: ['trendCardContainer'],
            actionCenter: ['operationalActionCenter'],
            npi: ['npiInputPanel', 'dashboardNpiBoard'],
            lab: ['viewLab'],
            putaway: ['grPutawayControls', 'putawayRulesModal', 'putawaySuggestionsModal']
        };
        Object.keys(controls).forEach(moduleId => controls[moduleId].forEach(id => {
            const element = doc.getElementById(id);
            if (element) element.hidden = !isEnabled(profileApi, moduleId);
        }));
        doc.querySelectorAll('[data-dash-section="action"]').forEach(element => { element.hidden = !isEnabled(profileApi, 'actionCenter'); });
        doc.querySelectorAll('[data-module]').forEach(element => { element.hidden = !isEnabled(profileApi, element.getAttribute('data-module')); });
        Object.keys(DEFAULTS).forEach(moduleId => {
            doc.querySelectorAll(`[data-module-${moduleId}]`).forEach(element => { element.hidden = !isEnabled(profileApi, moduleId); });
        });
        return profileApi;
    }
    global.WarehouseApp = global.WarehouseApp || {};
    global.WarehouseApp.isModuleEnabled = isEnabled;
    global.WarehouseApp.applyModuleVisibility = applyModuleVisibility;
})(window);

