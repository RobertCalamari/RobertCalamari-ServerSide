# Handoff: unfinished work (branch `wip-new-games`)

`main` in both repos is the last good, deployed state. This branch holds half-built games. Do not merge or deploy it until every game below is finished and the site builds.

Repos:
- Game server: github.com/RobertCalamari/RobertCalamari-ServerSide. Render auto-deploys `main`; otherwise use Manual Deploy.
- Site: the only remote is Heroku (`git.heroku.com/robertcalamari.git`, app `robertcalamari`), which deploys from `main`. The `wip-new-games` branch for the site travels as `robertcalamari-wip.bundle` (see the site's HANDOFF.md).

## 12 new games: status when work stopped (usage limit hit mid-build)
Engine: games/duels (contract in games/duels/CONTRACT.md). Each game needs:
- a server file in games/duels/games/
- a phone component and a TvComponent in the site's src/duels/games/
- an entry in src/duels/registry.js
- an entry in src/duels/catalog.js (Games page; `big: true` puts it in the TV tab)

| Game | Server | Site | Where it stopped |
|---|---|---|---|
| Word Ladder (wordladder) | wordladder.js, ladder.js | brain/WordLadder*.js | built, socket tests not written |
| Slide Puzzle Race (slidepuzzle) | slidepuzzle.js, slide.js | brain/SlidePuzzle*.js | built, socket tests not written |
| Daily Puzzle (daily) | daily.js (reuses digittarget/wordmine helpers, which were refactored) | brain/Daily*.js | built, socket tests not written |
| Battle Lines (battlelines) | battlelines.js | BattleLines*.js | built, registry/catalog entries next |
| Backgammon (backgammon) | backgammon.js | Backgammon*.js | built, registry/catalog entries next |
| Liar's Dice (liarsdice) | liarsdice.js | LiarsDice*.js | built, registry/catalog entries next |
| Telephone Sketch (telesketch) | telesketch.js | TeleSketch.js only | TV view missing |
| Space Kitchen (spacekitchen) | spacekitchen.js | not started | server + bots working |
| Floor Is Lava (lavafloor) | lavafloor.js | not started | server only |
| Last One Standing Trivia (lastone) | lastone.js, lastone/ (question bank) | not started | server only |
| Shape Shifter (shapeshift) | shapeshift/ (geometry) | not started | starting silhouettes |
| Price Tag Panic | not started | not started | not started |

Briefs used for each group:
- solo puzzles: 1–10 players, personal bests
- board games: Battle Lines has hidden unit types; Backgammon has full rules; Liar's Dice is 2–8 players
- TV party: Telephone Sketch, Space Kitchen and Floor Is Lava, all `big: true`
- group: Trivia needs 300+ original questions; Shape Shifter is tangrams; Price Tag Panic is a budget shopping game

Check the files for exact state before continuing.

## Vending Simulator changes requested, not started (games/duels/games/cardshop.js + site src/duels/games/cardshop/)
- Remove the time limits: phases advance when everyone presses Ready (or add a timer on/off start option, default off).
- Remove the guaranteed Rare-or-better card in every pack (CFG rarity "last card" rule), so big pulls are rare again; rebalance with the bot sim.
- One action buys one pack. Remove the "3 · $X" bundle buttons (CFG.actions.packs = 1).

## Tests
dev-tests/ holds the socket.io test scripts the helpers wrote: new1–new4 are the new games, brain, cards, walls, cs (cardshop) and gn5.
- Run with NODE_PATH pointing at the site's node_modules.
- Start a local server first: `PORT=4014 node index.js`.
- Some scripts have hard-coded paths or ports from the old machine; adjust as needed.
- Point the site at a local server with `?server=http://localhost:PORT`.

## Finish line
1. Finish or remove each game; registry.js must not import missing files.
2. `npm run build` in the site.
3. Merge into `main` in both repos.
4. Push the server to GitHub; push the site with `git push heroku main`.
5. Render Manual Deploy.
