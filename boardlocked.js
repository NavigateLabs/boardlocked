/* Local-fork game rules. No DOM, Firebase, or geography mutations. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Boardlocked = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';
    const VERSION = 52;
    const ENABLER_REVISION = 2;
    const STARTING_SECTION_POLICY = 'one-connected-region-by-medium';
    const SKILLS = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
        'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing',
        'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecraft', 'Hunter',
        'Construction', 'Sailing'];
    const CLUE_TIERS = Object.freeze(['beginner', 'easy', 'medium', 'hard', 'elite', 'master']);
    const CLUE_TIER_RANK = Object.freeze(Object.fromEntries(CLUE_TIERS.map((tier, index) => [tier, index])));
    const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
    const copy = value => JSON.parse(JSON.stringify(value));
    const cleanName = name => String(name).replace(/\{\d+\}/g, '').replace(/^Kill .*? ~/u, 'Kill X ~');
    const taskId = (name, skill, map = {}) => String(map[cleanName(name)] || map[name] ||
        ('bl_manual_' + encodeURIComponent(skill) + '_' + encodeURIComponent(cleanName(name))));
    const displayName = name => String(name).replace(/[~|*]/g, '');
    const stripMarkup = value => String(value || '').replace(/<[^>]*>/g, '').replace(/\u200b/g, '').trim();
    const canonicalItemKey = name => String(name || '').replaceAll('*', '');
    const itemSourceAllowed = (annotations, itemName, source) =>
        !own(annotations?.unavailableItemSources?.[canonicalItemKey(itemName)], String(source));
    const comparableItemKey = name => canonicalItemKey(name).replaceAll('#', '/').trim().toLowerCase();
    const equipmentNumber = (item, key) => Number(item?.[key]) || 0;
    const equipmentDefenceTotal = item => ['defence_crush', 'defence_magic', 'defence_ranged', 'defence_slash', 'defence_stab']
        .reduce((sum, key) => sum + equipmentNumber(item, key), 0);
    const equipmentMeleeDefence = item => ['defence_crush', 'defence_slash', 'defence_stab']
        .reduce((sum, key) => sum + equipmentNumber(item, key), 0);
    const equipmentMeleeAttack = item => ['attack_crush', 'attack_slash', 'attack_stab']
        .reduce((sum, key) => sum + equipmentNumber(item, key), 0);
    const equipmentBestMeleeAttack = item => Math.max(...['attack_crush', 'attack_slash', 'attack_stab']
        .map(key => equipmentNumber(item, key)));
    const COMBAT_BIS_ROLES = ['Stab Tank', 'Slash Tank', 'Crush Tank', 'Ranged Tank', 'Magic Tank', 'Melee Tank',
        'Stab Flinch', 'Slash Flinch', 'Crush Flinch', 'Melee', 'Stab', 'Slash', 'Crush', 'Ranged', 'Magic', 'Prayer', 'Flinch'];
    function combatRolesFromBisReason(reason) {
        const parts = stripMarkup(reason).replace(/[\u200b-\u200d\uFEFF]/g, '').split('/')
            .map(value => value.trim()).filter(Boolean), roles = [];
        for (const part of parts) {
            const role = COMBAT_BIS_ROLES.find(value => part === value || part.startsWith(value + ' '));
            if (role && !roles.includes(role)) roles.push(role);
        }
        return roles;
    }
    function equipmentRoleScore(item, role) {
        if (!item) return null;
        const slot = item.slot, weapon = ['weapon', '2h'].includes(slot) && equipmentNumber(item, 'attack_speed') > 0;
        const strength = equipmentNumber(item, 'melee_strength'), speed = equipmentNumber(item, 'attack_speed');
        const style = role.startsWith('Stab') ? 'stab' : role.startsWith('Slash') ? 'slash' :
            role.startsWith('Crush') ? 'crush' : null;
        if (role.endsWith(' Tank')) {
            if (role === 'Melee Tank') return equipmentMeleeDefence(item);
            return equipmentNumber(item, role === 'Ranged Tank' ? 'defence_ranged' : role === 'Magic Tank' ?
                'defence_magic' : 'defence_' + style);
        }
        if (role === 'Prayer') return equipmentNumber(item, 'prayer');
        if (role === 'Flinch' || role.endsWith(' Flinch')) {
            const attack = style ? equipmentNumber(item, 'attack_' + style) : equipmentBestMeleeAttack(item);
            return attack + strength;
        }
        if (role === 'Melee' || ['Stab', 'Slash', 'Crush'].includes(role)) {
            const attack = style ? equipmentNumber(item, 'attack_' + style) : equipmentBestMeleeAttack(item);
            if (weapon) return speed > 0 ? (attack + strength + 64) / speed : null;
            const attackTotal = style ? attack : equipmentMeleeAttack(item);
            return 100000 * strength + 1000 * attackTotal + equipmentDefenceTotal(item);
        }
        if (role === 'Ranged') {
            // Ammo availability is run-specific. For weapons, only accept a
            // candidate that is no slower and no worse in either ranged stat;
            // the pairwise comparison below handles this conservative vector.
            if (weapon) return { speed, attack: equipmentNumber(item, 'attack_ranged'),
                strength: equipmentNumber(item, 'ranged_strength') };
            return 100000 * equipmentNumber(item, 'ranged_strength') +
                1000 * equipmentNumber(item, 'attack_ranged') + equipmentDefenceTotal(item);
        }
        if (role === 'Magic') {
            return 100000 * equipmentNumber(item, 'magic_damage') +
                1000 * equipmentNumber(item, 'attack_magic') + equipmentDefenceTotal(item);
        }
        return null;
    }
    function roleScoreAtLeast(candidate, target) {
        if (candidate == null || target == null) return false;
        if (typeof candidate === 'object' || typeof target === 'object') return typeof candidate === 'object' &&
            typeof target === 'object' && candidate.speed <= target.speed && candidate.attack >= target.attack &&
            candidate.strength >= target.strength;
        return candidate >= target;
    }
    function equipmentRequirementsMet(item, state) {
        return Object.entries(item?.requirements || {}).every(([skill, level]) =>
            skill !== 'Combat' && Number.isFinite(state?.actualLevels?.[skill]) && state.actualLevels[skill] >= Number(level));
    }
    function equipmentDominatesTask(data, task, candidateName, state = null, confirmedEquipped = false) {
        const target = data?.equipment?.[task?.equipmentName], candidate = data?.equipment?.[candidateName];
        const targetWeapon = ['weapon', '2h'].includes(target?.slot), candidateWeapon = ['weapon', '2h'].includes(candidate?.slot);
        if (!target || !candidate || candidateName === task.equipmentName ||
            (candidate.slot !== target.slot && !(targetWeapon && candidateWeapon))) return false;
        if (task.bisSet) {
            const candidateInSet = Object.values(data?.challenges?.Extra || {}).some(meta => meta?.Set === task.bisSet &&
                (meta.Items || []).some(raw => expand(raw, data.codeItems?.itemsPlus).some(item =>
                    comparableItemKey(item) === comparableItemKey(candidateName))));
            if (!candidateInSet) return false;
        }
        if (!confirmedEquipped && !equipmentRequirementsMet(candidate, state)) return false;
        const roles = combatRolesFromBisReason(task.bisReason);
        return roles.length > 0 && roles.every(role =>
            roleScoreAtLeast(equipmentRoleScore(candidate, role), equipmentRoleScore(target, role)));
    }
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
        Cooking: 15, Woodcutting: 15, Fletching: 15, Fishing: 10, Firemaking: 15, Crafting: 10,
        Smithing: 10, Mining: 10, Herblore: 10, Agility: 20, Thieving: 15, Slayer: 0,
        Farming: 20, Runecraft: 15, Hunter: 10, Construction: 10, Sailing: 20
    });
    const LEGACY_BAND_MINIMUMS = Object.freeze([1, 15, 30, 45, 60, 75, 90]);
    const progressionWindow = skill => PROGRESSION_WINDOWS[skill] || 10;

    function normalizeState(input) {
        if (input && (!Number.isInteger(input.version) || input.version < 1 || input.version > VERSION)) throw new Error('Unsupported Boardlocked state version: ' + input.version);
        const state = { version: VERSION, enabled: false, actualLevels: {}, currentVisit: null, travelAnchor: null,
            travelAnchorSections: null,
            visitHistory: [], originOverrides: {}, accessOverrides: {}, adminHistory: [],
            progressionHighWater: {}, progressionInitialized: false, rulePresetInitialized: false,
            combatProgression: { frontier: 1, mature: false, evidence: [] },
            slayerMasters: {}, blockedEncounters: {}, clueLocks: {}, clueTaskCooldown: 0,
            incidentalClues: { master: 0 },
            rulePresetRevision: 0, acquiredEnablers: {}, enablersInitialized: !input, enablerRevision: input ? 0 : ENABLER_REVISION,
            startingSectionPolicy: input ? null : STARTING_SECTION_POLICY,
            startingQuestPointFloor: 0,
            initialization: { turael: true, druidicRitual: !input, varlamore: false, wilderness: false, ocean: false },
            initializationApplied: {}, initializationTaskIds: {}, initializationLevelFloors: {} };
        if (input) {
            if (typeof input.enabled !== 'boolean' || !Array.isArray(input.visitHistory)) throw new Error('Invalid Boardlocked state');
            for (const key of ['currentVisit', 'visitHistory', 'originOverrides', 'accessOverrides', 'adminHistory']) {
                if (input[key] !== undefined) state[key] = copy(input[key]);
            }
            state.enabled = input.enabled;
            if (input.startingQuestPointFloor !== undefined) {
                if (!Number.isInteger(input.startingQuestPointFloor) || input.startingQuestPointFloor < 0) {
                    throw new Error('Invalid starting quest-point floor');
                }
                state.startingQuestPointFloor = input.startingQuestPointFloor;
            }
            state.startingSectionPolicy = input.startingSectionPolicy === STARTING_SECTION_POLICY ? STARTING_SECTION_POLICY : null;
            state.progressionInitialized = input.version >= 4 && input.progressionInitialized === true;
            state.rulePresetInitialized = input.version >= 2 && input.rulePresetInitialized === true;
            state.rulePresetRevision = Number.isInteger(input.rulePresetRevision) && input.rulePresetRevision >= 0 ? input.rulePresetRevision : 0;
            state.enablerRevision = Number.isInteger(input.enablerRevision) && input.enablerRevision >= 0 ? input.enablerRevision :
                (input.version >= 3 && input.enablersInitialized === true ? 1 : 0);
            state.enablersInitialized = input.version >= 3 && input.enablersInitialized === true && state.enablerRevision >= ENABLER_REVISION;
            if (input.version >= 6) {
                if (!input.initialization || Array.isArray(input.initialization) || typeof input.initialization !== 'object') {
                    throw new Error('Invalid initialization options');
                }
                for (const key of Object.keys(state.initialization)) {
                    if (key === 'turael' && input.version < 25 && input.initialization[key] === undefined) state.initialization[key] = true;
                    else {
                        if (typeof input.initialization[key] !== 'boolean') throw new Error('Invalid initialization option: ' + key);
                        state.initialization[key] = input.initialization[key];
                    }
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
            if (input.slayerMasters !== undefined) {
                if (!input.slayerMasters || Array.isArray(input.slayerMasters) || typeof input.slayerMasters !== 'object') {
                    throw new Error('Invalid Slayer master states');
                }
                for (const [master, status] of Object.entries(input.slayerMasters)) {
                    if (!master || !['pending', 'usable'].includes(status)) throw new Error('Invalid Slayer master state: ' + master);
                    state.slayerMasters[master] = status;
                }
            }
            const blockedSources = input.blockedEncounters !== undefined ? input.blockedEncounters : input.blockedBosses;
            if (blockedSources !== undefined) {
                if (!blockedSources || Array.isArray(blockedSources) || typeof blockedSources !== 'object') {
                    throw new Error('Invalid blocked encounter states');
                }
                for (const [encounter, blocked] of Object.entries(blockedSources)) {
                    if (!encounter || blocked !== true) throw new Error('Invalid blocked encounter state: ' + encounter);
                    state.blockedEncounters[encounter] = true;
                }
            }
            if (input.clueLocks !== undefined) {
                if (!input.clueLocks || Array.isArray(input.clueLocks) || typeof input.clueLocks !== 'object') {
                    throw new Error('Invalid clue lock states');
                }
                for (const [tier, lock] of Object.entries(input.clueLocks)) {
                    if (!CLUE_TIERS.includes(tier) || !lock || Array.isArray(lock) || typeof lock !== 'object' ||
                        (lock.manual !== true && typeof lock.stepId !== 'string' && typeof lock.name !== 'string') ||
                        (lock.targetChunkId != null && !parseLocation(lock.targetChunkId))) {
                        throw new Error('Invalid clue lock state: ' + tier);
                    }
                    state.clueLocks[tier] = copy(lock);
                    if (lock.manual === true && lock.targetChunkId != null) {
                        state.clueLocks[tier].targetChunkId = parseLocation(lock.targetChunkId).chunkId;
                    }
                }
            }
            if (input.clueTaskCooldown !== undefined) {
                if (!Number.isInteger(input.clueTaskCooldown) || input.clueTaskCooldown < 0 || input.clueTaskCooldown > 1) {
                    throw new Error('Invalid clue task cooldown');
                }
                state.clueTaskCooldown = input.clueTaskCooldown;
            }
            if (input.incidentalClues !== undefined) {
                if (!input.incidentalClues || Array.isArray(input.incidentalClues) || typeof input.incidentalClues !== 'object') {
                    throw new Error('Invalid incidental clue state');
                }
                for (const [tier, count] of Object.entries(input.incidentalClues)) {
                    if (!CLUE_TIERS.includes(tier) || !Number.isInteger(count) || count < 0 || count > 100) {
                        throw new Error('Invalid incidental clue count: ' + tier);
                    }
                    state.incidentalClues[tier] = count;
                }
            }
            if (input.combatProgression !== undefined) {
                const combat = input.combatProgression;
                if (!combat || Array.isArray(combat) || typeof combat !== 'object' ||
                    !Number.isInteger(combat.frontier) || combat.frontier < 1 || combat.frontier > 60 ||
                    typeof combat.mature !== 'boolean' || !Array.isArray(combat.evidence)) {
                    throw new Error('Invalid combat progression state');
                }
                state.combatProgression = {
                    frontier: combat.frontier,
                    mature: combat.mature,
                    evidence: combat.evidence.filter(entry => entry && typeof entry.monster === 'string' &&
                        Number.isInteger(entry.level) && entry.level >= 1).map(entry => ({
                            monster: entry.monster, level: entry.level,
                            taskId: typeof entry.taskId === 'string' ? entry.taskId : null,
                            completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : null
                        })).slice(-100)
                };
                if (state.combatProgression.mature) state.combatProgression.frontier = 60;
            } else if (Number(input.version) < 52) {
                // Older saves were generated before monster completions recorded
                // combat evidence. Seed them from their conservative recorded
                // melee/Hitpoints floor so the new rule applies without resetting
                // an established run all the way to level one.
                const inferred = Math.max(1, ...['Attack', 'Strength', 'Defence', 'Hitpoints']
                    .map(skill => Number(input.actualLevels?.[skill]) || (skill === 'Hitpoints' ? 10 : 1)));
                state.combatProgression = { frontier: Math.min(60, inferred), mature: inferred >= 60, evidence: [] };
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

    function startingLocationKey(locationId, sectionId = null) {
        return String(locationId) + (sectionId && sectionId !== '0' ? '-' + sectionId : '');
    }

    function annotatedSectionGates(annotations = {}, locationId, sectionId = null) {
        const id = String(locationId), keys = sectionId && sectionId !== '0' ?
            [id, startingLocationKey(id, sectionId)] : [id];
        return keys.map(key => annotations.sectionAccessRequirements?.[key]).filter(Boolean);
    }

    function directStartingRequirements(data = {}, annotations = {}, locationId, sectionId = null) {
        const id = String(locationId), keys = sectionId && sectionId !== '0' ? [id, startingLocationKey(id, sectionId)] : [id];
        const requirements = keys.map(key => {
            const annotated = annotations.initialization?.startingAccessRequirements?.[key] || {};
            const Tasks = { ...(annotated.Tasks || {}) };
            for (const quest of data.questSections?.[key] || []) Tasks[quest] = 'Quest';
            return {
                Tasks,
                Skills: { ...(annotated.Skills || {}) },
                SkillAlternatives: copy(annotated.SkillAlternatives || [])
            };
        });
        for (const gate of annotatedSectionGates(annotations, id, sectionId)) {
            const groups = Array.isArray(gate.requirements) ? gate.requirements : gate.requirements ? [gate.requirements] : [];
            requirements.push({ Tasks: Object.assign({}, ...groups), Skills: {}, SkillAlternatives: [] });
        }
        return mergeStartingRequirements(requirements);
    }

    function mergeStartingRequirements(requirements = []) {
        const merged = { Tasks: {}, Skills: {}, SkillAlternatives: [] };
        for (const requirement of requirements) {
            Object.assign(merged.Tasks, requirement?.Tasks || {});
            for (const [skill, level] of Object.entries(requirement?.Skills || {})) {
                merged.Skills[skill] = Math.max(merged.Skills[skill] || 1, Number(level) || 1);
            }
            merged.SkillAlternatives.push(...copy(requirement?.SkillAlternatives || []));
        }
        return merged;
    }

    function resolveStartingRequirements(data = {}, requirement = {}, currentLevels = {}) {
        const tasks = [], seen = new Set(), levels = { ...(requirement.Skills || {}) };
        let questPoints = 0, combatLevel = 0, totalLevel = 0;
        const addLevels = source => {
            for (const [skill, level] of Object.entries(source || {})) {
                if (SKILLS.includes(skill)) levels[skill] = Math.max(levels[skill] || 1, Number(level) || 1);
            }
        };
        const visit = (name, skill) => {
            const key = skill + '\u0000' + name;
            if (seen.has(key)) return;
            seen.add(key);
            const meta = data.challenges?.[skill]?.[name];
            tasks.push({ name, skill });
            if (!meta) return;
            addLevels({ ...meta.Skills, ...meta.SkillsNeeded });
            questPoints = Math.max(questPoints, Number(meta.QuestPointsNeeded) || 0);
            combatLevel = Math.max(combatLevel, Number(meta.CombatLevelNeeded) || 0);
            totalLevel = Math.max(totalLevel, Number(meta.TotalLevelNeeded) || 0);
            for (const [sub, category] of Object.entries(meta.Tasks || {})) {
                if (category !== 'Quest' && category !== 'Diary') continue;
                const choices = expand(sub, data.codeItems?.tasksPlus || {});
                if (sub.includes('[+]x')) choices.forEach(choice => visit(choice, category));
                else if (choices.length) visit(choices[0], category);
            }
        };
        for (const [name, skill] of Object.entries(requirement.Tasks || {})) visit(name, skill);
        for (const alternatives of requirement.SkillAlternatives || []) {
            const choices = Array.isArray(alternatives) ? alternatives : [alternatives];
            const best = choices.slice().sort((a, b) => {
                const cost = choice => Object.entries(choice || {}).reduce((sum, [skill, level]) =>
                    sum + Math.max(0, Number(level) - Number(currentLevels[skill] || 1)), 0);
                return cost(a) - cost(b);
            })[0];
            addLevels(best);
        }
        return { tasks, levels, questPoints, combatLevel, totalLevel };
    }

    function automaticStartingRequirementsAllowed(data = {}, annotations = {}, options = {}, locationId, sectionId = null) {
        const requirement = directStartingRequirements(data, annotations, locationId, sectionId);
        const allowedQuestBases = new Set();
        for (const [option, baseQuest] of Object.entries(annotations.initialization?.questBaseNames || {})) {
            if (options[option] === true) allowedQuestBases.add(baseQuest);
        }
        for (const [name, skill] of Object.entries(requirement.Tasks)) {
            const meta = data.challenges?.[skill]?.[name];
            if (skill !== 'Quest' || !meta?.BaseQuest || !allowedQuestBases.has(meta.BaseQuest)) return false;
        }
        const availableLevels = Object.fromEntries(SKILLS.map(skill => [skill, 1]));
        for (const [option, floors] of Object.entries(annotations.initialization?.levelFloors || {})) {
            if (!options[option]) continue;
            for (const [skill, level] of Object.entries(floors)) availableLevels[skill] = Math.max(availableLevels[skill] || 1, level);
        }
        if (Object.entries(requirement.Skills).some(([skill, level]) => (availableLevels[skill] || 1) < level)) return false;
        return requirement.SkillAlternatives.every(alternatives => (Array.isArray(alternatives) ? alternatives : [alternatives])
            .some(choice => Object.entries(choice || {}).every(([skill, level]) => (availableLevels[skill] || 1) >= level)));
    }

    function deriveStartingSections(data = {}, locationId, medium = 'land', allowedChunkIds = [], blacklisted = {}, sectionAllowed = () => true) {
        const id = String(locationId), sectionMap = data.sections?.[id] || {};
        const water = medium === 'water';
        const matching = Object.keys(sectionMap).filter(section => section !== '0' && section.startsWith('W') === water && sectionAllowed(section));
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

    function isWaterLocation(data = {}, locationId) {
        const parsed = parseLocation(locationId);
        if (!parsed) return false;
        if (parsed.sectionId) return parsed.sectionId.startsWith('W');
        return data.chunks?.[parsed.chunkId]?.Nickname === 'Ocean Chunk';
    }

    function travelMedium(data = {}, locationId) {
        return isWaterLocation(data, locationId) ? 'water' : 'land';
    }

    function isPortLanding(data = {}, locationId) {
        const parsed = parseLocation(locationId);
        if (!parsed) return false;
        const chunk = data.chunks?.[parsed.chunkId] || {};
        const contents = parsed.sectionId ? chunk.Sections?.[parsed.sectionId] || {} : chunk;
        const objects = Object.keys(contents.Object || {}), npcs = Object.keys(contents.NPC || {});
        return objects.some(name => /^(?:Gangplank(?: \(Sailing\))?|Mooring point|Sailors' Marker)/i.test(name)) ||
            npcs.some(name => /^Port master$/i.test(name));
    }

    function mediumConnectionAllowed(data = {}, from, to) {
        const fromMedium = travelMedium(data, from), toMedium = travelMedium(data, to);
        if (fromMedium === toMedium) return true;
        return isPortLanding(data, fromMedium === 'land' ? from : to);
    }

    function migrateCurrentArrival(data, state, unlocked, accessibleSections = {}, connectionAllowed = () => true,
        travelConnections = [], allowedChunkIds = data.walkableChunks || Object.keys(data.chunks || {}), blacklisted = {}) {
        const visit = state.currentVisit;
        if (!visit || visit.visitNumber <= 1 || !Array.isArray(visit.arrivalSections)) {
            return { state, changed: false, removedSections: [], addedSections: [] };
        }
        const previous = (state.visitHistory || []).filter(item => item.visitNumber < visit.visitNumber)
            .sort((a, b) => b.visitNumber - a.visitNumber)[0];
        const target = parseLocation(visit.locationId)?.chunkId, previousId = parseLocation(previous?.locationId)?.chunkId;
        if (!target || !previousId || target === previousId) return { state, changed: false, removedSections: [], addedSections: [] };
        const before = { ...(unlocked || {}) };
        delete before[target];
        if (!own(before, previousId)) return { state, changed: false, removedSections: [], addedSections: [] };
        const graph = buildTravelGraph(data, before, accessibleSections, [target], connectionAllowed, travelConnections);
        const pool = derivePool([target], before, [], null, graph, previousId,
            Array.isArray(previous.arrivalSections) ? previous.arrivalSections : null);
        const candidate = pool.candidates.find(item => item.kind === 'frontier' && item.locationId === target);
        if (!candidate) {
            const priorVisits = (state.visitHistory || []).filter(item => item.visitNumber < visit.visitNumber)
                .sort((a, b) => b.visitNumber - a.visitNumber);
            const frontier = deriveConnectedFrontier(data, unlocked, allowedChunkIds, blacklisted);
            const fallbackGraph = buildTravelGraph(data, unlocked, accessibleSections, frontier,
                connectionAllowed, travelConnections);
            const hasLegalExit = item => {
                const parsed = parseLocation(item?.locationId), id = parsed?.chunkId;
                if (!id || !own(unlocked, id)) return false;
                const arrivals = Array.isArray(item.arrivalSections) ? item.arrivalSections.map(String) : [];
                const available = fallbackGraph.nodesByChunk?.[id] || [];
                if (arrivals.length && !arrivals.some(section => available.includes(id + '-' + section))) return false;
                const reachable = derivePool(frontier, unlocked, [], null, fallbackGraph, id,
                    arrivals.length ? arrivals : null);
                return reachable.candidates.length > 0 || reachable.reachableFree.length > 0;
            };
            // A newly gated route can strand several consecutive historical
            // arrivals. Walk back to the most recent anchor that can still leave
            // its recorded section, rather than restoring only one visit.
            const fallback = priorVisits.find(hasLegalExit) || previous;
            const fallbackId = parseLocation(fallback?.locationId)?.chunkId || previousId;
            const invalidated = { ...visit, status: 'resolved', resolution: 'admin_void',
                note: 'Invalidated after its arrival section became inaccessible' };
            const visitHistory = state.visitHistory.map(item =>
                item.visitNumber === visit.visitNumber ? invalidated : item);
            const next = { ...state, currentVisit: copy(fallback), visitHistory,
                travelAnchor: fallbackId, travelAnchorSections: copy(fallback.arrivalSections || []),
                adminHistory: [...state.adminHistory, { timestamp: new Date().toISOString(),
                    action: 'repair_inaccessible_current_visit', locationId: target,
                    restoredLocationId: fallbackId, removedSectionIds: [...visit.arrivalSections],
                    skippedVisitNumbers: priorVisits.filter(item => item.visitNumber > fallback.visitNumber)
                        .map(item => item.visitNumber),
                    reason: 'The current arrival no longer has an accessible route' }] };
            return { state: next, changed: true, reverted: true, locationId: target,
                removedSections: [...visit.arrivalSections], addedSections: [] };
        }
        const valid = candidate?.metadata?.entrySections || [];
        if (!valid.length) return { state, changed: false, removedSections: [], addedSections: [] };
        const overlap = visit.arrivalSections.filter(section => valid.includes(section));
        const desired = overlap.length ? overlap : valid;
        if (desired.length === visit.arrivalSections.length && desired.every(section => visit.arrivalSections.includes(section))) {
            return { state, changed: false, removedSections: [], addedSections: [] };
        }
        const removedSections = visit.arrivalSections.filter(section => !desired.includes(section));
        const addedSections = desired.filter(section => !visit.arrivalSections.includes(section));
        const arrivalMedium = desired.every(section => section.startsWith('W')) ? 'water' :
            desired.some(section => section.startsWith('W')) ? 'mixed' : 'land';
        const nextVisit = { ...visit, arrivalSections: desired, arrivalMedium };
        const next = journal({ ...state, travelAnchorSections: state.travelAnchor === target ? desired : state.travelAnchorSections }, nextVisit);
        next.adminHistory = [...next.adminHistory, { timestamp: new Date().toISOString(), action: 'repair_invalid_arrival_sections',
            locationId: target, removedSectionIds: removedSections, addedSectionIds: addedSections,
            reason: 'Arrival sections no longer match an accessible route' }];
        return { state: next, changed: true, reverted: false, locationId: target, removedSections, addedSections };
    }

    function deriveStartingSectionGroups(data = {}, locationId, medium = 'land', allowedChunkIds = [], blacklisted = {}, sectionAllowed = () => true) {
        const id = String(locationId), sectionMap = data.sections?.[id] || {};
        const matching = Object.keys(sectionMap).filter(section => section !== '0' && section.startsWith('W') === (medium === 'water'));
        if (!matching.length) return sectionAllowed(null) ? [[]] : [];
        const viable = deriveStartingSections(data, id, medium, allowedChunkIds, blacklisted, sectionAllowed);
        if (!viable.length) return [];
        if (viable.length < 2) return [viable];
        const allowed = new Set((allowedChunkIds.length ? allowedChunkIds : Object.keys(data.sections || {})).map(String));
        const exits = Object.fromEntries(viable.map(section => [section, new Set((sectionMap[section] || []).map(rawTarget => {
            const target = parseLocation(rawTarget);
            return target && target.chunkId !== id && allowed.has(target.chunkId) && !own(blacklisted, target.chunkId) ?
                target.chunkId + (target.sectionId ? '-' + target.sectionId : '') : null;
        }).filter(Boolean))]));
        const remaining = new Set(viable), groups = [];
        while (remaining.size) {
            const group = [], queue = [remaining.values().next().value];
            remaining.delete(queue[0]);
            while (queue.length) {
                const section = queue.shift(); group.push(section);
                for (const other of [...remaining]) {
                    if (![...exits[section]].some(exit => exits[other].has(exit))) continue;
                    remaining.delete(other); queue.push(other);
                }
            }
            groups.push(group);
        }
        return groups;
    }

    function migrateStartingSections(data = {}, inputState, inputSections = {}, allowedChunkIds = [], blacklisted = {}) {
        const state = copy(inputState), sections = copy(inputSections || {});
        if (state.startingSectionPolicy === STARTING_SECTION_POLICY) return { state, sections, changed: false, opened: [] };
        const startIndex = (state.adminHistory || []).findIndex(event =>
            event.action === 'set_starting_sections' && parseLocation(event.locationId));
        const opened = [], removed = [];
        if (startIndex >= 0) {
            const start = state.adminHistory[startIndex], id = parseLocation(start.locationId).chunkId;
            const oldSections = Array.isArray(start.sectionIds) ? start.sectionIds.map(String) : [];
            const medium = start.medium === 'water' || (!start.medium && oldSections.length &&
                oldSections.every(section => section.startsWith('W'))) ? 'water' : 'land';
            const sectionGroups = deriveStartingSectionGroups(data, id, medium, allowedChunkIds, blacklisted);
            const chosenGroup = sectionGroups.find(group => oldSections.some(section => group.includes(section))) || sectionGroups[0] || [];
            const desired = chosenGroup
                .filter(section => sections[id]?.[section] !== false);
            const previousUpgrade = (state.adminHistory || []).slice(startIndex + 1).find(event =>
                event.action === 'upgrade_starting_section_policy' && parseLocation(event.locationId)?.chunkId === id);
            const oldRegions = sectionGroups.filter(group => oldSections.some(section => group.includes(section)));
            const automaticallyOpened = previousUpgrade?.openedSectionIds ||
                (oldRegions.length > 1 ? oldSections.filter(section => !chosenGroup.includes(section)) : []);
            for (const section of automaticallyOpened) {
                if (desired.includes(String(section)) || sections[id]?.[section] !== true) continue;
                delete sections[id][section]; removed.push(String(section));
            }
            for (const section of desired) {
                if (sections[id]?.[section] !== true) opened.push(section);
                (sections[id] ||= {})[section] = true;
            }
            const anchorWasNotMovedExplicitly = !(state.adminHistory || []).slice(startIndex + 1)
                .some(event => event.action === 'set_travel_anchor');
            if (state.travelAnchor === id && anchorWasNotMovedExplicitly && desired.length) state.travelAnchorSections = [...desired];
            state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'upgrade_starting_section_policy',
                locationId: id, medium, sectionIds: [...desired], openedSectionIds: [...opened], removedSectionIds: [...removed] });
        }
        state.startingSectionPolicy = STARTING_SECTION_POLICY;
        return { state, sections, changed: true, opened, removed };
    }

    function deriveStartingPool(data = {}, annotations = {}, options = {}, blacklisted = {}) {
        const configured = annotations.initialization?.startingTiles || {};
        const areaPolicies = annotations.initialization?.startingAreaPolicies || {};
        const walkable = new Set((data.walkableChunks || []).map(String));
        const groupOrder = ['standard', 'varlamore', 'wilderness'];
        const enabled = { standard: true, varlamore: options.varlamore === true,
            wilderness: options.wilderness === true };
        const ids = [], groupByLocation = {}, arrivalSectionsByLocation = {}, arrivalSectionGroupsByLocation = {}, groups = [];
        for (const group of groupOrder) {
            if (!enabled[group]) continue;
            const policy = areaPolicies[group] || {};
            let connectedStartingLocations = null;
            if (policy.connectedTo) {
                // The component describes the physical region, independent of
                // which individual tiles a player has blacklisted for a run.
                const allowed = [...walkable];
                const unlocked = Object.fromEntries(allowed.map(id => [id, id]));
                const openSections = Object.fromEntries(allowed.map(id => [id, Object.fromEntries(
                    Object.keys(data.sections?.[id] || {}).filter(section => section !== '0').map(section => [section, true]))]));
                const graph = buildTravelGraph(data, unlocked, openSections, [], () => true,
                    annotations.travelConnections || []).sectionGraph;
                connectedStartingLocations = new Set();
                const queue = graph[policy.connectedTo] ? [policy.connectedTo] : [];
                for (let next = 0; next < queue.length; next++) {
                    const location = queue[next];
                    if (connectedStartingLocations.has(location)) continue;
                    connectedStartingLocations.add(location);
                    queue.push(...(graph[location] || []).filter(next => !connectedStartingLocations.has(next)));
                }
            }
            const includedLocations = new Set((policy.includeLocations || []).map(String));
            const groupIds = [];
            for (const rawId of configured[group] || []) {
                const id = String(rawId);
                if (!walkable.has(id) || isWaterLocation(data, id) || own(blacklisted, id) || own(groupByLocation, id)) continue;
                let sectionGroups = deriveStartingSectionGroups(data, id, 'land', [...walkable], blacklisted,
                    section => automaticStartingRequirementsAllowed(data, annotations, options, id, section));
                const configuredSections = policy.sectionGroups?.[id];
                if (configuredSections) {
                    const permitted = new Set(configuredSections.flat().map(String));
                    sectionGroups = sectionGroups.map(sections => sections.filter(section => permitted.has(section))).filter(sections => sections.length);
                }
                if (connectedStartingLocations) sectionGroups = sectionGroups.filter(sections => {
                    const locations = sections.length ? sections.map(section => id + '-' + section) : [id];
                    return locations.some(location => connectedStartingLocations.has(location) || includedLocations.has(location));
                });
                if (!sectionGroups.length) continue;
                groupByLocation[id] = group;
                arrivalSectionGroupsByLocation[id] = sectionGroups;
                arrivalSectionsByLocation[id] = sectionGroups[0] || [];
                ids.push(id); groupIds.push(id);
            }
            if (groupIds.length) groups.push({ id: group, medium: 'land', locationIds: groupIds });
        }
        return { ids, groups, groupByLocation, arrivalSectionsByLocation, arrivalSectionGroupsByLocation };
    }

    function deriveManualStartingPool(data = {}, annotations = {}, currentLevels = {}, blacklisted = {}) {
        const walkable = new Set((data.walkableChunks || []).map(String));
        const ids = [], groupByLocation = {}, arrivalSectionsByLocation = {}, arrivalSectionGroupsByLocation = {};
        const startRequirementsByLocation = {};
        for (const id of walkable) {
            if (isWaterLocation(data, id) || own(blacklisted, id)) continue;
            const landSections = Object.keys(data.sections?.[id] || {}).filter(section => section !== '0' && !section.startsWith('W'));
            // A manual start may use isolated land and must choose one exact
            // section, so it cannot accidentally inherit a neighboring gated
            // section or discard a section merely because it has no map exit.
            let sectionGroups = landSections.length ? landSections.map(section => [section]) : [[]];
            const configured = annotations.initialization?.manualStartingSectionGroups?.[id];
            if (configured) {
                const permitted = new Set(configured.flat().map(String));
                sectionGroups = sectionGroups.map(group => group.filter(section => permitted.has(section))).filter(group => group.length);
                if (!sectionGroups.length && configured.some(group => group.length === 0)) sectionGroups = [[]];
            }
            if (!sectionGroups.length) continue;
            ids.push(id); groupByLocation[id] = 'manual';
            arrivalSectionGroupsByLocation[id] = sectionGroups;
            arrivalSectionsByLocation[id] = sectionGroups[0];
            startRequirementsByLocation[id] = sectionGroups.map(group => resolveStartingRequirements(data,
                mergeStartingRequirements((group.length ? group : [null]).map(section =>
                    directStartingRequirements(data, annotations, id, section))), currentLevels));
        }
        return { ids, groups: ids.length ? [{ id: 'manual', medium: 'land', locationIds: ids }] : [], groupByLocation,
            arrivalSectionsByLocation, arrivalSectionGroupsByLocation, startRequirementsByLocation };
    }

    function startingCandidateForRegion(candidate, startingPool, sectionIndex) {
        if (!candidate) return null;
        const locationId = String(candidate.locationId);
        const groups = startingPool?.groups || [];
        const group = groups.find(entry => entry.id === candidate.metadata?.startGroup && entry.locationIds.includes(locationId)) ||
            groups.find(entry => entry.locationIds.includes(locationId));
        if (!group) return { ...candidate, metadata: { ...(candidate.metadata || {}) } };
        const sectionGroups = startingPool.arrivalSectionGroupsByLocation?.[locationId] ||
            [startingPool.arrivalSectionsByLocation?.[locationId] || []];
        if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= sectionGroups.length) {
            throw new RangeError('Starting region is not available for this tile');
        }
        return { ...candidate, locationId, metadata: { ...(candidate.metadata || {}), startGroup: group.id,
            startRegionIndex: sectionIndex, arrivalMedium: group.medium, entrySections: [...sectionGroups[sectionIndex]],
            startRequirements: copy(startingPool.startRequirementsByLocation?.[locationId]?.[sectionIndex] ||
                { tasks: [], levels: {}, questPoints: 0, combatLevel: 0, totalLevel: 0 }) } };
    }

    // Initial groups receive equal odds, then every tile within the selected
    // group receives equal odds. A disconnected region is chosen only after
    // its tile wins, so tiles with more regions do not gain extra weight.
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
        const sectionGroups = startingPool.arrivalSectionGroupsByLocation?.[candidate.locationId] ||
            [startingPool.arrivalSectionsByLocation?.[candidate.locationId] || []];
        const sectionRoll = sectionGroups.length > 1 ? rng() : 0;
        if (sectionRoll < 0 || sectionRoll >= 1) throw new Error('Random source must return [0, 1)');
        const sectionIndex = Math.floor(sectionRoll * sectionGroups.length);
        return startingCandidateForRegion({ ...candidate,
            metadata: { ...(candidate.metadata || {}), startGroup: group.id } }, startingPool, sectionIndex);
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
            result.set([origin.chunkId, origin.sectionId || '', origin.sourceType, origin.sourceName,
                origin.clueTier || ''].join('|'), origin);
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
        if (task.equipmentName && own(state?.acquiredEnablers, canonicalItemKey(task.equipmentName))) return true;
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
    function completedQuestProgress(data = {}, legacy = {}, ids = {}, startingQuestPoints = 1, questPointFloor = 0) {
        const progress = {}, completedFinals = new Set();
        let questPointTotal = Number(startingQuestPoints) || 0;
        const completed = [];
        for (const [name, meta] of Object.entries(data.challenges?.Quest || {})) {
            const record = { name, skill: 'Quest', taskId: taskId(name, 'Quest', ids) };
            if (isComplete(record, legacy)) completed.push([name, meta]);
        }
        for (const [, meta] of completed) if (own(meta, 'QuestPoints')) {
            completedFinals.add(meta.BaseQuest);
            progress[meta.BaseQuest] = 'Complete the quest';
            questPointTotal += Number(meta.QuestPoints || 0);
        }
        for (const [name, meta] of completed) {
            if (completedFinals.has(meta.BaseQuest) || own(meta, 'QuestPoints')) continue;
            (progress[meta.BaseQuest] ||= []).push(name);
        }
        return { questProgress: progress, questPointTotal: Math.max(questPointTotal, Number(questPointFloor) || 0) };
    }
    function taskMetadata(name, skill, meta, ids = {}) {
        const categories = meta.Category || [];
        const taskRequirements = Object.entries(meta.Tasks || {});
        const onlyMirroredSkillRequirements = taskRequirements.length > 0 && taskRequirements.every(([taskName, taskSkill]) =>
            taskName === name + '--' + taskSkill && own(meta.Skills, taskSkill));
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
        } else if (skill === 'Slayer' && /^Receive a Slayer assignment from\b/.test(displayName(name))) {
            taskClass = 'activity'; classificationReason = 'Each accessible Slayer master is an independent training entry point';
        } else if (categories.length) {
            taskClass = 'activity'; classificationReason = 'Independent activity/rule category: ' + categories.join(', ');
        } else if (SKILLS.includes(skill) && Number.isFinite(meta.Level) && !meta.NoXp && (meta.Primary === true ||
            (meta.Primary === false && meta.Items?.length && !meta.Chunks?.length && !meta.Output && !meta.Monsters?.length &&
                !meta.NPCs?.length && (!taskRequirements.length || onlyMirroredSkillRequirements) && !meta['Not Equip']))) {
            taskClass = 'skill_progression';
            classificationReason = meta.Primary === true ? 'Primary XP action with a skill level and no special category' :
                onlyMirroredSkillRequirements ? 'Direct skill action with a mirrored cross-skill requirement' :
                    'Direct item/tool-use action with a skill level and no reward, geography, prerequisite, or special category';
        }
        const advancesSkillProgression = taskClass === 'skill_progression' && Number.isFinite(meta.Level);
        // Secondary actions can still carry real skill requirements. They do not
        // advance the high-water mark, but their levels must obey the same pacing
        // window when they are used directly or as an item-production step.
        const usesSkillLevelWindow = advancesSkillProgression || (taskClass === 'other' && meta.Primary === false &&
            SKILLS.includes(skill) && Number.isFinite(meta.Level));
        const bisReason = taskClass === 'bis' ? stripMarkup(meta.BisReason ||
            (meta.Set ? 'BIS Skilling · ' + meta.Set : meta.Label || (categories.includes('BIS Skilling') ? 'BIS Skilling' : ''))) : '';
        return { taskId: taskId(name, skill, ids), name, displayName: displayName(name), skill, type: skill,
            category: meta.Label || skill, sourceCategories: categories.slice(), level: meta.Level || null,
            priority: Number.isFinite(meta.Priority) ? meta.Priority : null,
            description: meta.Description || '', taskClass, classificationReason, advancesSkillProgression, usesSkillLevelWindow,
            skilling: advancesSkillProgression, bisReason,
            bisSet: meta.Set || null };
    }

    const clueTiersFor = meta => {
        const raw = meta?.ClueRewardTiers ?? meta?.ClueRewardTier;
        return [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : [])
            .map(tier => String(tier).toLowerCase()).filter(tier => CLUE_TIERS.includes(tier)))];
    };
    function clueMapImagePath(name, meta = {}) {
        if (meta.ClueType !== 'Map') return null;
        const encodedName = String(name).split(/[?#]/)[0].split('/').at(-1) || '';
        let fileName;
        try { fileName = decodeURIComponent(encodedName); } catch (_) { return null; }
        if (!/^Map_clue_[^/\\]+\.png$/i.test(fileName)) return null;
        // The checked-in filename predates the source-data casing.
        if (fileName === 'Map_clue_soul_altar.png') fileName = 'Map_clue_Soul_Altar.png';
        return './resources/clue_maps/' + fileName;
    }
    function clueStepDisplayName(name, meta = {}) {
        const imagePath = clueMapImagePath(name, meta);
        if (!imagePath) return displayName(name);
        return imagePath.split('/').at(-1).replace(/\.png$/i, '').replace(/^Map_clue_/i, '').replaceAll('_', ' ');
    }
    function clueTierFromOrigin(origin) {
        if (CLUE_TIERS.includes(origin?.clueTier)) return origin.clueTier;
        const match = /^Clue scroll \((beginner|easy|medium|hard|elite|master)\)$/.exec(origin?.sourceName || '');
        return match?.[1] || null;
    }
    function clueTaskPresentations(task, activeOriginFilter = null) {
        if (task?.skill !== 'BiS' || task.clueReward || task.completed || task.eligible === false) return [task];
        const activeClueOrigins = (task.activeOrigins || []).filter(origin => clueTierFromOrigin(origin) &&
            (!activeOriginFilter || activeOriginFilter(origin, task)));
        const activeOrdinaryOrigins = (task.activeOrigins || []).filter(origin => !clueTierFromOrigin(origin) &&
            (!activeOriginFilter || activeOriginFilter(origin, task)));
        if (!activeClueOrigins.length) return [task];
        const allClueOrigins = (task.origins || []).filter(clueTierFromOrigin);
        const allOrdinaryOrigins = (task.origins || []).filter(origin => !clueTierFromOrigin(origin));
        const tiers = [...new Set(activeClueOrigins.map(clueTierFromOrigin))];
        const cluePresentations = tiers.map(tier => ({ ...task,
            origins: allClueOrigins.filter(origin => clueTierFromOrigin(origin) === tier),
            activeOrigins: activeClueOrigins.filter(origin => clueTierFromOrigin(origin) === tier),
            clueReward: { tier, ownerTier: tier, sourceTiers: tiers, itemKey: task.equipmentName,
                incidental: false, equipmentOnly: true, presentationOnly: true } }));
        return activeOrdinaryOrigins.length ?
            [{ ...task, origins: allOrdinaryOrigins, activeOrigins: activeOrdinaryOrigins }, ...cluePresentations] :
            cluePresentations;
    }
    function clueTaskListPresentations(tasks = [], activeOriginFilter = null) {
        const presentations = tasks.flatMap(task => clueTaskPresentations(task, activeOriginFilter));
        const clueBis = new Set(presentations.filter(task => task.skill === 'BiS' && task.clueReward?.itemKey)
            .map(task => task.clueReward.tier + '|' + comparableItemKey(task.clueReward.itemKey)));
        return presentations.filter(task => !(task.taskClass === 'collection' && task.skill !== 'BiS' &&
            task.clueReward?.itemKey && clueBis.has(task.clueReward.tier + '|' + comparableItemKey(task.clueReward.itemKey))));
    }
    function clueRewardCatalog(data = {}, legacy = {}, state = null, ids = {}) {
        const groups = new Map();
        for (const [name, meta] of Object.entries(data.challenges?.Extra || {})) {
            const sourceTiers = clueTiersFor(meta);
            if (!sourceTiers.length) continue;
            const itemKey = canonicalItemKey(meta.Output || (meta.Items?.length === 1 ? meta.Items[0] : ''));
            if (!itemKey) continue;
            const key = comparableItemKey(itemKey), entry = {
                name, skill: 'Extra', taskId: taskId(name, 'Extra', ids), itemKey, sourceTiers,
                meta, completed: isComplete({ name, skill: 'Extra', taskId: taskId(name, 'Extra', ids) }, legacy, state)
            };
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        }
        const rewards = [];
        for (const [key, entries] of groups) {
            const sourceTiers = [...new Set(entries.flatMap(entry => entry.sourceTiers))]
                .sort((left, right) => CLUE_TIER_RANK[left] - CLUE_TIER_RANK[right]);
            // Shared rewards belong to their highest source tier. This lets a
            // lower tier finish without demanding an item that a later tier
            // already represents, while any old completion still counts.
            const ownerTier = sourceTiers.at(-1);
            const canonical = entries.filter(entry => entry.sourceTiers.includes(ownerTier))
                .sort((left, right) => left.taskId.localeCompare(right.taskId))[0] || entries[0];
            rewards.push({ key, itemKey: canonical.itemKey, ownerTier, sourceTiers,
                taskId: canonical.taskId, name: canonical.name, skill: canonical.skill,
                // Equipment ownership alone does not prove that the item's
                // clue collection-log slot was filled. The UI records the
                // canonical clue task alongside a merged BiS task, so only an
                // explicit clue-task completion is accepted here.
                completed: entries.some(entry => entry.completed),
                equivalentTaskIds: [...new Set(entries.map(entry => entry.taskId))],
                equivalentTaskNames: [...new Set(entries.map(entry => entry.name))] });
        }
        rewards.sort((left, right) => CLUE_TIER_RANK[left.ownerTier] - CLUE_TIER_RANK[right.ownerTier] ||
            left.itemKey.localeCompare(right.itemKey));
        const tiers = Object.fromEntries(CLUE_TIERS.map(tier => {
            const owned = rewards.filter(reward => reward.ownerTier === tier);
            const completed = owned.filter(reward => reward.completed).length;
            return [tier, { tier, total: owned.length, completed, remaining: owned.length - completed,
                complete: owned.length > 0 && completed === owned.length }];
        }));
        return { rewards, tiers };
    }

    function clueStepCatalog(data = {}, tier = null, ids = {}) {
        return Object.entries(data.challenges?.Nonskill || {}).flatMap(([name, meta]) => {
            const clueTier = String(meta.ClueTier || '').toLowerCase();
            if (!CLUE_TIERS.includes(clueTier) || (tier && clueTier !== tier)) return [];
            return [{ stepId: taskId(name, 'Nonskill', ids), name, tier: clueTier,
                type: meta.ClueType || 'Clue step', clueId: meta.ClueId || null,
                displayName: clueStepDisplayName(name, meta), imagePath: clueMapImagePath(name, meta),
                requirements: {
                    chunks: [...(meta.Chunks || [])], items: [...(meta.Items || [])],
                    npcs: [...(meta.NPCs || [])], monsters: [...(meta.Monsters || [])],
                    objects: [...(meta.Objects || [])], tasks: { ...(meta.Tasks || {}) },
                    skills: { ...(meta.Skills || {}) }, questPoints: Number(meta.QuestPointsNeeded) || 0,
                    combatLevel: Number(meta.CombatLevelNeeded) || 0
                } }];
        }).sort((left, right) => CLUE_TIER_RANK[left.tier] - CLUE_TIER_RANK[right.tier] || left.name.localeCompare(right.name));
    }
    function clueStepDefinition(data = {}, tier, lock = null, ids = {}) {
        if (!CLUE_TIERS.includes(tier) || !lock || typeof lock !== 'object') return null;
        return clueStepCatalog(data, tier, ids).find(step => step.stepId === lock.stepId || step.name === lock.name) || null;
    }
    function setClueLock(state, tier, step = null) {
        if (!CLUE_TIERS.includes(tier)) throw new Error('Invalid clue tier');
        const clueLocks = { ...(state.clueLocks || {}) };
        if (!step) delete clueLocks[tier];
        else {
            if (step.manual === true) {
                const targetChunkId = step.targetChunkId == null ? null : parseLocation(step.targetChunkId)?.chunkId;
                if (step.targetChunkId != null && !targetChunkId) throw new Error('Invalid clue unlock tile');
                clueLocks[tier] = { stepId: '', name: 'Clue step not identified', manual: true,
                    targetChunkId, blockedAt: step.blockedAt || new Date().toISOString() };
            } else {
                if (typeof step.stepId !== 'string' && typeof step.name !== 'string') throw new Error('Invalid clue step');
                clueLocks[tier] = { stepId: step.stepId || '', name: step.name || '',
                    blockedAt: step.blockedAt || new Date().toISOString() };
            }
        }
        return { ...state, clueLocks };
    }
    function setIncidentalClueCount(state, tier, count) {
        if (!CLUE_TIERS.includes(tier) || !Number.isInteger(count) || count < 0 || count > 100) {
            throw new Error('Invalid incidental clue count');
        }
        return { ...state, incidentalClues: { ...(state.incidentalClues || {}), [tier]: count } };
    }
    function clueStepTargets(data = {}, tier, lock = null, ids = {}) {
        if (lock?.manual) return lock.targetChunkId ? [String(lock.targetChunkId)] : [];
        const step = clueStepDefinition(data, tier, lock, ids);
        if (!step) return [];
        const codes = data.codeItems || {}, targets = new Set(), visitedTasks = new Set();
        const containers = [];
        for (const [chunkId, chunk] of Object.entries(data.chunks || {})) {
            containers.push({ chunkId, sectionId: null, value: chunk });
            for (const [sectionId, section] of Object.entries(chunk.Sections || {})) containers.push({ chunkId, sectionId, value: section });
        }
        const addLocation = location => { const parsed = parseLocation(location); if (parsed) targets.add(parsed.chunkId); };
        const findEntity = (field, raw, group) => {
            const wanted = new Set(expand(raw, codes[group]).map(comparableItemKey));
            for (const container of containers) if (Object.keys(container.value?.[field] || {})
                .some(name => wanted.has(comparableItemKey(name))) && parseLocation(container.chunkId)) targets.add(container.chunkId);
        };
        const visitTask = (name, skill) => {
            const key = skill + '\u0000' + name;
            if (visitedTasks.has(key)) return;
            visitedTasks.add(key);
            for (const choice of expand(name, codes.tasksPlus)) {
                const meta = data.challenges?.[skill]?.[choice];
                if (!meta) continue;
                (meta.Chunks || []).flatMap(raw => expand(raw, codes.chunksPlus)).forEach(addLocation);
                for (const raw of meta.NPCs || []) findEntity('NPC', raw, 'npcsPlus');
                for (const raw of meta.Monsters || []) findEntity('Monster', raw, 'monstersPlus');
                for (const raw of meta.Objects || []) findEntity('Object', raw, 'objectsPlus');
                for (const [sub, category] of Object.entries(meta.Tasks || {})) visitTask(sub, category);
            }
        };
        const meta = data.challenges?.Nonskill?.[step.name] || {};
        (meta.Chunks || []).flatMap(raw => expand(raw, codes.chunksPlus)).forEach(addLocation);
        for (const raw of meta.NPCs || []) findEntity('NPC', raw, 'npcsPlus');
        for (const raw of meta.Monsters || []) findEntity('Monster', raw, 'monstersPlus');
        for (const raw of meta.Objects || []) findEntity('Object', raw, 'objectsPlus');
        // Equipment and consumable requirements are listed in the panel. They
        // can have hundreds of sources, so drawing all of them would obscure
        // the useful solution/quest locations on the map.
        for (const [name, skill] of Object.entries(meta.Tasks || {})) visitTask(name, skill);
        return [...targets].sort((left, right) => Number(left) - Number(right));
    }
    function clueStepStatus(data = {}, tier, lock = null, valids = {}, legacy = {}, state = null, ids = {}, base = {}) {
        if (lock?.manual) return { tier, valid: true, satisfied: false,
            targets: clueStepTargets(data, tier, lock, ids), selfCycle: false, cycleItems: [],
            manual: true, targetChunkId: lock.targetChunkId || null,
            step: { stepId: '', name: 'Clue step not identified', tier, type: 'Unknown', clueId: null,
                displayName: 'Clue step not identified', imagePath: null,
                requirements: { chunks: lock.targetChunkId ? [String(lock.targetChunkId)] : [], items: [], npcs: [],
                    monsters: [], objects: [], tasks: {}, skills: {}, questPoints: 0, combatLevel: 0 } } };
        const definition = clueStepDefinition(data, tier, lock, ids);
        if (!definition) return { tier, valid: false, satisfied: false, targets: [], selfCycle: false, step: null };
        const rewards = clueRewardCatalog(data, legacy, state, ids).rewards;
        const rewardByItem = new Map(rewards.map(reward => [reward.key, reward]));
        const cycleItems = clueStepCycleItems(data, tier, definition, rewardByItem, base);
        const requirementsSatisfied = own(valids.Nonskill || {}, definition.name) && valids.Nonskill[definition.name] !== false;
        // The worker exposes active clue rewards as possible item sources so
        // they can participate in BiS and dependency calculations. A step
        // cannot use an unowned reward from the clue currently being held,
        // however, so a same-tier reward cycle must remain blocked even when
        // the legacy validity graph considers that reward obtainable.
        return { tier, valid: true, satisfied: requirementsSatisfied && cycleItems.length === 0,
            targets: clueStepTargets(data, tier, lock, ids), selfCycle: cycleItems.length > 0, cycleItems,
            step: definition };
    }
    function clueStepCycleItems(data = {}, tier, definition, rewardByItem = new Map(), base = {}) {
        const meta = data.challenges?.Nonskill?.[definition.name] || {};
        const cycleItems = [];
        for (const raw of meta.Items || []) {
            const itemAlternatives = expand(raw, data.codeItems?.itemsPlus);
            const alternatives = itemAlternatives.map(name => rewardByItem.get(comparableItemKey(name))).filter(Boolean);
            const hasOrdinarySource = name => Object.entries(base.items?.[canonicalItemKey(name)] ||
                base.items?.[canonicalItemKey(name) + '*'] || {}).some(([, type]) => type !== 'clue-reward');
            if (alternatives.length && alternatives.length === itemAlternatives.length &&
                alternatives.every(reward => reward.ownerTier === tier && !reward.completed) &&
                itemAlternatives.every(name => !hasOrdinarySource(name))) cycleItems.push(raw);
        }
        return cycleItems;
    }
    function resourceRepresentativeMetadata(name, skill, meta, annotations = {}) {
        const ignored = new Set(annotations.resourceRepresentatives?.ignoredPrimaryResources?.[skill] || []);
        const primaryIndex = (meta.Items || []).findIndex(raw => String(raw).includes('*') && !ignored.has(canonicalItemKey(raw)));
        if (primaryIndex < 0) return null;
        const resource = canonicalItemKey(meta.Items[primaryIndex]);
        const rules = annotations.resourceRepresentatives?.distinctOutputFamilies || [];
        const output = String(meta.Output || displayName(name)).toLowerCase();
        const distinct = rules.find(rule => (!rule.skill || rule.skill === skill) &&
            output.includes(String(rule.outputIncludes || '').toLowerCase()));
        const list = values => (values || []).map(canonicalItemKey).sort();
        const requirements = value => Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right));
        const method = distinct?.family || JSON.stringify({
            items: list((meta.Items || []).filter((_, index) => index !== primaryIndex)),
            objects: list(meta.Objects), npcs: list(meta.NPCs), monsters: list(meta.Monsters),
            mix: list(meta.Mix), chunks: list(meta.Chunks), outputObject: meta['Output Object'] || null,
            tasks: requirements(meta.Tasks), skills: requirements(meta.Skills)
        });
        return { resource, resourceLabel: resource.replace(/\[\+\](?:x\d+)?/g, ''), method,
            familyKey: JSON.stringify([skill, resource, method]) };
    }
    function equipmentObjectiveAlternatives(data, name, meta = {}) {
        if (!/^(?:wear|wield|equip)\b/i.test(displayName(name).trim()) || meta.Items?.length !== 1) return [];
        const raw = String(meta.Items[0]);
        const quantity = /\[\+\]x(\d+)/.exec(raw);
        if (quantity && Number(quantity[1]) !== 1) return [];
        return [...new Set(expand(raw, data.codeItems?.itemsPlus).map(canonicalItemKey).filter(Boolean))];
    }
    function isAbstractGatheringToolTask(name, skill, meta = {}) {
        if (meta.Primary !== false || meta.Items?.length !== 1 || meta.Output || (meta.Category || []).length) return false;
        const label = displayName(name).trim(), item = canonicalItemKey(meta.Items[0]);
        return (skill === 'Mining' && /^Use (?:a|an) .+ pickaxe$/i.test(label) && /pickaxe$/i.test(item)) ||
            (skill === 'Fishing' && /^Use (?:a|an) .+ harpoon$/i.test(label) && /harpoon$/i.test(item)) ||
            (skill === 'Woodcutting' && /^Chop with (?:a|an) .+ axe$/i.test(label) && /axe$/i.test(item));
    }
    function isRedundantForestryParticipationTask(meta = {}) {
        return (meta.Category || []).includes('Forestry');
    }
    function buildTaskCatalog(data, ids = {}) {
        const catalog = new Map();
        for (const skill of ['Quest', 'Diary', 'Extra', 'BiS', ...SKILLS, 'Combat']) {
            for (const [name, meta] of Object.entries(data.challenges?.[skill] || {})) {
                if (isAbstractGatheringToolTask(name, skill, meta) || isRedundantForestryParticipationTask(meta)) continue;
                const record = taskMetadata(name, skill, meta, ids);
                record.equipmentObjectiveAlternatives = equipmentObjectiveAlternatives(data, name, meta);
                if (!meta.NeverShow && !catalog.has(record.taskId)) catalog.set(record.taskId, record);
            }
        }
        return [...catalog.values()];
    }
    function progressionCeiling(catalog, skill, highWater, actualLevel = 1) {
        // Slayer is paced by usable masters and real monster unlock levels in
        // slayerProgressionModel(). It has no ordinary numeric forward band.
        if (skill === 'Slayer') return 99;
        const standard = Math.min(99, highWater + progressionWindow(skill));
        const laterLevels = [...new Set(catalog.filter(task => task.skill === skill && task.advancesSkillProgression && task.level > highWater)
            .map(task => task.level))].sort((a, b) => a - b);
        // A new skill must establish one of its level-one methods before its
        // forward window opens. Once that first milestone is complete, the
        // ordinary per-skill window applies and no intermediate task is forced.
        if (highWater === 0 && actualLevel === 1 && laterLevels.includes(1)) return 1;
        if (!laterLevels.length || laterLevels.some(level => level <= standard)) return standard;
        // Sparse skills still expose their nearest next milestone rather than
        // becoming permanently stuck behind an empty numerical range.
        return laterLevels[0];
    }
    function completedEquipmentItems(legacy = {}, state = null, ids = {}) {
        const result = new Map(), reverseIds = new Map(Object.entries(ids || {}).map(([name, id]) => [String(id), name]));
        const add = (item, confirmedEquipped = false, replacementForTaskIds = []) => {
            if (!item) return;
            const key = comparableItemKey(item), existing = result.get(key);
            result.set(key, { item: canonicalItemKey(item), confirmedEquipped: !!confirmedEquipped || !!existing?.confirmedEquipped,
                replacementForTaskIds: [...new Set([...(existing?.replacementForTaskIds || []), ...replacementForTaskIds])] });
        };
        for (const [item, owned] of Object.entries(legacy.manualEquipment || {})) if (owned) {
            const replacementIds = typeof owned === 'object' ? [
                ...(owned.replacementForTaskIds || []), owned.replacementForTaskId
            ].filter(Boolean) : [];
            add(item, typeof owned === 'object' && owned.confirmedEquipped === true, replacementIds);
        }
        for (const item of Object.keys(state?.acquiredEnablers || {})) add(item);
        for (const storeName of ['completedChallenges', 'checkedChallenges', 'checkedAllTasks']) {
            for (const [skill, entries] of Object.entries(legacy[storeName] || {})) for (const [key, flag] of Object.entries(entries || {})) {
                if (flag === false) continue;
                const name = reverseIds.get(String(key)) || key;
                if (skill !== 'BiS' && !/(?:^|\))\s*Obtain\b/i.test(displayName(name))) continue;
                const match = /~\|([^|]+)\|~/.exec(name);
                if (match) add(match[1], skill === 'BiS');
            }
        }
        return result;
    }
    function superiorEquipmentCompletion(task, completedItems, data, state = null) {
        if (task?.taskClass !== 'bis' || !task.equipmentName || !task.confirmsEquipped) return null;
        for (const evidence of completedItems.values()) {
            if (evidence.replacementForTaskIds?.includes(task.taskId) ||
                equipmentDominatesTask(data, task, evidence.item, state, evidence.confirmedEquipped)) {
                return evidence.item;
            }
        }
        return null;
    }
    function impliedEquipmentCompletion(task, completedItems, state = null) {
        const levelTooLow = task.advancesSkillProgression && Number.isFinite(task.level) &&
            Number.isFinite(state?.actualLevels?.[task.skill]) && state.actualLevels[task.skill] < task.level;
        for (const item of task.equipmentObjectiveAlternatives || []) {
            const evidence = completedItems.get(comparableItemKey(item));
            // Manually owning an item is not proof that a low-level account can
            // equip it. Completing a BiS objective is: those tasks explicitly
            // require the item to be wielded or worn.
            if (evidence && (!levelTooLow || evidence.confirmedEquipped)) return item;
        }
        return null;
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
    function completedSkillProgress(catalog, skill, legacy = {}, state = null, ids = {}) {
        if (!SKILLS.includes(skill)) return { skill, level: 0, taskId: null, name: null, displayName: null };
        const done = completionIds(legacy, ids), completedItems = completedEquipmentItems(legacy, state, ids);
        const cleared = catalog.filter(task => task.skill === skill && task.advancesSkillProgression &&
            (done.has(task.taskId) || done.has(task.name) || impliedEquipmentCompletion(task, completedItems, state)))
            .sort((left, right) => right.level - left.level ||
                (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER) ||
                left.displayName.localeCompare(right.displayName));
        const task = cleared[0];
        return { skill, level: task?.level || 0, taskId: task?.taskId || null, name: task?.name || null,
            displayName: task?.displayName || null };
    }
    function trainingMethodsAtOrBelow(methods = {}, highestCompletedLevel = 0) {
        const limit = Number(highestCompletedLevel) || 0;
        return Object.fromEntries(Object.entries(methods).filter(([, level]) =>
            Number.isFinite(Number(level)) && Number(level) <= limit));
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
        for (const skill of SKILLS) {
            next.progressionHighWater[skill] = Math.max(next.progressionHighWater[skill] || 0, derived[skill]);
            // Completing a levelled skill goal proves this minimum real level.
            // The UI no longer asks players to maintain a second full level list.
            next.actualLevels[skill] = Math.max(next.actualLevels[skill] || (skill === 'Hitpoints' ? 10 : 1), derived[skill] || 0);
        }
        return next;
    }
    function setProgressionHighWater(state, skill, level) {
        if (!SKILLS.includes(skill) || !Number.isInteger(level) || level < 0 || level > 99) throw new Error('Invalid progression high-water mark');
        return { ...state, progressionInitialized: true,
            progressionHighWater: { ...state.progressionHighWater, [skill]: level } };
    }
    function recordCombatTaskCompletion(state, task, locationId = null, completedAt = null) {
        const evidenceSources = task?.combatEvidenceSources || [];
        if (!evidenceSources.length) return state;
        const visit = locationId && parseLocation(locationId);
        const origins = (task.activeOrigins || task.origins || []).filter(origin => !visit ||
            (origin.chunkId === visit.chunkId && (!visit.sectionId || !origin.sectionId || origin.sectionId === visit.sectionId)));
        // When the same objective can be completed through a shop, spawn, or
        // activity in this visit, checking it does not prove that a monster was
        // defeated. Prefer missing evidence over inflating the combat frontier.
        if (!origins.length || origins.some(origin => origin.sourceType !== 'monsters')) return state;
        const names = new Set(origins.map(origin => origin.sourceName));
        const candidates = evidenceSources.filter(source => names.has(source.monster));
        if (!candidates.length) return state;
        const level = Math.min(...candidates.map(source => source.level));
        if (!Number.isFinite(level)) return state;
        const cutoff = Number(task.combatProgressionCutoff) || 60;
        const current = state.combatProgression || { frontier: 1, mature: false, evidence: [] };
        const entry = { monster: candidates.find(source => source.level === level).monster, level,
            taskId: task.taskId || null, completedAt: completedAt || new Date().toISOString() };
        const evidence = [...(current.evidence || []).filter(old => old.taskId !== entry.taskId), entry].slice(-100);
        return { ...state, combatProgression: {
            frontier: Math.min(cutoff, Math.max(Number(current.frontier) || 1, level)),
            mature: current.mature || level >= cutoff,
            evidence
        } };
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
        return [...new Set([task.equipmentName, task.enablerItemKey, task.clueReward?.itemKey,
            ...(task.provesAcquiredItemKeys || [])].filter(Boolean))];
    }
    function sameAccessibleArea(left, right) {
        return left.chunkId === right.chunkId && (!left.sectionId || !right.sectionId || left.sectionId === right.sectionId);
    }
    function collapseRedundantEquipmentTasks(tasks) {
        const exactCollapsed = tasks.map(task => {
            if (!task.eligible || task.taskClass !== 'collection' || !task.clueReward?.itemKey) return task;
            const wanted = comparableItemKey(task.clueReward.itemKey);
            const covering = tasks.filter(candidate => candidate.eligible && candidate.taskClass === 'bis' && candidate.clueReward?.itemKey &&
                candidate.taskId !== task.taskId && comparableItemKey(candidate.clueReward.itemKey) === wanted &&
                acquisitionTaskItems(candidate).some(item => comparableItemKey(item) === wanted));
            if (!covering.length) return task;
            const coveredOrigins = task.activeOrigins.filter(origin => covering.some(candidate =>
                candidate.activeOrigins.some(detailOrigin => sameAccessibleArea(origin, detailOrigin))));
            if (!coveredOrigins.length) return task;
            const activeOrigins = task.activeOrigins.filter(origin => !coveredOrigins.includes(origin));
            return { ...task, activeOrigins, eligible: activeOrigins.length > 0, redundant: activeOrigins.length === 0,
                partiallyRedundant: activeOrigins.length > 0, coveredOrigins: uniqueOrigins(coveredOrigins),
                coveredByTaskIds: covering.map(candidate => candidate.taskId),
                eligibilityReason: activeOrigins.length ? task.eligibilityReason : 'Covered by the matching clue equipment goal',
                whyWouldBeIneligible: activeOrigins.length ? task.whyWouldBeIneligible :
                    [...task.whyWouldBeIneligible, 'the matching clue equipment goal records the same reward'] };
        });
        const detailed = exactCollapsed.filter(task => task.eligible && acquisitionTaskItems(task).length);
        return exactCollapsed.map(task => {
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
    function orderResourceMilestoneTasks(tasks, legacy = {}, state = null, ids = {}) {
        const byId = new Map(tasks.map(task => [task.taskId, task]));
        const completed = completionIds(legacy, ids);
        return tasks.map(task => {
            const waitingOnlyForPersistentEnablers = task.availableWithoutPersistentEnablers === true &&
                !task.completed && !task.backlogged && !task.superseded && !task.progressionBlocked && task.activeOrigins?.length > 0;
            if ((!task.eligible && !waitingOnlyForPersistentEnablers) || !task.resourceMilestoneDependencies?.length) return task;
            const blocking = task.resourceMilestoneDependencies.filter(dependency => {
                const satisfied = dependency.producers.some(producer => completed.has(producer.taskId) || completed.has(producer.name) ||
                    (producer.level && (state?.progressionHighWater?.[producer.skill] || 0) >= producer.level));
                return !satisfied && dependency.producers.length > 0;
            });
            if (!blocking.length) return task;
            const producerTaskIds = [...new Set(blocking.flatMap(dependency => dependency.producerTaskIds))];
            const producerNames = [...new Set(blocking.flatMap(dependency => dependency.producers).map(producer =>
                byId.get(producer.taskId)?.displayName || producer.displayName).filter(Boolean))];
            const resources = [...new Set(blocking.map(dependency => dependency.resource))];
            const reason = 'Complete ' + producerNames.join(' or ') + ' before using ' + resources.join(' or ') + ' for this task';
            return { ...task, eligible: false, resourceMilestoneBlocked: true,
                resourceMilestoneDependencies: blocking, blockedByTaskIds: producerTaskIds,
                eligibilityReason: reason,
                whyWouldBeIneligible: [...task.whyWouldBeIneligible, 'an available resource-gathering milestone must be completed first'] };
        });
    }
    function chooseResourceRepresentativeTasks(tasks, state = null) {
        const families = new Map(), replacements = new Map();
        const activeSnapshot = state?.currentVisit?.status === 'task_required' ?
            new Set(state.currentVisit.candidateTaskIds || []) : new Set();
        for (const task of tasks) if (task.resourceRepresentative?.familyKey) {
            const key = task.resourceRepresentative.familyKey;
            if (!families.has(key)) families.set(key, []);
            families.get(key).push(task);
        }
        const rank = (left, right, preferHighest) => {
            const levelOrder = preferHighest ? (right.level || 0) - (left.level || 0) : (left.level || 0) - (right.level || 0);
            return levelOrder || (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER) ||
                left.taskId.localeCompare(right.taskId);
        };
        for (const members of families.values()) {
            const candidates = members.filter(task => task.eligible);
            if (candidates.length < 2 && !members.some(task => task.completed)) continue;
            const snapshotCandidates = candidates.filter(task => activeSnapshot.has(task.taskId));
            if (snapshotCandidates.length) {
                const preserved = new Set(snapshotCandidates.map(task => task.taskId));
                for (const task of candidates) if (!preserved.has(task.taskId)) replacements.set(task.taskId,
                    { ...task, eligible: false, resourceRepresentativeBlocked: true,
                        representedByTaskId: snapshotCandidates[0].taskId,
                        eligibilityReason: 'This visit already selected ' + snapshotCandidates.map(item => item.displayName).join(' or ') +
                            ' for ' + task.resourceRepresentative.resourceLabel,
                        whyWouldBeIneligible: [...task.whyWouldBeIneligible, 'another recipe represents this resource in the active visit'] });
                continue;
            }
            const completed = members.slice().filter(task => task.completed).sort((a, b) => rank(a, b, true))[0];
            if (completed) {
                for (const task of candidates) replacements.set(task.taskId,
                    { ...task, eligible: false, resourceRepresentativeBlocked: true,
                        resourceRepresentativeCompleted: true, representedByTaskId: completed.taskId,
                        eligibilityReason: task.resourceRepresentative.resourceLabel + ' is already represented by ' + completed.displayName,
                        whyWouldBeIneligible: [...task.whyWouldBeIneligible, 'this resource recipe family already has a completed representative'] });
                continue;
            }
            if (candidates.length < 2) continue;
            const actualLevel = state?.actualLevels?.[candidates[0].skill] || 1;
            const currentlyPerformable = candidates.filter(task => (task.level || 1) <= actualLevel);
            const pool = currentlyPerformable.length ? currentlyPerformable : candidates;
            const representative = pool.slice().sort((a, b) => rank(a, b, currentlyPerformable.length > 0))[0];
            replacements.set(representative.taskId, { ...representative, resourceRepresentativeSelected: true,
                resourceRepresentativeGroupSize: members.length });
            for (const task of candidates) if (task.taskId !== representative.taskId) replacements.set(task.taskId,
                { ...task, eligible: false, resourceRepresentativeBlocked: true,
                    representedByTaskId: representative.taskId,
                    eligibilityReason: 'Represented by ' + representative.displayName + ' for ' + task.resourceRepresentative.resourceLabel,
                    whyWouldBeIneligible: [...task.whyWouldBeIneligible, 'another currently achievable recipe represents this resource'] });
        }
        return tasks.map(task => replacements.get(task.taskId) || task);
    }
    function openCatchUpMilestones(tasks, state = null) {
        const open = tasks.filter(task => task.eligible && task.advancesSkillProgression);
        const blocked = tasks.filter(task => task.progressionBlocked && task.advancesSkillProgression &&
            task.available !== false && !task.completed && !task.backlogged && !task.superseded && task.activeOrigins?.length &&
            (task.level || 1) <= (state?.actualLevels?.[task.skill] || 1));
        const replacements = new Map();
        for (const task of blocked) {
            const catchUpOrigins = task.activeOrigins.filter(origin => {
                if (open.some(other => other.skill === task.skill && other.activeOrigins.some(otherOrigin =>
                    sameAccessibleArea(origin, otherOrigin)))) return false;
                const nearest = Math.min(...blocked.filter(other => other.skill === task.skill && other.activeOrigins.some(otherOrigin =>
                    sameAccessibleArea(origin, otherOrigin))).map(other => other.level || 1));
                return (task.level || 1) === nearest;
            });
            if (!catchUpOrigins.length) continue;
            replacements.set(task.taskId, { ...task, activeOrigins: catchUpOrigins, eligible: true,
                progressionBlocked: false, catchUpProgression: true, catchUpOrigins,
                progressionCeiling: task.level,
                eligibilityReason: 'Your actual ' + task.skill + ' level makes this the nearest unfinished milestone available here',
                whyWouldBeIneligible: (task.whyWouldBeIneligible || []).filter(reason => reason !== 'above current progression window') });
        }
        return tasks.map(task => replacements.get(task.taskId) || task);
    }
    function openForestryCompanionMilestones(tasks) {
        const treeOrigins = tasks.filter(task => task.eligible && task.accessResult?.forestry)
            .flatMap(task => {
                const activeAreas = task.activeOrigins || [];
                const treeSource = task.accessResult.treeSource || {};
                return [...(treeSource.origins || []), ...(treeSource.levelBlockedOrigins || [])]
                    .filter(tree => activeAreas.some(area => sameAccessibleArea(area, tree)));
            });
        if (!treeOrigins.length) return tasks;
        const sameTreeSource = (left, right) => sameAccessibleArea(left, right) &&
            comparableItemKey(left.sourceName) === comparableItemKey(right.sourceName);
        return tasks.map(task => {
            if (task.skill !== 'Woodcutting' || !task.advancesSkillProgression || !task.progressionBlocked ||
                task.available === false || task.completed || task.backlogged || task.superseded) return task;
            const companionOrigins = (task.activeOrigins || []).filter(origin =>
                treeOrigins.some(tree => sameTreeSource(origin, tree)));
            if (!companionOrigins.length) return task;
            return { ...task, activeOrigins: companionOrigins, eligible: true, progressionBlocked: false,
                forestryCompanion: true, progressionCeiling: task.level,
                eligibilityReason: 'Available here as a Woodcutting milestone while this Forestry task is active',
                whyWouldBeIneligible: (task.whyWouldBeIneligible || []).filter(reason => reason !== 'above current progression window') };
        });
    }
    function scopeAxeUpgradesToWoodcutting(tasks) {
        const generallyActionable = task => !task.completed && !task.backlogged && !task.superseded &&
            !task.progressionBlocked && task.activeOrigins?.length > 0;
        const woodcuttingOpportunity = tasks.some(task => generallyActionable(task) && (
            (task.skill === 'Woodcutting' && task.advancesSkillProgression &&
                (task.eligible || task.availableWithoutPersistentEnablers === true)) ||
            (task.accessResult?.forestry && task.eligible) ||
            (task.eligible && (task.resourceMilestoneDependencies || []).some(dependency =>
                dependency.producers?.some(producer => producer.skill === 'Woodcutting')))
        ));
        if (woodcuttingOpportunity) return tasks;
        return tasks.map(task => {
            if (task.bisSet !== 'BIS Axe' || !task.eligible) return task;
            const reasons = String(task.bisReason || '').split(/\/​?/).map(reason => reason.trim()).filter(Boolean);
            if (reasons.some(reason => !reason.startsWith('BIS Skilling'))) return task;
            return { ...task, eligible: false, axeOpportunityDeferred: true,
                eligibilityReason: 'No unfinished Woodcutting-related task is currently active',
                whyWouldBeIneligible: [...(task.whyWouldBeIneligible || []),
                    'no unfinished Woodcutting-related task is currently active'] };
        });
    }
    function scopeEnablersToCurrentProgression(tasks) {
        const byId = new Map(tasks.map(task => [task.taskId, task]));
        return tasks.map(task => {
            if (task.taskClass !== 'enabler' || !task.requiredBy?.length) return task;
            const actionable = task.requiredBy.filter(dependency => {
                const target = byId.get(dependency.taskId);
                return target && target.availableWithoutPersistentEnablers !== false &&
                    !target.completed && !target.backlogged && !target.superseded && !target.progressionBlocked &&
                    !target.resourceMilestoneBlocked && target.activeOrigins?.length > 0;
            });
            if (actionable.length) return { ...task, requiredBy: actionable,
                accessResult: task.accessResult ? { ...task.accessResult, requiredBy: actionable } : task.accessResult };
            return { ...task, eligible: false, enablerProgressionDeferred: true,
                eligibilityReason: 'No unfinished task in the current progression window needs ' + task.enablerItemKey,
                whyWouldBeIneligible: [...(task.whyWouldBeIneligible || []), 'no dependent task is in the current progression window'] };
        });
    }
    function adaptTasks(tasks, legacy, state, unlocked, sections, manualSections, catalog = tasks, ids = {}, data = null) {
        const completedItems = completedEquipmentItems(legacy, state, ids);
        const adapted = tasks.map(task => {
            const origins = own(state.originOverrides, task.taskId) ? state.originOverrides[task.taskId].map(value => ({
                ...parseLocation(value), sourceType: 'manual', sourceName: 'Manual origin', reason: 'User origin override'
            })) : task.origins;
            const encounterSources = task.encounterSources || task.bossSources || [];
            const blockedState = state.blockedEncounters || state.blockedBosses || {};
            const blockedEncounterSources = encounterSources.filter(encounter => blockedState[encounter] === true);
            const blockedEncounterSet = new Set(blockedEncounterSources);
            const permittedOrigins = origins.filter(origin => !blockedEncounterSet.has(origin.sourceName));
            const encounterDeferred = !permittedOrigins.length && blockedEncounterSources.length > 0;
            const activeOrigins = permittedOrigins.filter(origin => locationAvailable(origin, unlocked, sections, manualSections));
            const activeSlayerTrainingOrigins = (task.slayerTrainingOrigins || [])
                .filter(origin => !blockedEncounterSet.has(origin.sourceName))
                .filter(origin => locationAvailable(origin, unlocked, sections, manualSections));
            const impliedByItem = impliedEquipmentCompletion(task, completedItems, state);
            const impliedByBetterEquipment = superiorEquipmentCompletion(task, completedItems, data, state);
            const completed = isComplete(task, legacy, state) || !!impliedByItem || !!impliedByBetterEquipment,
                backlogged = isBacklogged(task, legacy);
            const highWater = state.progressionHighWater?.[task.skill] ?? 0;
            const ceiling = task.usesSkillLevelWindow ? progressionCeiling(catalog, task.skill, highWater,
                state.actualLevels?.[task.skill] || 1) : null;
            const superseded = !!task.advancesSkillProgression && task.level <= highWater;
            const progressionBlocked = !!task.usesSkillLevelWindow && task.level > ceiling;
            return { ...task, origins, activeOrigins, blockedEncounterSources, encounterDeferred,
                // Keep the old names on calculated tasks so completed visit
                // snapshots and older integrations remain readable.
                blockedBossSources: blockedEncounterSources, bossDeferred: encounterDeferred, activeSlayerTrainingOrigins,
                slayerTrainingAlternative: !!task.slayerTrainingAlternative && activeSlayerTrainingOrigins.length > 0,
                completed, implicitlyCompleted: !!impliedByItem || !!impliedByBetterEquipment,
                completionEvidenceItem: impliedByBetterEquipment || impliedByItem,
                superiorEquipmentCompletion: !!impliedByBetterEquipment,
                backlogged, superseded,
                progressionBlocked, progressionHighWater: task.usesSkillLevelWindow ? highWater : null,
                progressionCeiling: ceiling,
                eligible: task.available !== false && !completed && !backlogged && !superseded && !progressionBlocked && activeOrigins.length > 0,
                eligibilityReason: impliedByItem ? 'Completed by obtaining ' + impliedByItem : completed ? 'Completed' : superseded ? 'At or below the highest completed ' + task.skill + ' task (level ' + highWater + ')' :
                    progressionBlocked ? 'Above the current ' + task.skill + ' progression window (next through level ' + ceiling + ')' : backlogged ? 'Backlogged' :
                    task.available === false ? task.accessResult?.reason || 'Access unavailable' : !origins.length ? 'Unassigned origin' :
                    encounterDeferred ? 'Encounter deferred until you reactivate ' + blockedEncounterSources.join(', ') :
                    !activeOrigins.length ? 'Origin geography or section is closed' : 'Eligible',
                whyWouldBeIneligible: completed ? [impliedByItem ? 'completed by a specific acquired equipment item' : 'completed'] : [
                    ...(superseded ? ['at or below highest completed skill-task level'] : []), ...(progressionBlocked ? ['above current progression window'] : []),
                    ...(backlogged ? ['backlogged'] : []), ...(task.available === false ? [task.accessResult?.reason || 'access unavailable'] : []),
                    ...(!origins.length ? ['no attributed origin'] : []), ...(encounterDeferred ?
                        ['encounter deferred until manually reactivated: ' + blockedEncounterSources.join(', ')] : []),
                    ...(permittedOrigins.length && !activeOrigins.length ? ['origin geography or section closed'] : [])
                ] };
        });
        const withForestryCompanions = openForestryCompanionMilestones(adapted);
        const withCatchUp = openCatchUpMilestones(withForestryCompanions, state);
        const progressionScoped = scopeAxeUpgradesToWoodcutting(scopeEnablersToCurrentProgression(withCatchUp));
        const ordered = orderResourceMilestoneTasks(collapseRedundantEquipmentTasks(progressionScoped), legacy, state, ids);
        return scopeEnablersToCurrentProgression(chooseResourceRepresentativeTasks(ordered, state));
    }

    function actualCombatLevel(levels = {}) {
        return Math.floor(((levels.Defence || 1) + (levels.Hitpoints || 10) + Math.floor((levels.Prayer || 1) / 2)) / 4 +
            .325 * Math.max((levels.Attack || 1) + (levels.Strength || 1), Math.floor((levels.Ranged || 1) * 1.5),
                Math.floor((levels.Magic || 1) * 1.5)));
    }

    function combatProgressionRequirementLevel(state = {}, actualLevel = 3, cutoff = 60, window = 10) {
        const progression = state.combatProgression || {};
        if (progression.mature) return 126;
        const frontier = Math.max(1, Math.min(cutoff, Number(progression.frontier) || 1));
        return Math.max(Number(actualLevel) || 3, Math.min(126, frontier + window));
    }

    function setSlayerMasterState(state, master, status) {
        if (!master || !['pending', 'usable'].includes(status)) throw new Error('Invalid Slayer master state');
        return { ...state, slayerMasters: { ...(state.slayerMasters || {}), [master]: status } };
    }

    function slayerLockDefinition(data = {}, lock = null) {
        if (!lock || typeof lock !== 'object') return null;
        const normalized = value => stripMarkup(String(value || '')).trim().toLowerCase();
        const findKey = (object, value) => Object.keys(object || {}).find(key => normalized(key) === normalized(value));
        const master = findKey(data.slayerMasterTasks, lock.master);
        const masterEntries = master ? data.slayerMasterTasks[master] || {} : {};
        const assignment = findKey(masterEntries, lock.assignment);
        const families = data.codeItems?.slayerTasks || {};
        const family = findKey(families, lock.monster) ||
            findKey(families, assignment ? assignment.split(' - ')[0] : lock.assignment);
        if (!family) return null;
        return { master: master || null, assignment: assignment || null, family,
            entry: assignment ? masterEntries[assignment] || {} : null,
            monsters: Object.keys(data.codeItems.slayerTasks[family] || {}) };
    }

    function slayerLockTargets(data = {}, lock = null) {
        const definition = slayerLockDefinition(data, lock);
        if (!definition) return [];
        const generic = [...new Set((data.codeItems?.slayerTaskChunks?.[definition.family] || []).map(String))];
        if (!definition.entry?.Chunks?.length) return generic;
        const chunks = data.chunks || {}, graph = new Map();
        const connect = (left, right) => {
            if (!left || !right) return;
            (graph.get(left) || graph.set(left, new Set()).get(left)).add(right);
            (graph.get(right) || graph.set(right, new Set()).get(right)).add(left);
        };
        for (const [location, chunk] of Object.entries(chunks)) {
            for (const target of Object.keys(chunk.Connect || {})) connect(location, target);
            for (const section of Object.values(chunk.Sections || {})) {
                for (const target of Object.keys(section.Connect || {})) connect(location, target);
            }
        }
        const normalized = value => stripMarkup(String(value || '')).trim().toLowerCase();
        const namedLocations = Object.keys(chunks).filter(location => !parseLocation(location));
        for (const [location, chunk] of Object.entries(chunks)) if (chunk.Name) {
            const name = normalized(chunk.Name).split('#')[0];
            for (const named of namedLocations) if (normalized(named).split('#')[0] === name) connect(location, named);
        }
        const roots = definition.entry.Chunks.flatMap(raw => expand(raw, data.codeItems?.chunksPlus)).flatMap(location => {
            if (own(chunks, location) || parseLocation(location)) return [String(location)];
            const key = normalized(location);
            return Object.keys(chunks).filter(candidate => normalized(candidate).includes(key) || key.includes(normalized(candidate)));
        });
        const targets = new Set();
        for (const root of roots) {
            const queue = [root], visited = new Set();
            while (queue.length) {
                const location = queue.shift();
                if (visited.has(location)) continue;
                visited.add(location);
                const parsed = parseLocation(location), chunk = chunks[location];
                if (parsed && chunk?.Nickname) { targets.add(parsed.chunkId); continue; }
                for (const neighbour of graph.get(location) || []) queue.push(neighbour);
            }
        }
        return [...targets];
    }

    function slayerLockStatus(data = {}, lock = null, base = {}) {
        const definition = slayerLockDefinition(data, lock);
        if (!definition) return { satisfied: false, targets: [], family: null, matches: [] };
        const allowed = definition.entry?.Chunks?.flatMap(raw => expand(raw, data.codeItems?.chunksPlus)) || [];
        const locationMatches = (left, right) => {
            const a = parseLocation(left), b = parseLocation(right);
            if (!a || !b) return String(left) === String(right);
            return a.chunkId === b.chunkId && (!a.sectionId || !b.sectionId || a.sectionId === b.sectionId);
        };
        const level = Math.max(1, Number(lock.level) || 1), matches = [];
        for (const monster of definition.monsters) {
            if (Number(data.slayerMonsters?.[monster] || 1) > level) continue;
            for (const origin of Object.keys(base.monsters?.[monster] || {})) {
                if (allowed.length && !allowed.some(location => locationMatches(origin, location))) continue;
                matches.push({ monster, origin });
            }
        }
        return { satisfied: matches.length > 0, targets: slayerLockTargets(data, lock),
            master: definition.master, assignment: definition.assignment, family: definition.family, matches };
    }

    function setEncounterBlocked(state, encounter, blocked) {
        if (!encounter || typeof encounter !== 'string' || typeof blocked !== 'boolean') throw new Error('Invalid encounter state');
        const blockedEncounters = { ...(state.blockedEncounters || state.blockedBosses || {}) };
        if (blocked) blockedEncounters[encounter] = true;
        else delete blockedEncounters[encounter];
        const updated = { ...state, blockedEncounters };
        delete updated.blockedBosses;
        return updated;
    }
    const setBossBlocked = setEncounterBlocked;

    // Slayer weights are probabilities within one master's assignment table.
    // They are reported for diagnostics, but never compared between masters.
    function slayerProgressionModel({ data, state, legacy = {}, base = {}, ids = {}, unlocked = {}, sections = {}, manualSections = {} }) {
        const levels = state.actualLevels || {}, actualLevel = Math.max(Number(levels.Slayer) || 1,
            Number(legacy.slayerLocked?.level) || 1);
        const combatLevel = actualCombatLevel(levels), codes = data.codeItems || {};
        const complete = (name, skill) => {
            const meta = data.challenges?.[skill]?.[name] || {};
            return isComplete(taskMetadata(name, skill, meta, ids), legacy, state);
        };
        const requirementsComplete = (requirements, ownerName = null, ownerMeta = null) => Object.entries(requirements || {}).every(([raw, skill]) => {
            // The legacy worker mirrors Skills into synthetic task links while
            // calculating. They are level checks, not completed-goal gates.
            if (ownerName && raw === ownerName + '--' + skill && own(ownerMeta?.Skills, skill)) return true;
            const choices = expand(raw, codes.tasksPlus), count = raw.includes('[+]x') ? Number(raw.split('[+]x')[1]) : 1;
            return choices.filter(name => complete(name.split('--')[0], skill)).length >= count;
        });
        const locationMatches = (left, right) => {
            const a = parseLocation(left), b = parseLocation(right);
            if (!a || !b) return String(left) === String(right);
            return a.chunkId === b.chunkId && (!a.sectionId || !b.sectionId || a.sectionId === b.sectionId);
        };
        const groupLocations = raw => expand(raw, codes.chunksPlus);
        const groupAvailable = raw => {
            const choices = groupLocations(raw), count = raw.includes('[+]x') ? Number(raw.split('[+]x')[1]) : 1;
            return choices.filter(location => {
                const parsed = parseLocation(location);
                return parsed ? locationAvailable(parsed, unlocked, sections, manualSections) : own(unlocked, location);
            }).length >= count;
        };
        const masterChallenge = master => Object.entries(data.challenges?.Slayer || {}).find(([name, meta]) =>
            /^Receive a Slayer assignment from\b/.test(displayName(name)) && (meta.NPCs || []).includes(master));
        const masterCandidate = master => {
            const found = masterChallenge(master);
            if (!found || !Object.keys(base.npcs?.[master] || {}).length) return null;
            const [name, meta] = found;
            if (!requirementsComplete(meta.Tasks, name, meta) || !(meta.Chunks || []).every(groupAvailable)) return null;
            return { name, meta, requiredSlayer: Number(meta.Level || 1),
                deferredSkillRequirements: { ...(meta.Skills || {}) } };
        };
        // Combat and other numeric requirements are grinds, not tracker gates.
        // There is no reliable way to infer a player's exact levels from goals,
        // so excluding these entries would create false negatives. Quest and
        // other discrete completion requirements remain authoritative.
        const entryNonLevelRequirementsMet = entry => requirementsComplete(entry.Tasks);
        const entryOrigins = (entry, monster) => {
            const origins = Object.keys(base.monsters?.[monster] || {});
            if (!entry.Chunks?.length) return origins;
            const allowed = entry.Chunks.flatMap(groupLocations);
            return origins.filter(origin => allowed.some(location => locationMatches(origin, location)));
        };
        const familyMonsters = family => Object.keys(codes.slayerTasks?.[family] || {});
        const candidates = [];
        for (const [master, entries] of Object.entries(data.slayerMasterTasks || {})) {
            const candidate = masterCandidate(master);
            if (!candidate) continue;
            const futureEntries = Object.entries(entries).filter(([, entry]) => entryNonLevelRequirementsMet(entry)).map(([name, entry]) => ({
                name, family: name.split(' - ')[0], level: Number(entry.Level || 1), weight: Number(entry.Weight || 0), entry,
                deferredCombatLevel: Number(entry.CombatLevel || 3), deferredSkillRequirements: { ...(entry.Skills || {}) }
            }));
            const currentEntries = futureEntries.filter(record => record.level <= actualLevel);
            const doableEntries = currentEntries.filter(record => familyMonsters(record.family).some(monster =>
                entryOrigins(record.entry, monster).length));
            const priority = Number(candidate.meta.Priority || 0);
            candidates.push({ master, priority, requiredSlayer: candidate.requiredSlayer,
                requiredCombat: Number(candidate.deferredSkillRequirements.Combat || 3),
                deferredSkillRequirements: candidate.deferredSkillRequirements,
                currentAssignableWeight: currentEntries.reduce((sum, record) => sum + record.weight, 0),
                currentDoableWeight: doableEntries.reduce((sum, record) => sum + record.weight, 0),
                currentDoableFamilies: [...new Set(doableEntries.map(record => record.family))],
                maximumSupportedLevel: Math.max(actualLevel, ...futureEntries.map(record => record.level)), futureEntries });
        }
        const statusOf = master => master.requiredCombat <= 3 ? 'usable' : state.slayerMasters?.[master.master] || 'unknown';
        candidates.forEach(master => { master.status = statusOf(master); });
        // A confirmed low-level master with one currently doable assignment
        // provides the training route to higher-Slayer masters. Without such a
        // route, only masters that could start training now may request their
        // one-time combat confirmation.
        const seedMasters = candidates.filter(master => master.requiredSlayer <= actualLevel && master.currentDoableFamilies.length > 0);
        const hasUsableSeed = seedMasters.some(master => master.status === 'usable');
        const reachableMasters = hasUsableSeed ? candidates : seedMasters;
        const masters = reachableMasters.filter(master => master.status === 'usable');
        const unknownMasters = reachableMasters.filter(master => master.status === 'unknown');
        const pendingMasters = reachableMasters.filter(master => master.status === 'pending');
        const maximumSupportedLevel = Math.max(actualLevel, ...masters.map(master => master.maximumSupportedLevel));
        // Keep the next table milestone as a diagnostic. Slayer does not use a
        // numeric task band: exact membership in a usable master's pool is the
        // gate for Slayer creatures and their drops.
        const milestones = [...new Set(masters.flatMap(master => master.futureEntries.map(entry => entry.level))
            .filter(level => Number.isFinite(level) && level > 1))].sort((a, b) => a - b);
        const nextMilestone = milestones.find(level => level > actualLevel && level <= maximumSupportedLevel) || null;
        const ceiling = maximumSupportedLevel;
        const monsterFamilies = new Map();
        for (const [family, monsters] of Object.entries(codes.slayerTasks || {})) for (const monster of Object.keys(monsters || {})) {
            const families = monsterFamilies.get(monster) || [];
            if (!families.includes(family)) families.push(family);
            monsterFamilies.set(monster, families);
        }
        const supportFrom = (masterPool, monster, origin) => masterPool.flatMap(master => master.futureEntries.filter(record =>
            (monsterFamilies.get(monster) || []).includes(record.family) && entryOrigins(record.entry, monster).some(location =>
                locationMatches(location, origin.chunkId + (origin.sectionId ? '-' + origin.sectionId : '')))).map(record => ({
                    master: master.master, family: record.family, level: record.level, weight: record.weight,
                    requiredCombat: master.requiredCombat,
                    deferredCombatLevel: record.deferredCombatLevel,
                    deferredSkillRequirements: record.deferredSkillRequirements
                })));
        const monsterSupportAtOrigin = (monster, origin) => supportFrom(masters, monster, origin);
        const unknownMonsterSupportAtOrigin = (monster, origin) => supportFrom(unknownMasters, monster, origin);
        const pendingMonsterSupportAtOrigin = (monster, origin) => supportFrom(pendingMasters, monster, origin);
        const supportsMonsterAtOrigin = (monster, origin) => monsterSupportAtOrigin(monster, origin).length > 0;
        const candidateByName = new Map(candidates.map(master => [master.master, master]));
        const masterStatuses = Object.keys(data.slayerMasterTasks || {}).map(master => {
            const found = masterChallenge(master), candidate = candidateByName.get(master);
            const requiredCombat = Number(found?.[1]?.Skills?.Combat || 3);
            return { master, requiredCombat, requiredSlayer: Number(found?.[1]?.Level || 1),
                status: requiredCombat <= 3 ? 'usable' : state.slayerMasters?.[master] || 'unknown',
                accessible: !!candidate, reachable: reachableMasters.includes(candidate) };
        });
        return { actualLevel, combatLevel, trainingAvailable: masters.length > 0, ceiling, nextMilestone,
            maximumSupportedLevel, masters, unknownMasters, pendingMasters, reachableMasters,
            masterStatuses,
            monsterSupportAtOrigin, unknownMonsterSupportAtOrigin, pendingMonsterSupportAtOrigin,
            supportsMonsterAtOrigin };
    }

    function travelConnectionPairs(connections = []) {
        const pairs = [];
        for (const connection of connections || []) {
            // The tracker does not record coins or consumable travel supplies.
            // Only an explicitly verified, cost-free return route may create a
            // roll edge; all other transports stay excluded rather than risk
            // leaving the player unable to return to their unlocked world.
            if (connection?.eligibility !== 'free-round-trip') continue;
            const endpoints = [...new Set((connection?.endpoints || []).map(value => {
                const parsed = parseLocation(value);
                return parsed ? parsed.chunkId + (parsed.sectionId ? '-' + parsed.sectionId : '') : null;
            }).filter(Boolean))];
            for (let left = 0; left < endpoints.length; left++) for (let right = left + 1; right < endpoints.length; right++) {
                pairs.push({ from: endpoints[left], to: endpoints[right], connection });
            }
        }
        return pairs;
    }

    function localMapConnection(data, from, to) {
        // Small isolated graph fixtures and callers without the map catalog do
        // not have enough information to classify a link as transportation.
        if (!data?.chunks) return true;
        const left = parseLocation(from), right = parseLocation(to);
        if (!left || !right) return false;
        const leftId = Number(left.chunkId), rightId = Number(right.chunkId);
        const leftX = Math.floor(leftId / 256), rightX = Math.floor(rightId / 256);
        const leftY = leftId % 256, rightY = rightId % 256;
        return Math.abs(leftX - rightX) <= 1 && Math.abs(leftY - rightY) <= 1;
    }

    function buildTravelGraph(data, unlocked, accessibleSections = {}, frontier = [], connectionAllowed = () => true, travelConnections = []) {
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
        const connect = (from, to, connection = null, checkMedium = true) => {
            const fromChunk = parseLocation(from)?.chunkId, toChunk = parseLocation(to)?.chunkId;
            if (!fromChunk || !toChunk || !availableLocations.has(from) || !availableLocations.has(to) ||
                (checkMedium && !mediumConnectionAllowed(data, from, to)) || !connectionAllowed(from, to, connection)) return;
            if (!sectionGraph[from].includes(to)) sectionGraph[from].push(to);
            if (!sectionGraph[to].includes(from)) sectionGraph[to].push(from);
            if (fromChunk !== toChunk) edges.add([fromChunk, toChunk].sort().join('|'));
        };
        for (const [chunkId, sectionMap] of Object.entries(data.sections || {})) {
            if (!allowedChunks.has(chunkId)) continue;
            for (const [sectionId, connections] of Object.entries(sectionMap || {})) {
                const from = chunkId + (sectionId === '0' ? '' : '-' + sectionId);
                if (!availableLocations.has(from)) continue;
                for (const rawTarget of connections || []) {
                    const target = parseLocation(rawTarget);
                    if (!target || !allowedChunks.has(target.chunkId)) continue;
                    const to = target.chunkId + (target.sectionId ? '-' + target.sectionId : '');
                    // Long-distance section links are transports in the source
                    // map. They need an audited free-round-trip annotation
                    // instead of inheriting the walking graph's two-way edge.
                    if (!localMapConnection(data, from, to)) continue;
                    connect(from, to);
                }
            }
        }
        for (const { from, to, connection } of travelConnectionPairs(travelConnections)) connect(from, to, connection, false);
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

    function deriveConnectedFrontier(data, unlocked, allowedChunkIds = [], blacklisted = {}, travelConnections = []) {
        const allowed = new Set(allowedChunkIds.map(String)), found = new Set();
        for (const [fromChunk, sectionMap] of Object.entries(data.sections || {})) {
            for (const [fromSection, connections] of Object.entries(sectionMap || {})) for (const rawTarget of connections || []) {
                const from = fromChunk + (fromSection === '0' ? '' : '-' + fromSection);
                if (!localMapConnection(data, from, rawTarget)) continue;
                const target = parseLocation(rawTarget)?.chunkId;
                if (!target || own(unlocked, fromChunk) === own(unlocked, target)) continue;
                const lockedId = own(unlocked, fromChunk) ? target : fromChunk;
                if (allowed.has(lockedId) && !own(blacklisted, lockedId)) found.add(lockedId);
            }
        }
        for (const { from, to } of travelConnectionPairs(travelConnections)) {
            const fromChunk = parseLocation(from).chunkId, toChunk = parseLocation(to).chunkId;
            if (own(unlocked, fromChunk) === own(unlocked, toChunk)) continue;
            const lockedId = own(unlocked, fromChunk) ? toChunk : fromChunk;
            if (allowed.has(lockedId) && !own(blacklisted, lockedId)) found.add(lockedId);
        }
        return [...found].sort((a, b) => Number(b) - Number(a));
    }

    function inferConnectedSections(data, unlocked, explicitSections = {}, connectionAllowed = () => true, travelConnections = []) {
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
                        if (!localMapConnection(data, from, to)) continue;
                        if (!mediumConnectionAllowed(data, from, to) || !connectionAllowed(from, to) || !target.sectionId ||
                            inferred[target.chunkId]?.[target.sectionId] === true ||
                            inferred[target.chunkId]?.[target.sectionId] === false) continue;
                        open(target.chunkId, target.sectionId); changed = true;
                    }
                }
            }
            for (const { from, to, connection } of travelConnectionPairs(travelConnections)) for (const [source, target] of [[from, to], [to, from]]) {
                const sourceLocation = parseLocation(source), targetLocation = parseLocation(target);
                if (!own(unlocked, sourceLocation.chunkId) || !own(unlocked, targetLocation.chunkId) ||
                    (sourceLocation.sectionId && inferred[sourceLocation.chunkId]?.[sourceLocation.sectionId] !== true) ||
                    !connectionAllowed(source, target, connection) || !targetLocation.sectionId ||
                    inferred[targetLocation.chunkId]?.[targetLocation.sectionId] !== undefined) continue;
                open(targetLocation.chunkId, targetLocation.sectionId); changed = true;
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
        if (!canRoll(state)) throw new Error('Complete or void the current visit first');
        return { ...state, travelAnchor: parsed.chunkId, travelAnchorSections: parsed.sectionId ? [parsed.sectionId] : null,
            adminHistory: [...state.adminHistory,
            { timestamp, action: 'set_travel_anchor', locationId: parsed.chunkId, sectionId: parsed.sectionId, reason }] };
    }

    function derivePool(frontier, unlocked, tasks, currentVisit, travelGraph = null, travelAnchor = null, travelAnchorSections = null) {
        const byLocation = {}, byNode = {};
        for (const id of Object.keys(unlocked || {})) byLocation[id] = [];
        for (const task of tasks) {
            // An unconfirmed master gets one encounter ticket so the player has
            // a chance to answer once. A pending master gets none, which keeps
            // its dependent chunks dormant until the master is activated.
            const awaitingMaster = task.slayerMasterConfirmation?.status === 'unknown' &&
                !task.slayerMasterConfirmation.otherRequirementsBlocked && !task.completed && !task.backlogged &&
                !task.superseded && !task.progressionBlocked;
            const ticketOrigins = task.eligible ? task.activeOrigins || [] : awaitingMaster ? task.slayerMasterConfirmation.origins || [] : [];
            for (const origin of uniqueOrigins(ticketOrigins)) {
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
            const traverse = (blockingChunks = new Set(), knownEncounters = new Map()) => {
                const traversed = new Set(startNodes), queue = startNodes.map(id => ({ id, distance: 0 })), found = new Map();
                const reachableFreeSet = new Set(), reachableLiveSet = new Set();
                while (queue.length) {
                    const { id: from, distance } = queue.shift();
                    for (const node of travelGraph.sectionGraph[from] || []) {
                        const parsed = parseLocation(node), locationId = parsed.chunkId;
                        const nodeTasks = [...new Set([...(byNode[node] || []), ...(byNode[locationId] || [])])];
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
                        } else if (locationId === current) {
                            // Connected sections inside the tile we are standing on
                            // remain usable as routes, but can never become a revisit
                            // encounter even when recalculation reveals another task.
                            if (!traversed.has(node)) {
                                traversed.add(node);
                                queue.push({ id: node, distance });
                            }
                        } else if (blockingChunks.has(locationId)) {
                            // Discovery may reach this chunk's task through a
                            // later section after first crossing a task-free
                            // section of the same chunk. The whole chunk still
                            // stops onward travel, but it must remain the
                            // encounter rather than blocking its own ticket.
                            const encounter = knownEncounters.get(locationId);
                            if (encounter && !found.has(locationId)) found.set(locationId, {
                                ...encounter,
                                metadata: {
                                    ...encounter.metadata,
                                    taskIds: [...(encounter.metadata.taskIds || [])],
                                    entrySections: [...(encounter.metadata.entrySections || [])]
                                }
                            });
                            if (encounter) reachableLiveSet.add(locationId);
                        } else if (nodeTasks.length) {
                            const entrySections = parsed.sectionId ? [parsed.sectionId] : [];
                            if (!found.has(locationId)) found.set(locationId, { kind: 'revisit', locationId, weight: 1,
                                metadata: { taskCount: nodeTasks.length, taskIds: nodeTasks, distance: distance + 1, entrySections } });
                            else if (found.get(locationId).kind === 'revisit') {
                                const metadata = found.get(locationId).metadata;
                                metadata.distance = Math.min(metadata.distance, distance + 1);
                                metadata.taskIds = [...new Set([...metadata.taskIds, ...nodeTasks])];
                                metadata.taskCount = metadata.taskIds.length;
                                metadata.entrySections = [...new Set([...metadata.entrySections, ...entrySections])];
                            }
                            reachableLiveSet.add(locationId);
                        } else if (!blockingChunks.has(locationId) && !traversed.has(node)) {
                            traversed.add(node); reachableFreeSet.add(locationId); queue.push({ id: node, distance: distance + 1 });
                        }
                    }
                }
                return { found, reachableFreeSet, reachableLiveSet };
            };
            // First find every task-bearing section reachable by the ordinary
            // section graph. Then repeat with those whole chunks acting as
            // encounters, so another disconnected section cannot be used as a
            // hidden free passage around a reachable task in the same chunk.
            const discovered = traverse();
            const final = discovered.reachableLiveSet.size ? traverse(discovered.reachableLiveSet, discovered.found) : discovered;
            candidates.push(...final.found.values());
            reachableFree.push(...final.reachableFreeSet); reachableLive.push(...final.reachableLiveSet);
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
        } else {
            // Before the first tile (and for callers without geography data),
            // retain the complete starting pool. Imported runs receive an
            // inferred anchor before this function is called by the UI.
            for (const locationId of frontierSet) candidates.push({ kind: 'frontier', locationId, weight: 1, metadata: { distance: null } });
            if (!travelGraph) for (const locationId of live) {
                if (locationId === current) continue;
                candidates.push({ kind: 'revisit', locationId, weight: 1, metadata: { taskCount: byLocation[locationId].length,
                    taskIds: [...byLocation[locationId]], distance: null } });
                reachableLive.push(locationId);
            }
        }
        return { candidates: candidates.filter(candidate => candidate.locationId !== current), live, dormant,
            reachableLive: reachableLive.filter(id => id !== current), reachableFree: reachableFree.filter(id => id !== current),
            byLocation, current };
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
        if (!canRoll(state)) throw new Error('Complete or void the current visit first');
        if (!candidate) throw new Error('No locations available');
        const destination = parseLocation(candidate.locationId)?.chunkId;
        const current = parseLocation(state.travelAnchor)?.chunkId;
        if (candidate.kind !== 'admin' && current && destination === current) {
            throw new Error('The current tile cannot be rolled again');
        }
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
    const snapshotTask = task => ({ name: task.name, skill: task.skill, displayName: task.displayName, level: task.level || null,
        equipmentName: task.equipmentName || null, taskClass: task.taskClass || null,
        bossSources: task.bossSources || [], encounterSources: task.encounterSources || task.bossSources || [],
        encounterDetails: task.encounterDetails || {},
        enablerItemKey: task.enablerItemKey || null, provesAcquiredItemKeys: task.provesAcquiredItemKeys || [],
        confirmsEquipped: !!task.confirmsEquipped, capabilities: task.capabilities || [],
        bisReason: task.bisReason || null, bisSet: task.bisSet || null,
        clueReward: task.clueReward ? copy(task.clueReward) : null,
        slayerTrainingAlternative: !!task.slayerTrainingAlternative,
        slayerTrainingMasters: task.slayerTrainingMasters || [],
        slayerProgression: task.slayerProgression ? {
            requiredLevel: task.slayerProgression.requiredLevel,
            supportingMasters: task.slayerProgression.supportingMasters || [],
            requiresTraining: !!task.slayerProgression.requiresTraining
        } : null });
    const VISIT_SNAPSHOT_DISPLAY_FIELDS = Object.freeze(['name', 'skill', 'displayName', 'level', 'equipmentName',
        'taskClass', 'bossSources', 'encounterSources', 'encounterDetails', 'enablerItemKey',
        'provesAcquiredItemKeys', 'confirmsEquipped', 'capabilities', 'bisReason', 'bisSet',
        'slayerTrainingAlternative', 'slayerTrainingMasters', 'slayerProgression']);
    function mergeVisitTaskForDisplay(liveTask, savedTask) {
        if (!liveTask) return null;
        if (!savedTask || typeof savedTask !== 'object') return liveTask;
        const snapshotDisplay = {};
        for (const field of VISIT_SNAPSHOT_DISPLAY_FIELDS) {
            if (own(savedTask, field)) snapshotDisplay[field] = copy(savedTask[field]);
        }
        // clueReward changes which visual group owns the row. A visit snapshot
        // created before this field existed was an ordinary row, so absence is
        // deliberately treated as null rather than adopting later provenance.
        snapshotDisplay.clueReward = own(savedTask, 'clueReward') && savedTask.clueReward ?
            copy(savedTask.clueReward) : null;
        return { ...liveTask, ...snapshotDisplay };
    }
    function visitTaskVisible(visit, task) {
        if (!task || task.implicitlyCompleted) return false;
        if (visit?.status !== 'resolved') return true;
        return task.taskId === visit.resolvedTaskId || task.completed || task.eligible !== false;
    }
    function originMatchesVisit(origin, visit) {
        const arrivalSections = new Set(visit.arrivalSections || []);
        return origin?.chunkId === visit.locationId &&
            (!arrivalSections.size || !origin.sectionId || arrivalSections.has(origin.sectionId));
    }
    function taskMatchesVisit(task, visit) {
        return task.activeOrigins?.some(origin => originMatchesVisit(origin, visit));
    }
    function slayerMasterConfirmationForVisit(tasks, visit) {
        if (visit?.status !== 'pending_calculation') return null;
        const reachableIds = new Set(visit.reachableTaskIds || []);
        const direct = tasks.filter(task => task.eligible &&
            (reachableIds.size ? reachableIds.has(task.taskId) : taskMatchesVisit(task, visit)));
        if (direct.length) return null;
        const arrivalSections = new Set(visit.arrivalSections || []);
        const originMatches = origin => origin.chunkId === visit.locationId &&
            (!arrivalSections.size || !origin.sectionId || arrivalSections.has(origin.sectionId));
        const blockedTasks = tasks.filter(task => task.slayerMasterConfirmation?.status === 'unknown' &&
            !task.slayerMasterConfirmation.otherRequirementsBlocked && !task.completed && !task.backlogged &&
            !task.superseded && !task.progressionBlocked &&
            (task.slayerMasterConfirmation.origins || []).some(originMatches));
        const masters = [...new Map(blockedTasks.flatMap(task => task.slayerMasterConfirmation.masters || [])
            .map(master => [master.master, master])).values()]
            .sort((left, right) => left.requiredCombat - right.requiredCombat || left.master.localeCompare(right.master));
        return masters.length ? { ...masters[0], blockedTaskIds: blockedTasks.map(task => task.taskId), masters } : null;
    }
    function snapshotVisit(state, tasks) {
        if (state.currentVisit?.status !== 'pending_calculation') return state;
        const reachableIds = new Set(state.currentVisit.reachableTaskIds || []);
        const direct = tasks.filter(task => task.eligible &&
            (reachableIds.size ? reachableIds.has(task.taskId) : taskMatchesVisit(task, state.currentVisit)));
        const trainingMasters = new Set(direct.filter(task => task.slayerProgression?.requiresTraining)
            .flatMap(task => task.slayerProgression.supportingMasters || []));
        const trainingAlternatives = trainingMasters.size ? tasks.filter(task => task.eligible && task.slayerTrainingAlternative &&
            (task.slayerTrainingMasters || []).some(master => trainingMasters.has(master))) : [];
        const selected = [...new Map([...direct, ...trainingAlternatives].map(task => [task.taskId, task])).values()];
        const visit = { ...state.currentVisit, candidateTaskIds: selected.map(task => task.taskId) };
        // Keep compact display/category metadata so an invalidated or subsequently
        // removed database entry is still intelligible and completable after reload.
        const snapshotIds = new Set(visit.candidateTaskIds);
        visit.candidateTasks = Object.fromEntries(tasks.filter(t => snapshotIds.has(t.taskId)).map(t => [t.taskId, snapshotTask(t)]));
        visit.status = visit.candidateTaskIds.length ? 'task_required' : 'resolved';
        if (!visit.candidateTaskIds.length) visit.resolution = 'no_tasks';
        return journal(state, visit);
    }
    function addCatchUpTasksToCurrentVisit(state, tasks) {
        const visit = state.currentVisit;
        if (visit?.status !== 'task_required' || !visit.candidateTaskIds?.length) return state;
        const byId = new Map(tasks.map(task => [task.taskId, task]));
        const existing = visit.candidateTaskIds.map(id => byId.get(id) || visit.candidateTasks?.[id]);
        if (existing.some(task => !task || task.taskClass !== 'collection')) return state;
        const known = new Set(visit.candidateTaskIds);
        const additions = tasks.filter(task => task.catchUpProgression && task.eligible && !known.has(task.taskId) &&
            taskMatchesVisit(task, visit));
        if (!additions.length) return state;
        const candidateTaskIds = [...visit.candidateTaskIds, ...additions.map(task => task.taskId)];
        const candidateTasks = { ...(visit.candidateTasks || {}),
            ...Object.fromEntries(additions.map(task => [task.taskId, snapshotTask(task)])) };
        return journal(state, { ...visit, candidateTaskIds, candidateTasks });
    }
    function recalculateCurrentVisit(state, reason = 'Recalculated after run import', timestamp = new Date().toISOString(), options = {}) {
        const reopenNoTasks = options.reopenNoTasks === true && state.currentVisit?.status === 'resolved' &&
            state.currentVisit.resolution === 'no_tasks';
        if (!state.currentVisit || (state.currentVisit.status === 'resolved' && !reopenNoTasks)) return state;
        const previous = state.currentVisit;
        const visit = { ...previous, reachableTaskIds: [], candidateTaskIds: [], candidateTasks: {}, status: 'pending_calculation',
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

    function supplyChance(raw) {
        const value = String(raw ?? '').split('@')[0].replaceAll('~', '').replaceAll(',', '').trim();
        if (/^always$/i.test(value)) return 1;
        const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(value);
        if (fraction) return Number(fraction[1]) / Number(fraction[2]);
        const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
        return percent ? Number(percent[1]) / 100 : null;
    }

    function clueSourceCatalog(data = {}, annotations = {}) {
        const config = annotations.clues?.sourcePolicy || {};
        const directMinimum = { beginner: 1 / 300, easy: 1 / 128, medium: 1 / 128,
            hard: 1 / 128, elite: 1 / 200, ...(config.directMinimumChanceByTier || {}) };
        const focusedMinimum = { beginner: 1 / 100, easy: 1 / 100, medium: 1 / 200,
            hard: 1 / 200, elite: 1 / 200, ...(config.focusedMinimumChanceByTier || {}) };
        const focusedCategories = new Set(config.focusedCategories || ['Boss', 'Minigame', 'Extra implings']);
        const incidentalCategories = new Set(config.incidentalCategories || ['Wandering implings']);
        const groups = data.codeItems?.dropTables || {}, monsterGroups = data.codeItems?.monstersPlus || {};
        const bestChance = quantities => Math.max(-1,
            ...Object.values(quantities || {}).map(supplyChance).filter(Number.isFinite));
        const clueChance = (items, clueName) => Math.max(-1, ...Object.entries(items || {}).flatMap(([raw, quantities]) => {
            const outer = bestChance(quantities);
            if (raw === clueName) return outer;
            if (!own(groups[raw], clueName)) return [];
            const inner = supplyChance(groups[raw][clueName]);
            if (!Number.isFinite(inner)) return [];
            return outer >= 0 ? outer * inner : inner;
        }));
        const bossEntryCosts = new Set();
        for (const tasks of Object.values(data.challenges || {})) for (const meta of Object.values(tasks || {})) {
            if (!(meta.Category || []).includes('Boss') || !(meta.Items || []).some(item => String(item).includes('*'))) continue;
            for (const raw of meta.Monsters || []) for (const monster of expand(raw, monsterGroups)) bossEntryCosts.add(monster);
        }
        const byTier = Object.fromEntries(CLUE_TIERS.map(tier => [tier, []]));
        const add = (tier, source) => {
            const list = byTier[tier], identity = source.kind + ':' + source.sourceName;
            const existing = list.find(candidate => candidate.identity === identity);
            if (!existing) list.push({ ...source, tier, identity });
            else if (Number.isFinite(source.chance) && (!Number.isFinite(existing.chance) || source.chance > existing.chance)) {
                existing.chance = source.chance;
            }
        };
        for (const tier of CLUE_TIERS.filter(tier => tier !== 'master')) {
            const clueName = 'Clue scroll (' + tier + ')', threshold = Number(directMinimum[tier]);
            for (const [monster, drops] of Object.entries(data.drops || {})) {
                const chance = clueChance(drops, clueName);
                if (chance < 0) continue;
                const entryCost = bossEntryCosts.has(monster);
                const allowed = !entryCost && Number.isFinite(threshold) && chance >= threshold;
                add(tier, { kind: 'monster', sourceName: monster, chance, allowed,
                    reason: entryCost ? 'Boss consumes an entry item, so its clue is incidental' :
                        allowed ? 'Repeatable direct drop within the normal ' + tier + ' clue rate' :
                            'Direct drop is too rare to support deliberate ' + tier + ' clue hunting' });
            }
            const activityThreshold = Number(focusedMinimum[tier]);
            for (const [skill, pools] of Object.entries(data.skillItems || {})) for (const [pool, items] of Object.entries(pools || {})) {
                const chance = clueChance(items, clueName);
                if (chance < 0) continue;
                for (const [name, meta] of Object.entries(data.challenges?.[skill] || {})) {
                    if (meta.Output !== pool) continue;
                    const categories = meta.Category || [];
                    const consumedBossEntry = categories.includes('Boss') &&
                        (meta.Items || []).some(item => String(item).includes('*'));
                    const incidental = consumedBossEntry || categories.some(category => incidentalCategories.has(category));
                    const directCombat = skill === 'Slayer';
                    const focused = directCombat || meta.Primary === true || categories.some(category => focusedCategories.has(category));
                    const minimumChance = directCombat ? threshold : activityThreshold;
                    const allowed = !incidental && focused && Number.isFinite(minimumChance) && chance >= minimumChance;
                    add(tier, { kind: 'activity', sourceName: name, sourceSkill: skill, chance, allowed,
                        reason: consumedBossEntry ? 'Boss chest consumes a separate entry item, so its clue is incidental' :
                            incidental ? 'Roaming or passive opportunity; record the clue only if it appears' :
                            !focused ? 'Clue is a by-product of another activity' :
                                allowed ? (directCombat ? 'Repeatable Slayer target' : 'Repeatable focused activity') +
                                    ' within the normal ' + tier + ' clue rate' :
                                    'Activity clue rate is too low to support deliberate ' + tier + ' clue hunting' });
                }
            }
        }
        const masterSource = annotations.clues?.masterPersistentSource || 'Watson';
        add('master', { kind: 'master', sourceName: masterSource, chance: 1, allowed: true,
            reason: 'Guaranteed exchange of one completed easy, medium, hard and elite clue' });
        for (const tier of CLUE_TIERS) byTier[tier].sort((left, right) =>
            Number(right.allowed) - Number(left.allowed) || (right.chance || 0) - (left.chance || 0) ||
            left.sourceName.localeCompare(right.sourceName));
        const sourceAllowed = (tier, sourceName, sourceType = '') => {
            if (!CLUE_TIERS.includes(tier)) return false;
            if (tier === 'master') return sourceName === masterSource;
            const kind = String(sourceType).includes('drop') ? 'monster' : 'activity';
            return byTier[tier].some(source => source.allowed && source.kind === kind && source.sourceName === sourceName);
        };
        return { tiers: byTier, sourceAllowed, masterSource,
            policy: { directMinimumChanceByTier: { ...directMinimum }, focusedMinimumChanceByTier: { ...focusedMinimum },
                focusedCategories: [...focusedCategories], incidentalCategories: [...incidentalCategories] } };
    }

    function recipeSupplyCatalog(data = {}, annotations = {}) {
        const enabled = !!annotations.recipeSupply, config = annotations.recipeSupply || {};
        const trackedSkills = new Set(enabled ? config.skills || ['Cooking', 'Crafting'] : []);
        const aliases = config.itemAliases || {}, groups = data.codeItems?.itemsPlus || {};
        const commonMonsterChance = Number(config.commonMonsterChance ?? 1 / 4);
        const focusedActivityChance = Number(config.focusedActivityChance ?? 1 / 20);
        const rareFallbackRatio = Number(config.rareFallbackRatio ?? 1 / 2);
        const canonical = value => {
            const key = canonicalItemKey(value).trim();
            return aliases[key] || key;
        };
        const candidates = new Map(), producerInputs = new Map(), recipes = [];
        const add = (itemName, source) => {
            const itemKey = canonical(itemName);
            if (!itemKey) return;
            const list = candidates.get(itemKey) || [];
            const identity = [source.kind, source.sourceName, source.sourceType].join(':');
            const existing = list.find(value => value.identity === identity);
            if (!existing) list.push({ ...source, identity });
            else if (Number.isFinite(source.chance) && (!Number.isFinite(existing.chance) || source.chance > existing.chance)) {
                existing.chance = source.chance;
            }
            candidates.set(itemKey, list);
        };
        const expanded = raw => expand(raw, groups).map(canonical);
        const taskInputs = (name, meta) => (meta.Items || []).map(raw => config.inputCorrections?.[name]?.[raw] || raw);
        const bestChance = quantities => Math.max(-1, ...Object.values(quantities || {}).map(supplyChance).filter(Number.isFinite));
        const challengePools = new Map();
        for (const [skill, tasks] of Object.entries(data.challenges || {})) for (const [name, meta] of Object.entries(tasks || {})) {
            const declaredOutputs = [...(meta.Output ? [meta.Output] : []), ...(config.additionalOutputs?.[name] || [])];
            if (declaredOutputs.length) {
                for (const output of declaredOutputs.flatMap(expanded)) add(output, { kind: 'action', sourceName: name,
                    sourceType: (meta.Secondary || meta.ForcedSecondary ? 'secondary-' : 'primary-') + skill,
                    chance: 1, preferred: !(meta.Secondary || meta.ForcedSecondary), reason: 'Produced directly by an action' });
                if (meta.Output) {
                    const poolKey = skill + ':' + canonicalItemKey(meta.Output);
                    const list = challengePools.get(poolKey) || [];
                    list.push({ skill, name, meta }); challengePools.set(poolKey, list);
                }
                producerInputs.set(name, taskInputs(name, meta).map(raw => expanded(raw)));
            }
            for (const reward of Array.isArray(meta.Reward) ? meta.Reward : []) {
                if (typeof reward === 'string') for (const output of expanded(reward)) add(output, { kind: 'reward', sourceName: name,
                    sourceType: 'primary-' + skill, chance: 1, preferred: true, reason: 'Guaranteed task or quest reward' });
            }
            if (trackedSkills.has(skill)) recipes.push({ skill, name,
                inputs: taskInputs(name, meta).map(raw => ({ raw, consumable: raw.includes('*'), alternatives: expanded(raw) })) });
            if (['bis', 'collection'].includes(taskMetadata(name, skill, meta).taskClass) &&
                meta.Items?.length === 1 && !meta.Items[0].includes('*')) {
                for (const itemName of expanded(meta.Items[0])) add(itemName, { kind: 'registered', sourceName: name,
                    sourceSkill: skill, sourceType: 'registered', chance: 1, preferred: true,
                    reason: 'Registered equipment or collection reward' });
            }
        }
        for (const [shop, stock] of Object.entries(data.shopItems || {})) for (const itemName of Object.keys(stock || {})) {
            add(itemName, { kind: 'shop', sourceName: shop, sourceType: 'shop', chance: 1, preferred: true,
                reason: 'Normal shop stock' });
        }
        for (const [tier, itemNames] of Object.entries(annotations.clues?.equipmentRewardsByTier || {})) {
            for (const itemName of itemNames) add(itemName, { kind: 'clue', sourceName: 'Clue scroll (' + tier + ')',
                sourceType: 'clue-reward', chance: null, preferred: true, reason: 'Clue reward from its normal tier' });
        }
        for (const [chunkId, chunk] of Object.entries(data.chunks || {})) {
            for (const [sectionId, contents] of [['', chunk], ...Object.entries(chunk.Sections || {})]) {
                for (const [itemName, count] of Object.entries(contents.Spawn || {})) add(itemName, { kind: 'spawn',
                    sourceName: chunkId + (sectionId ? '-' + sectionId : ''), sourceType: 'spawn', chance: 1,
                    count: Number(count || 0), preferred: true, reason: 'Ground item spawn' });
            }
        }
        const addDrop = (itemName, monster, chance) => add(itemName, { kind: 'monster', sourceName: monster,
            sourceType: chance >= commonMonsterChance ? 'primary-drop' : 'secondary-drop', chance,
            preferred: Number.isFinite(chance) && chance >= commonMonsterChance,
            reason: Number.isFinite(chance) && chance >= commonMonsterChance ? 'Common monster drop' : 'Rare monster drop' });
        for (const [monster, drops] of Object.entries(data.drops || {})) for (const [dropName, quantities] of Object.entries(drops || {})) {
            const outerChance = bestChance(quantities), table = data.codeItems?.dropTables?.[dropName];
            if (table) {
                for (const [itemName, tableRate] of Object.entries(table)) {
                    const innerChance = supplyChance(tableRate);
                    addDrop(itemName, monster, Number.isFinite(outerChance) && Number.isFinite(innerChance) ? outerChance * innerChance : null);
                }
            } else addDrop(dropName, monster, outerChance < 0 ? null : outerChance);
        }
        for (const [skill, pools] of Object.entries(data.skillItems || {})) for (const [pool, items] of Object.entries(pools || {})) {
            const producers = challengePools.get(skill + ':' + canonicalItemKey(pool)) || [];
            for (const [rawItemName, quantities] of Object.entries(items || {})) for (const producer of producers) {
                const outerValue = bestChance(quantities), outerChance = outerValue < 0 ? null : outerValue;
                const table = data.codeItems?.dropTables?.[rawItemName];
                const outputs = table ? Object.entries(table).map(([itemName, rate]) => {
                    const innerChance = supplyChance(rate);
                    return [itemName, Number.isFinite(outerChance) && Number.isFinite(innerChance) ? outerChance * innerChance : null];
                }) : [[rawItemName, outerChance]];
                for (const [itemName, chance] of outputs) {
                    const preferred = !(producer.meta.Secondary || producer.meta.ForcedSecondary) &&
                        Number.isFinite(chance) && chance >= focusedActivityChance;
                    add(itemName, { kind: 'activity', sourceName: producer.name,
                        sourceType: preferred ? 'primary-' + skill : 'secondary-' + skill, chance, preferred,
                        reason: preferred ? 'Repeatable focused activity' : 'Incidental activity reward' });
                }
            }
        }
        const ingredients = {};
        const directItems = new Set(recipes.flatMap(recipe => recipe.inputs.flatMap(input => input.alternatives)));
        const usedItems = new Set(directItems), pending = [...usedItems];
        while (pending.length) {
            const itemKey = pending.pop();
            for (const source of candidates.get(itemKey) || []) for (const input of producerInputs.get(source.sourceName) || []) {
                for (const dependency of input) if (!usedItems.has(dependency)) {
                    usedItems.add(dependency); pending.push(dependency);
                }
            }
        }
        for (const itemKey of [...usedItems].sort((a, b) => a.localeCompare(b))) {
            const sources = candidates.get(itemKey) || [];
            const registered = sources.filter(source => source.kind === 'registered');
            const ordinary = sources.filter(source => source.kind !== 'registered');
            const preferred = ordinary.filter(source => source.preferred);
            let approved = preferred;
            if (!approved.length && ordinary.length) {
                const numeric = ordinary.filter(source => Number.isFinite(source.chance));
                if (numeric.length) {
                    const best = Math.max(...numeric.map(source => source.chance));
                    approved = numeric.filter(source => source.chance >= best * rareFallbackRatio)
                        .map(source => ({ ...source, reason: 'Best available rare source' }));
                } else approved = ordinary.map(source => ({ ...source, reason: 'Only defined source' }));
            }
            approved = [...approved, ...registered];
            const approvedKeys = new Set(approved.map(source => source.identity));
            ingredients[itemKey] = { itemKey, sources: sources.map(source => ({ ...source,
                approved: approvedKeys.has(source.identity) })), approvedSources: [...approvedKeys] };
        }
        const sourceAllowed = (itemName, sourceName, sourceType) => {
            if (!enabled) return true;
            const item = ingredients[canonical(itemName)];
            if (!item) return false;
            return item.sources.some(source => source.approved && source.sourceName === sourceName &&
                (source.sourceType === sourceType || source.kind === 'spawn' && String(sourceType).includes('spawn') ||
                    source.kind === 'monster' && String(sourceType).includes('drop') ||
                    source.kind === 'clue' && sourceType === 'clue-reward' ||
                    ['action', 'activity', 'reward'].includes(source.kind) && sourceType !== 'shop' &&
                        !String(sourceType).includes('drop') && !String(sourceType).includes('spawn')));
        };
        const globalSupplyCache = new Map();
        const globallySupplied = (itemName, visiting = new Set()) => {
            const itemKey = canonical(itemName);
            if (globalSupplyCache.has(itemKey)) return globalSupplyCache.get(itemKey);
            if (visiting.has(itemKey)) return false;
            const next = new Set(visiting).add(itemKey), item = ingredients[itemKey];
            const result = !!item && item.sources.some(source => {
                if (!source.approved) return false;
                const inputs = producerInputs.get(source.sourceName);
                return !inputs || inputs.every(alternatives => alternatives.some(input => globallySupplied(input, next)));
            });
            if (result || visiting.size === 0) globalSupplyCache.set(itemKey, result);
            return result;
        };
        for (const item of Object.values(ingredients)) item.globallySupplied = globallySupplied(item.itemKey);
        return { enabled, skills: [...trackedSkills], aliases: { ...aliases }, ingredients, recipes,
            directItems: [...directItems], producerInputs, canonical, sourceAllowed, globallySupplied };
    }

    function applyRecipeSupplyAliases(data = {}, annotations = {}) {
        const aliases = annotations.recipeSupply?.itemAliases || {};
        for (const members of Object.values(data.codeItems?.itemsPlus || {})) {
            if (Array.isArray(members)) for (let index = 0; index < members.length; index++) {
                members[index] = aliases[members[index]] || members[index];
            }
        }
        for (const skill of annotations.recipeSupply?.skills || ['Cooking', 'Crafting']) {
            for (const [name, meta] of Object.entries(data.challenges?.[skill] || {})) {
                if (!Array.isArray(meta.Items)) continue;
                meta.Items = meta.Items.map(raw => annotations.recipeSupply?.inputCorrections?.[name]?.[raw] || raw).map(raw => {
                    const suffix = raw.endsWith('*') ? '*' : '';
                    const name = suffix ? raw.slice(0, -1) : raw;
                    return (aliases[name] || name) + suffix;
                });
            }
        }
        return data;
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
        for (const custom of config.customCapabilities || []) {
            const requirementKey = custom.requirementKey || custom.capabilityId;
            if (!requirementKey || byRequirement.has(requirementKey)) continue;
            const satisfyingItems = (custom.satisfyingItems || []).map(item => typeof item === 'string' ?
                { itemKey: canonicalItemKey(item), minimumUseLevel: null, skillingBis: bisItems.get(canonicalItemKey(item)) || null } :
                { ...item, itemKey: canonicalItemKey(item.itemKey), minimumUseLevel: item.minimumUseLevel ?? null,
                    skillingBis: item.skillingBis || bisItems.get(canonicalItemKey(item.itemKey)) || null });
            if (!satisfyingItems.length) continue;
            add({ capabilityId: custom.capabilityId || 'custom:' + requirementKey, requirementKey,
                label: custom.label || stripMarkup(requirementKey), familyType: custom.familyType || 'custom_reusable_family',
                skill: custom.skill || null, enforceUseLevel: !!custom.enforceUseLevel,
                classificationReason: custom.classificationReason || 'Explicit persistent capability annotation', satisfyingItems });
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

    function taskEnablerRequirements(data, skill, meta, model, taskClass = null, includeNonskill = false) {
        if (taskClass === 'bis' || taskClass === 'collection' || (skill === 'Nonskill' && !includeNonskill)) return [];
        const result = [];
        for (const raw of meta.Items || []) {
            if (raw.includes('*')) continue;
            const key = canonicalItemKey(raw).split('[+]x')[0] + (raw.includes('[+]x') ? '[+]' : '');
            const grouped = model.byRequirement.get(key);
            if (grouped) result.push({ capabilityId: grouped.capabilityId, capabilityLabel: grouped.label,
                capabilitySkill: grouped.skill, familyType: grouped.familyType, satisfyingItems: grouped.satisfyingItems,
                requirementKey: key, requiresSpecificItem: false, itemKey: null, enforceUseLevel: !!grouped.enforceUseLevel });
            else {
                const itemKey = canonicalItemKey(raw), family = chooseItemCapability(model, itemKey, skill);
                if (family) result.push({ capabilityId: family.capabilityId, capabilityLabel: family.label,
                    capabilitySkill: family.skill, familyType: family.familyType, satisfyingItems: family.satisfyingItems,
                    requirementKey: itemKey, requiresSpecificItem: family.satisfyingItems.length > 1, itemKey,
                    enforceUseLevel: !!family.enforceUseLevel });
            }
        }
        return result.filter((requirement, index) => result.findIndex(other => other.capabilityId === requirement.capabilityId &&
            other.itemKey === requirement.itemKey) === index);
    }

    function itemUsableForRequirement(item, requirement, state, data, taskSkill = null) {
        if (item.minimumUseLevel != null && requirement.capabilitySkill &&
            (requirement.enforceUseLevel || !taskSkill || taskSkill === requirement.capabilitySkill) &&
            (state.actualLevels?.[requirement.capabilitySkill] || 1) < item.minimumUseLevel) return false;
        for (const [skill, level] of Object.entries(item.requiredLevels || {})) {
            if ((state.actualLevels?.[skill] || 1) < level) return false;
        }
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
        const result = [];
        const output = canonicalItemKey(meta.Output || '');
        if (output && model.byItem.has(output)) result.push(output);
        if (['bis', 'collection'].includes(taskClass) && meta.Items?.length === 1 && !meta.Items[0].includes('*')) {
            const choices = expand(meta.Items[0], data.codeItems?.itemsPlus);
            if (choices.length === 1 && model.byItem.has(canonicalItemKey(choices[0]))) result.push(canonicalItemKey(choices[0]));
        }
        return [...new Set(result)];
    }

    function recoverAcquiredEnablers(state, legacy = {}, data = {}, ids = {}, annotations = {}) {
        if (state.enablersInitialized) return state;
        const next = { ...state, acquiredEnablers: { ...state.acquiredEnablers }, enablersInitialized: true,
            enablerRevision: ENABLER_REVISION };
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
        const actualPoints = Math.max(Number(state.startingQuestPointFloor) || 0,
            Object.entries(data.challenges.Quest || {}).reduce((sum, [name, task]) => sum +
                (completed(name, 'Quest') ? Number(task.QuestPoints || 0) : 0), 0));
        const combat = () => Math.floor((state.actualLevels.Defence + state.actualLevels.Hitpoints + Math.floor(state.actualLevels.Prayer / 2)) / 4 +
            .325 * Math.max(state.actualLevels.Attack + state.actualLevels.Strength, Math.floor(state.actualLevels.Ranged * 1.5), Math.floor(state.actualLevels.Magic * 1.5)));
        const combatRequirement = () => combatProgressionRequirementLevel(state, combat());
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
                const current = s === 'Combat' ? combatRequirement() : state.actualLevels[s];
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
            if (meta.CombatLevelNeeded > combatRequirement()) return finish(false, 'Requires combat level: ' + meta.CombatLevelNeeded);
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

    function sectionAccessAllowed(data = {}, annotations = {}, state = {}, legacy = {}, ids = {}, rules = {}, locationId, access = null) {
        const parsed = parseLocation(locationId);
        if (!parsed?.sectionId) return true;
        const exact = parsed.chunkId + '-' + parsed.sectionId, overrideKey = 'section:' + exact;
        if (own(state.accessOverrides || {}, overrideKey)) return state.accessOverrides[overrideKey] === true;
        const gates = annotatedSectionGates(annotations, parsed.chunkId, parsed.sectionId);
        if (!gates.length) return true;
        const evaluator = access || createAccess(data, state, legacy, ids, rules, () => true);
        return gates.every(gate => evaluator.all(Array.isArray(gate.requirements) ? gate.requirements :
            gate.requirements ? [gate.requirements] : []));
    }

    // baseChunkData is the legacy source graph. Retain it; build a memoized sidecar.
    function buildTasks({ data, valids, base, ids = {}, rules = {}, state, legacy = {}, unlocked = {}, sections = {}, manualSections = {},
        annotations = {}, dropRates = {} }) {
        const codes = data.codeItems || {}, tasks = new Map(), sourceCache = new Map(), originCache = new Map();
        const activityRewardSourcesByItem = new Map();
        for (const [shopName, config] of Object.entries(annotations.activityRewardShops || {})) {
            const itemNames = [...Object.keys(data.shopItems?.[shopName] || {}), ...(config.rewardItems || [])];
            for (const itemName of itemNames) {
                const key = comparableItemKey(itemName);
                activityRewardSourcesByItem.set(key, [...(activityRewardSourcesByItem.get(key) || []), shopName]);
            }
        }
        // The upstream calculator can omit a currency-shop reward when its
        // physical shop is represented outside the ordinary shop graph. Keep
        // those reviewed reward rows in the local catalog; acquisition checks
        // below still require a usable earning activity before they become live.
        if (activityRewardSourcesByItem.size) {
            valids = Object.fromEntries(Object.entries(valids || {}).map(([skill, entries]) => [skill, { ...entries }]));
            for (const [skill, entries] of Object.entries(data.challenges || {})) for (const [name, meta] of Object.entries(entries || {})) {
                const metadata = taskMetadata(name, skill, meta, ids);
                if (!['bis', 'collection'].includes(metadata.taskClass) || meta.Items?.length !== 1 || meta.Items[0].includes('*') ||
                    !activityRewardSourcesByItem.has(comparableItemKey(meta.Items[0]))) continue;
                if (!valids[skill]) valids[skill] = {};
                if (!own(valids[skill], name)) valids[skill][name] = meta.Label || metadata.category || true;
            }
        }
        const bossMonsters = new Set(Object.keys(codes.bossMonsters || {}));
        const annotatedEncounters = annotations.encounterReadiness?.sources || {};
        const encounterDetails = Object.fromEntries([
            ...[...bossMonsters].map(name => [name, { sourceTypes: ['monsters'], kind: 'boss',
                deferLabel: "I can't defeat this boss with my current gear",
                restoreLabel: 'I am ready to fight this boss', waitingText: 'Its goals are hidden.' }]),
            ...Object.entries(annotatedEncounters).map(([name, detail]) => [name, { ...detail,
                sourceTypes: [...(detail.sourceTypes || ['monsters'])] }])
        ]);
        const diagnostics = [], accessDiagnostics = [], enablerModel = buildEnablerModel(data, annotations);
        const taskCatalog = buildTaskCatalog(data, ids), dependencyDiagnostics = new Map();
        const clueRewards = clueRewardCatalog(data, legacy, state, ids);
        const clueRewardByTaskId = new Map(clueRewards.rewards.map(reward => [reward.taskId, reward]));
        const clueRewardByItem = new Map(clueRewards.rewards.map(reward => [reward.key, reward]));
        const clueSourceCache = new Map(), completableClueStepCache = new Map();
        const clueConfig = annotations.clues || {};
        const clueEquipmentTiersByItem = new Map();
        for (const [tier, itemNames] of Object.entries(clueConfig.equipmentRewardsByTier || {})) {
            for (const itemName of itemNames) {
                const key = comparableItemKey(itemName);
                if (clueRewardByItem.has(key)) continue;
                clueEquipmentTiersByItem.set(key, [...(clueEquipmentTiersByItem.get(key) || []), tier]);
            }
        }
        const clueItemTiersByItem = new Map(clueRewards.rewards.map(reward =>
            [reward.key, [...reward.sourceTiers]]));
        for (const [itemKey, tiers] of clueEquipmentTiersByItem) {
            clueItemTiersByItem.set(itemKey, [...new Set([...(clueItemTiersByItem.get(itemKey) || []), ...tiers])]);
        }
        const completedClueItems = new Set(clueRewards.rewards.filter(reward => reward.completed).map(reward => reward.key));
        const obtainedItems = completedEquipmentItems(legacy, state, ids);
        const masterClueInputs = clueConfig.masterInputs || ['easy', 'medium', 'hard', 'elite'];
        const masterClueSource = clueConfig.masterPersistentSource || 'Watson';
        let trainingAnalysisReady = false, trainingSupportedSkills = new Set(), trainingEvidenceSkills = new Set(),
            trainingMethodsBySkill = new Map(), repeatableItems = new Set();
        const pendingCapabilities = new Map();
        const slayerProgression = slayerProgressionModel({ data, state, legacy, base, ids, unlocked, sections, manualSections });
        const shipCombat = annotations.shipCombat || {};
        const shipCombatMonsters = new Set(expand(shipCombat.monsterGroup || '', codes.monstersPlus));
        if (shipCombat.deriveMonstersFromWaterSections) for (const chunk of Object.values(data.chunks || {})) {
            if (chunk.Nickname === 'Ocean Chunk') for (const monster of Object.keys(chunk.Monster || {})) shipCombatMonsters.add(monster);
            for (const [sectionId, section] of Object.entries(chunk.Sections || {})) if (sectionId.startsWith('W')) {
                for (const monster of Object.keys(section.Monster || {})) shipCombatMonsters.add(monster);
            }
        }
        const shipCannonCapability = enablerModel.byRequirement.get(shipCombat.capabilityRequirement || '');
        const combatConfig = annotations.combatProgression || {};
        const combatCutoff = Number(combatConfig.cutoff) || 60;
        const combatWindow = Number(combatConfig.window) || 10;
        const combatState = state.combatProgression || { frontier: 1, mature: false, evidence: [] };
        const combatFrontier = combatState.mature ? combatCutoff : Math.max(1,
            Math.min(combatCutoff, Number(combatState.frontier) || 1));
        let combatFoodReady = false;
        let combatTrainingSupply = { Ranged: false, Magic: false, Prayer: false };
        const combatSkills = new Set(['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Prayer', 'Magic']);
        const monsterCombatLevel = name => {
            const direct = Number(combatConfig.monsterCombatLevels?.[name]);
            if (Number.isFinite(direct) && direct > 0) return direct;
            const plain = String(name || '').replace(/\[\+\]$/, '');
            const fallback = Number(combatConfig.monsterCombatLevels?.[plain]);
            return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
        };
        const monsterUsesSeparateProgression = name => bossMonsters.has(name) || own(annotatedEncounters, name) ||
            Number(data.slayerMonsters?.[name] || 1) > 1 || shipCombatMonsters.has(name);
        const ordinaryMonsterAllowed = name => {
            if (combatState.mature || monsterUsesSeparateProgression(name)) return true;
            const level = monsterCombatLevel(name);
            // Missing data never creates a false lock. The generated snapshot
            // covers every ordinary drop source currently known to the map.
            if (level == null) return true;
            return level <= combatFrontier + (combatFoodReady ? combatWindow : 0);
        };
        const requirementFromCapability = capability => capability && ({ capabilityId: capability.capabilityId,
            capabilityLabel: capability.label, capabilitySkill: capability.skill, familyType: capability.familyType,
            satisfyingItems: capability.satisfyingItems, requirementKey: capability.requirementKey,
            requiresSpecificItem: false, itemKey: null, enforceUseLevel: !!capability.enforceUseLevel });
        const knownNames = new Map();
        // Prefer native quest/diary/extra entries over worker-generated skill projections.
        const categories = Object.keys(valids).sort((a, b) => ['Quest', 'Diary', 'Extra', 'BiS'].indexOf(b) - ['Quest', 'Diary', 'Extra', 'BiS'].indexOf(a));
        for (const category of ['Quest', 'Diary', 'Extra', 'BiS', ...SKILLS, 'Nonskill']) {
            for (const name of Object.keys(data.challenges[category] || {})) if (!knownNames.has(name)) knownNames.set(name, category);
        }
        const recipeSupply = recipeSupplyCatalog(data, annotations);
        const clueSources = clueSourceCatalog(data, annotations);
        const recipeSupplySkills = new Set(recipeSupply.skills);
        const combatSkillActivated = skill => ['Attack', 'Strength', 'Defence', 'Hitpoints'].includes(skill) ||
            combatTrainingSupply[skill] === true;
        const knownSkillLevel = skill => skill === 'Combat' ? Math.max(actualCombatLevel(state.actualLevels), combatFrontier) :
            Math.max(1, Number(state.actualLevels?.[skill] || 1), Number(state.progressionHighWater?.[skill] || 0),
                combatSkills.has(skill) && combatSkillActivated(skill) ? combatFrontier : 0);
        const skillCeiling = skill => {
            if (skill === 'Combat') return combatProgressionRequirementLevel(state,
                actualCombatLevel(state.actualLevels), combatCutoff, combatWindow);
            if (combatSkills.has(skill) && combatSkillActivated(skill)) {
                if (combatState.mature) return 99;
                return Math.min(99, Math.max(knownSkillLevel(skill), combatFrontier + combatWindow));
            }
            return progressionCeiling(taskCatalog, skill,
                Number(state.progressionHighWater?.[skill] || 0), Number(state.actualLevels?.[skill] || 1));
        };
        const rememberDependencyBlock = (itemName, block) => {
            const key = canonicalItemKey(itemName).replaceAll('*', '');
            const current = dependencyDiagnostics.get(key) || [];
            if (!current.some(entry => entry.reason === block.reason)) dependencyDiagnostics.set(key, [...current, block]);
        };
        function taskLevelReadiness(name, skill, meta = data.challenges?.[skill]?.[name] || {}) {
            const record = taskMetadata(name, skill, meta, ids);
            const combatLevelTask = (combatSkills.has(skill) || skill === 'Combat') && Number.isFinite(Number(record.level));
            if (isComplete(record, legacy, state) || (!record.usesSkillLevelWindow && !combatLevelTask)) return { allowed: true };
            const ceiling = skillCeiling(skill), known = knownSkillLevel(skill);
            if (record.level <= known) return { allowed: true };
            if (record.level > ceiling) return { allowed: false, skill, level: record.level, ceiling,
                reason: skill + ' level ' + record.level + ' is above the current progression window (through ' + ceiling + ')' };
            if (trainingAnalysisReady && trainingEvidenceSkills.has(skill) && !trainingSupportedSkills.has(skill) &&
                skill !== 'Combat' && !(combatSkills.has(skill) && combatSkillActivated(skill))) {
                return { allowed: false, skill, level: record.level, known,
                    reason: 'No repeatable ' + skill + ' training method is available from level ' + known };
            }
            return { allowed: true };
        }
        function declaredSkillReadiness(meta = {}) {
            for (const [skill, rawLevel] of Object.entries(meta.Skills || {})) {
                if (!SKILLS.includes(skill) && skill !== 'Combat') continue;
                const level = Number(rawLevel || 1), known = knownSkillLevel(skill), ceiling = skillCeiling(skill);
                if (level <= known) continue;
                if (level > ceiling) return { allowed: false, skill, level, ceiling,
                    reason: skill + ' level ' + level + ' is above the current progression window (through ' + ceiling + ')' };
                if (trainingAnalysisReady && level > known && !trainingSupportedSkills.has(skill) &&
                    skill !== 'Combat' && !(combatSkills.has(skill) && combatSkillActivated(skill))) return {
                    allowed: false, skill, level, known,
                    reason: 'No repeatable ' + skill + ' training method is available from level ' + known
                };
            }
            return { allowed: true };
        }
        const origin = (location, type, name, reason) => {
            const parsed = parseLocation(location);
            return parsed && locationAvailable(parsed, unlocked, sections, manualSections) ? [{ ...parsed, sourceType: type, sourceName: name, reason }] : [];
        };
        function fixed(type, name) {
            if (type === 'monsters' && !ordinaryMonsterAllowed(name)) return [];
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
        const itemSourceEntries = name => {
            const direct = Object.entries(base.items?.[canonicalItemKey(name)] ||
                base.items?.[canonicalItemKey(name) + '*'] || {});
            const virtual = (activityRewardSourcesByItem.get(comparableItemKey(name)) || [])
                .map(source => [source, 'shop']);
            return [...new Map([...direct, ...virtual].map(entry => [entry.join('\u0000'), entry])).values()]
                .filter(([source]) => itemSourceAllowed(annotations, name, source));
        };
        function item(name, visiting) {
            name = name.replaceAll('*', '');
            const key = 'item:' + name;
            if (visiting.has(key)) return [];
            if (sourceCache.has(key)) return sourceCache.get(key);
            const next = new Set(visiting).add(key);
            const clueReward = clueRewardByItem.get(comparableItemKey(name));
            let clueOrigins = [];
            if (clueReward && !clueReward.completed && clueTierCanGenerate(clueReward.ownerTier)) {
                clueOrigins = clueTierSourceOrigins(clueReward.ownerTier, next);
            }
            const origins = [...clueOrigins, ...itemSourceEntries(name).flatMap(([source, type]) => {
                if (String(type).includes('spawn')) return origin(source, 'spawn', name, 'Direct item spawn');
                if (type === 'shop' && base.shops?.[source]) return fixed('shops', source);
                if (String(type).includes('drop')) return acquisitionOrigins(name, source, fixed('monsters', source));
                if (type === 'clue-reward') {
                    const match = /^Clue scroll \((beginner|easy|medium|hard|elite|master)\)$/.exec(source);
                    return match && clueTierCanGenerate(match[1]) ? clueTierSourceOrigins(match[1], next) : [];
                }
                const direct = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
                if (direct.length) return direct;
                const category = knownNames.get(source), sourceMeta = data.challenges?.[category]?.[source];
                if (!category || !sourceMeta) return [];
                const levelReadiness = taskLevelReadiness(source, category, sourceMeta);
                const declaredReadiness = declaredSkillReadiness(sourceMeta);
                if (!levelReadiness.allowed || !declaredReadiness.allowed) {
                    rememberDependencyBlock(name, !levelReadiness.allowed ? levelReadiness : declaredReadiness);
                    return [];
                }
                const inputs = taskInputReadiness(source, category, sourceMeta, next);
                if (!inputs.allowed) {
                    for (const block of inputs.blocks) rememberDependencyBlock(name, block);
                    return [];
                }
                return taskOrigins(source, category, next);
            })];
            const result = uniqueOrigins(origins);
            // Do not memoize an unresolved cycle as a permanent negative result.
            if (result.length) sourceCache.set(key, result);
            return result;
        }
        function clueTierSourceOrigins(tier, visiting = new Set()) {
            if (clueSourceCache.has(tier)) return clueSourceCache.get(tier);
            const result = tier === 'master' ?
                (masterClueInputs.every(input => clueRewards.tiers[input]?.complete) ? fixed('npcs', masterClueSource) : []) :
                itemSourceEntries('Clue scroll (' + tier + ')')
                    .filter(([source, type]) => clueSources.sourceAllowed(tier, source, type))
                    .flatMap(([source, type]) => {
                        const clueName = 'Clue scroll (' + tier + ')';
                        const next = new Set(visiting).add('clue-source:' + tier);
                        if (String(type).includes('drop')) return acquisitionOrigins(clueName, source, fixed('monsters', source));
                        const direct = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
                        if (direct.length) return direct;
                        const category = knownNames.get(source), sourceMeta = data.challenges?.[category]?.[source];
                        if (!category || !sourceMeta) return [];
                        const levelReadiness = taskLevelReadiness(source, category, sourceMeta);
                        const declaredReadiness = declaredSkillReadiness(sourceMeta);
                        if (!levelReadiness.allowed || !declaredReadiness.allowed) return [];
                        const inputs = taskInputReadiness(source, category, sourceMeta, next);
                        return inputs.allowed ? taskOrigins(source, category, next) : [];
                    });
            const unique = uniqueOrigins(result.map(source => ({ ...source, clueTier: tier,
                reason: tier[0].toUpperCase() + tier.slice(1) + ' clue source · ' + source.reason })));
            if (unique.length) clueSourceCache.set(tier, unique);
            return unique;
        }
        let clueActivation = null, calculatingClueActivation = false;
        const clueItemOrdinarilyAvailable = name => Object.entries(base.items?.[canonicalItemKey(name)] ||
            base.items?.[canonicalItemKey(name) + '*'] || {}).some(([, type]) => type !== 'clue-reward');
        function clueStepSupportedByTiers(definition, availableTiers) {
            if (!own(valids.Nonskill || {}, definition.name) || valids.Nonskill[definition.name] === false) return false;
            const meta = data.challenges?.Nonskill?.[definition.name] || {};
            for (const raw of meta.Items || []) {
                const alternatives = expand(raw, codes.itemsPlus);
                const available = alternatives.some(name => {
                    const key = comparableItemKey(name);
                    if (clueItemOrdinarilyAvailable(name) || obtainedItems.has(key) || completedClueItems.has(key)) return true;
                    return (clueItemTiersByItem.get(key) || []).some(sourceTier => availableTiers.has(sourceTier));
                });
                if (!available) return false;
            }
            return true;
        }
        function calculateClueActivation() {
            if (clueActivation) return clueActivation;
            if (calculatingClueActivation) return { active: new Set(), steps: new Map() };
            calculatingClueActivation = true;
            const active = new Set(CLUE_TIERS.filter(tier => clueRewards.tiers[tier]?.complete));
            const steps = new Map(), catalogs = new Map(CLUE_TIERS.map(tier => [tier, clueStepCatalog(data, tier, ids)]));
            let changed = true;
            while (changed) {
                changed = false;
                for (const tier of CLUE_TIERS) {
                    if (active.has(tier) || clueRewards.tiers[tier]?.complete || !clueTierSourceOrigins(tier).length ||
                        (tier === 'master' && !masterClueInputs.every(input => clueRewards.tiers[input]?.complete))) continue;
                    const supported = catalogs.get(tier).filter(step => clueStepSupportedByTiers(step, active));
                    if (!supported.length) continue;
                    active.add(tier); steps.set(tier, supported); changed = true;
                }
            }
            for (const tier of CLUE_TIERS) if (!steps.has(tier)) steps.set(tier, []);
            calculatingClueActivation = false;
            clueActivation = { active, steps };
            return clueActivation;
        }
        function clueTierCanGenerate(tier) {
            if (!CLUE_TIERS.includes(tier) || state.clueLocks?.[tier] || Number(state.clueTaskCooldown) > 0 ||
                clueRewards.tiers[tier]?.complete) return false;
            return calculateClueActivation().active.has(tier);
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
            for (const mixed of meta.Mix || []) for (const source of expand(mixed, codes.mixPlus)) {
                result.push(...fixed('npcs', source), ...fixed('monsters', source));
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
        const resourceRequirementCache = new Map();
        const requirementIdentity = requirement => requirement.capabilityId + ':' +
            (requirement.requiresSpecificItem ? requirement.itemKey : '*');
        const uniqueRequirements = requirements => [...new Map(requirements.map(requirement =>
            [requirementIdentity(requirement), requirement])).values()];
        function mandatoryResourceRequirements(raw, visiting = new Set()) {
            const paths = expand(raw, codes.itemsPlus).flatMap(itemName => resourceRequirementPaths(itemName, visiting));
            if (!paths.length) return [];
            const common = new Set(paths[0].map(requirementIdentity));
            for (const path of paths.slice(1)) {
                const keys = new Set(path.map(requirementIdentity));
                for (const key of common) if (!keys.has(key)) common.delete(key);
            }
            return paths[0].filter(requirement => common.has(requirementIdentity(requirement)));
        }
        function resourceRequirementPaths(itemName, visiting = new Set()) {
            const name = canonicalItemKey(itemName).replaceAll('*', '');
            const key = 'resource-requirements:' + name;
            if (visiting.has(key)) return [];
            if (resourceRequirementCache.has(key)) return resourceRequirementCache.get(key);
            const next = new Set(visiting).add(key), paths = [];
            for (const [source, type] of itemSourceEntries(name)) {
                let directOrigins = [];
                if (String(type).includes('spawn')) directOrigins = origin(source, 'spawn', name, 'Direct item spawn');
                else if (type === 'shop' && base.shops?.[source]) directOrigins = fixed('shops', source);
                else if (String(type).includes('drop')) directOrigins = acquisitionOrigins(name, source, fixed('monsters', source));
                else directOrigins = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
                if (directOrigins.length) {
                    const shipRequirement = shipCombatMonsters.has(source) && shipCannonCapability ?
                        [requirementFromCapability(shipCannonCapability)] : [];
                    paths.push(shipRequirement);
                    continue;
                }
                const producerSkill = knownNames.get(source), producerMeta = data.challenges[producerSkill]?.[source];
                if (!producerMeta || !taskOrigins(source, producerSkill, next).length) continue;
                const producerClass = taskMetadata(source, producerSkill, producerMeta, ids).taskClass;
                // Resource acquisition often passes through Nonskill transforms
                // such as filling/emptying a container or eating a pie. Those
                // transforms must retain their reusable-item requirements or a
                // container can incorrectly prove its own availability.
                const requirements = taskEnablerRequirements(data, producerSkill, producerMeta, enablerModel, producerClass, true);
                for (const resource of (producerMeta.Items || []).filter(rawItem => rawItem.includes('*'))) {
                    requirements.push(...mandatoryResourceRequirements(resource, next));
                }
                paths.push(uniqueRequirements(requirements));
            }
            if (paths.length) resourceRequirementCache.set(key, paths);
            return paths;
        }
        function taskResourceRequirements(meta) {
            return uniqueRequirements((meta.Items || []).filter(raw => raw.includes('*')).flatMap(raw =>
                mandatoryResourceRequirements(raw).map(requirement => ({ ...requirement,
                    requiredViaResource: canonicalItemKey(raw).replaceAll('*', '') }))));
        }
        function taskResourceMilestoneDependencies(taskName, meta) {
            return (meta.Items || []).filter(raw => raw.includes('*')).flatMap(raw => {
                let hasDirectSource = false;
                const producers = new Map();
                for (const itemName of expand(raw, codes.itemsPlus).map(canonicalItemKey)) {
                    const resource = itemName.replaceAll('*', '');
                    for (const [source, type] of itemSourceEntries(resource)) {
                        let directOrigins = [];
                        if (String(type).includes('spawn')) directOrigins = origin(source, 'spawn', resource, 'Direct item spawn');
                        else if (type === 'shop' && base.shops?.[source]) directOrigins = fixed('shops', source);
                        else if (String(type).includes('drop')) directOrigins = acquisitionOrigins(resource, source, fixed('monsters', source));
                        else directOrigins = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
                        if (directOrigins.length) {
                            hasDirectSource = true;
                            continue;
                        }
                        const producerSkill = knownNames.get(source), producerMeta = data.challenges[producerSkill]?.[source];
                        if (!producerMeta || source === taskName || !taskOrigins(source, producerSkill).length) continue;
                        const producer = taskMetadata(source, producerSkill, producerMeta, ids);
                        if (producer.taskClass !== 'skill_progression') continue;
                        producers.set(producer.taskId, { taskId: producer.taskId, name: producer.name,
                            displayName: producer.displayName, skill: producer.skill, level: producer.level });
                    }
                }
                return hasDirectSource || !producers.size ? [] : [{
                    resource: canonicalItemKey(raw).replaceAll('*', ''),
                    producerTaskIds: [...producers.keys()], producers: [...producers.values()]
                }];
            });
        }
        const forestry = annotations.forestry || {};
        const forestryCategories = new Set(forestry.taskCategories || []);
        const forestryEventUniqueItems = new Set(forestry.eventUniqueItems || []);
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
            const sources = itemSourceEntries(name).map(([source]) => source);
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
            const eligibleSources = filterForestryOrigins(before), requiredLevel = Number.isFinite(meta.Level) ? meta.Level : 1;
            const levelMet = (state.actualLevels?.Woodcutting || 1) >= requiredLevel;
            forestryTreeRecords.push({ name, skill, requiredLevel,
                treeTypes: meta.Objects.flatMap(object => expand(object, codes.objectsPlus)),
                validSources: levelMet ? eligibleSources : [], levelBlockedSources: levelMet ? [] : eligibleSources,
                excludedSources: uniqueOrigins(before).filter(isExcludedForestryOrigin) });
        }
        const allForestryTreeOrigins = uniqueOrigins(forestryTreeRecords.flatMap(record => record.validSources));
        const blockedForestryTreeOrigins = uniqueOrigins(forestryTreeRecords.flatMap(record => record.levelBlockedSources));
        const minimumBlockedForestryLevel = Math.min(...forestryTreeRecords.filter(record => record.levelBlockedSources.length)
            .map(record => record.requiredLevel), Infinity);
        const forestryKitCapability = forestry.kitItem ? chooseItemCapability(enablerModel, forestry.kitItem, 'Woodcutting') : null;
        const forestryAxeCapability = enablerModel.byRequirement.get('Axe[+]');
        const milestoneComplete = producer => isComplete({ ...producer, taskClass: 'skill_progression' }, legacy, state) ||
            (producer.level && (state.progressionHighWater?.[producer.skill] || 0) >= producer.level);

        const nonCircularOriginCache = new Map();
        const requirementUsesItem = (requirement, itemName) => {
            const wanted = comparableItemKey(itemName);
            return (requirement.requiresSpecificItem && comparableItemKey(requirement.itemKey) === wanted) ||
                (requirement.satisfyingItems || []).some(itemInfo => comparableItemKey(itemInfo.itemKey) === wanted);
        };
        function itemOriginsWithoutDependency(rawItem, blockedItem, visiting = new Set()) {
            const cacheKey = comparableItemKey(rawItem) + '|without|' + comparableItemKey(blockedItem);
            if (visiting.has(cacheKey)) return [];
            if (nonCircularOriginCache.has(cacheKey)) return nonCircularOriginCache.get(cacheKey);
            const next = new Set(visiting).add(cacheKey);
            const origins = expand(rawItem, codes.itemsPlus).flatMap(expandedItem => {
                const itemName = canonicalItemKey(expandedItem);
                return itemSourceEntries(itemName).flatMap(([source, type]) => {
                    let directOrigins = [];
                    if (String(type).includes('spawn')) directOrigins = origin(source, 'spawn', itemName, 'Direct item spawn');
                    else if (type === 'shop' && base.shops?.[source]) directOrigins = fixed('shops', source);
                    else if (String(type).includes('drop')) directOrigins = acquisitionOrigins(itemName, source, fixed('monsters', source));
                    else directOrigins = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
                    if (directOrigins.length) return directOrigins;

                    const producerSkill = knownNames.get(source), producerMeta = data.challenges[producerSkill]?.[source];
                    if (!producerMeta) return [];
                    const directlyUsesBlockedItem = (producerMeta.Items || []).some(raw =>
                        expand(raw, codes.itemsPlus).some(choice => comparableItemKey(choice) === comparableItemKey(blockedItem)));
                    if (directlyUsesBlockedItem) return [];
                    const producerClass = taskMetadata(source, producerSkill, producerMeta, ids).taskClass;
                    const requirements = taskEnablerRequirements(data, producerSkill, producerMeta, enablerModel, producerClass, true);
                    if (requirements.some(requirement => requirementUsesItem(requirement, blockedItem))) return [];

                    const resources = (producerMeta.Items || []).filter(item => item.includes('*'));
                    const resourceOrigins = resources.map(resource => itemOriginsWithoutDependency(resource, blockedItem, next));
                    if (resourceOrigins.some(list => !list.length)) return [];
                    const hasFixedAnchor = !!(producerMeta.Chunks?.length || producerMeta.NPCs?.length || producerMeta.Monsters?.length ||
                        producerMeta.Objects?.length || producerMeta.Mix?.length);
                    if (!hasFixedAnchor && resourceOrigins.length === 1) return resourceOrigins[0];
                    return taskOrigins(source, producerSkill, next);
                });
            });
            const result = uniqueOrigins(origins);
            nonCircularOriginCache.set(cacheKey, result);
            return result;
        }
        const ownedReusableItems = new Set([
            ...Object.keys(state.acquiredEnablers || {}),
            ...Object.entries(legacy.manualEquipment || {}).filter(([, value]) => value !== false).map(([name]) => name)
        ].map(comparableItemKey));
        const collectionMilestones = new Map();
        if (rules['Collection Log']) for (const [collectionSkill, collectionTasks] of Object.entries(data.challenges || {})) {
            for (const [collectionName, collectionMeta] of Object.entries(collectionTasks || {})) {
                const record = taskMetadata(collectionName, collectionSkill, collectionMeta, ids);
                if (record.taskClass !== 'collection' || !own(valids[collectionSkill] || {}, collectionName) ||
                    valids[collectionSkill][collectionName] === false) continue;
                for (const rawItem of collectionMeta.Items || []) for (const itemName of expand(rawItem, codes.itemsPlus)) {
                    const key = comparableItemKey(itemName);
                    if (!collectionMilestones.has(key)) collectionMilestones.set(key, []);
                    collectionMilestones.get(key).push(record);
                }
            }
        }
        function collectionMilestoneReadiness(rawItem) {
            const alternatives = expand(rawItem, codes.itemsPlus).map(canonicalItemKey);
            const pending = alternatives.map(itemName => ({ itemName,
                goals: collectionMilestones.get(comparableItemKey(itemName)) || [] }));
            if (pending.some(entry => !entry.goals.length || entry.goals.some(goal => isComplete(goal, legacy, state)))) {
                return { allowed: true, blocks: [] };
            }
            const goals = pending.flatMap(entry => entry.goals);
            if (!goals.length) return { allowed: true, blocks: [] };
            const names = [...new Set(goals.map(goal => displayName(goal.name)))];
            return { allowed: false, blocks: [{ collectionMilestone: true,
                item: canonicalItemKey(rawItem).replaceAll('*', ''),
                reason: 'Complete ' + names.join(' or ') + ' before consuming this collection-log item' }] };
        }
        function itemRequirementReadiness(rawItem, visiting = new Set()) {
            const alternatives = expand(rawItem, codes.itemsPlus).map(canonicalItemKey);
            const available = alternatives.some(itemName => ownedReusableItems.has(comparableItemKey(itemName)) ||
                item(itemName, visiting).length > 0);
            if (available) return { allowed: true, blocks: [] };
            const blocks = alternatives.flatMap(itemName => dependencyDiagnostics.get(itemName) || []);
            return { allowed: false, blocks: blocks.length ? blocks : [{
                item: canonicalItemKey(rawItem).replaceAll('*', ''), reason: 'No accessible source for ' + canonicalItemKey(rawItem).replaceAll('*', '')
            }] };
        }
        function taskInputReadiness(name, skill, meta = data.challenges?.[skill]?.[name] || {}, visiting = new Set()) {
            const key = 'inputs:' + skill + ':' + name;
            if (visiting.has(key)) return { allowed: false, blocks: [{ reason: 'Circular item dependency' }] };
            const next = new Set(visiting).add(key), blocks = [];
            for (const rawItem of meta.Items || []) {
                if (rawItem.includes('*')) {
                    const milestone = collectionMilestoneReadiness(rawItem);
                    if (!milestone.allowed) { blocks.push(...milestone.blocks); continue; }
                }
                const readiness = itemRequirementReadiness(rawItem, next);
                if (!readiness.allowed) blocks.push(...readiness.blocks);
            }
            return { allowed: blocks.length === 0, blocks: [...new Map(blocks.map(block => [block.reason, block])).values()] };
        }
        function producerDependencyReadiness(name, skill, meta = data.challenges?.[skill]?.[name] || {}, visiting = new Set()) {
            const level = taskLevelReadiness(name, skill, meta);
            if (!level.allowed) return { allowed: false, blocks: [level] };
            const declared = declaredSkillReadiness(meta);
            if (!declared.allowed) return { allowed: false, blocks: [declared] };
            return taskInputReadiness(name, skill, meta, visiting);
        }

        const TRAINING_DROP_RATE = 1 / 4;
        const dropChance = (monster, itemName) => {
            const computed = Object.entries(dropRates?.[monster] || {})
                .filter(([name]) => comparableItemKey(name) === comparableItemKey(itemName))
                .map(([, rate]) => rate);
            const drops = data.drops?.[monster] || {};
            const matching = Object.entries(drops).filter(([name]) => comparableItemKey(name) === comparableItemKey(itemName));
            const rawRates = computed.length ? computed : matching.flatMap(([, quantities]) => Object.values(quantities || {}));
            if (!rawRates.length) return null;
            return Math.max(0, ...rawRates.map(raw => {
                const value = String(raw).replaceAll('~', '').replaceAll(',', '').trim();
                if (/^always$/i.test(value)) return 1;
                const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(value);
                if (fraction) return Number(fraction[1]) / Number(fraction[2]);
                const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
                return percent ? Number(percent[1]) / 100 : 0;
            }));
        };
        const averageDropQuantity = (monster, itemName) => {
            const matching = Object.entries(data.drops?.[monster] || {})
                .filter(([name]) => comparableItemKey(name) === comparableItemKey(itemName));
            const values = matching.flatMap(([, quantities]) => Object.keys(quantities || {})).map(raw => {
                const range = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(String(raw));
                if (range) return (Number(range[1]) + Number(range[2])) / 2;
                const value = Number(String(raw).replaceAll(',', ''));
                return Number.isFinite(value) && value > 0 ? value : 1;
            });
            return values.length ? Math.max(...values) : 1;
        };
        const spawnCount = (itemName, location) => {
            const parsed = parseLocation(location), chunk = parsed && data.chunks?.[parsed.chunkId];
            if (!chunk) return 0;
            const container = parsed.sectionId ? chunk.Sections?.[parsed.sectionId] : chunk;
            const spawns = container?.Spawn || {};
            const found = Object.entries(spawns).find(([name]) => comparableItemKey(name) === comparableItemKey(itemName));
            return Number(found?.[1] || 0);
        };
        const sourceField = Object.freeze({ npcs: 'NPC', objects: 'Object', monsters: 'Monster', shops: 'Shop', spawn: 'Spawn' });
        const localSourceCount = (origin, names) => {
            const chunk = data.chunks?.[origin.chunkId];
            if (!chunk) return 0;
            const container = origin.sectionId ? chunk.Sections?.[origin.sectionId] : chunk;
            const sources = container?.[sourceField[origin.sourceType]] || {};
            const wanted = new Set((names || []).map(comparableItemKey));
            return Object.entries(sources).reduce((total, [name, count]) =>
                total + (wanted.has(comparableItemKey(name)) ? Number(count || 0) : 0), 0);
        };
        const producerSupportsTraining = (name, skill, origins) => {
            const matching = (annotations.trainingSupply?.localCooldownProducers || []).filter(rule =>
                (!rule.skill || rule.skill === skill) && (rule.tasks || []).includes(name));
            if (!matching.length) return true;
            return matching.some(rule => origins.some(origin => origin.sourceType === rule.sourceType &&
                (rule.sources || []).some(source => comparableItemKey(source) === comparableItemKey(origin.sourceName)) &&
                localSourceCount(origin, rule.sources) >= Number(rule.minimumLocalCount || 1)));
        };
        function directRepeatableItem(itemName) {
            const entries = itemSourceEntries(itemName);
            const equipment = data.equipment?.[canonicalItemKey(itemName)];
            const combatAmmunition = equipment?.slot === 'ammo' ||
                (equipment?.is_consumable === true &&
                    (Number(equipment.attack_ranged || 0) > 0 || Number(equipment.ranged_strength || 0) > 0)) ||
                / rune$/i.test(itemName);
            // Separate distant spawn points are separate waiting cycles. Only
            // one local pile containing multiple copies establishes training.
            if (entries.some(([source, type]) => String(type).includes('spawn') &&
                spawnCount(itemName, source) >= (combatAmmunition ? 5 : 2))) return true;
            return entries.some(([source, type]) => {
                if (type === 'shop' && fixed('shops', source).length) return true;
                if (String(type).includes('drop')) {
                    if (!fixed('monsters', source).length) return false;
                    const chance = dropChance(source, itemName);
                    return chance === null || chance >= TRAINING_DROP_RATE ||
                        (combatAmmunition && chance * averageDropQuantity(source, itemName) >= 1);
                }
                if (String(type).includes('spawn')) return false;
                return ['objects', 'npcs'].some(kind => fixed(kind, source).length > 0);
            });
        }
        function buildTrainingSupport() {
            trainingSupportedSkills = new Set(); trainingEvidenceSkills = new Set(); trainingMethodsBySkill = new Map();
            repeatableItems = new Set(Object.keys(base.items || {}).filter(directRepeatableItem).map(comparableItemKey));
            const methods = new Map(), allTasks = [];
            for (const skill of [...SKILLS, 'Nonskill']) for (const [name, meta] of Object.entries(data.challenges?.[skill] || {})) {
                allTasks.push({ name, skill, meta });
            }
            const rawRepeatable = raw => expand(raw, codes.itemsPlus).some(itemName => repeatableItems.has(comparableItemKey(itemName)));
            const rawObtainableOnce = (raw, visiting) => expand(raw, codes.itemsPlus).some(itemName =>
                ownedReusableItems.has(comparableItemKey(itemName)) || item(itemName, visiting).length > 0);
            let changed = true, passes = 0;
            while (changed && passes++ < allTasks.length + SKILLS.length) {
                changed = false;
                for (const { name, skill, meta } of allTasks) {
                    if (!own(valids[skill] || {}, name)) continue;
                    const origins = taskOrigins(name, skill);
                    if (!origins.length) continue;
                    const level = Number(meta.Level || 1), known = knownSkillLevel(skill);
                    if (SKILLS.includes(skill) && level > known &&
                        (!trainingSupportedSkills.has(skill) || level > skillCeiling(skill))) continue;
                    const declared = Object.entries(meta.Skills || {}).every(([requiredSkill, rawLevel]) => {
                        if (!SKILLS.includes(requiredSkill)) return true;
                        const requiredLevel = Number(rawLevel || 1), requiredKnown = knownSkillLevel(requiredSkill);
                        return requiredLevel <= requiredKnown || (trainingSupportedSkills.has(requiredSkill) && requiredLevel <= skillCeiling(requiredSkill));
                    });
                    if (!declared) continue;
                    const reusable = (meta.Items || []).filter(raw => !raw.includes('*'));
                    if (!reusable.every(raw => rawObtainableOnce(raw, new Set(['training:' + skill + ':' + name])))) continue;
                    if (SKILLS.includes(skill) && meta.Primary === true && !meta.NoXp && level <= known) {
                        trainingEvidenceSkills.add(skill);
                    }
                    const consumables = (meta.Items || []).filter(raw => raw.includes('*'));
                    if (!consumables.every(rawRepeatable)) continue;
                    if (SKILLS.includes(skill) && meta.Primary === true && !meta.NoXp && level <= known &&
                        !trainingSupportedSkills.has(skill)) {
                        trainingSupportedSkills.add(skill); methods.set(skill, new Set([name])); changed = true;
                    } else if (SKILLS.includes(skill) && meta.Primary === true && !meta.NoXp && level <= known &&
                        trainingSupportedSkills.has(skill)) methods.get(skill)?.add(name);
                    if (meta.Output && producerSupportsTraining(name, skill, origins)) {
                        const output = comparableItemKey(meta.Output);
                        if (!repeatableItems.has(output)) { repeatableItems.add(output); changed = true; }
                    }
                }
            }
            trainingMethodsBySkill = new Map([...methods].map(([skill, names]) => [skill, [...names]]));
        }
        const repeatableGroupAvailable = group => expand(group, codes.itemsPlus)
            .some(itemName => repeatableItems.has(comparableItemKey(itemName)));
        const itemObtainable = itemName => obtainedItems.has(comparableItemKey(itemName)) ||
            own(state.acquiredEnablers, canonicalItemKey(itemName)) || item(itemName, new Set()).length > 0;
        function deriveCombatTrainingSupply() {
            const foodReady = (combatConfig.foodGroups || []).some(repeatableGroupAvailable) ||
                (combatConfig.foodItems || []).some(itemName => repeatableItems.has(comparableItemKey(itemName)));
            const prayerReady = (combatConfig.prayerResourceGroups || []).some(repeatableGroupAvailable) ||
                (combatConfig.prayerResourceItems || []).some(itemName => repeatableItems.has(comparableItemKey(itemName)));
            const equipment = Object.entries(data.equipment || {});
            const rangedReady = (combatConfig.rangedFamilies || []).some(family => {
                const weaponPattern = new RegExp(family.weaponPattern, 'i');
                const ammunitionPattern = new RegExp(family.ammunitionPattern, 'i');
                const weapon = equipment.some(([name, meta]) => ['weapon', '2h'].includes(meta.slot) &&
                    Number(meta.attack_ranged || 0) > 0 && weaponPattern.test(name) && itemObtainable(name));
                const ammunition = equipment.some(([name, meta]) => meta.slot === 'ammo' &&
                    ammunitionPattern.test(name) && repeatableItems.has(comparableItemKey(name)));
                return weapon && ammunition;
            }) || equipment.some(([name, meta]) => meta.is_consumable === true &&
                (Number(meta.attack_ranged || 0) > 0 || Number(meta.ranged_strength || 0) > 0) &&
                repeatableItems.has(comparableItemKey(name)));
            const catalyticReady = (combatConfig.magicCatalyticItems || ['Mind rune'])
                .some(itemName => repeatableItems.has(comparableItemKey(itemName)));
            const elementalReady = repeatableGroupAvailable(combatConfig.magicElementalGroup || 'Elemental rune[+]') ||
                (combatConfig.magicElementalStaves || []).some(itemObtainable);
            const magicReady = trainingSupportedSkills.has('Magic') || (catalyticReady && elementalReady);
            return { foodReady, supply: { Ranged: rangedReady || trainingSupportedSkills.has('Ranged'),
                Magic: magicReady, Prayer: prayerReady || trainingSupportedSkills.has('Prayer') } };
        }
        // The first pass permits only monsters already proven by the frontier.
        // A food source found there can safely open the next ten levels. Repeat
        // once so ammunition and bones from that newly reachable band can also
        // activate their combat skills without allowing a resource cycle.
        for (let pass = 0; pass < 3; pass++) {
            sourceCache.clear(); originCache.clear(); dependencyDiagnostics.clear();
            buildTrainingSupport();
            const derived = deriveCombatTrainingSupply();
            const stable = combatFoodReady === derived.foodReady &&
                ['Ranged', 'Magic', 'Prayer'].every(skill => combatTrainingSupply[skill] === derived.supply[skill]);
            combatFoodReady = derived.foodReady;
            combatTrainingSupply = derived.supply;
            if (stable) break;
        }
        trainingAnalysisReady = true;
        // The first pass deliberately traces the worker's raw source graph. Clear
        // those caches so normal task construction applies the level and training gates.
        sourceCache.clear(); originCache.clear(); dependencyDiagnostics.clear();
        const ordinaryGoalSupplyCache = new Map();
        function reasonableRecipeItemOrigins(raw, visiting = new Set()) {
            return uniqueOrigins(expand(raw, codes.itemsPlus).flatMap(rawName => {
                const itemName = canonicalItemKey(rawName), key = 'recipe-origin:' + comparableItemKey(itemName);
                if (visiting.has(key)) return [];
                const next = new Set(visiting).add(key);
                return itemSourceEntries(itemName).flatMap(([source, type]) => {
                    if (!recipeSupply.sourceAllowed(itemName, source, type)) return [];
                    if (String(type).includes('spawn')) return origin(source, 'spawn', itemName, 'Direct item spawn');
                    if (type === 'shop' && base.shops?.[source]) return fixed('shops', source);
                    if (String(type).includes('drop')) return acquisitionOrigins(itemName, source, fixed('monsters', source));
                    const direct = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
                    if (direct.length) return direct;
                    const producerSkill = knownNames.get(source), producerMeta = data.challenges?.[producerSkill]?.[source];
                    if (!producerMeta || !taskLevelReadiness(source, producerSkill, producerMeta).allowed ||
                        !declaredSkillReadiness(producerMeta).allowed) return [];
                    const reusable = (producerMeta.Items || []).filter(item => !item.includes('*'));
                    if (!reusable.every(item => itemRequirementReadiness(item, next).allowed)) return [];
                    const consumed = (producerMeta.Items || []).filter(item => item.includes('*'));
                    if (!consumed.every(item => ordinaryGoalItemAvailable(item, next, true))) return [];
                    const hasFixedAnchor = !!(producerMeta.Chunks?.length || producerMeta.NPCs?.length ||
                        producerMeta.Monsters?.length || producerMeta.Objects?.length || producerMeta.Mix?.length);
                    return !hasFixedAnchor && consumed.length === 1 ? reasonableRecipeItemOrigins(consumed[0], next) :
                        taskOrigins(source, producerSkill, next);
                });
            }));
        }
        function ordinaryGoalItemAvailable(raw, visiting = new Set(), enforceRecipeSources = false) {
            const alternatives = expand(raw, codes.itemsPlus).map(canonicalItemKey);
            return alternatives.some(itemName => {
                const key = (enforceRecipeSources ? 'recipe:' : 'ordinary:') + comparableItemKey(itemName);
                if (ordinaryGoalSupplyCache.has(key)) return ordinaryGoalSupplyCache.get(key);
                if (visiting.has(key)) return false;
                const next = new Set(visiting).add(key);
                const registered = enforceRecipeSources &&
                    (recipeSupply.ingredients[recipeSupply.canonical(itemName)]?.sources || []).some(source =>
                        source.approved && source.kind === 'registered' && isComplete({ name: source.sourceName,
                            skill: source.sourceSkill, taskId: taskId(source.sourceName, source.sourceSkill, ids) }, legacy, state));
                const available = registered || itemSourceEntries(itemName).some(([source, type]) => {
                    if (enforceRecipeSources && !recipeSupply.sourceAllowed(itemName, source, type)) return false;
                    if (String(type).includes('spawn')) return origin(source, 'spawn', itemName, 'Direct item spawn').length > 0;
                    if (type === 'shop' && base.shops?.[source]) return fixed('shops', source).length > 0;
                    if (String(type).includes('drop')) {
                        const origins = acquisitionOrigins(itemName, source, fixed('monsters', source));
                        if (!origins.length) return false;
                        if (enforceRecipeSources) return true;
                        if (encounterDetails[source]?.sourceTypes?.includes('monsters')) return true;
                        const chance = dropChance(source, itemName);
                        return chance === null || chance >= TRAINING_DROP_RATE;
                    }
                    if (['objects', 'npcs', 'monsters', 'shops'].some(kind => fixed(kind, source).length > 0)) return true;
                    const producerSkill = knownNames.get(source), producerMeta = data.challenges?.[producerSkill]?.[source];
                    if (!producerMeta || !taskLevelReadiness(source, producerSkill, producerMeta).allowed ||
                        !declaredSkillReadiness(producerMeta).allowed) return false;
                    const reusable = (producerMeta.Items || []).filter(item => !item.includes('*'));
                    if (!reusable.every(item => itemRequirementReadiness(item, next).allowed)) return false;
                    return (producerMeta.Items || []).filter(item => item.includes('*'))
                        .every(item => ordinaryGoalItemAvailable(item, next, enforceRecipeSources));
                });
                ordinaryGoalSupplyCache.set(key, available);
                return available;
            });
        }
        function progressionSupplyReadiness(skill, meta, taskClass, advancesSkillProgression, forestBound = false) {
            // Reviewed processing skills use deliberate ingredient paths at
            // every level. Other skills keep the level-one introduction rule,
            // while later milestones reject low-rate incidental drops in their inputs.
            // Reward objectives are classified separately, so rare BiS and
            // Collection Log drops stay available without becoming training supplies.
            const recipe = recipeSupplySkills.has(skill) && (meta.Items || []).some(raw => raw.includes('*'));
            if (forestBound || (!recipe && (taskClass !== 'skill_progression' || !advancesSkillProgression ||
                Number(meta.Level || 1) <= 1))) {
                return { allowed: true, blocks: [] };
            }
            const blocks = (meta.Items || []).filter(raw => raw.includes('*')).flatMap(raw => {
                if (ordinaryGoalItemAvailable(raw, new Set(), recipeSupplySkills.has(skill))) return [];
                const itemName = canonicalItemKey(raw).replaceAll('*', '');
                return [{ item: itemName, reason: 'No reasonable primary source supplies ' + itemName }];
            });
            return { allowed: blocks.length === 0,
                blocks: [...new Map(blocks.map(block => [block.reason, block])).values()] };
        }
        function applySlayerProgression(record, requirementMeta, requirementSkill) {
            const otherwiseAvailable = record.available !== false;
            const explicitRequirement = Math.max(
                requirementSkill === 'Slayer' ? Number(requirementMeta.Level || 1) : 1,
                Number(requirementMeta.Skills?.Slayer || 1), Number(requirementMeta.SkillsNeeded?.Slayer || 1),
                Number(requirementMeta.SkillsNeededSub?.Slayer || 1)
            );
            const checked = (record.origins || []).map(origin => {
                const monsterRequirement = origin.sourceType === 'monsters' ? Number(data.slayerMonsters?.[origin.sourceName] || 1) : 1;
                const requirement = Math.max(explicitRequirement, monsterRequirement);
                const directMaster = origin.sourceType === 'npcs' ?
                    slayerProgression.masterStatuses.find(master => master.master === origin.sourceName && master.accessible) : null;
                const directSupport = directMaster ? [{ master: directMaster.master, requiredCombat: directMaster.requiredCombat }] : [];
                const support = directMaster?.status === 'usable' ? directSupport : origin.sourceType === 'monsters' ?
                    slayerProgression.monsterSupportAtOrigin(origin.sourceName, origin) : [];
                const unknownSupport = directMaster?.status === 'unknown' ? directSupport : origin.sourceType === 'monsters' ?
                    slayerProgression.unknownMonsterSupportAtOrigin(origin.sourceName, origin) :
                    slayerProgression.unknownMasters.map(master => ({ master: master.master, requiredCombat: master.requiredCombat }));
                const pendingSupport = directMaster?.status === 'pending' ? directSupport : origin.sourceType === 'monsters' ?
                    slayerProgression.pendingMonsterSupportAtOrigin(origin.sourceName, origin) :
                    slayerProgression.pendingMasters.map(master => ({ master: master.master, requiredCombat: master.requiredCombat }));
                if (directMaster && directMaster.status !== 'usable') return { origin, requirement, support, unknownSupport, pendingSupport,
                    allowed: false, masterStatus: directMaster.status,
                    reason: directMaster.status === 'unknown' ? 'A Slayer master needs one-time confirmation' : 'This Slayer master is marked unavailable' };
                // Slayer-gated creatures and their drops must occur in a pool
                // belonging to a geographically and quest-reachable master.
                if (monsterRequirement > 1 && !support.length) {
                    if (unknownSupport.length) return { origin, requirement, support, unknownSupport, pendingSupport, allowed: false,
                        masterStatus: 'unknown', reason: 'A Slayer master needs one-time confirmation' };
                    if (pendingSupport.length) return { origin, requirement, support, unknownSupport, pendingSupport, allowed: false,
                        masterStatus: 'pending', reason: 'Its Slayer master is marked unavailable' };
                    return { origin, requirement, support, unknownSupport, pendingSupport, allowed: false,
                        reason: 'This Slayer creature is not assignable by a reachable Slayer master' };
                }
                if (requirement <= slayerProgression.actualLevel) return { origin, requirement, support, allowed: true,
                    reason: 'Slayer level and master assignment access met' };
                if (!slayerProgression.trainingAvailable) {
                    if (unknownSupport.length) return { origin, requirement, support, unknownSupport, pendingSupport, allowed: false,
                        masterStatus: 'unknown', reason: 'A Slayer master needs one-time confirmation' };
                    if (pendingSupport.length) return { origin, requirement, support, unknownSupport, pendingSupport, allowed: false,
                        masterStatus: 'pending', reason: 'Its Slayer master is marked unavailable' };
                    return { origin, requirement, support, unknownSupport, pendingSupport, allowed: false,
                        reason: 'No reachable Slayer master has a currently doable assignment in unlocked chunks' };
                }
                return { origin, requirement, support, allowed: true,
                    reason: 'Reachable by training through a Slayer master that assigns this creature' };
            });
            const trainingChecks = checked.filter(result => result.support?.length);
            const slayerTrainingOrigins = uniqueOrigins(trainingChecks.map(result => result.origin));
            const slayerTrainingMasters = [...new Set(trainingChecks.flatMap(result => result.support.map(support => support.master)))];
            const incidentalTrainingDrop = ['bis', 'collection'].includes(record.taskClass) && slayerTrainingOrigins.length > 0;
            if (incidentalTrainingDrop) record = { ...record, slayerTrainingAlternative: true,
                slayerTrainingOrigins, slayerTrainingMasters };
            const requiresSlayer = explicitRequirement > 1 || checked.some(result => result.requirement > 1 || result.masterStatus);
            if (!requiresSlayer) return record;
            const allowedOrigins = checked.filter(result => result.allowed).map(result => result.origin);
            const blockedOrigins = checked.filter(result => !result.allowed);
            const unknownOrigins = checked.filter(result => result.masterStatus === 'unknown');
            const pendingOrigins = checked.filter(result => result.masterStatus === 'pending');
            const supportingMasters = [...new Set(checked.filter(result => result.allowed)
                .flatMap(result => result.support || []).map(support => support.master))];
            const summary = {
                actualLevel: slayerProgression.actualLevel,
                ceiling: slayerProgression.ceiling,
                nextMilestone: slayerProgression.nextMilestone,
                maximumSupportedLevel: slayerProgression.maximumSupportedLevel,
                trainingAvailable: slayerProgression.trainingAvailable,
                accessibleMasters: slayerProgression.masters.map(master => ({ master: master.master, priority: master.priority,
                    requiredSlayer: master.requiredSlayer, deferredSkillRequirements: master.deferredSkillRequirements,
                    currentAssignableWeight: master.currentAssignableWeight, currentDoableWeight: master.currentDoableWeight,
                    currentDoableFamilies: master.currentDoableFamilies, maximumSupportedLevel: master.maximumSupportedLevel })),
                explicitRequirement,
                requiredLevel: Math.max(explicitRequirement, ...checked.filter(result => result.allowed).map(result => result.requirement)),
                supportingMasters,
                requiresTraining: checked.some(result => result.allowed && result.requirement > slayerProgression.actualLevel),
                blockedOrigins, blocked: !allowedOrigins.length
            };
            const masterDependency = (status, results, supportKey) => results.length ? {
                status,
                origins: uniqueOrigins(results.map(result => result.origin)),
                masters: [...new Map(results.flatMap(result => result[supportKey] || []).map(master =>
                    [master.master, { master: master.master, requiredCombat: master.requiredCombat }])).values()]
                    .sort((left, right) => left.requiredCombat - right.requiredCombat || left.master.localeCompare(right.master))
            } : null;
            const confirmation = masterDependency('unknown', unknownOrigins, 'unknownSupport');
            const deferred = masterDependency('pending', pendingOrigins, 'pendingSupport');
            if (confirmation && otherwiseAvailable) record.slayerMasterConfirmation = confirmation;
            if (deferred && otherwiseAvailable) record.slayerMasterDeferred = deferred;
            if (allowedOrigins.length) {
                record.origins = uniqueOrigins(allowedOrigins);
                record.slayerProgression = summary;
                return record;
            }
            record.available = false;
            const reason = blockedOrigins[0]?.reason || (explicitRequirement > slayerProgression.actualLevel ?
                'Slayer ' + explicitRequirement + ' is beyond the current master-supported progression' : 'No eligible Slayer source');
            const existing = record.accessResult?.allowed === false ? record.accessResult.reason + '; ' : '';
            record.accessResult = { ...(record.accessResult || {}), allowed: false, reason: existing + reason,
                slayerProgression: summary };
            record.slayerProgression = summary;
            accessDiagnostics.push({ taskId: record.taskId, name: record.displayName, allowed: false,
                reason: record.accessResult.reason, slayerProgression: summary });
            return record;
        }
        function activityRewardShopPath(shopName) {
            const config = annotations.activityRewardShops?.[shopName];
            if (!config) return null;
            const shopOrigins = fixed('shops', shopName);
            const configuredOrigins = (config.locations || []).flatMap(location =>
                origin(location, 'activity', shopName, 'Reviewed activity reward source'));
            const earning = (config.earningTasks || []).map(reference => {
                const skill = reference.skill || knownNames.get(reference.name);
                const meta = data.challenges?.[skill]?.[reference.name];
                if (!skill || !meta) return { allowed: false, origins: [],
                    reason: 'Missing earning activity metadata for ' + reference.name };
                const origins = taskOrigins(reference.name, skill);
                const taskRecord = taskMetadata(reference.name, skill, meta, ids);
                const level = taskLevelReadiness(reference.name, skill, meta);
                const declared = declaredSkillReadiness(meta);
                const inputs = taskInputReadiness(reference.name, skill, meta,
                    new Set(['activity-reward-shop:' + shopName]));
                const supply = progressionSupplyReadiness(skill, meta, taskRecord.taskClass,
                    taskRecord.advancesSkillProgression);
                const milestones = taskResourceMilestoneDependencies(reference.name, meta)
                    .filter(dependency => !dependency.producers.some(milestoneComplete));
                const requirements = uniqueRequirements([
                    ...taskEnablerRequirements(data, skill, meta, enablerModel, taskRecord.taskClass, true),
                    ...taskResourceRequirements(meta)
                ]).map(requirement => enablerRequirementStatus(requirement, state, data, skill));
                const missing = requirements.filter(requirement => !requirement.satisfied);
                const taskBlocks = Object.entries(meta.Tasks || {}).flatMap(([rawName, requiredSkill]) => {
                    const choices = expand(rawName, codes.tasksPlus || {});
                    const completed = choices.filter(requiredName => isComplete({ name: requiredName, skill: requiredSkill,
                        taskId: taskId(requiredName, requiredSkill, ids) }, legacy, state));
                    const needed = rawName.includes('[+]x') ? choices.length : 1;
                    return completed.length >= needed ? [] : ['Complete ' + choices.map(displayName).join(' or ')];
                });
                const reasons = [
                    ...taskBlocks,
                    ...(!level.allowed ? [level.reason] : []),
                    ...(!declared.allowed ? [declared.reason] : []),
                    ...inputs.blocks.map(block => block.reason),
                    ...(!supply.allowed ? supply.blocks.map(block => block.reason) : []),
                    ...milestones.map(dependency => 'Complete ' + dependency.producers.map(producer => producer.displayName).join(' or ')),
                    ...missing.map(requirement => 'Obtain ' + (requirement.requiresSpecificItem ?
                        requirement.itemKey : requirement.capabilityLabel))
                ];
                return { allowed: reasons.length === 0, origins,
                    reason: reasons[0] || 'Earning activity is available' };
            });
            const configuredMeta = { Items: config.requiredItems || [] };
            const configuredRequirements = uniqueRequirements([
                ...taskEnablerRequirements(data, 'Nonskill', configuredMeta, enablerModel, null, true),
                ...taskResourceRequirements(configuredMeta)
            ])
                .map(requirement => enablerRequirementStatus(requirement, state, data, 'Nonskill'));
            const missingConfigured = configuredRequirements.filter(requirement => !requirement.satisfied);
            const availableEarning = earning.some(status => status.allowed);
            const earningOrigins = uniqueOrigins(earning.flatMap(status => status.origins || []));
            const origins = shopOrigins.length ? shopOrigins : earningOrigins.length ? earningOrigins : configuredOrigins;
            const locationReady = !(config.locations || []).length || configuredOrigins.length > 0;
            const reasons = [
                ...(!availableEarning ? [...new Set(earning.map(status => status.reason).filter(Boolean))] : [])
            ];
            return { source: shopName, sourceType: 'activity-reward-shop', origins,
                available: origins.length > 0 && locationReady && availableEarning && !missingConfigured.length,
                resourceMilestones: [], persistentEnablers: configuredRequirements, forestry: null,
                dependencyBlocks: reasons.map(reason => ({ reason })) };
        }
        function acquisitionPath(itemName, source, type) {
            let directOrigins = [];
            if (type === 'clue-reward') {
                const match = /^Clue scroll \((beginner|easy|medium|hard|elite|master)\)$/.exec(source);
                if (!match || !clueTierCanGenerate(match[1])) return null;
                directOrigins = clueTierSourceOrigins(match[1]);
            } else if (String(type).includes('spawn')) directOrigins = origin(source, 'spawn', itemName, 'Direct item spawn');
            else if (type === 'shop' && annotations.activityRewardShops?.[source]) {
                return activityRewardShopPath(source);
            } else if (type === 'shop' && base.shops?.[source]) directOrigins = fixed('shops', source);
            else if (String(type).includes('drop')) directOrigins = acquisitionOrigins(itemName, source, fixed('monsters', source));
            else directOrigins = ['objects', 'npcs', 'monsters', 'shops'].flatMap(kind => fixed(kind, source));
            if (directOrigins.length) {
                const persistentEnablers = shipCombatMonsters.has(source) && shipCannonCapability ?
                    [enablerRequirementStatus(requirementFromCapability(shipCannonCapability), state, data, 'Sailing')] : [];
                return { source, sourceType: type, origins: uniqueOrigins(directOrigins),
                    available: persistentEnablers.every(requirement => requirement.satisfied),
                    resourceMilestones: [], persistentEnablers, forestry: null };
            }
            const sourceSkill = knownNames.get(source), sourceMeta = data.challenges[sourceSkill]?.[source];
            let origins = sourceMeta ? taskOrigins(source, sourceSkill) : [];
            if (!sourceMeta) return null;
            // A workstation alone cannot prove that a produced item is
            // obtainable. Validate the producing action and its complete input
            // chain before exposing its output as a reward or equipment goal.
            const levelReadiness = taskLevelReadiness(source, sourceSkill, sourceMeta);
            const declaredReadiness = declaredSkillReadiness(sourceMeta);
            const inputReadiness = taskInputReadiness(source, sourceSkill, sourceMeta,
                new Set(['acquisition:' + comparableItemKey(itemName)]));
            const dependencyBlocks = [
                ...(!levelReadiness.allowed ? [levelReadiness] : []),
                ...(!declaredReadiness.allowed ? [declaredReadiness] : []),
                ...inputReadiness.blocks
            ];
            const markedSourceResources = (sourceMeta.Items || []).filter(item => item.includes('*'));
            const sourceResources = markedSourceResources.length ? markedSourceResources : (sourceMeta.Items || []);
            const hasFixedAnchor = !!(sourceMeta.Chunks?.length || sourceMeta.NPCs?.length || sourceMeta.Monsters?.length ||
                sourceMeta.Objects?.length || sourceMeta.Mix?.length);
            // Recovery actions such as eating a pie or emptying a container have
            // no location of their own. Attribute them only to acquisition paths
            // for the consumed item that do not already require the recovered item.
            if (!hasFixedAnchor && sourceResources.length === 1) {
                origins = itemOriginsWithoutDependency(sourceResources[0], itemName);
                if (!origins.length) return null;
            }
            const resourceMilestones = taskResourceMilestoneDependencies(source, sourceMeta).map(dependency => ({
                ...dependency, satisfied: dependency.producers.some(milestoneComplete)
            }));
            const sourceClass = taskMetadata(source, sourceSkill, sourceMeta, ids).taskClass;
            const persistentEnablers = uniqueRequirements([
                ...taskEnablerRequirements(data, sourceSkill, sourceMeta, enablerModel, sourceClass, true),
                ...taskResourceRequirements(sourceMeta)
            ]).map(requirement => enablerRequirementStatus(requirement, state, data, sourceSkill));
            const forestrySource = isDirectForestry(sourceMeta) || (sourceMeta.Source === 'shop' &&
                (sourceMeta.NPCs || []).includes(forestry.kitNpc) && canonicalItemKey(sourceMeta.Output) !== forestry.kitItem);
            let forestryStatus = null;
            if (forestrySource) {
                const forestryRequirements = [];
                if (forestryKitCapability) forestryRequirements.push(enablerRequirementStatus(requirementFromCapability(forestryKitCapability),
                    state, data, 'Woodcutting'));
                if (forestryAxeCapability) forestryRequirements.push(enablerRequirementStatus(requirementFromCapability(forestryAxeCapability),
                    state, data, 'Woodcutting'));
                forestryStatus = { required: true, treeOrigins: allForestryTreeOrigins, persistentEnablers: forestryRequirements,
                    satisfied: allForestryTreeOrigins.length > 0 && forestryRequirements.every(requirement => requirement.satisfied) };
            }
            return { source, sourceSkill, sourceType: type, origins, resourceMilestones, persistentEnablers,
                dependencyBlocks, forestry: forestryStatus,
                available: dependencyBlocks.length === 0 && resourceMilestones.every(dependency => dependency.satisfied) &&
                    persistentEnablers.every(requirement => requirement.satisfied) && (!forestryStatus || forestryStatus.satisfied) };
        }
        function itemAcquisitionStatus(itemName) {
            const paths = itemSourceEntries(itemName)
                .map(([source, type]) => acquisitionPath(itemName, source, type)).filter(Boolean);
            const availablePaths = paths.filter(path => path.available);
            const missingMilestones = [...new Map(paths.flatMap(path => path.resourceMilestones || []).filter(dependency => !dependency.satisfied)
                .map(dependency => [dependency.resource, dependency])).values()];
            const missingEnablers = uniqueRequirements(paths.flatMap(path => [
                ...(path.persistentEnablers || []), ...(path.forestry?.persistentEnablers || [])
            ]).filter(requirement => !requirement.satisfied));
            const dependencyBlocks = [...new Map(paths.flatMap(path => path.dependencyBlocks || [])
                .map(block => [block.reason, block])).values()];
            const needsForestryTree = paths.some(path => path.forestry && !path.forestry.treeOrigins.length);
            const reasons = [
                ...dependencyBlocks.map(block => block.reason),
                ...missingEnablers.map(requirement => 'obtain ' + (requirement.requiresSpecificItem ? requirement.itemKey : requirement.capabilityLabel)),
                ...missingMilestones.map(dependency => 'complete ' + dependency.producers.map(producer => producer.displayName).join(' or ')),
                ...(needsForestryTree ? ['unlock an eligible non-Guild Forestry tree'] : [])
            ];
            return { itemKey: itemName, paths, availablePaths, available: availablePaths.length > 0,
                origins: uniqueOrigins(availablePaths.flatMap(path => path.origins)), missingMilestones, missingEnablers, dependencyBlocks,
                reason: reasons.length ? 'Acquisition prerequisites: ' + reasons.join('; ') : 'No accessible acquisition path' };
        }
        const equipmentByFormattedName = new Map(Object.entries(data.equipment || {}).map(([name, meta]) => [(meta.formatted_name || name.toLowerCase()).replaceAll('#', '/'), name]));
        for (const skill of categories) for (const [name, value] of Object.entries(valids[skill] || {})) {
            const meta = data.challenges[skill]?.[name] || {};
            if (skill === 'Nonskill' || value === false || meta.NeverShow || isAbstractGatheringToolTask(name, skill, meta) ||
                isRedundantForestryParticipationTask(meta)) continue;
            if (SKILLS.includes(skill) || skill === 'Combat') { if (!rules['Show Skill Tasks']) continue; }
            if (skill === 'BiS' && !rules['Show Best in Slot Tasks']) continue;
            if (skill === 'Quest' && !rules['Show Quest Tasks']) continue;
            if (skill === 'Diary' && !rules['Show Diary Tasks'] && !rules['Show Diary Tasks Any']) continue;
            if ((meta.Category || []).includes('Collection Log') && (!rules['Collection Log'] ||
                (!clueTiersFor(meta).length && meta.Category.filter(c => c.startsWith('Collection Log ')).length &&
                    !meta.Category.some(c => c !== 'Collection Log' && rules[c])))) continue;
            const id = taskId(name, skill, ids);
            const equipmentName = skill === 'BiS' ? equipmentByFormattedName.get(name.split('|')[1]) : undefined;
            const equipmentMeta = skill === 'BiS' ? data.equipment?.[equipmentName] : null;
            if (skill === 'BiS' && (equipmentMeta?.slot === 'ammo' || equipmentMeta?.is_consumable === true)) continue;
            const directClueReward = clueRewardByTaskId.get(id);
            if (clueTiersFor(meta).length && !directClueReward) continue;
            const equipmentClueReward = equipmentName ? clueRewardByItem.get(comparableItemKey(equipmentName)) : null;
            let origins = directClueReward ? (clueTierCanGenerate(directClueReward.ownerTier) ?
                clueTierSourceOrigins(directClueReward.ownerTier) : []) : equipmentName ? item(equipmentName, new Set()) : taskOrigins(name, skill);
            // A BiS row can stand in for its clue-log row only when the item is
            // currently clue-exclusive. If an ordinary source also exists,
            // keep the goals separate so the completion retains provenance.
            const equipmentHasOrdinarySource = equipmentName && itemSourceEntries(equipmentName)
                .some(([, type]) => type !== 'clue-reward');
            const genericClueTiers = equipmentName ? clueEquipmentTiersByItem.get(comparableItemKey(equipmentName)) || [] : [];
            const activeGenericClueTiers = genericClueTiers.filter(tier => clueTierCanGenerate(tier) &&
                clueTierSourceOrigins(tier).length);
            const genericClueReward = activeGenericClueTiers.length ? {
                ownerTier: activeGenericClueTiers[0], sourceTiers: genericClueTiers,
                itemKey: equipmentName, equipmentOnly: true
            } : null;
            const clueReward = directClueReward || (equipmentClueReward && !equipmentHasOrdinarySource ? equipmentClueReward : null) ||
                (!equipmentHasOrdinarySource ? genericClueReward : null);
            const blockedShipCombatOrigins = !shipCannonCapability ? [] : origins.filter(source => shipCombatMonsters.has(source.sourceName));
            const shipCannonStatus = blockedShipCombatOrigins.length ? enablerRequirementStatus(
                requirementFromCapability(shipCannonCapability), state, data, 'Sailing') : null;
            if (shipCannonStatus && !shipCannonStatus.satisfied) {
                origins = origins.filter(source => !shipCombatMonsters.has(source.sourceName));
            }
            const forestBound = !!forestry.kitItem && taskNeedsForestry(name, skill);
            const directTrees = forestryTreeRecords.filter(record => record.name === name && record.skill === skill);
            const treeSources = uniqueOrigins((directTrees.length ? directTrees : forestryTreeRecords).flatMap(record => record.validSources));
            const excludedTreeSources = uniqueOrigins((directTrees.length ? directTrees : forestryTreeRecords).flatMap(record => record.excludedSources));
            const treeTypes = [...new Set((directTrees.length ? directTrees : forestryTreeRecords).flatMap(record => record.treeTypes))];
            if (forestBound && (!origins.length || (meta.Category || []).includes('Collection Log'))) origins = treeSources;
            if (isDirectForestry(meta)) origins = filterForestryOrigins(origins);
            let record = { ...taskMetadata(name, skill, meta, ids), equipmentName,
                origins, available: true, enablers: [] };
            if (clueReward) record.clueReward = { tier: clueReward.ownerTier, ownerTier: clueReward.ownerTier,
                sourceTiers: clueReward.sourceTiers, itemKey: clueReward.itemKey, incidental: false,
                equipmentOnly: !!clueReward.equipmentOnly };
            if (clueReward && (!clueTierCanGenerate(clueReward.ownerTier) || !origins.length)) {
                record.available = false;
                const reason = state.clueLocks?.[clueReward.ownerTier] ?
                    clueReward.ownerTier + ' clues are blocked by the current clue step' :
                    clueRewards.tiers[clueReward.ownerTier]?.complete ? clueReward.ownerTier + ' clue rewards are complete' :
                    Number(state.clueTaskCooldown) > 0 ? 'Complete a non-clue goal before another clue reward goal' :
                    clueReward.ownerTier === 'master' ? 'Watson needs completed easy, medium, hard and elite clue pools' :
                    'No repeatable clue source is available';
                record.accessResult = { allowed: false, reason, clueReward: record.clueReward };
            }
            if (skill === 'BiS') {
                record.bisReason = stripMarkup(typeof value === 'string' ? value : meta.Label || record.bisReason);
                record.category = record.bisReason || 'BiS';
                const equipmentSlot = data.equipment?.[equipmentName]?.slot;
                if (equipmentName && equipmentSlot && equipmentSlot !== 'ammo') {
                    const action = ['weapon', '2h'].includes(equipmentSlot) ? 'Obtain and wield' : 'Obtain and wear';
                    record.displayName = action + record.displayName.replace(/^Obtain/i, '');
                    record.confirmsEquipped = true;
                }
                if (record.bisReason) record.displayName = '[' + record.bisReason + '] ' + record.displayName;
            }
            let requirementMeta = meta, requirementSkill = skill;
            if (knownNames.has(name) && !SKILLS.includes(knownNames.get(name))) {
                const nativeSkill = knownNames.get(name), native = taskMetadata(name, nativeSkill, data.challenges[nativeSkill][name], ids);
                const combinedBisReason = [record.bisReason, native.bisReason].filter(Boolean)
                    .flatMap(reason => String(reason).split(/\/\u200b?/)).map(reason => reason.trim()).filter(Boolean)
                    .filter((reason, index, all) => all.indexOf(reason) === index).join('/\u200b');
                record = { ...record, taskClass: native.taskClass, classificationReason: native.classificationReason,
                    advancesSkillProgression: false, usesSkillLevelWindow: native.usesSkillLevelWindow, skilling: false,
                    bisReason: combinedBisReason, bisSet: native.bisSet };
                if (skill === 'BiS' && combinedBisReason) {
                    const slot = data.equipment?.[equipmentName]?.slot;
                    const actionName = record.confirmsEquipped ?
                        (['weapon', '2h'].includes(slot) ? 'Obtain and wield' : 'Obtain and wear') + displayName(record.name).replace(/^Obtain/i, '') :
                        displayName(record.name);
                    record.displayName = '[' + combinedBisReason + '] ' + actionName;
                }
                requirementMeta = data.challenges[nativeSkill][name]; requirementSkill = nativeSkill;
            }
            if (record.taskClass === 'bis' && record.bisReason && !record.displayName.startsWith('[')) {
                record.displayName = '[' + record.bisReason + '] ' + record.displayName;
            }
            const declaredReadiness = declaredSkillReadiness(requirementMeta);
            if (!SKILLS.includes(requirementSkill) && !declaredReadiness.allowed) {
                record.available = false;
                record.dependencyBlocks = [declaredReadiness];
                record.accessResult = { allowed: false, reason: declaredReadiness.reason,
                    dependencyBlocks: [declaredReadiness],
                    trainingMethods: trainingMethodsBySkill.get(declaredReadiness.skill) || [] };
                accessDiagnostics.push({ taskId: id, name: record.displayName, allowed: false,
                    reason: declaredReadiness.reason, dependencyBlocks: [declaredReadiness] });
            }
            if (SKILLS.includes(requirementSkill)) {
                const recipeConsumables = recipeSupplySkills.has(requirementSkill) ?
                    (requirementMeta.Items || []).filter(raw => raw.includes('*')) : [];
                const portableObjects = codes.boardlockedPortableObjects || ['Cooking object[+]'];
                const recipeHasFixedAnchor = !!(requirementMeta.Chunks?.length || requirementMeta.NPCs?.length ||
                    requirementMeta.Monsters?.length || requirementMeta.Mix?.length ||
                    (requirementMeta.Objects?.length && !requirementMeta.Objects.every(object => portableObjects.includes(object))));
                if (recipeConsumables.length === 1 && !recipeHasFixedAnchor) {
                    record.origins = reasonableRecipeItemOrigins(recipeConsumables[0]);
                }
                const levelReadiness = taskLevelReadiness(name, requirementSkill, requirementMeta);
                const inputReadiness = taskInputReadiness(name, requirementSkill, requirementMeta);
                const supplyReadiness = progressionSupplyReadiness(requirementSkill, requirementMeta, record.taskClass,
                    record.advancesSkillProgression, forestBound);
                const dependencyReadiness = !declaredReadiness.allowed ? declaredReadiness :
                    !levelReadiness.allowed && levelReadiness.reason.startsWith('No repeatable ') ? levelReadiness : null;
                const progressionInputBlocks = inputReadiness.blocks.filter(block => block.skill || block.collectionMilestone);
                if (dependencyReadiness || progressionInputBlocks.length || !supplyReadiness.allowed) {
                    const blocks = dependencyReadiness ? [dependencyReadiness] :
                        progressionInputBlocks.length ? progressionInputBlocks : supplyReadiness.blocks;
                    record.available = false;
                    record.dependencyBlocks = blocks;
                    record.accessResult = { allowed: false, reason: blocks[0].reason,
                        dependencyBlocks: blocks, trainingMethods: trainingMethodsBySkill.get(dependencyReadiness?.skill) || [] };
                    accessDiagnostics.push({ taskId: id, name: record.displayName, allowed: false,
                        reason: record.accessResult.reason, dependencyBlocks: blocks });
                }
            }
            const acquisitionTarget = record.taskClass === 'bis' && equipmentName ? equipmentName :
                ['bis', 'collection'].includes(record.taskClass) && requirementMeta.Items?.length === 1 &&
                    !requirementMeta.Items[0].includes('*') ? canonicalItemKey(requirementMeta.Items[0]) : null;
            const forestryEventUnique = forestBound && forestryEventUniqueItems.has(acquisitionTarget);
            if (acquisitionTarget) {
                const acquisition = itemAcquisitionStatus(acquisitionTarget);
                if (acquisition.paths.length) {
                    record.acquisition = acquisition;
                    // A clue collection row proves the casket source, even when
                    // the same item also exists in a shop, spawn, or drop table.
                    // Mixed-source BiS rows keep every path so the UI can show
                    // one ordinary presentation and one clue presentation.
                    if (!record.clueReward && acquisition.origins.length) record.origins = acquisition.origins;
                    else if (!record.clueReward && !record.origins.length) {
                        record.origins = uniqueOrigins(acquisition.paths
                            .filter(path => path.sourceType === 'activity-reward-shop')
                            .flatMap(path => path.origins || []));
                    }
                    if (!acquisition.available) {
                        record.available = false;
                        record.accessResult = { allowed: false, reason: acquisition.reason, acquisition };
                        accessDiagnostics.push({ taskId: id, name: record.displayName, allowed: false,
                            reason: acquisition.reason, acquisition });
                    }
                }
            }
            if (forestryEventUnique) record.origins = kitOrigins;
            record.equipmentObjectiveAlternatives = equipmentObjectiveAlternatives(data, name, requirementMeta);
            record.resourceMilestoneDependencies = SKILLS.includes(requirementSkill) &&
                ['skill_progression', 'activity'].includes(record.taskClass) ?
                taskResourceMilestoneDependencies(name, requirementMeta) : [];
            record.resourceRepresentative = record.taskClass === 'skill_progression' ?
                resourceRepresentativeMetadata(name, requirementSkill, requirementMeta, annotations) : null;
            const availableBeforeForestryAndPersistentEnablers = record.available !== false;
            const requiredEnablers = uniqueRequirements([
                ...taskEnablerRequirements(data, requirementSkill, requirementMeta, enablerModel, record.taskClass),
                ...taskResourceRequirements(requirementMeta)
            ]).map(requirement => enablerRequirementStatus(requirement, state, data, requirementSkill));
            if (shipCannonStatus && (shipCannonStatus.satisfied || !origins.length)) requiredEnablers.push(shipCannonStatus);
            record.provesAcquiredItemKeys = specificAcquisitionItems(data, requirementSkill, requirementMeta, record.taskClass, enablerModel);
            for (const requirement of requiredEnablers) if (requirement.requiresSpecificItem) record.provesAcquiredItemKeys.push(requirement.itemKey);
            if (forestBound) {
                const kitAcquired = forestryKitAcquired, kitObtainable = kitOrigins.length > 0;
                const treeValid = treeSources.length > 0;
                const forestryReason = !kitAcquired && !kitObtainable ? 'Forestry kit unavailable: no accessible ' + (forestry.kitNpc || 'kit provider') :
                    !kitAcquired ? 'Forestry kit is obtainable but has not been registered as acquired' :
                    !treeValid && Number.isFinite(minimumBlockedForestryLevel) ? 'Woodcutting level ' + minimumBlockedForestryLevel +
                        ' is required for the nearest eligible Forestry tree' :
                    !treeValid ? 'No eligible non-Guild Forestry tree source is accessible' : 'Acquired Forestry kit and eligible non-Guild tree source verified';
                const priorReason = record.accessResult?.allowed === false ? record.accessResult.reason : '';
                record.available = record.available && kitAcquired && treeValid;
                const reason = [priorReason, forestryReason].filter(Boolean).join('; ');
                record.enablers = [
                    { type: 'persistent_item', name: forestry.kitItem, provider: forestry.kitNpc || null, origins: kitOrigins,
                        acquired: kitAcquired, obtainable: kitObtainable, valid: kitAcquired },
                    { type: 'forestry_tree', treeTypes, origins: treeSources, levelBlockedOrigins: blockedForestryTreeOrigins,
                        minimumRequiredLevel: Number.isFinite(minimumBlockedForestryLevel) ? minimumBlockedForestryLevel : null,
                        excludedOrigins: excludedTreeSources, valid: treeValid,
                        currentlyAccessible: treeValid, reason: 'Tree object is referenced by Forestry task metadata and is outside excluded origin groups' }
                ];
                record.accessResult = { allowed: record.available, reason, forestry: true,
                    kit: { item: forestry.kitItem, provider: forestry.kitNpc || null, origins: kitOrigins,
                        acquired: kitAcquired, obtainable: kitObtainable, valid: kitAcquired },
                    treeSource: { treeTypes, origins: treeSources, levelBlockedOrigins: blockedForestryTreeOrigins,
                        minimumRequiredLevel: Number.isFinite(minimumBlockedForestryLevel) ? minimumBlockedForestryLevel : null,
                        excludedOrigins: excludedTreeSources, valid: treeValid,
                        currentlyAccessible: treeValid, reason: 'Tree object is referenced by Forestry task metadata and is outside excluded origin groups' } };
                if (!record.available) accessDiagnostics.push({ taskId: id, name: record.displayName, ...record.accessResult });
            } else if (!record.accessResult) record.accessResult = { allowed: true, reason: 'Passed strict source, rule and prerequisite calculation' };
            record = applySlayerProgression(record, requirementMeta, requirementSkill);
            record.availableWithoutPersistentEnablers = availableBeforeForestryAndPersistentEnablers &&
                !record.slayerProgression?.blocked && (!forestBound || (treeSources.length > 0 &&
                    (forestryKitAcquired || kitOrigins.length > 0)));
            if (requiredEnablers.length) {
                record.enablers.push(...requiredEnablers.map(requirement => ({ type: 'persistent_capability', ...requirement })));
                const missing = requiredEnablers.filter(requirement => !requirement.satisfied);
                if (missing.length) {
                    record.available = false;
                    const detail = missing.map(requirement => requirement.requiresSpecificItem ? requirement.itemKey : requirement.capabilityLabel).join(', ');
                    const existing = record.accessResult?.allowed === false ? record.accessResult.reason + '; ' : '';
                    const shipCombatMissing = missing.some(requirement => requirement.capabilityId === shipCannonCapability?.capabilityId);
                    record.accessResult = { ...(record.accessResult || {}), allowed: false,
                        reason: existing + (shipCombatMissing ? 'Ship combat requires an acquired cannon and the Sailing/Ranged levels to use it (bronze starts at 28 Sailing)' :
                            'Persistent enabler not acquired: ' + detail), persistentEnablers: requiredEnablers,
                        blockedShipCombatOrigins };
                    if (record.slayerMasterConfirmation) record.slayerMasterConfirmation.otherRequirementsBlocked = true;
                    accessDiagnostics.push({ taskId: id, name: record.displayName, allowed: false,
                        reason: record.accessResult.reason, persistentEnablers: requiredEnablers });
                } else record.accessResult = { ...(record.accessResult || {}), persistentEnablers: requiredEnablers };
                for (const requirement of record.slayerProgression?.blocked ? [] : missing) {
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
            if (!record.slayerProgression?.blocked && forestBound && !own(state.acquiredEnablers, forestry.kitItem) && kitOrigins.length && treeSources.length) {
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
            else tasks.get(id).origins = uniqueOrigins([...tasks.get(id).origins, ...record.origins]);
        }
        const articleFor = itemName => /^[aeiou]/i.test(itemName) ? 'an ' : 'a ';
        for (const { requirement, requiredBy, requests } of pendingCapabilities.values()) {
            for (const itemInfo of requirement.satisfyingItems) {
                const supportsPendingAction = requests.some(request =>
                    (!request.requirement.requiresSpecificItem || request.requirement.itemKey === itemInfo.itemKey) &&
                    itemUsableForRequirement(itemInfo, request.requirement, state, data, request.taskSkill));
                if (own(state.acquiredEnablers, itemInfo.itemKey) || !supportsPendingAction) continue;
                const acquisition = itemAcquisitionStatus(itemInfo.itemKey);
                const origins = acquisition.origins;
                if (!origins.length) continue;
                const id = enablerTaskId(itemInfo.itemKey), name = 'Obtain ' + articleFor(itemInfo.itemKey) + '~|' + itemInfo.itemKey.toLowerCase() + '|~';
                const capabilities = (enablerModel.byItem.get(itemInfo.itemKey) || []).filter(capability => pendingCapabilities.has(capability.capabilityId));
                const itemRequiredBy = requiredBy.filter(dependency =>
                    !dependency.requiresSpecificItem || dependency.itemKey === itemInfo.itemKey);
                tasks.set(id, { taskId: id, name, displayName: displayName(name), skill: 'Unlocks / Tools', type: 'Unlocks / Tools',
                    category: 'Unlocks / Tools', sourceCategories: [], level: null, description: '', taskClass: 'enabler',
                    classificationReason: 'Specific obtainable reusable item establishes a missing persistent capability',
                    advancesSkillProgression: false, skilling: false, origins, available: true,
                    enablerItemKey: itemInfo.itemKey, provesAcquiredItemKeys: [itemInfo.itemKey],
                    capabilities: capabilities.map(capability => ({ capabilityId: capability.capabilityId, label: capability.label,
                        familyType: capability.familyType, skill: capability.skill, minimumUseLevel: itemInfo.minimumUseLevel,
                        requiredLevels: itemInfo.requiredLevels || {} })),
                    requiredBy: itemRequiredBy, skillingBis: itemInfo.skillingBis, acquisition,
                    accessResult: { allowed: true, reason: 'Persistent enabler is usable and directly obtainable from an accessible source',
                        itemKey: itemInfo.itemKey, origins, requiredBy: itemRequiredBy, acquisition } });
            }
        }
        const allEnablerItems = [...new Set(enablerModel.capabilities.flatMap(capability => capability.satisfyingItems.map(item => item.itemKey)))];
        const enablerCatalog = allEnablerItems.map(itemKey => {
            const acquisition = itemAcquisitionStatus(itemKey), itemOrigins = acquisition.origins;
            return { itemKey, acquired: own(state.acquiredEnablers, itemKey), acquisition: state.acquiredEnablers[itemKey] || null,
                currentlyObtainable: acquisition.available, origins: itemOrigins, acquisitionPaths: acquisition.paths,
                capabilities: (enablerModel.byItem.get(itemKey) || []).map(capability => ({ capabilityId: capability.capabilityId,
                    label: capability.label, familyType: capability.familyType, skill: capability.skill,
                    minimumUseLevel: capability.satisfyingItems.find(item => item.itemKey === itemKey)?.minimumUseLevel ?? null,
                    requiredLevels: capability.satisfyingItems.find(item => item.itemKey === itemKey)?.requiredLevels || {},
                    classificationReason: capability.classificationReason })) };
        }).sort((a, b) => a.itemKey.localeCompare(b.itemKey));
        const finalTasks = [...tasks.values()].map(record => {
            const allOrigins = [...(record.origins || []), ...(record.slayerTrainingOrigins || [])];
            const sources = [...new Set(allOrigins.filter(origin => encounterDetails[origin.sourceName]?.sourceTypes
                .includes(origin.sourceType)).map(origin => origin.sourceName))].sort((a, b) => a.localeCompare(b));
            const combatEvidenceSources = [...new Map(allOrigins.filter(origin => origin.sourceType === 'monsters' &&
                !monsterUsesSeparateProgression(origin.sourceName) && monsterCombatLevel(origin.sourceName) != null)
                .map(origin => [origin.sourceName, { monster: origin.sourceName,
                    level: monsterCombatLevel(origin.sourceName) }])).values()];
            return { ...record,
                bossSources: sources.filter(source => bossMonsters.has(source)),
                encounterSources: sources,
                encounterDetails: Object.fromEntries(sources.map(source => [source, encounterDetails[source]])),
                combatEvidenceSources, combatProgressionCutoff: combatCutoff };
        });
        for (const record of finalTasks) if (!record.origins.length && !record.clueReward) diagnostics.push({ taskId: record.taskId,
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
        const clueLocks = Object.fromEntries(CLUE_TIERS.filter(tier => state.clueLocks?.[tier]).map(tier =>
            [tier, clueStepStatus(data, tier, state.clueLocks[tier], valids, legacy, state, ids, base)]));
        const clueStatus = {
            cooldown: Number(state.clueTaskCooldown) || 0,
            incidentalClues: { ...(state.incidentalClues || {}) },
            steps: clueStepCatalog(data, null, ids),
            locks: clueLocks,
            rewards: clueRewards.rewards.map(reward => ({ ...reward })),
            tiers: Object.fromEntries(CLUE_TIERS.map(tier => {
                const sourceOrigins = clueTierSourceOrigins(tier);
                const progress = clueRewards.tiers[tier];
                const blocked = !!state.clueLocks?.[tier];
                if (!completableClueStepCache.has(tier)) completableClueStepCache.set(tier,
                    calculateClueActivation().steps.get(tier) || []);
                const completableStepCount = completableClueStepCache.get(tier).length;
                return [tier, { ...progress, blocked, lock: clueLocks[tier] || null, sourceOrigins,
                    repeatableSource: sourceOrigins.length > 0,
                    completableStepCount, stepAvailable: completableStepCount > 0,
                    generating: !progress.complete && !blocked && !state.clueTaskCooldown &&
                        sourceOrigins.length > 0 && completableStepCount > 0,
                    sourceKind: tier === 'master' ? 'watson' : 'direct-drop' }];
            }))
        };
        return { tasks: finalTasks, unassigned: diagnostics, accessDiagnostics,
            combatProgression: { frontier: combatFrontier, mature: !!combatState.mature,
                foodReady: combatFoodReady, nextMonsterLimit: combatState.mature ? null :
                    combatFrontier + (combatFoodReady ? combatWindow : 0),
                trainingSupply: { ...combatTrainingSupply } },
            slayerMasters: slayerProgression.masterStatuses,
            enablerCatalog, enablerAmbiguities: enablerModel.ambiguous, clueStatus };
    }
    return { VERSION, STARTING_SECTION_POLICY, SKILLS, CLUE_TIERS, PROGRESSION_WINDOWS, progressionWindow, progressionCeiling, own, copy, taskId, displayName, stripMarkup,
        canonicalItemKey, itemSourceAllowed, clueSourceCatalog, recipeSupplyCatalog, applyRecipeSupplyAliases,
        enablerTaskId, enablerItemFromTaskId, normalizeState, normalizeRunExport, normalizeBrowserSave,
        sanitizeLegacySnapshot, parseLocation, parseUnlockedLocations, locationAvailable,
        uniqueOrigins, isComplete, isBacklogged, completionIds, completedQuestProgress, taskMetadata, resourceRepresentativeMetadata,
        equipmentObjectiveAlternatives, equipmentDominatesTask, superiorEquipmentCompletion,
        clueRewardCatalog, clueMapImagePath, clueTaskPresentations, clueTaskListPresentations,
        clueStepCatalog, clueStepDefinition, clueStepTargets, clueStepStatus,
        setClueLock, setIncidentalClueCount,
        isAbstractGatheringToolTask, isRedundantForestryParticipationTask, completedEquipmentItems,
        collapseRedundantEquipmentTasks, chooseResourceRepresentativeTasks, openCatchUpMilestones,
        openForestryCompanionMilestones, scopeAxeUpgradesToWoodcutting, buildTaskCatalog,
        deriveProgressionHighWater, completedSkillProgress, trainingMethodsAtOrBelow,
        initializeProgression, reconcileProgression, setProgressionHighWater, recordCombatTaskCompletion, skillMilestones, adaptTasks,
        actualCombatLevel, combatProgressionRequirementLevel, setSlayerMasterState, setEncounterBlocked, setBossBlocked, slayerLockDefinition, slayerLockTargets, slayerLockStatus, slayerProgressionModel,
        buildTravelGraph, deriveConnectedFrontier, inferConnectedSections, inferTravelAnchor, inferLegacyAnchorSections, setTravelAnchor, derivePool, chooseCandidate,
        deriveStartingSections, deriveStartingSectionGroups, isWaterLocation, travelMedium, isPortLanding, mediumConnectionAllowed,
        migrateCurrentArrival,
        migrateStartingSections, directStartingRequirements, mergeStartingRequirements, resolveStartingRequirements, sectionAccessAllowed,
        automaticStartingRequirementsAllowed, deriveStartingPool, deriveManualStartingPool, startingCandidateForRegion,
        chooseStartingCandidate, canRoll,
        startVisit, slayerMasterConfirmationForVisit, snapshotVisit, mergeVisitTaskForDisplay, visitTaskVisible, originMatchesVisit,
        addCatchUpTasksToCurrentVisit, recalculateCurrentVisit, resolveVisit, voidVisit, journal, expand, buildEnablerModel, taskEnablerRequirements,
        enablerRequirementStatus, recoverAcquiredEnablers, createAccess, buildTasks };
});
