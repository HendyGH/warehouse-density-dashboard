const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const context = { window: {} }; vm.runInNewContext(fs.readFileSync('src/app/onboarding.js', 'utf8'), context, { filename: 'onboarding.js' }); vm.runInNewContext(fs.readFileSync('src/app/profile-manager.js', 'utf8'), context, { filename: 'profile-manager.js' });
(async () => {
  const draft = context.window.WarehouseOnboarding.createDraft({ name: 'Pallet Warehouse', categories: [{ id: 'returns', label: 'Returns' }] }); assert.strictEqual(draft.schemaVersion, 1); assert.strictEqual(draft.id, 'pallet-warehouse'); assert.strictEqual(draft.categories[0].id, 'returns'); assert.deepStrictEqual(draft.snapshotCategories, ['returns']);
  const writes = []; const api = { profile: { id: 'generic' }, validate: value => value, load: async value => ({ profile: value }) }; context.window.MachineConfig = { set: async (key, value) => writes.push({ key, value }) }; const activated = await context.window.ProfileManager.activate(draft, api); assert.strictEqual(activated.profile.id, 'pallet-warehouse'); assert.strictEqual(writes[0].key, 'activeProfile'); assert.strictEqual(writes[0].value.id, 'pallet-warehouse');
  context.window.MachineConfig.set = async () => { throw new Error('disk full'); }; await assert.rejects(() => context.window.ProfileManager.activate(draft, api), /disk full/); console.log('onboarding activation tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

