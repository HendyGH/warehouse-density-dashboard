const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const electronics = JSON.parse(fs.readFileSync(path.join(root, 'src', 'profiles', 'electronics-demo.json'), 'utf8'));
const generic = JSON.parse(fs.readFileSync(path.join(root, 'src', 'profiles', 'generic.json'), 'utf8'));
const context = { console, window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'app', 'segregation.js'), 'utf8'), context, { filename: 'segregation.js' });

(async () => {
  const profileContext = { console, setTimeout, window: {}, fetch: async () => ({ ok: true, json: async () => electronics }) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'profile.js'), 'utf8'), profileContext, { filename: 'profile.js' });
  const profile = await profileContext.window.WarehouseProfileReady;
  const evaluate = context.window.WarehouseApp.evaluateSegregation;
  const clean = { binCat: 'BATTERY', rmQty: 0, batQty: 4, packQty: 0 };
  const contaminated = { binCat: 'BATTERY', rmQty: 0, batQty: 4, packQty: 2 };
  assert.strictEqual(evaluate(profile, clean).length, 0);
  const violations = evaluate(profile, contaminated);
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(JSON.stringify(violations[0]), JSON.stringify({
    ruleId: 'battery-only', binCategory: 'battery', itemCategory: 'packing', severity: 'error', reason: 'category-not-allowed', quantity: 2
  }));
  assert.strictEqual(evaluate(profile, { binCat: 'BATTERY', rmQty: 1, batQty: 4, packQty: 2 }).length, 2);
  const genericApi = { profile: generic, getCategoryId: value => (generic.categories.find(c => c.label.toUpperCase() === String(value).toUpperCase()) || {}).id || '' };
  assert.strictEqual(evaluate(genericApi, contaminated).length, 0);
  console.log('segregation regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

