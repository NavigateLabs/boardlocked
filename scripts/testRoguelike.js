'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const R = require('../roguelike');
const { makeRequest, usePreset, runWorker, declaration, declarationFrom } = require('./roguelikeTestHarness');
const fresh = () => R.normalizeState();
const origin = (id, sectionId = null) => ({ chunkId: id, sectionId, sourceType: 'objects', sourceName: 'Resource', reason: 'Action source' });
const task = (id, locations = ['1000'], rest = {}) => ({ taskId: id, name: id, displayName: id, skill: 'Woodcutting',
    origins: locations.map(id => origin(id)), activeOrigins: locations.map(id => origin(id)), available: true, eligible: true, ...rest });
const geo = { '1000': '1000', '2000': '2000', '3000': '3000' };
const adapt = (list, legacy = {}, state = fresh(), unlocked = geo, sections = {}, manual = {}) => R.adaptTasks(list, legacy, state, unlocked, sections, manual);
const start = (list, kind = 'revisit', id = '1000') => R.snapshotVisit(R.startVisit(fresh(), { kind, locationId: id }), list);

test('pool includes every frontier and live revisit exactly once', () => {
    const pool = R.derivePool(['4000', '5000', '4000', '1000'], geo, adapt([task('a')]), null);
    assert.deepEqual(pool.candidates.map(t => [t.kind, t.locationId]), [['frontier', '4000'], ['frontier', '5000'], ['revisit', '1000']]);
});
test('one task and 100 tasks give their locations equal one-ticket probability', () => {
    const list = [task('a'), ...Array.from({ length: 100 }, (_, n) => task('t' + n, ['2000']))];
    const pool = R.derivePool([], geo, adapt(list));
    assert.equal(pool.candidates.length, 2);
    assert.deepEqual(pool.candidates.map(c => c.weight), [1, 1]);
    assert.equal(R.chooseCandidate(pool.candidates, () => .25).locationId, '1000');
    assert.equal(R.chooseCandidate(pool.candidates, () => .75).locationId, '2000');
});
test('travel crosses contiguous free tiles and stops at the first encounter or locked boundary', () => {
    const unlocked = { '1000': '1000', '2000': '2000', '3000': '3000', '6000': '6000' };
    const graph = { '1000': ['2000', '4000'], '2000': ['1000', '3000', '5000'], '3000': ['2000', '6000'],
        '4000': ['1000'], '5000': ['2000'], '6000': ['3000'] };
    const pool = R.derivePool(['4000', '5000'], unlocked, adapt([task('encounter', ['3000'])], {}, fresh(), unlocked), null, graph, '1000');
    assert.deepEqual(pool.reachableFree, ['2000']);
    assert.deepEqual(pool.candidates.map(c => [c.kind, c.locationId, c.metadata.distance]),
        [['frontier', '4000', 1], ['revisit', '3000', 2], ['frontier', '5000', 2]]);
    assert.ok(!pool.candidates.some(c => c.locationId === '6000'), 'travel does not pass through the encounter at 3000');
});
test('an encounter blocks everything behind it even when the farther tile is also live', () => {
    const unlocked = { '1000': '1000', '2000': '2000', '3000': '3000' };
    const graph = { '1000': ['2000'], '2000': ['1000', '3000'], '3000': ['2000', '4000'], '4000': ['3000'] };
    const list = adapt([task('near', ['2000']), task('far', ['3000'])], {}, fresh(), unlocked);
    const pool = R.derivePool(['4000'], unlocked, list, null, graph, '1000');
    assert.deepEqual(pool.candidates.map(c => c.locationId), ['2000']);
    assert.deepEqual(pool.reachableLive, ['2000']);
});
test('current tile is offered only as a deadlock fallback', () => {
    const unlocked = { '1000': '1000' }, graph = { '1000': [] };
    const livePool = R.derivePool([], unlocked, adapt([task('here')], {}, fresh(), unlocked), null, graph, '1000');
    assert.deepEqual(livePool.candidates.map(c => c.kind), ['stay']);
    assert.equal(livePool.candidates[0].metadata.deadlockFallback, true);
    assert.equal(R.derivePool([], unlocked, [], null, graph, '1000').candidates.length, 0);
});
test('travel graph respects accessible sections and can enter any section of a locked boundary tile', () => {
    const data = { sections: {
        '1000': { '1': ['2000-1'], '2': ['3000-1'] },
        '2000': { '1': ['1000-1'] }, '3000': { '1': ['1000-2'] }
    } };
    const graph = R.buildTravelGraph(data, { '1000': '1000', '2000': '2000' }, { '1000': { '1': true }, '2000': { '1': true } }, ['3000']);
    assert.deepEqual(graph['1000'], ['2000']);
    const opened = R.buildTravelGraph(data, { '1000': '1000', '2000': '2000' },
        { '1000': { '1': true, '2': true }, '2000': { '1': true } }, ['3000']);
    assert.deepEqual(opened['1000'], ['2000', '3000']);
});
test('an imported map rebuilds transient frontier choices from persistent connections', () => {
    const data = { sections: { '1000': { '0': ['2000'] }, '2000': { '0': ['1000', '3000'] }, '3000': { '0': ['2000'] } } };
    assert.deepEqual(R.deriveConnectedFrontier(data, { '1000': '1000', '2000': '2000' }, ['1000', '2000', '3000']), ['3000']);
    assert.deepEqual(R.deriveConnectedFrontier(data, { '1000': '1000' }, ['1000', '2000', '3000'], { '2000': true }), []);
});
test('unlocked borders restore missing import section seeds without reopening explicit closures', () => {
    const data = { sections: {
        '1000': { '1': ['2000-2'], '3': ['3000-1'] },
        '2000': { '2': ['1000-1'] }, '3000': { '1': ['1000-3'] }
    } };
    const inferred = R.inferConnectedSections(data, { '1000': '1000', '2000': '2000', '3000': '3000' },
        { '1000': { '3': false } });
    assert.deepEqual(inferred, { '1000': { '1': true, '3': false }, '2000': { '2': true }, '3000': { '1': true } });
    const limited = R.inferConnectedSections(data, { '1000': '1000', '2000': '2000' }, {}, (from, to) =>
        ![from + '>' + to, to + '>' + from].includes('1000-1>2000-2'));
    assert.deepEqual(limited, {});
});
test('travel anchor is inferred from current visit, saved anchor, history, then unlock order', () => {
    const unlocked = { '1000': '1000', '2000': '2000', '3000': '3000' };
    let state = fresh();
    assert.equal(R.inferTravelAnchor(state, unlocked, { 1: 1000, 2: 3000 }), '3000');
    state.travelAnchor = '2000';
    assert.equal(R.inferTravelAnchor(state, unlocked, { 3: 3000 }), '2000');
    state.currentVisit = { visitNumber: 1, locationId: '1000' };
    assert.equal(R.inferTravelAnchor(state, unlocked, { 3: 3000 }), '1000');
});
test('setting an anchor is journaled and starting any visit moves the anchor', () => {
    let state = R.setTravelAnchor(fresh(), '2000', 'import correction', '2026-09-09T13:00:00.000Z');
    assert.equal(state.travelAnchor, '2000');
    assert.deepEqual(state.adminHistory.at(-1), { timestamp: '2026-09-09T13:00:00.000Z', action: 'set_travel_anchor',
        locationId: '2000', reason: 'import correction' });
    state = R.startVisit(state, { kind: 'frontier', locationId: '3000' });
    assert.equal(state.travelAnchor, '3000');
});
test('version 4 migration preserves progression and derives its anchor from the visit', () => {
    const old = fresh(); old.version = 4; delete old.travelAnchor; old.progressionHighWater.Cooking = 27;
    old.currentVisit = start(adapt([task('a')])).currentVisit;
    const migrated = R.normalizeState(old);
    assert.equal(migrated.progressionHighWater.Cooking, 27);
    assert.equal(migrated.travelAnchor, '1000');
});
test('dormant chunks have no ticket', () => {
    const pool = R.derivePool([], geo, adapt([task('done')], { checkedAllTasks: { Woodcutting: { done: true } } }));
    assert.equal(pool.candidates.length, 0); assert.equal(pool.dormant.length, 3);
});
test('revisit state operations do not mutate geographical objects', () => {
    const geography = Object.freeze({ unlocked: Object.freeze({ ...geo }), selected: Object.freeze({ '4000': 1 }) });
    const before = JSON.stringify(geography);
    let state = start(adapt([task('a')]));
    state = R.resolveVisit(state, new Set(['a']));
    R.startVisit(state, { kind: 'revisit', locationId: '1000' });
    assert.equal(JSON.stringify(geography), before);
});
test('the same revisit can be chosen consecutively', () => {
    const pool = R.derivePool([], geo, adapt([task('a'), task('b')]));
    const first = R.chooseCandidate(pool.candidates, () => 0);
    const second = R.chooseCandidate(pool.candidates, () => 0);
    assert.deepEqual(first, second);
});
test('empty candidate pool returns null and invalid RNG is rejected', () => {
    assert.equal(R.chooseCandidate([]), null);
    assert.throws(() => R.chooseCandidate([{ locationId: '1000' }], () => 1));
});
test('new zero-task chunk resolves immediately and permits the next roll', () => {
    const state = start([], 'frontier');
    assert.equal(state.currentVisit.kind, 'new');
    assert.equal(state.currentVisit.resolution, 'no_tasks');
    assert.equal(R.canRoll(state), true);
    assert.ok(R.derivePool([], geo, []).dormant.includes('1000'));
});
test('completion of any one snapshot candidate resolves a visit', () => {
    const state = start(adapt([task('a'), task('b'), task('other', ['2000'])]));
    assert.deepEqual(state.currentVisit.candidateTaskIds, ['a', 'b']);
    assert.equal(R.canRoll(state), false);
    const complete = R.resolveVisit(state, new Set(['b']));
    assert.equal(complete.currentVisit.resolvedTaskId, 'b');
    assert.equal(complete.currentVisit.resolution, 'task_completed');
});
test('incidental multiple completions remain global', () => {
    const completed = new Set(['a', 'b']);
    const state = R.resolveVisit(start(adapt([task('a'), task('b')])), completed);
    assert.equal(state.currentVisit.status, 'resolved');
    assert.deepEqual([...completed], ['a', 'b']);
});
test('completed and backlogged tasks are excluded from snapshots', () => {
    const tasks = adapt([task('a'), task('b'), task('c')], {
        completedChallenges: { Woodcutting: { a: true } }, backlog: { Woodcutting: { b: '' } }
    });
    assert.deepEqual(start(tasks).currentVisit.candidateTaskIds, ['c']);
});
test('tasks activated after snapshot do not join the current visit', () => {
    const first = start(adapt([task('a')]));
    const next = R.snapshotVisit(first, adapt([task('a'), task('new')]));
    assert.deepEqual(next.currentVisit.candidateTaskIds, ['a']);
    assert.equal(R.resolveVisit(next, new Set(['new'])).currentVisit.status, 'task_required');
});
test('an imported unresolved visit can be rebuilt in place from current tasks', () => {
    const imported = start(adapt([task('old')]));
    const recalculating = R.recalculateCurrentVisit(imported, 'newer rules', '2026-09-09T12:00:00.000Z');
    assert.equal(recalculating.currentVisit.status, 'pending_calculation');
    assert.deepEqual(recalculating.currentVisit.candidateTaskIds, []);
    assert.deepEqual(recalculating.currentVisit.candidateTasks, {});
    assert.equal(recalculating.currentVisit.visitNumber, imported.currentVisit.visitNumber);
    assert.equal(recalculating.currentVisit.locationId, imported.currentVisit.locationId);
    assert.equal(recalculating.visitHistory.at(-1).status, 'pending_calculation');
    assert.deepEqual(R.snapshotVisit(recalculating, adapt([task('new')])).currentVisit.candidateTaskIds, ['new']);
    assert.deepEqual(recalculating.adminHistory.at(-1), { timestamp: '2026-09-09T12:00:00.000Z',
        action: 'recalculate_imported_current_visit', visitNumber: 1, locationId: '1000', previousCandidateCount: 1, reason: 'newer rules' });
});
test('import recalculation leaves resolved history unchanged', () => {
    const resolved = R.resolveVisit(start(adapt([task('done')])), new Set(['done']));
    assert.deepEqual(R.recalculateCurrentVisit(resolved), resolved);
});
test('unresolved visit survives export/reload and remains blocking', () => {
    const state = R.normalizeState(JSON.parse(JSON.stringify(start(adapt([task('a')])))));
    assert.equal(R.canRoll(state), false);
    assert.throws(() => R.startVisit(state, { kind: 'revisit', locationId: '2000' }));
});
test('administrative invalidation does not manufacture gameplay completion', () => {
    const state = start(adapt([task('a')]));
    assert.equal(R.resolveVisit(R.snapshotVisit(state, []), new Set()).currentVisit.status, 'task_required');
    const voided = R.voidVisit(state, 'section closed');
    assert.equal(voided.currentVisit.resolution, 'admin_void');
    assert.equal(voided.currentVisit.resolvedTaskId, null);
    assert.deepEqual(voided.visitHistory[0].candidateTaskIds, ['a']);
});
test('dormant chunks automatically wake when tasks become available', () => {
    assert.ok(R.derivePool([], geo, []).dormant.includes('1000'));
    assert.ok(R.derivePool([], geo, adapt([task('activated')])).live.includes('1000'));
});
test('prerequisite provider B does not receive action task from A', () => {
    const currentTasks = adapt([task('chop', ['1000'], { enabler: '2000' })]);
    const pool = R.derivePool([], geo, currentTasks);
    assert.deepEqual(pool.live, ['1000']); assert.ok(pool.dormant.includes('2000'));
});
test('completion makes the last-task chunk dormant; uncompletion wakes it', () => {
    const list = [task('a')];
    assert.ok(R.derivePool([], geo, adapt(list, { checkedChallenges: { Woodcutting: { a: true } } })).dormant.includes('1000'));
    assert.ok(R.derivePool([], geo, adapt(list)).live.includes('1000'));
});
test('backlogging and unbacklogging update live state', () => {
    const list = [task('a')];
    assert.ok(R.derivePool([], geo, adapt(list, { backlog: { Woodcutting: { a: 'too soon' } } })).dormant.includes('1000'));
    assert.ok(R.derivePool([], geo, adapt(list)).live.includes('1000'));
});
test('closing and opening a section updates eligibility', () => {
    const list = [task('a', [], { origins: [origin('1000', '1')] })];
    assert.equal(adapt(list)[0].eligible, false);
    assert.equal(adapt(list, {}, fresh(), geo, { '1000': { '1': true } })[0].eligible, true);
    assert.equal(adapt(list, {}, fresh(), geo, { '1000': { '1': true } }, { '1000': { '1': false } })[0].eligible, false);
});
test('multi-origin task receives one global completion', () => {
    const list = [task('a', ['1000', '2000', '3000'])];
    assert.equal(R.derivePool([], geo, adapt(list)).live.length, 3);
    assert.equal(R.derivePool([], geo, adapt(list, { checkedAllTasks: { Woodcutting: { a: true } } })).live.length, 0);
});
test('manual origins take precedence, persist, and never unlock geography', () => {
    const state = fresh(); state.originOverrides.a = ['2000', '9999'];
    const restored = R.normalizeState(JSON.parse(JSON.stringify(state)));
    const list = adapt([task('a')], {}, restored);
    assert.deepEqual(list[0].origins.map(o => o.chunkId), ['2000', '9999']);
    assert.deepEqual(R.derivePool([], geo, list).live, ['2000']);
});
test('old maps default off; fresh levels are distinct from passive levels', () => {
    const state = fresh(); assert.equal(state.enabled, false); assert.equal(state.currentVisit, null);
    assert.equal(state.actualLevels.Hitpoints, 10); assert.equal(state.actualLevels.Sailing, 1);
    assert.equal(Object.keys(state.actualLevels).length, 24);
});
test('malformed and future-version saves are rejected without losing an existing visit', () => {
    assert.throws(() => R.normalizeState({ version: 2 }));
    assert.throws(() => R.normalizeState({ ...fresh(), actualLevels: { Woodcutting: 100 } }));
    assert.throws(() => R.normalizeState({ ...fresh(), currentVisit: { status: 'resolved' } }));
});
test('stable task IDs merge intermediate and highest representations', () => {
    assert.equal(R.taskId('Do task', 'Woodcutting', { 'Do task': '123' }), '123');
    assert.equal(R.taskId('Do task', 'Cooking', { 'Do task': '123' }), '123');
    assert.match(R.taskId('Custom', 'Extra'), /^rl_manual_/);
});
test('completion adapter reads stable IDs, legacy names and obtained gear', () => {
    const t = task('ID', ['1000'], { name: 'Equip item', skill: 'BiS', equipmentName: 'Tool' });
    for (const key of ['completedChallenges', 'checkedChallenges', 'checkedAllTasks']) {
        assert.equal(R.isComplete(t, { [key]: { BiS: { ID: true } } }), true);
        assert.equal(R.isComplete(t, { [key]: { BiS: { 'Equip item': true } } }), true);
    }
    assert.equal(R.isComplete(t, { manualEquipment: { Tool: true } }), true);
    assert.equal(R.isComplete(t, { checkedAllTasks: { Woodcutting: { ID: true } } }), true, 'skill projection completes the same ID globally');
});

function gateFixture(level) {
    const state = fresh(); state.actualLevels.Woodcutting = level;
    const data = { challenges: { Woodcutting: { Enter: { Level: 60, Primary: false } }, Quest: { Finish: { BaseQuest: 'Quest', QuestPoints: 1 } },
        Nonskill: { Door: { Tasks: { Finish: 'Quest' }, UnlocksArea: true } } }, codeItems: {} };
    return { state, data };
}
test('explicit source access gate uses actual levels, never theoretical highest', () => {
    const { data, state } = gateFixture(59);
    const access = R.createAccess(data, state, {}, {}, {});
    assert.equal(access.task('Enter', 'Woodcutting').allowed, false);
    assert.match(access.task('Enter', 'Woodcutting').reason, /59/);
});
test('reaching the actual access level opens that gate', () => {
    const { data, state } = gateFixture(60);
    assert.equal(R.createAccess(data, state, {}).task('Enter', 'Woodcutting').allowed, true);
});
test('checking off an access task never substitutes for its explicit actual level gate', () => {
    const { data, state } = gateFixture(59);
    assert.equal(R.createAccess(data, state, { checkedAllTasks: { Woodcutting: { Enter: true } } }).task('Enter', 'Woodcutting').allowed, false);
});
test('a task level above actual level is not an eligibility filter', () => {
    const list = adapt([task('high action', ['1000'], { level: 90 })]);
    assert.equal(list[0].eligible, true);
});
test('quest access requires actual completed steps, not theoretical doability', () => {
    const { data, state } = gateFixture(99);
    assert.equal(R.createAccess(data, state, {}).task('Door', 'Nonskill').allowed, false);
    assert.equal(R.createAccess(data, state, { checkedAllTasks: { Quest: { Finish: true } } }).task('Door', 'Nonskill').allowed, true);
});
test('unresolved gates expose diagnostics and support persistent overrides', () => {
    const { data, state } = gateFixture(59);
    const access = R.createAccess(data, state, {});
    const missing = access.task('Unknown', 'Nonskill');
    assert.equal(missing.allowed, false); assert.equal(missing.unresolved, true);
    state.accessOverrides[missing.key] = true;
    assert.equal(R.createAccess(data, R.normalizeState(JSON.parse(JSON.stringify(state))), {}).task('Unknown', 'Nonskill').allowed, true);
});

test('explicit access geography uses current sections and refreshes as they open', () => {
    const { data, state } = gateFixture(60);
    data.challenges.Nonskill.Region = { Chunks: ['1000-2'] };
    data.challenges.Nonskill.Parent = { Tasks: { Region: 'Nonskill' } };
    let open = false;
    const access = R.createAccess(data, state, {}, {}, {}, location => open && location === '1000-2');
    assert.equal(access.task('Parent', 'Nonskill').allowed, false);
    open = true;
    assert.equal(access.task('Parent', 'Nonskill').allowed, true);
    assert.equal(access.diagnostics.size, 0, 'old geography failures are removed');
    open = false;
    assert.equal(access.task('Region', 'Nonskill').allowed, false);
});

function sourceFixture() {
    const data = { challenges: { Woodcutting: { Chop: { Items: ['Tool'], Objects: ['Tree'], Level: 90 }, Unknown: { Level: 5 } },
        Cooking: { Cook: { Items: ['Raw food*'], Objects: ['Cooking object[+]'], Level: 20 } }, Extra: {}, Quest: {}, Diary: {} },
        codeItems: { objectsPlus: { 'Cooking object[+]': ['Player fire', 'Fire'] } }, equipment: {} };
    const base = { objects: { Tree: { '1000-1': true }, Fire: { '3000': true } }, monsters: { Animal: { '2000': true } }, npcs: {}, shops: {}, items: { Tool: { Animal: 'secondary-drop' }, 'Raw food': { Animal: 'primary-drop' } } };
    return { data, base, valids: { Woodcutting: { Chop: 90, Unknown: 5 }, Cooking: { Cook: 20 } }, ids: { Chop: 'chop', Unknown: 'unknown', Cook: 'cook' },
        rules: { 'Show Skill Tasks': true }, state: fresh(), unlocked: geo, sections: { '1000': { '1': true } } };
}
test('provenance follows a fixed action source, excluding its enabling tool', () => {
    const output = R.buildTasks(sourceFixture());
    assert.deepEqual(output.tasks.find(t => t.taskId === 'chop').origins.map(o => o.chunkId), ['1000']);
});
test('portable processing belongs to resource source rather than remote fire', () => {
    const output = R.buildTasks(sourceFixture());
    assert.deepEqual(output.tasks.find(t => t.taskId === 'cook').origins.map(o => o.chunkId), ['2000']);
});
test('unassigned provenance is diagnostic, never attributed to a recent location', () => {
    const output = R.buildTasks(sourceFixture());
    assert.ok(output.unassigned.some(t => t.taskId === 'unknown'));
    assert.deepEqual(output.tasks.find(t => t.taskId === 'unknown').origins, []);
});
test('source provenance retains multiple genuine action origins', () => {
    const fixture = sourceFixture(); fixture.base.objects.Tree['2000'] = true;
    const origins = R.buildTasks(fixture).tasks.find(t => t.taskId === 'chop').origins;
    assert.deepEqual(origins.map(o => o.chunkId), ['2000', '1000']);
});
test('source metadata is not mutated while deriving task origins', () => {
    const fixture = sourceFixture(), before = JSON.stringify(fixture);
    R.buildTasks(fixture); assert.equal(JSON.stringify(fixture), before);
});

test('source-specific regional drops belong only to the matching monster location', () => {
    const fixture = sourceFixture();
    fixture.data.challenges.Nonskill = { Region: { Chunks: ['2000'] } };
    fixture.data.taskUnlocks = { Items: { 'Raw food^Animal': [{ Region: 'Nonskill' }] } };
    fixture.base.monsters.Animal['3000'] = true;
    const cooked = R.buildTasks(fixture).tasks.find(t => t.taskId === 'cook');
    assert.deepEqual(cooked.origins.map(o => o.chunkId), ['2000']);
});
test('manual override also resolves the worker provenance diagnostic', () => {
    const fixture = sourceFixture(); fixture.state.originOverrides.unknown = ['2000'];
    const output = R.buildTasks(fixture);
    assert.equal(output.unassigned.length, 0);
    assert.equal(output.tasks.find(t => t.taskId === 'unknown').origins[0].chunkId, '2000');
});

function progressionFixture() {
    const data = { challenges: {
        Cooking: { Chicken: { Level: 1, Primary: true }, Bread: { Level: 1, Primary: true }, Pie: { Level: 10, Primary: true },
            Snail: { Level: 12, Primary: true }, Fish: { Level: 20, Primary: true },
            Higher: { Level: 30, Primary: true }, Minigame: { Level: 1, Primary: true, Category: ['Minigame'] },
            'Quest requirement': { Level: 1, Primary: false, Category: ['Quest Skill Reqs'] } },
        Woodcutting: { Logs: { Level: 1, Primary: true }, Tool: { Level: 1, Primary: false, Items: ['Axe'] } },
        Quest: { Quest: { Level: 1 } }, Diary: { Diary: { Level: 1 } }, Extra: { Collection: { Level: 1, Category: ['Collection Log'] } },
        BiS: { Equipment: { Level: 1 } }
    } };
    const ids = { Chicken: 'chicken', Fish: 'fish' };
    const catalog = R.buildTaskCatalog(data, ids);
    const list = catalog.map(t => ({ ...t, origins: [origin('1000')], available: true }));
    const get = (legacy, savedState = fresh()) => {
        const state = R.initializeProgression(savedState, catalog, legacy, ids);
        return R.adaptTasks(list, legacy, state, geo, {}, {}, catalog);
    };
    return { data, ids, catalog, list, get };
}

test('completing a skill task advances an exact high-water mark and opens only the forward window', () => {
    const f = progressionFixture();
    let tasks = f.get({ checkedAllTasks: { Cooking: { Chicken: true } } });
    assert.equal(tasks.find(t => t.name === 'Bread').eligible, false);
    assert.equal(tasks.find(t => t.name === 'Pie').eligible, true);
    assert.equal(tasks.find(t => t.name === 'Snail').eligible, true);
    assert.equal(tasks.find(t => t.name === 'Fish').progressionBlocked, true);
    assert.equal(tasks.find(t => t.name === 'Logs').eligible, true);
    tasks = f.get({ completedChallenges: { Cooking: { fish: true } } });
    assert.equal(tasks.find(t => t.name === 'Bread').eligible, false);
    assert.equal(tasks.find(t => t.name === 'Higher').eligible, true);
    assert.equal(R.derivePool([], geo, tasks).byLocation['1000'].includes('chicken'), false);
});

test('quests, diaries, collection, minigame and BiS objectives are not suppressed by skill progression', () => {
    const tasks = progressionFixture().get({ checkedAllTasks: { Cooking: { Fish: true }, Woodcutting: { Logs: true } } });
    for (const name of ['Quest', 'Diary', 'Collection', 'Minigame', 'Quest requirement', 'Equipment']) {
        assert.equal(tasks.find(t => t.name === name).eligible, true, name);
    }
    assert.equal(tasks.find(t => t.name === 'Tool').superseded, true, 'ordinary tool-use action shares the cleared skill band');
});

test('stored high-water marks survive unchecking and can be rebuilt from completed tasks', () => {
    const f = progressionFixture();
    const onlyBread = f.list.filter(t => t.name === 'Bread');
    const legacy = { checkedChallenges: { Cooking: { Fish: true } } };
    let state = R.initializeProgression(fresh(), f.catalog, legacy, f.ids);
    assert.equal(state.progressionHighWater.Cooking, 20);
    assert.equal(R.adaptTasks(onlyBread, legacy, state, geo, {}, {}, f.catalog)[0].eligible, false);
    delete legacy.checkedChallenges.Cooking.Fish;
    state = R.initializeProgression(R.normalizeState(JSON.parse(JSON.stringify(state))), f.catalog, legacy, f.ids);
    assert.equal(R.adaptTasks(onlyBread, legacy, state, geo, {}, {}, f.catalog)[0].eligible, false);
    state = R.initializeProgression(state, f.catalog, legacy, f.ids, true);
    assert.equal(state.progressionHighWater.Cooking, 0);
    assert.equal(R.adaptTasks(onlyBread, legacy, state, geo, {}, {}, f.catalog)[0].eligible, true);
});

test('actual levels and special completions never advance a skill-task high-water mark', () => {
    const f = progressionFixture(), state = fresh(); state.actualLevels.Cooking = 99;
    const legacy = { checkedAllTasks: { Cooking: { Minigame: true } } };
    const initialized = R.initializeProgression(state, f.catalog, legacy, f.ids);
    assert.equal(initialized.progressionHighWater.Cooking, 0);
    assert.equal(R.adaptTasks(f.list, legacy, initialized, geo, {}, {}, f.catalog).find(t => t.name === 'Bread').eligible, true);
});

test('a changed completed milestone does not silently rewrite or resolve an existing visit snapshot', () => {
    const f = progressionFixture(), visit = start(f.get({}));
    const later = f.get({ checkedAllTasks: { Cooking: { Fish: true } } });
    assert.deepEqual(R.snapshotVisit(visit, later).currentVisit.candidateTaskIds, visit.currentVisit.candidateTaskIds);
});

test('unlocked setup parser preserves order, deduplicates, validates sections and never changes input data', () => {
    const data = { chunks: { '1000': { Sections: { '1': {} } }, '2000': { Sections: { '1': {}, W1: {} } } } };
    const before = JSON.stringify(data);
    assert.deepEqual(R.parseUnlockedLocations('2000-W1 → 1000-1, 2000-W1', data), [R.parseLocation('2000-W1'), R.parseLocation('1000-1')]);
    assert.throws(() => R.parseUnlockedLocations('1000, garbage', data));
    assert.throws(() => R.parseUnlockedLocations('1000-9', data));
    assert.throws(() => R.parseUnlockedLocations('', data));
    assert.equal(JSON.stringify(data), before);
});

test('actual Cooking data skips level-one bread after chicken, including after reload', () => {
    const request = makeRequest(['5942']);
    const catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
    const chicken = catalog.find(t => /cooked chicken/.test(t.name));
    const bread = catalog.find(t => /Bake a loaf/.test(t.name));
    assert.equal(chicken.skilling, true); assert.equal(bread.skilling, true);
    const legacy = JSON.parse(JSON.stringify({ checkedAllTasks: { Cooking: { [chicken.taskId]: true } } }));
    const initialized = R.initializeProgression(fresh(), catalog, legacy, request.roguelike.tasksMap);
    const reloaded = R.normalizeState(JSON.parse(JSON.stringify(initialized)));
    const task = R.adaptTasks([{ ...bread, origins: [origin('5942')] }], legacy, reloaded, request.chunks, {}, {}, catalog)[0];
    assert.equal(task.eligible, false); assert.equal(task.completed, false);
    assert.match(task.eligibilityReason, /highest completed Cooking task \(level 1\)/);
});

test('Cooking uses a 15-level rolling window for gradual chicken-to-pie-to-fish progression', () => {
    const request = makeRequest(['5942']), catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
    const find = pattern => catalog.find(task => task.skill === 'Cooking' && pattern.test(task.displayName));
    const chicken = find(/cooked chicken/), bread = find(/Bake a loaf/), pie = find(/redberry pie/),
        snail = find(/thin snail/), salmon = find(/Cook a salmon/);
    assert.ok([chicken, bread, pie, snail, salmon].every(Boolean));
    const located = [chicken, bread, pie, snail, salmon].map(task => ({ ...task, origins: [origin('5942')], available: true }));
    let legacy = { checkedAllTasks: { Cooking: { [chicken.name]: true } } };
    let state = R.initializeProgression(fresh(), catalog, legacy, request.roguelike.tasksMap);
    let tasks = R.adaptTasks(located, legacy, state, request.chunks, {}, {}, catalog);
    assert.equal(state.progressionHighWater.Cooking, 1); assert.equal(R.progressionWindow('Cooking'), 15);
    assert.equal(tasks.find(task => task.taskId === bread.taskId).superseded, true);
    assert.equal(tasks.find(task => task.taskId === pie.taskId).eligible, true);
    assert.equal(tasks.find(task => task.taskId === snail.taskId).eligible, true);
    assert.equal(tasks.find(task => task.taskId === salmon.taskId).progressionBlocked, true);
    legacy = { checkedAllTasks: { Cooking: { [pie.name]: true } } };
    state = R.initializeProgression(fresh(), catalog, legacy, request.roguelike.tasksMap);
    tasks = R.adaptTasks(located, legacy, state, request.chunks, {}, {}, catalog);
    assert.equal(state.progressionHighWater.Cooking, 10);
    assert.equal(tasks.find(task => task.taskId === salmon.taskId).eligible, true);
});

test('every skill has an explicit progression window chosen for its task density', () => {
    assert.deepEqual(R.PROGRESSION_WINDOWS, {
        Attack: 10, Strength: 10, Defence: 10, Hitpoints: 25, Ranged: 10, Prayer: 20, Magic: 15,
        Cooking: 15, Woodcutting: 15, Fletching: 10, Fishing: 10, Firemaking: 15, Crafting: 10,
        Smithing: 10, Mining: 10, Herblore: 10, Agility: 20, Thieving: 10, Slayer: 20,
        Farming: 20, Runecraft: 15, Hunter: 10, Construction: 10, Sailing: 20
    });
    assert.deepEqual(Object.keys(R.PROGRESSION_WINDOWS).sort(), R.SKILLS.slice().sort());
});

test('a sparse skill exposes its nearest next milestone without pretending its origin is open', () => {
    const data = { challenges: { Cooking: {
        Low: { Level: 1, Primary: true }, High: { Level: 30, Primary: true }
    } } };
    const catalog = R.buildTaskCatalog(data);
    let state = R.initializeProgression(fresh(), catalog, { checkedAllTasks: { Cooking: { Low: true } } });
    assert.equal(state.progressionHighWater.Cooking, 1);
    const high = { ...catalog.find(task => task.name === 'High'), origins: [origin('2000')], available: true };
    const adapted = R.adaptTasks([high], {}, state, { '1000': '1000' }, {}, {}, catalog)[0];
    assert.equal(adapted.progressionBlocked, false); assert.equal(adapted.eligible, false);
    assert.equal(adapted.progressionCeiling, 30); assert.match(adapted.eligibilityReason, /geography/);
});

test('metadata classification lets only ordinary XP and direct item-use actions advance skill progression', () => {
    const f = progressionFixture();
    assert.equal(f.catalog.find(task => task.name === 'Chicken').taskClass, 'skill_progression');
    assert.equal(f.catalog.find(task => task.name === 'Chicken').advancesSkillProgression, true);
    for (const [name, taskClass] of [['Quest', 'quest'], ['Diary', 'diary'], ['Collection', 'collection'],
        ['Minigame', 'activity'], ['Quest requirement', 'quest'], ['Equipment', 'bis'], ['Tool', 'skill_progression']]) {
        const task = f.catalog.find(entry => entry.name === name);
        assert.equal(task.taskClass, taskClass, name);
        assert.equal(task.advancesSkillProgression, name === 'Tool', name);
    }
});

test('live acceptance actions retain exact levels without actual-level bypass', () => {
    const request = makeRequest(['6197', '5942']);
    const catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
    const find = (skill, pattern) => catalog.find(task => task.skill === skill && pattern.test(task.name));
    const actions = [find('Attack', /bronze weapon/), find('Attack', /iron weapon/), find('Woodcutting', /^Chop ~\|logs/),
        find('Woodcutting', /bronze axe/), find('Woodcutting', /iron axe/), find('Woodcutting', /^Chop ~\|oak logs/), find('Woodcutting', /^Chop ~\|yew logs/)];
    assert.ok(actions.every(Boolean)); assert.ok(actions.every(task => task.advancesSkillProgression));
    assert.deepEqual(actions.map(task => task.level), [1, 1, 1, 1, 1, 15, 60]);
    const state = R.initializeProgression({ ...fresh(), actualLevels: { ...fresh().actualLevels, Attack: 99, Woodcutting: 99 } }, catalog, {});
    assert.equal(state.progressionHighWater.Attack, 0); assert.equal(state.progressionHighWater.Woodcutting, 0);
});

test('live acceptance worker output replaces unavailable axe actions with specific Enabler acquisitions', () => {
    const request = usePreset(makeRequest(['6198', '5942', '6454', '6197']), 'Roguelike Chunker');
    request.roguelike.state.actualLevels.Attack = 99; request.roguelike.state.actualLevels.Woodcutting = 99;
    const result = runWorker(request).result, catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
    const state = R.initializeProgression(request.roguelike.state, catalog, {}, request.roguelike.tasksMap);
    const tasks = R.adaptTasks(result.tasks, {}, state, request.chunks, result.sections, request.manualSections, catalog);
    for (const pattern of [/bronze weapon/, /iron weapon/]) {
        assert.ok(tasks.some(task => pattern.test(task.name) && task.eligible), pattern);
    }
    for (const pattern of [/bronze axe/, /iron axe/]) assert.ok(tasks.some(task => task.taskClass === 'enabler' && pattern.test(task.name) && task.eligible), pattern);
    for (const pattern of [/^Chop ~\|logs/, /^Chop with .*bronze axe/, /^Chop with .*iron axe/]) {
        const task = tasks.find(task => pattern.test(task.name)); assert.ok(task, pattern);
        assert.equal(task.eligible, false); assert.match(task.eligibilityReason, /Persistent enabler not acquired/);
    }
    const oak = tasks.find(task => /^Chop ~\|oak logs/.test(task.name)); assert.ok(oak);
    assert.equal(oak.progressionBlocked, false); assert.equal(oak.eligible, false);
    assert.match(oak.eligibilityReason, /Persistent enabler not acquired/);
    const yew = tasks.find(task => /^Chop ~\|yew logs/.test(task.name)); assert.ok(yew);
    assert.equal(yew.eligible, false); assert.equal(yew.progressionBlocked, true);
    const mace = tasks.find(task => task.skill === 'BiS' && /iron mace/.test(task.name));
    assert.match(mace.bisReason, /Prayer BiS weapon/); assert.match(mace.bisReason, /Melee upgrade weapon/);
    assert.match(mace.displayName, /^\[/);
    assert.ok(!tasks.some(task => task.accessResult?.forestry && task.eligible));
});

test('bronze axe acquisition satisfies the base family, activates future Woodcutting, and leaves the visit snapshot fixed', () => {
    const request = usePreset(makeRequest(['6198', '5942', '6454', '6197']), 'Roguelike Chunker');
    const catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
    const beforeResult = runWorker(request).result;
    const beforeTasks = R.adaptTasks(beforeResult.tasks, {}, request.roguelike.state, request.chunks, beforeResult.sections, request.manualSections, catalog);
    const bronze = beforeTasks.find(task => task.taskClass === 'enabler' && task.enablerItemKey === 'Bronze axe');
    assert.ok(bronze?.eligible);
    let visit = R.snapshotVisit(R.startVisit(request.roguelike.state, { kind: 'revisit', locationId: '6197' }), beforeTasks);
    const snapshotIds = visit.currentVisit.candidateTaskIds.slice();
    visit.acquiredEnablers['Bronze axe'] = { evidenceTaskId: bronze.taskId };
    visit = R.resolveVisit(visit, new Set([bronze.taskId]));
    assert.equal(visit.currentVisit.resolution, 'task_completed');
    request.roguelike.state = visit;
    const afterResult = runWorker(request).result;
    const afterTasks = R.adaptTasks(afterResult.tasks, {}, visit, request.chunks, afterResult.sections, request.manualSections, catalog);
    assert.ok(afterTasks.some(task => task.name === 'Chop ~|logs|~' && task.eligible));
    assert.ok(afterTasks.some(task => /Chop with a ~\|bronze axe/.test(task.name) && task.eligible));
    assert.ok(!afterTasks.some(task => task.taskClass === 'enabler' && /iron axe/i.test(task.name)));
    assert.equal(afterTasks.find(task => /Chop with an ~\|iron axe/.test(task.name)).eligible, false);
    assert.deepEqual(R.snapshotVisit(visit, afterTasks).currentVisit.candidateTaskIds, snapshotIds);
});

test('iron axe acquired first satisfies the base family without requiring bronze afterward', () => {
    const request = usePreset(makeRequest(['6198', '5942', '6454', '6197']), 'Roguelike Chunker');
    request.roguelike.state.acquiredEnablers['Iron axe'] = { manual: true };
    const result = runWorker(request).result, catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
    const tasks = R.adaptTasks(result.tasks, {}, request.roguelike.state, request.chunks, result.sections, request.manualSections, catalog);
    assert.ok(tasks.some(task => task.name === 'Chop ~|logs|~' && task.eligible));
    assert.ok(tasks.some(task => /Chop with an ~\|iron axe/.test(task.name) && task.eligible));
    assert.ok(!tasks.some(task => task.taskClass === 'enabler' && /bronze axe/i.test(task.name)));
    assert.equal(tasks.find(task => /Chop with a ~\|bronze axe/.test(task.name)).eligible, false);
});

test('generic bronze weapon completion cannot prove ownership of a specific axe', () => {
    const request = makeRequest(['6197']);
    const generic = Object.keys(request.chunkInfo.challenges.Attack).find(name => /bronze weapon/.test(name));
    const old = R.normalizeState({ ...fresh(), version: 2, enablersInitialized: undefined, acquiredEnablers: undefined });
    const recovered = R.recoverAcquiredEnablers(old, { checkedAllTasks: { Attack: { [generic]: true } } },
        request.chunkInfo, request.roguelike.tasksMap, require('../roguelike-data'));
    assert.equal(recovered.enablersInitialized, true);
    assert.equal(R.own(recovered.acquiredEnablers, 'Bronze axe'), false);
    const specific = Object.keys(request.chunkInfo.challenges.Woodcutting).find(name => /Chop with a ~\|bronze axe/.test(name));
    const proven = R.recoverAcquiredEnablers(old, { checkedAllTasks: { Woodcutting: { [specific]: true } } },
        request.chunkInfo, request.roguelike.tasksMap, require('../roguelike-data'));
    assert.equal(R.own(proven.acquiredEnablers, 'Bronze axe'), true);
});

test('actual Woodcutting 99 does not bypass a missing persistent axe', () => {
    const request = usePreset(makeRequest(['6198', '5942', '6454', '6197']), 'Roguelike Chunker');
    request.roguelike.state.actualLevels.Woodcutting = 99;
    const result = runWorker(request).result, catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
    const tasks = R.adaptTasks(result.tasks, {}, request.roguelike.state, request.chunks, result.sections, request.manualSections, catalog);
    const chop = tasks.find(task => task.name === 'Chop ~|logs|~');
    assert.equal(chop.eligible, false); assert.match(chop.eligibilityReason, /not acquired/);
});

test('an acquired higher-tier tool cannot satisfy an action before its use level', () => {
    const request = usePreset(makeRequest(['6198', '5942', '6454', '6197']), 'Roguelike Chunker');
    request.roguelike.state.acquiredEnablers['Steel axe'] = { manual: true };
    request.roguelike.state.actualLevels.Woodcutting = 1;
    const below = runWorker(request).result.tasks.find(task => task.name === 'Chop ~|logs|~');
    assert.equal(below.available, false); assert.match(below.accessResult.reason, /not acquired/i);
    assert.ok(!below.accessResult.persistentEnablers[0].usableItems.includes('Steel axe'));
    request.roguelike.state.actualLevels.Woodcutting = 6;
    const usable = runWorker(request).result.tasks.find(task => task.name === 'Chop ~|logs|~');
    assert.equal(usable.available, true);
    assert.ok(usable.accessResult.persistentEnablers[0].usableItems.includes('Steel axe'));
});

test('BIS Skilling can retain an iron tool upgrade without duplicating it as a base Enabler', () => {
    const request = usePreset(makeRequest(['6197']), 'Roguelike Chunker');
    request.rules['BIS Skilling'] = true;
    request.roguelike.state.acquiredEnablers['Bronze axe'] = { manual: true };
    const result = runWorker(request).result;
    const upgrade = result.tasks.find(task => task.taskClass === 'bis' && task.bisSet === 'BIS Axe' && /iron axe/i.test(task.name));
    assert.ok(upgrade); assert.match(upgrade.bisReason, /BIS Skilling · BIS Axe/);
    assert.match(upgrade.bisReason, /Melee Tank upgrade weapon/);
    assert.deepEqual(upgrade.provesAcquiredItemKeys, ['Iron axe']);
    assert.ok(!result.tasks.some(task => task.taskClass === 'enabler' && /iron axe/i.test(task.name)));
});

test('consumable inputs do not become persistent Enabler tasks', () => {
    const data = { challenges: { Cooking: { Mix: { Items: ['Flour*'], Objects: ['Range'], Level: 1, Primary: true } },
        Extra: {}, Quest: {}, Diary: {} }, codeItems: { tools: { Flour: true }, itemsPlus: {} }, equipment: {} };
    const fixture = { data, valids: { Cooking: { Mix: 1 } }, base: { objects: { Range: { '1000': true } }, items: { Flour: { '2000': 'spawn' } },
        monsters: {}, npcs: {}, shops: {} }, rules: { 'Show Skill Tasks': true }, state: fresh(), unlocked: geo };
    const result = R.buildTasks(fixture);
    assert.equal(result.tasks.some(task => task.taskClass === 'enabler'), false);
    assert.equal(result.tasks.find(task => task.name === 'Mix').available, true);
});

test('separate persistent tool families do not unlock one another', () => {
    const data = { challenges: { Woodcutting: { Chop: { Items: ['Cutter[+]'], Objects: ['Tree'], Level: 1, Primary: true } },
        Mining: { Mine: { Items: ['Digger[+]'], Objects: ['Rock'], Level: 1, Primary: true } }, Extra: {}, Quest: {}, Diary: {} },
        codeItems: { itemsPlus: { 'Cutter[+]': ['Cutter one'], 'Digger[+]': ['Digger one'] }, tools: {} },
        toolLevels: { 'Cutter[+]': { 'Cutter one': 1 }, 'Digger[+]': { 'Digger one': 1 } }, equipment: {} };
    const state = fresh(); state.acquiredEnablers['Cutter one'] = { manual: true };
    const result = R.buildTasks({ data, valids: { Woodcutting: { Chop: 1 }, Mining: { Mine: 1 } },
        base: { objects: { Tree: { '1000': true }, Rock: { '3000': true } }, items: { 'Cutter one': { SourceA: 'drop' }, 'Digger one': { SourceB: 'drop' } },
            monsters: { SourceA: { '2000': true }, SourceB: { '2000': true } }, npcs: {}, shops: {} },
        rules: { 'Show Skill Tasks': true }, state, unlocked: geo });
    assert.equal(result.tasks.find(task => task.name === 'Chop').available, true);
    assert.equal(result.tasks.find(task => task.name === 'Mine').available, false);
    assert.ok(result.tasks.some(task => task.taskClass === 'enabler' && task.enablerItemKey === 'Digger one'));
});

test('acquired Enabler state and stable acquisition IDs round-trip without guessing', () => {
    const state = fresh();
    state.acquiredEnablers['Iron axe'] = { acquiredAt: '2026-09-09T00:00:00.000Z', source: { chunkId: '6197' } };
    state.enablersInitialized = true;
    state.rulePresetRevision = 2;
    const restored = R.normalizeState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(restored.acquiredEnablers, state.acquiredEnablers);
    assert.equal(restored.rulePresetRevision, 2);
    assert.equal(R.enablerItemFromTaskId(R.enablerTaskId('Iron axe')), 'Iron axe');
});

test('older states migrate to v5, exact completions replace automatic tiers, and explicit tier edits survive', () => {
    const migrated = R.normalizeState({ version: 1, enabled: true, visitHistory: [], actualLevels: { Cooking: 42 },
        derivedPool: ['stale'], origins: ['stale'] });
    assert.equal(migrated.version, 5); assert.equal(migrated.actualLevels.Cooking, 42);
    assert.equal(migrated.progressionInitialized, false); assert.equal(migrated.derivedPool, undefined);
    const legacyFrontiers = Object.fromEntries(R.SKILLS.map(skill => [skill, skill === 'Cooking' ? 4 : 0]));
    const explicit = R.normalizeState({ version: 2, enabled: true, visitHistory: [], progressionFrontiers: legacyFrontiers,
        frontiersInitialized: true, rulePresetInitialized: true,
        adminHistory: [{ action: 'set_progression_frontier', skill: 'Cooking', tier: 4 }] });
    assert.equal(explicit.legacyProgressionFrontiers.Cooking, 4); assert.equal(explicit.progressionInitialized, false);
    const initialized = R.initializeProgression(explicit, progressionFixture().catalog, {});
    assert.equal(initialized.progressionHighWater.Cooking, 59); assert.equal(initialized.legacyProgressionFrontiers, undefined);
    const v3 = R.normalizeState({ version: 3, enabled: true, visitHistory: [], acquiredEnablers: { 'Iron axe': { manual: true } },
        enablersInitialized: true });
    assert.deepEqual(v3.acquiredEnablers['Iron axe'], { manual: true }); assert.equal(v3.enablersInitialized, true);
    const imported = R.sanitizeLegacySnapshot({ tempChunks: { unlocked: { 1000: '1000' }, selected: { 9999: 1 }, potential: { 8888: 1 } },
        rules: { Forestry: true, Injected: true }, settings: { theme: 'dark', Injected: true }, globalValids: { stale: true } },
    ['Forestry'], ['theme']);
    assert.deepEqual(imported.tempChunks, { unlocked: { 1000: '1000' } });
    assert.deepEqual(imported.rules, { Forestry: true }); assert.deepEqual(imported.settings, { theme: 'dark' });
    assert.equal(imported.globalValids, undefined);
});

test('Roguelike Chunker preset has the strict broad-progression defaults', () => {
    const preset = declaration('rulePresets')['Roguelike Chunker'];
    for (const key of ['Show Skill Tasks', 'Show Quest Tasks', 'Show Diary Tasks', 'Show Best in Slot Tasks',
        'Show Best in Slot Prayer Tasks', 'Show Best in Slot Defensive Tasks',
        'Boss', 'Minigame', 'PvP Minigame', 'Collection Log', 'Pets', 'Jars', 'Forestry', 'Normal Farming',
        'Farming Primary', 'Tithe Farm', 'Smithing by Smelting', 'Spells', 'Combat and Teleport Spells',
        'Shortcut', 'Shortcut Task', 'Puro-Puro', 'Construction Milestone', 'Construction Minigame',
        'Sail Trimming', 'Crewmates', 'Sea Charting', 'Cleaning Herbs', 'Fish Offcuts Valid Processing']) assert.equal(preset[key], true, key);
    for (const key of ['Show Quest Tasks Complete', 'Show Diary Tasks Complete', 'Show Diary Tasks Any',
        'Collection Log Clues', 'Highest Level', 'Multi Step Processing', 'Quest Skill Reqs', 'Partial Products',
        'Shooting Star', 'Every Drop', 'All Droptables', 'All Shops', 'Superheat Furnace', 'ForestryXp', 'Raking',
        'Boss Level', 'Slayer Equipment']) assert.equal(R.own(preset, key), false, key);
    assert.equal(preset['Rare Drop Amount'], '0');
});

test('strict BiS uses actual equipment levels and exposes core weapon and defensive categories', () => {
    const request = usePreset(makeRequest(['5944', '6200']), 'Roguelike Chunker');
    const low = runWorker(request).result.tasks.filter(task => task.skill === 'BiS');
    assert.ok(low.some(task => task.equipmentName === 'Iron dagger' && /Melee BiS weapon/.test(task.bisReason)));
    assert.ok(low.some(task => task.equipmentName === 'Bronze med helm' && /Melee Tank/.test(task.bisReason)));
    assert.ok(!low.some(task => task.equipmentName === 'Rune scimitar'));
    assert.ok(!low.some(task => task.equipmentName === 'Rune kiteshield'));
    request.roguelike.state.actualLevels.Attack = 40;
    request.roguelike.state.actualLevels.Defence = 40;
    const high = runWorker(request).result.tasks.filter(task => task.skill === 'BiS');
    assert.ok(high.some(task => task.equipmentName === 'Rune scimitar'));
    assert.ok(high.some(task => task.equipmentName === 'Rune kiteshield'));
});

test('strict collection tasks use actual quest points', () => {
    const request = usePreset(makeRequest(['6193']), 'Roguelike Chunker');
    const result = runWorker(request).result;
    assert.ok(!result.tasks.some(task => /imp champion scroll/i.test(task.name)));
});

test('adding Roguelike Chunker leaves the upstream Vanilla, Xtreme and Supreme presets unchanged', () => {
    const root = path.join(__dirname, '..');
    const original = execFileSync('git', ['show', 'HEAD:index.js'], { cwd: root, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' }).replace(/\r\n/g, '\n');
    const before = declarationFrom(original, 'rulePresets'), current = declaration('rulePresets');
    for (const name of ['Vanilla Chunker', 'Xtreme Chunker', 'Supreme Chunker']) assert.equal(JSON.stringify(current[name]), JSON.stringify(before[name]), name);
});

test('Forestry case A: tree access without a kit yields no task and explains the missing Friendly Forester', () => {
    const request = makeRequest(['5942']); request.roguelike.state.actualLevels.Woodcutting = 99;
    const result = runWorker(request).result;
    assert.ok(!result.tasks.some(task => task.sourceCategories?.some(category => category === 'Forestry' || category === 'ForestryXp')));
    const gate = result.accessDiagnostics.find(entry => entry.forestry);
    assert.ok(gate); assert.equal(gate.kit.valid, false); assert.equal(gate.treeSource.valid, true);
    assert.match(gate.reason, /Friendly Forester/);
});

test('Forestry case B: kit access plus Guild-only trees still yields no eligible Forestry task', () => {
    const request = makeRequest(['5427', '6198', '6454']); request.roguelike.state.actualLevels.Woodcutting = 99;
    request.roguelike.state.acquiredEnablers['Forestry kit'] = { manual: true };
    const forestryObjects = new Set(Object.values(request.chunkInfo.challenges).flatMap(tasks => Object.values(tasks || {}))
        .filter(meta => meta.Category?.includes('Forestry') && meta.Objects).flatMap(meta => meta.Objects)
        .flatMap(name => R.expand(name, request.chunkInfo.codeItems.objectsPlus)));
    for (const section of Object.values(request.chunkInfo.chunks['5427'].Sections)) {
        for (const object of Object.keys(section.Object || {})) if (forestryObjects.has(object)) delete section.Object[object];
    }
    const result = runWorker(request).result;
    assert.ok(!result.tasks.some(task => task.accessResult?.forestry && task.available));
    const gate = result.accessDiagnostics.find(entry => entry.forestry && /non-Guild/.test(entry.reason));
    assert.ok(gate); assert.equal(gate.kit.valid, true); assert.equal(gate.treeSource.valid, false);
    assert.ok(gate.treeSource.excludedOrigins.some(origin => ['6198', '6454'].includes(origin.chunkId)));
});

test('Forestry case C: a kit provider and non-Guild tree produce a task with separate origins and enablers', () => {
    const request = makeRequest(['5427', '5942']); request.roguelike.state.actualLevels.Woodcutting = 99;
    request.roguelike.state.acquiredEnablers['Forestry kit'] = { manual: true };
    request.roguelike.state.acquiredEnablers['Bronze axe'] = { manual: true };
    const result = runWorker(request).result;
    const task = result.tasks.find(task => task.sourceCategories?.includes('Forestry') && /oak trees/.test(task.name) && task.available &&
        task.accessResult.treeSource.origins.some(origin => origin.chunkId === '5942'));
    assert.ok(task); assert.equal(task.taskClass, 'activity'); assert.equal(task.advancesSkillProgression, false);
    assert.ok(task.accessResult.kit.origins.some(origin => origin.chunkId === '5427'));
    assert.ok(task.enablers.some(enabler => enabler.type === 'forestry_tree'));
    assert.ok(task.origins.every(origin => !['6198', '6454'].includes(origin.chunkId)));
});

test('Forestry case D: a closed non-Guild tree section cannot satisfy the tree gate', () => {
    const request = makeRequest(['5427', '5942']); request.roguelike.state.actualLevels.Woodcutting = 99;
    request.roguelike.state.acquiredEnablers['Forestry kit'] = { manual: true };
    const forestryObjects = new Set(Object.values(request.chunkInfo.challenges).flatMap(tasks => Object.values(tasks || {}))
        .filter(meta => meta.Category?.includes('Forestry') && meta.Objects).flatMap(meta => meta.Objects)
        .flatMap(name => R.expand(name, request.chunkInfo.codeItems.objectsPlus)));
    for (const section of Object.values(request.chunkInfo.chunks['5427'].Sections)) {
        for (const object of Object.keys(section.Object || {})) if (forestryObjects.has(object)) delete section.Object[object];
    }
    request.manualSections['5942']['1'] = false;
    const result = runWorker(request).result;
    assert.ok(!result.tasks.some(task => task.accessResult?.forestry && task.available));
    const gate = result.accessDiagnostics.find(entry => entry.forestry && /tree source/.test(entry.reason));
    assert.ok(gate); assert.equal(gate.kit.valid, true); assert.equal(gate.treeSource.valid, false);
});

test('real worker: strict Guild sources, enabler provenance, old-chunk reactivation and rare collection tasks', () => {
    const before = runWorker(makeRequest(['6198', '5942', '6454'])).result;
    const request = makeRequest(['6198', '5942', '6454', '6197']);
    const { result, context } = runWorker(request);
    assert.equal(result.sourceCounts.shops, 0, 'Guild shops stay gated');
    assert.equal(vm.runInContext('baseChunkData.objects["Redwood tree"]', context), undefined);
    const lower = result.tasks.find(t => t.taskClass === 'enabler' && /bronze axe/i.test(t.name));
    assert.ok(lower, 'the obtainable lower tool becomes an atomic Enabler task');
    assert.ok(lower.origins.some(o => o.chunkId === '6197'));
    const oldAction = result.tasks.find(t => t.name === 'Chop ~|logs|~');
    assert.ok(oldAction.origins.some(o => o.chunkId === '6198'));
    assert.equal(oldAction.available, false);
    assert.ok(!before.tasks.some(t => t.name === oldAction.name), 'new tool enables previously dormant sources');
    const cook = result.tasks.find(t => /cooked chicken/.test(t.name));
    assert.deepEqual(cook.origins.map(o => o.chunkId), ['5942']);
    for (const word of ['curved bone', 'long bone', 'mossy key']) {
        const target = result.tasks.find(t => t.name.includes(word));
        assert.ok(target, word + ' remains a configured collection task');
        assert.ok(target.origins.some(o => o.chunkId === '5942'));
    }
    const tasks = R.adaptTasks(result.tasks, {}, request.roguelike.state, request.chunks, result.sections, request.manualSections);
    let state = R.snapshotVisit(R.startVisit(fresh(), { kind: 'frontier', locationId: '5942' }), tasks);
    state = R.resolveVisit(state, new Set([cook.taskId]));
    assert.equal(state.currentVisit.resolution, 'task_completed');
    const remaining = R.adaptTasks(result.tasks, { checkedAllTasks: { Cooking: { [cook.name]: true } } }, fresh(), request.chunks, result.sections, request.manualSections);
    assert.ok(R.derivePool([], request.chunks, remaining).live.includes('5942'));
    request.roguelike.state.acquiredEnablers['Bronze axe'] = { manual: true };
    const awakenedResult = runWorker(request).result;
    const awakened = awakenedResult.tasks.find(t => t.name === oldAction.name);
    assert.equal(awakened.available, true); assert.ok(awakened.origins.some(o => o.chunkId === '6198'));
    const awakenedOnly = R.adaptTasks([awakened], {}, request.roguelike.state, request.chunks,
        awakenedResult.sections, request.manualSections);
    assert.ok(R.derivePool([], request.chunks, awakenedOnly).live.includes('6198'));
});
test('real worker: higher Guild source becomes available at actual 60 while a level-90 action stays eligible', () => {
    const request = makeRequest(['6198', '5942', '6454', '6197']); request.roguelike.state.actualLevels.Woodcutting = 60;
    const { result, context } = runWorker(request);
    assert.ok(vm.runInContext('baseChunkData.shops["Perry\'s Chop-chop Shop"]', context));
    assert.ok(vm.runInContext('baseChunkData.items["Rune axe"]', context));
    const redwood = result.tasks.find(t => t.level === 90 && /redwood/.test(t.name));
    assert.ok(redwood); assert.ok(redwood.origins.some(o => o.chunkId === '6198'));
});
test('real worker: manually closed Guild section beats actual level 99', () => {
    const request = makeRequest(['6198', '5942', '6454', '6197']); request.roguelike.state.actualLevels.Woodcutting = 99;
    request.manualSections['6198']['1'] = false;
    const { result } = runWorker(request);
    assert.ok(!result.tasks.some(t => /redwood/.test(t.name)));
    assert.ok(!result.tasks.some(t => t.origins.some(o => o.chunkId === '6198' && o.sectionId === '1')));
});
test('imported Woodcutting Guild route opens through a free tile, then stops there after axe acquisition', () => {
    const chunkIds = ['5942', '6197', '6198', '6199', '6454'];
    function route(acquiredAxe) {
        const request = usePreset(makeRequest(chunkIds), 'Roguelike Chunker');
        request.manualSections = R.inferConnectedSections(request.chunkInfo, request.chunks, {});
        request.checkedAllTasks = { Woodcutting: { 'Access the ~|Woodcutting Guild|~': true } };
        const state = fresh();
        if (acquiredAxe) {
            state.acquiredEnablers['Bronze axe'] = { manual: true };
            state.enablersInitialized = true;
        }
        request.roguelike.state = state;
        request.roguelike.checkedAllTasks = request.checkedAllTasks;
        const { result } = runWorker(request);
        const catalog = R.buildTaskCatalog(request.chunkInfo, request.roguelike.tasksMap);
        const tasks = R.adaptTasks(result.tasks, { checkedAllTasks: request.checkedAllTasks }, state,
            request.chunks, result.sections, request.manualSections, catalog);
        const boundary = R.deriveConnectedFrontier(request.chunkInfo, request.chunks, request.chunkInfo.walkableChunks, {});
        const graph = R.buildTravelGraph(request.chunkInfo, request.chunks, result.sections, boundary);
        return R.derivePool(boundary, request.chunks, tasks, null, graph, '6199');
    }
    const before = route(false);
    assert.ok(before.reachableFree.includes('6198'));
    assert.ok(before.candidates.some(candidate => candidate.locationId === '6197'));
    assert.ok(before.candidates.some(candidate => candidate.locationId === '6710'));
    const after = route(true);
    assert.ok(after.candidates.some(candidate => candidate.kind === 'revisit' && candidate.locationId === '6198'));
    assert.ok(!after.candidates.some(candidate => ['6197', '6453', '6710'].includes(candidate.locationId)));
    assert.equal(after.byLocation['6198'].length, 2);
});
test('weapon choices retain every current upgrade and remove options at or below owned gear', () => {
    const calculate = (level, owned = null) => {
        const request = makeRequest(['6197', '6454']);
        // Test-only source fixture uses real equipment stats and an existing generic
        // source gate. Production has no item/chunk-specific progression branch.
        request.chunkInfo.chunks['6197'].Sections['1'] = { Spawn: { 'Bronze sword': 1 }, Object: { Tree: 1 } };
        request.chunkInfo.chunks['6454'].Sections['1'] = { Shop: { "Perry's Chop-chop Shop": true } };
        request.chunkInfo.shopItems["Perry's Chop-chop Shop"] = { 'Rune sword': 1 };
        request.roguelike.state.actualLevels.Woodcutting = level;
        request.roguelike.state.actualLevels.Attack = 40;
        if (owned) request.manualEquipment[owned] = true;
        return runWorker(request).result.tasks.filter(t => t.skill === 'BiS');
    };
    const below = calculate(59), above = calculate(60), owned = calculate(60, 'Bronze sword');
    assert.ok(below.some(t => /bronze sword/.test(t.name)));
    assert.ok(!below.some(t => /rune sword/.test(t.name)));
    assert.ok(above.some(t => /rune sword/.test(t.name)));
    assert.ok(above.some(t => /bronze sword/.test(t.name)), 'lower current upgrade remains selectable when nothing is owned');
    assert.ok(owned.some(t => /rune sword/.test(t.name)));
    assert.ok(!owned.some(t => /bronze sword/.test(t.name)), 'owned weapon is not offered again');
});

test('bronze dagger ownership exposes both iron dagger and rune scimitar as strict role upgrades', () => {
    const request = usePreset(makeRequest(['5944', '6200']), 'Roguelike Chunker');
    request.roguelike.state.actualLevels.Attack = 40;
    request.roguelike.state.actualLevels.Defence = 40;
    request.manualEquipment['Bronze dagger'] = true;
    const weapons = runWorker(request).result.tasks.filter(task => task.skill === 'BiS');
    const iron = weapons.find(task => task.equipmentName === 'Iron dagger');
    const rune = weapons.find(task => task.equipmentName === 'Rune scimitar');
    assert.ok(iron); assert.match(iron.bisReason, /Melee upgrade weapon/);
    assert.doesNotMatch(iron.bisReason, /Magic Tank/, 'equal role score is lateral, not an upgrade');
    assert.ok(rune); assert.match(rune.bisReason, /Melee BiS weapon/);
    assert.ok(!weapons.some(task => task.equipmentName === 'Bronze dagger'));
});
test('real worker: source backlog removes tasks supplied by that monster', () => {
    const request = makeRequest(['5942']); request.backloggedSources.monsters = { 'Moss giant': true };
    const { result } = runWorker(request);
    assert.ok(!result.tasks.some(t => /curved bone|long bone|mossy key/.test(t.name)));
});
test('real worker: collection completion is ordinary snapshot completion and rates are not a cutoff', () => {
    const request = makeRequest(['5942']); request.chunkInfo.drops['Moss giant']['Curved bone']['1'] = '1/999999999';
    const { result } = runWorker(request);
    const target = result.tasks.find(t => /curved bone/.test(t.name)); assert.ok(target);
    const list = R.adaptTasks(result.tasks, {}, fresh(), request.chunks, result.sections, request.manualSections);
    const state = R.snapshotVisit(R.startVisit(fresh(), { kind: 'revisit', locationId: '5942' }), list);
    assert.equal(R.resolveVisit(state, new Set([target.taskId])).currentVisit.resolution, 'task_completed');
});

test('real worker: collection acquisition respects regional and action gates while ignoring destination-use gates', () => {
    const { result } = runWorker(makeRequest(['5942']));
    assert.ok(result.tasks.some(t => /long bone/.test(t.name)));
    assert.ok(result.tasks.some(t => /curved bone/.test(t.name)));
    assert.ok(!result.tasks.some(t => /larran|ancient shard|dark totem/i.test(t.name)), 'non-Wilderness/non-Catacombs giants do not supply gated regional loot');
});
test('mode off: legacy worker output matches the unmodified local-clone worker', () => {
    const root = path.join(__dirname, '..');
    const original = execFileSync('git', ['show', 'HEAD:worker.js'], { cwd: root, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' });
    const request = makeRequest(['6198', '5942', '6454', '6197'], false);
    const baseline = runWorker(request, { code: original }).result;
    const current = runWorker(request).result;
    assert.deepEqual(current, baseline);
});
test('mode off: pick/roll2/unpick implementations retain original bodies after opt-in dispatch', () => {
    const root = path.join(__dirname, '..');
    const original = execFileSync('git', ['show', 'HEAD:index.js'], { cwd: root, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' }).replace(/\r\n/g, '\n');
    const current = fs.readFileSync(path.join(root, 'index.js'), 'utf8').replace(/\r\n/g, '\n');
    for (const name of ['pickCanvas', 'roll2Canvas', 'unpickCanvas']) {
        const fn = code => code.slice(code.indexOf('let ' + name + ' = function'), code.indexOf('\n}', code.indexOf('let ' + name + ' = function')) + 2);
        assert.equal(fn(current).replace(/^    if \(window\.roguelikeController\?\.enabled\(\)\).*\n/m, ''), fn(original));
    }
});
test('production mode logic contains no hard-coded seed or equipment exceptions', () => {
    const root = path.join(__dirname, '..');
    for (const file of ['roguelike.js', 'roguelike-worker.js', 'roguelike-ui.js']) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        assert.doesNotMatch(code, /6198|6197|5942|6454|bronze axe|rune axe/i);
    }
});
