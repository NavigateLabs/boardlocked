# Boardlocked

Boardlocked is a progression mode for the Old School RuneScape
[Chunk Picker V2](https://github.com/source-chunk/chunk-picker-v2).

The name comes from a combination of boardgame and the -locked nomer from various osrs game-modes. The idea is that each chunk is a boardgame tile, where you must move and perform one action each turn.

It came from trying to improve chunklocked in certain aspects, focusing more on roleplaying and smoother progression. Eventually I found that this simple rule fixed most of my problems with that mode. Since you can only make one action per chunk, your choice really matters!

## Play

Open:

**[https://navigatelabs.github.io/boardlocked/](https://navigatelabs.github.io/boardlocked/)**

Use the task icon in the top-right to reopen the panel.

## How Boardlocked plays

Simply, you move one chunk then complete one task before you can move again. Movement is adjacent to the chunk you're currently standing on, meaning the chunks north, south, east or west. Chunks with no completeable goals turn into free spaces, and whenever you're next to a free space you will also roll the chunks adjacent to that free space.

The tasks are similar to those you would expect from chunklocked, I.e. get a new BiS, skilling activity, collection log, quests and such.

Every obtainable equipment item that improves your current best-in-slot gear appears as its own goal. This includes intermediate upgrades, so a shop with several better platebodies shows each one until your recorded gear makes the lower options obsolete.

You have access to everything in previously unlocked chunks, and can freely re-enter areas you have previously been to. However you must focus on your task. I.e. if you need to get woodcutting to lvl 60 to cut yew, that should be the goal you focus on in your unlocked chunks and therfore you shouldn't go train thieving.

The tasks are more than likely begin very simple (get an axe, cut a tree), after a couple chunks you'll find yourself with increasingly harder tasks.

## Start a new account

Open a fresh run and choose your start options before the first roll. The map
uses the reviewed land-tile list for Standard starts. Mixed coastal chunks still
begin on land.

Before starting talk to Turael once and go though the options to unlock slayer. If you accidentally get a assignment you should cancel it. It is also strongly reccomended to do Druidic Ritual to have access to herblore.

Two optional start groups are available before the first roll:

- **Varlamore:** adds Varlamore and assumes you completed Children of the Sun before rolling.
- **Wilderness:** adds Wilderness for masochists.

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
