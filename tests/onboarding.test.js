const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('src/app/onboarding.js', 'utf8'), context);
const draft = context.window.WarehouseOnboarding.createDraft({ name: 'Pallet Warehouse', categories: [{ id: 'returns', label: 'Returns' }] });
assert.strictEqual(draft.schemaVersion, 1);
assert.strictEqual(draft.id, 'pallet-warehouse');
assert.strictEqual(draft.categories[0].id, 'returns');
assert.deepStrictEqual(draft.snapshotCategories, ['returns']);
console.log('onboarding draft tests passed');

