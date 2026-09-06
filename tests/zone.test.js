const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'zone-detection.js'), 'utf8'), context);
const api = context.window.WarehouseApp;
assert.strictEqual(JSON.stringify(api.detectZone('O5-A8-01', { profile: { zoneDetection: { mode: 'delimiter', delimiter: '-' } } })), JSON.stringify({ zone: 'O5', aisle: 'A8' }));
assert.strictEqual(JSON.stringify(api.detectZone('REC-01-02', { profile: { zoneDetection: { mode: 'regex', pattern: '^([A-Z]+)-(\\d+)' } } })), JSON.stringify({ zone: 'REC', aisle: '01' }));
console.log('zone detection tests passed');

