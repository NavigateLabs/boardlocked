# Boardlocked

Boardlocked is a progression mode for the Old School RuneScape
[Chunk Picker V2](https://github.com/source-chunk/chunk-picker-v2).

The name comes from a combination of boardgame and the -locked nomer from various osrs game-modes. The idea is that each chunk is a boardgame tile, where you must move and perform one action each turn.

## Play

Open:

**[https://navigatelabs.github.io/boardlocked/](https://navigatelabs.github.io/boardlocked/)**

Use the task icon in the top-right to reopen the panel.

## How Boardlocked plays

Simply, you move one tile then complete one task before you can move again. Movement is adjacent to the tile you're currently standing on, meaning the tiles north, south, east or west. Tiles with no completeable goals turn into free tiles, and whenever you're next to a free tile you will also roll the tiles adjacent to that one.

The tasks are similar to those you would expect from chunklocked, I.e. get a new BiS, skilling activity, collection log, quests and such.

When several ordinary recipes use the same main resource for the same skill,
Boardlocked offers one of them: the highest-level recipe you can currently do.
Completing it covers that resource family, while distinct methods such as making
cannonballs remain separate goals. A new resource starts a new family.

You have access to everything in previously unlocked chunks, so you can re-enter areas you have previously been to. However you must focus on your goal. I.e. if you need to get woodcutting to lvl 60, that should be the goal you focus on in your unlocked chunks and you shouldn't go train thieving.

The tasks are more than likely begin very simple (get an axe, cut a tree), but not to worry, after a couple tiles you'll find yourself with harder and harder tasks >:D

## Start a new account

Open a fresh run and choose your start options before the first roll. The map
uses the reviewed land-tile list for Standard starts. Mixed coastal chunks still
begin on land.

Two optional start groups are available before the first roll. Every starting
tile is on land:

- **Varlamore:** adds Varlamore land tiles and assumes you completed Children of the Sun before rolling.
- **Wilderness:** adds Wilderness land tiles. PvP and normal Wilderness danger still apply.

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
