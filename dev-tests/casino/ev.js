// Last Call Casino: average return per chip bet for each game (1.00 = break even), by simulation
const path = require("path");
const C = require(path.join(__dirname, "../../games/duels/casino/games"));
const { GAMES } = C;
const N = 200000;
const rng = Math.random;
const avg = (f) => {
    let t = 0;
    for (let i = 0; i < N; i++) t += f();
    return (t / N).toFixed(3);
};
const out = {
    "dice over 50": avg(() => GAMES.dice.run(rng, { dir: "over", at: 50 }).mult),
    "dice under 10": avg(() => GAMES.dice.run(rng, { dir: "under", at: 10 }).mult),
    "limbo 2x": avg(() => GAMES.limbo.run(rng, 2).mult),
    "limbo 20x": avg(() => GAMES.limbo.run(rng, 20).mult),
    "roulette red": avg(() => GAMES.roulette.run(rng, { t: "red" }).mult),
    "roulette 17": avg(() => GAMES.roulette.run(rng, { t: "n", n: 17 }).mult),
    "baccarat player": avg(() => GAMES.baccarat.run(rng, "p").mult),
    "baccarat banker": avg(() => GAMES.baccarat.run(rng, "b").mult),
    "baccarat tie": avg(() => GAMES.baccarat.run(rng, "t").mult),
    "plinko low": avg(() => GAMES.plinko.run(rng, "low").mult),
    "plinko med": avg(() => GAMES.plinko.run(rng, "med").mult),
    "plinko high": avg(() => GAMES.plinko.run(rng, "high").mult),
    "money wheel": avg(() => GAMES.wheel.run(rng).mult),
    slots: avg(() => GAMES.slots.run(rng).mult),
    "pack rip": avg(() => GAMES.pack.run(rng).mult),
    "loot case": avg(() => GAMES.cases.run(rng).mult),
    "scratch-off": avg(() => GAMES.scratch.run(rng).mult),
    "keno 1 pick": avg(() => GAMES.keno.run(rng, [7]).mult),
    "keno 5 picks": avg(() => GAMES.keno.run(rng, [1, 9, 17, 25, 33]).mult),
    "keno 10 picks": avg(() => GAMES.keno.run(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).mult),
    "jackpot slots (base game, pot not counted)": avg(() => GAMES.jackpot.run(rng).mult),
    "jackpot hit rate (1 in)": Math.round(1 / avg(() => (GAMES.jackpot.run(rng).out.jackpot ? 1 : 0))),
    "video poker (hold pairs+, else nothing)": avg(() => {
        const h = GAMES.vpoker.start(rng);
        const r = h.me.map(C.rank);
        const hold = [0, 1, 2, 3, 4].filter((i) => r.filter((x) => x === r[i]).length >= 2);
        return GAMES.vpoker.act(h, { m: "draw", hold }).mult;
    }),
    "tower med, 3 floors": avg(() => {
        let h = GAMES.tower.start(rng, "med");
        for (let f = 0; f < 3 && !h.done; f++) h = GAMES.tower.act(h, { m: "door", i: 0 }, rng);
        return h.done ? h.mult : GAMES.tower.act(h, { m: "cash" }, rng).mult;
    }),
    "road hard, 4 lanes": avg(() => {
        let h = GAMES.road.start(rng, "hard");
        for (let f = 0; f < 4 && !h.done; f++) h = GAMES.road.act(h, { m: "step" }, rng);
        return h.done ? h.mult : GAMES.road.act(h, { m: "cash" }, rng).mult;
    }),
    "horse fav": avg(() => GAMES.horses.run(rng, 0).mult),
    "horse long": avg(() => GAMES.horses.run(rng, 5).mult),
    "craps pass": avg(() => GAMES.craps.run(rng, "pass").mult),
    "craps dont": avg(() => GAMES.craps.run(rng, "dont").mult),
    "craps field": avg(() => GAMES.craps.run(rng, "field").mult),
    "crash cash at 2x": avg(() => (GAMES.crash.point(rng) >= 2 ? 2 : 0)),
    "mines 3, 3 tiles": avg(() => {
        let h = GAMES.mines.start(rng, 3);
        const tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].sort(() => rng() - 0.5);
        for (let i = 0; i < 3 && !h.done; i++) h = GAMES.mines.act(h, { m: "tile", i: tiles[i] });
        return h.done ? h.mult : GAMES.mines.act(h, { m: "cash" }).mult;
    }),
    "hilo 3 guesses": avg(() => {
        let h = GAMES.hilo.start(rng);
        for (let i = 0; i < 3 && !h.done; i++) {
            const r = C.rank(h.cards[h.cards.length - 1]);
            h = GAMES.hilo.act(h, { m: r >= 6 ? "lo" : "hi" }, rng);
        }
        return h.done ? h.mult : GAMES.hilo.act(h, { m: "cash" }).mult;
    }),
    "blackjack basic-ish": avg(() => {
        let h = GAMES.blackjack.start(rng);
        while (!h.done) h = GAMES.blackjack.act(h, { m: C.bjTotal(h.me) < 17 ? "hit" : "stand" }, rng);
        return h.mult;
    }),
    "3 card poker (play Q64+), per ante incl raise": avg(() => {
        const h = GAMES.poker.start(rng);
        const play = C.cmp(C.poker3(h.me), [0, 10, 4, 3]) >= 0;
        const r = GAMES.poker.act(h, { m: play ? "play" : "fold" });
        return play ? r.mult / 2 : 0;
    }),
};
for (const k in out) console.log(k.padEnd(46), out[k]);
