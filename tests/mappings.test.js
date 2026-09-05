const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'mappings.js'), 'utf8'), context);
const api = context.window.WarehouseApp;
const headers = ['Description', 'PN', 'Category', 'Quantity', 'Batch', 'Storage Bin', 'HU'];
const row = ['Display item', '571234', 'RAW MATERIAL', '7', 'B1', 'GR-ZONE', 'HU1'];
const mapped = api.mapDetailRow(row, headers, { partNumber: 'PN', description: 'Description', category: 'Category', quantity: 'Quantity', batch: 'Batch', bin: 'Storage Bin', handlingUnit: 'HU' });
assert.strictEqual(JSON.stringify(mapped), JSON.stringify({ partNumber: '571234', description: 'Display item', category: 'RAW MATERIAL', quantity: '7', batch: 'B1', bin: 'GR-ZONE', handlingUnit: 'HU1' }));
const master = api.mapMasterRow(['O1-A01', 'x', 'x', '2', 'RAW MATERIAL', 'RAW MATERIAL', '2', '0', '0'], [], {}, { 'raw-material': 6, battery: 7, packing: 8 });
assert.strictEqual(master.bin, 'O1-A01');
assert.strictEqual(master.categoryQuantities['raw-material'], '2');
console.log('mapping regression tests passed');

