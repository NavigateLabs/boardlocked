/* Local-fork game rules. No DOM, Firebase, or geography mutations. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Boardlocked = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';
    const VERSION = 8;
    const STARTING_SECTION_POLICY = 'all-viable-sections-by-medium';
    const SKILLS = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
        'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing',
        'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecraft', 'Hunter',
        'Construction', 'Sailing'];
    const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
    const copy = value => JSON.parse(JSON.stringify(value));
    const cleanName = name => String(name).replace(/\{\d+\}/g, '').replace(/^Kill .*? ~/u, 'Kill X ~');
    const taskId = (name, skill, map = {}) => String(map[cleanName(name)] || map[name] ||
        ('bl_manual_' + encodeURIComponent(skill) + '_' + encodeURIComponent(cleanName(name))));
    const displayName = name => String(name).replace(/[~|*]/g, '');
    const stripMarkup = value => String(value || '').replace(/<[^>]*>/g, '').replace(/\u200b/g, '').trim();
    const canonicalItemKey = name => String(name || '').replaceAll('*', '');
    const comparableItemKey = name => canonicalItemKey(name).replaceAll('#', '/').trim().toLowerCase();
    const enablerTaskId = itemKey => 'bl_enabler_item_' + encodeURIComponent(canonicalItemKey(itemKey));
    const enablerItemFromTaskId = id => {
        const prefixes = ['bl_enabler_item_', 'r' + 'l_enabler_item_'];
        const prefix = prefixes.find(value => String(id).startsWith(value));
        if (!prefix) return null;
        try { return decodeURIComponent(String(id).slice(prefix.length)); } catch (_) { return null; }
    };
    // Forward windows are deliberately smaller for dense skills and wider for
    // sparse skills. They were chosen from the level distribution in the task
    // data, so a completion opens a useful set of upgrades without skipping a
    // whole fixed tier.
    const PROGRESSION_WINDOWS = Object.freeze({
        Attack: 10, Strength: 10, Defence: 10, Hitpoints: 25, Ranged: 10, Prayer: 20, Magic: 15,
        Cooking: 15, Woodcutting: 15, Fletching: 10, Fishing: 10, Firemaking: 15, Crafting: 10,
        Smithing: 10, Mining: 10, Herblore: 10, Agility: 20, Thieving: 10, Slayer: 20,
        Farming: 20, Runecraft: 15, Hunter: 10, Construction: 10, Sailing: 20
    });
    const LEGACY_BAND_MINIMUMS = Object.freeze([1, 15, 30, 45, 60, 75, 90]);
    const progressionWindow = skill => PROGRESSION_WINDOWS[skill] || 10;

    function normalizeState(input) {
        if (input && ![1, 2, 3, 4, 5, 6, 7, VERSION].includes(input.version)) throw new Error('Unsupported Boardlocked state version: ' + input.version);
        const state = { version: VERSION, enabled: false, actualLevels: {}, currentVisit: null, travelAnchor: null,
            travelAnchorSections: null,
            visitHistory: [], originOverrides: {}, accessOverrides: {}, adminHistory: [],
            progressionHighWater: {}, progressionInitialized: false, rulePresetInitialized: false,
            rulePresetRevision: 0, acquiredEnablers: {}, enablersInitialized: !input,
            startingSectionPolicy: input ? null : STARTING_SECTION_POLICY,
            initialization: { druidicRitual: !input, varlamore: false, wilderness: false, ocean: false },
            initializationApplied: {}, initializationTaskIds: {}, initializationLevelFloors: {} };
        if (input) {
            if (typeof input.enabled !== 'boolean' || !Array.isArray(input.visitHistory)) throw new Error('Invalid Boardlocked state');
            for (const key of ['currentVisit', 'visitHistory', 'originOverrides', 'accessOverrides', 'adminHistory']) {
                if (input[key] !== undefined) state[key] = copy(input[key]);
            }
            state.enabled = input.enabled;
            state.startingSectionPolicy = input.startingSectionPolicy === STARTING_SECTION_POLICY ? STARTING_SECTION_POLICY : null;
            state.progressionInitialized = input.version >= 4 && input.progressionInitialized === true;
            state.rulePresetInitialized = input.version >= 2 && input.rulePresetInitialized === true;
            state.rulePresetRevision = Number.isInteger(input.rulePresetRevision) && input.rulePresetRevision >= 0 ? input.rulePresetRevision : 0;
            state.enablersInitialized = input.version >= 3 && input.enablersInitialized === true;
            if (input.version >= 6) {
                if (!input.initialization || Array.isArray(input.initialization) || typeof input.initialization !== 'object') {
                    throw new Error('Invalid initialization options');
                }
                for (const key of Object.keys(state.initialization)) {
                    if (typeof input.initialization[key] !== 'boolean') throw new Error('Invalid initialization option: ' + key);
                    state.initialization[key] = input.initialization[key];
                }
                if (input.initializationApplied !== undefined && (!input.initializationApplied || Array.isArray(input.initializationApplied) ||
                    typeof input.initializationApplied !== 'object')) throw new Error('Invalid initialization completion records');
                for (const [key, applied] of Object.entries(input.initializationApplied || {})) {
                    if (!own(state.initialization, key) || applied !== true) throw new Error('Invalid initialization completion record: ' + key);
                    state.initializationApplied[key] = true;
                }
                if (input.initializationTaskIds !== undefined && (!input.initializationTaskIds ||
                    Array.isArray(input.initializationTaskIds) || typeof input.initializationTaskIds !== 'object')) {
                    throw new Error('Invalid initialization task records');
                }
                for (const [key, taskIds] of Object.entries(input.initializationTaskIds || {})) {
                    if (!own(state.initialization, key) || !Array.isArray(taskIds) || taskIds.some(id => typeof id !== 'string')) {
                        throw new Error('Invalid initialization task record: ' + key);
                    }
                    state.initializationTaskIds[key] = [...new Set(taskIds)];
                }
                if (input.initializationLevelFloors !== undefined && (!input.initializationLevelFloors ||
                    Array.isArray(input.initializationLevelFloors) || typeof input.initializationLevelFloors !== 'object')) {
                    throw new Error('Invalid initialization level records');
                }
                for (const [skill, record] of Object.entries(input.initializationLevelFloors || {})) {
                    if (!SKILLS.includes(skill) || !record || !own(state.initialization, record.option) ||
                        !Number.isInteger(record.previous) || record.previous < 1 || record.previous > 99 ||
                        !Number.isInteger(record.floor) || record.floor < 1 || record.floor > 99) {
                        throw new Error('Invalid initialization level record: ' + skill);
                    }
                    state.initializationLevelFloors[skill] = copy(record);
                }
            }
            if (input.travelAnchor != null) {
                const anchor = parseLocation(input.travelAnchor);
                if (!anchor) throw new Error('Invalid travel anchor');
                state.travelAnchor = anchor.chunkId;
            }
            if (input.version >= 7 && input.travelAnchorSections != null) {
                if (!Array.isArray(input.travelAnchorSections) || input.travelAnchorSections.some(section => !/^W?\d+$/.test(String(section)))) {
                    throw new Error('Invalid travel anchor sections');
                }
                state.travelAnchorSections = [...new Set(input.travelAnchorSections.map(String))];
            }
            if (input.version >= 3 && input.acquiredEnablers !== undefined) {
                if (!input.acquiredEnablers || Array.isArray(input.acquiredEnablers) || typeof input.acquiredEnablers !== 'object') {
                    throw new Error('Invalid acquiredEnablers');
                }
                for (const [itemKey, acquisition] of Object.entries(input.acquiredEnablers)) {
                    if (!itemKey || (acquisition !== true && (!acquisition || Array.isArray(acquisition) || typeof acquisition !== 'object'))) {
                        throw new Error('Invalid acquired enabler record');
                    }
                    state.acquiredEnablers[canonicalItemKey(itemKey)] = acquisition === true ? { imported: true } : copy(acquisition);
                }
            }
        }
        for (const skill of SKILLS) {
            const n = input?.actualLevels?.[skill] ?? (skill === 'Hitpoints' ? 10 : 1);
            if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error('Invalid current level for ' + skill);
            state.actualLevels[skill] = n;
            const highWater = input?.version >= 4 ? input.progressionHighWater?.[skill] ?? 0 : 0;
            if (!Number.isInteger(highWater) || highWater < 0 || highWater > 99) throw new Error('Invalid progression high-water mark for ' + skill);
            state.progressionHighWater[skill] = highWater;
        }
        if (input && input.version < VERSION && input.progressionFrontiers) {
            state.legacyProgressionFrontiers = {};
            for (const skill of SKILLS) {
                const tier = input.progressionFrontiers[skill] ?? 0;
                if (!Number.isInteger(tier) || tier < 0 || tier > LEGACY_BAND_MINIMUMS.length) throw new Error('Invalid legacy progression frontier for ' + skill);
                state.legacyProgressionFrontiers[skill] = tier;
            }
        }
        for (const key of ['originOverrides', 'accessOverrides']) {
            if (!state[key] || Array.isArray(state[key]) || typeof state[key] !== 'object') throw new Error('Invalid ' + key);
        }
        for (const origins of Object.values(state.originOverrides)) {
            if (!Array.isArray(origins)) throw new Error('Origin overrides must be arrays');
            origins.forEach(origin => { if (!parseLocation(origin)) throw new Error('Invalid origin location'); });
        }
        for (const val of Object.values(state.accessOverrides)) if (typeof val !== 'boolean') throw new Error('Access overrides must be true or false');
        if (!Array.isArray(state.adminHistory)) throw new Error('Invalid administrative journal');
        for (const visit of [...state.visitHistory, ...(state.currentVisit ? [state.currentVisit] : [])]) {
            if (!visit || !Number.isInteger(visit.visitNumber) || !parseLocation(visit.locationId) ||
                !['pending_calculation', 'task_required', 'resolved'].includes(visit.status) ||
                !Array.isArray(visit.candidateTaskIds) || visit.candidateTaskIds.some(id => typeof id !== 'string')) {
                throw new Error('Invalid visit snapshot');
            }
            if (visit.status === 'resolved' && !['task_completed', 'no_tasks', 'admin_void'].includes(visit.resolution)) throw new Error('Invalid visit resolution');
            if (visit.arrivalSections !== undefined && (!Array.isArray(visit.arrivalSections) ||
                visit.arrivalSections.some(section => !/^W?\d+$/.test(String(section))))) throw new Error('Invalid visit arrival sections');
            if (visit.arrivalMedium !== undefined && !['land', 'water', 'mixed', 'whole'].includes(visit.arrivalMedium)) {
                throw new Error('Invalid visit arrival medium');
            }
        }
        if (!state.travelAnchor && state.currentVisit) state.travelAnchor = state.currentVisit.locationId;
        if (state.travelAnchorSections == null && state.currentVisit?.locationId === state.travelAnchor &&
            Array.isArray(state.currentVisit.arrivalSections)) state.travelAnchorSections = [...state.currentVisit.arrivalSections];
        return state;
    }

    function normalizeRunExport(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Not a supported Boardlocked run export');
        const oldFormat = 'chunk-picker-' + 'rogue' + 'like';
        if (![oldFormat, 'chunk-picker-boardlocked'].includes(payload.format) ||
            !Number.isInteger(payload.version) || payload.version < 1 || payload.version > VERSION) {
            throw new Error('Not a supported Boardlocked run export');
        }
        const oldStateField = 'rogue' + 'likeState';
        const stateInput = payload.boardlockedState || payload[oldStateField];
        if (!stateInput) throw new Error('Boardlocked state is missing from the export');
        return { state: normalizeState(stateInput), legacy: payload.legacy ? copy(payload.legacy) : null, version: payload.version };
    }

    function normalizeBrowserSave(raw) {
        const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!payload || payload.format !== 'boardlocked-browser-save' || payload.version !== 1 ||
            !payload.boardlockedState || !payload.legacy) throw new Error('Invalid Boardlocked browser save');
        return { ...copy(payload), boardlockedState: normalizeState(payload.boardlockedState) };
    }

    function deriveStartingSections(data = {}, locationId, medium = 'land', allowedChunkIds = [], blacklisted = {}) {
        const id = String(locationId), sectionMap = data.sections?.[id] || {};
        const water = medium === 'water';
        const matching = Object.keys(sectionMap).filter(section => section !== '0' && section.startsWith('W') === water);
        if (!matching.length) return [];
        const allowed = new Set((allowedChunkIds.length ? allowedChunkIds : Object.keys(data.sections || {})).map(String));
        const viable = matching.filter(section => (sectionMap[section] || []).some(rawTarget => {
            const target = parseLocation(rawTarget);
            return target && target.chunkId !== id && allowed.has(target.chunkId) && !own(blacklisted, target.chunkId);
        }));
        if (viable.length) return viable;
        const preferred = water ? (matching.includes('W1') ? 'W1' : matching[0]) : (matching.includes('1') ? '1' : matching[0]);
        return preferred ? [preferred] : [];
    }

    function migrateStartingSections(data = {}, inputState, inputSections = {}, allowedChunkIds = [], blacklisted = {}) {
        const state = copy(inputState), sections = copy(inputSections || {});
        if (state.startingSectionPolicy === STARTING_SECTION_POLICY) return { state, sections, changed: false, opened: [] };
        const startIndex = (state.adminHistory || []).findIndex(event =>
            event.action === 'set_starting_sections' && parseLocation(event.locationId));
        const opened = [];
        if (startIndex >= 0) {
            const start = state.adminHistory[startIndex], id = parseLocation(start.locationId).chunkId;
            const oldSections = Array.isArray(start.sectionIds) ? start.sectionIds.map(String) : [];
            const medium = start.medium === 'water' || (!start.medium && oldSections.length &&
                oldSections.every(section => section.startsWith('W'))) ? 'water' : 'land';
            const desired = deriveStartingSections(data, id, medium, allowedChunkIds, blacklisted)
                .filter(section => sections[id]?.[section] !== false);
            for (const section of desired) {
                if (sections[id]?.[section] !== true) opened.push(section);
                (sections[id] ||= {})[section] = true;
            }
            const anchorWasNotMovedExplicitly = !(state.adminHistory || []).slice(startIndex + 1)
                .some(event => event.action === 'set_travel_anchor');
            if (state.travelAnchor === id && anchorWasNotMovedExplicitly && desired.length) state.travelAnchorSections = [...desired];
            state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'upgrade_starting_section_policy',
                locationId: id, medium, sectionIds: [...desired], openedSectionIds: [...opened] });
        }
        state.startingSectionPolicy = STARTING_SECTION_POLICY;
        return { state, sections, changed: true, opened };
    }

    function deriveStartingPool(data = {}, annotations = {}, options = {}, blacklisted = {}) {
        const configured = annotations.initialization?.startingTiles || {};
        const walkable = new Set((data.walkableChunks || []).map(String));
        const groupOrder = ['standard', 'varlamore', 'wilderness', 'ocean'];
        const enabled = { standard: true, varlamore: options.varlamore === true,
            wilderness: options.wilderness === true, ocean: options.ocean === true };
        const ids = [], groupByLocation = {}, arrivalSectionsByLocation = {}, groups = [];
        for (const group of groupOrder) {
            if (!enabled[group]) continue;
            const groupIds = [];
            for (const rawId of configured[group] || []) {
                const id = String(rawId);
                if (!walkable.has(id) || own(blacklisted, id) || own(groupByLocation, id)) continue;
                const water = group === 'ocean';
                groupByLocation[id] = group;
                arrivalSectionsByLocation[id] = deriveStartingSections(data, id, water ? 'water' : 'land', [...walkable], blacklisted);
                ids.push(id); groupIds.push(id);
            }
            if (groupIds.length) groups.push({ id: group, medium: group === 'ocean' ? 'water' : 'land', locationIds: groupIds });
        }
        return { ids, groups, groupByLocation, arrivalSectionsByLocation };
    }

    // Initial groups receive equal odds, then every tile within the selected
    // group receives equal odds. This keeps optional ocean tiles from changing
    // the meaning of every other start merely because the ocean grid is larger.
    function chooseStartingCandidate(candidates, startingPool, rng = Math.random) {
        if (!Array.isArray(candidates) || !candidates.length) return null;
        const available = (startingPool?.groups || []).map(group => ({ ...group,
            candidates: candidates.filter(candidate => group.locationIds.includes(String(candidate.locationId))) }))
            .filter(group => group.candidates.length);
        if (!available.length) return chooseCandidate(candidates, rng);
        const groupRoll = rng(), tileRoll = rng();
        if (groupRoll < 0 || groupRoll >= 1 || tileRoll < 0 || tileRoll >= 1) throw new Error('Random source must return [0, 1)');
        const group = available[Math.floor(groupRoll * available.length)];
        const candidate = group.candidates[Math.floor(tileRoll * group.candidates.length)];
        return { ...candidate, metadata: { ...(candidate.metadata || {}), startGroup: group.id,
            arrivalMedium: group.medium, entrySections: [...(startingPool.arrivalSectionsByLocation?.[candidate.locationId] || [])] } };
    }

    function sanitizeLegacySnapshot(input = {}, ruleKeys = [], settingKeys = []) {
        const saved = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        const { selected, potential, ...persistentChunks } = saved.tempChunks && typeof saved.tempChunks === 'object' ? saved.tempChunks : {};
        const pick = (source, keys) => Object.fromEntries(keys.filter(key => own(source, key)).map(key => [key, copy(source[key])]));
        const result = { tempChunks: copy(persistentChunks), tempSelectedChunks: [],
            rules: pick(saved.rules, ruleKeys), settings: pick(saved.settings, settingKeys) };
        for (const key of ['checkedAllTasks', 'checkedChallenges', 'completedChallenges', 'manualEquipment', 'backlog',
            'manualTasks', 'backloggedSources', 'manualMonsters', 'manualSections', 'manualAreas', 'passiveSkill', 'maxSkill',
            'randomLoot', 'assignedXpRewards', 'altChallenges', 'userTasks', 'manualPrimary', 'chunkOrder']) {
            result[key] = saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key]) ? copy(saved[key]) : {};
        }
        for (const key of ['slayerLocked', 'constructionLocked']) if (saved[key] !== undefined) result[key] = copy(saved[key]);
        return result;
    }

    function parseLocation(value) {
        if (value && typeof value === 'object') {
            return parseLocation(String(value.chunkId) + (value.sectionId != null ? '-' + value.sectionId : ''));
        }
        const match = /^(\d+)(?:-(W?\d+))?$/.exec(String(value));
        return match ? { chunkId: match[1], sectionId: match[2] || null } : null;
    }
    function parseUnlockedLocations(text, data) {
        const values = String(text).trim().split(/\s*(?:,|;|→|->)\s*|\s+/).filter(Boolean);
        if (!values.length) throw new Error('Enter the chunks you have already unlocked, in order.');
        return [...new Set(values)].map(value => {
            const parsed = parseLocation(value), chunk = parsed && data.chunks?.[parsed.chunkId];
            if (!chunk || (parsed.sectionId && !own(chunk.Sections, parsed.sectionId))) throw new Error('Unknown chunk or section: ' + value);
            return parsed;
        });
    }
    function locationAvailable(origin, unlocked, sections = {}, manualSections = {}) {
        return !!origin && own(unlocked, origin.chunkId) && (!origin.sectionId ||
            (manualSections[origin.chunkId]?.[origin.sectionId] !== false && !!sections[origin.chunkId]?.[origin.sectionId]));
    }
    function uniqueOrigins(origins) {
        const result = new Map();
        for (const origin of origins) {
            if (!origin?.chunkId) continue;
            result.set([origin.chunkId, origin.sectionId || '', origin.sourceType, origin.sourceName].join('|'), origin);
        }
        return [...result.values()];
    }

    // One adapter reads the existing three completion stores. No per-origin ownership.
    function legacyFlag(store, task, presence = false) {
        const keys = [task.taskId, task.name, cleanName(task.name), task.name.replaceAll('#', '/')];
        if (String(task.taskId).startsWith('bl_')) keys.push('r' + 'l_' + String(task.taskId).slice(3));
        // The worker projects some quest/diary tasks into skill categories. A
        // stable task is globally completed/backlogged even from that other view.
        return Object.values(store || {}).some(entries => keys.some(key =>
            own(entries, key) && (presence || entries[key] !== false)));
    }
    function isComplete(task, legacy = {}, state = null) {
        if (task.taskClass === 'enabler' && task.enablerItemKey && own(state?.acquiredEnablers, task.enablerItemKey)) return true;
        return ['completedChallenges', 'checkedChallenges', 'checkedAllTasks'].some(key => legacyFlag(legacy[key], task)) ||
            (!!task.equipmentName && !!legacy.manualEquipment?.[task.equipmentName]);
    }
    const isBacklogged = (task, legacy) => legacyFlag(legacy?.backlog, task, true);
    function completionIds(legacy, map = {}) {
        const ids = new Set();
        for (const kind of ['completedChallenges', 'checkedChallenges', 'checkedAllTasks']) {
            for (const [skill, tasks] of Object.entries(legacy[kind] || {})) {
                for (const [name, flag] of Object.entries(tasks || {})) if (flag !== false) {
                    ids.add(taskId(name, skill, map));
                    ids.add(name); // Also accepts an already-ID-encoded imported record.
                }
            }
        }
        return ids;
    }
    function taskMetadata(name, skill, meta, ids = {}) {
        const categories = meta.Category || [];
        let taskClass = 'other', classificationReason = 'Independent or metadata-only objective';
        if (skill === 'Unlocks / Tools') {
            taskClass = 'enabler'; classificationReason = 'Persistent reusable item acquisition';
        } else if (skill === 'Quest' || categories.includes('Quest Skill Reqs')) {
            taskClass = 'quest'; classificationReason = 'Quest category metadata';
        } else if (skill === 'Diary') {
            taskClass = 'diary'; classificationReason = 'Diary category metadata';
        } else if (skill === 'BiS' || categories.includes('BIS Skilling')) {
            taskClass = 'bis'; classificationReason = 'Best-in-slot category metadata';
        } else if (categories.includes('Collection Log')) {
            taskClass = 'collection'; classificationReason = 'Collection Log category metadata';
        } else if (categories.length) {
            taskClass = 'activity'; classificationReason = 'Independent activity/rule category: ' + categories.join(', ');
        } else if (SKILLS.includes(skill) && Number.isFinite(meta.Level) && !meta.NoXp && (meta.Primary === true ||
            (meta.Primary === false && meta.Items?.length && !meta.Chunks?.length && !meta.Output && !meta.Monsters?.length &&
                !meta.NPCs?.length && !meta.Tasks && !meta['Not Equip']))) {
            taskClass = 'skill_progression';
            classificationReason = meta.Primary === true ? 'Primary XP action with a skill level and no special category' :
                'Direct item/tool-use action with a skill level and no reward, geography, prerequisite, or special category';
        }
        const advancesSkillProgression = taskClass === 'skill_progression' && Number.isFinite(meta.Level);
        const bisReason = taskClass === 'bis' ? stripMarkup(meta.BisReason ||
            (meta.Set ? 'BIS Skilling · ' + meta.Set : meta.Label || (categories.includes('BIS Skilling') ? 'BIS Skilling' : ''))) : '';
        return { taskId: taskId(name, skill, ids), name, displayName: displayName(name), skill, type: skill,
            category: meta.Label || skill, sourceCategories: categories.slice(), level: meta.Level || null,
            description: meta.Description || '', taskClass, classificationReason, advancesSkillProgression,
            skilling: advancesSkillProgression, bisReason,
            bisSet: meta.Set || null };
    }
    function equipmentObjectiveAlternatives(data, name, meta = {}) {
        if (!/^(?:wear|wield|equip)\b/i.test(displayName(name).trim()) || meta.Items?.length !== 1) return [];
        const raw = String(meta.Items[0]);
        const quantity = /\[\+\]x(\d+)/.exec(raw);
        if (quantity && Number(quantity[1]) !== 1) return [];
        return [...new Set(expand(raw, data.codeItems?.itemsPlus).map(canonicalItemKey).filter(Boolean))];
    }
    function buildTaskCatalog(data, ids = {}) {
        const catalog = new Map();
        for (const skill of ['Quest', 'Diary', 'Extra', 'BiS', ...SKILLS, 'Combat']) {
            for (const [name, meta] of Object.entries(data.challenges?.[skill] || {})) {
                const record = taskMetadata(name, skill, meta, ids);
                record.equipmentObjectiveAlternatives = equipmentObjectiveAlternatives(data, name, meta);
                if (!meta.NeverShow && !catalog.has(record.taskId)) catalog.set(record.taskId, record);
            }
        }
        return [...catalog.values()];
    }
    function progressionCeiling(catalog, skill, highWater) {
        const standard = Math.min(99, highWater + progressionWindow(skill));
        const laterLevels = [...new Set(catalog.filter(task => task.skill === skill && task.advancesSkillProgression && task.level > highWater)
            .map(task => task.level))].sort((a, b) => a - b);
        if (!laterLevels.length || laterLevels.some(level => level <= standard)) return standard;
        // Sparse skills still expose their nearest next milestone rather than
        // becoming permanently stuck behind an empty numerical range.
        return laterLevels[0];
    }
    function completedEquipmentItems(legacy = {}, state = null, ids = {}) {
        const result = new Map(), reverseIds = new Map(Object.entries(ids || {}).map(([name, id]) => [String(id), name]));
        const add = item => { if (item) result.set(comparableItemKey(item), canonicalItemKey(item)); };
        for (const [item, owned] of Object.entries(legacy.manualEquipment || {})) if (owned) add(item);
        for (const item of Object.keys(state?.acquiredEnablers || {})) add(item);
        for (const storeName of ['completedChallenges', 'checkedChallenges', 'checkedAllTasks']) {
            for (const [skill, entries] of Object.entries(legacy[storeName] || {})) for (const [key, flag] of Object.entries(entries || {})) {
                if (flag === false) continue;
                const name = reverseIds.get(String(key)) || key;
                if (skill !== 'BiS' && !/(?:^|\))\s*Obtain\b/i.test(displayName(name))) continue;
                const match = /~\|([^|]+)\|~/.exec(name);
                if (match) add(match[1]);
            }
        }
        return result;
    }
    function impliedEquipmentCompletion(task, completedItems, state = null) {
        if (task.advancesSkillProgression && Number.isFinite(task.level) &&
            Number.isFinite(state?.actualLevels?.[task.skill]) && state.actualLevels[task.skill] < task.level) return null;
        return (task.equipmentObjectiveAlternatives || []).find(item => completedItems.has(comparableItemKey(item))) || null;
    }
    function deriveProgressionHighWater(catalog, legacy, ids = {}, state = null) {
        const done = completionIds(legacy, ids), completedItems = completedEquipmentItems(legacy, state, ids), result = {};
        for (const skill of SKILLS) {
            const cleared = catalog.filter(task => task.skill === skill && task.advancesSkillProgression &&
                (done.has(task.taskId) || done.has(task.name) || impliedEquipmentCompletion(task, completedItems, state))).map(task => task.level);
            result[skill] = cleared.length ? Math.max(...cleared) : 0;
        }
        return result;
    }
    function initializeProgression(state, catalog, legacy = {}, ids = {}, force = false) {
        const next = { ...state, progressionHighWater: { ...state.progressionHighWater } };
        if (force || !state.progressionInitialized) {
            next.progressionHighWater = deriveProgressionHighWater(catalog, legacy, ids, state);
            if (!force && state.legacyProgressionFrontiers) {
                // Only preserve a legacy frontier when the player explicitly
                // edited it. Automatically advanced tiers are re-derived from
                // exact completions so the new rolling-window behavior applies.
                const lastManual = {};
                for (const entry of state.adminHistory || []) if (entry.action === 'set_progression_frontier' &&
                    SKILLS.includes(entry.skill) && Number.isInteger(entry.tier)) lastManual[entry.skill] = entry.tier;
                for (const [skill, tier] of Object.entries(lastManual)) {
                    const migrated = tier >= LEGACY_BAND_MINIMUMS.length ? 99 : Math.max(0, LEGACY_BAND_MINIMUMS[tier] - 1);
                    next.progressionHighWater[skill] = Math.max(next.progressionHighWater[skill], migrated);
                }
            }
        }
        next.progressionInitialized = true;
        delete next.legacyProgressionFrontiers;
        return next;
    }
    function reconcileProgression(state, catalog, legacy = {}, ids = {}) {
        const next = initializeProgression(state, catalog, legacy, ids);
        const derived = deriveProgressionHighWater(catalog, legacy, ids, next);
        for (const skill of SKILLS) next.progressionHighWater[skill] = Math.max(next.progressionHighWater[skill] || 0, derived[skill]);
        return next;
    }
    function setProgressionHighWater(state, skill, level) {
        if (!SKILLS.includes(skill) || !Number.isInteger(level) || level < 0 || level > 99) throw new Error('Invalid progression high-water mark');
        return { ...state, progressionInitialized: true,
            progressionHighWater: { ...state.progressionHighWater, [skill]: level } };
    }
    function skillMilestones(catalog, legacy, ids = {}) {
        // Compatibility view for integrations that inspect completed milestones.
        const done = completionIds(legacy, ids), levels = {};
        for (const task of catalog) if (task.advancesSkillProgression && (done.has(task.taskId) || done.has(task.name))) {
            levels[task.skill] = Math.max(levels[task.skill] || 0, task.level);
        }
        return levels;
    }
    function acquisitionTaskItems(task) {
        if (!['bis', 'collection', 'enabler'].includes(task.taskClass)) return [];
        return [...new Set([task.equipmentName, task.enablerItemKey, ...(task.provesAcquiredItemKeys || [])].filter(Boolean))];
    }
    function sameAccessibleArea(left, right) {
        return left.chunkId === right.chunkId && (!left.sectionId || !right.sectionId || left.sectionId === right.sectionId);
    }
    function collapseRedundantEquipmentTasks(tasks) {
        const detailed = tasks.filter(task => task.eligible && acquisitionTaskItems(task).length);
        return tasks.map(task => {
            if (!task.eligible || !(task.equipmentObjectiveAlternatives || []).length) return task;
            const alternatives = new Set(task.equipmentObjectiveAlternatives.map(comparableItemKey));
            const covering = detailed.filter(candidate => candidate.taskId !== task.taskId &&
                acquisitionTaskItems(candidate).some(item => alternatives.has(comparableItemKey(item))));
            if (!covering.length) return task;
            const coveredOrigins = task.activeOrigins.filter(origin => covering.some(candidate =>
                candidate.activeOrigins.some(detailOrigin => sameAccessibleArea(origin, detailOrigin))));
            if (!coveredOrigins.length) return task;
            const activeOrigins = task.activeOrigins.filter(origin => !coveredOrigins.includes(origin));
            const coveredBy = covering.filter(candidate => coveredOrigins.some(origin =>
                candidate.activeOrigins.some(detailOrigin => sameAccessibleArea(origin, detailOrigin))));
            const labels = [...new Set(coveredBy.map(candidate => candidate.displayName))];
            const reason = 'Covered by ' + (labels.length === 1 ? labels[0] : labels.length + ' specific obtainable-item tasks');
            return { ...task, activeOrigins, eligible: activeOrigins.length > 0, redundant: activeOrigins.length === 0,
                partiallyRedundant: activeOrigins.length > 0, coveredOrigins: uniqueOrigins(coveredOrigins),
                coveredByTaskIds: coveredBy.map(candidate => candidate.taskId),
                eligibilityReason: activeOrigins.length ? task.eligibilityReason : reason,
                whyWouldBeIneligible: activeOrigins.length ? task.whyWouldBeIneligible : [...task.whyWouldBeIneligible, 'covered by a more specific obtainable-item task'] };
        });
    }
    function adaptTasks(tasks, legacy, state, unlocked, sections, manualSections, catalog = tasks, ids = {}) {
        const completedItems = completedEquipmentItems(legacy, state, ids);
        const adapted = tasks.map(task => {
            const origins = own(state.originOverrides, task.taskId) ? state.originOverrides[task.taskId].map(value => ({
                ...parseLocation(value), sourceType: 'manual', sourceName: 'Manual origin', reason: 'User origin override'
            })) : task.origins;
            const activeOrigins = origins.filter(origin => locationAvailable(origin, unlocked, sections, manualSections));
            const impliedByItem = impliedEquipmentCompletion(task, completedItems, state);
            const completed = isComplete(task, legacy, state) || !!impliedByItem, backlogged = isBacklogged(task, legacy);
            const highWater = state.progressionHighWater?.[task.skill] ?? 0;
            const ceiling = task.advancesSkillProgression ? progressionCeiling(catalog, task.skill, highWater) : null;
            const superseded = !!task.advancesSkillProgression && task.level <= highWater;
            const progressionBlocked = !!task.advancesSkillProgression && task.level > ceiling;
            return { ...task, origins, activeOrigins, completed, implicitlyCompleted: !!impliedByItem, completionEvidenceItem: impliedByItem,
                backlogged, superseded,
                progressionBlocked, progressionHighWater: task.advancesSkillProgression ? highWater : null,
                progressionCeiling: ceiling,
                eligible: task.available !== false && !completed && !backlogged && !superseded && !progressionBlocked && activeOrigins.length > 0,
                eligibilityReason: impliedByItem ? 'Completed by obtaining ' + impliedByItem : completed ? 'Completed' : superseded ? 'At or below the highest completed ' + task.skill + ' task (level ' + highWater + ')' :
                    progressionBlocked ? 'Above the current ' + task.skill + ' progression window (next through level ' + ceiling + ')' : backlogged ? 'Backlogged' :
                    task.available === false ? task.accessResult?.reason || 'Access unavailable' : !origins.length ? 'Unassigned origin' :
                    !activeOrigins.length ? 'Origin geography or section is closed' : 'Eligible',
                whyWouldBeIneligible: completed ? [impliedByItem ? 'completed by a specific acquired equipment item' : 'completed'] : [
                    ...(superseded ? ['at or below highest completed skill-task level'] : []), ...(progressionBlocked ? ['above current progression window'] : []),
                    ...(backlogged ? ['backlogged'] : []), ...(task.available === false ? [task.accessResult?.reason || 'access unavailable'] : []),
                    ...(!origins.length ? ['no attributed origin'] : []), ...(origins.length && !activeOrigins.length ? ['origin geography or section closed'] : [])
                ] };
        });
        return collapseRedundantEquipmentTasks(adapted);
    }

    function buildTravelGraph(data, unlocked, accessibleSections = {}, frontier = [], connectionAllowed = () => true) {
        const allowedChunks = new Set([...Object.keys(unlocked || {}), ...frontier.map(String)]);
        const unlockedChunks = new Set(Object.keys(unlocked || {}));
        const availableLocations = new Set();
        for (const chunkId of allowedChunks) {
            for (const sectionId of Object.keys(data.sections?.[chunkId] || {})) {
                const locationId = chunkId + (sectionId === '0' ? '' : '-' + sectionId);
                // A locked boundary chunk may be entered through any of its
                // sections. Unlocked chunks use only sections the map has
                // already proved accessible.
                if (!unlockedChunks.has(chunkId) || sectionId === '0' || accessibleSections[chunkId]?.[sectionId]) {
                    availableLocations.add(locationId);
                }
            }
        }
        const graph = Object.fromEntries([...allowedChunks].map(id => [id, []]));
        const sectionGraph = Object.fromEntries([...availableLocations].map(id => [id, []]));
        const nodesByChunk = {};
        for (const location of availableLocations) (nodesByChunk[parseLocation(location).chunkId] ||= []).push(location);
        const edges = new Set();
        for (const [chunkId, sectionMap] of Object.entries(data.sections || {})) {
            if (!allowedChunks.has(chunkId)) continue;
            for (const [sectionId, connections] of Object.entries(sectionMap || {})) {
                const from = chunkId + (sectionId === '0' ? '' : '-' + sectionId);
                if (!availableLocations.has(from)) continue;
                for (const rawTarget of connections || []) {
                    const target = parseLocation(rawTarget);
                    if (!target || !allowedChunks.has(target.chunkId)) continue;
                    const to = target.chunkId + (target.sectionId ? '-' + target.sectionId : '');
                    if (!availableLocations.has(to) || !connectionAllowed(from, to)) continue;
                    if (!sectionGraph[from].includes(to)) sectionGraph[from].push(to);
                    if (!sectionGraph[to].includes(from)) sectionGraph[to].push(from);
                    const key = [chunkId, target.chunkId].sort().join('|');
                    if (chunkId !== target.chunkId) edges.add(key);
                }
            }
        }
        for (const edge of edges) {
            const [a, b] = edge.split('|');
            graph[a].push(b); graph[b].push(a);
        }
        for (const id of Object.keys(graph)) graph[id].sort((a, b) => Number(a) - Number(b));
        for (const id of Object.keys(sectionGraph)) sectionGraph[id].sort();
        Object.defineProperties(graph, {
            sectionGraph: { value: sectionGraph, enumerable: false },
            nodesByChunk: { value: nodesByChunk, enumerable: false }
        });
        return graph;
    }

    function deriveConnectedFrontier(data, unlocked, allowedChunkIds = [], blacklisted = {}) {
        const allowed = new Set(allowedChunkIds.map(String)), found = new Set();
        for (const [fromChunk, sectionMap] of Object.entries(data.sections || {})) {
            for (const connections of Object.values(sectionMap || {})) for (const rawTarget of connections || []) {
                const target = parseLocation(rawTarget)?.chunkId;
                if (!target || own(unlocked, fromChunk) === own(unlocked, target)) continue;
                const lockedId = own(unlocked, fromChunk) ? target : fromChunk;
                if (allowed.has(lockedId) && !own(blacklisted, lockedId)) found.add(lockedId);
            }
        }
        return [...found].sort((a, b) => Number(b) - Number(a));
    }

    function inferConnectedSections(data, unlocked, explicitSections = {}, connectionAllowed = () => true) {
        const inferred = copy(explicitSections || {});
        const open = (chunkId, sectionId) => {
            if (!sectionId || inferred[chunkId]?.[sectionId] === false) return;
            (inferred[chunkId] ||= {})[sectionId] = true;
        };
        let changed = true;
        while (changed) {
            changed = false;
            for (const [fromChunk, sectionMap] of Object.entries(data.sections || {})) {
                if (!own(unlocked, fromChunk)) continue;
                for (const [fromSection, connections] of Object.entries(sectionMap || {})) {
                    if (fromSection !== '0' && inferred[fromChunk]?.[fromSection] !== true) continue;
                    for (const rawTarget of connections || []) {
                        const target = parseLocation(rawTarget);
                        if (!target || !own(unlocked, target.chunkId)) continue;
                        const from = fromChunk + (fromSection === '0' ? '' : '-' + fromSection);
                        const to = target.chunkId + (target.sectionId ? '-' + target.sectionId : '');
                        if (!connectionAllowed(from, to) || !target.sectionId || inferred[target.chunkId]?.[target.sectionId] === true ||
                            inferred[target.chunkId]?.[target.sectionId] === false) continue;
                        open(target.chunkId, target.sectionId); changed = true;
                    }
                }
            }
        }
        return inferred;
    }

    function inferTravelAnchor(state, unlocked, chunkOrder = {}) {
        const candidates = [state.currentVisit?.locationId, state.travelAnchor];
        for (const visit of [...(state.visitHistory || [])].sort((a, b) => b.visitNumber - a.visitNumber)) candidates.push(visit.locationId);
        for (const [, id] of Object.entries(chunkOrder || {}).sort((a, b) => Number(b[0]) - Number(a[0]))) candidates.push(String(id));
        candidates.push(...Object.keys(unlocked || {}).reverse());
        return candidates.map(value => parseLocation(value)?.chunkId).find(id => id && own(unlocked, id)) || null;
    }

    function inferLegacyAnchorSections(data, state, accessibleSections = {}) {
        if (Array.isArray(state.travelAnchorSections)) return [...state.travelAnchorSections];
        const anchor = parseLocation(state.currentVisit?.locationId || state.travelAnchor);
        if (!anchor) return null;
        if (anchor.sectionId) return [anchor.sectionId];
        const configured = Object.keys(accessibleSections[anchor.chunkId] || {}).filter(section =>
            accessibleSections[anchor.chunkId][section] === true && own(data.sections?.[anchor.chunkId] || {}, section));
        if (!configured.length) return own(data.sections?.[anchor.chunkId] || {}, '0') ? [] : null;
        // Old saves did not record the section occupied by the player. Prefer one
        // ordinary land section when both media were marked open, because the old
        // bug could infer water from a land route. Water-only histories remain water.
        const land = configured.filter(section => !section.startsWith('W'));
        const water = configured.filter(section => section.startsWith('W'));
        const preferred = land.includes('1') ? '1' : land[0] || (water.includes('W1') ? 'W1' : water[0]);
        return preferred ? [preferred] : null;
    }

    function setTravelAnchor(state, locationId, reason = 'Set current travel tile', timestamp = new Date().toISOString()) {
        const parsed = parseLocation(locationId);
        if (!parsed) throw new Error('Invalid travel anchor');
        if (!canRoll(state)) throw new Error('Complete or administratively void the current visit first');
        return { ...state, travelAnchor: parsed.chunkId, travelAnchorSections: parsed.sectionId ? [parsed.sectionId] : null,
            adminHistory: [...state.adminHistory,
            { timestamp, action: 'set_travel_anchor', locationId: parsed.chunkId, sectionId: parsed.sectionId, reason }] };
    }

    function derivePool(frontier, unlocked, tasks, currentVisit, travelGraph = null, travelAnchor = null, travelAnchorSections = null) {
        const byLocation = {}, byNode = {};
        for (const id of Object.keys(unlocked || {})) byLocation[id] = [];
        for (const task of tasks) if (task.eligible) {
            for (const origin of uniqueOrigins(task.activeOrigins || [])) {
                const id = origin.chunkId;
                if (own(byLocation, id) && !byLocation[id].includes(task.taskId)) byLocation[id].push(task.taskId);
                const node = id + (origin.sectionId ? '-' + origin.sectionId : '');
                (byNode[node] ||= []);
                if (!byNode[node].includes(task.taskId)) byNode[node].push(task.taskId);
            }
        }
        const live = Object.keys(byLocation).filter(id => byLocation[id].length > 0);
        const dormant = Object.keys(byLocation).filter(id => !byLocation[id].length);
        const frontierSet = new Set(frontier.map(String).filter(id => !own(unlocked, id)));
        const current = parseLocation(travelAnchor || currentVisit?.locationId)?.chunkId || null;
        const candidates = [], reachableFree = [], reachableLive = [];

        if (travelGraph?.sectionGraph && current && own(unlocked, current)) {
            const availableStartNodes = travelGraph.nodesByChunk?.[current] || [];
            let startNodes = Array.isArray(travelAnchorSections) ? travelAnchorSections.map(section => current + '-' + section)
                .filter(node => availableStartNodes.includes(node)) : availableStartNodes;
            if (!startNodes.length && availableStartNodes.includes(current)) startNodes = [current];
            if (!startNodes.length) startNodes = availableStartNodes;
            const traversed = new Set(startNodes), queue = startNodes.map(id => ({ id, distance: 0 })), found = new Map();
            const reachableFreeSet = new Set(), reachableLiveSet = new Set();
            while (queue.length) {
                const { id: from, distance } = queue.shift();
                for (const node of travelGraph.sectionGraph[from] || []) {
                    const parsed = parseLocation(node), locationId = parsed.chunkId;
                    if (!own(unlocked, locationId)) {
                        if (!frontierSet.has(locationId)) continue;
                        const entrySections = parsed.sectionId ? [parsed.sectionId] : [];
                        if (!found.has(locationId)) found.set(locationId, { kind: 'frontier', locationId, weight: 1,
                            metadata: { distance: distance + 1, entrySections } });
                        else {
                            const metadata = found.get(locationId).metadata;
                            metadata.distance = Math.min(metadata.distance, distance + 1);
                            metadata.entrySections = [...new Set([...metadata.entrySections, ...entrySections])];
                        }
                    } else if ((byNode[node] || []).length) {
                        const entrySections = parsed.sectionId ? [parsed.sectionId] : [];
                        if (!found.has(locationId)) found.set(locationId, { kind: 'revisit', locationId, weight: 1,
                            metadata: { taskCount: byNode[node].length, taskIds: [...byNode[node]], distance: distance + 1, entrySections } });
                        else if (found.get(locationId).kind === 'revisit') {
                            const metadata = found.get(locationId).metadata;
                            metadata.distance = Math.min(metadata.distance, distance + 1);
                            metadata.taskIds = [...new Set([...metadata.taskIds, ...byNode[node]])];
                            metadata.taskCount = metadata.taskIds.length;
                            metadata.entrySections = [...new Set([...metadata.entrySections, ...entrySections])];
                        }
                        reachableLiveSet.add(locationId);
                    } else if (!traversed.has(node)) {
                        traversed.add(node); reachableFreeSet.add(locationId); queue.push({ id: node, distance: distance + 1 });
                    }
                }
            }
            candidates.push(...found.values());
            reachableFree.push(...reachableFreeSet); reachableLive.push(...reachableLiveSet);
            const currentTaskIds = [...new Set(startNodes.flatMap(node => byNode[node] || []))];
            if (!candidates.length && currentTaskIds.length) candidates.push({ kind: 'stay', locationId: current,
                weight: 1, metadata: { taskCount: currentTaskIds.length, taskIds: currentTaskIds, distance: 0,
                    entrySections: Array.isArray(travelAnchorSections) ? [...travelAnchorSections] : [], deadlockFallback: true } });
        } else if (travelGraph && current && own(unlocked, current)) {
            const traversed = new Set([current]), queue = [{ id: current, distance: 0 }], found = new Map();
            while (queue.length) {
                const { id: from, distance } = queue.shift();
                for (const id of travelGraph[from] || []) {
                    const locationId = String(id);
                    if (locationId === current) continue;
                    if (!own(unlocked, locationId)) {
                        if (frontierSet.has(locationId) && !found.has(locationId)) found.set(locationId,
                            { kind: 'frontier', locationId, weight: 1, metadata: { distance: distance + 1 } });
                    } else if (byLocation[locationId]?.length) {
                        if (!found.has(locationId)) {
                            found.set(locationId, { kind: 'revisit', locationId, weight: 1,
                                metadata: { taskCount: byLocation[locationId].length, taskIds: [...byLocation[locationId]], distance: distance + 1 } });
                            reachableLive.push(locationId);
                        }
                    } else if (!traversed.has(locationId)) {
                        traversed.add(locationId); reachableFree.push(locationId);
                        queue.push({ id: locationId, distance: distance + 1 });
                    }
                }
            }
            candidates.push(...found.values());
            if (!candidates.length && byLocation[current]?.length) candidates.push({ kind: 'stay', locationId: current,
                weight: 1, metadata: { taskCount: byLocation[current].length, taskIds: [...byLocation[current]], distance: 0, deadlockFallback: true } });
        } else {
            // Before the first tile (and for callers without geography data),
            // retain the complete starting pool. Imported runs receive an
            // inferred anchor before this function is called by the UI.
            for (const locationId of frontierSet) candidates.push({ kind: 'frontier', locationId, weight: 1, metadata: { distance: null } });
            if (!travelGraph) for (const locationId of live) {
                candidates.push({ kind: 'revisit', locationId, weight: 1, metadata: { taskCount: byLocation[locationId].length,
                    taskIds: [...byLocation[locationId]], distance: null } });
                reachableLive.push(locationId);
            }
        }
        return { candidates, live, dormant, reachableLive, reachableFree, byLocation, current };
    }
    function chooseCandidate(pool, rng = Math.random) {
        if (!pool.length) return null;
        const value = rng();
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('RNG must return a value in [0, 1)');
        return pool[Math.floor(value * pool.length)];
    }
    const canRoll = state => !state.currentVisit || state.currentVisit.status === 'resolved';
    function journal(state, visit) {
        const index = state.visitHistory.findIndex(v => v.visitNumber === visit.visitNumber);
        const visitHistory = state.visitHistory.slice();
        if (index < 0) visitHistory.push(visit); else visitHistory[index] = visit;
        return { ...state, currentVisit: visit, visitHistory };
    }
    function startVisit(state, candidate, chunkName = '', timestamp = new Date().toISOString()) {
        if (!canRoll(state)) throw new Error('Complete or administratively void the current visit first');
        if (!candidate) throw new Error('No locations available');
        const entrySections = [...new Set((candidate.metadata?.entrySections || []).map(String))];
        const arrivalMedium = candidate.metadata?.arrivalMedium || (!entrySections.length ? 'whole' :
            entrySections.every(section => section.startsWith('W')) ? 'water' : entrySections.some(section => section.startsWith('W')) ? 'mixed' : 'land');
        const visit = { visitNumber: Math.max(0, ...state.visitHistory.map(v => v.visitNumber)) + 1,
            timestamp, locationId: String(candidate.locationId), chunkName,
            arrivalSections: entrySections, arrivalMedium, startGroup: candidate.metadata?.startGroup || null,
            reachableTaskIds: [...new Set(candidate.metadata?.taskIds || [])],
            kind: candidate.kind === 'frontier' ? 'new' : candidate.kind === 'admin' ? 'admin' : candidate.kind === 'stay' ? 'stay' : 'revisit',
            candidateTaskIds: [], status: 'pending_calculation', resolution: null, resolvedTaskId: null, note: '' };
        return journal({ ...state, travelAnchor: visit.locationId, travelAnchorSections: entrySections }, visit);
    }
    function snapshotVisit(state, tasks) {
        if (state.currentVisit?.status !== 'pending_calculation') return state;
        const reachableIds = new Set(state.currentVisit.reachableTaskIds || []);
        const arrivalSections = new Set(state.currentVisit.arrivalSections || []);
        const visit = { ...state.currentVisit, candidateTaskIds: [...new Set(tasks.filter(t => t.eligible &&
            (reachableIds.size ? reachableIds.has(t.taskId) : t.activeOrigins.some(o => o.chunkId === state.currentVisit.locationId &&
                (!arrivalSections.size || !o.sectionId || arrivalSections.has(o.sectionId))))).map(t => t.taskId))] };
        // Keep compact display/category metadata so an invalidated or subsequently
        // removed database entry is still intelligible and completable after reload.
        const snapshotIds = new Set(visit.candidateTaskIds);
        visit.candidateTasks = Object.fromEntries(tasks.filter(t => snapshotIds.has(t.taskId)).map(t =>
            [t.taskId, { name: t.name, skill: t.skill, displayName: t.displayName, level: t.level || null,
                equipmentName: t.equipmentName || null, taskClass: t.taskClass || null,
                enablerItemKey: t.enablerItemKey || null, provesAcquiredItemKeys: t.provesAcquiredItemKeys || [],
                capabilities: t.capabilities || [], bisReason: t.bisReason || null, bisSet: t.bisSet || null }]));
        visit.status = visit.candidateTaskIds.length ? 'task_required' : 'resolved';
        if (!visit.candidateTaskIds.length) visit.resolution = 'no_tasks';
        return journal(state, visit);
    }
    function recalculateCurrentVisit(state, reason = 'Recalculated after run import', timestamp = new Date().toISOString()) {
        if (!state.currentVisit || state.currentVisit.status === 'resolved') return state;
        const previous = state.currentVisit;
        const visit = { ...previous, candidateTaskIds: [], candidateTasks: {}, status: 'pending_calculation',
            resolution: null, resolvedTaskId: null };
        const next = journal(state, visit);
        return { ...next, adminHistory: [...next.adminHistory, { timestamp, action: 'recalculate_imported_current_visit',
            visitNumber: visit.visitNumber, locationId: visit.locationId, previousCandidateCount: previous.candidateTaskIds.length, reason }] };
    }
    function resolveVisit(state, completedIds) {
        if (state.currentVisit?.status !== 'task_required') return state;
        const id = state.currentVisit.candidateTaskIds.find(id => completedIds.has(id));
        return id ? journal(state, { ...state.currentVisit, status: 'resolved', resolution: 'task_completed', resolvedTaskId: id }) : state;
    }
    function voidVisit(state, note = '') {
        if (!state.currentVisit || canRoll(state)) return state;
        return journal(state, { ...state.currentVisit, status: 'resolved', resolution: 'admin_void', note });
    }

    function expand(value, groups = {}) {
        const name = String(value).replaceAll('*', '').split('[+]x')[0] + (String(value).includes('[+]x') ? '[+]' : '');
        return groups[name] || [name];
    }

    function buildEnablerModel(data, annotations = {}) {
        const codes = data.codeItems || {}, groups = codes.itemsPlus || {}, levels = data.toolLevels || {};
        const config = annotations.persistentEnablers || {};
        const excludedItems = new Set(config.nonPersistentItems || []), excludedGroups = new Set(config.nonPersistentGroups || []);
        const forcedItems = new Set(config.persistentItems || []), forcedGroups = new Set(config.persistentGroups || []);
        if (annotations.forestry?.kitItem) forcedItems.add(annotations.forestry.kitItem);
        const bisItems = new Map();
        for (const [name, meta] of Object.entries(data.challenges?.Extra || {})) {
            if (!(meta.Category || []).includes('BIS Skilling') || meta.Items?.length !== 1) continue;
            const choices = expand(meta.Items[0], groups);
            if (choices.length === 1) bisItems.set(canonicalItemKey(choices[0]), { taskName: name, set: meta.Set || null });
        }
        const groupSkills = new Map(), referenced = new Set(), ambiguous = [];
        for (const [skill, allTasks] of Object.entries(data.challenges || {})) for (const meta of Object.values(allTasks || {})) {
            for (const raw of meta.Items || []) {
                if (raw.includes('*')) continue;
                const key = canonicalItemKey(raw).split('[+]x')[0] + (raw.includes('[+]x') ? '[+]' : '');
                referenced.add(key);
                if (groups[key] && SKILLS.includes(skill) && Number.isFinite(meta.Level)) {
                    const counts = groupSkills.get(key) || {};
                    counts[skill] = (counts[skill] || 0) + 1; groupSkills.set(key, counts);
                }
            }
        }
        const ownerSkill = group => {
            const counts = groupSkills.get(group) || {};
            return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0] || null;
        };
        const capabilities = [], byRequirement = new Map(), byItem = new Map();
        const add = capability => {
            capabilities.push(capability); byRequirement.set(capability.requirementKey, capability);
            for (const item of capability.satisfyingItems) {
                const list = byItem.get(item.itemKey) || []; list.push(capability); byItem.set(item.itemKey, list);
            }
        };
        for (const [group, rawMembers] of Object.entries(groups)) {
            if (!referenced.has(group)) continue;
            const members = [...new Set((rawMembers || []).map(canonicalItemKey))];
            const strongLevelFamily = own(levels, group);
            const supported = members.filter(item => own(codes.tools, item) || bisItems.has(item));
            const persistent = forcedGroups.has(group) || (!excludedGroups.has(group) &&
                (strongLevelFamily || (members.length > 0 && supported.length === members.length && supported.length > 0)));
            if (!persistent) {
                if (supported.length || excludedGroups.has(group)) ambiguous.push({ requirement: group,
                    reason: excludedGroups.has(group) ? 'Configured as consumable/non-persistent because upstream tool metadata is broader than persistence' :
                        'Mixed item group has reusable-tool signals but does not prove that every alternative is persistent',
                    satisfyingItems: members });
                continue;
            }
            const skill = ownerSkill(group);
            add({ capabilityId: 'group:' + group, requirementKey: group,
                label: stripMarkup(group.replace(/\[\+\](?:x\d+)?$/, '')) + (skill ? ' · ' + skill : ''),
                familyType: strongLevelFamily ? 'levelled_tool_family' : 'reusable_tool_family', skill,
                classificationReason: strongLevelFamily ? 'Upstream toolLevels family used by action requirements' :
                    'Every upstream item-group alternative is tagged as a tool or a BIS Skilling item',
                satisfyingItems: members.map(itemKey => ({ itemKey, minimumUseLevel: levels[group]?.[itemKey] ?? null,
                    skillingBis: bisItems.get(itemKey) || null })) });
        }
        const groupedItems = new Set(capabilities.flatMap(capability => capability.satisfyingItems.map(item => item.itemKey)));
        for (const item of referenced) {
            if (groups[item] || groupedItems.has(item) || excludedItems.has(item)) continue;
            const persistent = forcedItems.has(item) || (own(codes.tools, item) && !own(codes.magicTools, item) && data.equipment?.[item]?.is_consumable !== true);
            if (!persistent) {
                if (own(codes.tools, item) || excludedItems.has(item)) ambiguous.push({ requirement: item,
                    reason: excludedItems.has(item) ? 'Configured as consumable/non-persistent despite the broad upstream tools table' :
                        'Upstream marks this item as a consumable equipment item or transformation input', satisfyingItems: [item] });
                continue;
            }
            add({ capabilityId: 'item:' + item, requirementKey: item, label: stripMarkup(item), familyType: 'reusable_item', skill: null,
                classificationReason: forcedItems.has(item) ? 'Explicit persistence annotation for missing upstream metadata' :
                    'Unstarred action requirement present in upstream codeItems.tools and not marked consumable',
                satisfyingItems: [{ itemKey: item, minimumUseLevel: null, skillingBis: bisItems.get(item) || null }] });
        }
        for (const item of forcedItems) if (!byItem.has(item)) add({ capabilityId: 'item:' + item, requirementKey: item,
            label: stripMarkup(item), familyType: 'reusable_item', skill: null,
            classificationReason: 'Explicit persistence annotation for missing upstream metadata',
            satisfyingItems: [{ itemKey: item, minimumUseLevel: null, skillingBis: bisItems.get(item) || null }] });
        return { capabilities, byRequirement, byItem, ambiguous };
    }

    function chooseItemCapability(model, itemKey, skill) {
        const choices = (model.byItem.get(itemKey) || []).slice();
        return choices.sort((a, b) => Number(b.familyType === 'levelled_tool_family') - Number(a.familyType === 'levelled_tool_family') ||
            Number(b.skill === skill) - Number(a.skill === skill) || a.satisfyingItems.length - b.satisfyingItems.length)[0] || null;
    }

    function taskEnablerRequirements(data, skill, meta, model, taskClass = null) {
        if (taskClass === 'bis' || taskClass === 'collection' || skill === 'Nonskill') return [];
        const result = [];
        for (const raw of meta.Items || []) {
            if (raw.includes('*')) continue;
            const key = canonicalItemKey(raw).split('[+]x')[0] + (raw.includes('[+]x') ? '[+]' : '');
            const grouped = model.byRequirement.get(key);
            if (grouped) result.push({ capabilityId: grouped.capabilityId, capabilityLabel: grouped.label,
                capabilitySkill: grouped.skill, familyType: grouped.familyType, satisfyingItems: grouped.satisfyingItems,
                requirementKey: key, requiresSpecificItem: false, itemKey: null });
            else {
                const itemKey = canonicalItemKey(raw), family = chooseItemCapability(model, itemKey, skill);
                if (family) result.push({ capabilityId: family.capabilityId, capabilityLabel: family.label,
                    capabilitySkill: family.skill, familyType: family.familyType, satisfyingItems: family.satisfyingItems,
                    requirementKey: itemKey, requiresSpecificItem: family.satisfyingItems.length > 1, itemKey });
            }
        }
        return result.filter((requirement, index) => result.findIndex(other => other.capabilityId === requirement.capabilityId &&
            other.itemKey === requirement.itemKey) === index);
    }

    function itemUsableForRequirement(item, requirement, state, data, taskSkill = null) {
        if (item.minimumUseLevel != null && requirement.capabilitySkill && (!taskSkill || taskSkill === requirement.capabilitySkill) &&
            (state.actualLevels?.[requirement.capabilitySkill] || 1) < item.minimumUseLevel) return false;
        if (['Attack', 'Strength', 'Defence', 'Ranged', 'Magic'].includes(taskSkill)) {
            for (const [skill, level] of Object.entries(data.equipment?.[item.itemKey]?.requirements || {})) {
                if ((state.actualLevels?.[skill] || 1) < level) return false;
            }
        }
        return true;
    }

    function enablerRequirementStatus(requirement, state, data, taskSkill = null) {
        const usable = requirement.satisfyingItems.filter(item => itemUsableForRequirement(item, requirement, state, data, taskSkill));
        const acquired = usable.filter(item => own(state.acquiredEnablers, item.itemKey));
        const satisfied = requirement.requiresSpecificItem ? acquired.some(item => item.itemKey === requirement.itemKey) : acquired.length > 0;
        return { ...requirement, usableItems: usable.map(item => item.itemKey), acquiredItems: acquired.map(item => item.itemKey), satisfied };
    }

    function specificAcquisitionItems(data, skill, meta, taskClass, model) {
        if (!['bis', 'collection'].includes(taskClass) || meta.Items?.length !== 1 || meta.Items[0].includes('*')) return [];
        const choices = expand(meta.Items[0], data.codeItems?.itemsPlus);
        return choices.length === 1 && model.byItem.has(canonicalItemKey(choices[0])) ? [canonicalItemKey(choices[0])] : [];
    }

    function recoverAcquiredEnablers(state, legacy = {}, data = {}, ids = {}, annotations = {}) {
        if (state.enablersInitialized) return state;
        const next = { ...state, acquiredEnablers: { ...state.acquiredEnablers }, enablersInitialized: true };
        const model = buildEnablerModel(data, annotations), proven = new Set();
        for (const storeName of ['checkedAllTasks', 'checkedChallenges', 'completedChallenges']) {
            for (const entries of Object.values(legacy[storeName] || {})) for (const [key, flag] of Object.entries(entries || {})) {
                if (flag !== false) { const item = enablerItemFromTaskId(key); if (item) proven.add(item); }
            }
        }
        for (const [skill, allTasks] of Object.entries(data.challenges || {})) for (const [name, meta] of Object.entries(allTasks || {})) {
            const metadata = taskMetadata(name, skill, meta, ids);
            if (!isComplete(metadata, legacy)) continue;
            for (const requirement of taskEnablerRequirements(data, skill, meta, model, metadata.taskClass)) {
                if (requirement.requiresSpecificItem) proven.add(requirement.itemKey);
            }
            specificAcquisitionItems(data, skill, meta, metadata.taskClass, model).forEach(item => proven.add(item));
        }
        for (const item of Object.keys(legacy.manualEquipment || {})) if (model.byItem.has(item)) proven.add(item);
        for (const item of proven) if (model.byItem.has(item)) next.acquiredEnablers[item] = {
            imported: true, acquiredAt: new Date().toISOString(), evidence: 'Specific completed task or equipment record from older import' };
        return next;
    }

    // A task's Level is checked here ONLY when that task is explicitly a source/access prerequisite.
    function createAccess(data, state, legacy, ids = {}, rules = {}, locationAllowed = null) {
        const diagnostics = new Map(), cache = new Map();
        const codes = data.codeItems || {};
        const completed = (name, skill) => isComplete({ name, skill, taskId: taskId(name, skill, ids) }, legacy);
        const completedQuests = new Set(Object.entries(data.challenges.Quest || {}).filter(([name, task]) =>
            task.QuestPoints !== undefined && completed(name, 'Quest')).map(([, task]) => task.BaseQuest));
        const actualPoints = Object.entries(data.challenges.Quest || {}).reduce((sum, [name, task]) => sum +
            (completed(name, 'Quest') ? Number(task.QuestPoints || 0) : 0), 0);
        const combat = () => Math.floor((state.actualLevels.Defence + state.actualLevels.Hitpoints + Math.floor(state.actualLevels.Prayer / 2)) / 4 +
            .325 * Math.max(state.actualLevels.Attack + state.actualLevels.Strength, Math.floor(state.actualLevels.Ranged * 1.5), Math.floor(state.actualLevels.Magic * 1.5)));
        function task(name, skill, visiting = new Set()) {
            name = name.split('--')[0];
            const key = 'task:' + taskId(name, skill, ids);
            if (own(state.accessOverrides, key)) return { allowed: state.accessOverrides[key], key, reason: 'Manual access override' };
            const meta = data.challenges[skill]?.[name];
            if (cache.has(key)) return cache.get(key);
            const finish = (allowed, reason, unresolved = false) => {
                const result = { allowed, key, name, skill, reason, unresolved };
                // Geography expands during this same worker calculation. A gate
                // or ancestor depending on it must be evaluated against that state.
                if (!meta?.Chunks && !meta?.Tasks) cache.set(key, result);
                if (!allowed || unresolved) diagnostics.set(key, result);
                else diagnostics.delete(key);
                return result;
            };
            const done = completed(name, skill);
            if (done && (!meta || skill === 'Quest' || skill === 'Diary')) return finish(true, 'Actually completed');
            if (!meta) return finish(false, 'Missing access prerequisite metadata; override required', true);
            if (skill === 'Quest' && completedQuests.has(meta.BaseQuest)) return finish(true, 'Base quest actually completed');
            if (skill === 'Quest' || skill === 'Diary') return finish(false, 'Requires actual task/quest progress completion');
            if (visiting.has(key)) return finish(false, 'Cyclic access prerequisites; override required', true);
            const next = new Set(visiting).add(key);
            if (meta['Not F2P'] && rules.F2P) return finish(false, 'Members source under F2P rules');
            if (name === 'F2P Only') return finish(!!rules.F2P, 'Existing F2P-only gate');
            const levels = { ...meta.Skills, ...meta.SkillsNeeded };
            if (meta.Level != null && SKILLS.includes(skill)) levels[skill] = meta.Level;
            for (const [s, level] of Object.entries(levels)) {
                const current = s === 'Combat' ? combat() : state.actualLevels[s];
                if (current == null) return finish(false, 'Unknown access skill: ' + s, true);
                if (current < level) return finish(false, 'Requires actual ' + s + ' ' + level + ' (current ' + current + ')');
            }
            for (const group of meta.Chunks || []) {
                if (!locationAllowed) return finish(false, 'Access geography cannot be verified; override required', true);
                const count = group.includes('[+]x') ? Number(group.split('[+]x')[1]) : 1;
                if (expand(group, codes.chunksPlus).filter(locationAllowed).length < count) {
                    return finish(false, 'Requires unlocked access geography: ' + group);
                }
            }
            if (done) return finish(true, 'Actually completed; actual access levels and geography met');
            if (meta.QuestPointsNeeded > actualPoints) return finish(false, 'Requires actual quest points: ' + meta.QuestPointsNeeded);
            if (meta.CombatLevelNeeded > combat()) return finish(false, 'Requires actual combat level: ' + meta.CombatLevelNeeded);
            if (meta.TotalLevelNeeded > Object.values(state.actualLevels).reduce((a, b) => a + b, 0)) return finish(false, 'Requires actual total level');
            for (const [sub, category] of Object.entries(meta.Tasks || {})) {
                const choices = expand(sub, codes.tasksPlus);
                const count = sub.includes('[+]x') ? Number(sub.split('[+]x')[1]) : 1;
                if (choices.filter(n => task(n, category, next).allowed).length < count) return finish(false, 'Requires actual prerequisite: ' + displayName(sub));
            }
            // Inventory/action gates cannot be inferred from theoretical item availability.
            if (meta.Items?.length || meta.Monsters?.length || meta.Objects?.length || meta.Output || meta.KudosNeeded || meta.CombatPointsNeeded || meta.Primary === true) {
                return finish(false, 'Action, inventory or progress gate needs completion or an access override', true);
            }
            if (!Object.keys(levels).length && !meta.Tasks && !meta.Chunks && !meta.UnlocksArea && !meta.ConnectsSections && !meta.QuestPointsNeeded && !meta.CombatLevelNeeded && !meta['Not F2P']) {
                return finish(false, 'Access conditions are not explicit; override required', true);
            }
            return finish(true, 'Explicit actual access requirements met');
        }
        const all = requirements => (requirements || []).every(group => Object.entries(group).every(([name, skill]) =>
            expand(name, codes.tasksPlus).filter(n => task(n, skill).allowed).length >= (name.includes('[+]x') ? Number(name.split('[+]x')[1]) : 1)));
        return { task, all, diagnostics, completed, actualQuestPoints: actualPoints, actualCombatLevel: combat() };
    }

    // baseChunkData is the legacy source graph. Retain it; build a memoized sidecar.
    function buildTasks({ data, valids, base, ids = {}, rules = {}, state, legacy = {}, unlocked = {}, sections = {}, manualSections = {}, annotations = {} }) {
        const codes = data.codeItems || {}, tasks = new Map(), sourceCache = new Map(), originCache = new Map();
        const diagnostics = [], accessDiagnostics = [], enablerModel = buildEnablerModel(data, annotations);
        const pendingCapabilities = new Map();
        const knownNames = new Map();
        // Prefer native quest/diary/extra entries over worker-generated skill projections.
        const categories = Object.keys(valids).sort((a, b) => ['Quest', 'Diary', 'Extra', 'BiS'].indexOf(b) - ['Quest', 'Diary', 'Extra', 'BiS'].indexOf(a));
        for (const category of ['Quest', 'Diary', 'Extra', 'BiS', ...SKILLS, 'Nonskill']) {
            for (const name of Object.keys(data.challenges[category] || {})) if (!knownNames.has(name)) knownNames.set(name, category);
        }
        const origin = (location, type, name, reason) => {
            const parsed = parseLocation(location);
            return parsed && locationAvailable(parsed, unlocked, sections, manualSections) ? [{ ...parsed, sourceType: type, sourceName: name, reason }] : [];
        };
        function fixed(type, name) {
            const key = type + ':' + name;
            if (!sourceCache.has(key)) sourceCache.set(key, Object.keys(base[type]?.[name] || {}).flatMap(location =>
                origin(location, type, name, 'Validated ' + type + ' source')));
            return sourceCache.get(key);
        }
        function acquisitionOrigins(itemName, source, origins) {
            const requirements = data.taskUnlocks?.Items?.[itemName + '^' + source] || [];
            // The dataset sometimes reuses one monster name across regions but
            // gives a drop only in one of them. Pure geography prerequisites
            // constrain that drop's origins; an enabling action (e.g. visiting a
            // task giver) does not become the drop's geographical anchor.
            const regions = requirements.flatMap(group => Object.entries(group).flatMap(([name, skill]) => {
                const meta = data.challenges[skill]?.[name];
                return meta?.Chunks && Object.keys(meta).every(key => key === 'Chunks') ? meta.Chunks : [];
            }));
            return origins.filter(o => regions.every(group => expand(group, codes.chunksPlus).some(location => {
                const parsed = parseLocation(location);
                return parsed && parsed.chunkId === o.chunkId && (!parsed.sectionId || parsed.sectionId === o.sectionId);
            })));
        }
        function item(name, visiting) {
            name = name.replaceAll('*', '');
            const key = 'item:' + name;
            if (visiting.has(key)) return [];
            if (sourceCache.has(key)) return sourceCache.get(key);
            const next = new Set(visiting).add(key);
            const origins = Object.entries(base.items?.[name] || base.items?.[name + '*'] || {}).flatMap(([source, type]) => {
                if (String(type).includes('spawn')) return origin(source, 'spawn', name, 'Direct item spawn');
                if (type === 'shop' && base.shops?.[source]) return fixed('shops', source);
                if (String(type).includes('drop')) return acquisitionOrigins(name, source, fixed('monsters', source));
                const direct = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
                if (direct.length) return direct;
                const category = knownNames.get(source);
                return category ? taskOrigins(source, category, next) : [];
            });
            const result = uniqueOrigins(origins);
            // Do not memoize an unresolved cycle as a permanent negative result.
            if (result.length) sourceCache.set(key, result);
            return result;
        }
        function taskOrigins(name, skill, visiting = new Set()) {
            const key = 'task:' + skill + ':' + name;
            if (visiting.has(key)) return [];
            if (originCache.has(key)) return originCache.get(key);
            const next = new Set(visiting).add(key), meta = data.challenges[skill]?.[name] || {};
            const id = taskId(name, skill, ids);
            if (own(state.originOverrides, id)) return state.originOverrides[id].map(loc => ({ ...parseLocation(loc), sourceType: 'manual', sourceName: 'Manual origin', reason: 'User origin override' }));
            let result = [];
            const constraints = (meta.Chunks || []).flatMap(chunk => expand(chunk, codes.chunksPlus)).map(parseLocation).filter(Boolean);
            const constrain = list => constraints.length ? list.filter(o => constraints.some(c => c.chunkId === o.chunkId && (!c.sectionId || c.sectionId === o.sectionId))) : list;
            // The cooking object group includes Player fire. It describes a processing
            // facility, not a unique geographic action. Starred Items mark consumed resources.
            const portableGroups = codes.boardlockedPortableObjects || ['Cooking object[+]'];
            const portable = meta.Objects?.length && meta.Objects.every(o => portableGroups.includes(o));
            for (const [field, type, group] of [['NPCs', 'npcs', 'npcsPlus'], ['Monsters', 'monsters', 'monstersPlus'], ['Objects', 'objects', 'objectsPlus']]) {
                if (field === 'Objects' && portable) continue;
                result.push(...(meta[field] || []).flatMap(n => expand(n, codes[group]).flatMap(source => fixed(type, source))));
            }
            result = constrain(result);
            if (!result.length) {
                const marked = (meta.Items || []).filter(n => n.includes('*'));
                const resources = marked.length ? marked : (meta.Items || []);
                // One primary resource is confidently attributable; several independent
                // inputs are ambiguous. Retain fixed facilities/metadata when available.
                if (resources.length === 1) result = constrain(expand(resources[0], codes.itemsPlus).flatMap(n => item(n, next)));
            }
            if (!result.length) result = constraints.flatMap(c => origin(c.chunkId + (c.sectionId ? '-' + c.sectionId : ''), 'metadata', name, 'Explicit task geography'));
            result = uniqueOrigins(result);
            if (result.length) originCache.set(key, result);
            return result;
        }
        const forestry = annotations.forestry || {};
        const forestryCategories = new Set(forestry.taskCategories || []);
        const isDirectForestry = meta => (meta?.Category || []).some(category => forestryCategories.has(category));
        const excludedForestryLocations = new Set((forestry.excludedOriginGroups || []).flatMap(group =>
            expand(group, codes.chunksPlus)).map(location => {
                const parsed = parseLocation(location);
                return parsed && parsed.chunkId + (parsed.sectionId ? '-' + parsed.sectionId : '');
            }).filter(Boolean));
        const isExcludedForestryOrigin = source => excludedForestryLocations.has(source.chunkId) ||
            excludedForestryLocations.has(source.chunkId + (source.sectionId ? '-' + source.sectionId : ''));
        const filterForestryOrigins = list => uniqueOrigins(list).filter(source => !isExcludedForestryOrigin(source));
        const forestryItemCache = new Map();
        function taskNeedsForestry(name, skill, visiting = new Set()) {
            const meta = data.challenges[skill]?.[name];
            if (!meta) return false;
            if (isDirectForestry(meta)) return true;
            return (meta.Items || []).some(group => {
                const choices = expand(group, codes.itemsPlus);
                return choices.length && choices.every(itemName => itemNeedsForestry(itemName, visiting));
            });
        }
        function itemNeedsForestry(name, visiting = new Set()) {
            name = name.replaceAll('*', '');
            if (name === forestry.kitItem || visiting.has(name)) return false;
            if (forestryItemCache.has(name)) return forestryItemCache.get(name);
            const sources = Object.keys(base.items?.[name] || base.items?.[name + '*'] || {});
            if (!sources.length) return false;
            const next = new Set(visiting).add(name);
            const result = sources.every(source => {
                const category = knownNames.get(source);
                return !!category && taskNeedsForestry(source, category, next);
            });
            forestryItemCache.set(name, result);
            return result;
        }
        const kitOrigins = forestry.kitItem ? uniqueOrigins(item(forestry.kitItem, new Set())) : [];
        const forestryKitAcquired = !!forestry.kitItem && own(state.acquiredEnablers, forestry.kitItem);
        const forestryTreeRecords = [];
        for (const [skill, allTasks] of Object.entries(data.challenges || {})) for (const [name, meta] of Object.entries(allTasks || {})) {
            if (!isDirectForestry(meta) || !meta.Objects?.length ||
                (meta.Category || []).includes('ForestryXp')) continue;
            const constraints = (meta.Chunks || []).flatMap(chunk => expand(chunk, codes.chunksPlus)).map(parseLocation).filter(Boolean);
            let before = meta.Objects.flatMap(object => expand(object, codes.objectsPlus).flatMap(source => fixed('objects', source)));
            if (constraints.length) before = before.filter(source => constraints.some(constraint => constraint.chunkId === source.chunkId &&
                (!constraint.sectionId || constraint.sectionId === source.sectionId)));
            forestryTreeRecords.push({ name, skill, treeTypes: meta.Objects.flatMap(object => expand(object, codes.objectsPlus)),
                validSources: filterForestryOrigins(before), excludedSources: uniqueOrigins(before).filter(isExcludedForestryOrigin) });
        }
        const equipmentByFormattedName = new Map(Object.entries(data.equipment || {}).map(([name, meta]) => [(meta.formatted_name || name.toLowerCase()).replaceAll('#', '/'), name]));
        for (const skill of categories) for (const [name, value] of Object.entries(valids[skill] || {})) {
            const meta = data.challenges[skill]?.[name] || {};
            if (skill === 'Nonskill' || value === false || meta.NeverShow) continue;
            if (SKILLS.includes(skill) || skill === 'Combat') { if (!rules['Show Skill Tasks']) continue; }
            if (skill === 'BiS' && !rules['Show Best in Slot Tasks']) continue;
            if (skill === 'Quest' && !rules['Show Quest Tasks']) continue;
            if (skill === 'Diary' && !rules['Show Diary Tasks'] && !rules['Show Diary Tasks Any']) continue;
            if ((meta.Category || []).includes('Collection Log') && (!rules['Collection Log'] ||
                (meta.Category.filter(c => c.startsWith('Collection Log ')).length && !meta.Category.some(c => c !== 'Collection Log' && rules[c])))) continue;
            const id = taskId(name, skill, ids);
            const equipmentName = skill === 'BiS' ? equipmentByFormattedName.get(name.split('|')[1]) : undefined;
            let origins = equipmentName ? item(equipmentName, new Set()) : taskOrigins(name, skill);
            const forestBound = !!forestry.kitItem && taskNeedsForestry(name, skill);
            const directTrees = forestryTreeRecords.filter(record => record.name === name && record.skill === skill);
            const treeSources = uniqueOrigins((directTrees.length ? directTrees : forestryTreeRecords).flatMap(record => record.validSources));
            const excludedTreeSources = uniqueOrigins((directTrees.length ? directTrees : forestryTreeRecords).flatMap(record => record.excludedSources));
            const treeTypes = [...new Set((directTrees.length ? directTrees : forestryTreeRecords).flatMap(record => record.treeTypes))];
            if (forestBound && (!origins.length || (meta.Category || []).includes('Collection Log'))) origins = treeSources;
            if (isDirectForestry(meta)) origins = filterForestryOrigins(origins);
            let record = { ...taskMetadata(name, skill, meta, ids), equipmentName,
                origins, available: true, enablers: [] };
            if (skill === 'BiS') {
                record.bisReason = stripMarkup(typeof value === 'string' ? value : meta.Label || record.bisReason);
                record.category = record.bisReason || 'BiS';
                if (record.bisReason) record.displayName = '[' + record.bisReason + '] ' + record.displayName;
            }
            let requirementMeta = meta, requirementSkill = skill;
            if (knownNames.has(name) && !SKILLS.includes(knownNames.get(name))) {
                const nativeSkill = knownNames.get(name), native = taskMetadata(name, nativeSkill, data.challenges[nativeSkill][name], ids);
                const combinedBisReason = [record.bisReason, native.bisReason].filter(Boolean)
                    .flatMap(reason => String(reason).split(/\/\u200b?/)).map(reason => reason.trim()).filter(Boolean)
                    .filter((reason, index, all) => all.indexOf(reason) === index).join('/\u200b');
                record = { ...record, taskClass: native.taskClass, classificationReason: native.classificationReason,
                    advancesSkillProgression: false, skilling: false,
                    bisReason: combinedBisReason, bisSet: native.bisSet };
                if (skill === 'BiS' && combinedBisReason) record.displayName = '[' + combinedBisReason + '] ' + displayName(record.name);
                requirementMeta = data.challenges[nativeSkill][name]; requirementSkill = nativeSkill;
            }
            if (record.taskClass === 'bis' && record.bisReason && !record.displayName.startsWith('[')) {
                record.displayName = '[' + record.bisReason + '] ' + record.displayName;
            }
            record.equipmentObjectiveAlternatives = equipmentObjectiveAlternatives(data, name, requirementMeta);
            const requiredEnablers = taskEnablerRequirements(data, requirementSkill, requirementMeta, enablerModel, record.taskClass)
                .map(requirement => enablerRequirementStatus(requirement, state, data, requirementSkill));
            record.provesAcquiredItemKeys = specificAcquisitionItems(data, requirementSkill, requirementMeta, record.taskClass, enablerModel);
            for (const requirement of requiredEnablers) if (requirement.requiresSpecificItem) record.provesAcquiredItemKeys.push(requirement.itemKey);
            if (forestBound) {
                const kitAcquired = forestryKitAcquired, kitObtainable = kitOrigins.length > 0;
                const treeValid = treeSources.length > 0;
                const reason = !kitAcquired && !kitObtainable ? 'Forestry kit unavailable: no accessible ' + (forestry.kitNpc || 'kit provider') :
                    !kitAcquired ? 'Forestry kit is obtainable but has not been registered as acquired' :
                    !treeValid ? 'No eligible non-Guild Forestry tree source is accessible' : 'Acquired Forestry kit and eligible non-Guild tree source verified';
                record.available = kitAcquired && treeValid;
                record.enablers = [
                    { type: 'persistent_item', name: forestry.kitItem, provider: forestry.kitNpc || null, origins: kitOrigins,
                        acquired: kitAcquired, obtainable: kitObtainable, valid: kitAcquired },
                    { type: 'forestry_tree', treeTypes, origins: treeSources, excludedOrigins: excludedTreeSources, valid: treeValid,
                        currentlyAccessible: treeValid, reason: 'Tree object is referenced by Forestry task metadata and is outside excluded origin groups' }
                ];
                record.accessResult = { allowed: record.available, reason, forestry: true,
                    kit: { item: forestry.kitItem, provider: forestry.kitNpc || null, origins: kitOrigins,
                        acquired: kitAcquired, obtainable: kitObtainable, valid: kitAcquired },
                    treeSource: { treeTypes, origins: treeSources, excludedOrigins: excludedTreeSources, valid: treeValid,
                        currentlyAccessible: treeValid, reason: 'Tree object is referenced by Forestry task metadata and is outside excluded origin groups' } };
                if (!record.available) accessDiagnostics.push({ taskId: id, name: record.displayName, ...record.accessResult });
            } else record.accessResult = { allowed: true, reason: 'Passed strict source, rule and prerequisite calculation' };
            if (requiredEnablers.length) {
                record.enablers.push(...requiredEnablers.map(requirement => ({ type: 'persistent_capability', ...requirement })));
                const missing = requiredEnablers.filter(requirement => !requirement.satisfied);
                if (missing.length) {
                    record.available = false;
                    const detail = missing.map(requirement => requirement.requiresSpecificItem ? requirement.itemKey : requirement.capabilityLabel).join(', ');
                    const existing = record.accessResult?.allowed === false ? record.accessResult.reason + '; ' : '';
                    record.accessResult = { ...(record.accessResult || {}), allowed: false,
                        reason: existing + 'Persistent enabler not acquired: ' + detail, persistentEnablers: requiredEnablers };
                    accessDiagnostics.push({ taskId: id, name: record.displayName, allowed: false,
                        reason: record.accessResult.reason, persistentEnablers: requiredEnablers });
                } else record.accessResult = { ...(record.accessResult || {}), persistentEnablers: requiredEnablers };
                for (const requirement of missing) {
                    const baseStatus = enablerRequirementStatus({ ...requirement, requiresSpecificItem: false, itemKey: null }, state, data, requirementSkill);
                    if (requirement.requiresSpecificItem && baseStatus.satisfied) continue;
                    const entry = pendingCapabilities.get(requirement.capabilityId) || { requirement: { ...requirement,
                        requiresSpecificItem: false, itemKey: null }, requiredBy: [], requests: [] };
                    entry.requiredBy.push({ taskId: record.taskId, name: record.displayName, skill: record.skill,
                        requiresSpecificItem: requirement.requiresSpecificItem, itemKey: requirement.itemKey });
                    entry.requests.push({ requirement, taskSkill: requirementSkill });
                    pendingCapabilities.set(requirement.capabilityId, entry);
                }
            }
            if (forestBound && !own(state.acquiredEnablers, forestry.kitItem) && kitOrigins.length && treeSources.length) {
                const capability = chooseItemCapability(enablerModel, forestry.kitItem, requirementSkill);
                if (capability) {
                    const requirement = enablerRequirementStatus({ capabilityId: capability.capabilityId, capabilityLabel: capability.label,
                        capabilitySkill: capability.skill, familyType: capability.familyType, satisfyingItems: capability.satisfyingItems,
                        requirementKey: forestry.kitItem, requiresSpecificItem: false, itemKey: null }, state, data, requirementSkill);
                    const entry = pendingCapabilities.get(capability.capabilityId) || { requirement, requiredBy: [], requests: [] };
                    entry.requiredBy.push({ taskId: record.taskId, name: record.displayName, skill: record.skill,
                        requiresSpecificItem: false, itemKey: null });
                    entry.requests.push({ requirement, taskSkill: requirementSkill });
                    pendingCapabilities.set(capability.capabilityId, entry);
                }
            }
            if (!tasks.has(id)) tasks.set(id, record);
            else tasks.get(id).origins = uniqueOrigins([...tasks.get(id).origins, ...origins]);
        }
        const articleFor = itemName => /^[aeiou]/i.test(itemName) ? 'an ' : 'a ';
        for (const { requirement, requiredBy, requests } of pendingCapabilities.values()) {
            for (const itemInfo of requirement.satisfyingItems) {
                const supportsPendingAction = requests.some(request =>
                    (!request.requirement.requiresSpecificItem || request.requirement.itemKey === itemInfo.itemKey) &&
                    itemUsableForRequirement(itemInfo, request.requirement, state, data, request.taskSkill));
                if (own(state.acquiredEnablers, itemInfo.itemKey) || !supportsPendingAction) continue;
                const origins = uniqueOrigins(item(itemInfo.itemKey, new Set()));
                if (!origins.length) continue;
                const id = enablerTaskId(itemInfo.itemKey), name = 'Obtain ' + articleFor(itemInfo.itemKey) + '~|' + itemInfo.itemKey.toLowerCase() + '|~';
                const capabilities = (enablerModel.byItem.get(itemInfo.itemKey) || []).filter(capability => pendingCapabilities.has(capability.capabilityId));
                tasks.set(id, { taskId: id, name, displayName: displayName(name), skill: 'Unlocks / Tools', type: 'Unlocks / Tools',
                    category: 'Unlocks / Tools', sourceCategories: [], level: null, description: '', taskClass: 'enabler',
                    classificationReason: 'Specific obtainable reusable item establishes a missing persistent capability',
                    advancesSkillProgression: false, skilling: false, origins, available: true,
                    enablerItemKey: itemInfo.itemKey, provesAcquiredItemKeys: [itemInfo.itemKey],
                    capabilities: capabilities.map(capability => ({ capabilityId: capability.capabilityId, label: capability.label,
                        familyType: capability.familyType, skill: capability.skill, minimumUseLevel: itemInfo.minimumUseLevel })),
                    requiredBy, skillingBis: itemInfo.skillingBis,
                    accessResult: { allowed: true, reason: 'Persistent enabler is usable and directly obtainable from an accessible source',
                        itemKey: itemInfo.itemKey, origins, requiredBy } });
            }
        }
        const allEnablerItems = [...new Set(enablerModel.capabilities.flatMap(capability => capability.satisfyingItems.map(item => item.itemKey)))];
        const enablerCatalog = allEnablerItems.map(itemKey => {
            const itemOrigins = uniqueOrigins(item(itemKey, new Set()));
            return { itemKey, acquired: own(state.acquiredEnablers, itemKey), acquisition: state.acquiredEnablers[itemKey] || null,
                currentlyObtainable: itemOrigins.length > 0, origins: itemOrigins,
                capabilities: (enablerModel.byItem.get(itemKey) || []).map(capability => ({ capabilityId: capability.capabilityId,
                    label: capability.label, familyType: capability.familyType, skill: capability.skill,
                    minimumUseLevel: capability.satisfyingItems.find(item => item.itemKey === itemKey)?.minimumUseLevel ?? null,
                    classificationReason: capability.classificationReason })) };
        }).sort((a, b) => a.itemKey.localeCompare(b.itemKey));
        for (const record of tasks.values()) if (!record.origins.length) diagnostics.push({ taskId: record.taskId,
            name: record.displayName, reason: 'No confident action/resource origin in validated source metadata. Set an origin override.' });
        if (forestry.kitItem && ((!forestryKitAcquired && !kitOrigins.length) || !forestryTreeRecords.some(record => record.validSources.length))) {
            for (const [skill, allTasks] of Object.entries(data.challenges || {})) for (const [name, meta] of Object.entries(allTasks || {})) {
                if (!isDirectForestry(meta) || !(meta.Category || []).some(category => rules[category]) || tasks.has(taskId(name, skill, ids))) continue;
                const directTrees = forestryTreeRecords.filter(record => record.name === name && record.skill === skill);
                const treeRecords = directTrees.length ? directTrees : forestryTreeRecords;
                const treeSources = uniqueOrigins(treeRecords.flatMap(record => record.validSources));
                const excludedTreeSources = uniqueOrigins(treeRecords.flatMap(record => record.excludedSources));
                const reason = !forestryKitAcquired && !kitOrigins.length ? 'Forestry kit unavailable: no accessible ' + (forestry.kitNpc || 'kit provider') :
                    'No eligible non-Guild Forestry tree source is accessible';
                accessDiagnostics.push({ taskId: taskId(name, skill, ids), name: displayName(name), allowed: false, reason, forestry: true,
                    kit: { item: forestry.kitItem, provider: forestry.kitNpc || null, origins: kitOrigins,
                        acquired: own(state.acquiredEnablers, forestry.kitItem), obtainable: kitOrigins.length > 0,
                        valid: own(state.acquiredEnablers, forestry.kitItem) },
                    treeSource: { treeTypes: [...new Set(treeRecords.flatMap(record => record.treeTypes))], origins: treeSources,
                        excludedOrigins: excludedTreeSources, valid: treeSources.length > 0, currentlyAccessible: treeSources.length > 0,
                        reason: 'Tree object is referenced by Forestry task metadata and is outside excluded origin groups' } });
            }
        }
        return { tasks: [...tasks.values()], unassigned: diagnostics, accessDiagnostics,
            enablerCatalog, enablerAmbiguities: enablerModel.ambiguous };
    }
    return { VERSION, STARTING_SECTION_POLICY, SKILLS, PROGRESSION_WINDOWS, progressionWindow, progressionCeiling, own, copy, taskId, displayName, stripMarkup,
        canonicalItemKey, enablerTaskId, enablerItemFromTaskId, normalizeState, normalizeRunExport, normalizeBrowserSave,
        sanitizeLegacySnapshot, parseLocation, parseUnlockedLocations, locationAvailable,
        uniqueOrigins, isComplete, isBacklogged, completionIds, taskMetadata, equipmentObjectiveAlternatives, completedEquipmentItems,
        collapseRedundantEquipmentTasks, buildTaskCatalog,
        deriveProgressionHighWater, initializeProgression, reconcileProgression, setProgressionHighWater, skillMilestones, adaptTasks,
        buildTravelGraph, deriveConnectedFrontier, inferConnectedSections, inferTravelAnchor, inferLegacyAnchorSections, setTravelAnchor, derivePool, chooseCandidate,
        deriveStartingSections, migrateStartingSections, deriveStartingPool, chooseStartingCandidate, canRoll,
        startVisit, snapshotVisit, recalculateCurrentVisit, resolveVisit, voidVisit, journal, expand, buildEnablerModel, taskEnablerRequirements,
        enablerRequirementStatus, recoverAcquiredEnablers, createAccess, buildTasks };
});
