const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const source = fs.readFileSync('src/app/storage.js', 'utf8');
(async () => {
  const writes = []; let fail = false; const localData = {};
  const invoke = async (name, args) => {
    if (name === 'write_local_file_named') { if (fail) throw new Error('disk full'); writes.push({ name: args.name, content: args.content }); return ''; }
    if (name === 'read_local_file_named') return '';
    if (name === 'get_config') return { db_folder: 'shared-folder' };
    return '';
  };
  const context = { window: { localStorage: { getItem: key => localData[key] || null, setItem: (key, value) => { localData[key] = String(value); }, removeItem: key => delete localData[key] }, __TAURI__: { core: { invoke } } } };
  vm.runInNewContext(source, context, { filename: 'storage.js' }); await context.window.MachineConfigReady; await context.window.MachineConfig.set('activeProfilePath', './profiles/generic.json'); context.window.UserPrefs.set('theme', 'dark'); context.window.SharedStore.set('rawDataInput', 'operational'); await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(writes.some(write => write.name === 'machine_config_v2.json')); assert.ok(writes.some(write => write.name === 'user_preferences_v2.json')); assert.strictEqual(context.window.SharedStore.get('rawDataInput'), 'operational');
  fail = true; await assert.rejects(() => context.window.MachineConfig.set('activeProfilePath', './profiles/electronics-demo.json'), /disk full/); assert.strictEqual(context.window.MachineConfig.get('activeProfilePath'), './profiles/generic.json');
  console.log('storage persistence tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

