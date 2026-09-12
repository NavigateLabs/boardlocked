'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const R = require('../boardlocked');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8').replace(/\r\n/g, '\n');
const chunkInfoJson = fs.readFileSync(path.join(root, 'chunkpicker-chunkinfo-export.json'), 'utf8');
const tasksMapJson = fs.readFileSync(path.join(root, 'tasksMap.json'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
const workerScript = new vm.Script(workerSource, { filename: 'worker.js' });
const workerUsesLodash = /\b_\./.test(workerSource);
const declarationCache = new Map();
const importedScriptCache = new Map();

// Use the clone's actual default objects and presets, not a second task/config database.
function declarationFrom(code, name) {
    const match = new RegExp('(?:let|const) ' + name + ' = ').exec(code);
    if (!match) throw new Error('Missing legacy declaration: ' + name);
    const tail = code.slice(match.index + match[0].length);
    const end = tail.indexOf(';') < tail.indexOf('\n') ? tail.indexOf(';') : tail[0] === '{' ? tail.indexOf('\n};') + 2 : tail[0] === '[' ? tail.indexOf('\n];') + 2 : tail.indexOf(';');
    return vm.runInNewContext('(' + tail.slice(0, end) + ')');
}
function declaration(name) {
    if (!declarationCache.has(name)) declarationCache.set(name, declarationFrom(index, name));
    return structuredClone(declarationCache.get(name));
}
function makeRequest(chunkIds = [], strict = true) {
    const data = JSON.parse(chunkInfoJson);
    const ids = JSON.parse(tasksMapJson);
    const result = { type: 'current', chunkInfo: data, chunks: Object.fromEntries(chunkIds.map(id => [String(id), String(id)])),
        requestId: 1, updateLevel: 'unconnected-areas', isDiary2Tier: false, isOnlyManualAreas: false,
        optOutSections: false, optOutSectionsWater: false, ...data.codeItems };
    for (const key of ['skillNames', 'processingSkill', 'maybePrimary', 'combatSkills', 'f2pSkills', 'unconnectedAreas',
        'manualTasks', 'completedChallenges', 'backlog', 'universalPrimary', 'highestCurrent', 'possibleAreas',
        'randomLoot', 'manualEquipment', 'checkedChallenges', 'backloggedSources', 'altChallenges', 'manualMonsters',
        'slayerLocked', 'passiveSkill', 'assignedXpRewards', 'manualAreas', 'constructionLocked', 'manualSections',
        'maxSkill', 'userTasks', 'manualPrimary']) result[key] = declaration(key);
    const presets = declaration('rulePresets');
    const presetName = Object.keys(presets).find(key => /xtreme/i.test(key));
    if (!presetName) throw new Error('No Xtreme preset in this clone');
    result.rules = declaration('rules');
    for (const key of Object.keys(result.rules)) result.rules[key] = Object.prototype.hasOwnProperty.call(presets[presetName], key) ? presets[presetName][key] : typeof result.rules[key] === 'boolean' ? false : result.rules[key];
    result.rareDropNum = '1/' + result.rules['Rare Drop Amount'];
    result.secondaryPrimaryNum = '1/' + result.rules['Secondary Primary Amount'];
    result.clueCompleteNum = result.rules['Collection Log Clues Amount'];
    result.manualSections = Object.fromEntries(chunkIds.map(id => [String(id), { '1': true }]));
    if (strict) {
        const state = R.normalizeState();
        // Existing worker tests isolate non-combat rules. Opt them into the
        // post-cutoff state; combat-progression tests explicitly restore a
        // fresh frontier.
        state.combatProgression = { frontier: 60, mature: true, evidence: [] };
        result.boardlocked = { state, checkedAllTasks: {}, tasksMap: ids, unlocked: { ...result.chunks } };
    }
    return result;
}
function usePreset(request, name) {
    const preset = declaration('rulePresets')[name];
    if (!preset) throw new Error('Unknown preset: ' + name);
    for (const key of Object.keys(request.rules)) request.rules[key] = Object.prototype.hasOwnProperty.call(preset, key) ?
        preset[key] : typeof request.rules[key] === 'boolean' ? false : request.rules[key];
    request.rareDropNum = '1/' + request.rules['Rare Drop Amount'];
    request.secondaryPrimaryNum = '1/' + request.rules['Secondary Primary Amount'];
    request.clueCompleteNum = request.rules['Collection Log Clues Amount'];
    return request;
}
function runWorker(request, options = {}) {
    const messages = [];
    const context = vm.createContext({ console, structuredClone, postMessage: message => messages.push(message) });
    context.importScripts = (...urls) => {
        for (const url of urls) {
            // worker.js currently imports lodash but calls none of its APIs.
            // Fail the harness if it starts using them instead of silently mocking it.
            if (/^https:/.test(url)) {
                if (workerUsesLodash) throw new Error('Harness requires the legacy lodash dependency');
                continue;
            }
            const relative = url.split('?')[0].replace(/^\.\//, '');
            if (!importedScriptCache.has(relative)) {
                const currentPath = path.join(root, relative);
                const source = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf8') :
                    execFileSync('git', ['show', 'HEAD:' + relative], { cwd: root, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' });
                importedScriptCache.set(relative, new vm.Script(source, { filename: url }));
            }
            importedScriptCache.get(relative).runInContext(context);
        }
    };
    (options.code ? new vm.Script(options.code, { filename: 'worker.js' }) : workerScript).runInContext(context);
    context.request = structuredClone(request);
    vm.runInContext('onmessage({data: request})', context, { timeout: 120000 });
    const failure = messages.find(message => message.type === 'error');
    if (failure) throw failure.err;
    const result = messages.findLast(message => message.type === (request.boardlocked ? 'boardlocked' : 'current'));
    if (!result) throw new Error('Worker returned no final result: ' + messages.map(m => m.type).join(', '));
    return { result: structuredClone(result), context, messages };
}
module.exports = { makeRequest, usePreset, runWorker, declaration, declarationFrom };
