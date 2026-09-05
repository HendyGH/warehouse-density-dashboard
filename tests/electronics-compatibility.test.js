const assert = require('assert'); const fs = require('fs'); const path = require('path');
const demo = JSON.parse(fs.readFileSync(path.join('src', 'profiles', 'electronics-demo.json'), 'utf8'));
assert.strictEqual(demo.id, 'electronics-demo'); assert.strictEqual(demo.defaultCategory, 'raw-material'); assert.deepStrictEqual(demo.snapshotCategories, ['packing', 'battery', 'raw-material']);
assert.ok(demo.classifiers.some(item => item.id === 'pcba')); assert.ok(demo.classifiers.some(item => item.id === 'phone')); const lcd = demo.classifiers.find(item => item.id === 'lcd'); assert.ok(lcd.match.exclude.some(item => String(item.value).toLowerCase() === 'underdisplay'));
assert.ok(demo.specialLocations.some(item => item.id === 'gr-zone')); assert.deepStrictEqual(Object.keys(demo.dataMappings.categoryQuantityColumns).sort(), ['battery', 'packing', 'raw-material']); console.log('electronics compatibility fixture passed');

