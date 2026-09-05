const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const electronics = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'profiles', 'electronics-demo.json'), 'utf8'));
const generic = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'profiles', 'generic.json'), 'utf8'));
const profileDirectory = path.join(__dirname, '..', 'src', 'profiles');

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
  assert.doesNotThrow(() => profile.validate(generic));
  fs.readdirSync(profileDirectory).filter(name => name.endsWith('.json')).forEach(name => {
    const builtin = JSON.parse(fs.readFileSync(path.join(profileDirectory, name), 'utf8'));
    assert.doesNotThrow(() => profile.validate(builtin), name);
  });
  context.fetch = async () => ({ ok: true, json: async () => ({ schemaVersion: 1, id: 'invalid', categories: [], classifiers: [], specialLocations: [] }) });
  await assert.rejects(() => profile.load('./profiles/custom-invalid.json'), /validation failed/);
  assert.throws(() => profile.validate({ schemaVersion: 1, id: 'bad', categories: [], classifiers: [], specialLocations: [] }), /validation failed/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'alias-collision',
    categories: [
      { id: 'battery', label: 'BATTERY', aliases: ['BAT'] },
      { id: 'other', label: 'OTHER', aliases: ['bat'] }
    ], classifiers: [], specialLocations: []
  }), /category alias collision.*BAT/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'label-alias-collision',
    categories: [
      { id: 'battery', label: 'BATTERY', aliases: [] },
      { id: 'other', label: 'OTHER', aliases: ['battery'] }
    ], classifiers: [], specialLocations: []
  }), /category alias collision.*BATTERY/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'location-alias-collision',
    categories: [{ id: 'general', label: 'GENERAL', aliases: ['GENERAL'] }], classifiers: [],
    specialLocations: [
      { id: 'receiving', label: 'RECEIVING', aliases: ['GR'] },
      { id: 'quarantine', label: 'QUARANTINE', aliases: ['gr'] }
    ]
  }), /special location alias collision.*GR/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'bad-snapshot',
    categories: [{ id: 'general', label: 'GENERAL', aliases: ['GENERAL'] }], snapshotCategories: ['missing'], classifiers: [], specialLocations: []
  }), /snapshot category is unknown/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'bad-operator',
    categories: [{ id: 'general', label: 'GENERAL', aliases: ['GENERAL'] }], classifiers: [{ id: 'x', tags: [], match: { any: [{ field: 'pn', op: 'startsWitht', value: '1' }] } }], specialLocations: []
  }), /match\.any\[0\]\.op is unsupported/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'case-id-collision',
    categories: [{ id: 'battery', label: 'Battery', aliases: ['BAT'] }, { id: 'BATTERY', label: 'Other', aliases: ['OTHER'] }], classifiers: [], specialLocations: []
  }), /category identifier collision/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'id-label-collision',
    categories: [{ id: 'battery', label: 'Battery', aliases: [] }, { id: 'other', label: 'Other', aliases: ['BATTERY'] }], classifiers: [], specialLocations: []
  }), /category alias collision.*BATTERY/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'special-id-collision',
    categories: [{ id: 'general', label: 'General', aliases: ['GENERAL'] }], classifiers: [],
    specialLocations: [{ id: 'Receiving', label: 'Receiving', aliases: [] }, { id: 'RECEIVING', label: 'Other', aliases: [] }]
  }), /special location identifier collision/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'bad-regex', categories: [{ id: 'general', label: 'General', aliases: ['GENERAL'] }],
    classifiers: [{ id: 'bad', tags: [], match: { any: [{ field: 'pn', op: 'regex', value: '[' }] } }], specialLocations: []
  }), /regex is invalid/);
  assert.throws(() => profile.validate({
    schemaVersion: 1, id: 'bad-field', categories: [{ id: 'general', label: 'General', aliases: ['GENERAL'] }],
    classifiers: [{ id: 'bad', tags: [], match: { any: [{ field: 'unknown', op: 'contains', value: 'x' }] } }], specialLocations: []
  }), /field is unsupported/);
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

