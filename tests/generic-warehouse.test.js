const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const fixture = { schemaVersion: 1, id: 'cold-chain', name: 'Cold Chain', unknownCategoryPolicy: 'preserve', categories: [
  { id: 'ambient', label: 'AMBIENT', aliases: ['AMBIENT'] }, { id: 'frozen', label: 'FROZEN', aliases: ['FROZEN'] },
  { id: 'chilled', label: 'CHILLED', aliases: ['CHILLED'] }, { id: 'returns', label: 'RETURNS', aliases: ['RETURNS'] }
], snapshotCategories: ['ambient', 'frozen', 'chilled', 'returns'], classifiers: [],
  specialLocations: [{ id: 'receiving', label: 'RECEIVING', aliases: ['INBOUND'], type: 'staging', tags: ['receiving'], behavior: { excludeFromStorageCapacity: true } }],
  dataMappings: { master: { bin: 'Bin', palletCount: 'Pallets', category: 'Category', binCategory: 'Bin Category' }, detail: { partNumber: 'PN', description: 'Description', category: 'Category', quantity: 'Quantity', bin: 'Bin', handlingUnit: 'HU' }, categoryQuantityColumns: { ambient: 'Ambient Qty', frozen: 'Frozen Qty', chilled: 'Chilled Qty', returns: 'Returns Qty' } },
  segregation: { enabled: true, quantityFields: { ambient: 'ambientQty', frozen: 'frozenQty', chilled: 'chilledQty', returns: 'returnsQty' }, rules: [{ id: 'frozen-only', binCategory: 'frozen', allowedItemCategories: ['frozen'], severity: 'error' }] },
  putaway: { enabled: false, rules: [] }, modules: { density: true, snapshots: true, segregation: true }, zoneDetection: { mode: 'delimiter', delimiter: '-' }
};
const context = { console, window: {}, fetch: async () => ({ ok: true, json: async () => fixture }) };
vm.runInNewContext(fs.readFileSync('src/profile.js', 'utf8'), context, { filename: 'profile.js' });
vm.runInNewContext(fs.readFileSync('src/app/mappings.js', 'utf8'), context, { filename: 'mappings.js' });
vm.runInNewContext(fs.readFileSync('src/app/category-engine.js', 'utf8'), context, { filename: 'category-engine.js' });
vm.runInNewContext(fs.readFileSync('src/app/zone-detection.js', 'utf8'), context, { filename: 'zone-detection.js' });
vm.runInNewContext(fs.readFileSync('src/app/segregation.js', 'utf8'), context, { filename: 'segregation.js' });
(async () => {
  const api = await context.window.WarehouseProfileReady; const app = context.window.WarehouseApp;
  assert.strictEqual(api.categoryId('FROZEN'), 'frozen'); assert.strictEqual(api.resolveUnknownCategory('DAMAGED').preserved, true); assert.strictEqual(api.isSpecialLocation('INBOUND', 'receiving'), true);
  const headers = ['Bin', 'Pallets', 'Category', 'Bin Category', 'Ambient Qty', 'Frozen Qty', 'Chilled Qty', 'Returns Qty'];
  const master = app.mapMasterRow(['COLD-A01', '2', 'FROZEN', 'FROZEN', '0', '2', '0', '0'], headers, { bin: 'Bin', palletCount: 'Pallets', category: 'Category', binCategory: 'Bin Category' }, fixture.dataMappings.categoryQuantityColumns);
  assert.strictEqual(master.categoryQuantities.frozen, '2');
  const stats = app.aggregateZoneCategories([{ zone: 'COLD', binCat: 'frozen', palletCount: 2 }, { zone: 'COLD', binCat: 'returns', palletCount: 1 }], api);
  assert.strictEqual(stats.COLD.frozen.pallets, 2); assert.strictEqual(app.snapshotCategoryPallets(stats.COLD, fixture.snapshotCategories).returns, 1);
  const zone = app.detectZone('COLD-A01', api); assert.strictEqual(zone.zone, 'COLD'); assert.strictEqual(zone.aisle, 'A01');
  assert.strictEqual(app.getSegregationViolations(api, { binCat: 'FROZEN', categoryQuantities: { ambient: 1, frozen: 0, chilled: 0, returns: 0 } }).length, 1);
  console.log('generic warehouse production fixture passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

