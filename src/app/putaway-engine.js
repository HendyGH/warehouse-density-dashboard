(function (global) {
    'use strict';
    const list = value => (Array.isArray(value) ? value : String(value || '').split(',')).map(v => String(v || '').trim()).filter(Boolean);
    const categoryId = (profile, value) => {
        if (value && typeof value === 'object') { if (value.categoryId) return value.categoryId; return categoryId(profile, value.category); }
        if (profile && typeof profile.categoryId === 'function') return profile.categoryId(value) || String(value || '').trim().toLowerCase();
        return String(value || '').trim().toLowerCase();
    };
    function wildcard(pattern, value) { const escaped = String(pattern || '').trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'); return new RegExp(`^${escaped}$`, 'i').test(String(value || '').trim()); }
    function matchesAny(value, patterns) { return list(patterns).some(pattern => wildcard(pattern, value)); }
    function normalizeRule(rule, index) {
        const when = rule && rule.when || {};
        const destination = rule && rule.destination || {};
        return { id: String(rule && rule.id || `rule-${index + 1}`), enabled: rule && rule.enabled !== false, priority: Number.isFinite(Number(rule && rule.priority)) ? Number(rule.priority) : ((index + 1) * 10), highValue: Boolean(rule && rule.highValue), name: String(rule && (rule.name || rule.label) || `Rule ${index + 1}`), classifier: String(rule && (rule.classifier || when.classifier) || ''), categories: list(rule && rule.categories || (when.category ? [when.category] : [])), pnPrefixes: list(rule && rule.pnPrefixes), descriptionKeywords: list(rule && rule.descriptionKeywords), excludeDescriptionKeywords: list(rule && rule.excludeDescriptionKeywords), targetPatterns: list(rule && (rule.targetPatterns || destination.include)), excludePatterns: list(rule && (rule.excludePatterns || destination.exclude)) };
    }
    function rulesFor(profile, settings) {
        if (settings && Array.isArray(settings.rules)) return settings.rules.map(normalizeRule);
        return profile && profile.profile && profile.profile.putaway && Array.isArray(profile.profile.putaway.rules) ? profile.profile.putaway.rules.map(normalizeRule) : [];
    }
    function fallbackFor(profile) {
        const fallback = profile && profile.profile && profile.profile.putaway && profile.profile.putaway.fallbackDestination;
        if (!fallback || !Array.isArray(fallback.include) || !fallback.include.length) return null;
        return { id: 'fallback-profile', enabled: true, priority: Number.MAX_SAFE_INTEGER, highValue: false, name: 'Fallback', categories: [], classifier: '', pnPrefixes: [], descriptionKeywords: [], excludeDescriptionKeywords: [], targetPatterns: fallback.include.slice(), excludePatterns: Array.isArray(fallback.exclude) ? fallback.exclude.slice() : [], isFallback: true };
    }
    function findMatchingRule(items, settings, profile) {
        const rows = Array.isArray(items) ? items : [];
        const categorySet = new Set(rows.map(item => categoryId(profile, item)).filter(Boolean));
        const blockMixed = Boolean((settings && (settings.blockMixedNormalHUs ?? settings.blockMixedHandlingUnits)) ?? (profile && profile.profile && profile.profile.putaway && profile.profile.putaway.blockMixedHandlingUnits));
        const sorted = rulesFor(profile, settings).filter(rule => rule.enabled).slice().sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
        for (const rule of sorted) {
            const excluded = list(rule.excludeDescriptionKeywords).map(v => v.toUpperCase());
            const eligible = rows.filter(item => !excluded.some(word => word && String(item.desc || '').toUpperCase().includes(word)));
            const prefixHit = list(rule.pnPrefixes).some(prefix => eligible.some(item => String(item.pn || '').toUpperCase().startsWith(prefix.toUpperCase())));
            const keywordHit = list(rule.descriptionKeywords).some(keyword => eligible.some(item => String(item.desc || '').toUpperCase().includes(keyword.toUpperCase())));
            const classifierHit = rule.classifier && eligible.some(item => profile && typeof profile.matchesClassifier === 'function' && profile.matchesClassifier({ pn: item.pn, desc: item.desc, category: item.category }, rule.classifier));
            const categories = list(rule.categories).map(value => categoryId(profile, value));
            const mixedBlocked = blockMixed && !rule.highValue && categories.length && categorySet.size > 1;
            const categoryHit = !mixedBlocked && categories.length && Array.from(categorySet).some(id => categories.includes(id));
            if (prefixHit || keywordHit || classifierHit || categoryHit) {
                const evidence = []; if (prefixHit) evidence.push(`PN prefix ${list(rule.pnPrefixes).join('/')}`); if (keywordHit) evidence.push(`description ${list(rule.descriptionKeywords).join('/')}`); if (classifierHit) evidence.push(`classifier ${rule.classifier}`); if (categoryHit) evidence.push(`category ${categories.join('/')}`);
                return { rule, evidence: evidence.join(' + '), categorySet, mixedBlocked: false };
            }
        }
        return { rule: null, evidence: '', categorySet, mixedBlocked: blockMixed && categorySet.size > 1 };
    }
    function binMatches(bin, rule) { return Boolean(rule && list(rule.targetPatterns).length && matchesAny(bin && bin.bin || bin, rule.targetPatterns) && !matchesAny(bin && bin.bin || bin, rule.excludePatterns)); }
    function planPutaway(input) {
        const options = input || {}, profile = options.profile, settings = options.settings || {}, bins = Array.isArray(options.bins) ? options.bins.filter(bin => Number(bin.palletCount) === 0) : [], used = new Set(), suggestions = [];
        const entries = Object.entries(options.itemsByHU || {}).map(([hu, items]) => { const match = findMatchingRule(items, settings, profile); return { hu, items, ...match }; }).sort((a, b) => (a.rule ? a.rule.priority : Number.MAX_SAFE_INTEGER) - (b.rule ? b.rule.priority : Number.MAX_SAFE_INTEGER));
        entries.forEach(entry => { const partNumbers = Array.from(new Set((entry.items || []).map(item => String(item.pn || '')).filter(Boolean))); if (!entry.rule && entry.mixedBlocked) { suggestions.push({ hu: entry.hu, status: 'mixed', suggestedBin: '', rule: null, partNumbers }); return; } const fallback = fallbackFor(profile); const rule = entry.rule || fallback; if (!rule) { suggestions.push({ hu: entry.hu, status: 'no-rule', suggestedBin: '', rule: null, partNumbers }); return; } const candidate = bins.find(bin => !used.has(bin.bin) && binMatches(bin, rule)); if (!candidate) { suggestions.push({ hu: entry.hu, status: 'noslot', suggestedBin: '', rule, partNumbers }); return; } used.add(candidate.bin); suggestions.push({ hu: entry.hu, status: 'assigned', suggestedBin: candidate.bin, rule, partNumbers }); });
        return { suggestions, assigned: suggestions.filter(item => item.status === 'assigned').length, mixedBlocked: suggestions.filter(item => item.status === 'mixed').length, noRule: suggestions.filter(item => item.status === 'no-rule').length, noSlot: suggestions.filter(item => item.status === 'noslot').length };
    }
    global.WarehouseApp = global.WarehouseApp || {};
    Object.assign(global.WarehouseApp, { findMatchingPutawayRule: findMatchingRule, binMatchesPutawayRule: binMatches, planPutaway: planPutaway, fallbackPutawayRule: fallbackFor });
})(window);

