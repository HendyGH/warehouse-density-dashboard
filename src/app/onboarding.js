(function (global) {
    'use strict';
    function slug(value) {
        return String(value || 'general').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
    }
    function createDraft(options) {
        const opts = options || {};
        const categories = Array.isArray(opts.categories) && opts.categories.length ? opts.categories : [{ id: 'general', label: 'GENERAL', aliases: ['GENERAL'] }];
        const id = slug(opts.id || opts.name || 'warehouse');
        return {
            schemaVersion: 1,
            id,
            name: String(opts.name || 'New Warehouse').trim(),
            unknownCategoryPolicy: opts.unknownCategoryPolicy || 'preserve',
            categories: categories.map((category, index) => ({
                id: slug(category.id || category.label || `category-${index + 1}`),
                label: String(category.label || category.id || `CATEGORY ${index + 1}`).trim().toUpperCase(),
                display: String(category.display || category.label || category.id || `Category ${index + 1}`).trim(),
                aliases: Array.isArray(category.aliases) ? category.aliases.slice() : []
            })),
            snapshotCategories: Array.isArray(opts.snapshotCategories) ? opts.snapshotCategories.slice() : categories.slice(0, 4).map(category => slug(category.id || category.label)),
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
        const modal = doc.createElement('div'); modal.id = 'warehouseOnboardingWizard'; modal.style.cssText = 'position:fixed;inset:0;z-index:2147482001;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px';
        const panel = doc.createElement('div'); panel.style.cssText = 'background:#fff;border-radius:16px;padding:20px;width:520px;max-width:96vw;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:Arial,sans-serif';
        panel.innerHTML = '<h2 style="margin:0 0 6px">Set up this warehouse</h2><p style="margin:0 0 14px;color:#64748b;font-size:13px">Choose a name and categories. The profile is validated before activation.</p><label style="display:block;font-size:12px;font-weight:700">Warehouse name<input data-name style="display:block;width:100%;margin:4px 0 10px;padding:8px;border:1px solid #cbd5e1;border-radius:8px" value="My Warehouse"></label><label style="display:block;font-size:12px;font-weight:700">Categories (comma separated)<input data-categories style="display:block;width:100%;margin:4px 0 10px;padding:8px;border:1px solid #cbd5e1;border-radius:8px" value="GENERAL"></label><div data-status style="min-height:18px;font-size:12px;font-weight:700;margin-bottom:8px"></div><button type="button" data-save style="padding:9px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Activate profile</button>';
        panel.querySelector('[data-save]').onclick = async () => { const name = panel.querySelector('[data-name]').value; const categories = panel.querySelector('[data-categories]').value.split(',').map(label => ({ id: slug(label), label: label.trim().toUpperCase(), aliases: [label.trim().toUpperCase()] })).filter(item => item.id); const draft = createDraft({ name, categories }); const status = panel.querySelector('[data-status]'); try { validateDraft(draft, global.WarehouseProfile); if (global.ProfileManager && global.ProfileManager.activate) await global.ProfileManager.activate(draft, global.WarehouseProfile); if (global.MachineConfig) global.MachineConfig.set('onboardingCompleted', true); status.style.color = '#047857'; status.textContent = 'Profile activated. Reload the dashboard to use it.'; modal.remove(); } catch (error) { status.style.color = '#b91c1c'; status.textContent = error.message; } };
        modal.appendChild(panel); doc.body.appendChild(modal); return modal;
    }
    global.WarehouseOnboarding = { createDraft, validateDraft, startWizard };
})(window);

