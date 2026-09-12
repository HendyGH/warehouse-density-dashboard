const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync('src/' + file, 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
function dom() { return new JSDOM('<!doctype html><body><textarea id="rawDataInput"></textarea><textarea id="detailedDataInput"></textarea></body>', { url: 'http://localhost/', runScripts: 'outside-only' }); }

async function boot(mode, users = '') {
    const page = dom(), w = page.window, calls = [];
    w.__TAURI__ = { core: { invoke: async (name, args) => {
        calls.push({ name, args });
        if (name === 'get_config') return { db_folder: 'warehouse' };
        if (name === 'warehouse_access_mode') return mode;
        if (name === 'read_file_named') return args.name === 'users_v35.json' ? users : '{}';
        return '';
    } } };
    w.WarehouseProfileReady = Promise.resolve();
    w.eval(source('tauri_boot.js'));
    return { page, w, calls };
}

(async () => {
    const free = await boot('open');
    await free.w.TauriBootReady;
    assert.strictEqual(free.w.WarehouseAccess.accountFree, true);
    assert.strictEqual(free.w.WarehouseAccess.canEdit, true);
    assert.strictEqual(free.w.document.getElementById('accountBadge').textContent, 'No-account mode');
    assert.ok(!free.calls.some(c => c.args && c.args.name === 'users_v35.json'));
    free.w.localStorage.setItem('rawDataInput', 'inventory');
    await new Promise(resolve => setTimeout(resolve, 900));
    assert.ok(free.calls.some(c => c.name === 'write_file_named' && c.args.name === 'warehouse_state_v35.json' && c.args.content.includes('inventory')));
    free.page.window.close();
    const protectedWarehouse = await boot('accounts', '{broken');
    await assert.rejects(protectedWarehouse.w.TauriBootReady, /damaged/);
    assert.ok(!protectedWarehouse.w.WarehouseAccess);
    assert.ok(!protectedWarehouse.calls.some(c => c.name === 'write_file_named'));
    protectedWarehouse.page.window.close();
    const fresh = await boot('accounts'); await tick();
    assert.ok(fresh.w.document.body.textContent.includes('Create First Administrator'));
    assert.ok(!fresh.w.WarehouseAccess); fresh.page.window.close();

    const setupPage = dom(), sw = setupPage.window;
    sw.eval(source('app/setup.js'));
    const node = (tag, text) => { const element = sw.document.createElement(tag); element.textContent = text || ''; return element; };
    const ui = {
        title: text => node('h2', text), sub: text => node('p', text), label: text => node('label', text), errline: () => node('p'),
        input: () => node('input'), button: text => node('button', text),
        selectBox: options => { const select = node('select'); for (const [value, text] of options) { const option = node('option', text); option.value = value; select.appendChild(option); } return select; },
        setOverlay: nodes => nodes.forEach(element => sw.document.body.appendChild(element))
    };
    let configured, rejectFolder = true;
    const setupReady = sw.WarehouseSetup.start(async (name, args) => {
        if (name === 'default_workspace_path') return 'C:\\Example\\Warehouse';
        if (name === 'choose_workspace_folder') return null;
        if (name === 'configure_workspace') { if (rejectFolder) throw new Error('Folder is not writable'); configured = args; }
    }, ui);
    await tick();
    const selects = sw.document.querySelectorAll('select');
    const folder = sw.document.querySelector('input');
    assert.strictEqual(folder.value, 'C:\\Example\\Warehouse');
    const buttons = sw.document.querySelectorAll('button');
    await buttons[0].onclick(); assert.strictEqual(folder.value, 'C:\\Example\\Warehouse');
    selects[1].value = 'open';
    await buttons[1].onclick();
    assert.strictEqual(buttons[1].disabled, false);
    assert.ok(sw.document.body.textContent.includes('Folder is not writable'));
    selects[0].value = 'join'; selects[0].onchange();
    assert.strictEqual(selects[1].hidden, true);
    selects[0].value = 'local'; selects[0].onchange();
    assert.strictEqual(selects[1].hidden, false);
    rejectFolder = false; await buttons[1].onclick(); await setupReady;
    assert.strictEqual(configured.accountMode, 'open');
    assert.strictEqual(configured.intent, 'create');
    setupPage.window.close();

    const page = dom(), w = page.window;
    const profile = JSON.parse(fs.readFileSync('src/profiles/generic.json', 'utf8'));
    w.fetch = async () => ({ ok: true, json: async () => profile });
    for (const file of ['profile.js', 'app/mappings.js', 'app/profile-manager.js', 'app/onboarding.js', 'app/import-assistant.js']) w.eval(source(file));
    await w.WarehouseProfileReady;
    const saved = [];
    w.MachineConfig = { set: async (key, value) => saved.push({ key, value }) };
    w.WarehouseOnboarding.startWizard();
    w.document.querySelector('[data-name]').value = 'Cold Store';
    w.document.querySelector('[data-categories]').value = 'Ambient, Frozen';
    await w.document.querySelector('[data-save]').onclick();
    assert.strictEqual(w.WarehouseProfile.profile.name, 'Cold Store');
    assert.strictEqual(w.WarehouseProfile.profile.categories.length, 2);
    assert.ok(w.document.getElementById('warehouseImportAssistant'));
    assert.ok(!w.document.getElementById('warehouseOnboardingWizard'));

    const html = source('index.html');
    w.eval(html.slice(html.indexOf('        function parseDataset('), html.indexOf('        function processAllData(')));
    Object.assign(w, {
        profileCategoryId: value => w.WarehouseProfile.categoryId(value),
        profileCategoryIds: () => w.WarehouseProfile.categoryIds(),
        profileCategoryDisplay: value => w.WarehouseProfile.categoryDisplay(value),
        isProfileSpecialLocation: value => w.WarehouseProfile.isSpecialLocation(value),
        hasProfileClassifier: () => false, isLCD: () => false, isContaminated: () => false, buildRowSearchText: () => ''
    });
    let generated = 0; w.processAllData = () => generated++;
    w.document.querySelector('[data-sample]').click();
    w.document.querySelector('[data-next]').click();
    await w.document.querySelector('[data-preview-button]').onclick();
    assert.strictEqual(w.document.querySelector('[data-apply]').disabled, false);
    assert.ok(w.document.querySelector('[data-preview]').textContent.includes('1 bins · 1 pallets'));
    assert.strictEqual(w.document.getElementById('rawDataInput').value, '');
    await w.document.querySelector('[data-apply]').onclick();
    assert.strictEqual(generated, 1);
    assert.ok(w.document.getElementById('rawDataInput').value.includes('A-01'));
    assert.ok(!w.document.getElementById('warehouseImportAssistant'));

    // Optional fields are explicitly blank rather than reading unrelated columns.
    const minimal = JSON.parse(JSON.stringify(w.WarehouseProfile.profile));
    minimal.dataMappings.detail = { partNumber: 'SKU', category: 'Type', quantity: 'Qty', bin: 'Bin', description: null, batch: null, handlingUnit: null };
    w.WarehouseProfile.validate(minimal);
    const item = w.WarehouseApp.mapDetailRow(['X', 'AMBIENT', '2', 'A-01'], ['SKU', 'Type', 'Qty', 'Bin'], minimal.dataMappings.detail);
    assert.strictEqual(item.description, ''); assert.strictEqual(item.batch, ''); assert.strictEqual(item.handlingUnit, '');
    minimal.dataMappings.detail.quantity = null;
    assert.throws(() => w.WarehouseProfile.validate(minimal), /quantity/);
    w.WarehouseAccess = { canEdit: false };
    await assert.rejects(w.ProfileManager.activate(profile, w.WarehouseProfile), /editor or administrator/);
    w.WarehouseImportAssistant.open(); assert.ok(!w.document.getElementById('warehouseImportAssistant'));
    page.window.close();
    console.log('setup, account-free boot, protection and import UI tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
