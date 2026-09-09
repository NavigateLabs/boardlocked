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

- Roll from the first reachable new tile or unfinished task tile in each direction.
- Cross taskless `FREE` tiles automatically while building the roll pool.
- Complete any one task offered for the current tile before rolling again.
- Recalculate routes when a completed task unlocks an item, level, or connection.
- Keep skill tasks moving forward through a window tuned for each skill. Woodcutting
  uses +15, so a level-60 yew task needs a completed level-45-or-higher milestone.
- Offer every obtainable weapon upgrade that improves on equipment already acquired.
- Import old runs while recalculating goals against the current rules and task data.

## Start a new account

Open a fresh run and choose your start options before the first roll. The default
pool excludes Morytania, the desert,
Prifddinas, quest-locked islands, damaging environments, guild interiors, and
other poor level-3 starts.

**Druidic Ritual is recommended and enabled by default.** The route is:
pick up the iron dagger in the goblin house in Lumbridge, kill a level 3 rat in
Lumbridge Swamp for raw rat meat, buy raw chicken and beef from Wydin's Food
Store in Port Sarim, then use this
no-cannon method on a bear cub: attack once, step behind a tree or rock until
its health bar disappears, and repeat. These
[level-3 flinching notes](https://www.reddit.com/r/UniqueIronmen/comments/1bjsowt)
describe the same method. Then
[finish Druidic Ritual](https://oldschool.runescape.wiki/w/Druidic_Ritual).
Enabling this option assumes you complete the route before starting the rolled
account. Boardlocked records the quest and its level-3 Herblore result.

Three optional start groups are available before the first roll:

- **Varlamore:** adds selected starts and assumes you completed Children of the Sun before rolling.
- **Wilderness:** adds a small set of shallow, low-risk tiles. PvP risk still applies.
- **Ocean (experimental):** adds an equal-chance group of beginner waters near Port Sarim, assumes you completed Pandemonium, and starts Sailing at level 5 from its 400 XP reward. Land remains a possible result while other groups are enabled. This route is still largely untested.

Each enabled group has the same chance to be selected, then every tile within that
group has the same chance. The result clearly says `LAND`, `WATER`, or `MIXED`.
Later rolls retain the exact connected sections: land never grants water access,
water never grants land access, and both open only when both have real connections.

## Protect your save

Boardlocked saves automatically in this browser and keeps the previous valid save
as a recovery copy. Site updates migrate older saves automatically; they do not
reset chunks, completions, levels, equipment, or visit history.

Browser storage is still local. **Clearing cookies/site data, resetting the browser,
or moving to another browser or device can delete it.** Use **Download backup** in
the run panel regularly and keep the JSON file outside the browser. **Import backup**
restores old Boardlocked exports as well as the current format.

The full rules, controls, state model, and design notes are in
[BOARDLOCKED_MODE.md](./BOARDLOCKED_MODE.md).

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
