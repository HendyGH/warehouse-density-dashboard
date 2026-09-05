(function (global) {
    'use strict';

    function categoryId(profile, value) {
        if (profile && typeof profile.getCategoryId === 'function') return profile.getCategoryId(value);
        return String(value || '').trim().toLowerCase();
    }

    function evaluateSegregation(profile, row, items) {
        const config = profile && profile.profile && profile.profile.segregation;
        if (!config || config.enabled !== true) return [];
        const binCategory = categoryId(profile, row && (row.binCat || row.category));
        const rules = Array.isArray(config.rules) ? config.rules : [];
        const matched = rules.filter(rule => categoryId(profile, rule.binCategory) === binCategory);
        if (!matched.length) return [];
        const quantityFields = config.quantityFields || {};
        const itemRows = Array.isArray(items) ? items : [];
        const observed = [];
        Object.keys(quantityFields).forEach(id => {
            const field = quantityFields[id];
            const quantity = row && row.categoryQuantities && row.categoryQuantities[id] !== undefined
                ? Number(row.categoryQuantities[id]) : Number(row && row[field]);
            if (quantity > 0) observed.push({ category: id, quantity });
        });
        itemRows.forEach(item => {
            const id = categoryId(profile, item && item.category);
            if (id) observed.push({ category: id, quantity: Number(item.qty) || 0 });
        });
        const violations = [];
        matched.forEach(rule => {
            const allowed = new Set((rule.allowedItemCategories || []).map(id => categoryId(profile, id)));
            observed.forEach(item => {
                if (!item.category || item.quantity <= 0 || allowed.has(item.category)) return;
                violations.push({
                    ruleId: rule.id || `${binCategory}-segregation`,
                    binCategory,
                    itemCategory: item.category,
                    severity: rule.severity || 'error',
                    reason: 'category-not-allowed',
                    quantity: item.quantity
                });
            });
        });
        return violations;
    }

    global.WarehouseApp = global.WarehouseApp || {};
    global.WarehouseApp.evaluateSegregation = evaluateSegregation;
    global.WarehouseApp.getSegregationViolations = evaluateSegregation;
})(window);

