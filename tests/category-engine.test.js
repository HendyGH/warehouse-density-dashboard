const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const source = fs.readFileSync('src/profile.js', 'utf8'); const generic = JSON.parse(fs.readFileSync('src/profiles/generic.json', 'utf8'));
const context = { console, window: {}, fetch: async () => ({ ok: true, json: async () => generic }) }; vm.runInNewContext(source, context);
(async () => { const api = await context.window.WarehouseProfileReady; assert.strictEqual(api.resolveUnknownCategory('GENERAL').id, 'general'); assert.strictEqual(api.resolveUnknownCategory('mystery').preserved, true); assert.strictEqual(api.matches({ pn: 'A-1', desc: 'underdisplay' }, { any: [{ field: 'pn', op: 'startsWith', value: 'A' }], exclude: [{ field: 'desc', op: 'contains', value: 'underdisplay' }] }), false); console.log('category engine tests passed'); })().catch(error => { console.error(error); process.exitCode = 1; });

