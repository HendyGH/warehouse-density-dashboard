const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const electronics = JSON.parse(fs.readFileSync('src/profiles/electronics-demo.json', 'utf8'));
const context = { console, window: {}, fetch: async () => ({ ok: true, json: async () => electronics }) };
for (const file of ['profile.js', 'app/mappings.js', 'app/segregation.js', 'app/zone-detection.js']) {
    vm.runInNewContext(fs.readFileSync(`src/${file}`, 'utf8'), context, { filename: file });
}
// Execute the production parser, with its UI/profile adapters supplied by the harness.
const html = fs.readFileSync('src/index.html', 'utf8');
const start = html.indexOf('        function parseDataset(');
const end = html.indexOf('        function processAllData(', start);
assert.ok(start >= 0 && end > start);
vm.runInNewContext(html.slice(start, end), context);

(async () => {
    const api = await context.window.WarehouseProfileReady;
    const app = context.window.WarehouseApp;
    Object.assign(context, {
        profileCategoryId: value => context.window.WarehouseProfile.categoryId(value),
        profileCategoryIds: () => context.window.WarehouseProfile.categoryIds(),
        profileCategoryDisplay: value => context.window.WarehouseProfile.categoryDisplay(value),
        isProfileSpecialLocation: value => context.window.WarehouseProfile.isSpecialLocation(value),
        hasProfileClassifier: (pn, desc, id) => context.window.WarehouseProfile.matchesClassifier({ pn, desc }, id),
        isLCD: (pn, desc) => context.window.WarehouseProfile.matchesClassifier({ pn, desc }, 'lcd'),
        isContaminated: row => app.getSegregationViolations(context.window.WarehouseProfile, row).length > 0,
        buildRowSearchText: () => ''
    });
    const legacy = context.parseDataset(fs.readFileSync('tests/fixtures/master.tsv', 'utf8'), fs.readFileSync('tests/fixtures/detail.tsv', 'utf8'));
    assert.strictEqual(legacy.totalPallets, 4);
    assert.strictEqual(legacy.totalMasterBins, 4);
    assert.strictEqual(legacy.totalBins, 3);
    assert.strictEqual(legacy.contamBins, 1);
    assert.strictEqual(legacy.detailed.length, 9);
    assert.strictEqual(legacy.grStats.total, 4);
    assert.strictEqual(legacy.warnings.skippedDetailRows, 0);

    const custom = JSON.parse(JSON.stringify(electronics));
    custom.dataMappings.master = { bin: '库位', palletCount: '托盘数', category: '类型', binCategory: '类型' };
    custom.dataMappings.categoryQuantityColumns = {};
    custom.dataMappings.detail = { partNumber: 'SKU', description: '名称', category: '类型', quantity: '数量', batch: '批次', bin: '库位', handlingUnit: '容器' };
    context.window.WarehouseProfile = await api.load(custom);
    const master = '\ufeff备注\t托盘数\t库位\t类型\n\t2\tCOLD-A01\tRAW MATERIAL';
    const header = 'SKU\t名称\t类型\t数量\t批次\t库位\t容器';
    const detail = `${header}\nPN-001\tStorage bin component\tRAW MATERIAL\t7\t\tCOLD-A01\t\n${header}`;
    const result = context.parseDataset(master, detail);
    assert.strictEqual(result.totalMasterBins, 1);
    assert.strictEqual(result.totalPallets, 2);
    assert.strictEqual(result.data[0].bin, 'COLD-A01');
    assert.strictEqual(result.detailed.length, 1);
    assert.strictEqual(result.detailed[0].pn, 'PN-001');
    assert.strictEqual(result.detailed[0].batch, '');
    assert.strictEqual(result.detailed[0].hu, '');
    assert.strictEqual(result.detailByBin['COLD-A01'][0].qty, 7);
    assert.strictEqual(result.warnings.skippedDetailRows, 0);
    assert.strictEqual(result.warnings.missingRequiredMappings.length, 0);

    // Compact and headerless layouts use explicit zero-based indices.
    custom.dataMappings.master = { bin: 0, palletCount: 1, category: 2, binCategory: 2 };
    custom.dataMappings.detail = { partNumber: 0, description: 0, category: 1, quantity: 2, bin: 3, batch: 4, handlingUnit: 4 };
    context.window.WarehouseProfile = await api.load(custom);
    const compact = context.parseDataset('COLD-A01\t3\tRAW MATERIAL', 'PN-002\tRAW MATERIAL\t5\tCOLD-A01\t');
    assert.strictEqual(compact.totalPallets, 3);
    assert.strictEqual(compact.detailed[0].qty, 5);
    const truncated = context.parseDataset('', 'PN-002\tRAW MATERIAL\t5\tCOLD-A01');
    assert.strictEqual(truncated.detailed.length, 0);
    assert.ok(truncated.warnings.missingRequiredMappings.includes('handlingUnit'));
    const emptyBin = context.parseDataset('\t3\tRAW MATERIAL', 'PN-002\tRAW MATERIAL\t5\t\t');
    assert.strictEqual(emptyBin.totalMasterBins, 0);
    assert.strictEqual(emptyBin.detailed.length, 0);
    custom.putaway = { enabled: false, rules: [] };
    custom.classifiers = [
        { id: 'fragile', label: 'Fragile stock', tags: ['high-value'], match: { all: [
            { field: 'category', op: 'equals', value: 'RAW MATERIAL' },
            { field: 'batch', op: 'equals', value: 'VIP' },
            { field: 'hu', op: 'equals', value: 'VIP' },
            { field: 'qty', op: 'equals', value: '5' }
        ] } },
        { id: 'priority', tags: ['high-value'], match: { all: [{ field: 'batch', op: 'equals', value: 'VIP' }] } },
        { id: 'pcba', tags: [], match: { all: [{ field: 'pn', op: 'startsWith', value: 'PN' }] } }
    ];
    context.window.WarehouseProfile = await api.load(custom);
    const classified = context.parseDataset('COLD-A01\t1\tRAW MATERIAL\nCOLD-A02\t1\tRAW MATERIAL', 'PN-001\tRAW MATERIAL\t5\tCOLD-A01\tVIP\nPN-002\tRAW MATERIAL\t3\tCOLD-A02\tREG\nPN-003\tRAW MATERIAL\t5\tGR-ZONE\tVIP');
    assert.strictEqual(classified.data[0].classifierQuantities.fragile, 5);
    assert.strictEqual(classified.data[0].classifierQuantities.priority, 5);
    assert.strictEqual(classified.data[0].highValueQty, 5, 'overlapping classifiers must not double count high-value stock');
    assert.strictEqual(classified.data[1].classifierQuantities.fragile, 0);
    assert.strictEqual(classified.data[1].pcbaQty, 3, 'legacy quantity alias remains available');
    assert.strictEqual(context.window.WarehouseProfile.getHighValueClassifiers(classified.data[1]).length, 0, 'an electronics ID alone must not imply high value');
    assert.strictEqual(classified.grStats.classifierQuantities.fragile, 5);
    assert.strictEqual(classified.grStats.highValueQty, 5);
    const filterStart = html.indexOf('        function getFilteredData(');
    vm.runInNewContext(html.slice(filterStart, html.indexOf('        function ', filterStart + 10)), context);
    context.currentStats = classified;
    context.filterState = { bin: '', zone: 'ALL', highValueOnly: true };
    context.rowMatchesSearch = () => true;
    assert.strictEqual(context.getFilteredData().length, 1);
    assert.strictEqual(context.getFilteredData()[0].bin, 'COLD-A01');
    const badgesStart = html.indexOf('        function classifierBadgeHTML(');
    vm.runInNewContext(html.slice(badgesStart, html.indexOf('        function ', badgesStart + 10)), context);
    Object.assign(context, { escapeHTML: value => String(value), pcbaMapIcon: '', phoneMapIcon: '', lcdMapIcon: '', pcbaIconPurple: '', phoneIconBlue: '', lcdIconCyan: '' });
    assert.ok(context.classifierBadgeHTML(classified.data[0], true).includes('Fragile stock'));
    assert.strictEqual(context.classifierBadgeHTML(classified.data[1]), '');
    const summaryStart = html.indexOf('        function updateFilterResultCount(');
    vm.runInNewContext(html.slice(summaryStart, html.indexOf('        function ', summaryStart + 10)), context);
    const summary = { textContent: '' }; context.qs = () => summary;
    context.updateFilterResultCount(1, 2);
    assert.ok(summary.textContent.includes('Fragile stock 5'));
    assert.ok(summary.textContent.includes('priority 5'));
    assert.ok(!summary.textContent.includes('pcba'));
    console.log('production import integration tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
