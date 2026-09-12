'use strict';

const assert = require('node:assert/strict');
const data = require('../chunkpicker-chunkinfo-export.json');
const ids = require('../tasksMap.json');
const R = require('../boardlocked');
const annotations = require('../boardlocked-data');
const comparableItemKey = name => R.canonicalItemKey(name).replaceAll('#', '/').trim().toLowerCase();

const rows = [];
for (const [skill, tasks] of Object.entries(data.challenges || {})) {
    for (const [name, meta] of Object.entries(tasks || {})) {
        if (meta.Category?.includes('Collection Log')) rows.push({ skill, name, meta, taskId: ids[name] });
    }
}

const sources = new Map();
const add = (item, kind, source) => {
    const key = comparableItemKey(item);
    if (!key) return;
    if (!sources.has(key)) sources.set(key, []);
    sources.get(key).push({ kind, source });
};
const expandLoot = (loot, visiting = new Set()) => {
    const result = [];
    for (const raw of Object.keys(loot || {})) {
        if (data.codeItems.dropTables?.[raw] && !visiting.has(raw)) {
            result.push(...expandLoot(data.codeItems.dropTables[raw], new Set(visiting).add(raw)));
        } else result.push(...R.expand(raw, data.codeItems.itemsPlus));
    }
    return result;
};

for (const [monster, loot] of Object.entries(data.drops || {})) {
    expandLoot(loot).forEach(item => add(item, 'monster-drop', monster));
}
for (const [skill, tables] of Object.entries(data.skillItems || {})) {
    for (const [activity, loot] of Object.entries(tables || {})) {
        expandLoot(loot).forEach(item => add(item, 'activity-loot', skill + ': ' + activity));
    }
}
for (const [shop, stock] of Object.entries(data.shopItems || {})) {
    Object.keys(stock || {}).flatMap(item => R.expand(item, data.codeItems.itemsPlus))
        .forEach(item => add(item, 'shop', shop));
}
for (const [skill, tasks] of Object.entries(data.challenges || {})) {
    for (const [name, meta] of Object.entries(tasks || {})) {
        if (meta.Output) R.expand(meta.Output, data.codeItems.itemsPlus)
            .forEach(item => add(item, 'task-output', skill + ': ' + name));
        for (const reward of meta.Reward || []) add(reward, 'task-reward', skill + ': ' + name);
    }
}
for (const [chunkId, chunk] of Object.entries(data.chunks || {})) {
    for (const [sectionId, section] of Object.entries(chunk.Sections || {})) {
        for (const item of Object.keys(section.Spawn || {})) add(item, 'spawn', chunkId + '-' + sectionId);
    }
    for (const item of Object.keys(chunk.Spawn || {})) add(item, 'spawn', chunkId);
}
for (const override of annotations.collectionSourceOverrides || []) {
    (override.monsters || []).forEach(monster => add(override.item, 'reviewed-override', monster));
}
for (const definition of annotations.skillingPets || []) add(definition.item, 'skilling-pet', definition.skill);
for (const definition of annotations.incidentalCollections || []) {
    rows.filter(row => row.name.startsWith(definition.taskPrefix))
        .flatMap(row => row.meta.Items || []).flatMap(item => R.expand(item, data.codeItems.itemsPlus))
        .forEach(item => add(item, 'incidental-collection', definition.group));
}

const clueCatalog = R.clueRewardCatalog(data, {}, R.normalizeState(), ids);
const clueTaskIds = new Set(clueCatalog.rewards.flatMap(reward => reward.equivalentTaskIds));
const missingIds = rows.filter(row => !row.taskId);
const unresolvedClues = rows.filter(row => row.meta.Category.includes('Collection Log Clues') &&
    !clueTaskIds.has(row.taskId));
const hasDirectAcquisition = meta => Boolean(meta.Chunks || meta.NPCs || meta.Objects || meta.Monsters ||
    meta.Tasks || meta.Skills || meta.ManualInvalid);
const missingSources = rows.filter(row => !row.meta.Category.includes('Collection Log Clues')).filter(row => {
    if (hasDirectAcquisition(row.meta)) return false;
    const items = (row.meta.Items || []).flatMap(item => R.expand(item, data.codeItems.itemsPlus));
    return !items.length || !items.some(item => sources.has(comparableItemKey(item)));
});

assert.deepEqual(missingIds.map(row => row.name), [], 'Collection-log rows without stable task IDs');
assert.deepEqual(unresolvedClues.map(row => row.name), [], 'Clue collection rows missing tier ownership');
assert.deepEqual(missingSources.map(row => row.name), [], 'Collection-log rows without a source classification');

const uniqueItems = new Set(rows.flatMap(row => (row.meta.Items || [])
    .flatMap(item => R.expand(item, data.codeItems.itemsPlus)).map(comparableItemKey)));
console.log(JSON.stringify({
    collectionRows: rows.length,
    uniqueExplicitItems: uniqueItems.size,
    clueRewards: clueCatalog.rewards.length,
    classifiedSourceItems: sources.size,
    directlyClassifiedRows: rows.filter(row => hasDirectAcquisition(row.meta)).length,
    explicitlyUnavailableRows: rows.filter(row => row.meta.ManualInvalid).length,
    missingTaskIds: 0,
    unresolvedClueRows: 0,
    unclassifiedCollectionRows: 0
}, null, 2));
