'use strict';
// Optional browser integration test. Requires Playwright and Chromium or an installed Edge channel.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { makeRequest } = require('./boardlockedTestHarness');
const R = require('../boardlocked');
const baseURL = process.env.BL_TEST_URL || 'http://127.0.0.1:8080';
const output = process.env.BL_SCREENSHOT_DIR || path.join(require('node:os').tmpdir(), 'chunk-picker-boardlocked-smoke');

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(process.env.BL_BROWSER_CHANNEL ? { channel: process.env.BL_BROWSER_CHANNEL } : {}) });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        // Smoke testing never communicates changes to the upstream service.
        await context.route(/firebaseio\.com|cloudfunctions\.net|google-analytics\.com|googletagmanager\.com/, route => route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', err => { errors.push(err.message); console.error('PAGE ERROR:', err.message); });
        page.on('response', response => { if (response.status() >= 400) console.error('HTTP:', response.status(), response.url()); });
        page.on('console', event => { if (event.type() === 'error' && !event.text().includes('net::ERR_FAILED')) console.error('CONSOLE:', event.text()); });
        page.on('dialog', dialog => dialog.accept());
        const initial = makeRequest([]);
        const saved = { ...initial, tempChunks: { unlocked: {}, selected: { '6198': 1 } }, tempSelectedChunks: ['6198'],
            manualSections: { '6198': { '1': true } }, settings: { cinematicRoll: false, newTasks: false, shiftUnlock: false,
                chunkNeighboursOptions: { neighbors: true, remove: false, walkableRollable: true } } };
        delete saved.chunkInfo; delete saved.boardlocked;
        const state = R.normalizeState(); state.enabled = true;
        await page.addInitScript(({ saved, state }) => {
            if (!sessionStorage.getItem('bl-smoke-initialized')) {
                localStorage.setItem('chunk-picker-v2:local-run:v1:smoke', JSON.stringify({ version: 1, legacy: saved }));
                localStorage.setItem('chunk-picker-v2:boardlocked:v1:local:smoke', JSON.stringify(state));
                sessionStorage.setItem('bl-smoke-initialized', '1');
            }
        }, { saved, state });
        await page.goto(baseURL + '/?local=smoke', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.boardlockedController && !window.boardlockedController.debug().busy, null, { timeout: 60000 });
        console.log('Initial:', await page.evaluate(() => ({ errors: boardlockedController.debug().error, count: boardlockedController.debug().tasks.length })));
        assert.equal(await page.evaluate(() => boardlockedController.debug().error), '');
        const openPanel = async () => { if (!await page.locator('#bl-panel').isVisible()) await page.locator('#bl-launcher').click(); };
        const openSetup = async () => { await openPanel(); await page.locator('#bl-run-setup').evaluate(node => { node.open = true; }); };
        await openPanel();
        assert.equal(await page.locator('.menu9').isVisible(), false, 'only the visit task panel is shown by default');
        assert.equal(await page.locator('#bl-preset-status').innerText(), 'Rules: Boardlocked Chunker');
        const migratedVault = await page.evaluate(() => JSON.parse(localStorage.getItem('chunk-picker-v2:boardlocked-run:v2:smoke')));
        assert.equal(migratedVault.format, 'boardlocked-browser-save');
        assert.equal(migratedVault.boardlockedState.version, Boardlocked.VERSION);
        assert.ok(migratedVault.legacy.tempChunks.selected['6198']);
        await page.locator('#bl-show-rules').click();
        await page.locator('#rulesModal').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#rules-presets').getByText('Boardlocked Chunker', { exact: false }).count(), 1);
        await page.locator('#rulesModal .manual-close').click();
        await openPanel();
        await page.waitForFunction(() => readyToDrawImage && pageReady && canvas.width > 0);
        assert.equal(await page.locator('#import-menu').isVisible(), false);
        assert.equal(await page.locator('.menu13').isVisible(), false);
        const settle = async () => {
            try { await page.waitForFunction(() => !boardlockedController.debug().busy, null, { timeout: 60000 }); }
            catch (err) {
                console.error('SETTLE DEBUG:', await page.evaluate(() => ({ debug: boardlockedController.debug(), message: document.getElementById('bl-message')?.textContent,
                    sections: document.getElementById('sectionModal')?.style.display })));
                throw err;
            }
            assert.equal(await page.evaluate(() => boardlockedController.debug().error), '');
        };
        // Initial forced frontier ticket, followed by the user's sequence. The choices
        // are deterministic fixtures; the production roll still samples one ticket.
        for (const id of ['6198', '5942', '6454', '6197']) {
            if (id !== '6198') {
                await page.evaluate(id => {
                    tempChunks.selected = { [id]: 1 }; tempSelectedChunks = [id];
                    manualSections[id] = { '1': true }; setData();
                }, id);
                await settle();
                // Any already-live chunks still have tickets; choose the frontier's index.
                await page.evaluate(id => {
                    const candidates = boardlockedController.debug().pool.candidates;
                    const index = candidates.findIndex(c => c.locationId === id);
                    window.blSavedRandom = Math.random; Math.random = () => (index + .1) / candidates.length;
                }, id);
            }
            await page.locator('#bl-roll').click();
            await settle();
            await page.evaluate(() => { if (window.blSavedRandom) { Math.random = window.blSavedRandom; delete window.blSavedRandom; } });
            const visit = await page.evaluate(() => boardlockedController.debug().state.currentVisit);
            assert.equal(visit.locationId, id);
            console.log('Visit', id, visit.status, visit.candidateTaskIds.length);
            if (id === '6198' || id === '6454') assert.equal(visit.resolution, 'no_tasks');
            if (id === '5942') {
                await page.locator('#bl-candidates .bl-task').filter({ hasText: 'cooked chicken' }).locator('input[type=checkbox]').check();
                await settle();
                assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit.resolution), 'task_completed');
            }
        }
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.unlocked).length), 4);
        assert.match(await page.locator('#chunkInfo1').innerText(), /4/);
        assert.ok(await page.evaluate(() => boardlockedController.debug().pool.live.includes('6198')));
        assert.ok(await page.evaluate(() => boardlockedController.debug().tasks.some(t => /curved bone/.test(t.name))));
        // Pending snapshot survives actual reload, with the roll still disabled.
        const beforeReload = await page.evaluate(() => boardlockedController.debug().state.currentVisit.candidateTaskIds);
        await page.reload({ waitUntil: 'domcontentloaded' }); await settle();
        await openPanel();
        assert.deepEqual(await page.evaluate(() => boardlockedController.debug().state.currentVisit.candidateTaskIds), beforeReload);
        assert.ok(await page.locator('#bl-roll').isDisabled());
        await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
        // A specific tool acquisition resolves the visit, persists item ownership,
        // awakens dependent actions only for future visits, and removes equivalent
        // base-unlock alternatives.
        const axeSnapshot = beforeReload.slice();
        const bronzeEnabler = page.locator('#bl-candidates .bl-task').filter({ hasText: 'Obtain a bronze axe' });
        assert.equal(await bronzeEnabler.count(), 1);
        await bronzeEnabler.locator('input[type=checkbox]').check(); await settle();
        assert.ok(await page.evaluate(() => boardlockedController.debug().state.acquiredEnablers['Bronze axe']));
        assert.deepEqual(await page.evaluate(() => boardlockedController.debug().state.currentVisit.candidateTaskIds), axeSnapshot);
        assert.ok(await page.evaluate(() => boardlockedController.debug().tasks.some(t => t.name === 'Chop ~|logs|~' && t.eligible)));
        assert.equal(await page.evaluate(() => boardlockedController.debug().tasks.some(t => t.taskClass === 'enabler' && /iron axe/i.test(t.name))), false);
        assert.match(await page.locator('#bl-enabler-summary').innerText(), /1/);
        // An explicit admin revisit
        // must leave unlock history and selected-neighbor numbering alone.
        const geography = await page.evaluate(() => JSON.stringify([tempChunks, tempSelectedChunks, chunkOrder]));
        for (let repeat = 0; repeat < 2; repeat++) {
            await page.evaluate(() => {
                const candidates = boardlockedController.debug().pool.candidates;
                const index = candidates.findIndex(c => c.locationId === '5942');
                window.blSavedRandom = Math.random; Math.random = () => (index + .1) / candidates.length;
            });
            await page.locator('#bl-roll').click(); await settle();
            await page.evaluate(() => { Math.random = window.blSavedRandom; delete window.blSavedRandom; });
            assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit.kind), 'revisit');
            assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit.locationId), '5942');
            assert.equal(await page.evaluate(() => JSON.stringify([tempChunks, tempSelectedChunks, chunkOrder])), geography);
            if (repeat === 0) { await page.locator('#bl-candidates input[type=checkbox]').first().check(); await settle(); }
        }
        await page.locator('#bl-void').click(); await settle();
        await openSetup();
        await page.locator('#bl-admin-location').fill('5942');
        await page.locator('#bl-admin-visit').click(); await settle();
        assert.equal(await page.evaluate(() => JSON.stringify([tempChunks, tempSelectedChunks, chunkOrder])), geography);
        const snapshot = await page.evaluate(() => boardlockedController.debug().state.currentVisit.candidateTaskIds);
        // Rapid levels edits cancel old generations and never grow the visit snapshot.
        await page.getByText('Levels & skill progression', { exact: true }).click();
        await page.locator('#bl-level-Woodcutting').fill('59');
        await page.locator('#bl-level-Woodcutting').fill('60'); await settle();
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.actualLevels.Woodcutting), 60);
        assert.ok(await page.evaluate(() => boardlockedController.debug().tasks.some(t => t.level === 90 && /redwood/.test(t.name))));
        assert.deepEqual(await page.evaluate(() => boardlockedController.debug().state.currentVisit.candidateTaskIds), snapshot);
        await page.locator('#bl-void').click(); await settle();
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit.resolution), 'admin_void');
        // Snapshot JSON export is valid and includes the separate visit journal.
        const downloadPromise = page.waitForEvent('download'); await page.locator('#bl-export').click();
        const download = await downloadPromise; const exportPath = path.join(output, 'export.json'); await download.saveAs(exportPath);
        const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
        assert.equal(exported.version, R.VERSION); assert.equal(exported.boardlockedState.version, R.VERSION);
        assert.ok(exported.boardlockedState.acquiredEnablers['Bronze axe']);
        // Poison transient fields to prove import uses persistent facts and
        // recalculates skill progression and the pool on a clean profile.
        exported.legacy.tempChunks.selected = { '9999': 1 };
        exported.legacy.tempChunks.potential = { '8888': 1 };
        exported.boardlockedState.derivedPool = [{ locationId: '9999' }];
        const importedVisit = { visitNumber: Math.max(0, ...exported.boardlockedState.visitHistory.map(visit => visit.visitNumber)) + 1,
            timestamp: new Date().toISOString(), locationId: '5942', chunkName: 'stale imported visit', kind: 'revisit',
            candidateTaskIds: ['stale-imported-goal'], candidateTasks: { 'stale-imported-goal': { name: 'Old goal' } },
            status: 'task_required', resolution: null, resolvedTaskId: null, note: 'keep this note' };
        exported.boardlockedState.currentVisit = importedVisit;
        exported.boardlockedState.visitHistory.push(importedVisit);
        const importPath = path.join(output, 'import-with-stale-derived-fields.json');
        fs.writeFileSync(importPath, JSON.stringify(exported, null, 2));
        await page.goto(baseURL + '/?local=import-smoke', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => gotData && window.boardlockedController);
        await openPanel(); await settle(); await openSetup();
        await page.locator('#bl-import').setInputFiles(importPath);
        await page.waitForFunction(() => boardlockedController.debug().busy);
        await settle();
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.unlocked).length), 4);
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.selected || {}).includes('9999')), false);
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.potential || {}).includes('8888')), false);
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.derivedPool), undefined);
        assert.ok(await page.evaluate(() => boardlockedController.debug().state.acquiredEnablers['Bronze axe']));
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit.locationId), '5942');
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit.note), 'keep this note');
        assert.ok(!await page.evaluate(() => boardlockedController.debug().state.currentVisit.candidateTaskIds.includes('stale-imported-goal')));
        assert.ok(await page.evaluate(() => boardlockedController.debug().state.adminHistory.some(entry => entry.action === 'recalculate_imported_current_visit')));
        // Normal comparison is explicitly opened as a reference, without checkboxes.
        await page.locator('#bl-comparison').click();
        assert.equal(await page.locator('.menu9').isVisible(), true);
        assert.ok(await page.locator('.panel-active .challenge').count() > 0);
        assert.equal(await page.locator('.menu9 input[type=checkbox]:not(:disabled)').count(), 0);
        await page.screenshot({ path: path.join(output, 'legacy-comparison.png'), fullPage: true });
        await openPanel();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
        assert.ok(await page.locator('#bl-panel').evaluate(node => node.getBoundingClientRect().width <= innerWidth));
        await page.setViewportSize({ width: 1440, height: 1000 });
        // Custom rules survive reload; the explicit reset returns every rule to
        // the first-class preset (fresh clue logs stay off).
        await page.evaluate(() => { rules.Forestry = false; setData(); }); await settle(); await openPanel();
        assert.equal(await page.locator('#bl-preset-status').innerText(), 'Rules: Boardlocked Custom');
        await page.reload({ waitUntil: 'domcontentloaded' }); await settle(); await openPanel();
        assert.equal(await page.evaluate(() => rules.Forestry), false);
        await page.locator('#bl-reset-preset').click(); await settle();
        assert.equal(await page.evaluate(() => rules.Forestry), true);
        assert.equal(await page.evaluate(() => rules['Collection Log Clues']), false);
        assert.equal(await page.locator('#bl-preset-status').innerText(), 'Rules: Boardlocked Chunker');
        // Reset is scoped to this profile, supports cancellation, and truly clears
        // legacy and fork progress after a real browser reload.
        await openPanel();
        await page.locator('#bl-run-setup').evaluate(node => { node.open = false; });
        assert.equal(await page.locator('#bl-reset').isVisible(), true, 'full reset is visible without opening setup');
        assert.equal(await page.locator('#bl-reset').innerText(), 'Reset map & run');
        await page.evaluate(() => localStorage.setItem('chunk-picker-v2:local-run:v1:other-test', 'keep'));
        const beforeCancel = await page.evaluate(() => JSON.stringify([tempChunks, boardlockedController.debug().state]));
        page.removeAllListeners('dialog'); page.once('dialog', dialog => dialog.dismiss());
        await page.locator('#bl-reset').click();
        assert.equal(await page.evaluate(() => JSON.stringify([tempChunks, boardlockedController.debug().state])), beforeCancel);
        page.on('dialog', dialog => dialog.accept());
        await Promise.all([page.waitForEvent('load'), page.locator('#bl-reset').click()]); await settle();
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.unlocked || {}).length), 0);
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.selected || {}).length), 0);
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.potential || {}).length), 0);
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit), null);
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.visitHistory.length), 0);
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.adminHistory.length), 0);
        assert.equal(await page.evaluate(() => Object.keys(boardlockedController.debug().state.acquiredEnablers).length), 0);
        assert.deepEqual(await page.evaluate(() => boardlockedController.debug().progressionHighWater), await page.evaluate(() =>
            Boardlocked.deriveProgressionHighWater(Boardlocked.buildTaskCatalog(chunkInfo, tasksMap), {}, tasksMap)));
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.actualLevels.Woodcutting), 1);
        assert.equal(await page.evaluate(() => localStorage.getItem('chunk-picker-v2:local-run:v1:other-test')), 'keep');
        assert.deepEqual(await page.evaluate(() => [checkedAllTasks, checkedChallenges, completedChallenges, manualEquipment, backlog, manualSections, manualAreas, chunkOrder].map(store => Object.keys(store).length)), [0, 0, 0, 0, 0, 0, 0, 0]);
        // Continue a played run through real controls, not direct mutations of map globals.
        await openSetup();
        await page.locator('#bl-setup-chunks').fill('6198-1, invalid');
        await page.locator('#bl-add-unlocked').click();
        assert.match(await page.locator('#bl-message').innerText(), /Unknown chunk/);
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.unlocked || {}).length), 0);
        await page.locator('#bl-setup-chunks').fill('6198-1, 5942-1, 6454-1, 6197-1');
        await page.locator('#bl-add-unlocked').click(); await settle();
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.unlocked).length), 4);
        assert.deepEqual(await page.evaluate(() => Object.values(chunkOrder)), [6198, 5942, 6454, 6197]);
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit), null);
        assert.ok(await page.evaluate(() => boardlockedController.debug().pool.live.includes('5942')));
        assert.match(await page.locator('#bl-setup-status').innerText(), /5942: unlocked, re-rollable/);
        await page.locator('#bl-past-search').fill('cooked chicken');
        await page.locator('#bl-past-tasks input[type=checkbox]').first().check(); await settle();
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.progressionHighWater.Cooking), 1);
        assert.ok(!await page.evaluate(() => boardlockedController.debug().tasks.some(t => t.skilling && t.skill === 'Cooking' && t.level <= 1 && t.eligible)));
        assert.ok(await page.evaluate(() => boardlockedController.debug().tasks.some(t => /curved bone/.test(t.name) && t.eligible)));
        await page.reload({ waitUntil: 'domcontentloaded' }); await settle(); await openSetup();
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.progressionHighWater.Cooking), 1);
        await openPanel();
        await page.locator('#bl-enabler-summary').click();
        await page.locator('#bl-enabler-select').selectOption('Iron axe');
        await page.locator('#bl-add-enabler').click(); await settle();
        assert.ok(await page.evaluate(() => boardlockedController.debug().state.acquiredEnablers['Iron axe']));
        assert.ok(await page.evaluate(() => boardlockedController.debug().tasks.some(t => t.name === 'Chop ~|logs|~' && t.eligible)));
        await page.locator('#bl-enabler-list .bl-enabler-record').filter({ hasText: 'Iron axe' }).getByText('Remove', { exact: true }).click(); await settle();
        assert.equal(await page.evaluate(() => !!boardlockedController.debug().state.acquiredEnablers['Iron axe']), false);
        await page.locator('#bl-admin-location').fill('5942');
        await page.locator('#bl-admin-visit').click(); await settle();
        assert.equal(await page.evaluate(() => boardlockedController.debug().state.currentVisit.locationId), '5942');
        assert.equal(await page.locator('#bl-candidates .bl-task').filter({ hasText: 'cooked chicken' }).count(), 0);
        await page.locator('#bl-run-setup').evaluate(node => { node.open = false; });
        await page.screenshot({ path: path.join(output, 'continued-run.png'), fullPage: true });
        // A bare chunk ID uses the normal visual section picker instead of
        // silently staying locked behind the hidden legacy Calculate button.
        await page.goto(baseURL + '/?local=section-smoke', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => gotData && window.boardlockedController);
        await openPanel(); await settle(); await openSetup();
        await page.locator('#bl-setup-chunks').fill('6198');
        await page.locator('#bl-add-unlocked').click();
        await page.locator('#section-dropdown-1').waitFor({ state: 'visible' });
        await page.locator('#section-dropdown-1').selectOption('enable');
        await page.locator('#save-chunk-section-picker-button').click(); await settle();
        assert.equal(await page.evaluate(() => manualSections['6198']['1']), true);
        assert.equal(await page.evaluate(() => Object.keys(tempChunks.unlocked).length), 1);
        assert.deepEqual(errors, []);
        console.log('Browser smoke passed; screenshots and export:', output);
    } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
