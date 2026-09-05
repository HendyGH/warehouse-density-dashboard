const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const electronics = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'profiles', 'electronics-demo.json'), 'utf8'));
const generic = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'profiles', 'generic.json'), 'utf8'));

assert.strictEqual(electronics.schemaVersion, 1);
assert.strictEqual(electronics.categories.find(c => c.id === 'raw-material').aliases.includes('RAW'), true);
assert.strictEqual(electronics.specialLocations[0].label, 'GR-ZONE');

const profileSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'profile.js'), 'utf8');
const context = {
  console,
  setTimeout,
  window: {},
  fetch: async () => ({ ok: true, json: async () => electronics })
};
vm.runInNewContext(profileSource, context, { filename: 'profile.js' });

(async () => {
  const profile = await context.window.WarehouseProfileReady;
  assert.strictEqual(profile.categoryId('RAW'), 'raw-material');
  assert.strictEqual(profile.categoryLabel('BAT'), 'BATTERY');
  assert.strictEqual(profile.isSpecialLocation('GR', 'gr-zone'), true);
  assert.strictEqual(profile.matchesClassifier({ pn: '57123', desc: 'panel' }, 'lcd'), true);
  assert.strictEqual(profile.matchesClassifier({ pn: '57123', desc: 'UNDERDISPLAY fingerprint' }, 'lcd'), false);
  assert.strictEqual(profile.matchesClassifier({ pn: '001', desc: 'phone display' }, 'lcd'), true);
  assert.strictEqual(profile.matches({ pn: '52123', desc: 'PCBA module' }, {
    any: [{ field: 'pn', op: 'startsWith', value: '52' }],
    all: [{ field: 'desc', op: 'contains', value: 'module' }],
    exclude: [{ field: 'desc', op: 'contains', value: 'underdisplay' }]
  }), true);
  assert.strictEqual(profile.matches({ pn: '52123', desc: 'UNDERDISPLAY module' }, {
    any: [{ field: 'pn', op: 'startsWith', value: '52' }],
    all: [{ field: 'desc', op: 'contains', value: 'module' }],
    exclude: [{ field: 'desc', op: 'contains', value: 'underdisplay' }]
  }), false);
  assert.strictEqual(profile.matches({ desc: 'ordinary item' }, {
    exclude: [{ field: 'desc', op: 'contains', value: 'underdisplay' }]
  }), true);
  context.fetch = async () => ({ ok: true, json: async () => ({ schemaVersion: 1, id: 'invalid', categories: [], classifiers: [], specialLocations: [] }) });
  await assert.rejects(() => profile.load('./profiles/custom-invalid.json'), /validation failed/);
  assert.throws(() => profile.validate({ schemaVersion: 1, id: 'bad', categories: [], classifiers: [], specialLocations: [] }), /validation failed/);
  assert.throws(() => profile.validate({
    schemaVersion: 1,
    id: 'bad-match',
    categories: [{ id: 'x', label: 'X', aliases: [] }],
    classifiers: [{ id: 'broken', tags: [], match: { any: 'not-an-array' } }],
    specialLocations: []
  }), /match\.any must be an array/);
  assert.strictEqual(generic.classifiers.length, 0);
  console.log('profile regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

