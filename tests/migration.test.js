const assert = require('assert'); const fs = require('fs'); const vm = require('vm'); const context = { window: {} }; vm.runInNewContext(fs.readFileSync('src/app/migration.js', 'utf8'), context);
assert.strictEqual(context.window.WarehouseMigration.decideMigration({ legacyV35Detected: true }).action, 'activate-compatibility'); assert.strictEqual(context.window.WarehouseMigration.decideMigration({}).action, 'onboarding'); assert.strictEqual(context.window.WarehouseMigration.decideMigration({ activeProfile: { id: 'custom' } }).action, 'keep'); console.log('migration tests passed');

