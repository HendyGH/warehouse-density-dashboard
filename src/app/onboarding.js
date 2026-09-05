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
    global.WarehouseOnboarding = { createDraft, validateDraft };
})(window);

