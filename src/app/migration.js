(function (global) {
    'use strict';
    function decideMigration(input) {
        const state = input || {};
        if (state.activeProfile) return { action: 'keep', profile: state.activeProfile };
        if (state.legacyV35Detected || state.legacyStateDetected) return { action: 'activate-compatibility', profilePath: './profiles/electronics-demo.json', preserveLegacyFiles: true };
        return { action: 'onboarding', profilePath: './profiles/generic.json', preserveLegacyFiles: true };
    }
    async function migrate(machineConfig, detector) {
        const config = machineConfig || {};
        const result = decideMigration(Object.assign({}, config, await (detector ? detector() : {})));
        if (result.action !== 'keep' && global.MachineConfig) { await global.MachineConfig.set('activeProfilePath', result.profilePath); await global.MachineConfig.set('migrationVersion', 2); }
        return result;
    }
    global.WarehouseMigration = { decideMigration, migrate };
})(window);

