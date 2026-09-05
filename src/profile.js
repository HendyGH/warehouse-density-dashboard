(function (global) {
    'use strict';

    const DEFAULT_PROFILE_PATH = './profiles/electronics-demo.json';
    const SUPPORTED_FIELDS = new Set(['pn', 'desc', 'category', 'batch', 'bin', 'hu', 'qty', 'text']);
    const SUPPORTED_OPERATORS = new Set(['startsWith', 'endsWith', 'equals', 'contains', 'regex']);
    const text = value => String(value == null ? '' : value).trim();
    const upper = value => text(value).toUpperCase();

    function fail(message, details) {
        const suffix = details && details.length ? `\n- ${details.join('\n- ')}` : '';
        throw new Error(`Warehouse profile validation failed: ${message}${suffix}`);
    }

    function conditionText(item, field) {
        if (!item || typeof item !== 'object') return '';
        if (field === 'text') return Object.values(item).filter(v => typeof v !== 'object').join(' ');
        return item[field] == null ? '' : text(item[field]);
    }

    function conditionMatches(item, condition) {
        if (!condition || typeof condition !== 'object') return false;
        const value = conditionText(item, condition.field || 'text');
        const expected = condition.value == null ? condition.pattern : condition.value;
        const op = condition.op || 'contains';
        if (op === 'startsWith') return upper(value).startsWith(upper(expected));
        if (op === 'endsWith') return upper(value).endsWith(upper(expected));
        if (op === 'equals') return upper(value) === upper(expected);
        if (op === 'contains') return upper(value).includes(upper(expected));
        if (op === 'regex') {
            try { return new RegExp(String(expected), condition.flags || 'i').test(value); }
            catch (error) { return false; }
        }
        return false;
    }

    function matchExpression(item, expression) {
        if (!expression || typeof expression !== 'object') return false;
        const any = Array.isArray(expression.any) ? expression.any : [];
        const all = Array.isArray(expression.all) ? expression.all : [];
        const exclude = Array.isArray(expression.exclude) ? expression.exclude : [];
        if (exclude.some(condition => conditionMatches(item, condition))) return false;
        if (all.length && !all.every(condition => conditionMatches(item, condition))) return false;
        if (any.length && !any.some(condition => conditionMatches(item, condition))) return false;
        return true;
    }

    function validateUniqueNames(entries, scope, errors) {
        const names = new Map();
        (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
            if (!entry || typeof entry !== 'object') return;
            const candidates = [{ kind: 'id', value: entry.id }, { kind: 'label', value: entry.label }]
                .concat((Array.isArray(entry.aliases) ? entry.aliases : []).map(value => ({ kind: 'alias', value })));
            candidates.forEach(candidate => {
                const token = upper(candidate.value);
                if (!token) return;
                const prior = names.get(token);
                if (prior && prior.id !== entry.id) {
                    const collisionType = prior.kind === 'alias' || candidate.kind === 'alias' ? 'alias collision' : 'identifier collision';
                    errors.push(`${scope} ${collisionType}: "${token}" is used by ${prior.id} and ${entry.id || `${scope}[${index}]`}`);
                } else if (!prior) {
                    names.set(token, { id: entry.id || `${scope}[${index}]`, kind: candidate.kind });
                }
            });
        });
    }

    function validate(profile) {
        if (!profile || typeof profile !== 'object') fail('profile must be an object');
        if (profile.schemaVersion !== 1) fail('schemaVersion must be 1');
        if (!text(profile.id)) fail('id is required');
        if (!Array.isArray(profile.categories) || !profile.categories.length) fail('categories must be a non-empty array');
        const errors = [];
        const categoryIds = new Set();
        profile.categories.forEach((category, index) => {
            if (!category || !text(category.id)) errors.push(`categories[${index}].id is required`);
            else if (categoryIds.has(upper(category.id))) errors.push(`duplicate category id: ${category.id}`);
            else categoryIds.add(upper(category.id));
            if (!text(category && category.label)) errors.push(`categories[${index}].label is required`);
            if (!Array.isArray(category && category.aliases)) errors.push(`categories[${index}].aliases must be an array`);
        });
        validateUniqueNames(profile.categories, 'category', errors);
        const classifierIds = new Set();
        if (!Array.isArray(profile.classifiers)) errors.push('classifiers must be an array');
        (profile.classifiers || []).forEach((classifier, index) => {
            if (!classifier || !text(classifier.id)) errors.push(`classifiers[${index}].id is required`);
            else if (classifierIds.has(upper(classifier.id))) errors.push(`duplicate classifier id: ${classifier.id}`);
            else classifierIds.add(upper(classifier.id));
            if (!classifier || !classifier.match || typeof classifier.match !== 'object') errors.push(`classifiers[${index}].match is required`);
            else {
                ['any', 'all', 'exclude'].forEach(kind => {
                    const conditions = classifier.match[kind];
                    if (conditions != null && !Array.isArray(conditions)) errors.push(`classifiers[${index}].match.${kind} must be an array`);
                    (Array.isArray(conditions) ? conditions : []).forEach((condition, conditionIndex) => {
                        const prefix = `classifiers[${index}].match.${kind}[${conditionIndex}]`;
                        const op = condition && condition.op ? condition.op : 'contains';
                        const expected = condition && (condition.value != null ? condition.value : condition.pattern);
                        if (!condition || typeof condition !== 'object' || !text(condition.field)) errors.push(`${prefix}.field is required`);
                        if (condition && condition.field && !SUPPORTED_FIELDS.has(condition.field)) errors.push(`${prefix}.field is unsupported: ${condition.field}`);
                        if (!SUPPORTED_OPERATORS.has(op)) errors.push(`${prefix}.op is unsupported`);
                        if (expected == null || !text(expected)) errors.push(`${prefix}.value is required`);
                        if (op === 'regex' && expected != null) {
                            try { new RegExp(String(expected), condition.flags || 'i'); }
                            catch (error) { errors.push(`${prefix}.regex is invalid: ${error.message}`); }
                        }
                    });
                });
            }
            if (classifier && !Array.isArray(classifier.tags)) errors.push(`classifiers[${index}].tags must be an array`);
        });
        if (!Array.isArray(profile.specialLocations)) errors.push('specialLocations must be an array');
        const locationIds = new Set();
        (profile.specialLocations || []).forEach((location, index) => {
            if (!location || !text(location.id)) errors.push(`specialLocations[${index}].id is required`);
            else if (locationIds.has(upper(location.id))) errors.push(`duplicate special location id: ${location.id}`);
            else locationIds.add(upper(location.id));
            if (!location || !text(location.label)) errors.push(`specialLocations[${index}].label is required`);
            if (location && !Array.isArray(location.aliases)) errors.push(`specialLocations[${index}].aliases must be an array`);
            if (location && location.match != null) {
                const match = location.match;
                const op = match && match.op ? match.op : 'equals';
                const expected = match && (match.value != null ? match.value : match.pattern);
                if (!match || typeof match !== 'object' || !SUPPORTED_OPERATORS.has(op)) errors.push(`specialLocations[${index}].match.op is unsupported`);
                if (expected == null || !text(expected)) errors.push(`specialLocations[${index}].match.value is required`);
                if (op === 'regex' && expected != null) {
                    try { new RegExp(String(expected), match.flags || 'i'); }
                    catch (error) { errors.push(`specialLocations[${index}].match.regex is invalid: ${error.message}`); }
                }
            }
        });
        validateUniqueNames(profile.specialLocations, 'special location', errors);
        const knownIds = new Set((profile.categories || []).map(category => category && category.id));
        if (profile.snapshotCategories != null) {
            if (!Array.isArray(profile.snapshotCategories)) errors.push('snapshotCategories must be an array');
            else profile.snapshotCategories.forEach(id => { if (!knownIds.has(id)) errors.push(`snapshot category is unknown: ${id}`); });
        }
        if (profile.unknownCategoryPolicy != null && !['preserve', 'reject', 'map-to-default'].includes(profile.unknownCategoryPolicy)) {
            errors.push(`unknownCategoryPolicy is unsupported: ${profile.unknownCategoryPolicy}`);
        }
        if (profile.zoneDetection != null) {
            const zone = profile.zoneDetection;
            if (!zone || !['delimiter', 'regex'].includes(zone.mode)) errors.push('zoneDetection.mode is unsupported');
            if (zone && zone.mode === 'delimiter' && !text(zone.delimiter)) errors.push('zoneDetection.delimiter is required');
            if (zone && zone.mode === 'regex') {
                if (!text(zone.pattern)) errors.push('zoneDetection.pattern is required');
                else {
                    try { new RegExp(zone.pattern, zone.flags || 'i'); }
                    catch (error) { errors.push(`zoneDetection.regex is invalid: ${error.message}`); }
                }
            }
        }
        if (errors.length) fail('invalid schema', errors);
        return profile;
    }

    function category(profile, value) {
        const needle = upper(value);
        return (profile.categories || []).find(item => upper(item.id) === needle || upper(item.label) === needle || (item.aliases || []).some(alias => upper(alias) === needle));
    }

    function specialLocation(profile, value, id) {
        const needle = upper(value);
        const requestedId = id ? upper(id) : '';
        return (profile.specialLocations || []).find(item => {
            if (requestedId && upper(item.id) !== requestedId) return false;
            if (upper(item.id) === needle || upper(item.label) === needle || (item.aliases || []).some(alias => upper(alias) === needle)) return true;
            const match = item.match;
            if (!match || typeof match !== 'object') return false;
            const op = match.op || 'equals';
            if (!SUPPORTED_OPERATORS.has(op)) return false;
            const expected = match.value == null ? match.pattern : match.value;
            if (op === 'startsWith') return needle.startsWith(upper(expected));
            if (op === 'endsWith') return needle.endsWith(upper(expected));
            if (op === 'contains') return needle.includes(upper(expected));
            if (op === 'equals') return needle === upper(expected);
            try { return new RegExp(String(expected), match.flags || 'i').test(text(value)); }
            catch (error) { return false; }
        });
    }

    function api(profile) {
        return {
            profile,
            validate,
            load,
            getCategoryById(id) { return (profile.categories || []).find(item => upper(item.id) === upper(id)) || null; },
            resolveCategory(value) { return category(profile, value) || null; },
            getCategories() { return (profile.categories || []).slice(); },
            getCategoryIds() { return (profile.categories || []).map(item => item.id); },
            getSnapshotCategories() { return (profile.snapshotCategories || []).map(id => this.getCategoryById(id)).filter(Boolean); },
            getUnknownCategoryPolicy() { return profile.unknownCategoryPolicy || 'preserve'; },
            categoryId(value) { const item = category(profile, value); return item ? item.id : ''; },
            getCategoryId(value) { return this.categoryId(value); },
            categoryLabel(value) { const item = category(profile, value); return item ? item.label : upper(value); },
            getCategoryLabel(value) { return this.categoryLabel(value); },
            categoryDisplay(value) { const item = category(profile, value); return item ? (item.display || item.label) : upper(value); },
            getCategoryDisplay(value) { return this.categoryDisplay(value); },
            categoryIds() { return this.getCategoryIds(); },
            getSpecialLocations() { return (profile.specialLocations || []).slice(); },
            getPrimarySpecialLocation() { return (profile.specialLocations || []).find(item => (item.tags || []).includes('receiving') || (item.tags || []).includes('inbound')) || null; },
            specialLocation(id) { return (profile.specialLocations || []).find(item => upper(item.id) === upper(id)) || null; },
            specialLocationLabel(id) { const item = this.specialLocation(id); return item ? item.label : ''; },
            isSpecialLocation(value, id) { return Boolean(specialLocation(profile, value, id)); },
            matches(item, expression) { return matchExpression(item, expression); },
            classifier(id) { return (profile.classifiers || []).find(item => item.id === id) || null; },
            matchesClassifier(item, id) { const classifier = (profile.classifiers || []).find(entry => entry.id === id); return Boolean(classifier && matchExpression(item, classifier.match)); },
            classify(item) { return (profile.classifiers || []).filter(classifier => matchExpression(item, classifier.match)).map(classifier => ({ id: classifier.id, tags: classifier.tags.slice() })); },
            classifierTags(item) { return this.classify(item).reduce((tags, result) => tags.concat(result.tags), []); },
            snapshotCategoryLabels() { return (profile.snapshotCategories || []).map(id => this.categoryLabel(id)); }
        };
    }

    function showLoadError(error) {
        const message = error && error.message ? error.message : String(error);
        console.error(message);
        const render = () => {
            if (!document.body) return;
            let box = document.getElementById('warehouseProfileError');
            if (!box) {
                box = document.createElement('pre');
                box.id = 'warehouseProfileError';
                box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;margin:0;padding:32px;background:#fff1f2;color:#991b1b;font:600 14px/1.6 monospace;white-space:pre-wrap;overflow:auto';
                document.body.appendChild(box);
            }
            box.textContent = message;
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
    }

    async function load(path) {
        const target = path || DEFAULT_PROFILE_PATH;
        let response;
        try { response = await fetch(target, { cache: 'no-store' }); }
        catch (error) { throw new Error(`Unable to load profile "${target}": ${error.message || error}`); }
        if (!response.ok) throw new Error(`Unable to load profile "${target}" (HTTP ${response.status})`);
        let profile;
        try { profile = await response.json(); }
        catch (error) { throw new Error(`Unable to parse profile "${target}": ${error.message || error}`); }
        return api(validate(profile));
    }

    global.WarehouseProfile = { DEFAULT_PROFILE_PATH, validate, load, matchExpression, conditionMatches };
    global.WarehouseProfileReady = load(global.WAREHOUSE_PROFILE_PATH || DEFAULT_PROFILE_PATH)
        .then(profileApi => { global.WarehouseProfile = profileApi; return profileApi; })
        .catch(error => { showLoadError(error); throw error; });
})(window);

