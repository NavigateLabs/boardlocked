/* Strict-mode hooks executed in worker.js's existing global calculation. */
let rlContext = null;
let rlAccess = null;
let rlSourceDiagnostics = new Map();
let rlCollectionItems = new Set();
let rlCollectionSources = {};
let rlPresentItems = new Set();
let rlStructuralGates = new Set();

function rlInitialize(request) {
    rlContext = request.roguelike || null;
    rlSourceDiagnostics = new Map();
    rlCollectionItems = new Set();
    rlCollectionSources = {};
    rlPresentItems = new Set();
    rlStructuralGates = new Set();
    if (!rlContext) return;
    rlAccess = Roguelike.createAccess(chunkInfo, rlContext.state, {
        completedChallenges, checkedChallenges, checkedAllTasks: rlContext.checkedAllTasks,
        manualEquipment, backlog
    }, rlContext.tasksMap, rules, rlLocationAllowed);
    if (rules['Collection Log']) {
        for (const meta of Object.values(chunkInfo.challenges.Extra || {})) {
            if (!meta.Category?.includes('Collection Log') ||
                (meta.Category.some(category => category.startsWith('Collection Log ')) &&
                    !meta.Category.some(category => category !== 'Collection Log' && rules[category]))) continue;
            for (const item of meta.Items || []) Roguelike.expand(item, itemsPlus).forEach(name => rlCollectionItems.add(name));
        }
    }
}

function rlLocationAllowed(location) {
    const parsed = Roguelike.parseLocation(location);
    if (parsed) return Roguelike.locationAvailable(parsed, chunks, unlockedSections, manualSections) &&
        rlContext.state.accessOverrides['section:' + location] !== false;
    return !!chunks[location] && manualAreas[location] !== false &&
        rlContext.state.accessOverrides['area:' + location] !== false;
}

function rlSourceAllowed(type, name, location) {
    if (!rlContext) return true;
    if (type !== 'Items' && !rlLocationAllowed(location)) return false;
    const key = 'source:' + type + ':' + name + (location ? ':' + location : '');
    const override = rlContext.state.accessOverrides[key];
    if (override !== undefined) return override;
    const requirements = type === 'Items' ? chunkInfo.taskUnlocks.Items?.[name] : chunkInfo.taskUnlocks[type]?.[name]?.[location];
    const allowed = rlAccess.all(requirements);
    if (!allowed) rlSourceDiagnostics.set(key, { key, type, name, location, allowed,
        reason: 'Source requires actual access prerequisites', requirements });
    else rlSourceDiagnostics.delete(key);
    return allowed;
}

function rlFilterSources(base) {
    if (!rlContext) return base;
    for (const [field, type] of [['monsters', 'Monsters'], ['objects', 'Objects'], ['npcs', 'NPCs'], ['shops', 'Shops']]) {
        for (const [name, locations] of Object.entries(base[field])) {
            for (const location of Object.keys(locations)) if (!rlSourceAllowed(type, name, location)) delete locations[location];
            if (!Object.keys(locations).length) delete base[field][name];
        }
    }
    for (const [name, sources] of Object.entries(base.items)) {
        if (Object.entries(sources).some(([source, kind]) => kind === 'shop' ? base.shops[source] :
            kind.includes('spawn') ? rlLocationAllowed(source) : kind.includes('drop') ? base.monsters[source] : source === 'Manually Added Equipment')) {
            rlPresentItems.add(name.replace(/\*.*$/, ''));
        }
        if (rlCollectionItems.has(name) && !backloggedSources.items?.[name]) {
            for (const [source, kind] of Object.entries(sources)) {
                const accessible = kind === 'shop' ? base.shops[source] && Object.keys(base.shops[source]).some(loc => rlSourceAllowed('Shops', source + '^' + name, loc)) :
                    kind.includes('spawn') ? rlSourceAllowed('Spawns', name, source) : kind.includes('drop') && !!base.monsters[source];
                // A nonempty caret suffix identifies this acquisition source;
                // the empty suffix instead restricts an item's use/destination.
                if (!rlSourceAllowed('Items', name + '^' + source)) continue;
                if (accessible) (rlCollectionSources[name] ||= {})[source] = kind;
            }
        }
        if (!rlSourceAllowed('Items', name)) { delete base.items[name]; continue; }
        for (const [source, kind] of Object.entries(sources)) {
            if (kind === 'shop') {
                if (!base.shops[source] || !Object.keys(base.shops[source]).some(loc => rlSourceAllowed('Shops', source + '^' + name, loc))) delete sources[source];
            } else if (kind.includes('spawn')) {
                if (!rlSourceAllowed('Spawns', name, source)) delete sources[source];
            } else if (kind.includes('drop') && source !== 'Manually Added Equipment') {
                if (!base.monsters[source]) delete sources[source];
            }
        }
        if (!Object.keys(sources).length) delete base.items[name];
    }
    // Acquisition sidecar: Items gates also encode where an item can be USED.
    // Collection targets must survive both resource-rarity and destination-use
    // filters without making those items available as processing prerequisites.
    for (const monster of Object.keys(base.monsters)) {
        if (rules.Skiller) continue;
        for (const drop of Object.keys(chunkInfo.drops[monster] || {})) {
            const drops = dropTables[drop] ? Object.keys(dropTables[drop]) : [drop];
            for (const item of drops) if (rlCollectionItems.has(item) && !backloggedSources.items?.[item] && rlSourceAllowed('Items', item + '^' + monster)) {
                (rlCollectionSources[item] ||= {})[monster] = 'secondary-drop';
            }
        }
    }
    return base;
}

function rlActualPrerequisites(skill, name) {
    if (!rlContext) return true;
    const meta = chunkInfo.challenges[skill]?.[name];
    // The action's level may require training. Only quest/diary progress is
    // substituted here; source-access levels are handled by rlAccess separately.
    if (meta?.QuestPointsNeeded > rlAccess.actualQuestPoints) return false;
    if (meta?.CombatLevelNeeded > rlAccess.actualCombatLevel) return false;
    if (meta?.TotalLevelNeeded > Object.values(rlContext.state.actualLevels).reduce((sum, level) => sum + level, 0)) return false;
    return Object.entries(meta?.Tasks || {}).filter(([, category]) => category === 'Quest' || category === 'Diary')
        .every(([sub, category]) => Roguelike.expand(sub, tasksPlus).some(n => rlAccess.task(n, category).allowed));
}

function rlEquipmentUsable(itemName) {
    if (!rlContext) return true;
    return Object.entries(chunkInfo.equipment?.[itemName]?.requirements || {}).every(([skill, minimum]) => {
        const current = skill === 'Combat' ? rlAccess.actualCombatLevel : rlContext.state.actualLevels[skill];
        return current != null && current >= Number(minimum);
    });
}

function rlCanOpen(name) {
    if (!rlContext) return true;
    const key = 'area:' + name;
    if (rlContext.state.accessOverrides[key] !== undefined) return rlContext.state.accessOverrides[key];
    if (!Roguelike.own(possibleAreas, name) && !Roguelike.own(chunks, name) && manualAreas[name] !== true) return false;
    rlStructuralGates.add('task:' + Roguelike.taskId(name, 'Nonskill', rlContext.tasksMap));
    return manualAreas[name] === true || rlAccess.task(name, 'Nonskill').allowed;
}

function rlSectionConnectionAllowed(from, to) {
    if (!rlContext) return true;
    const candidates = [from + ' to ' + to, from + ' to ' + to.split('-')[0]];
    return candidates.every(key => {
        const gate = chunkInfo.sectionsLimits?.[key];
        if (!gate) return true;
        const overrideKey = 'connection:' + key;
        const override = rlContext.state.accessOverrides[overrideKey];
        if (override !== undefined) return override;
        const allowed = rlAccess.all(Object.entries(gate.Tasks || {}).map(([name, skill]) => ({ [name]: skill })));
        if (!allowed) rlSourceDiagnostics.set(overrideKey, { key: overrideKey, name: key, reason: 'Connection requires actual task/quest progress', allowed, requirements: gate });
        return allowed;
    });
}

function rlAddWeaponUpgradeTasks(atomicValids, highestOverallCompleted = {}, weaponScores = {}) {
    atomicValids.BiS ||= {};
    chunkInfo.challenges.BiS ||= {};
    const addReason = (existing, reason) => {
        const reasons = String(existing || '').split(/\/\u200b?/).map(value => value.trim()).filter(Boolean);
        if (!reasons.includes(reason)) reasons.push(reason);
        return reasons.join('/\u200b');
    };
    const articleFor = item => {
        const lower = item.toLowerCase(), stem = lower.endsWith(')') ? lower.split('(')[0].trim() : lower;
        if (lower.endsWith('s') || stem.endsWith('s')) return ' ';
        return /^[aeiou]/.test(lower) ? ' an ' : ' a ';
    };
    const scoredItems = new Set();
    for (const [key, scores] of Object.entries(weaponScores)) if (key.endsWith('-weapon') || key.endsWith('-2h')) {
        Object.keys(scores).forEach(item => scoredItems.add(item));
    }
    // The upstream task list contains only the final winner for each role. For
    // scored weapons, rebuild that slice from the owned baseline so ties and
    // intermediate upgrades follow the same rule as every other candidate.
    for (const taskName of Object.keys(atomicValids.BiS)) {
        const item = chunkInfo.challenges.BiS?.[taskName]?.ItemsDetails?.[0];
        if (item && scoredItems.has(item) && ['weapon', '2h'].includes(chunkInfo.equipment?.[item]?.slot)) delete atomicValids.BiS[taskName];
    }
    for (const [key, scores] of Object.entries(weaponScores)) {
        if (!key.endsWith('-weapon') && !key.endsWith('-2h')) continue;
        const split = key.lastIndexOf('-'), style = key.slice(0, split).replaceAll('_', ' '), slot = key.slice(split + 1);
        const ownedItem = highestOverallCompleted[key];
        const ownedScore = Number(scores[ownedItem]);
        const baseline = Number.isFinite(ownedScore) ? ownedScore : Number(scores.Unarmed) || 0;
        for (const [item, rawScore] of Object.entries(scores)) {
            const score = Number(rawScore);
            if (item === 'Unarmed' || !Number.isFinite(score) || score <= baseline || !baseChunkData.items[item] || !rlEquipmentUsable(item)) continue;
            const taskName = 'Obtain' + articleFor(item) + '~|' + formatEquip(item) + '|~';
            const finalBest = highestOverall[key] === item;
            const reason = style + (finalBest ? ' BiS ' : ' upgrade ') + (slot === '2h' ? 'weapon' : slot);
            atomicValids.BiS[taskName] = addReason(atomicValids.BiS[taskName], reason);
            const existing = chunkInfo.challenges.BiS[taskName] || {};
            const skillingReason = existing.Set ? 'BIS Skilling · ' + existing.Set : '';
            chunkInfo.challenges.BiS[taskName] = { ...existing, ItemsDetails: [item],
                Label: addReason(skillingReason, atomicValids.BiS[taskName]), WeaponUpgrade: true };
        }
    }
}

function rlOutput(highestOverallCompleted = {}, weaponScores = {}) {
    const atomicValids = { ...globalValids, Extra: { ...globalValids.Extra }, BiS: { ...globalValids.BiS } };
    rlAddWeaponUpgradeTasks(atomicValids, highestOverallCompleted, weaponScores);
    const acquisitionItems = { ...baseChunkData.items };
    // Valid thieving/resource/minigame actions can also have collection drops.
    // Follow their existing output tables; no probability threshold is applied.
    for (const [skill, valids] of Object.entries(globalValids)) for (const name of Object.keys(valids)) {
        if (valids[name] === false) continue;
        const meta = chunkInfo.challenges[skill]?.[name];
        const loot = chunkInfo.skillItems[skill]?.[meta?.Output];
        for (const drop of Object.keys(loot || {})) for (const item of dropTables[drop] ? Object.keys(dropTables[drop]) : [drop]) {
            if (rlCollectionItems.has(item) && !backloggedSources.items?.[item]) (rlCollectionSources[item] ||= {})[name] = 'secondary-' + skill;
        }
    }
    for (const [item, sources] of Object.entries(rlCollectionSources)) {
        const current = Object.fromEntries(Object.entries(sources).filter(([source, kind]) =>
            kind === 'shop' ? baseChunkData.shops[source] : kind.includes('spawn') ? rlSourceAllowed('Spawns', item, source) :
                kind.includes('drop') ? baseChunkData.monsters[source] && rlSourceAllowed('Items', item + '^' + source) : !!globalValids[kind.split('-')[1]]?.[source]));
        if (Object.keys(current).length) acquisitionItems[item] = { ...acquisitionItems[item], ...current };
    }
    for (const [name, meta] of Object.entries(chunkInfo.challenges.Extra || {})) {
        if (!meta.Category?.includes('Collection Log') || meta.Items?.length !== 1 ||
            meta.Chunks || meta.Tasks || meta.Objects || meta.NPCs || meta.Monsters || meta.Skills ||
            meta.QuestPointsNeeded > rlAccess.actualQuestPoints ||
            (meta['Not F2P'] && rules.F2P) || manualTasks.Extra?.[name] === false ||
            !rlCollectionItems.has(meta.Items[0]) || !acquisitionItems[meta.Items[0]]) continue;
        atomicValids.Extra[name] = meta.Label || true;
    }
    const output = Roguelike.buildTasks({ data: chunkInfo, valids: atomicValids,
        base: { ...baseChunkData, items: acquisitionItems }, ids: rlContext.tasksMap, rules, state: rlContext.state,
        unlocked: rlContext.unlocked, sections: unlockedSections, manualSections, annotations: RoguelikeData });
    Object.keys(baseChunkData.items).forEach(name => rlPresentItems.add(name.replace(/\*.*$/, '')));
    const sourceDiagnostics = [...rlSourceDiagnostics.values()].filter(gate => {
        if (gate.type !== 'Items') return true;
        const [item, source] = gate.name.split('^');
        return rlPresentItems.has(item) && (!source || baseChunkData.monsters[source] || baseChunkData.npcs[source.replace('-npc', '')] || baseChunkData.shops[source]);
    });
    const needed = new Set(rlStructuralGates);
    const visitRequirement = (name, skill, seen = new Set()) => {
        for (const choice of Roguelike.expand(name, tasksPlus)) {
            const plain = choice.split('--')[0], key = 'task:' + Roguelike.taskId(plain, skill, rlContext.tasksMap);
            needed.add(key);
            if (seen.has(key)) continue;
            seen.add(key);
            // A quest/diary gate asks for that actual completion record; listing
            // its entire theoretical walkthrough obscures the actionable gate.
            if (skill === 'Quest' || skill === 'Diary') continue;
            for (const [sub, category] of Object.entries(chunkInfo.challenges[skill]?.[plain]?.Tasks || {})) visitRequirement(sub, category, seen);
        }
    };
    sourceDiagnostics.forEach(gate => {
        const requirements = Array.isArray(gate.requirements) ? gate.requirements : [gate.requirements?.Tasks || {}];
        requirements.forEach(group => Object.entries(group).forEach(([name, skill]) => visitRequirement(name, skill)));
    });
    return { ...output, sections: unlockedSections, accessDiagnostics: [...rlAccess.diagnostics.values()].filter(gate => needed.has(gate.key)).concat(sourceDiagnostics, output.accessDiagnostics || []),
        // These source counts make the calculation inspectable without returning the giant dataset.
        sourceCounts: Object.fromEntries(Object.entries(baseChunkData).map(([key, values]) => [key, Object.keys(values).length])) };
}
