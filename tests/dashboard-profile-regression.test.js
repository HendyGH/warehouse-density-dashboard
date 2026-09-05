const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const electronics = JSON.parse(fs.readFileSync(path.join(root, 'src', 'profiles', 'electronics-demo.json'), 'utf8'));
const profileSource = fs.readFileSync(path.join(root, 'src', 'profile.js'), 'utf8');
const segregationSource = fs.readFileSync(path.join(root, 'src', 'app', 'segregation.js'), 'utf8');
const context = { console, setTimeout, window: {}, fetch: async () => ({ ok: true, json: async () => electronics }) };
vm.runInNewContext(profileSource, context, { filename: 'profile.js' });
vm.runInNewContext(segregationSource, context, { filename: 'segregation.js' });

function rows(file) {
  return fs.readFileSync(path.join(root, 'tests', 'fixtures', file), 'utf8')
    .split(/\r?\n/).filter(Boolean).slice(1)
    .map(line => line.split('\t'));
}

(async () => {
  const profile = await context.window.WarehouseProfileReady;
  const master = rows('master.tsv').map(columns => ({
    bin: columns[0], palletCount: Number(columns[3]) || 0, binCat: columns[5],
    rmQty: Number(columns[6]) || 0, batQty: Number(columns[7]) || 0, packQty: Number(columns[8]) || 0
  }));
  const detail = rows('detail.tsv').map(columns => ({
    pn: columns[0], desc: columns[1], category: columns[2], qty: Number(columns[3]) || 0,
    batch: columns[4], bin: columns[5], hu: columns[6]
  }));
  const gr = detail.filter(item => profile.isSpecialLocation(item.bin, 'gr-zone'));
  const hus = new Set(gr.map(item => item.hu));
  const totals = { pcba: 0, phone: 0, lcd: 0 };
  gr.forEach(item => {
    if (profile.matchesClassifier(item, 'pcba')) totals.pcba += item.qty;
    if (profile.matchesClassifier(item, 'phone')) totals.phone += item.qty;
    if (profile.matchesClassifier(item, 'lcd')) totals.lcd += item.qty;
  });

  assert.strictEqual(profile.categoryId('RAW'), 'raw-material');
  assert.strictEqual(profile.categoryId('BAT'), 'battery');
  assert.strictEqual(profile.categoryId('PACK'), 'packing');
  assert.deepStrictEqual(profile.snapshotCategoryLabels(), ['PACKING', 'BATTERY', 'RAW MATERIAL']);
  assert.strictEqual(hus.size, 4);
  assert.deepStrictEqual(totals, { pcba: 10, phone: 5, lcd: 7 });
  assert.strictEqual(profile.classifierTags({ pn: '521234', desc: 'PCBA fabricated board' }).includes('pcba'), true);
  assert.strictEqual(context.window.WarehouseApp.getSegregationViolations(profile, master[1]).length > 0, true);
  assert.strictEqual(context.window.WarehouseApp.getSegregationViolations(profile, master[3]).length, 0);
  console.log('dashboard profile regression fixture passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

