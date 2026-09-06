const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const migrationSource = fs.readFileSync('src/app/migration.js', 'utf8'); const storageSource = fs.readFileSync('src/app/storage.js', 'utf8');

function markerState(profileId, marker = {}) {
  return JSON.stringify({ rawDataInput: 'shared', __warehouseAppV2: JSON.stringify(Object.assign({ stateSchemaVersion: 2, profileId, updatedAt: '2026-09-06T00:00:00.000Z' }, marker)) });
}

function contextFor(machineRaw, sharedRaw) {
  const calls = []; const local = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const context = { console, window: { localStorage: local, __TAURI__: { core: { invoke: async (name, args) => { calls.push({ name, args }); if (name === 'get_config') return { db_folder: 'shared-folder' }; if (name === 'read_local_file_named') return machineRaw; if (name === 'read_file_named') return sharedRaw; return ''; } } } } };
  vm.runInNewContext(storageSource, context, { filename: 'storage.js' }); vm.runInNewContext(migrationSource, context, { filename: 'migration.js' }); return { context, calls };
}

(async () => {
  // A. Existing v35 shared state without a marker enters electronics compatibility once.
  const legacy = contextFor('', '{"rawDataInput":"legacy"}'); await legacy.context.window.MachineConfigReady;
  assert.strictEqual(legacy.context.window.MachineConfig.get('activeProfilePath'), './profiles/electronics-demo.json');
  assert.strictEqual(legacy.context.window.MachineConfig.get('migratedFrom'), 'v35');
  assert.ok(legacy.calls.some(call => call.name === 'write_local_file_named'));

  // B. The migration is idempotent after machine profile selection has been persisted.
  const idempotent = contextFor('{"activeProfilePath":"./profiles/electronics-demo.json","migratedFrom":"v35"}', '{"rawDataInput":"legacy"}'); await idempotent.context.window.MachineConfigReady;
  const before = idempotent.context.window.MachineConfig.get('activeProfilePath'); const second = await idempotent.context.window.MachineConfig.refreshLegacyState();
  assert.strictEqual(before, './profiles/electronics-demo.json'); assert.strictEqual(second.detected, false); assert.strictEqual(idempotent.context.window.MachineConfig.get('migratedFrom'), 'v35');

  // C. A v2 electronics marker is distinguished from a legacy v35 state.
  const v2Electronics = contextFor('', markerState('electronics-demo')); await v2Electronics.context.window.MachineConfigReady;
  assert.strictEqual(v2Electronics.context.window.MachineConfig.get('activeProfilePath'), './profiles/electronics-demo.json');
  assert.strictEqual(v2Electronics.context.window.MachineConfig.get('sharedProfileId'), 'electronics-demo');
  assert.strictEqual(v2Electronics.context.window.MachineConfig.get('migratedFrom', null), null);

  // D. A v2 generic marker remains generic on a new PC.
  const v2Generic = contextFor('', markerState('generic')); await v2Generic.context.window.MachineConfigReady;
  assert.strictEqual(v2Generic.context.window.MachineConfig.get('activeProfilePath'), './profiles/generic.json');
  assert.notStrictEqual(v2Generic.context.window.MachineConfig.get('activeProfilePath'), './profiles/electronics-demo.json');

  // E. A custom v2 marker opens the generic setup path and requests profile selection.
  const custom = contextFor('', markerState('cold-chain')); await custom.context.window.MachineConfigReady;
  assert.strictEqual(custom.context.window.MachineConfig.get('activeProfilePath'), './profiles/generic.json');
  assert.strictEqual(custom.context.window.MachineConfig.get('sharedProfileId'), 'cold-chain');
  assert.strictEqual(custom.context.window.MachineConfig.get('profileSelectionRequired'), true);

  // F. No shared state is a fresh install; the decision is onboarding.
  const fresh = contextFor('', ''); await fresh.context.window.MachineConfigReady;
  assert.strictEqual(fresh.context.window.WarehouseMigration.classifySharedWarehouse({}).kind, 'fresh');
  assert.strictEqual(fresh.context.window.WarehouseMigration.decideMigration({}).action, 'onboarding');
  assert.strictEqual(fresh.context.window.WarehouseMigration.decideMigration({ legacyStateDetected: true }).action, 'activate-compatibility');

  // Malformed markers fail closed and never crash the startup migration.
  for (const malformed of [
    JSON.stringify({ rawDataInput: 'shared', __warehouseAppV2: 'not-json' }),
    markerState('', {}),
    markerState('generic', { stateSchemaVersion: 1 })
  ]) {
    const result = contextFor('', malformed); await result.context.window.MachineConfigReady;
    assert.strictEqual(result.context.window.MachineConfig.get('activeProfilePath'), './profiles/electronics-demo.json');
    assert.strictEqual(result.context.window.MachineConfig.get('migratedFrom'), 'v35');
  }

  assert.strictEqual(fresh.context.window.WarehouseMigration.classifySharedWarehouse({ hasSharedState: true, sharedMarker: { stateSchemaVersion: 2, profileId: 'generic' } }).kind, 'existing-v2');
  assert.strictEqual(fresh.context.window.WarehouseMigration.classifySharedWarehouse({ hasSharedState: true, sharedMarker: { stateSchemaVersion: 2 } }).kind, 'legacy-v35');
  console.log('migration integration tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

