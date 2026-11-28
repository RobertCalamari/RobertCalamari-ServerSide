// Drink or Drown (Robert's card game): a point-collecting drinking game. Everyone holds up to 10 cards. On your turn play
// Action and Challenge cards by paying their number with Number cards, several at once from one payment if you like,
// then draw 3. Played actions score their number; if someone refuses the task the points double. Anyone can answer a
// played card with a Counter (cancel, divert, steal it...). Wait cards are cashed in when their event happens (points,
// or kept as a number card); whoever caused it drinks. Challenges: pick an opponent (or everyone joins), everyone may
// ante scored cards, the winner takes the pot. The game ends as soon as someone reaches the goal; most points wins.
// The host can undo the last few moves when people argue.
const { ranked, seats } = require("../rank");
const { CARDS } = require("../drinkdrown/cards");
const HAND = 10;
const START = 10;
const DRAW = 3;
const REACT_MS = 9000;
const HOLD_MS = 25000; // someone opened a counter: the window waits this long for them
const LOG = 10;
const UNDO = 15;
const UNDOABLE = ["play", "counter", "convert", "claim", "give", "cup", "done", "join", "ante", "start", "win", "end", "discard"];
const DIVERTS = ["self", "along", "back", "beside", "adjacent", "everyone", "allbut", "both"];

const card = (id) => CARDS[id];
const N = (s) => "#" + s + "#"; // a player, filled in with their name on the phone
const name = (c) => (c.t === "number" ? (c.wild ? "a wild number" : "a " + c.v) : '"' + c.text + '"');

function shuffle(rng, a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function log(state, text, kind) {
    state.log.push({ n: ++state.logNo, text, kind });
    if (state.log.length > LOG) state.log.shift();
}

function draw(state, s, k, ctx) {
    let got = 0;
    for (let i = 0; i < k; i++) {
        if (!state.deck.length) {
            if (!state.discard.length) break;
            state.deck = shuffle(ctx.rng, state.discard);
            state.discard = [];
            log(state, "The discard pile was shuffled back into the deck", "info");
        }
        const id = state.deck.pop();
        take(state.conv, id);
        state.hands[s].push(id);
        got++;
    }
    return got;
}

function points(state, s) {
    let p = 0;
    state.scored.forEach((list, o) => list.forEach((e) => (o === s || (e.with && e.with.includes(s))) && (p += card(e.id).v * e.x)));
    return p;
}

const take = (list, id) => {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    return i >= 0;
};

// pay a cost from the hand: Number cards (wilds count as the value chosen, and you drink it), or Wait cards as numbers
function pay(state, s, cost, ids, wild, avoid) {
    if (!Array.isArray(ids)) ids = [];
    if (new Set(ids).size !== ids.length) return { error: "Each card pays once." };
    let total = 0;
    const drinks = [];
    for (const id of ids) {
        if (!Number.isInteger(id) || !state.hands[s].includes(id) || (avoid && avoid.includes(id))) return { error: "Pay with cards from your hand." };
        const c = card(id);
        if (c.t === "number" && c.wild) {
            const v = wild && wild[id];
            if (!Number.isInteger(v) || v < 1 || v > 6) return { error: "Pick a value from 1 to 6 for your wild card." };
            total += v;
            drinks.push(v);
        } else if (c.t === "number" || (c.t === "wait" && state.conv.includes(id))) total += c.v;
        else if (c.t === "wait") return { error: "Turn that Wait card into a number card first." };
        else return { error: "Only Number cards (and Wait cards turned into numbers) can pay." };
    }
    if (total < cost) return { error: "That's " + total + ". You need " + cost + "." };
    return { ok: true, ids, drinks, total };
}

function spend(state, s, paid) {
    paid.ids.forEach((id) => {
        take(state.hands[s], id);
        state.discard.push(id);
    });
    const d = paid.drinks.reduce((a, b) => a + b, 0);
    if (d) log(state, N(s) + " used a wild: drink " + d, "drink");
}

function nextTurn(state, ctx) {
    const n = state.n;
    if (state.goal && seats(n).some((s) => points(state, s) >= state.goal)) {
        state.phase = "done";
        state.pending = null;
        return;
    }
    let t = state.turn;
    for (let i = 0; i < n * 2; i++) {
        t = (t + 1) % n;
        if (state.skip[t] > 0) {
            state.skip[t]--;
            log(state, N(t) + "'s turn is skipped", "info");
            continue;
        }
        break;
    }
    state.turn = t;
    state.turns++;
    state.phase = "turn";
    state.pending = null;
}

function startReact(state, ctx) {
    state.phase = "react";
    state.passed = seats(state.n).map((s) => s === state.pending.by);
    state.held = seats(state.n).map(() => false);
    if (state.n < 2) return afterReact(state, ctx);
    armReact(state, ctx, REACT_MS);
}

function armReact(state, ctx, ms) {
    state.reactAt = ctx.now() + ms;
    const tick = ++state.tick;
    ctx.later(ms, () => state.tick === tick && state.phase === "react" && afterReact(state, ctx));
}

// next card of a several-at-once play, or back to the player's turn
function carryOn(state, ctx) {
    state.pending = null;
    if (state.queue && state.queue.length) {
        state.pending = state.queue.shift();
        log(state, N(state.pending.by) + " played " + name(state.pending.card) + (state.pending.targets.length ? " on " + state.pending.targets.map((t) => N(t)).join(" & ") : ""), state.pending.card.t);
        startReact(state, ctx);
    } else state.phase = "turn";
}

// the game ends the moment someone reaches the goal (once nothing is left half-played)
function checkGoal(state) {
    if (!state.goal || state.phase === "done" || state.phase === "setup" || state.pending || (state.queue && state.queue.length)) return;
    if (seats(state.n).some((s) => points(state, s) >= state.goal)) {
        state.phase = "done";
        log(state, "Someone reached " + state.goal + " points. Game over!", "score");
    }
}

function afterReact(state, ctx) {
    state.tick++;
    state.reactAt = null;
    const p = state.pending;
    if (!p) return;
    if (p.card.t === "challenge") {
        state.phase = "challenge";
        p.step = "ante";
        p.pot = [];
        p.ante = seats(state.n).map(() => false);
        p.everyone = p.card.who === "everyone";
        p.players = p.everyone ? [p.by] : [p.by, p.targets[0]];
        return;
    }
    state.phase = "resolve";
}

function targetsOf(state, p) {
    if (p.everyone || p.card.who === "everyone") return seats(state.n).filter((s) => s !== p.exclude);
    return p.targets;
}

function score(state, s, id, x, extra) {
    state.scored[s].push({ id, x, ...(extra || {}) });
    state.cup && state.cup.open && log(state, "Points scored: pour some of your drink in the cup!", "info");
}

// apply a resolved action: effects, then where the card goes
function finish(state, refused, ctx) {
    const p = state.pending;
    const c = p.card;
    const keeper = p.keeper === undefined ? p.by : p.keeper;
    const times = p.twice ? 2 : 1;
    const targets = targetsOf(state, p);
    for (let k = 0; k < times; k++) {
        if (c.fx === "draw2" || c.fx === "draw2give") draw(state, p.by, 2, ctx);
        if (c.fx === "swaphands") {
            const v = p.pick && p.pick.player;
            if (Number.isInteger(v) && v !== p.by) {
                [state.hands[p.by], state.hands[v]] = [state.hands[v], state.hands[p.by]];
                log(state, N(p.by) + " swapped hands with " + N(v), "info");
            }
        }
        if (c.fx === "swap3") {
            if (p.pick && take(state.hands[p.by], p.pick.card)) state.discard.push(p.pick.card);
            draw(state, p.by, 3, ctx);
        }
        if (c.fx === "reshuffle") {
            state.deck = shuffle(ctx.rng, state.deck.concat(state.discard));
            state.discard = [];
        }
        if (c.fx === "newhand") {
            const k2 = state.hands[p.by].length;
            state.discard.push(...state.hands[p.by]);
            state.hands[p.by] = [];
            draw(state, p.by, k2, ctx);
            log(state, N(p.by) + " threw away " + k2 + " cards: drink " + k2, "drink");
        }
        if (c.fx === "steal") {
            const v = p.pick && p.pick.player;
            const h = Number.isInteger(v) ? state.hands[v] : null;
            if (h && h.length && v !== p.by) {
                const id = h.splice(Math.floor(ctx.rng() * h.length), 1)[0];
                state.hands[p.by].push(id);
                log(state, N(p.by) + " took a card from " + N(v), "info");
            }
        }
        if (c.fx === "dig" && p.pick && take(state.discard, p.pick.card)) state.hands[p.by].push(p.pick.card);
        if (c.fx === "takepoint") {
            const v = targets[0];
            const list = state.scored[v];
            if (v !== keeper && list && list.length) {
                const best = list.reduce((a, e, i) => (card(e.id).v * e.x > card(list[a].id).v * list[a].x ? i : a), 0);
                const e = list.splice(best, 1)[0];
                state.scored[keeper].push(e);
                log(state, N(keeper) + " took a " + card(e.id).v * e.x + "-point card from " + N(v), "info");
            }
        }
        if (c.fx === "taxall") {
            seats(state.n).forEach((o) => {
                if (o === keeper || !state.scored[o].length) return;
                const list = state.scored[o];
                const low = list.reduce((a, e, i) => (card(e.id).v * e.x < card(list[a].id).v * list[a].x ? i : a), 0);
                state.scored[keeper].push(list.splice(low, 1)[0]);
            });
            log(state, N(keeper) + " took a point card from everyone", "info");
        }
    }
    if (c.fx === "takepoint") state.discard.push(c.id);
    else if (c.pot) {
        state.cup = { id: c.id, open: true, by: p.by };
        log(state, "The cup is on the table. Whoever tops it off drinks it and takes the card", "info");
    } else if (refused && p.keepIfDone) state.discard.push(c.id);
    else score(state, keeper, c.id, refused ? 2 : 1, c.share && targets[0] !== keeper ? { with: [targets[0]] } : null);
    if (p.along) score(state, p.along.by, p.along.id, refused ? 2 : 1);
    log(state, N(keeper) + " scored " + (c.fx === "takepoint" || c.pot ? 0 : c.v * (refused ? 2 : 1)) + (refused ? " (refused: double!)" : ""), "score");
    state.pending = null;
    // "draw 2, then give one to another player": the player picks which card to hand over next
    const to = p.pick && p.pick.player;
    if (c.fx === "draw2give" && Number.isInteger(to) && to !== p.by && state.hands[p.by].length) {
        state.give = { from: p.by, to, left: times };
        state.phase = "give";
    } else carryOn(state, ctx);
}

function pub(state) {
    const p = state.pending;
    return {
        phase: state.phase,
        turn: state.turn,
        turns: state.turns,
        goal: state.goal,
        deck: state.deck.length,
        discard: state.discard.slice(-20).map((id) => ({ id, ...card(id) })),
        discardCount: state.discard.length,
        counts: state.hands.map((h) => h.length),
        scored: state.scored.map((list) => list.map((e) => ({ ...e, ...card(e.id) }))),
        points: seats(state.n).map((s) => points(state, s)),
        skip: state.skip,
        reactAt: state.reactAt,
        passed: state.phase === "react" ? state.passed : null,
        cup: state.cup && state.cup.open ? { ...card(state.cup.id), id: state.cup.id } : null,
        give: state.phase === "give" ? state.give : null,
        queue: state.queue ? state.queue.map((q) => ({ ...q.card })) : [],
        held: state.phase === "react" ? state.held : null,
        undo: state.history && state.history.length ? state.history[state.history.length - 1].label : null,
        pending: p
            ? {
                  card: p.card,
                  by: p.by,
                  targets: targetsOf(state, p),
                  everyone: !!(p.everyone || p.card.who === "everyone"),
                  keeper: p.keeper === undefined ? p.by : p.keeper,
                  keepIfDone: !!p.keepIfDone,
                  counter: p.counter || null,
                  along: p.along ? { ...card(p.along.id), by: p.along.by } : null,
                  twice: !!p.twice,
                  step: p.step || null,
                  players: p.players || null,
                  pot: p.pot ? p.pot.map((e) => ({ ...e, ...card(e.id) })) : null,
                  ante: p.ante || null,
                  pick: p.pick || null,
              }
            : null,
        log: state.log,
    };
}

// one card's targets and picks, checked against the hand (others = the rest of this play and its payment)
function setup(state, s, id, targets, pl, others) {
    const c = card(id);
    let t = [];
    if (c.who === "anyone") {
        const need = c.n || 1;
        t = Array.isArray(targets) ? targets : [];
        if (t.length !== need || new Set(t).size !== need || t.some((x) => !Number.isInteger(x) || x < 0 || x >= state.n)) return { error: need === 1 ? "Pick who it's for." : "Pick " + need + " people." };
        if (need === 1 && state.n > 1 && t[0] === s) return { error: "Pick someone else." };
    }
    const pick = {};
    if (c.fx === "swaphands" || c.fx === "draw2give") {
        const v = pl && pl.player;
        if (!Number.isInteger(v) || v === s || v < 0 || v >= state.n) return { error: c.fx === "swaphands" ? "Pick who to swap hands with." : "Pick who gets a card." };
        pick.player = v;
    }
    if (c.fx === "steal") {
        const v = pl && pl.player;
        if (!Number.isInteger(v) || v === s || v < 0 || v >= state.n || !state.hands[v].length) return { error: "Pick someone with cards to take from." };
        pick.player = v;
    }
    if (c.fx === "swap3") {
        const v = pl && pl.card;
        if (!Number.isInteger(v) || !state.hands[s].includes(v) || others.includes(v)) return { error: "Pick a card from your hand to discard." };
        pick.card = v;
    }
    if (c.fx === "dig") {
        const v = pl && pl.card;
        if (!Number.isInteger(v) || !state.discard.includes(v)) return { error: "Pick a card from the discard pile." };
        pick.card = v;
    }
    return { ok: true, p: { card: { ...c }, by: s, targets: t, pick } };
}

// play one card, or several Action cards at once paid from one pile of numbers; they then go one after another
function playCard(state, s, pl, ctx) {
    if (state.phase !== "turn" || s !== state.turn) return { error: "Wait for your turn." };
    const ids = Array.isArray(pl.ids) ? pl.ids : [pl.id];
    if (!ids.length || ids.length > HAND || new Set(ids).size !== ids.length) return { error: "Pick the cards to play." };
    for (const id of ids) {
        if (!Number.isInteger(id) || !state.hands[s].includes(id)) return { error: "That card isn't in your hand." };
        const c = card(id);
        if (c.t !== "action" && c.t !== "challenge") return { error: "Play Action or Challenge cards on your turn." };
        if (c.t === "challenge" && ids.length > 1) return { error: "Play a Challenge on its own." };
    }
    const cost = ids.reduce((a, id) => a + card(id).v, 0);
    const paid = pay(state, s, cost, pl.pay, pl.wild, ids);
    if (paid.error) return paid;
    const one = ids.length === 1;
    const list = [];
    for (const id of ids) {
        const t = one && Array.isArray(pl.targets) ? pl.targets : pl.targets && pl.targets[id];
        const pk = one && pl.pick && !pl.picks ? pl.pick : pl.picks && pl.picks[id];
        const r = setup(state, s, id, t, pk, ids.concat(paid.ids));
        if (r.error) return ids.length > 1 ? { error: card(id).text.slice(0, 40) + "…: " + r.error } : r;
        list.push(r.p);
    }
    ids.forEach((id) => take(state.hands[s], id));
    spend(state, s, paid);
    if (ids.length > 1) log(state, N(s) + " played " + ids.length + " cards at once (paid " + paid.total + ")", "action");
    state.queue = list.slice(1);
    state.pending = list[0];
    log(state, N(s) + " played " + name(list[0].card) + (list[0].targets.length ? " on " + list[0].targets.map((t) => N(t)).join(" & ") : ""), list[0].card.t);
    startReact(state, ctx);
    return { ok: true };
}

function counter(state, s, pl, ctx) {
    const p = state.pending;
    if (state.phase !== "react" || !p) return { error: "Counter a card right after it's played." };
    if (s === p.by) return { error: "You can't counter your own card." };
    if (p.counter) return { error: "Someone already countered it." };
    const id = pl.id;
    if (!Number.isInteger(id) || !state.hands[s].includes(id) || card(id).t !== "counter") return { error: "Play a Counter card from your hand." };
    const k = card(id).k;
    const targeted = p.card.t === "action" && p.card.who === "anyone";
    if (DIVERTS.includes(k) && !targeted) return { error: "That counter only works when someone was targeted." };
    if (k === "twice" && p.card.t !== "action") return { error: "That only works on an action card." };
    let along = null;
    let cost = card(id).v;
    if (k === "along") {
        const aid = pl.along;
        if (!Number.isInteger(aid) || !state.hands[s].includes(aid) || card(aid).t !== "action" || card(aid).fx) return { error: "Pick an action card from your hand to play along with it." };
        along = aid;
        cost += card(aid).v;
    }
    const paid = pay(state, s, cost, pl.pay, pl.wild, along === null ? [id] : [id, along]);
    if (paid.error) return paid;
    let to = null;
    if (k === "beside" || k === "adjacent") {
        to = pl.to;
        if (!Number.isInteger(to) || to < 0 || to >= state.n) return { error: "Pick who it goes to." };
        if (k === "beside" && to === p.by) return { error: "Anyone but who played it." };
        if (k === "adjacent") {
            const t = p.targets[0];
            if (to !== (t + 1) % state.n && to !== (t - 1 + state.n) % state.n) return { error: "Pick a player next to " + N(t) + "." };
        }
    }
    take(state.hands[s], id);
    state.discard.push(id);
    spend(state, s, paid);
    p.counter = { by: s, k, text: card(id).text };
    log(state, N(s) + " countered: " + card(id).text, "counter");
    const c = p.card;
    if (k === "cancel" || k === "return" || k === "steal" || k === "punish") {
        if (k === "cancel" || k === "punish") state.discard.push(c.id);
        if (k === "punish") log(state, N(p.by) + " drinks 3 times", "drink");
        if (k === "return") state.hands[p.by].push(c.id);
        if (k === "steal") state.hands[s].push(c.id);
        state.tick++;
        state.reactAt = null;
        carryOn(state, ctx);
        return { ok: true };
    }
    if (k === "skip") state.skip[p.by]++;
    if (k === "back") p.targets = [p.by];
    if (k === "beside" || k === "adjacent") p.targets = [to];
    if (k === "self") {
        p.targets = [s];
        p.keeper = s;
        p.keepIfDone = true;
    }
    if (k === "swapscore") p.keeper = s;
    if (k === "allbut") {
        p.everyone = true;
        p.exclude = s;
    }
    if (k === "both" && !p.targets.includes(s)) p.targets = p.targets.concat(s);
    if (k === "twice") p.twice = true;
    if (k === "everyone") p.everyone = true;
    if (k === "along") {
        take(state.hands[s], along);
        p.along = { id: along, by: s };
    }
    afterReact(state, ctx);
    return { ok: true };
}

module.exports = {
    id: "drinkdrown",
    name: "Drink or Drown",
    kind: "turn",
    quick: false,
    players: [2, 8],
    init({ rng, ctx, players = 2 }) {
        const deck = shuffle(rng, CARDS.map((c) => c.id));
        const state = {
            n: players, deck, discard: [], hands: seats(players).map(() => []), scored: seats(players).map(() => []), skip: new Array(players).fill(0),
            turn: 0, turns: 1, phase: "setup", pending: null, passed: null, reactAt: null, tick: 0, cup: null, log: [], logNo: 0, goal: 25,
            conv: [], // Wait cards someone turned into number cards (for good, until the card goes back through the deck)
        };
        seats(players).forEach((s) => draw(state, s, START, ctx));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.hand = state.hands[seat].map((id) => ({ id, ...card(id), ...(state.conv.includes(id) ? { conv: true } : null) }));
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, s, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "undo") return undo(state, ctx);
        if (p.act === "hold") return hold(state, s, ctx);
        // remember the state before anything that changes the game, so the host can undo it
        const snap = UNDOABLE.includes(p.act) && state.phase !== "done" && state.phase !== "setup" ? JSON.stringify(state, (k, v) => (k === "history" ? undefined : v)) : null;
        const logNo = state.logNo;
        const r = act(state, s, p, ctx);
        if (snap && r && r.ok && !r.quiet) {
            const last = state.logNo > logNo ? state.log[state.log.length - 1].text : N(s) + ": " + p.act;
            state.history = (state.history || []).concat({ label: last, snap }).slice(-UNDO);
        }
        if (r && r.ok) checkGoal(state);
        return r;
    },
    result(state) {
        if (state.phase !== "done") return null;
        const pts = seats(state.n).map((s) => points(state, s));
        const best = Math.max(...pts);
        return ranked(pts, "high", "Top score " + best + " after " + state.turns + " turns");
    },
};

// host only: put the game back to how it was before the last move
function undo(state, ctx) {
    if (!ctx.host) return { error: "Only the host can undo." };
    if (state.phase === "done") return { error: "The game is over." };
    const h = state.history && state.history.pop();
    if (!h) return { error: "Nothing to undo." };
    const history = state.history;
    const tick = state.tick;
    const logNo = state.logNo;
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, JSON.parse(h.snap));
    state.history = history;
    state.tick = tick + 1;
    state.logNo = Math.max(state.logNo, logNo);
    if (state.phase === "react") armReact(state, ctx, REACT_MS);
    log(state, "The host undid: " + h.label, "info");
    return { ok: true };
}

// someone opened a counter card: give them time to pick (once per card)
function hold(state, s, ctx) {
    if (state.phase !== "react" || !state.pending || s === state.pending.by || (state.passed && state.passed[s]) || !state.held || state.held[s]) return { ok: true, quiet: true };
    state.held[s] = true;
    armReact(state, ctx, Math.max(HOLD_MS, (state.reactAt || 0) - ctx.now()));
    return { ok: true };
}

function act(state, s, p, ctx) {
    {
        if (state.phase === "done") return { error: "The game is over." };
        const act = p.act;
        // the host sets how long to play (points to win, 0 = until the host ends it), then the first turn starts
        if (act === "begin") {
            if (!ctx.host) return { error: "The host picks how long to play." };
            if (state.phase !== "setup") return { ok: true, quiet: true };
            if (![15, 25, 40, 0].includes(p.goal)) return { error: "Pick a game length." };
            state.goal = p.goal;
            state.phase = "turn";
            log(state, state.goal ? "First to " + state.goal + " points ends the game" : "No limit: the host ends the game", "info");
            return { ok: true };
        }
        if (act === "finish") {
            if (!ctx.host) return { error: "Only the host can end the game." };
            if (state.phase === "setup") return { error: "Start the game first." };
            state.phase = "done";
            state.pending = null;
            return { ok: true };
        }
        if (state.phase === "setup") return { error: "Waiting for the host to pick how long to play." };
        if (act === "play") return playCard(state, s, p, ctx);
        if (act === "counter") return counter(state, s, p, ctx);
        if (act === "pass") {
            if (state.phase !== "react" || !state.passed) return { ok: true, quiet: true };
            state.passed[s] = true;
            if (state.passed.every(Boolean)) afterReact(state, ctx);
            return { ok: true };
        }
        // a Wait card is redeemed when its event happens: take the points, or keep it as a number card (whoever did it drinks either way)
        if (act === "convert") {
            const id = p.id;
            if (!Number.isInteger(id) || !state.hands[s].includes(id) || card(id).t !== "wait") return { error: "Pick a Wait card from your hand." };
            if (state.conv.includes(id)) return { ok: true, quiet: true };
            const by = p.by;
            if (!Number.isInteger(by) || by < 0 || by >= state.n) return { error: "It has to happen first. Who did it?" };
            state.conv.push(id);
            log(state, N(s) + " cashed in " + card(id).text.toLowerCase() + " as a " + card(id).v + ". " + N(by) + " drinks!", "wait");
            return { ok: true };
        }
        if (act === "claim") {
            const id = p.id;
            if (!Number.isInteger(id) || !state.hands[s].includes(id) || card(id).t !== "wait") return { error: "Claim a Wait card from your hand." };
            if (state.conv.includes(id)) return { error: "You turned that one into a number card. It can't be claimed now." };
            const by = p.by;
            if (!Number.isInteger(by) || by < 0 || by >= state.n) return { error: "Who made it happen?" };
            take(state.hands[s], id);
            score(state, s, id, 1);
            log(state, N(s) + " claimed " + card(id).text.toLowerCase() + " (+" + card(id).v + "). " + N(by) + " drinks!", "wait");
            return { ok: true };
        }
        if (act === "give") {
            const g = state.give;
            if (state.phase !== "give" || !g || s !== g.from) return { error: "Nothing to give right now." };
            if (!take(state.hands[s], p.id)) return { error: "Pick a card from your hand." };
            state.hands[g.to].push(p.id);
            log(state, N(s) + " gave a card to " + N(g.to), "info");
            if (--g.left <= 0 || !state.hands[s].length) {
                state.give = null;
                carryOn(state, ctx);
            }
            return { ok: true };
        }
        if (act === "cup") {
            if (!state.cup || !state.cup.open) return { error: "There's no cup on the table." };
            state.cup.open = false;
            state.scored[s].push({ id: state.cup.id, x: 1 });
            log(state, N(s) + " topped off the cup, drank it and took the card (+" + card(state.cup.id).v + ")", "score");
            return { ok: true };
        }
        if (act === "done") {
            const pend = state.pending;
            if (state.phase !== "resolve" || !pend) return { error: "Nothing to finish." };
            const keeper = pend.keeper === undefined ? pend.by : pend.keeper;
            if (s !== pend.by && s !== keeper && !ctx.host) return { error: "Only " + N(pend.by) + " can mark it done." };
            finish(state, !!p.refused, ctx);
            return { ok: true };
        }
        if (act === "join" || act === "ante" || act === "start" || act === "win") {
            const pend = state.pending;
            if (state.phase !== "challenge" || !pend) return { error: "No challenge right now." };
            if (act === "join") {
                if (!pend.everyone && pend.card.who !== "everyone") return { error: "This one is just " + N(pend.by) + " and " + N(pend.targets[0]) + "." };
                if (pend.step !== "ante") return { error: "Too late to join." };
                const i = pend.players.indexOf(s);
                if (i >= 0 && s !== pend.by) {
                    pend.players.splice(i, 1);
                    pend.pot = pend.pot.filter((e) => {
                        if (e.from !== s) return true;
                        state.scored[s].push({ id: e.id, x: e.x, with: e.with });
                        return false;
                    });
                } else if (i < 0) pend.players.push(s);
                return { ok: true };
            }
            if (act === "ante") {
                if (pend.step !== "ante" || !pend.players.includes(s)) return { error: "Only players in the challenge can ante." };
                const id = p.id;
                const list = state.scored[s];
                const i = list.findIndex((e) => e.id === id);
                if (i < 0) return { error: "Ante a card you've scored." };
                const e = list.splice(i, 1)[0];
                pend.pot.push({ ...e, from: s });
                return { ok: true };
            }
            if (act === "start") {
                if (s !== pend.by) return { error: "Only " + N(pend.by) + " starts it." };
                if (pend.players.length < 2) return { error: "Someone needs to join first." };
                pend.step = "play";
                log(state, "Challenge on: " + pend.players.map((x) => N(x)).join(" vs "), "challenge");
                return { ok: true };
            }
            if (act === "win") {
                if (s !== pend.by && !ctx.host) return { error: "Only " + N(pend.by) + " picks the winner." };
                if (pend.step !== "play") return { error: "Start the challenge first." };
                const w = p.seat;
                if (!pend.players.includes(w)) return { error: "Pick someone who played." };
                pend.pot.forEach((e) => state.scored[w].push({ id: e.id, x: e.x }));
                state.scored[w].push({ id: pend.card.id, x: 1 });
                log(state, N(w) + " won the challenge and the pot (+" + (pend.card.v + pend.pot.reduce((a, e) => a + card(e.id).v * e.x, 0)) + ")", "score");
                carryOn(state, ctx);
                return { ok: true };
            }
        }
        if (act === "end") {
            if (state.phase !== "turn" || s !== state.turn) return { error: "Not your turn." };
            draw(state, s, DRAW, ctx);
            if (state.hands[s].length > HAND) {
                state.phase = "discard";
                return { ok: true };
            }
            nextTurn(state, ctx);
            return { ok: true };
        }
        if (act === "discard") {
            if (state.phase !== "discard" || s !== state.turn) return { error: "Nothing to discard." };
            const ids = Array.isArray(p.ids) ? p.ids : [];
            const over = state.hands[s].length - HAND;
            if (ids.length !== over || new Set(ids).size !== ids.length || ids.some((id) => !state.hands[s].includes(id))) return { error: "Discard " + over + " card" + (over === 1 ? "" : "s") + "." };
            ids.forEach((id) => {
                take(state.hands[s], id);
                state.discard.push(id);
            });
            nextTurn(state, ctx);
            return { ok: true };
        }
        return { error: "Bad move." };
    }
}
