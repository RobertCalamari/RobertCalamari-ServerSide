// Typing Race: both type the same seeded sentence. Phones send their whole typed text a few times a second;
// the server measures the correct prefix (capped at a superhuman speed) and moves each car. First to type the
// sentence exactly takes the round; if time runs out the furthest car does. First to 2 rounds (ties replay, 5 max).
const WIN = 2;
const MAX_ROUNDS = 5;
const COUNT_MS = 3000;
const ROUND_MS = 45000;
const PAUSE_MS = 4500;
const MAX_CPS = 22; // ~260 WPM, well past any phone thumb
const BURST = 12;
const SLACK = 12; // extra characters a player may type past the end

const SENTENCES = `
The quick brown fox jumps over the lazy dog
A purple cat danced on the kitchen table
My pizza has way too many pineapples on it
The robot ordered a milkshake with extra sprinkles
Seven penguins slid down the icy hill together
Never trust a duck that wears a tiny hat
The pirate lost his map behind the couch
Bananas taste better when you eat them upside down
A giant snail won the marathon this year
The wizard forgot where he parked his dragon
Our dog thinks the vacuum is a monster
Tacos are the best food on a rainy day
The moon looks like a big slice of cheese
Grandma beat everyone at video games again
A sleepy bear stole all of our pancakes
The goldfish is planning a daring escape tonight
Please do not feed the hungry office plant
My socks never match and I like it that way
The rocket blasted off toward the purple planet
Someone hid a frog inside the teacher desk
The squirrel buried a cookie in my shoe
Dancing in the rain is free and fun
The tiny dinosaur wanted a bigger skateboard
A ghost borrowed my headphones and never returned them
The cookies vanished before anyone could count them
Our team of llamas won the soccer final
The chef dropped the cake but saved the cherry
A brave little toaster saved the whole town
Ninjas are quiet but their snacks are crunchy
The ice cream truck plays the same song forever
My cat sits on the keyboard when I work
The bus driver sang every song on the radio
A tiny dragon sneezed and lit the candles
Never race a cheetah on roller skates
The volcano erupted with hot chocolate and marshmallows
Lucky the hamster runs a mile every night
The snowman wore sunglasses to the beach party
Aliens landed just to try our french fries
The parrot keeps telling everyone my secrets
Bubbles floated over the garden like little moons
The king traded his crown for a sandwich
Our neighbor built a castle out of boxes
A turtle with a jetpack zoomed past the bus
The banana phone rang during the math test
Every wizard needs a good pair of slippers
The lighthouse blinked hello to the passing whales
I found a dinosaur bone in the sandbox
Three ducks walked into the library and sat down
The giant cupcake rolled down the main street
My shadow is braver than I am at night
The jellyfish glowed like a disco ball
A moose wandered into the bakery for donuts
The clock struck thirteen and everyone laughed
Monkeys are better at climbing than at cooking
Sharks are scared of my singing voice
The garden gnome went on a summer vacation
Nobody knows why the cow jumped over the moon
The yellow taxi zipped through the rainy city
A friendly ghost lives in our old attic
Pancakes stacked to the ceiling make a happy morning
The goat ate my homework and asked for more
A koala napped on top of the school bus
The marching band played louder than the thunder
My bicycle bell scares every pigeon in town
The spaceship parked right next to the lemonade stand
Owls stay up late reading mystery books
The puppy chased its tail for an hour
A raccoon opened a tiny shop for shiny things
The windy day carried my kite over the hill
Hot soup and warm socks fix almost everything
The octopus juggled eight oranges at the fair
A comet zoomed past and waved at the earth
The kitten fell asleep inside the laundry basket
Our sandcastle survived the waves for one minute
The frog prince only wanted a cheeseburger
Robots love to dance when nobody is watching
The baby elephant blew bubbles in the pond
Every superhero needs a good nap sometimes
The mailman delivered a letter from a penguin
`
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const norm = (s) => s.replace(/ /g, " ").toLowerCase();

function pickSentences(rng) {
    const pool = SENTENCES.slice();
    const out = [];
    while (out.length < MAX_ROUNDS) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
}

const wpm = (chars, ms) => (ms > 0 ? Math.round(chars / 5 / (ms / 60000)) : 0);

function startRound(state, ctx) {
    const now = ctx.now();
    state.round++;
    state.phase = "count";
    state.startAt = now + COUNT_MS;
    state.endAt = state.startAt + ROUND_MS;
    state.nextAt = null;
    state.progress = [0, 0];
    state.err = [false, false];
    state.doneAt = [null, null];
    state.roundWinner = null;
    const round = state.round;
    ctx.later(COUNT_MS, () => {
        if (state.round === round && state.phase === "count") state.phase = "play";
    });
    ctx.later(COUNT_MS + ROUND_MS, (t) => {
        if (state.round === round && state.phase === "play") endRound(state, ctx, t);
    });
}

function endRound(state, ctx, now) {
    const s = state.sentences[state.round - 1];
    state.phase = "result";
    const [a, b] = state.progress;
    let w = null;
    if (state.doneAt[0] !== null) w = 0;
    else if (state.doneAt[1] !== null) w = 1;
    else if (a !== b) w = a > b ? 0 : 1;
    state.roundWinner = w;
    if (w !== null) state.score[w]++;
    const ms = Math.min(now, state.endAt) - state.startAt;
    state.history.push({
        winner: w,
        finished: w !== null && state.doneAt[w] !== null,
        wpm: [0, 1].map((p) => wpm(state.progress[p], ms)),
        pct: [0, 1].map((p) => Math.round((state.progress[p] / s.length) * 100)),
        ms,
    });
    const over = state.score[0] >= WIN || state.score[1] >= WIN || state.round >= MAX_ROUNDS;
    state.nextAt = over ? null : now + PAUSE_MS;
    const round = state.round;
    ctx.later(PAUSE_MS, () => {
        if (state.round !== round || state.phase !== "result") return;
        if (over) state.phase = "done";
        else startRound(state, ctx);
    });
}

module.exports = {
    id: "typingrace",
    name: "Typing Race",
    kind: "live",
    quick: true,
    SENTENCES,
    init({ rng, ctx }) {
        const state = { round: 0, score: [0, 0], history: [], sentences: pickSentences(rng) };
        startRound(state, ctx);
        return state;
    },
    view(state) {
        const s = state.sentences[state.round - 1];
        return {
            phase: state.phase,
            round: state.round,
            win: WIN,
            maxRounds: MAX_ROUNDS,
            score: state.score,
            history: state.history,
            startAt: state.startAt,
            endAt: state.endAt,
            nextAt: state.nextAt,
            len: s.length,
            sentence: state.phase === "count" ? null : s,
            progress: state.progress,
            err: state.err,
            doneAt: state.doneAt,
            roundWinner: state.roundWinner,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || !Number.isInteger(p.round) || typeof p.text !== "string") return { error: "Bad move." };
        const s = state.sentences[state.round - 1];
        if (p.text.length > s.length + SLACK) return { error: "Too long." };
        if (p.round !== state.round || state.phase !== "play") return { ok: true, quiet: true };
        const now = ctx.now();
        if (now < state.startAt) return { error: "Not yet!" };
        if (now >= state.endAt) {
            endRound(state, ctx, now);
            return { ok: true };
        }
        const text = norm(p.text);
        const want = norm(s);
        let n = 0;
        while (n < text.length && n < want.length && text[n] === want[n]) n++;
        const cap = Math.floor(((now - state.startAt) * MAX_CPS) / 1000) + BURST;
        n = Math.min(n, cap);
        const rest = text.slice(n);
        const err = n < want.length ? rest.length > 0 : rest.trim().length > 0; // a stray trailing space is fine
        if (n === state.progress[seat] && err === state.err[seat]) return { ok: true, quiet: true };
        state.progress[seat] = n;
        state.err[seat] = err;
        if (n === want.length && !err) {
            state.doneAt[seat] = now;
            endRound(state, ctx, now);
        }
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const [a, b] = state.score;
        const fast = (p) => Math.max(0, ...state.history.map((h) => h.wpm[p]));
        if (a === b) return { winner: null, text: "Even at " + a + "-" + b + " · top speed " + Math.max(fast(0), fast(1)) + " WPM" };
        const w = a > b ? 0 : 1;
        return { winner: w, text: "Won " + state.score[w] + "-" + state.score[1 - w] + " · top speed " + fast(w) + " WPM" };
    },
};
