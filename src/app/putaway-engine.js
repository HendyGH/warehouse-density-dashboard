(function (global) {
    'use strict';

    const list = value => (Array.isArray(value) ? value : String(value || '').split(','))
        .map(value => String(value || '').trim())
        .filter(Boolean);

    const categoryId = (profile, value) => {
        if (value && typeof value === 'object') {
            if (value.categoryId) return value.categoryId;
            return categoryId(profile, value.category);
        }
        if (profile && typeof profile.categoryId === 'function') {
            return profile.categoryId(value) || String(value || '').trim().toLowerCase();
        }
        return String(value || '').trim().toLowerCase();
    };

    function wildcard(pattern, value) {
        const escaped = String(pattern || '').trim()
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(`^${escaped}$`, 'i').test(String(value || '').trim());
    }

    function matchesAny(value, patterns) {
        return list(patterns).some(pattern => wildcard(pattern, value));
    }

    function normalizeRule(rule, index) {
        const when = rule && rule.when || {};
        const destination = rule && rule.destination || {};
        return {
            id: String(rule && rule.id || `rule-${index + 1}`),
            enabled: rule && rule.enabled !== false,
            priority: Number.isFinite(Number(rule && rule.priority)) ? Number(rule.priority) : ((index + 1) * 10),
            highValue: Boolean(rule && rule.highValue),
            name: String(rule && (rule.name || rule.label) || `Rule ${index + 1}`),
            classifier: String(rule && (rule.classifier || when.classifier) || ''),
            categories: list(rule && rule.categories || (when.category ? [when.category] : [])),
            pnPrefixes: list(rule && rule.pnPrefixes),
            descriptionKeywords: list(rule && rule.descriptionKeywords),
            excludeDescriptionKeywords: list(rule && rule.excludeDescriptionKeywords),
            targetPatterns: list(rule && (rule.targetPatterns || destination.include)),
            excludePatterns: list(rule && (rule.excludePatterns || destination.exclude))
        };
    }

    function rulesFor(profile, settings) {
        if (settings && Array.isArray(settings.rules)) return settings.rules.map(normalizeRule);
        return profile && profile.profile && profile.profile.putaway && Array.isArray(profile.profile.putaway.rules)
            ? profile.profile.putaway.rules.map(normalizeRule)
            : [];
    }

    function fallbackFor(profile) {
        const fallback = profile && profile.profile && profile.profile.putaway && profile.profile.putaway.fallbackDestination;
        if (!fallback || !Array.isArray(fallback.include) || !fallback.include.length) return null;
        return {
            id: 'fallback-profile', enabled: true, priority: Number.MAX_SAFE_INTEGER,
            highValue: false, name: 'Fallback', categories: [], classifier: '', pnPrefixes: [],
            descriptionKeywords: [], excludeDescriptionKeywords: [],
            targetPatterns: fallback.include.slice(),
            excludePatterns: Array.isArray(fallback.exclude) ? fallback.exclude.slice() : [],
            isFallback: true
        };
    }

    function findMatchingRule(items, settings, profile) {
        const rows = Array.isArray(items) ? items : [];
        const categorySet = new Set(rows.map(item => categoryId(profile, item)).filter(Boolean));
        const blockMixed = Boolean(
            (settings && (settings.blockMixedNormalHUs ?? settings.blockMixedHandlingUnits)) ??
            (profile && profile.profile && profile.profile.putaway && profile.profile.putaway.blockMixedHandlingUnits)
        );
        const sorted = rulesFor(profile, settings)
            .filter(rule => rule.enabled)
            .slice()
            .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

        for (const rule of sorted) {
            const excluded = list(rule.excludeDescriptionKeywords).map(value => value.toUpperCase());
            const eligible = rows.filter(item => !excluded.some(word => word && String(item.desc || '').toUpperCase().includes(word)));
            const prefixHit = list(rule.pnPrefixes).some(prefix => eligible.some(item => String(item.pn || '').toUpperCase().startsWith(prefix.toUpperCase())));
            const keywordHit = list(rule.descriptionKeywords).some(keyword => eligible.some(item => String(item.desc || '').toUpperCase().includes(keyword.toUpperCase())));
            const classifierHit = rule.classifier && eligible.some(item => profile && typeof profile.matchesClassifier === 'function' && profile.matchesClassifier({ pn: item.pn, desc: item.desc, category: item.category }, rule.classifier));
            const categories = list(rule.categories).map(value => categoryId(profile, value));
            const mixedBlocked = blockMixed && !rule.highValue && categories.length > 0 && categorySet.size > 1;
            const categoryHit = !mixedBlocked && categories.length > 0 && Array.from(categorySet).some(id => categories.includes(id));
            if (prefixHit || keywordHit || classifierHit || categoryHit) {
                const evidence = [];
                if (prefixHit) evidence.push(`PN prefix ${list(rule.pnPrefixes).join('/')}`);
                if (keywordHit) evidence.push(`description ${list(rule.descriptionKeywords).join('/')}`);
                if (classifierHit) evidence.push(`classifier ${rule.classifier}`);
                if (categoryHit) evidence.push(`category ${categories.join('/')}`);
                return { rule, evidence: evidence.join(' + '), categorySet, mixedBlocked: false };
            }
        }
        return { rule: null, evidence: '', categorySet, mixedBlocked: blockMixed && categorySet.size > 1 };
    }

    function binMatches(bin, rule) {
        const name = bin && typeof bin === 'object' ? bin.bin : bin;
        return Boolean(rule && list(rule.targetPatterns).length && matchesAny(name, rule.targetPatterns) && !matchesAny(name, rule.excludePatterns));
    }

    function targetZone(rule) {
        const pattern = list(rule && rule.targetPatterns)[0];
        const firstSegment = String(pattern || '').trim().split('-')[0];
        return firstSegment.replace(/[?*].*$/, '') || 'Unknown';
    }

    function makeSuggestion(entry, rule, candidate, status, extra) {
        const categories = Array.from(entry.categorySet || []).sort();
        const partNumbers = Array.from(new Set((entry.items || []).map(item => String(item.pn || '')).filter(Boolean)));
        const usedFallback = Boolean(rule && rule.isFallback);
        const zone = candidate && candidate.zone ? String(candidate.zone) : (rule ? targetZone(rule) : '');
        return Object.assign({
            hu: entry.hu,
            items: entry.items || [],
            partNumbers,
            categories,
            rule: rule || null,
            ruleId: rule ? rule.id : '',
            ruleName: rule ? rule.name : '',
            highValue: Boolean(rule && rule.highValue),
            suggestedBin: candidate ? candidate.bin : '',
            zone,
            status,
            statusLabel: status === 'assigned' ? (usedFallback ? 'Assigned (fallback)' : 'Assigned') : status === 'noslot' ? 'No empty bin' : status === 'mixed' ? 'Mixed blocked' : 'Manual review',
            isFallback: usedFallback
        }, extra || {});
    }

    function planPutaway(input) {
        const options = input || {};
        const profile = options.profile;
        const settings = options.settings || {};
        const bins = Array.isArray(options.bins)
            ? options.bins.filter(bin => Number(bin.palletCount) === 0)
            : [];
        const used = new Set();
        const fallback = fallbackFor(profile);
        const suggestions = [];
        const entries = Object.entries(options.itemsByHU || {})
            .map(([hu, items]) => {
                const match = findMatchingRule(items, settings, profile);
                return { hu, items: Array.isArray(items) ? items : [], ...match };
            })
            .sort((a, b) => (a.rule ? a.rule.priority : Number.MAX_SAFE_INTEGER) - (b.rule ? b.rule.priority : Number.MAX_SAFE_INTEGER) || String(a.hu).localeCompare(String(b.hu), undefined, { numeric: true, sensitivity: 'base' }));

        entries.forEach(entry => {
            if (!entry.rule && entry.mixedBlocked) {
                suggestions.push(makeSuggestion(entry, null, null, 'mixed', {
                    reason: 'Mixed-category HU is blocked from normal category rules. Add a high-value/specific rule or disable the mixed block.'
                }));
                return;
            }
            const rule = entry.rule || fallback;
            if (!rule) {
                suggestions.push(makeSuggestion(entry, null, null, 'no-rule', {
                    reason: 'No enabled putaway rule or profile fallback matched this handling unit.'
                }));
                return;
            }
            const candidate = bins.find(bin => !used.has(bin.bin) && binMatches(bin, rule));
            if (!candidate) {
                suggestions.push(makeSuggestion(entry, rule, null, 'noslot', {
                    reason: entry.rule
                        ? `Matched ${rule.name}${entry.evidence ? ` (${entry.evidence})` : ''}, but no empty bin matched ${rule.targetPatterns.join(', ')}${rule.excludePatterns.length ? ` excluding ${rule.excludePatterns.join(', ')}` : ''}.`
                        : `No specific rule matched; routed to the profile fallback, but no empty bin matched ${rule.targetPatterns.join(', ')}.`
                }));
                return;
            }
            used.add(candidate.bin);
            suggestions.push(makeSuggestion(entry, rule, candidate, 'assigned', {
                reason: entry.rule
                    ? `Matched ${rule.name}${entry.evidence ? ` by ${entry.evidence}` : ''}.`
                    : `No specific rule matched; routed to the profile fallback (bin ${candidate.bin}).`
            }));
        });

        return {
            suggestions,
            assigned: suggestions.filter(item => item.status === 'assigned').length,
            mixedBlocked: suggestions.filter(item => item.status === 'mixed').length,
            noRule: suggestions.filter(item => item.status === 'no-rule').length,
            noSlot: suggestions.filter(item => item.status === 'noslot').length,
            fallbackCount: suggestions.filter(item => item.isFallback).length,
            fallbackAssignedCount: suggestions.filter(item => item.isFallback && item.status === 'assigned').length
        };
    }

    global.WarehouseApp = global.WarehouseApp || {};
    Object.assign(global.WarehouseApp, {
        findMatchingPutawayRule: findMatchingRule,
        binMatchesPutawayRule: binMatches,
        planPutaway,
        fallbackPutawayRule: fallbackFor
    });
})(window);

