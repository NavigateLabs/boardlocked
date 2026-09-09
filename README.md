# Boardlocked

Boardlocked is a local-first Roguelike progression mode for the Old School RuneScape
[Chunk Picker V2](https://github.com/source-chunk/chunk-picker-v2). Instead of completing
every possible task in a chunk, a run advances one visit at a time through reachable
chunks, equipment upgrades, and skill progression.

## Play

Open:

**[https://navigatelabs.github.io/boardlocked/?local=default](https://navigatelabs.github.io/boardlocked/?local=default)**

## Roguelike mode

- Roll from the first reachable new chunk or unfinished encounter in each direction.
- Cross taskless `FREE` chunks automatically while building the roll pool.
- Complete any one task from the current visit snapshot before rolling again.
- Recalculate routes when a completed task unlocks an item, level, or connection.
- Keep skill tasks moving forward through per-skill progression windows.
- Offer every obtainable weapon upgrade that improves on equipment already acquired.
- Import old runs while recalculating goals against the current rules and task data.

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

## Validate changes

```powershell
node scripts/validateJSON.js
node --test scripts/testRoguelike.js
```

## Credits

Boardlocked is based on [source-chunk/chunk-picker-v2](https://github.com/source-chunk/chunk-picker-v2),
the Chunk Picker website for the fan-made One Chunk Man mode. Thanks to the original
Chunk Picker contributors and to [Alyx Bailey](https://www.youtube.com/c/AlyxBailey)
for creating the mode.
