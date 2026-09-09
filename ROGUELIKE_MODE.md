# Roguelike Mode (local fork)

## Inspection and design

The initial working tree was clean. This is a static, vanilla-JavaScript application;
there is no package.json or existing JavaScript test runner. Attribution in the
original files and README stays intact.

* `index.js`: `pickCanvas` moves `tempChunks.selected` to `unlocked`, calls
  `selectNeighborsCanvas`, and records `setRecentRoll`. `roll2Canvas` also uses
  `potential`. Revisits must bypass all these geographical mutations.
* `calcCurrentChallengesCanvas` creates `worker.js` with rules, geography, manual
  sections/areas, source backlogs and completion state. `workerOnMessage` receives
  `globalValids`; `calcCurrentChallenges2` collapses it to highest tasks. The All
  Tasks UI uses the underlying `globalValids` and `checkedAllTasks` instead.
* `worker.js`: `gatherChunksInfo` retains chunk-section keys for objects, monsters,
  NPCs and shops; items retain source names and source types. `calcChallenges`
  recursively expands processing outputs, task-unlocked sources, sections and
  areas. `calcBIS` uses existing equipment stats, styles, slots and obtained gear.
* Persistent action tools are represented through unstarred challenge `Items`.
  `codeItems.itemsPlus` supplies equivalent alternatives, and `toolLevels` gives
  the real Woodcutting/Mining use level for each axe or pickaxe alternative.
  `codeItems.tools` is a broader hint that also contains some consumed inputs;
  `magicTools` identifies transformation inputs rather than reusable implements.
  `BIS Skilling` records use `Set` and `Priority` to choose upgrades such as
  `BIS Axe`; they are not ownership records.
* `taskUnlocks` links sources (including individual shop stock) to prerequisites.
  The Guild example is already represented here, not by a whole-chunk gate.
  `Nonskill` tasks describe area and section connections. These must use actual
  completion/levels in the strict calculation, not theoretical trainability.
* Completion is spread across `checkedChallenges`, `completedChallenges`, and
  `checkedAllTasks`; gear also uses `manualEquipment`. `tasksMap.json` maps task
  names to stable IDs, with conversion at the Firebase persistence boundary.
* `setData` writes an explicit legacy schema to the upstream Firebase project.
  Existing URL exports primarily describe geography. Fork state therefore
  use namespaced localStorage per map, plus an explicit local run JSON export.

## Implementation boundaries

`roguelike.js` contains pure browser/Node helpers for versioned state, task
identity and completion adaptation, origins, strict gates, pools, and visits.
`roguelike-ui.js` owns the visit panel, journal, overrides and worker lifecycle.
`roguelike-worker.js` supplies small hooks that switch source/area/section prerequisites
to actual-state checks only for a roguelike request.

Normal Active Tasks remains available as an optional reference. When enabled, one additional
global strict worker calculation runs alongside the normal comparison calculation.
Neither calculation runs once per unlocked chunk. A source sidecar and memoized
item/task graph resolve provenance from the final validated source data. Fixed
action anchors outrank enabling tools; portable processing needs a resource anchor
or an explicit override. Ambiguity is diagnostic, never a last-unlocked heuristic.

The persistent state is version 5: `enabled`, `actualLevels` (HP 10, other skills
1), per-skill `progressionHighWater`, progression/preset initialization flags,
the additive preset revision, `acquiredEnablers`, `travelAnchor`, `currentVisit`, `visitHistory`,
`originOverrides`, `accessOverrides`, and an
administrative journal. Pools, source indexes and atomic tasks are derived.
Visits snapshot stable task IDs and compact display/category metadata only after recalculation. Completion resolves any
one snapshot candidate; changes in eligibility never manufacture completion.
Administrative void/recalculate is explicit, confirmed and journalled.

Roll candidates have `{kind, locationId, weight: 1, metadata}`. The current tile is
the travel anchor. The pool follows the map's section connection graph from that
anchor, passes through contiguous unlocked tiles with zero eligible tasks, and
stops at the first encounter or locked frontier tile on each path. Every distinct
destination gets one ticket regardless of distance or task count. The current tile
is a candidate only as a deadlock fallback when it still has tasks and there is no
outward destination. New rolls unlock once; revisits only create visits. Roll 2/5,
random Unpick, and Random Start Always are disabled for this mode. A new zero-task
visit resolves freely and becomes the anchor for another cost-free travel roll.

## Run locally and play

From this directory with Node.js 18 or later:

```powershell
cd C:\chunk-picker-v2
node scripts/serveLocal.js
```

Open **http://127.0.0.1:8080/?local=default**, open **Roguelike OFF**, and enable
the mode. No build or package installation is required for the application.
A fresh local profile applies the **Roguelike Chunker** preset the first time the
mode is enabled. Use `?local=profile-name` for a separate run. Existing public CDN libraries
are still needed, so the application is not fully offline.

* Roll one reachable new boundary tile or unlocked encounter. Existing free tiles
  are crossed while the pool is built, and each resulting destination has one
  ticket regardless of distance or task count.
* Complete **any one** current snapshot candidate to roll again. Multiple incidental
  completions remain global. A zero-task visit resolves freely.
* Edit **Levels & skill progression** to record actual progress. Hitpoints defaults to 10,
  other skills to 1; these values are independent of Passive Levels. Completing
  tasks never invents actual levels.
* Register recovered reusable tools under **Acquired Enablers**. Each entry shows
  its capability family and recorded source. Adding or removing one recalculates
  all unlocked chunks.
* Free tiles automatically become encounters when their tasks become eligible; the
  next pool rebuild stops travel at them. **Current visit** is the main place to check off tasks. The legacy
  task panel is hidden by default; **Show normal task reference** reveals it with
  task checkboxes disabled. Mode OFF restores its normal interaction.
* Rule/access/backlog edits never silently resolve the visit. Confirm **Void /
  recalculate current visit** for an administrative void; its original snapshot
  stays in history. This recalculates future availability. Use **Set current tile**
  to correct a travel anchor, or **Resume unfinished visit here** to create a
  recovery visit in an already-unlocked chunk.
* Manual unlocks update the connection graph, pool and journal without creating gameplay visits.
  Void an unresolved current visit before manually re-locking its chunk.
* Roll 2/5 and random Unpick are hidden and guarded. Random Start Always is ignored
  while enabled; after the first roll, the reachable travel pool is authoritative.
* Turning mode OFF restores normal rolling and retains the local visit journal.
  Every free unlocked tile is blue and labelled **FREE**, reachable encounters are
  teal and labelled **TASK**, and the current tile has a gold border. Green numbered tiles are the exact reachable new-tile
  candidates; hidden legacy borders cannot be clicked while the mode is active.

### Reset and continue a played run

**Reset map & run** is directly below the mode toggle, outside any collapsed
section. **Run setup · continue or reset** contains export/import and continuation controls:

1. **Reset map & run** clears this local profile's geography,
   completions, equipment, levels, rules/settings, backlogs, overrides and journal
   after confirmation. It reloads all legacy globals and retains only whether
   Roguelike Mode was enabled. It never clears another profile or backend map.
   This full reset is available on `?local=...` runs. Export first if you want a copy.
2. **Add unlocked chunks** accepts chunk IDs in unlock order, separated by commas,
   spaces or arrows. It adds permanent geography and normal neighboring frontier
   selections, preserves existing progress, and records the supplied unlock order
   administratively without fabricating gameplay visits. Repeated IDs are harmless.
3. Optional explicit sections use `chunk-section`, for example
   `6198-1, 5942-1, 6454-1, 6197-1`. Bare IDs prompt for accessible sections when
   the existing map cannot infer them. The visual section picker now opens instead
   of leaving calculation waiting on a hidden legacy button. Unspecified sections
   keep the usual geography rules; explicit section selections are administrative.
4. **Record completed tasks** searches the full existing database, including tasks
   not currently accessible. Its checkboxes write the same legacy completion
   records used elsewhere. Enter actual levels separately under **Levels & skill progression**.
5. Current progress classifies every unlocked chunk automatically. A chunk with an
   eligible unfinished task is an encounter; otherwise it is a free travel tile.
   This is derived on every recalculation and is never stored as an import flag.
   Missing transient section seeds are reconstructed from connections between
   permanently unlocked chunks. Explicitly closed sections and incomplete
   connection requirements remain closed.
6. Import chooses the current visit location when present, then a saved travel
   anchor, visit history, and the latest unlock-order entry. **Set current tile**
   corrects that administrative starting point without creating a visit.
7. If ready to roll, use **Roll next location**. If resuming an unfinished visit,
   enter its already-unlocked chunk and click **Resume unfinished visit here**. An
   existing unresolved visit must first be completed or explicitly voided.

### Skill progression windows

Each skill stores the exact level of its highest completed ordinary Skill Task.
A future ordinary task must be strictly higher than that mark, so a level-1 task
cannot follow another level-1 task and a lower-level task can never return. It must
also fit inside the skill's forward window. Completing level 1 Cooking, for example,
opens levels 2–16: redberry pie and thin snail meat remain possible, while salmon
waits. Completing the level-10 pie opens through level 25 and makes salmon possible.
Actual skill levels remain separate and control access rather than task order.

The windows reflect the density of the local task data:

| Window | Skills |
| --- | --- |
| +10 | Attack, Strength, Defence, Ranged, Fletching, Fishing, Crafting, Smithing, Mining, Herblore, Thieving, Hunter, Construction |
| +15 | Magic, Cooking, Woodcutting, Firemaking, Runecraft |
| +20 | Prayer, Agility, Slayer, Farming, Sailing |
| +25 | Hitpoints |

When a sparse skill has no task in its normal window, only its nearest later task
level is opened. This prevents deadlocks without making every distant milestone
available. High-water marks persist across reload and ordinary unchecking. The
number editor supports recovery per skill, and **Rebuild from completed tasks**
deliberately re-derives exact marks from completion records. Version-1 through
version-3 saves also re-derive exact marks; an explicitly journalled manual tier
edit is conservatively migrated. Existing immutable visit snapshots remain
unchanged; progression changes affect future snapshots.

Classification is metadata based. `skill_progression` requires a skill level,
XP eligibility, and no special category. It includes `Primary: true` actions plus
direct item/tool-use actions with no reward, fixed geography, prerequisite, or
non-equipment marker. Quest, diary, BiS, collection, and category-labelled
activities are classified separately; permanent unlocks and reward/meta records
remain `other`. Only
`advancesSkillProgression: true` can raise a high-water mark. Each task’s expandable
details show the stable ID, source categories, class and reason, progression flag,
origins, enablers, access result, and eligibility reason.

### Persistent enablers and tool acquisition

An `enabler` task is a specific persistent item acquisition under **Unlocks /
Tools**. Canonical dataset item keys identify acquisitions; rendered task text is
not used as identity. The item source graph supplies the acquisition task's
monster, shop, spawn, NPC, or action origin. Dependent actions keep their own
object/resource origins.

Reusable capabilities are derived in this order:

1. A `toolLevels` item group is a strong levelled capability family. The action's
   actual skill level determines which family members can currently satisfy it.
2. Other `itemsPlus` groups qualify when every alternative is either in the
   upstream `tools` table or has a concrete `BIS Skilling` item record.
3. An unstarred direct requirement in `tools` qualifies when it is not in
   `magicTools` and equipment metadata does not mark it consumable.
4. The small annotation file handles upstream persistence gaps and the few broad
   `tools` entries that are actually consumed. Mixed groups remain conservative
   and appear under **Ambiguous tool metadata**.

A grouped action requires one acquired, currently usable family member. A task
that names one exact member still requires that exact item, but it does not turn
every later family member into another base Enabler. Before the first usable axe,
the live data therefore offers bronze and iron acquisition tasks and blocks the
three Woodcutting actions. After either acquisition, basic axe capability exists;
the matching exact-use task and `Chop logs` can activate on future visits. The
other exact-use task stays blocked, while a separately enabled `BIS Skilling`
rule may still offer the better tool as `BIS Skilling · BIS Axe`.

Completing an Enabler records the item before recalculation and resolves the
current visit normally. The visit's immutable candidate snapshot does not gain
newly awakened actions. A specific tool-use or specific BiS acquisition can also
prove possession of that exact item. Generic alternatives such as `Wield a bronze
weapon` never prove which member was obtained. Acquisition itself never advances
skill progression.

### Roguelike Chunker rule preset

The preset is a normal Rules-modal preset and can be applied there. The Roguelike
panel shows **Rules: Roguelike Chunker** only while every rule exactly matches;
otherwise it shows **Rules: Roguelike Custom**. **Reset Roguelike preset** restores it.
The first enable applies it once; later off/on toggles preserve customization.
Existing Roguelike profiles receive the new Defensive BiS default once; afterward
the rule can still be turned off normally.
An existing enabled clue-log choice is preserved during first-enable migration;
the fresh/reset preset leaves clue tasks off.

Boolean rules ON are: Rare Drop, Construction Milestone, Construction
Minigame, Boss, Normal Farming, Tithe Farm,
Spells, Show Skill Tasks, Show Quest Tasks, Show Diary Tasks, Show Best in Slot
Tasks, Prayer Tasks, Defensive Tasks, Collection Log, Pets, Jars, Minigame,
PvP Minigame, Shortcut Task, Shortcut, Forestry, Puro-Puro, Collection Log
Bosses/Raids/Minigames/Other, Farming Primary, Primary Spawns, Smithing by
Smelting, Combat and Teleport Spells, Cleaning Herbs, Sail
Trimming, Crewmates, Sea Charting, and Fish Offcuts Valid Processing. Every other
boolean rule is OFF. Numeric values are Kill X Amount 1, Rare Drop Amount 0,
Collection Log Clues Amount 100, and Secondary Primary Amount 1. In particular,
completion-only quest/diary modes, clue logs, Highest Level, Multi Step Processing,
Quest Skill Reqs, Partial Products, Shooting Star, ForestryXp, Raking, Boss Level,
Slayer Equipment, Every Drop, All Droptables, All Shops, and Superheat Furnace are OFF.

## Provenance and strict access

The final validated source graph supplies action locations, not a before/after
diff. Fixed objects/NPCs/monsters take priority over enabling tools. Acquisition
sources and primary consumed resources anchor portable processing. The existing
generic cooking-object group is portable; a marked ingredient supplies its anchor.
Multiple genuine origins share one task ID and global completion. Ambiguous
entries stay visible as **Unassigned Roguelike Tasks**, outside the roll pool until
metadata or an override supplies an origin.

Strict prerequisites reuse `taskUnlocks`, `Nonskill`, `sectionsLimits`, manual
areas/sections and actual quest progress. Explicit prerequisite levels, combat,
total levels and geography use actual state. Quest/step completion must be recorded;
a completed base quest satisfies its steps. Unknown action/inventory gates are
conservative and diagnostic. Checking off an access task does not substitute for
its explicit actual level. Closed physical sections remain authoritative.

Ordinary task levels may require further training. The local Guild data opens its
listed sources at actual 60 Woodcutting with an accessible section; a redwood
action still needs an acquired axe that can actually be used. The existing `calcBIS` operates on
strictly accessible sources using its original stats/styles/slots and obtained
gear. Combat equipment continues to use that legacy calculation; reusable action
tools use the separate `acquiredEnablers` record described above.

Forestry has an additional conjunctive gate. A task needs a Forestry kit actually
recorded as acquired and an
eligible tree object in accessible geography. Tree objects in the existing
`Woodcutting guild[+]` group are removed by the small annotation in
`roguelike-data.js`. The task action stays attributed to its real tree/facility;
the kit provider and tree requirement are exposed separately under `enablers`.
Before acquisition, its task and provenance come through the existing `Forestry
kit` → `Friendly Forester` metadata. After acquisition, that provider does not
need to remain accessible. When either required side is absent, access diagnostics name the missing side and list valid
and excluded sources. The prior bug came from the legacy worker treating the
`Forestry` rule flag as enough for category visibility while collection acquisition
could also project Forestry outputs without a kit path.

The pre-fix live-data audit attributed the oak and yew Forestry actions to
`5942-1`, `6197-1`, `6198-1`, and `6454-1`; willow and maple were attributed to
`6454-1`, and magic to `6198-1`. The Forestry kit and Friendly Forester source
graphs were both empty for that run. `6198-1` and `6454-1` are the two members of
the existing `Woodcutting guild[+]` group, so they are now excluded. The remaining
non-Guild tree locations become usable only when a separate accessible kit source
also exists.

A collection acquisition sidecar retains configured drops without any probability
cutoff. Locked use/delivery destinations do not remove collection targets; this
does not make those items available for processing. Source-specific `item^source`
gates still apply, and pure regional gates constrain their origins. Simple existing
collection entries are restored from the sidecar; complex entries retain their
normal challenge requirements. Categories, F2P/Skiller rules, explicit task
overrides and source backlogs remain relevant.

Pool rebuilds use calculated atomic tasks; they do not invoke a worker. Level
edits debounce for 250 ms. Input changes terminate the prior strict worker and
advance a generation ID, preventing stale results from replacing tasks/snapshots.
Only the small actual-state/override subset accompanies the shared legacy request;
visit history is not sent to the worker.

## Persistence and schema

Fork state uses localStorage keys:

```text
chunk-picker-v2:roguelike:v1:<map ID>:map
chunk-picker-v2:roguelike:v1:<map ID>:sandbox
chunk-picker-v2:roguelike:v1:local:<profile>
```

```javascript
{
  version: 5,
  enabled: false,
  actualLevels: { /* all 24 skills */ },
  progressionHighWater: { /* all 24 skills: 0..99 */ },
  progressionInitialized: false,
  rulePresetInitialized: false,
  acquiredEnablers: {
    /* canonical item key: { acquiredAt, evidenceTaskId/manual, source } */
  },
  enablersInitialized: true,
  travelAnchor: null, // current chunk ID used to build the reachable travel pool
  currentVisit: null,
  visitHistory: [],
  originOverrides: { /* stable task ID: [chunk or chunk-section, ...] */ },
  accessOverrides: { /* diagnostic key: boolean */ },
  adminHistory: []
}
// A visit:
{
  visitNumber, timestamp, locationId, chunkName,
  kind, // new | revisit | stay | admin
  status, // pending_calculation | task_required | resolved
  candidateTaskIds: [],
  candidateTasks: {}, // compact name/category/display metadata for saved IDs
  resolution, // task_completed | no_tasks | admin_void, once resolved
  resolvedTaskId, note
}
```

Snapshot metadata keeps invalidated candidates readable/completable after reload.
Derived pools, free/encounter classification, the travel graph, availability,
source indexes and task origins are rebuilt.
Unresolved visits keep rolling locked after reload. Enabling an existing map
creates no retroactive visit. Missing state defaults OFF. Malformed/future-version
fork saves are rejected visibly and are not automatically overwritten.

**Export run** includes fork state plus legacy geography, rules, completions and
manual settings. **Import run** confirms replacement: local profiles restore
persistent geography, unlock order, rules, actual levels, completions, equipment,
backlogs, manual choices, overrides, exact progression marks, acquired Enablers, and visit history. It
discards imported `selected`/`potential` candidates and any unknown derived fields,
then reruns sections, sources, atomic tasks, progression, tile classification, and
the reachable roll pool from the imported facts. If the export predates the travel
anchor, the importer infers it from the current visit or latest unlock-order entry.
Existing backend maps import only fork state, retaining their original
legacy save mechanism. Local-profile legacy data is saved separately at
`chunk-picker-v2:local-run:v1:<profile>`.

If the imported run has an unresolved current visit, import keeps its visit number,
location and note but clears its saved candidate snapshot. The current application
then rebuilds that visit from the imported chunks, completions, levels, equipment,
enablers and rules. Resolved history remains historical and is not rewritten.

Version-1/2 imports have no explicit Enabler state. Migration recovers only
canonical `rl_enabler_item_*` completion IDs, exact completed tool-use or specific
item-acquisition tasks, and exact manual-equipment records. Levels, theoretical
sources and generic equipment-tier tasks are never used as evidence. Anything
else can be restored in the Acquired Enablers editor.

Local profiles use the existing sandbox/test save guard and do not save to the
upstream database. On regular maps, ordinary legacy edits still use the original
save path; actual levels, overrides and visits never enter its payload. Storage
is browser/origin/port-specific and does not sync across devices. Export before
clearing browser data or moving to another browser/origin.

## Diagnostics and manual overrides

Every task’s **Details & options** disclosure shows its ID, classification,
progression decision, origins, enablers, access result and ineligibility reasons.
**Inspect** copies the full record to the larger inspector. Access diagnostics show exact keys and requirements.
All atomic tasks is searchable by task, skill, ID or chunk. At most 150 search
results render at once; this does not limit calculation or roll eligibility.

Use real task IDs and local chunk/section IDs in the origin JSON editor:

```json
{ "t_2619": ["5942-1"] }
```

This is an administrative example, not an automatic claim about that spell's
location. Overrides replace inferred origins and cannot unlock geography. Locked
chunks/closed sections stay inactive. An empty array explicitly leaves a task
unassigned; removing a property restores inference.

Copy exact diagnostic keys into the access JSON editor, for example:

```json
{ "task:t_123": true, "section:6198-1": false }
```

Supported keys: `task:<stable ID>`, `source:<type>:<name>[:<location>]`,
`area:<name>`, `connection:<from> to <to>`, `section:<chunk-section>`.
Task/source/connection keys accept true or false. Section false adds a strict
closure; section true does not override a closure in the normal section editor.
Area overrides govern discovered candidate areas. Use existing Manual Areas to
add an otherwise undiscovered area. **Apply overrides** validates, saves and
recalculates; removing a key restores metadata behavior. Existing Manual Sections
and source backlog controls remain available.

Console inspection is also available:

```javascript
roguelikeController.debug().pool
roguelikeController.debug().pool.byLocation['5942'] // task IDs keeping it live
roguelikeController.debug().tasks.filter(t => t.origins.some(o => o.chunkId === '5942'))
```

## Known limitations and required metadata

* Source gate coverage follows local `taskUnlocks`. The Guild gate belongs to
  particular sources, not every object in a whole chunk. An unstated area boundary
  needs source/section gate metadata; no OSRS facts are guessed.
* Named underground areas can lack an unambiguous numeric surface origin. They
  need explicit action chunk/section metadata or manual origins.
* Portable spells and multi-input recipes can lack a unique anchor. In this seed,
  wind strike, telekinetic grab, low alchemy and high alchemy can be unassigned.
  Add action/primary-resource metadata or choose manual origins.
* Inventory/action gates, unrecorded partial progress and missing prerequisite
  metadata need actual legacy completion or verified access overrides. There is
  no inventory simulator or automated quest-progress import.
* Strict access uses entered unboosted levels. Legacy boost rules remain in task
  training calculations; theoretical future boosts never open strict sources.
  Verified temporary boost/access exceptions remain manual. NoBoost gates are
  never automatically bypassed by theoretical boosts.
* `Superheat Furnace` defaults OFF because the current engine treats the spell's
  own Magic level as trainable task content rather than an already-met access
  prerequisite; using it as a furnace could therefore restore recursive Smithing
  reachability. `Boss Level` and `Slayer Equipment` also default OFF conservatively.
* Current-access BiS uses the existing role-specific comparison scores with
  filtered sources and actual Roguelike equipment requirements. Base
  Melee/Ranged/Magic, Prayer, and defensive comparisons are enabled. For weapons,
  Roguelike retains every currently obtainable item that is strictly better than
  the best owned item for at least one enabled role. It does not collapse the list
  to the strongest item in the chunk, and equal-score alternatives remain choices
  when both improve the owned baseline. An item at or below the owned role score
  is removed for that role. Final winners say `BiS`; intermediate choices say
  `upgrade`. Optional flinching, per-melee-style, and separate 1H/2H comparisons
  remain available in Chunk Rules. Obtainability in accessible content can still
  require training. Completed BiS records and manual equipment supply exact
  ownership.
* Mixed alternative groups such as weapon tiers, web slashers, light sources,
  butterfly nets and Slayer staves do not prove one uniform reusable capability.
  They remain ungated and are listed in the ambiguity diagnostics until upstream
  metadata or a focused annotation can classify them safely.
* The collection sidecar follows existing monster and skill loot tables; complex
  collection conditions with insufficient metadata need a data correction or
  manual existing-task configuration.
* Classification is intentionally conservative for 634 skill-owned records whose
  metadata describes rewards, fixed geography, prerequisites, or other non-primary
  actions. If upstream metadata omits a special category or misuses `Primary`, the
  task may require a small data classification annotation after live review.
* No rarity exemptions, survival scoring, pursuit/Slayer reassignment, POH frontier,
  teleport exception or Sailing geography was added.

Future kinds can extend `{kind, locationId, weight: 1, metadata}` before sampling
without changing permanent geography or the visit state machine. Explicit new
source/location metadata can improve the adapters. Persistence changes should
migrate the schema version explicitly.

## Changed files and verification

Existing files: `index.html`, `index.js`, `worker.js` (small integration hooks).
New files: this document, `roguelike-data.js`, `roguelike.js`, `roguelike-worker.js`, `roguelike-ui.js`,
`roguelike.css`, `scripts/serveLocal.js`, `scripts/validateJSON.js`,
`scripts/roguelikeTestHarness.js`, `scripts/testRoguelike.js`,
`scripts/smokeRoguelike.js`. No task-data, task-map or attribution changes.

Dependency-free checks:

```powershell
node --test scripts/testRoguelike.js
node scripts/validateJSON.js
```

**92 tests pass**: connected travel/free-tile traversal, imported section recovery and post-Enabler route changes, pool/visit/completion/provenance cases, imported active-visit recalculation, actual access versus task
level, dynamic geography gates, source backlogs, regional and extremely rare
collection acquisition, per-skill rolling progression, task classification, state/import
migration, persistent tool acquisition and equivalence, consumable exclusion,
old-chunk awakening, exact-item recovery, the exact preset, all four Forestry gate cases, current-access BiS
progression, multi-weapon upgrades above owned baselines, and mode-OFF parity with
the original local-clone worker/rolling bodies. The harness uses the actual data
and Xtreme preset in Node's VM; it skips only the unused external lodash import.

The original `scripts/validateJSON.sh` was attempted using Git Bash. It requires
`jq`, which is absent here. The new cross-platform Node equivalent parses both
repository JSON data files successfully.

Optional browser smoke test: start the local server, provide Playwright, and use
installed Edge (or install Playwright's Chromium and omit RL_BROWSER_CHANNEL):

```powershell
npm install --prefix "$env:TEMP\chunk-picker-browser-tools" playwright
$env:NODE_PATH="$env:TEMP\chunk-picker-browser-tools\node_modules"
$env:RL_BROWSER_CHANNEL='msedge'
node scripts/smokeRoguelike.js
```

The smoke test has an isolated profile, blocks upstream database/analytics calls,
and writes screenshots/export JSON to `$env:TEMP\chunk-picker-roguelike-smoke`.
RL_TEST_URL and RL_SCREENSHOT_DIR override the URL/output directory.

The desktop/mobile run exercises Rules-modal access, preset status,
**6198 → 5942 → 6454 → 6197**, free visits,
completing one chicken task, bronze-axe acquisition, immutable visit snapshots,
old-chunk reactivation, consecutive actual revisits
without geography/unlock-order changes, reload with blocked rolling, rapid level
edits, admin visit/void, version-5 export with acquired Enablers, clean-profile import with deliberately
stale derived fields, and optional normal task reference. It also
checks reset cancellation, a full reset isolated from another profile, continuation
through the real setup controls, manual Enabler add/remove, past-task recording, equal-level Cooking exclusion
after reload, and the visual section picker for bare chunk IDs. No uncaught browser
JavaScript errors were reported in the earlier full smoke run. For the connected
travel change, the Codex in-app browser verified the actual 5942/6198/6454 route:
6454 inferred as the current tile, 6198 classified as free, and 5942 stopped travel
as an eight-task encounter. The optional Playwright package is not currently installed.
An existing decorative Imgur GIF
(`https://i.imgur.com/dddnn67.gif`) returns HTTP 403 in this environment; application
operation is unaffected and that unrelated asset was not replaced.

Syntax and whitespace checks pass. The original files use CRLF, so use:

```powershell
git -c core.whitespace=cr-at-eol diff --check
```
