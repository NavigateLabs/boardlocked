# Boardlocked

Boardlocked is a local-first progression mode for the Old School RuneScape
[Chunk Picker V2](https://github.com/source-chunk/chunk-picker-v2). Instead of completing
every possible task in a chunk, a run advances one visit at a time through reachable
chunks, equipment upgrades, and skill progression.

## Play

Open:

**[https://navigatelabs.github.io/boardlocked/](https://navigatelabs.github.io/boardlocked/)**

Use the task icon in the top-right to reopen the run panel.

## How Boardlocked plays

- Roll from the first reachable new chunk or unfinished encounter in each direction.
- Cross taskless `FREE` chunks automatically while building the roll pool.
- Complete any one task from the current visit snapshot before rolling again.
- Recalculate routes when a completed task unlocks an item, level, or connection.
- Keep skill tasks moving forward through per-skill progression windows.
- Offer every obtainable weapon upgrade that improves on equipment already acquired.
- Import old runs while recalculating goals against the current rules and task data.

## Start a new account

Open a fresh run and choose your start options before the first roll. The default
pool excludes Morytania, the desert,
Prifddinas, quest-locked islands, damaging environments, guild interiors, and
other poor level-3 starts.

**Druidic Ritual is recommended and enabled by default.** The compact route is:
pick up the iron dagger from the golbin house in Lumbridge, kill a rat for raw rat meat, buy raw
chicken and beef from Wydin's Food Store in Port Sarim, use this
[level-3 bear cub safespot](https://www.youtube.com/watch?v=YcvoAOKZF1Q), then
[finish Druidic Ritual](https://oldschool.runescape.wiki/w/Druidic_Ritual).
Boardlocked records the quest completion so Herblore access is calculated correctly.

Three optional start groups are available before the first roll:

- **Varlamore:** adds selected starts and records Children of the Sun as an initialization quest.
- **Wilderness:** adds a small set of shallow, low-risk tiles. PvP risk still applies.
- **Ocean (experimental):** adds beginner waters near Port Sarim, records Pandemonium as an initialization quest, and starts Sailing at level 4 from its 400 XP reward. very untested and experimental :b But IN THEORY it should work with no problems, so feel free to select it.

Each enabled group has the same chance to be selected, then every tile within that
group has the same chance. The first roll automatically selects the start tile.

The full rules, controls, state model, and design notes are in
[ROGUELIKE_MODE.md](./ROGUELIKE_MODE.md).

## Run locally

Opening `index.html` directly will not work because browsers restrict JSON requests
and Web Workers on `file://` pages. Serve the repository over HTTP instead:

```powershell
cd C:\chunk-picker-v2
node scripts/serveLocal.js
```

Then open **http://127.0.0.1:8080/?local=default**.

No package installation or build step is required. The site still loads several
public libraries from CDNs, so an internet connection is needed.


## Credits

Boardlocked is based on [source-chunk/chunk-picker-v2](https://github.com/source-chunk/chunk-picker-v2),
the Chunk Picker website for the fan-made One Chunk Man mode. Thanks to the original
Chunk Picker contributors and to [Alyx Bailey](https://www.youtube.com/c/AlyxBailey)
for creating the mode!
