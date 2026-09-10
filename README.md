# Boardlocked

Boardlocked is a progression mode for the Old School RuneScape
[Chunk Picker V2](https://github.com/source-chunk/chunk-picker-v2). Instead of completing
every possible task in a chunk, a run advances one visit at a time through reachable
chunks, equipment upgrades, and skill progression.

## Play

Open:

**[https://navigatelabs.github.io/boardlocked/](https://navigatelabs.github.io/boardlocked/)**

Use the task icon in the top-right to reopen the panel.

## How Boardlocked plays

Simply, you move one tile then complete one task before you can move again. Movement is adjacent to the tile you're currently standing on, meaning the tiles north, south, reast of west. Tiles with no completeable goals turn into free tiles, and whenever you're next to a free tile you will also roll the tiles adjacent to that one.

The tasks are similar to those you would expect from chunklocked, I.e. get a new BiS, skilling activity, collection log, quests and such.

You have access to everything in previously unlocked chunks, so you can re-enter areas you have previously been to. However you must focus on your goal. I.e. if you need to get woodcutting to lvl 60, that should be the goal you focus on in your rollable chunks and you shouldn't go train thieving.

Movement in

## Start a new account

Open a fresh run and choose your start options before the first roll. The default
pool excludes Morytania, the desert,
Prifddinas, quest-locked islands, damaging environments, guild interiors, and
other poor level-3 starts.

Three optional start groups are available before the first roll:

- **Varlamore:** adds the released continent and assumes you completed Children of the Sun before rolling. Starts stay on the connected overworld surface, outside Tempestus and quest-only interiors.
- **Wilderness:** adds Ferox Enclave and nearby low-risk southern Wilderness tiles. PvP risk still applies.
- **Ocean starts (experimental):** adds an equal-chance group of beginner waters near Port Sarim to the first roll, assumes you completed Pandemonium, and starts Sailing at level 5 from its 400 XP reward. Land remains a possible result while other groups are enabled.

## Protect your save

Browser storage is local. **Clearing cookies/site data, resetting the browser,
or moving to another browser or device can delete it.** Use **Download backup** in
the run panel regularly and keep the JSON file outside the browser. **Import backup**
restores old Boardlocked exports as well as the current format.

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
