const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const migrationSource = fs.readFileSync('src/app/migration.js', 'utf8'); const storageSource = fs.readFileSync('src/app/storage.js', 'utf8');
function contextFor(machineRaw, legacyRaw) {
  const calls = []; const local = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const context = { window: { localStorage: local, __TAURI__: { core: { invoke: async (name, args) => { calls.push({ name, args }); if (name === 'get_config') return { db_folder: 'shared-folder' }; if (name === 'read_local_file_named') return machineRaw; if (name === 'read_file_named') return legacyRaw; return ''; } } } } };
  vm.runInNewContext(storageSource, context, { filename: 'storage.js' }); vm.runInNewContext(migrationSource, context, { filename: 'migration.js' }); return { context, calls };
}
(async () => {
  const existing = contextFor('', '{"rawDataInput":"legacy"}'); await existing.context.window.MachineConfigReady; assert.strictEqual(existing.context.window.MachineConfig.get('activeProfilePath'), './profiles/electronics-demo.json'); assert.ok(existing.calls.some(call => call.name === 'write_local_file_named')); const first = await existing.context.window.MachineConfig.refreshLegacyState(); assert.strictEqual(first.detected, false); const second = await existing.context.window.MachineConfig.refreshLegacyState(); assert.strictEqual(second.detected, false); assert.strictEqual(existing.context.window.MachineConfig.get('migratedFrom'), 'v35');
  const newPc = contextFor('', '{"rawDataInput":"legacy"}'); await newPc.context.window.MachineConfigReady; assert.strictEqual(newPc.context.window.MachineConfig.get('activeProfilePath'), './profiles/electronics-demo.json'); const afterFolderSelection = await newPc.context.window.MachineConfig.refreshLegacyState(); assert.strictEqual(afterFolderSelection.detected, false); assert.ok(newPc.calls.some(call => call.name === 'read_file_named'));
  const custom = contextFor('{"activeProfile":{"id":"custom"}}', '{"rawDataInput":"legacy"}'); await custom.context.window.MachineConfigReady; const customResult = await custom.context.window.MachineConfig.refreshLegacyState(); assert.strictEqual(customResult.detected, false); assert.strictEqual(custom.context.window.MachineConfig.get('activeProfile').id, 'custom');
  const fresh = contextFor('', ''); await fresh.context.window.MachineConfigReady; assert.strictEqual(fresh.context.window.WarehouseMigration.decideMigration({}).action, 'onboarding');
  assert.strictEqual(fresh.context.window.WarehouseMigration.decideMigration({ legacyStateDetected: true }).action, 'activate-compatibility');
  console.log('migration integration tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

