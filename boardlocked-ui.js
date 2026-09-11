/* Boardlocked controller. Legacy task calculation remains the data source. */
(function () {
    'use strict';
    const R = Boardlocked;
    const boardlockedState = input => {
        const next = R.normalizeState(input);
        next.enabled = true;
        return next;
    };
    let state = boardlockedState(), loadedKey = '', localProfile = null, pendingStoredState = null, pendingStoredVersion = null;
    let worker = null, generation = 0, busy = true, error = '', timer = null;
    let rawTasks = [], tasks = [], sections = {}, diagnostics = [], sourceCounts = {};
    let enablerCatalog = [], enablerAmbiguities = [], slayerMasterCatalog = [], slayerConfirmation = null;
    let pool = R.derivePool([], {}, [], null), travelGraph = null, signature = '', previousUnlocked = null;
    let startingPool = { ids: [], groups: [], groupByLocation: {} };
    let pickingStartingTile = false, selectedStartingCandidate = null;
    let panel = null, message = '', dataReady = false;
    let loadFailure = false, recoveredBrowserBackup = false, browserVaultError = null;
    let catalog = [], catalogData = null, setupLocations = [];
    const BOARDLOCKED_PRESET = 'Boardlocked Chunker';
    const BOARDLOCKED_PRESET_REVISION = 2;
    const legacy = () => ({ checkedAllTasks, checkedChallenges, completedChallenges, manualEquipment, backlog });
    const storageSuffix = () => localProfile ? 'local:' + localProfile : (mid || 'unloaded') + (testMode ? ':sandbox' : ':map');
    const storageKey = () => 'chunk-picker-v2:boardlocked:v1:' + storageSuffix();
    // These concatenated names are permanent compatibility readers for builds
    // released before the project adopted the Boardlocked name.
    const legacyStorageKey = () => 'chunk-picker-v2:' + 'rogue' + 'like:v1:' + storageSuffix();
    const localKey = () => 'chunk-picker-v2:boardlocked-run:v2:' + localProfile;
    const localBackupKey = () => localKey() + ':backup';
    const legacyLocalKey = () => 'chunk-picker-v2:local-run:v1:' + localProfile;
    const canEdit = () => !!gotData && (testMode || !(viewOnly || locked || inEntry));
    const label = id => chunkInfo.chunks?.[id]?.Nickname || chunkInfo.chunks?.[id]?.Name || '';
    const hasStarted = () => !!state.travelAnchor || !!state.currentVisit || state.visitHistory.length > 0 ||
        Object.keys(tempChunks.unlocked || {}).length > 0;
    const assumedSetupTaskIds = () => (BoardlockedData.initialization?.assumedCompletedTasks || [])
        .filter(task => !task.option || state.initialization[task.option])
        .map(task => R.taskId(task.name, task.skill, typeof tasksMap === 'object' ? tasksMap : {}));
    const isInitializationTask = id => Object.values(state.initializationTaskIds || {}).some(ids => ids.includes(id)) ||
        assumedSetupTaskIds().includes(id);
    const sectionOverlayCache = new Map();

    function currentAreaSections() {
        const visitLocation = R.parseLocation(state.currentVisit?.locationId)?.chunkId;
        if (visitLocation === state.travelAnchor && Array.isArray(state.currentVisit?.arrivalSections)) {
            return [...state.currentVisit.arrivalSections];
        }
        return Array.isArray(state.travelAnchorSections) ? [...state.travelAnchorSections] : [];
    }

    function sectionOverlay(locationId, sectionId) {
        const key = locationId + '-' + sectionId;
        if (sectionOverlayCache.has(key)) return sectionOverlayCache.get(key);
        const entry = { canvas: null, centroid: null, weight: 0, failed: false };
        sectionOverlayCache.set(key, entry);
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth || 192; canvas.height = image.naturalHeight || 192;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                let sumX = 0, sumY = 0, weight = 0;
                for (let i = 0; i < pixels.data.length; i += 4) {
                    const mask = Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) / 255;
                    const pixelWeight = pixels.data[i + 3] / 255 * mask;
                    if (pixelWeight) {
                        const pixel = i / 4;
                        sumX += (pixel % canvas.width + .5) * pixelWeight;
                        sumY += (Math.floor(pixel / canvas.width) + .5) * pixelWeight;
                        weight += pixelWeight;
                    }
                    pixels.data[i] = 255; pixels.data[i + 1] = 209; pixels.data[i + 2] = 102;
                    pixels.data[i + 3] = Math.round(pixels.data[i + 3] * mask);
                }
                context.putImageData(pixels, 0, 0);
                entry.canvas = canvas; entry.weight = weight;
                if (weight) entry.centroid = { x: sumX / weight / canvas.width, y: sumY / weight / canvas.height };
                if (typeof drawCanvas === 'function') requestAnimationFrame(() => drawCanvas());
            } catch (_) { entry.failed = true; }
        };
        image.onerror = () => { entry.failed = true; };
        image.src = './resources/section_overlays/' + key + '.png';
        return entry;
    }

    function directionLabel(fromId, toId) {
        const from = convertToXY(fromId), to = convertToXY(toId);
        const dx = to.x - from.x, dy = to.y - from.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return '';
        return (dy < 0 ? 'up' : dy > 0 ? 'down' : '') + (dx < 0 ? (dy ? '-left' : 'left') : dx > 0 ? (dy ? '-right' : 'right') : '');
    }

    function currentAreaRoutes(locationId, areaSections) {
        if (!travelGraph?.sectionGraph) return [];
        const routeChunks = new Set();
        for (const sectionId of areaSections) {
            const node = locationId + '-' + sectionId;
            for (const target of travelGraph.sectionGraph[node] || []) {
                const parsed = R.parseLocation(target);
                if (parsed && parsed.chunkId !== locationId) routeChunks.add(parsed.chunkId);
            }
        }
        return [...routeChunks].map(id => ({ id, direction: directionLabel(locationId, id), name: label(id) }));
    }

    function removeCompletionId(id) {
        for (const store of [checkedAllTasks, checkedChallenges, completedChallenges]) {
            for (const category of Object.keys(store || {})) for (const key of Object.keys(store[category] || {})) {
                if (key === id || R.taskId(key, category, tasksMap) === id) delete store[category][key];
            }
        }
    }
    function syncInitializationCompletions(journal = false) {
        const questTasks = BoardlockedData.initialization?.questTasks || {};
        const questBaseNames = BoardlockedData.initialization?.questBaseNames || {};
        const questOptions = ['druidicRitual', 'varlamore', 'ocean'];
        const levelFloors = BoardlockedData.initialization?.levelFloors || {};
        let changed = false;
        for (const key of questOptions) {
            const finalName = questTasks[key], baseQuest = questBaseNames[key];
            if (!finalName || !baseQuest) continue;
            const finalId = R.taskId(finalName, 'Quest', tasksMap);
            const names = Object.entries(chunkInfo.challenges?.Quest || {}).filter(([, meta]) => meta.BaseQuest === baseQuest).map(([name]) => name);
            const recorded = new Set(state.initializationTaskIds[key] || []);
            // Early v6 previews tracked only the final task. Preserve enough
            // provenance to remove exactly what that switch added.
            if (state.initializationApplied[key] && !recorded.size) recorded.add(finalId);
            if (state.initialization[key]) {
                const completed = R.completionIds(legacy(), tasksMap);
                let questChanged = false;
                for (const name of names) {
                    const id = R.taskId(name, 'Quest', tasksMap);
                    if (completed.has(id)) continue;
                    (checkedAllTasks.Quest ||= {})[name] = true;
                    recorded.add(id); completed.add(id);
                    changed = true; questChanged = true;
                }
                if (recorded.size) {
                    state.initializationTaskIds[key] = [...recorded];
                    state.initializationApplied[key] = true;
                }
                if (questChanged && journal) state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'apply_initialization_quest',
                    option: key, taskId: finalId, completedStepCount: names.length });
            } else if (state.initializationApplied[key] || recorded.size) {
                for (const id of recorded) removeCompletionId(id);
                delete state.initializationApplied[key];
                delete state.initializationTaskIds[key];
                changed = true;
                if (journal) state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'remove_initialization_quest', option: key, taskId: finalId });
            }
            for (const [skill, floor] of Object.entries(levelFloors[key] || {})) {
                const record = state.initializationLevelFloors[skill];
                if (state.initialization[key] && state.actualLevels[skill] < floor) {
                    if (!record) state.initializationLevelFloors[skill] = { option: key, previous: state.actualLevels[skill], floor };
                    state.actualLevels[skill] = floor;
                    changed = true;
                } else if (!state.initialization[key] && record?.option === key) {
                    if (state.actualLevels[skill] === record.floor) state.actualLevels[skill] = record.previous;
                    delete state.initializationLevelFloors[skill];
                    changed = true;
                }
            }
        }
        if (changed) forceUpdatePluginOutput = true;
        return changed;
    }

    function syncAssumedAccountSetup(journal = false) {
        let changed = false;
        for (const task of BoardlockedData.initialization?.assumedCompletedTasks || []) {
            const option = task.option, enabled = !option || state.initialization[option];
            const id = R.taskId(task.name, task.skill, tasksMap);
            const recorded = new Set(option ? state.initializationTaskIds[option] || [] : []);
            if (enabled) {
                if (!completedChallenges?.[task.skill]?.[task.name]) {
                    (completedChallenges[task.skill] ||= {})[task.name] = true;
                    changed = true;
                }
                if (option && !recorded.has(id)) {
                    recorded.add(id); state.initializationTaskIds[option] = [...recorded];
                    state.initializationApplied[option] = true; changed = true;
                }
            } else if (option && (state.initializationApplied[option] || recorded.size)) {
                for (const recordedId of recorded) removeCompletionId(recordedId);
                delete state.initializationApplied[option]; delete state.initializationTaskIds[option];
                changed = true;
            }
        }
        for (const entry of BoardlockedData.initialization?.assumedPrimarySkills || []) {
            const skill = typeof entry === 'string' ? entry : entry.skill;
            const option = typeof entry === 'string' ? null : entry.option;
            const enabled = !option || state.initialization[option];
            if (enabled && manualPrimary?.[skill] !== true) { manualPrimary[skill] = true; changed = true; }
            else if (!enabled && manualPrimary?.[skill] === true) { manualPrimary[skill] = false; changed = true; }
        }
        if (changed && journal) state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'sync_account_setup',
            turael: state.initialization.turael });
        if (changed) forceUpdatePluginOutput = true;
        return changed;
    }

    function notice(text) {
        message = text;
        render();
    }
    function setPanelOpen(open) {
        if (!panel) return;
        if (!open && pickingStartingTile) {
            pickingStartingTile = false;
            selectedStartingCandidate = null;
            document.body.classList.remove('bl-start-picking');
            if (typeof drawCanvas === 'function') drawCanvas();
        }
        panel.hidden = !open;
        document.getElementById('boardlocked-panel-button')?.setAttribute('aria-expanded', String(open));
    }
    function fail(err) {
        error = err.message || String(err);
        busy = false;
        console.error('Boardlocked:', err);
        render();
    }
    function writeWithBackup(primaryKey, backupKey, serialized) {
        const previous = localStorage.getItem(primaryKey);
        if (previous && previous !== serialized) {
            try { localStorage.setItem(backupKey, previous); } catch (_) { /* The primary save still has priority. */ }
        }
        localStorage.setItem(primaryKey, serialized);
    }
    function readBrowserVault() {
        recoveredBrowserBackup = false; browserVaultError = null;
        for (const [key, backup] of [[localKey(), false], [localBackupKey(), true]]) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                const payload = R.normalizeBrowserSave(parsed);
                payload.sourceStateVersion = parsed.boardlockedState?.version;
                recoveredBrowserBackup = backup;
                return payload;
            } catch (err) {
                if (/Unsupported Boardlocked state version/.test(err.message)) throw err;
                browserVaultError = err;
            }
        }
        return null;
    }
    function applyBoardlockedPreset(preserveClues = false, announce = false) {
        if (typeof applyRulePresetValues !== 'function' || !applyRulePresetValues(BOARDLOCKED_PRESET, { preserveClues })) {
            throw new Error('Boardlocked Chunker preset is unavailable');
        }
        state.rulePresetInitialized = true;
        state.rulePresetRevision = BOARDLOCKED_PRESET_REVISION;
        forceUpdatePluginOutput = true;
        if (announce) message = 'Boardlocked defaults restored. Task access is recalculating.';
    }
    function activeRulePreset() {
        const preset = typeof rulePresets === 'object' ? rulePresets[BOARDLOCKED_PRESET] : null;
        if (!preset) return 'Custom';
        return Object.keys(rules).every(key => typeof rules[key] === 'boolean' ?
            rules[key] === R.own(preset, key) : String(rules[key]) === String(preset[key] ?? rules[key])) ? 'Boardlocked defaults' : 'Custom';
    }
    function upgradeBoardlockedPreset() {
        if (!state.enabled || !state.rulePresetInitialized || state.rulePresetRevision >= BOARDLOCKED_PRESET_REVISION) return false;
        // Revision 2 adds defensive BiS to already-running Boardlocked profiles.
        // Apply this once so a player may still turn the rule off afterward.
        rules['Show Best in Slot Defensive Tasks'] = true;
        state.rulePresetRevision = BOARDLOCKED_PRESET_REVISION;
        state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'upgrade_boardlocked_rule_preset', revision: BOARDLOCKED_PRESET_REVISION });
        forceUpdatePluginOutput = true;
        return true;
    }
    function ensureMap() {
        if (!gotData) return;
        const key = storageKey();
        if (key === loadedKey) return;
        worker?.terminate(); worker = null; generation++;
        loadedKey = key; rawTasks = []; tasks = []; sections = {}; signature = ''; previousUnlocked = null;
        dataReady = false; busy = true; error = ''; message = ''; loadFailure = false;
        try {
            const saved = pendingStoredState || localStorage.getItem(key) || localStorage.getItem(legacyStorageKey());
            const storedVersion = pendingStoredVersion;
            pendingStoredState = null; pendingStoredVersion = null;
            const parsed = saved ? JSON.parse(saved) : null;
            const sourceVersion = Number.isInteger(storedVersion) ? storedVersion : parsed?.version;
            state = boardlockedState(parsed);
            // An unused pre-v6 profile is equivalent to a new account. Started
            // profiles and imported histories never gain a quest retroactively.
            if (sourceVersion < 6 && !hasStarted()) state.initialization.druidicRitual = true;
            if (!state.enablersInitialized) state = R.recoverAcquiredEnablers(state, legacy(), chunkInfo, tasksMap, BoardlockedData);
            const arrivalMigration = sourceVersion < R.VERSION ? R.migrateCurrentArrival(chunkInfo, state,
                tempChunks.unlocked || {}, manualSections, completedConnectionAllowed,
                BoardlockedData.travelConnections) : { state, changed: false, removedSections: [] };
            state = arrivalMigration.state;
            if (arrivalMigration.changed) for (const section of arrivalMigration.removedSections) {
                if (manualSections[state.currentVisit.locationId]?.[section] === true) delete manualSections[state.currentVisit.locationId][section];
            }
            const latestNoTaskVisit = state.currentVisit?.status === 'resolved' && state.currentVisit.resolution === 'no_tasks';
            const recalculatingUpdatedVisit = sourceVersion < R.VERSION && !!state.currentVisit &&
                (!R.canRoll(state) || latestNoTaskVisit);
            if (recalculatingUpdatedVisit) state = R.recalculateCurrentVisit(state,
                'Recalculated after Boardlocked rules update', undefined, { reopenNoTasks: true });
            const startSectionMigration = R.migrateStartingSections(chunkInfo, state, manualSections,
                chunkInfo.walkableChunks || [], tempChunks.blacklisted || {});
            state = startSectionMigration.state; manualSections = startSectionMigration.sections;
            if (startSectionMigration.changed) forceUpdatePluginOutput = true;
            let anchorSectionsMigrated = false;
            if (state.travelAnchorSections == null) {
                const inferred = R.inferLegacyAnchorSections(chunkInfo, state, manualSections);
                if (inferred !== null) {
                    state.travelAnchorSections = inferred;
                    anchorSectionsMigrated = true;
                    if (R.parseLocation(state.currentVisit?.locationId)?.chunkId === state.travelAnchor && state.currentVisit.arrivalSections === undefined) {
                        const arrivalMedium = !inferred.length ? 'whole' : inferred.every(section => section.startsWith('W')) ? 'water' : 'land';
                        state = R.journal(state, { ...state.currentVisit, arrivalSections: [...inferred], arrivalMedium });
                    }
                }
            }
            if (state.enabled && !state.rulePresetInitialized) applyBoardlockedPreset(true);
            const initializationChanged = !hasStarted() && syncInitializationCompletions();
            const assumedSetupChanged = syncAssumedAccountSetup();
            if (upgradeBoardlockedPreset() || initializationChanged || assumedSetupChanged || arrivalMigration.changed || startSectionMigration.changed || anchorSectionsMigrated || recoveredBrowserBackup || sourceVersion < R.VERSION ||
                (!localStorage.getItem(key) && localStorage.getItem(legacyStorageKey()))) save();
            if (recoveredBrowserBackup) message = 'Recovered the previous browser backup because the newest save could not be read. Download a backup now.';
            else if (arrivalMigration.changed) message = 'Removed a land arrival that was not connected to the ocean by a port.';
            else if (recalculatingUpdatedVisit) message = 'The active visit is being recalculated for the updated task rules.';
        } catch (err) { state = boardlockedState(); loadFailure = true; fail(new Error('Saved state was not overwritten. ' + err.message)); }
        setPanelOpen(true);
        render();
    }
    function enabled() { ensureMap(); return true; }
    function snapshotLegacy() {
        return R.copy({ tempChunks, tempSelectedChunks, rules, settings, checkedAllTasks, checkedChallenges,
            completedChallenges, manualEquipment, backlog, manualTasks, backloggedSources, manualMonsters,
            manualSections, manualAreas, slayerLocked, constructionLocked, passiveSkill, maxSkill,
            randomLoot, assignedXpRewards, altChallenges, userTasks, manualPrimary, chunkOrder });
    }
    function save() {
        if (!loadedKey || loadFailure) return;
        try {
            if (localProfile) {
                const payload = { format: 'boardlocked-browser-save', version: 1, savedAt: new Date().toISOString(),
                    boardlockedState: state, legacy: snapshotLegacy() };
                writeWithBackup(localKey(), localBackupKey(), JSON.stringify(payload));
            } else writeWithBackup(loadedKey, loadedKey + ':backup', JSON.stringify(state));
        } catch (err) { fail(new Error('Local save failed. Export this run now. ' + err.message)); }
    }
    function inputSignature() {
        return JSON.stringify([tempChunks.unlocked, rules, checkedAllTasks, checkedChallenges,
            completedChallenges, manualEquipment, backlog, manualTasks, backloggedSources, manualMonsters,
            manualSections, manualAreas, slayerLocked, constructionLocked, passiveSkill, maxSkill,
            randomLoot, assignedXpRewards, altChallenges, userTasks, manualPrimary,
            settings.optOutSections, settings.optOutSectionsWater, state.actualLevels, state.progressionHighWater,
            state.originOverrides, state.accessOverrides, state.acquiredEnablers, state.blockedBosses]);
    }
    function frontier() {
        const unlocked = tempChunks.unlocked || {};
        if (Object.keys(unlocked).length) {
            const walkable = rules.F2P ? chunkInfo.walkableChunksF2P : chunkInfo.walkableChunks || [];
            return R.deriveConnectedFrontier(chunkInfo, unlocked, walkable, tempChunks.blacklisted || {},
                BoardlockedData.travelConnections);
        }
        if (!hasStarted()) {
            startingPool = R.deriveStartingPool(chunkInfo, BoardlockedData, state.initialization, tempChunks.blacklisted || {});
            return startingPool.ids;
        }
        if (Object.keys(tempChunks.selected || {}).length) {
            return Object.keys(tempChunks.selected || {}).filter(id => {
                const coords = convertToXY(id);
                return !['NaN', 'undefined'].includes(String(tempChunks.selected[id])) &&
                    coords.x >= 0 && coords.x < rowSize && coords.y >= 0 && coords.y < fullSize / rowSize;
            });
        }
        return [];
    }
    function travelConnectionAllowed(from, to) {
        const limits = chunkInfo.sectionsLimits || {};
        for (const key of [from + ' to ' + to, to + ' to ' + from]) {
            const tasks = limits[key]?.Tasks;
            if (tasks && Object.entries(tasks).some(([taskName, category]) => !globalValids?.[category]?.hasOwnProperty(taskName))) return false;
        }
        return true;
    }
    function completedConnectionAllowed(from, to) {
        const done = R.completionIds(legacy(), tasksMap), limits = chunkInfo.sectionsLimits || {};
        for (const key of [from + ' to ' + to, to + ' to ' + from]) {
            const requirements = limits[key]?.Tasks;
            if (requirements && Object.entries(requirements).some(([taskName, category]) =>
                !done.has(taskName) && !done.has(R.taskId(taskName, category, tasksMap)))) return false;
        }
        return true;
    }
    function rebuild() {
        if (catalogData !== chunkInfo) { catalogData = chunkInfo; catalog = R.buildTaskCatalog(chunkInfo, tasksMap); }
        state = R.reconcileProgression(state, catalog, legacy(), tasksMap);
        const oldDormant = new Set(pool.dormant);
        tasks = R.adaptTasks(rawTasks, legacy(), state, tempChunks.unlocked || {}, sections, manualSections, catalog, tasksMap);
        const previousCandidateCount = state.currentVisit?.candidateTaskIds?.length || 0;
        state = R.addCatchUpTasksToCurrentVisit(state, tasks);
        const catchUpAdded = (state.currentVisit?.candidateTaskIds?.length || 0) > previousCandidateCount;
        const completed = R.completionIds(legacy(), tasksMap);
        tasks.filter(t => t.completed).forEach(t => completed.add(t.taskId));
        state = R.resolveVisit(state, completed);
        const unlocked = tempChunks.unlocked || {}, boundary = frontier();
        state.travelAnchor = R.inferTravelAnchor(state, unlocked, chunkOrder);
        travelGraph = R.buildTravelGraph(chunkInfo, unlocked, sections, boundary, travelConnectionAllowed,
            BoardlockedData.travelConnections);
        pool = R.derivePool(boundary, unlocked, tasks, state.currentVisit, travelGraph, state.travelAnchor, state.travelAnchorSections);
        if (selectedStartingCandidate && !pool.candidates.some(candidate => candidate.kind === 'frontier' &&
            candidate.locationId === selectedStartingCandidate.locationId)) selectedStartingCandidate = null;
        if (hasStarted()) syncDisplayedFrontier(pool.candidates.filter(candidate => candidate.kind === 'frontier')
            .map(candidate => candidate.locationId));
        else syncDisplayedFrontier([]);
        const woke = pool.live.filter(id => oldDormant.has(id) && id !== state.currentVisit?.locationId);
        if (dataReady && woke.length && !/^(Run imported|Added unlocked chunks)/.test(message)) {
            message = woke.join(', ') + ' now has available tasks and can be rolled again.';
        } else if (dataReady && catchUpAdded) {
            message = 'Your current level unlocked a new skill-task alternative for this visit.';
        }
    }
    function invalidate() {
        ensureMap();
        if (!state.enabled) return;
        clearTimeout(timer); timer = null;
        generation++; worker?.terminate(); worker = null; busy = true; slayerConfirmation = null;
        render();
    }
    function calculate(request) {
        ensureMap();
        if (!state.enabled) return;
        invalidate();
        error = ''; signature = inputSignature();
        const requestId = generation;
        // Imported histories may omit derived section state. Starting from only
        // explicitly proven sections prevents an unlocked land route from
        // silently opening a parallel water route (or the reverse).
        const strictSections = R.inferConnectedSections(chunkInfo, tempChunks.unlocked || {},
            request.manualSections || {}, completedConnectionAllowed, BoardlockedData.travelConnections);
        for (const [key, allowed] of Object.entries(state.accessOverrides)) if (key.startsWith('section:') && allowed === false) {
            const parsed = R.parseLocation(key.slice(8));
            if (parsed?.sectionId) (strictSections[parsed.chunkId] ||= {})[parsed.sectionId] = false;
        }
        worker = new Worker('./worker.js?v=6.9.66-bl32');
        worker.onerror = event => { if (requestId === generation) fail(new Error(event.message || 'Strict worker failed')); };
        worker.onmessage = event => {
            if (requestId !== generation || !state.enabled) return;
            const result = event.data;
            if (result.type === 'error') { fail(result.err); return; }
            if (result.type !== 'boardlocked' || result.requestId !== requestId) return;
            rawTasks = result.tasks; sections = result.sections;
            enablerCatalog = result.enablerCatalog || []; enablerAmbiguities = result.enablerAmbiguities || [];
            slayerMasterCatalog = result.slayerMasters || [];
            diagnostics = result.accessDiagnostics; sourceCounts = result.sourceCounts;
            busy = false;
            rebuild();
            slayerConfirmation = R.slayerMasterConfirmationForVisit(tasks, state.currentVisit);
            if (!slayerConfirmation) state = R.snapshotVisit(state, tasks);
            pool.current = state.travelAnchor;
            dataReady = true;
            save(); render(); drawCanvas();
            worker?.terminate(); worker = null;
        };
        worker.postMessage({ ...request, requestId, manualSections: strictSections,
            boardlocked: { state: { actualLevels: state.actualLevels, progressionHighWater: state.progressionHighWater,
                    originOverrides: state.originOverrides,
                    accessOverrides: state.accessOverrides, acquiredEnablers: state.acquiredEnablers,
                    slayerMasters: state.slayerMasters, blockedBosses: state.blockedBosses },
                checkedAllTasks, tasksMap, unlocked: tempChunks.unlocked || {} } });
        render();
    }
    function schedule() {
        if (!state.enabled || !gotData) return;
        invalidate();
        timer = setTimeout(() => {
            timer = null;
            // Reuse the normal section chooser, then run both global calculations.
            calcCurrentChallengesCanvas(true, true);
            if (!globalSectionsValid) { setPanelOpen(false); notice('Choose the accessible sections to finish setting up your unlocked chunks.'); }
        }, 250);
    }
    function onLegacyChange() {
        if (!gotData) return;
        ensureMap();
        if (!state.enabled) { if (localProfile) save(); return; }
        const unlocked = Object.keys(tempChunks.unlocked || {});
        if (previousUnlocked) {
            const added = unlocked.filter(id => !previousUnlocked.includes(id));
            const removed = previousUnlocked.filter(id => !unlocked.includes(id));
            for (const id of added) if (!(state.currentVisit?.kind === 'new' && state.currentVisit.locationId === id)) {
                state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'manual_unlock', locationId: id });
            }
            for (const id of removed) state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'manual_relock', locationId: id });
            if (removed.includes(state.currentVisit?.locationId) && !R.canRoll(state)) message = 'Your current tile was removed from the map, but its task is still active. Use Void / recalculate current visit to continue.';
        }
        previousUnlocked = unlocked;
        // Also covers completion from legacy panels, source/area edits and equipment.
        const next = inputSignature();
        rebuild();
        if (next !== signature) { signature = next; save(); schedule(); }
        else save();
        render();
    }
    function roll() {
        if (!canEdit()) return notice('Unlock this map or enter Sandbox Mode to roll.');
        if (!state.enabled) return;
        if (busy || error || !dataReady) return notice('Still checking tasks and routes. Try again in a moment.');
        rebuild();
        if (!R.canRoll(state)) return notice('Complete one of the current visit tasks, or use Void / recalculate current visit.');
        const candidate = !hasStarted() ? R.chooseStartingCandidate(pool.candidates, startingPool) : R.chooseCandidate(pool.candidates);
        if (!candidate) return notice('There is nowhere to roll from this tile. Check its open routes, tasks, and blacklisted tiles.');
        pickingStartingTile = false;
        selectedStartingCandidate = null;
        begin(candidate);
    }
    function startPickingTile() {
        if (!canEdit()) return notice('Unlock this map or enter Sandbox Mode to pick a starting tile.');
        if (hasStarted()) return notice('A starting tile has already been chosen.');
        if (busy || error || !dataReady) return notice('Still checking starting tiles. Try again in a moment.');
        rebuild();
        if (!pool.candidates.some(candidate => candidate.kind === 'frontier')) return notice('There are no starting tiles available.');
        pickingStartingTile = true;
        selectedStartingCandidate = null;
        message = '';
        render(); drawCanvas();
    }
    function cancelPickingTile() {
        pickingStartingTile = false;
        selectedStartingCandidate = null;
        message = '';
        render(); drawCanvas();
    }
    function handleStartingTileClick(locationId) {
        if (!pickingStartingTile || hasStarted()) return false;
        if (busy || error || !dataReady) {
            notice('Still checking starting tiles. Try again in a moment.');
            return true;
        }
        rebuild();
        const id = String(locationId);
        const candidate = pool.candidates.find(entry => entry.kind === 'frontier' && entry.locationId === id);
        if (!candidate || !startingPool.ids.includes(id)) {
            notice('Choose one of the highlighted starting tiles.');
            return true;
        }
        selectedStartingCandidate = R.chooseStartingCandidate([candidate], startingPool);
        message = '';
        render(); drawCanvas();
        return true;
    }
    function confirmStartingTile() {
        if (!pickingStartingTile || hasStarted() || !selectedStartingCandidate) return;
        if (!canEdit()) return notice('Unlock this map or enter Sandbox Mode to start.');
        if (busy || error || !dataReady) return notice('Still checking starting tiles. Try again in a moment.');
        const selected = selectedStartingCandidate;
        rebuild();
        const current = pool.candidates.find(candidate => candidate.kind === 'frontier' &&
            candidate.locationId === selected.locationId);
        if (!current || !startingPool.ids.includes(current.locationId)) {
            selectedStartingCandidate = null;
            notice('That tile is no longer available. Choose another marked tile.');
            drawCanvas();
            return;
        }
        const candidate = { ...current, metadata: { ...(current.metadata || {}), ...(selected.metadata || {}) } };
        pickingStartingTile = false;
        selectedStartingCandidate = null;
        begin(candidate);
    }
    function begin(candidate) {
        setPanelOpen(true);
        const firstRoll = !hasStarted();
        state = R.startVisit(state, candidate, label(candidate.locationId));
        if (candidate.kind === 'frontier') {
            const id = candidate.locationId;
            tempChunks.unlocked ||= {};
            tempChunks.unlocked[id] = id;
            delete (tempChunks.selected || {})[id];
            tempSelectedChunks = tempSelectedChunks.filter(value => value !== id);
            if (settings.chunkNeighboursOptions?.neighbors) selectNeighborsCanvas(Number(id));
            if (settings.chunkNeighboursOptions?.remove) { tempChunks.selected = {}; tempSelectedChunks = []; }
            const arrivalSections = state.currentVisit?.arrivalSections || [];
            for (const arrivalSection of arrivalSections) (manualSections[id] ||= {})[arrivalSection] = true;
            if (arrivalSections.length) {
                state.adminHistory.push({ timestamp: new Date().toISOString(),
                    action: firstRoll ? 'set_starting_sections' : 'set_arrival_sections',
                    locationId: id, sectionIds: [...arrivalSections], medium: state.currentVisit.arrivalMedium });
            }
            // Only new geography enters the original unlock history/highscore path.
            setRecentRoll(id);
        }
        // A revisit only touches this journal, never selected/unlocked/neighbors.
        message = ''; save();
        scrollToChunkCanvas(candidate.locationId);
        if (candidate.kind === 'frontier') calcCurrentChallengesCanvas(true, true);
        else calculate(currentWorkerRequest());
        setData(); render();
    }
    function adminVisit() {
        if (!canEdit() || busy || error) return;
        if (!R.canRoll(state)) return notice('Void the unresolved visit before setting another current location.');
        const location = panel.querySelector('#bl-admin-location').value.trim();
        const parsed = R.parseLocation(location);
        if (!parsed || !R.own(tempChunks.unlocked, parsed.chunkId)) return notice('Choose an already-unlocked chunk or chunk-section ID.');
        if (parsed.sectionId && !R.own(chunkInfo.sections?.[parsed.chunkId] || {}, parsed.sectionId)) {
            return notice('That section does not exist in this chunk.');
        }
        const inferred = parsed.sectionId ? [parsed.sectionId] : R.inferLegacyAnchorSections(chunkInfo,
            { ...state, travelAnchor: parsed.chunkId, travelAnchorSections: null, currentVisit: null }, manualSections);
        begin({ kind: 'admin', locationId: parsed.chunkId,
            metadata: { entrySections: inferred || [] } });
    }
    function setAnchor() {
        if (!canEdit() || busy || error) return;
        if (!R.canRoll(state)) return notice('Complete or void the unresolved visit before changing the current tile.');
        const location = panel.querySelector('#bl-admin-location').value.trim();
        const parsed = R.parseLocation(location);
        if (!parsed || !R.own(tempChunks.unlocked, parsed.chunkId)) return notice('Choose an already-unlocked chunk or chunk-section ID.');
        if (parsed.sectionId && !R.own(chunkInfo.sections?.[parsed.chunkId] || {}, parsed.sectionId)) {
            return notice('That section does not exist in this chunk.');
        }
        state = R.setTravelAnchor(state, location, 'Set from Run setup');
        if (state.travelAnchorSections == null) {
            state.travelAnchorSections = R.inferLegacyAnchorSections(chunkInfo, state, manualSections);
        }
        message = 'Current tile set to ' + parsed.chunkId + (parsed.sectionId ? ' section ' + parsed.sectionId : '') +
            '. Reachable encounters and free paths were recalculated.';
        save(); rebuild(); render(); drawCanvas(); scrollToChunkCanvas(parsed.chunkId);
    }
    function voidCurrent() {
        if (!canEdit() || R.canRoll(state)) return;
        if (!confirm('Void this visit and recalculate its tasks? No task will be marked complete.')) return;
        state = R.voidVisit(state, 'Voided by player; recalculated for future visits');
        save(); schedule();
    }
    function allowRelock(id) {
        if (String(id) === state.currentVisit?.locationId && !R.canRoll(state)) {
            notice('Void the current visit before re-locking its chunk.'); return false;
        }
        return confirm('Re-lock chunk ' + id + '? It will be removed from this run’s unlocked map.');
    }
    function complete(task, checked) {
        if (!canEdit()) return;
        if (isInitializationTask(task.taskId)) return notice('Account-setup quest steps stay completed for this run.');
        const target = task.skill === 'BiS' ? completedChallenges : checkedAllTasks;
        // Clear duplicate legacy representations when unchecking this exact atomic ID.
        if (!checked) {
            for (const store of [checkedAllTasks, checkedChallenges, completedChallenges]) {
                for (const category of Object.keys(store)) for (const name of Object.keys(store[category])) {
                    if (name === task.taskId || R.taskId(name, category, tasksMap) === task.taskId) delete store[category][name];
                }
            }
            if (task.equipmentName && manualEquipment[task.equipmentName]) delete manualEquipment[task.equipmentName];
            if (task.taskClass === 'enabler' && task.enablerItemKey) delete state.acquiredEnablers[task.enablerItemKey];
        } else {
            (target[task.skill] ||= {})[task.taskClass === 'enabler' ? task.taskId : task.name] = true;
            if (R.SKILLS.includes(task.skill) && Number.isFinite(task.level)) {
                state.actualLevels[task.skill] = Math.max(state.actualLevels[task.skill] || 1, task.level);
            }
            if (Number.isFinite(task.slayerProgression?.requiredLevel)) {
                state.actualLevels.Slayer = Math.max(state.actualLevels.Slayer || 1, task.slayerProgression.requiredLevel);
            }
            for (const itemKey of task.provesAcquiredItemKeys || []) if (!R.own(state.acquiredEnablers, itemKey)) {
                const visitOrigin = (task.activeOrigins || task.origins || []).find(origin => origin.chunkId === state.currentVisit?.locationId) ||
                    (task.activeOrigins || task.origins || [])[0] || null;
                state.acquiredEnablers[itemKey] = { acquiredAt: new Date().toISOString(), manual: false,
                    evidenceTaskId: task.taskId, evidenceTaskName: task.name, source: visitOrigin };
            }
            state.enablersInitialized = true;
        }
        forceUpdatePluginOutput = true;
        onLegacyChange(); setData();
    }

    function removeEnabler(itemKey) {
        if (!canEdit()) return;
        delete state.acquiredEnablers[itemKey];
        const id = R.enablerTaskId(itemKey);
        for (const store of [checkedAllTasks, checkedChallenges, completedChallenges]) {
            for (const category of Object.keys(store)) if (store[category]) delete store[category][id];
        }
        state.enablersInitialized = true;
        state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'remove_acquired_enabler', itemKey });
        forceUpdatePluginOutput = true; save(); schedule(); render(); setData();
    }

    function addEnabler() {
        if (!canEdit()) return;
        const select = document.getElementById('bl-enabler-select'), itemKey = select?.value;
        if (!itemKey || R.own(state.acquiredEnablers, itemKey)) return;
        state.acquiredEnablers[itemKey] = { acquiredAt: new Date().toISOString(), manual: true,
            evidence: 'Added manually', source: null };
        state.enablersInitialized = true;
        state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'add_acquired_enabler', itemKey });
        forceUpdatePluginOutput = true; save(); schedule(); render(); setData();
    }
    function backlogTask(task) {
        if (!canEdit()) return;
        if (R.isBacklogged(task, legacy())) {
            for (const category of Object.keys(backlog)) for (const name of Object.keys(backlog[category])) {
                if (name === task.taskId || R.taskId(name, category, tasksMap) === task.taskId) delete backlog[category][name];
            }
        }
        else (backlog[task.skill] ||= {})[task.name] = 'Backlogged in Boardlocked Visit panel';
        onLegacyChange(); setData();
    }

    function deferBoss(boss) {
        if (!canEdit() || busy || !boss || state.blockedBosses?.[boss]) return;
        state = R.setBossBlocked(state, boss, true);
        state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'defer_boss', boss });
        if (state.currentVisit && !R.canRoll(state)) state = R.recalculateCurrentVisit(state,
            'Player deferred ' + boss + ' until their gear is ready');
        message = boss + ' tasks hidden. Restore them under “Bosses waiting for better gear”.';
        save(); schedule(); render();
        const waiting = document.getElementById('bl-blocked-boss-summary')?.parentElement;
        if (waiting) waiting.open = true;
    }

    function bossHasTasksAtCurrentVisit(boss) {
        const visit = state.currentVisit;
        if (!visit) return false;
        const arrivalSections = new Set(visit.arrivalSections || []);
        return tasks.some(task => (task.bossSources || []).includes(boss) && (task.origins || []).some(origin =>
            origin.sourceType === 'monsters' && origin.sourceName === boss && origin.chunkId === visit.locationId &&
            (!arrivalSections.size || !origin.sectionId || arrivalSections.has(origin.sectionId))));
    }

    function reactivateBoss(boss) {
        if (!canEdit() || busy || !boss || !state.blockedBosses?.[boss]) return;
        const restoreCurrentVisit = bossHasTasksAtCurrentVisit(boss) && state.currentVisit &&
            (!R.canRoll(state) || state.currentVisit.resolution === 'no_tasks');
        state = R.setBossBlocked(state, boss, false);
        state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'reactivate_boss', boss });
        if (restoreCurrentVisit) state = R.recalculateCurrentVisit(state,
            'Player reactivated ' + boss, undefined, { reopenNoTasks: true });
        message = restoreCurrentVisit ? boss + ' tasks are being restored to this visit.' :
            boss + ' tasks are eligible again for future visits.';
        save(); schedule(); render();
    }

    function addUnlocked() {
        if (!canEdit()) return;
        if (isPicking) return notice('Finish the existing draft before setting up unlocked chunks.');
        try {
            const locations = R.parseUnlockedLocations(document.getElementById('bl-setup-chunks').value, chunkInfo);
            const ids = [...new Set(locations.map(o => o.chunkId))];
            const added = ids.filter(id => !R.own(tempChunks.unlocked, id));
            tempChunks.unlocked ||= {};
            const ordered = new Set(Object.values(chunkOrder).map(String));
            let time = Math.max(Date.now(), ...Object.keys(chunkOrder).map(Number).filter(Number.isFinite)) + 1;
            for (const id of ids) {
                tempChunks.unlocked[id] = id;
                delete (tempChunks.selected || {})[id];
                delete (tempChunks.potential || {})[id];
                delete (tempChunks.blacklisted || {})[id];
                if (!ordered.has(id)) chunkOrder[time++] = Number(id);
            }
            for (const location of locations) if (location.sectionId) {
                (manualSections[location.chunkId] ||= {})[location.sectionId] = true;
            }
            tempSelectedChunks = tempSelectedChunks.filter(id => !ids.includes(String(id)));
            if (settings.chunkNeighboursOptions?.neighbors) added.forEach(id => selectNeighborsCanvas(Number(id)));
            sortSelectedChunks();
            setupLocations = ids;
            state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'setup_unlocked_chunks', locationIds: ids });
            if (!state.travelAnchor) {
                state.travelAnchor = R.inferTravelAnchor(state, tempChunks.unlocked, chunkOrder);
                state.travelAnchorSections = R.inferLegacyAnchorSections(chunkInfo, state, manualSections);
            }
            notice('Added unlocked chunks. Task calculation will mark each one as an encounter or a free travel tile.');
            setData(); save(); schedule(); render(); centerCanvas('quick');
        } catch (err) { notice('Chunks were not added: ' + err.message); }
    }
    function syncDisplayedFrontier(ids) {
        tempSelectedChunks = [...new Set(ids.map(String))];
        tempChunks.selected = Object.fromEntries(tempSelectedChunks.map((id, index) => [id, index + 1]));
    }
    function rebuildImportedFrontier() {
        const walkable = rules.F2P ? chunkInfo.walkableChunksF2P : chunkInfo.walkableChunks || [];
        syncDisplayedFrontier(R.deriveConnectedFrontier(chunkInfo, tempChunks.unlocked || {}, walkable,
            tempChunks.blacklisted || {}, BoardlockedData.travelConnections));
    }
    function resetRun() {
        if (!localProfile || !canEdit()) return;
        if (!confirm('Reset this map and run completely?\n\nThis clears every unlocked/selected chunk, accessible section, completed task, equipment record, skill level, rule/setting, backlog, override, and all visit/unlock/setup history.\n\nYou will restart with an empty map and the new-account options. Turael and Druidic Ritual are recommended by default but can be unchecked before the first roll. Other runs are untouched.')) return;
        try {
            // Delete only this named profile's current, backup, and compatibility
            // records. Reload reinitializes all globals and workers.
            for (const key of [localKey(), localBackupKey(), legacyLocalKey(), storageKey(), storageKey() + ':backup',
                legacyStorageKey(), legacyStorageKey() + ':backup']) localStorage.removeItem(key);
            generation++; worker?.terminate(); clearTimeout(timer);
            window.location.reload();
        } catch (err) { fail(new Error('Could not reset this local run: ' + err.message)); }
    }
    function setInitializationOption(key, checked) {
        if (!canEdit() || hasStarted() || !R.own(state.initialization, key)) return;
        selectedStartingCandidate = null;
        state.initialization[key] = checked;
        const questChanged = syncInitializationCompletions(true);
        const setupChanged = syncAssumedAccountSetup(true);
        state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'set_start_option', option: key, enabled: checked });
        message = ({ turael: 'Turael setup', druidicRitual: 'Druidic Ritual setup', varlamore: 'Varlamore starts',
            wilderness: 'Wilderness starts' })[key] + (checked ? ' enabled.' : ' disabled.');
        save(); rebuild(); render(); drawCanvas();
        if (questChanged || setupChanged) schedule();
    }
    function renderPastTasks() {
        const container = document.getElementById('bl-past-tasks');
        if (!container) return;
        container.replaceChildren();
        const query = document.getElementById('bl-past-search').value.trim().toLowerCase();
        if (query.length < 2) return;
        const matches = catalog.filter(t => (t.displayName + ' ' + t.skill + ' ' + t.taskId).toLowerCase().includes(query));
        for (const task of matches.slice(0, 30)) {
            const row = element('label', null, { className: 'bl-past-task' });
            const check = element('input', null, { type: 'checkbox', 'aria-label': 'Already completed ' + task.displayName });
            const initialized = isInitializationTask(task.taskId);
            check.checked = R.isComplete(task, legacy(), state); check.disabled = !canEdit() || initialized;
            check.onchange = () => complete(task, check.checked);
            row.append(check, element('span', task.skill + (task.level ? ' [' + task.level + ']' : '') + ' · ' + task.displayName +
                (initialized ? ' · Account setup' : '')));
            container.append(row);
        }
        if (matches.length > 30) container.append(element('p', 'Showing 30 matches. Narrow your search.'));
    }
    function element(tag, text, attrs = {}) {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        for (const [key, val] of Object.entries(attrs)) {
            if (key === 'className') node.className = val;
            else if (key === 'onclick') node.addEventListener('click', val);
            else node.setAttribute(key, val);
        }
        return node;
    }
    const button = (text, action) => element('button', text, { type: 'button', onclick: action });
    function inspectTask(task) {
        const debug = document.getElementById('bl-debug');
        debug.textContent = JSON.stringify(task, null, 2);
        for (let parent = debug.parentElement; parent && parent !== panel; parent = parent.parentElement) {
            if (parent.tagName === 'DETAILS') parent.open = true;
        }
        debug.scrollIntoView({ block: 'nearest' });
    }
    function taskList(container, list, snapshot = false) {
        let lastCategory;
        const arrivalSections = new Set(state.currentVisit?.arrivalSections || []);
        const bossGroup = task => {
            if (!snapshot) return [];
            const bosses = (task.bossSources || []).filter(boss => !state.blockedBosses?.[boss]);
            if (!(task.activeOrigins || []).length) return bosses;
            return bosses.filter(boss => task.activeOrigins.some(origin => origin.sourceType === 'monsters' &&
                origin.sourceName === boss && origin.chunkId === state.currentVisit?.locationId &&
                (!arrivalSections.size || !origin.sectionId || arrivalSections.has(origin.sectionId))));
        };
        const group = task => bossGroup(task).join(' / ') || (snapshot && task.slayerTrainingAlternative ? 'Slayer training' : task.skill);
        for (const task of list.slice().sort((a, b) => Number(!bossGroup(a).length) - Number(!bossGroup(b).length) ||
            group(a).localeCompare(group(b)) || (a.level || 0) - (b.level || 0) || a.displayName.localeCompare(b.displayName))) {
            const category = group(task);
            if (lastCategory !== category) {
                const bosses = bossGroup(task);
                if (bosses.length) {
                    const heading = element('div', null, { className: 'bl-boss-heading' });
                    heading.append(element('h4', category));
                    for (const boss of bosses) {
                        const defer = element('button', bosses.length === 1 ? "I can't defeat this boss with my current gear" :
                            "I can't defeat " + boss + ' with my current gear',
                            { type: 'button', className: 'bl-boss-defer', onclick: () => deferBoss(boss) });
                        defer.setAttribute('aria-label', "I can't defeat " + boss + ' with my current gear');
                        defer.title = 'Hide these boss tasks until you reactivate them';
                        defer.disabled = !canEdit() || busy; heading.append(defer);
                    }
                    container.append(heading);
                } else {
                    container.append(element('h4', category));
                    if (category === 'Slayer training') container.append(element('small',
                        'Any listed drop obtained while training assignments from your reachable Slayer masters completes this visit.'));
                }
                lastCategory = category;
            }
            const row = element('div', null, { className: 'bl-task' });
            const checkLabel = element('label');
            const checkbox = element('input', null, { type: 'checkbox', 'aria-label': 'Complete ' + task.displayName });
            checkbox.checked = task.completed;
            checkbox.disabled = !canEdit() || (busy && !snapshot) || isInitializationTask(task.taskId);
            checkbox.addEventListener('change', () => complete(task, checkbox.checked));
            checkLabel.append(checkbox, element('span', (task.level ? '[' + task.level + '] ' : '') + task.displayName));
            row.append(checkLabel);
            if (!task.eligible) row.append(element('small', task.eligibilityReason || (task.completed ? 'Completed' : 'No longer eligible')));
            const tools = element('details', null, { className: 'bl-task-tools' });
            tools.append(element('summary', 'Details & options'));
            tools.append(element('pre', JSON.stringify({
                stableTaskId: task.taskId,
                taskClass: task.taskClass || 'unknown',
                owningSkill: task.skill,
                owningCategory: task.category,
                taskLevel: task.level,
                sourceCategories: task.sourceCategories || [],
                classificationReason: task.classificationReason || '',
                bisReason: task.bisReason || null,
                bisSet: task.bisSet || null,
                advancesSkillProgression: !!task.advancesSkillProgression,
                progressionHighWater: task.progressionHighWater,
                progressionCeiling: task.progressionCeiling,
                bossSources: task.bossSources || [],
                blockedBossSources: task.blockedBossSources || [],
                bossDeferred: !!task.bossDeferred,
                origins: task.origins || [],
                enablers: task.enablers || [],
                enablerItemKey: task.enablerItemKey || null,
                capabilities: task.capabilities || [],
                provesAcquiredItemKeys: task.provesAcquiredItemKeys || [],
                skillingBis: task.skillingBis || null,
                accessResult: task.accessResult || null,
                eligible: !!task.eligible,
                eligibilityReason: task.eligibilityReason || '',
                whyWouldBeIneligible: task.whyWouldBeIneligible || [],
                progressionRole: task.advancesSkillProgression ? 'rolling-level-progression' : 'independent'
            }, null, 2), { className: 'bl-task-debug' }));
            tools.append(button('Inspect', () => inspectTask(task)));
            if (chunkInfo.challenges?.[task.skill]?.[task.name]) tools.append(button('Details', () => {
                setPanelOpen(false);
                showDetails(encodeRFC5987ValueChars(task.name), task.skill, '');
            }));
            const backlogButton = button(task.backlogged ? 'Unbacklog' : 'Backlog', () => backlogTask(task));
            backlogButton.disabled = !canEdit(); tools.append(backlogButton);
            row.append(tools); container.append(row);
        }
    }
    function renderEnablers() {
        const summary = document.getElementById('bl-enabler-summary'), acquiredList = document.getElementById('bl-enabler-list');
        const select = document.getElementById('bl-enabler-select'), ambiguityList = document.getElementById('bl-enabler-ambiguities');
        if (!summary || !acquiredList || !select) return;
        const acquiredKeys = Object.keys(state.acquiredEnablers).sort((a, b) => a.localeCompare(b));
        summary.textContent = 'Acquired tools (' + acquiredKeys.length + ')';
        acquiredList.replaceChildren();
        const byItem = new Map(enablerCatalog.map(item => [item.itemKey, item]));
        for (const itemKey of acquiredKeys) {
            const item = byItem.get(itemKey), acquisition = state.acquiredEnablers[itemKey] || {};
            const row = element('div', null, { className: 'bl-enabler-record' });
            const capabilities = item?.capabilities?.map(capability => capability.label).join(', ') || 'Uses not listed';
            const source = acquisition.source ? [acquisition.source.sourceType, acquisition.source.sourceName,
                acquisition.source.chunkId + (acquisition.source.sectionId ? '-' + acquisition.source.sectionId : '')].filter(Boolean).join(' · ') :
                acquisition.manual ? 'Added manually' : acquisition.evidence || 'Recovered from completed tasks';
            row.append(element('strong', itemKey), element('small', capabilities + ' · ' + source));
            const remove = button('Remove', () => removeEnabler(itemKey)); remove.disabled = !canEdit(); row.append(remove);
            acquiredList.append(row);
        }
        if (!acquiredKeys.length) acquiredList.append(element('p', 'No reusable tools recorded yet.'));
        const previous = select.value; select.replaceChildren(element('option', 'Choose a known reusable item…', { value: '' }));
        for (const item of enablerCatalog.filter(item => !R.own(state.acquiredEnablers, item.itemKey))) {
            const capability = item.capabilities.map(entry => entry.label).join(', ');
            select.append(element('option', item.itemKey + (capability ? ' — ' + capability : ''), { value: item.itemKey }));
        }
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
        document.getElementById('bl-add-enabler').disabled = !canEdit() || !select.value;
        if (ambiguityList) {
            ambiguityList.replaceChildren();
            for (const ambiguity of enablerAmbiguities) {
                const row = element('details');
                row.append(element('summary', ambiguity.requirement), element('pre', JSON.stringify(ambiguity, null, 2)));
                ambiguityList.append(row);
            }
            if (!enablerAmbiguities.length) ambiguityList.append(element('p', 'No unclear tool requirements.'));
        }
    }
    function changeSlayerMasters(records, status, action) {
        const names = [...new Set(records.map(record => record.master).filter(Boolean))];
        if (!canEdit() || !names.length) return;
        for (const master of names) state = R.setSlayerMasterState(state, master, status);
        state.adminHistory.push({ timestamp: new Date().toISOString(), action,
            masters: names, status });
        message = status === 'usable' ? names.join(', ') + (names.length === 1 ? ' is' : ' are') + ' now available for Slayer routes.' :
            names.join(', ') + (names.length === 1 ? ' is' : ' are') + ' deferred until you can use the master.';
        save(); schedule();
    }
    function answerSlayerMaster(canUse) {
        if (!slayerConfirmation) return;
        if (canUse) {
            const targets = slayerMasterCatalog.filter(master => master.requiredCombat <= slayerConfirmation.requiredCombat &&
                master.requiredCombat > 3 && master.status !== 'usable');
            changeSlayerMasters(targets.length ? targets : [slayerConfirmation], 'usable', 'confirm_slayer_master');
        } else {
            // Failing the lowest relevant Combat check also answers every
            // currently reachable higher check, preventing a second prompt.
            const targets = slayerMasterCatalog.filter(master => master.reachable && master.status === 'unknown' &&
                master.requiredCombat >= slayerConfirmation.requiredCombat);
            changeSlayerMasters(targets.length ? targets : [slayerConfirmation], 'pending', 'defer_slayer_master');
        }
    }
    function activateSlayerMaster(master) {
        const selected = slayerMasterCatalog.find(record => record.master === master) ||
            { master, requiredCombat: Number.MAX_SAFE_INTEGER };
        const targets = slayerMasterCatalog.filter(record => record.requiredCombat <= selected.requiredCombat &&
            record.requiredCombat > 3 && record.status !== 'usable');
        changeSlayerMasters(targets.length ? targets : [selected], 'usable', 'activate_slayer_master');
    }
    function renderSlayerMasters() {
        const summary = document.getElementById('bl-slayer-master-summary');
        const list = document.getElementById('bl-slayer-masters');
        if (!summary || !list) return;
        const pending = Object.entries(state.slayerMasters || {}).filter(([, status]) => status === 'pending')
            .map(([master]) => slayerMasterCatalog.find(record => record.master === master) || { master, requiredCombat: null })
            .sort((left, right) => (left.requiredCombat || Infinity) - (right.requiredCombat || Infinity) || left.master.localeCompare(right.master));
        summary.textContent = 'Slayer masters' + (pending.length ? ' (' + pending.length + ' pending)' : '');
        list.replaceChildren();
        for (const record of pending) {
            const row = element('div', null, { className: 'bl-enabler-record' });
            row.append(element('strong', record.master), element('small', record.requiredCombat ? 'Requires ' + record.requiredCombat + ' Combat' : 'Marked unavailable'));
            const activate = button('I can use ' + record.master + ' now', () => activateSlayerMaster(record.master));
            activate.disabled = !canEdit() || busy; row.append(activate); list.append(row);
        }
        if (!pending.length) list.append(element('p', 'No Slayer masters are waiting for confirmation.'));
    }
    function renderBlockedBosses() {
        const summary = document.getElementById('bl-blocked-boss-summary');
        const list = document.getElementById('bl-blocked-bosses');
        if (!summary || !list) return;
        const bosses = Object.keys(state.blockedBosses || {}).sort((a, b) => a.localeCompare(b));
        summary.parentElement.hidden = !bosses.length;
        summary.textContent = 'Bosses waiting for better gear' + (bosses.length ? ' (' + bosses.length + ')' : '');
        list.replaceChildren();
        for (const boss of bosses) {
            const row = element('div', null, { className: 'bl-enabler-record' });
            row.append(element('strong', boss), element('small', 'Its goals are hidden.'));
            const reactivate = button('I am ready to fight this boss', () => reactivateBoss(boss));
            reactivate.disabled = !canEdit() || busy; row.append(reactivate); list.append(row);
        }
        if (!bosses.length) list.append(element('p', 'No bosses are waiting.'));
    }
    function render() {
        if (!panel) return;
        document.body.classList.add('bl-enabled');
        document.getElementById('bl-storage-label').textContent = localProfile ? 'Run: ' + localProfile + ' · auto-saved in this browser' : 'Run: ' + (mid || '');
        document.getElementById('bl-message').textContent = error || message;
        document.getElementById('bl-message').classList.toggle('bl-error', !!error);
        document.getElementById('bl-reset').hidden = !localProfile;
        document.getElementById('bl-reset').disabled = !canEdit();
        document.getElementById('bl-preset-status').textContent = 'Rules: ' + activeRulePreset();
        const started = hasStarted();
        if (started) { pickingStartingTile = false; selectedStartingCandidate = null; }
        document.body.classList.toggle('bl-start-picking', pickingStartingTile && !started);
        const startSetup = document.getElementById('bl-start-setup');
        startSetup.hidden = started;
        document.getElementById('bl-mode-content').hidden = !started;
        for (const key of Object.keys(state.initialization)) {
            const input = document.getElementById('bl-start-' + key);
            if (input) { input.checked = state.initialization[key]; input.disabled = !canEdit() || busy; }
        }
        if (localProfile || state.enabled) {
            unlockedChunks = Object.keys(tempChunks.unlocked || {}).length;
            selectedChunks = pool.candidates.filter(candidate => candidate.kind === 'frontier').length;
            const boundaryLabel = unlockedChunks ? 'Rollable tiles' : 'Starting tiles';
            $('#chunkInfo1').text('Unlocked chunks: ' + unlockedChunks);
            $('#chunkInfo2').text(boundaryLabel + ': ' + selectedChunks);
        }
        document.getElementById('bl-sections').hidden = !busy || globalSectionsValid;
        renderEnablers();
        renderSlayerMasters();
        renderBlockedBosses();
        document.getElementById('bl-setup-status').textContent = setupLocations.map(id => id + ': ' + (busy ? 'calculating' : pool.live.includes(id) ?
            'encounter (' + pool.byLocation[id].length + ' eligible tasks)' : 'free travel tile')).join('\n');
        renderPastTasks();
        const rollButton = document.getElementById('bl-roll');
        rollButton.hidden = !started;
        rollButton.disabled = busy || !!error || !dataReady || !R.canRoll(state) || !pool.candidates.length || !canEdit();
        rollButton.textContent = busy ? 'Calculating access and tasks…' : !R.canRoll(state) ? 'Complete one task to travel' : !pool.candidates.length ?
            'No reachable locations' : state.currentVisit?.resolution === 'no_tasks' && state.travelAnchor === state.currentVisit.locationId ?
                'Continue travel (free tile)' : !state.travelAnchor && !Object.keys(tempChunks.unlocked || {}).length ? 'Roll starting tile' : 'Roll next location';
        const startRollButton = document.getElementById('bl-start-roll');
        startRollButton.disabled = rollButton.disabled;
        startRollButton.textContent = rollButton.textContent;
        document.getElementById('bl-start-actions').hidden = pickingStartingTile;
        document.getElementById('bl-start-picker').hidden = !pickingStartingTile;
        const startPickButton = document.getElementById('bl-start-pick');
        startPickButton.disabled = rollButton.disabled;
        const startConfirmButton = document.getElementById('bl-start-confirm');
        startConfirmButton.disabled = !selectedStartingCandidate || rollButton.disabled;
        const startChoice = document.getElementById('bl-start-choice');
        startChoice.textContent = selectedStartingCandidate ? 'Selected: ' + selectedStartingCandidate.locationId +
            (label(selectedStartingCandidate.locationId) ? ' — ' + label(selectedStartingCandidate.locationId) : '') : 'No tile selected yet.';
        $('.pick').prop('disabled', rollButton.disabled).text(rollButton.textContent);
        const visit = state.currentVisit;
        document.getElementById('bl-visit-title').textContent = visit ? '#' + visit.visitNumber + ' · ' + visit.locationId + ' — ' + visit.chunkName :
            state.travelAnchor ? 'Current tile · ' + state.travelAnchor + ' — ' + label(state.travelAnchor) : 'No current tile';
        const arrivalLabel = visit?.arrivalMedium && visit.arrivalMedium !== 'whole' ? ' · ' + visit.arrivalMedium.toUpperCase() +
            (visit.arrivalSections?.length ? ' ' + visit.arrivalSections.join(' + ') : '') : '';
        document.getElementById('bl-visit-status').textContent = visit ? visit.kind.toUpperCase() + arrivalLabel + ' · ' +
            (slayerConfirmation ? 'Slayer master confirmation needed' : ({ pending_calculation: 'Checking tasks and routes', task_required: 'Complete any 1 task', resolved: ({ no_tasks: 'No tasks — free roll', task_completed: 'Complete', admin_void: 'Voided' })[visit.resolution] })[visit.status]) :
            state.travelAnchor ? 'Current travel position.' : 'Roll a starting tile to begin.';
        const areaHint = document.getElementById('bl-area-hint'), areaSections = currentAreaSections();
        areaHint.hidden = !state.travelAnchor || !areaSections.length;
        if (!areaHint.hidden) {
            const routes = currentAreaRoutes(state.travelAnchor, areaSections);
            const areaWord = areaSections.length === 1 ? 'area ' : 'areas ';
            const instruction = visit?.visitNumber === 1 ? 'Start inside' : 'You entered through';
            const routeText = routes.length ? ' Map exits: ' + routes.map(route =>
                (route.direction ? route.direction + ' → ' : '') + route.id + (route.name ? ' — ' + route.name : '')).join('; ') + '.' :
                ' No neighboring map exit is currently open from this area.';
            areaHint.textContent = instruction + ' the gold-highlighted ' + areaWord + areaSections.join(' + ') + '.' + routeText;
        }
        const candidates = document.getElementById('bl-candidates'); candidates.replaceChildren();
        const completedIds = R.completionIds(legacy(), tasksMap);
        if (visit && slayerConfirmation) {
            const prompt = element('div', null, { className: 'bl-slayer-confirmation' });
            prompt.append(element('strong', 'Can you currently use ' + slayerConfirmation.master + '?'),
                element('p', 'Requires ' + slayerConfirmation.requiredCombat + ' Combat.'));
            const choices = element('div', null, { className: 'bl-toolbar' });
            const yes = button('Yes', () => answerSlayerMaster(true));
            const no = button('No, defer these goals', () => answerSlayerMaster(false));
            yes.disabled = no.disabled = !canEdit() || busy; choices.append(yes, no); prompt.append(choices,
                element('small', 'No hides every dependent Slayer route until you activate the master later.'));
            candidates.append(prompt);
        } else if (visit) {
            const snapshotIds = new Set(visit.candidateTaskIds);
            taskList(candidates, visit.candidateTaskIds.map(id => {
                const savedTask = visit.candidateTasks?.[id] || {};
                return tasks.find(t => t.taskId === id) || {
                    taskId: id, name: tasksMapReverse[id] || id, displayName: R.displayName(tasksMapReverse[id] || id),
                    skill: rawTasks.find(t => t.taskId === id)?.skill || 'Unavailable', ...savedTask,
                    completed: completedIds.has(id) || (!!savedTask.enablerItemKey && R.own(state.acquiredEnablers, savedTask.enablerItemKey)), available: false,
                    eligibilityReason: 'No longer eligible; inspect rules/access/backlogs or void the visit', origins: []
                };
            }).filter(task => !task.implicitlyCompleted && (!task.redundant ||
                !(task.coveredByTaskIds || []).some(id => snapshotIds.has(id)))), true);
        }
        document.getElementById('bl-void').disabled = !visit || R.canRoll(state) || !canEdit();
        const reachableEncounters = pool.candidates.filter(c => c.kind === 'revisit');
        const frontierCount = pool.candidates.filter(c => c.kind === 'frontier').length;
        const choiceCount = frontierCount + reachableEncounters.length;
        document.getElementById('bl-pool-heading').textContent = 'Roll pool · ' + choiceCount + (choiceCount === 1 ? ' choice' : ' choices');
        document.getElementById('bl-pool-summary').textContent = 'From ' + (pool.current || 'the current tile') + ': ' + frontierCount +
            (frontierCount === 1 ? ' new tile, ' : ' new tiles, ') + reachableEncounters.length +
            (reachableEncounters.length === 1 ? ' earlier tile with a task, and ' : ' earlier tiles with tasks, and ') +
            pool.reachableFree.length + (pool.reachableFree.length === 1 ? ' free tile on the routes.' : ' free tiles on the routes.');
        const startSummary = document.getElementById('bl-start-summary');
        if (startSummary && !hasStarted()) {
            startSummary.textContent = startingPool.ids.length + ' tiles';
        }
        const locations = document.getElementById('bl-locations'); locations.replaceChildren();
        for (const [title, ids] of [
            ['New boundary', pool.candidates.filter(c => c.kind === 'frontier').map(c => c.locationId)],
            ['Reachable encounters', reachableEncounters.map(c => c.locationId)],
            ['Free path', pool.reachableFree],
            ['Other unlocked encounters', pool.live.filter(id => !reachableEncounters.some(c => c.locationId === id) && id !== pool.current)]
        ]) {
            locations.append(element('p', title + ': ' + (ids.map(id => id + (title.includes('encounter') ? ' (' + pool.byLocation[id].length + ' tasks)' : '')).join(', ') || 'None')));
        }
        const unassigned = tasks.filter(t => !t.origins.length);
        document.getElementById('bl-unassigned-count').textContent = 'Unassigned Boardlocked Tasks (' + unassigned.length + ')';
        const unassignedList = document.getElementById('bl-unassigned'); unassignedList.replaceChildren();
        unassigned.forEach(task => unassignedList.append(button(task.displayName + ' · ' + task.taskId, () => inspectTask(task))));
        document.getElementById('bl-gate-count').textContent = 'Access diagnostics (' + diagnostics.length + ')';
        const gateList = document.getElementById('bl-gates'); gateList.replaceChildren();
        diagnostics.forEach(gate => {
            const row = element('details');
            row.append(element('summary', R.displayName(gate.name || gate.key) + ': ' + gate.reason), element('pre', JSON.stringify(gate, null, 2)));
            gateList.append(row);
        });
        document.getElementById('bl-task-count').textContent = 'Other tasks & progress';
        renderAllTasks();
        const history = document.getElementById('bl-history'); history.replaceChildren();
        for (const item of state.visitHistory.slice().reverse()) {
            const entry = element('details');
            const savedTask = item.candidateTasks?.[item.resolvedTaskId];
            const resolved = item.resolvedTaskId ? savedTask?.displayName ||
                R.displayName(savedTask?.name || tasksMapReverse[item.resolvedTaskId] || item.resolvedTaskId) : item.resolution || item.status;
            entry.append(element('summary', '#' + item.visitNumber + ' · ' + item.locationId + ' · ' + item.kind + ' · ' + resolved), element('p', item.timestamp + ' · ' + item.chunkName));
            const note = element('textarea', item.note || '', { 'aria-label': 'Note for visit ' + item.visitNumber, rows: '2' });
            note.disabled = !canEdit();
            note.addEventListener('change', () => {
                item.note = note.value;
                if (state.currentVisit?.visitNumber === item.visitNumber) state.currentVisit.note = note.value;
                save();
            });
            entry.append(note, element('pre', JSON.stringify({ candidateTaskIds: item.candidateTaskIds, resolution: item.resolution, resolvedTaskId: item.resolvedTaskId }, null, 2)));
            history.append(entry);
        }
        document.getElementById('bl-admin-history').textContent = JSON.stringify(state.adminHistory, null, 2);
    }
    function renderAllTasks() {
        const container = document.getElementById('bl-all-tasks');
        if (!container || !container.parentElement.open) return;
        const query = document.getElementById('bl-task-search').value.toLowerCase();
        const history = document.getElementById('bl-show-earlier').checked;
        const filtered = tasks.filter(t => !t.bossDeferred && (history || (!t.superseded && !t.completed && !t.redundant)) &&
            (t.taskId + ' ' + t.displayName + ' ' + t.skill + ' ' + t.origins.map(o => o.chunkId).join(' ')).toLowerCase().includes(query));
        container.replaceChildren();
        taskList(container, filtered.slice(0, 150));
        if (filtered.length > 150) container.append(element('p', 'Showing 150 of ' + filtered.length + '. Search to narrow the list.'));
    }
    function applyOverrides() {
        if (!canEdit()) return;
        try {
            const origins = JSON.parse(document.getElementById('bl-origin-overrides').value || '{}');
            const access = JSON.parse(document.getElementById('bl-access-overrides').value || '{}');
            const updated = boardlockedState({ ...state, originOverrides: origins, accessOverrides: access });
            for (const entries of Object.values(origins)) for (const loc of entries) {
                const parsed = R.parseLocation(loc);
                if (!chunkInfo.chunks[parsed.chunkId] || (parsed.sectionId && !chunkInfo.chunks[parsed.chunkId].Sections?.[parsed.sectionId])) throw new Error('Unknown origin chunk/section');
            }
            state = updated;
            state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'update_overrides' });
            error = ''; save(); schedule();
        } catch (err) { notice('Overrides were not applied: ' + err.message); }
    }
    function exportRun() {
        const payload = { format: 'chunk-picker-boardlocked', version: R.VERSION, mapId: mid, exportedAt: new Date().toISOString(), boardlockedState: state, legacy: snapshotLegacy() };
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        const link = element('a', null, { href: url, download: 'boardlocked-' + (localProfile || mid || 'run') + '.json' });
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function restoreLegacy(saved, trustTransient = false) {
        // Explicit allowlist: never replace globals/functions from imported JSON.
        const original = saved || {};
        saved = R.sanitizeLegacySnapshot(original, Object.keys(rules), Object.keys(settings));
        tempChunks = saved.tempChunks; tempSelectedChunks = [];
        if (trustTransient) {
            if (original.tempChunks?.selected) tempChunks.selected = R.copy(original.tempChunks.selected);
            if (original.tempChunks?.potential) tempChunks.potential = R.copy(original.tempChunks.potential);
            tempSelectedChunks = Array.isArray(original.tempSelectedChunks) ? R.copy(original.tempSelectedChunks) : Object.keys(tempChunks.selected || {});
        }
        for (const key of Object.keys(rules)) if (R.own(saved.rules, key)) rules[key] = saved.rules[key];
        for (const key of Object.keys(settings)) if (R.own(saved.settings, key)) settings[key] = saved.settings[key];
        checkedAllTasks = saved.checkedAllTasks || {}; checkedChallenges = saved.checkedChallenges || {};
        completedChallenges = saved.completedChallenges || {}; manualEquipment = saved.manualEquipment || {};
        backlog = saved.backlog || {}; manualTasks = saved.manualTasks || {}; backloggedSources = saved.backloggedSources || {};
        manualMonsters = saved.manualMonsters || {}; manualSections = saved.manualSections || {}; manualAreas = saved.manualAreas || {};
        slayerLocked = saved.slayerLocked ?? slayerLocked; constructionLocked = saved.constructionLocked ?? constructionLocked;
        passiveSkill = saved.passiveSkill || {}; maxSkill = saved.maxSkill || {}; randomLoot = saved.randomLoot || {};
        assignedXpRewards = saved.assignedXpRewards || {}; altChallenges = saved.altChallenges || {};
        userTasks = saved.userTasks || {}; manualPrimary = saved.manualPrimary || {}; chunkOrder = saved.chunkOrder || {};
    }
    async function importRun(file) {
        if (!file || !canEdit()) return;
        try {
            const payload = JSON.parse(await file.text());
            const imported = R.normalizeRunExport(payload);
            let nextState = boardlockedState(imported.state);
            if (!confirm(localProfile ? 'Replace this local run with the imported geography, rules, completion records and visit history? An unresolved visit or the latest free visit will be recalculated when its saved rules are older.' :
                'Replace local Boardlocked levels, overrides and visits for this map? An unresolved visit or the latest free visit will be recalculated when its saved rules are older. Legacy map data stays in its existing save; use a local run to restore the full export.')) return;
            invalidate();
            if (localProfile && imported.legacy) {
                restoreLegacy(imported.legacy);
                // Selected candidates are transient in exports. Rebuild the
                // boundary from the real connection graph and persistent map.
                rebuildImportedFrontier();
            }
            syncAssumedAccountSetup();
            const startSectionMigration = R.migrateStartingSections(chunkInfo, nextState, manualSections,
                chunkInfo.walkableChunks || [], tempChunks.blacklisted || {});
            nextState = startSectionMigration.state; manualSections = startSectionMigration.sections;
            if (startSectionMigration.changed) forceUpdatePluginOutput = true;
            nextState.travelAnchor = R.inferTravelAnchor(nextState, tempChunks.unlocked || {}, chunkOrder);
            if (nextState.travelAnchorSections == null) {
                const inferred = R.inferLegacyAnchorSections(chunkInfo, nextState, manualSections);
                if (inferred !== null) {
                    nextState.travelAnchorSections = inferred;
                    if (R.parseLocation(nextState.currentVisit?.locationId)?.chunkId === nextState.travelAnchor &&
                        nextState.currentVisit.arrivalSections === undefined) {
                        const arrivalMedium = !inferred.length ? 'whole' : inferred.every(section => section.startsWith('W')) ? 'water' : 'land';
                        nextState = R.journal(nextState, { ...nextState.currentVisit, arrivalSections: [...inferred], arrivalMedium });
                    }
                }
            }
            if (!nextState.enablersInitialized) nextState = R.recoverAcquiredEnablers(nextState,
                localProfile && imported.legacy ? legacy() : {}, chunkInfo, tasksMap, BoardlockedData);
            const latestNoTaskVisit = nextState.currentVisit?.status === 'resolved' && nextState.currentVisit.resolution === 'no_tasks';
            const recalculatingVisit = !!nextState.currentVisit && (!R.canRoll(nextState) ||
                (imported.version < R.VERSION && latestNoTaskVisit));
            if (recalculatingVisit) nextState = R.recalculateCurrentVisit(nextState,
                'Recalculated after run import', undefined, { reopenNoTasks: true });
            state = nextState;
            if (state.enabled && !state.rulePresetInitialized) applyBoardlockedPreset(true);
            upgradeBoardlockedPreset();
            error = ''; loadFailure = false; signature = '';
            message = recalculatingVisit ? 'Run imported. The active visit and every tile’s encounter/free status are recalculating.' :
                'Run imported. Every unlocked tile is being recalculated as an encounter or free travel tile.';
            save(); render();
            calcCurrentChallengesCanvas(true, true, true); drawCanvas();
        } catch (err) { notice('Import was not applied: ' + err.message); }
    }
    function resetRulePreset() {
        if (!canEdit()) return;
        try {
            applyBoardlockedPreset(false, true);
            state.adminHistory.push({ timestamp: new Date().toISOString(), action: 'reset_boardlocked_rule_preset' });
            save(); render(); schedule();
        } catch (err) { fail(err); }
    }
    async function bootstrapLocal(name) {
        try {
            localProfile = name; mid = 'local-' + name; testMode = true; onTestServer = true;
            signedIn = false; locked = false; inEntry = false; atHome = false;
            viewOnly = false; chunkTasksOn = true; initialLoaded = true;
            $('.loading').show();
            const [dataResponse, mapResponse] = await Promise.all([fetch('./chunkpicker-chunkinfo-export.json?v=2'), fetch('./tasksMap.json')]);
            if (!dataResponse.ok || !mapResponse.ok) throw new Error('Failed to load local task data');
            chunkInfo = await dataResponse.json(); tasksMap = await mapResponse.json();
            tasksMapReverse = Object.fromEntries(Object.entries(tasksMap).map(([name, id]) => [id, name]));
            setCodeItems(); gotData = true;
            const vault = readBrowserVault();
            if (vault) {
                restoreLegacy(vault.legacy, true);
                pendingStoredState = JSON.stringify(vault.boardlockedState);
                pendingStoredVersion = vault.sourceStateVersion;
                if (recoveredBrowserBackup) localStorage.removeItem(localKey());
            } else {
                const saved = localStorage.getItem(legacyLocalKey());
                if (saved) {
                    const run = JSON.parse(saved);
                    if (run.version !== 1) throw new Error('Unsupported local run version');
                    restoreLegacy(run.legacy, true);
                } else if (browserVaultError && !localStorage.getItem(storageKey()) && !localStorage.getItem(legacyStorageKey())) {
                    throw new Error('The browser save and its backup could not be read. They were not overwritten. Import a downloaded backup to recover this run.');
                }
            }
            ensureMap();
            $('.body, .canvasDiv, .topnav, .menu, .menu2, .menu3, .menu4, .menu8').show().css('opacity', 1);
            $('#home-menu, #entry-menu, #import-menu, #highscore-menu, #highscore-menu2, #help-menu, .entry-home-menu-container, .entry-home-menu-extra, .background-img, .loading, #page1, #page1extra, #page1search').hide();
            $('.test-hint').hide();
            $('.lock-closed, .lock-opened, .pinchange, .friendslist, .gosandbox').hide();
            document.title = 'Boardlocked · ' + name;
            $('.toptitle2').text('RUN · ' + name);
            toggleTheme(settings.theme || 'light');
            doneLoading();
            // The empty legacy card obscures the map without providing data.
            // Right-clicking a tile still opens the full chunk information view.
            $('.menu8, .hiddenInfo').hide();
            toggleChallengesPanel('active');
            setUpSelected(); render();
            if (readyToDrawImage) centerCanvas('quick');
            else mapImg.addEventListener('load', () => centerCanvas('quick'), { once: true });
            calcCurrentChallengesCanvas(true, true, true);
        } catch (err) { fail(err); $('.loading').hide(); }
    }
    function drawOverlay(context) {
        if (!state.enabled || !context || !dataReady) return;
        context.save();
        if (!hasStarted()) {
            if (!pickingStartingTile) { context.restore(); return; }
            const candidateIds = pool.candidates.filter(candidate => candidate.kind === 'frontier').map(candidate => candidate.locationId);
            for (const id of candidateIds) {
                const point = convertToXY(id), sizeX = totalZoom * imgW / rowSize, sizeY = totalZoom * imgH / (fullSize / rowSize);
                const x = dragTotalX + point.x * sizeX, y = dragTotalY + point.y * sizeY;
                const selected = id === selectedStartingCandidate?.locationId;
                const hovered = id === String(hoveredChunk);
                if (selected || hovered) {
                    context.fillStyle = selected ? 'rgba(255, 209, 102, .18)' : 'rgba(22, 133, 96, .08)';
                    context.fillRect(x + 4, y + 4, sizeX - 8, sizeY - 8);
                }
                if (selected) {
                    context.save();
                    context.globalAlpha = .42;
                    for (const sectionId of selectedStartingCandidate.metadata?.entrySections || []) {
                        const overlay = sectionOverlay(id, sectionId);
                        if (overlay?.canvas) context.drawImage(overlay.canvas, x + 3, y + 3, sizeX - 6, sizeY - 6);
                    }
                    context.restore();
                }
                context.strokeStyle = selected ? '#d99b00' : 'rgba(13, 104, 77, .8)';
                context.lineWidth = selected ? 4 : hovered ? 2 : 1.5;
                context.setLineDash([]);
                if (selected || hovered) {
                    context.strokeRect(x + 4, y + 4, sizeX - 8, sizeY - 8);
                } else {
                    const inset = 5, corner = Math.max(6, Math.min(14, Math.min(sizeX, sizeY) * .18));
                    const left = x + inset, right = x + sizeX - inset, top = y + inset, bottom = y + sizeY - inset;
                    context.beginPath();
                    context.moveTo(left, top + corner); context.lineTo(left, top); context.lineTo(left + corner, top);
                    context.moveTo(right - corner, top); context.lineTo(right, top); context.lineTo(right, top + corner);
                    context.moveTo(right, bottom - corner); context.lineTo(right, bottom); context.lineTo(right - corner, bottom);
                    context.moveTo(left + corner, bottom); context.lineTo(left, bottom); context.lineTo(left, bottom - corner);
                    context.stroke();
                }
            }
            context.restore();
            return;
        }
        const candidateByLocation = new Map(pool.candidates.map(candidate => [candidate.locationId, candidate]));
        const ids = new Set([...Object.keys(tempChunks.unlocked || {}), ...candidateByLocation.keys()]);
        if (state.travelAnchor) ids.add(state.travelAnchor);
        for (const id of ids) {
            const point = convertToXY(id), sizeX = totalZoom * imgW / rowSize, sizeY = totalZoom * imgH / (fullSize / rowSize);
            const x = dragTotalX + point.x * sizeX, y = dragTotalY + point.y * sizeY;
            const current = id === state.travelAnchor;
            const candidate = candidateByLocation.get(id), rollable = !!candidate;
            const free = pool.dormant.includes(id), freeOnPath = pool.reachableFree.includes(id);
            if (current || (free && freeOnPath)) {
                context.fillStyle = current ? 'rgba(255, 209, 102, .08)' : 'rgba(58, 155, 220, .04)';
                context.fillRect(x + 4, y + 4, sizeX - 8, sizeY - 8);
            }
            const areaSections = current ? currentAreaSections() : [];
            if (areaSections.length) {
                context.save();
                context.globalAlpha = .58;
                context.filter = 'drop-shadow(0 0 ' + Math.max(1, sizeX * .025) + 'px rgba(255, 238, 175, .95))';
                for (const sectionId of areaSections) {
                    const overlay = sectionOverlay(id, sectionId);
                    if (!overlay?.canvas) continue;
                    context.drawImage(overlay.canvas, x + 3, y + 3, sizeX - 6, sizeY - 6);
                }
                context.restore();
            }
            context.strokeStyle = current ? '#d99b00' : rollable ? '#17805d' : free ? '#3a9bdc' : 'rgba(90, 96, 96, .85)';
            context.lineWidth = current ? 4 : rollable ? 3 : freeOnPath ? 2.5 : 2;
            context.setLineDash(current || rollable ? [] : free ? [4, 4] : [2, 4]);
            context.strokeRect(x + 4, y + 4, sizeX - 8, sizeY - 8);
        }
        context.restore();
    }
    function mount() {
        panel = element('aside', null, { id: 'bl-panel', 'aria-label': 'Boardlocked run' }); panel.hidden = true;
        panel.innerHTML = `<header><h2>Boardlocked Run</h2><button type="button" id="bl-close" aria-label="Close run panel">×</button></header>
            <p id="bl-storage-label"></p><p id="bl-message" role="status" aria-live="polite"></p>
            <section id="bl-start-setup" class="bl-start-setup"><h3>Start a new account</h3>
            <div class="bl-start-grid bl-start-recommended">
            <label class="bl-start-option"><input id="bl-start-turael" type="checkbox"><span><strong>Turael setup <em>recommended</em></strong><small>Talk to Turael and check his options to unlock other Slayer masters. Cancel any assignment.</small></span></label>
            <label class="bl-start-option"><input id="bl-start-druidicRitual" type="checkbox"><span><strong>Druidic Ritual <em>recommended</em></strong><small>Complete the quest before starting.</small></span></label>
            </div>
            <details class="bl-start-instructions"><summary>Instructions for getting Druidic Ritual Items</summary><ol class="bl-start-route"><li>Pick up the iron dagger near Lumbridge.</li><li>Kill a level-3 rat in Lumbridge Swamp for raw rat meat.</li><li>Buy raw chicken and raw beef from Wydin’s Food Store in Port Sarim.</li><li>Talk to Veos and travel to Kourend, then talk to him again to travel to Land’s End.</li><li>Flinch the bear cub from the outside corner of the house and take its meat.</li><li>Complete Druidic Ritual with the <a href="https://oldschool.runescape.wiki/w/Druidic_Ritual" target="_blank" rel="noopener noreferrer">OSRS Wiki quest guide</a>.</li></ol><figure><img src="./resources/boardlocked-bear-flinch.jpg" alt="Player standing on the outside corner of the house with the bear cub nearby" loading="lazy"><figcaption>Attack once, return to the outside corner, and wait for the bear’s health bar to disappear. Repeat until it dies.</figcaption></figure></details>
            <div class="bl-start-grid">
            <label class="bl-start-option"><input id="bl-start-varlamore" type="checkbox"><span><strong>Varlamore starts</strong><small>Assumes Children of the Sun is complete before rolling.</small></span></label>
            <label class="bl-start-option"><input id="bl-start-wilderness" type="checkbox"><span><strong>Wilderness starts</strong><small>Adds wilderness tiles.</small></span></label>
            </div><p id="bl-start-summary" class="bl-muted"></p>
            <div id="bl-start-actions"><button id="bl-start-roll" class="bl-primary" type="button">Roll starting tile</button><button id="bl-start-pick" class="bl-start-pick" type="button">Pick starting tile</button></div>
            <div id="bl-start-picker" class="bl-start-picker" hidden><p><strong>Click a marked tile on the map.</strong> You can change your pick before confirming.</p><p id="bl-start-choice" class="bl-start-choice" aria-live="polite"></p><div class="bl-start-picker-actions"><button id="bl-start-confirm" class="bl-primary" type="button">Confirm start</button><button id="bl-start-cancel" type="button">Cancel</button></div></div></section>
            <div id="bl-mode-content" hidden>
            <button id="bl-roll" class="bl-primary" type="button">Roll next location</button>
            <button id="bl-sections" type="button" hidden>Choose accessible sections</button>
            <section><h3>Current visit</h3><strong id="bl-visit-title"></strong><p id="bl-visit-status"></p><p id="bl-area-hint" class="bl-area-hint" hidden></p><div id="bl-candidates"></div>
            <button id="bl-void" type="button">Void / recalculate current visit</button></section>
            <div class="bl-map-legend" aria-label="Map legend"><span><i class="bl-key-current"></i>Current</span><span><i class="bl-key-area"></i>Your area</span><span><i class="bl-key-rollable"></i>Rollable</span><span><i class="bl-key-free"></i>Free</span><span><i class="bl-key-waiting"></i>Waiting task</span></div>
            <details class="bl-run-guide"><summary>How Boardlocked works</summary><p>Unlocked tiles stay available for training, supplies, and travel. Complete one task from the current visit before rolling again.</p><p>Rolls follow open routes and may cross free tiles. A transport destination must be rolled before you enter it.</p></details>
            <details class="bl-roll-pool"><summary id="bl-pool-heading">Roll pool</summary><p id="bl-pool-summary"></p><details><summary>Locations and task counts</summary><div id="bl-locations"></div></details></details>
            <details><summary id="bl-enabler-summary">Acquired tools (0)</summary><p>Reusable tools such as axes stay unlocked after you get them. If an old save is missing one, add it here.</p>
            <div class="bl-toolbar"><select id="bl-enabler-select" aria-label="Known persistent enabler to register"><option value="">Choose a known reusable item…</option></select><button id="bl-add-enabler" type="button">Mark acquired</button></div>
            <div id="bl-enabler-list"></div><details><summary>Unclear tool requirements</summary><p>These items are not treated as reusable because their task data is unclear.</p><div id="bl-enabler-ambiguities"></div></details></details>
            <details><summary id="bl-slayer-master-summary">Slayer masters</summary><p>Masters you cannot use yet wait here. Activating one restores every goal that depends on it.</p><div id="bl-slayer-masters"></div></details>
            <details><summary id="bl-blocked-boss-summary">Bosses waiting for better gear</summary><p>Boss goals can wait until you decide your equipment is ready.</p><div id="bl-blocked-bosses"></div></details>
            <details><summary id="bl-task-count">Other tasks &amp; progress</summary><p>Record past goals, quests, and permanent unlocks here. Routine training does not complete the current visit.</p><input id="bl-task-search" type="search" placeholder="Search task, skill, ID or chunk" aria-label="Search tasks"><label class="bl-toggle"><input type="checkbox" id="bl-show-earlier">Show completed and earlier skilling tasks</label><div id="bl-all-tasks"></div></details>
            <details><summary>Diagnostics and overrides</summary>
            <details><summary id="bl-unassigned-count">Unassigned Boardlocked Tasks</summary><div id="bl-unassigned"></div></details>
            <details><summary id="bl-gate-count">Access diagnostics</summary><div id="bl-gates"></div></details>
            <details><summary>Task inspector</summary><pre id="bl-debug">Use Inspect on a task.</pre></details>
            <label>Origin overrides: task ID → array of chunk or chunk-section IDs<textarea id="bl-origin-overrides" rows="5" spellcheck="false">{}</textarea></label>
            <label>Access overrides: diagnostic key → true / false<textarea id="bl-access-overrides" rows="5" spellcheck="false">{}</textarea></label>
            <p>Copy a task or source key from diagnostics. <code>section:1234-1: false</code> is written as <code>{"section:1234-1": false}</code>. Manually closed sections remain authoritative.</p>
            <button id="bl-apply-overrides" type="button">Apply overrides</button><button id="bl-recalculate" type="button">Recalculate tasks</button></details>
            <details><summary>Visit history</summary><div id="bl-history"></div></details>
            <details><summary>Setup history</summary><pre id="bl-admin-history"></pre></details>
            </div>
            <details id="bl-run-setup"><summary>Continue or import a run</summary>
            <div class="bl-toolbar"><label class="bl-file">Import backup<input id="bl-import" type="file" accept=".json,application/json"></label></div>
            <h3>Continue an existing run</h3><p>Add your unlocked chunk IDs in order, separated by commas. The map will mark each chunk as free or show the tasks you can complete there.</p>
            <label>Already unlocked chunks<textarea id="bl-setup-chunks" rows="2" placeholder="Chunk IDs, in unlock order"></textarea></label>
            <p class="bl-muted">You can specify accessible sections as chunk-section IDs. Otherwise the map will ask you to choose any sections it needs.</p>
            <button id="bl-add-unlocked" type="button">Add unlocked chunks</button><pre id="bl-setup-status" role="status"></pre>
            <h3>Record completed tasks</h3><p>Search for tasks you already did. Completed ordinary skill tasks establish the highest completed task level for each skill.</p>
            <input id="bl-past-search" type="search" placeholder="Search past task, e.g. cooked chicken" aria-label="Search completed tasks to record"><div id="bl-past-tasks"></div>
            <h3>Current tile / resume a visit</h3><p>After an import, your current tile comes from the unfinished visit or the last unlocked chunk. Change it here if that is wrong. Resume a visit only when you still owe a task there.</p>
            <label>Unlocked chunk or chunk-section ID <input id="bl-admin-location" inputmode="text" placeholder="9270-1 or 9270-W1"></label><div class="bl-toolbar"><button id="bl-set-anchor" type="button">Set current tile / section</button><button id="bl-admin-visit" type="button">Resume unfinished visit here</button></div>
            </details>
            <details class="bl-run-tools"><summary>Run data &amp; rules</summary><p class="bl-save-warning">Clearing this site’s browser data deletes its local copy. Keep a downloaded backup outside the browser.</p>
            <div class="bl-run-actions"><button id="bl-export" type="button">Download backup</button><button id="bl-reset" type="button" class="bl-danger" title="Clear the map and all progress for this local run">Reset map &amp; run</button></div>
            <div class="bl-preset"><strong id="bl-preset-status">Rules: Boardlocked defaults</strong><div class="bl-toolbar"><button id="bl-show-rules" type="button">Chunk Rules</button><button id="bl-reset-preset" type="button">Restore Boardlocked rules</button></div></div></details>`;
        document.body.append(panel);
        const focusPanelButton = () => document.getElementById('boardlocked-panel-button')?.focus();
        const stopMapInteraction = event => {
            if (typeof cancelMapDrag === 'function') cancelMapDrag();
            event.stopPropagation();
        };
        // A gesture that crosses into the panel must never keep panning or
        // complete as a tile click underneath it.
        ['mouseenter', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchmove', 'touchend', 'contextmenu']
            .forEach(type => panel.addEventListener(type, stopMapInteraction));
        panel.addEventListener('keydown', event => { if (event.key === 'Escape') { setPanelOpen(false); focusPanelButton(); } });
        document.getElementById('bl-close').onclick = () => { setPanelOpen(false); focusPanelButton(); };
        document.getElementById('bl-roll').onclick = roll;
        document.getElementById('bl-start-roll').onclick = roll;
        document.getElementById('bl-start-pick').onclick = startPickingTile;
        document.getElementById('bl-start-confirm').onclick = confirmStartingTile;
        document.getElementById('bl-start-cancel').onclick = cancelPickingTile;
        document.getElementById('bl-void').onclick = voidCurrent;
        document.getElementById('bl-export').onclick = exportRun;
        document.getElementById('bl-import').onchange = event => { importRun(event.target.files[0]); event.target.value = ''; };
        document.getElementById('bl-add-unlocked').onclick = addUnlocked;
        document.getElementById('bl-reset').onclick = resetRun;
        document.getElementById('bl-reset-preset').onclick = resetRulePreset;
        document.getElementById('bl-show-rules').onclick = () => { setPanelOpen(false); showRules(); };
        document.getElementById('bl-enabler-select').onchange = event => {
            document.getElementById('bl-add-enabler').disabled = !canEdit() || !event.target.value;
        };
        document.getElementById('bl-add-enabler').onclick = addEnabler;
        document.getElementById('bl-past-search').oninput = renderPastTasks;
        document.getElementById('bl-sections').onclick = () => { setPanelOpen(false); calcCurrentChallengesCanvas(true, true); };
        document.getElementById('bl-set-anchor').onclick = setAnchor;
        document.getElementById('bl-admin-visit').onclick = adminVisit;
        document.getElementById('bl-apply-overrides').onclick = applyOverrides;
        document.getElementById('bl-recalculate').onclick = () => { error = ''; schedule(); };
        document.getElementById('bl-task-search').oninput = renderAllTasks;
        document.getElementById('bl-show-earlier').onchange = renderAllTasks;
        document.getElementById('bl-all-tasks').parentElement.addEventListener('toggle', renderAllTasks);
        for (const key of Object.keys(state.initialization)) document.getElementById('bl-start-' + key)
            ?.addEventListener('change', event => setInitializationOption(key, event.target.checked));
        render();
    }
    window.boardlockedController = { enabled, notice, calculate, invalidate, onLegacyChange, roll, allowRelock, drawOverlay, bootstrapLocal,
        handleStartingTileClick,
        isFrontierCandidate: id => pool.candidates.some(candidate => candidate.kind === 'frontier' && candidate.locationId === String(id)),
        open: () => {
            setPanelOpen(true);
            document.getElementById('bl-origin-overrides').value = JSON.stringify(state.originOverrides, null, 2);
            document.getElementById('bl-access-overrides').value = JSON.stringify(state.accessOverrides, null, 2);
            rebuild(); render();
            document.getElementById('bl-close')?.focus();
        },
        debug: () => ({ state: R.copy(state), pool: R.copy(pool), tasks: R.copy(tasks), progressionHighWater: { ...state.progressionHighWater },
            startingPicker: { active: pickingStartingTile, selected: R.copy(selectedStartingCandidate) },
            enablerCatalog: R.copy(enablerCatalog), enablerAmbiguities: R.copy(enablerAmbiguities),
            slayerMasterCatalog: R.copy(slayerMasterCatalog), slayerConfirmation: R.copy(slayerConfirmation),
            blockedBosses: R.copy(state.blockedBosses),
            rulePreset: activeRulePreset(), diagnostics: R.copy(diagnostics), sourceCounts, busy, error, generation }),
        inspectTask: id => tasks.find(task => task.taskId === id),
        inspectChunk: id => ({ locationId: String(id), current: pool.current === String(id),
            state: pool.candidates.some(c => c.locationId === String(id)) ? 'ROLLABLE' : pool.reachableFree.includes(String(id)) ? 'FREE_PATH' :
                pool.live.includes(String(id)) ? 'ENCOUNTER' : pool.dormant.includes(String(id)) ? 'FREE' : 'LOCKED', taskIds: pool.byLocation[id] || [] }) };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
