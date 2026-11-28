// Word Scramble: both players get the same scrambled word. First to spell a real word with all the tiles
// scores (any anagram in the list counts) and both move on. A wrong word locks you out for a moment.
// A first-letter hint shows halfway through. First to 5 (or most after 15 words) wins.
const { ranked } = require("../rank");
const WIN = 5;
const COUNT = 15;
const READY_MS = 2500;
const REVEAL_MS = 3000;
const ASK_MS = 30000;
const HINT_MS = 14000;
const WRONG_MS = 900;

const WORDS = `
able acid aged also area army away baby back ball band bank base bath bear beat bell belt best bird
blow blue boat body bone book boot born both bowl bulk burn bush busy cake call calm came camp card
care cart case cash cast cell chat chip city clay club coal coat code cold come cook cool cope copy
core corn cost crew crop dark data date dawn deal dear debt deep desk dial diet dish dock door dose
down draw drew drop drum dual duck dust duty each earn ease east easy edge else even ever face fact
fail fair fall farm fast fate fear feed feel fern file fill film find fine fire firm fish five flag
flat flow folk food foot ford form fort four free frog fuel full fund gain game gate gear gift girl
give glad goal goat gold golf gone good gray grew grow gulf hair half hall hand hang hard harm hate
have head hear heat held help herb here hero hide high hill hint hold hole home hope horn host
hour huge hung hunt idea inch into iron item jazz join joke jump jury just keen keep kept kick kind
king kiss kite knee knew know lack lady laid lake lamp land lane last late lead leaf lean left lend
less life lift like lime line link lion list live load loan lock loft logo long look loop lord lose
loss lost loud love luck made mail main make male many mark mask mass mate meal mean meat meet melt
menu mild milk mill mind mine miss mode mood moon more most move much must name navy near neat neck
need nest news next nice nine none nose note okay once only open oven over pace pack page paid pain
pair palm park part pass past path peak pear pick pile pine pink pipe plan play plot plug plus poem
poet pole pond pool poor pork port pose post pour pull pump pure push race rain rank rare rate read
real rear rely rent rest rice rich ride ring rise risk road rock role roll roof room root rope rose
rule rush safe sail sale salt same sand save seat seed seek seem self sell send ship shoe shop shot
show shut sick side sign silk sing sink site size skin slip slow snow soap sock soft soil sold sole
some song soon sort soul spin spot star stay step stir stop such suit sure swim tail take tale talk
tall tank tape task team tear tell tend tent term test text than that them then they thin this tide
tile time tiny tone tool tour town tree trip true tune turn twin type unit upon used user vast very
view vote wage wait wake walk wall want warm wash wave weak wear week well went west what when whom
wide wife wild will wind wine wing wire wise wish with wolf wood word wore work worm yard yarn year
apple beach bread brick brush cabin candy chair chalk charm cheap chess chest chief child cloud coast
crane cream crown dance diary dream drink eagle earth fairy feast field flame float flour focus frame
fresh fruit ghost giant glass globe grape grass green heart honey horse hotel house juice knife lemon
light lucky magic maple march metal money motor mouse mouth music night ocean olive onion orbit paint
panel paper party peace pearl piano pilot pizza plane plant plate point pride prize queen quiet radio
river robot salad scarf scene shark sheep shell shirt skate smile snake space spoon sport stamp stone
storm story sugar sweet table tiger toast tower track train treat truck tulip uncle upset value voice
watch water whale wheel world wrist young zebra listen silent enlist tinsel garden danger ranged
planet castle cattle cereal circle coffee cookie cotton dragon flower forest friend frozen guitar
hammer island jacket jungle kitten ladder lizard market meadow mirror monkey number orange parrot
pencil pepper pickle pirate pillow pocket potato puzzle rabbit rocket saddle shadow silver singer
spider spring stream summer sunset tennis ticket tomato turtle velvet violin window winter wizard
yellow balloon blanket cabbage captain chicken concert cupcake dolphin factory feather fortune galaxy
harvest kitchen lantern library mailbox monster morning penguin picture popcorn rainbow sandals
seaweed station sunrise teacher thunder trumpet unicorn vampire volcano weather whistle
`
    .trim()
    .split(/\s+/)
    .map((w) => w.toUpperCase());

const sortKey = (w) => w.split("").sort().join("");
const VALID = new Set(WORDS);
const SAME = new Map();
for (const w of WORDS) {
    const k = sortKey(w);
    if (!SAME.has(k)) SAME.set(k, []);
    SAME.get(k).push(w);
}

function scramble(rng, word) {
    const a = word.split("");
    for (let tries = 0; tries < 30; tries++) {
        for (let k = a.length - 1; k > 0; k--) {
            const j = Math.floor(rng() * (k + 1));
            [a[k], a[j]] = [a[j], a[k]];
        }
        if (!VALID.has(a.join(""))) return a;
    }
    return a.reverse();
}

function makeWords(rng) {
    const pool = WORDS.slice();
    const out = [];
    while (out.length < COUNT) {
        const i = Math.floor(rng() * pool.length);
        const word = pool.splice(i, 1)[0];
        // easier words first, longer ones later
        const want = out.length < 4 ? [4, 5] : out.length < 9 ? [5, 6] : [5, 6, 7];
        if (!want.includes(word.length) && pool.length > COUNT) continue;
        out.push({ word, letters: scramble(rng, word) });
    }
    return out;
}

function ask(state, ctx) {
    state.phase = "ask";
    state.placed = state.score.map(() => 0);
    state.wrongs = state.score.map(() => 0);
    state.lockUntil = state.score.map(() => 0);
    state.answeredBy = null;
    state.solved = null;
    state.hint = false;
    const now = ctx.now();
    state.deadline = now + ASK_MS;
    const i = state.index;
    ctx.later(HINT_MS, () => {
        if (state.index === i && state.phase === "ask") state.hint = true;
    });
    ctx.later(ASK_MS, () => {
        if (state.index === i && state.phase === "ask") reveal(state, ctx, null, null);
    });
}

function reveal(state, ctx, seat, word) {
    state.phase = "reveal";
    state.answeredBy = seat;
    state.solved = word || state.words[state.index].word;
    if (seat !== null) state.score[seat]++;
    state.history.push(seat);
    state.nextAt = ctx.now() + REVEAL_MS;
    const i = state.index;
    ctx.later(REVEAL_MS, () => {
        if (state.index !== i || state.phase !== "reveal") return;
        if (state.score.some((x) => x >= WIN) || i + 1 >= state.words.length) {
            state.over = true;
            return;
        }
        state.index++;
        ask(state, ctx);
    });
}

module.exports = {
    id: "scramble",
    name: "Word Scramble",
    kind: "live",
    quick: true,
    players: [2, 10],
    WORDS,
    init({ rng, ctx, players = 2 }) {
        const zero = () => new Array(players).fill(0);
        const state = {
            words: makeWords(rng),
            index: 0,
            phase: "ready",
            placed: zero(),
            wrongs: zero(),
            lockUntil: zero(),
            answeredBy: null,
            solved: null,
            hint: false,
            score: zero(),
            history: [],
            deadline: 0,
            nextAt: ctx.now() + READY_MS,
            over: false,
        };
        ctx.later(READY_MS, () => ask(state, ctx));
        return state;
    },
    view(state, seat) {
        const w = state.words[state.index];
        const shown = state.phase !== "ready";
        return {
            index: state.index,
            total: state.words.length,
            win: WIN,
            phase: state.phase,
            len: w.word.length,
            letters: shown ? w.letters : null,
            hint: state.hint || state.phase === "reveal" ? w.word[0] : null,
            myPlaced: state.placed[seat],
            theirPlaced: state.placed[1 - seat],
            myWrongs: state.wrongs[seat],
            theirWrongs: state.wrongs[1 - seat],
            placed: state.placed,
            wrongs: state.wrongs,
            lockUntil: state.lockUntil[seat],
            answeredBy: state.phase === "reveal" ? state.answeredBy : null,
            solved: state.phase === "reveal" ? state.solved : null,
            score: state.score,
            history: state.history,
            deadline: state.deadline,
            nextAt: state.nextAt,
            over: state.over,
        };
    },
    tv(state) {
        const w = state.words[state.index];
        const headline = state.phase === "ready" ? "Get ready…" : state.phase === "reveal" ? state.solved : w.letters.join(" ");
        return { headline, sub: "Word " + (state.index + 1) + " of " + state.words.length, scores: state.score, status: state.score.map((x, s) => (state.phase === "reveal" && state.answeredBy === s ? "Solved it!" : state.phase === "ask" ? state.placed[s] + "/" + w.word.length : null)), win: WIN };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || !Number.isInteger(p.q)) return { error: "Bad move." };
        if (state.over || state.phase !== "ask" || p.q !== state.index) return { ok: true };
        const w = state.words[state.index];
        if (p.placed !== undefined) {
            if (!Number.isInteger(p.placed) || p.placed < 0 || p.placed > w.word.length) return { error: "Bad move." };
            state.placed[seat] = p.placed;
            return { ok: true };
        }
        if (typeof p.guess !== "string" || p.guess.length !== w.word.length) return { error: "Use every letter." };
        const guess = p.guess.toUpperCase();
        if (sortKey(guess) !== sortKey(w.word)) return { error: "Use the tiles you were given." };
        const now = ctx.now();
        if (now < state.lockUntil[seat]) return { error: "Hold on…" };
        if (!VALID.has(guess)) {
            state.wrongs[seat]++;
            state.lockUntil[seat] = now + WRONG_MS;
            state.placed[seat] = 0;
            return { error: "Not a word!" };
        }
        state.placed[seat] = w.word.length;
        reveal(state, ctx, seat, guess);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        if (state.score.length > 2) {
            const r = ranked(state.score, "high");
            const top = Math.max(...state.score);
            r.text = (top >= WIN ? "First to " + WIN : "Most words") + " · " + top + " solved";
            return r;
        }
        const [a, b] = state.score;
        if (a === b) return { winner: null, text: "Tied " + a + "-" + b };
        const w = a > b ? 0 : 1;
        return { winner: w, text: (state.score[w] >= WIN ? "First to " + WIN + ", " : "") + state.score[w] + "-" + state.score[1 - w] };
    },
};
