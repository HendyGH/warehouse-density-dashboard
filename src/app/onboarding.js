(function (global) {
    'use strict';
    function slug(value) {
        const normalized = String(value || '').normalize('NFC').trim().toLowerCase();
        return normalized.replace(/[^\p{L}\p{N}\p{M}_-]+/gu, '-').replace(/^-+|-+$/g, '') ||
            (normalized ? 'u-' + Array.from(normalized, c => c.codePointAt(0).toString(16)).join('-') : 'general');
    }
    function createDraft(options) {
        const opts = options || {};
        const categories = Array.isArray(opts.categories) && opts.categories.length ? opts.categories : [{ id: 'general', label: 'GENERAL', aliases: ['GENERAL'] }];
        const id = slug(opts.id || opts.name || 'warehouse');
        const normalizedCategories = categories.map((category, index) => ({
                id: slug(category.id || category.label || `category-${index + 1}`),
                label: String(category.label || category.id || `CATEGORY ${index + 1}`).trim().toUpperCase(),
                display: String(category.display || category.label || category.id || `Category ${index + 1}`).trim(),
                aliases: Array.isArray(category.aliases) ? category.aliases.slice() : []
            }));
        return {
            schemaVersion: 1,
            id,
            name: String(opts.name || 'New Warehouse').trim(),
            unknownCategoryPolicy: opts.unknownCategoryPolicy || 'preserve',
            categories: normalizedCategories,
            snapshotCategories: Array.isArray(opts.snapshotCategories) ? opts.snapshotCategories.slice() : normalizedCategories.slice(0, 4).map(category => category.id),
            classifiers: Array.isArray(opts.classifiers) ? opts.classifiers.slice() : [],
            specialLocations: Array.isArray(opts.specialLocations) ? opts.specialLocations.slice() : [],
            segregation: { enabled: false, rules: [] },
            modules: Object.assign({ density: true, snapshots: true, segregation: false, putaway: false }, opts.modules || {})
        };
    }
    function validateDraft(draft, profileApi) {
        if (!profileApi || typeof profileApi.validate !== 'function') throw new Error('Warehouse profile validator is unavailable.');
        return profileApi.validate(draft);
    }
    function startWizard(options) {
        const doc = (options && options.document) || global.document;
        if (!doc || !doc.body) return null;
        const existing = doc.getElementById('warehouseOnboardingWizard'); if (existing) return existing;
        const modal = doc.createElement('div'); modal.id = 'warehouseOnboardingWizard'; modal.className = 'warehouse-dialog';
        modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Set up your warehouse');
        const panel = doc.createElement('div'); panel.className = 'warehouse-panel';
        panel.innerHTML = '<img src="assets/warehouse-icon.png" width="64" height="64" alt=""><p class="warehouse-eyebrow">STEP 2 OF 3</p><h2>Make it your warehouse</h2><p>Start with a template. You can adjust rules and modules later.</p><label>Warehouse name<input data-name value="My Warehouse" maxlength="100"></label><label>Template<select data-template><option value="generic">General warehouse</option><option value="electronics-demo">Electronics warehouse</option></select></label><label data-category-label>Categories (comma separated)<input data-categories value="GENERAL"></label><p data-template-note>Use your own product groups, such as Ambient, Chilled, Frozen, or Returns.</p><div data-status role="status"></div><button type="button" data-save class="warehouse-primary">Save and continue</button>';
        const template = panel.querySelector('[data-template]');
        template.onchange = () => {
            panel.querySelector('[data-category-label]').hidden = template.value !== 'generic';
            panel.querySelector('[data-template-note]').textContent = template.value === 'generic' ? 'Use your own product groups, such as Ambient, Chilled, Frozen, or Returns.' : 'Includes raw material, battery and packing categories, receiving, and electronics putaway rules.';
        };
        panel.querySelector('[data-save]').onclick = async () => {
            const status = panel.querySelector('[data-status]'), save = panel.querySelector('[data-save]');
            save.disabled = true; status.textContent = '';
            try {
                const name = panel.querySelector('[data-name]').value.trim();
                if (!name) throw new Error('Enter a warehouse name.');
                let draft;
                if (template.value === 'electronics-demo') {
                    const example = await global.WarehouseProfile.load('./profiles/electronics-demo.json');
                    draft = JSON.parse(JSON.stringify(example.profile)); draft.name = name;
                } else {
                    const categories = panel.querySelector('[data-categories]').value.split(',').map(value => value.trim()).filter(Boolean)
                        .map(label => ({ id: slug(label), label, aliases: [] }));
                    if (!categories.length) throw new Error('Add at least one category.');
                    draft = createDraft({ name, categories });
                }
                validateDraft(draft, global.WarehouseProfile);
                await global.ProfileManager.activate(draft, global.WarehouseProfile);
                if (global.MachineConfig) await global.MachineConfig.set('onboardingCompleted', true);
                if (global.configureWarehouseProfile) global.configureWarehouseProfile(global.WarehouseProfile);
                modal.remove();
                if (global.WarehouseImportAssistant) global.WarehouseImportAssistant.open();
            } catch (error) { status.textContent = error.message; save.disabled = false; }
        };
        modal.appendChild(panel); doc.body.appendChild(modal); panel.querySelector('[data-name]').focus(); return modal;
    }
    global.WarehouseOnboarding = { createDraft, validateDraft, startWizard };
})(window);

