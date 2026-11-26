// 1v1 Duels: two-player rooms, a pile of mini games, session win/loss record and gauntlets.
// Namespace: /duels. Each game lives in ./games/<id>.js and follows the contract in ./CONTRACT.md.
const fs = require("fs");
const path = require("path");
const { makeCode, makeKey, cleanName, cleanCode, startSweeper, safe } = require("../roomUtils");

const GAMES = {};
for (const f of fs.readdirSync(path.join(__dirname, "games"))) {
    if (!f.endsWith(".js")) continue;
    const g = require(path.join(__dirname, "games", f));
    if (g && g.id) GAMES[g.id] = g;
}

const rooms = new Map();

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function catalog() {
    return Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, quick: !!g.quick, kind: g.kind }));
}

function newRoom(code) {
    return {
        code,
        seats: [null, null], // { key, name, socketId, connected }
        stats: { wins: [0, 0], draws: 0, played: [] },
        match: null, // { id, game, state, result, seed, startedAt }
        gauntlet: null, // { rounds, list, index, score:[a,b], done }
        timers: [],
        notice: null,
        touched: Date.now(),
        matchNo: 0,
    };
}

module.exports = function attachDuels(io) {
    const nsp = io.of("/duels");
    startSweeper(rooms, (code) => {
        const r = rooms.get(code);
        if (r) r.timers.forEach(clearTimeout);
    });

    function clearTimers(room) {
        room.timers.forEach(clearTimeout);
        room.timers = [];
    }

    // lite: mid-match updates skip the games list and stats (the client keeps its last copy)
    function viewFor(room, seat, lite) {
        const m = room.match;
        let match = null;
        if (m) {
            const g = GAMES[m.game];
            let gameView = null;
            try {
                gameView = g.view(m.state, seat);
            } catch (e) {
                console.log("[DUELS view error]", m.game, e);
            }
            match = { no: m.no, game: m.game, name: g.name, kind: g.kind, view: gameView, result: m.result, startedAt: m.startedAt };
        }
        if (lite) return { lite: true, code: room.code, seat, players: room.seats.map((s) => (s ? { name: s.name, connected: s.connected } : null)), match, serverNow: Date.now(), notice: null };
        return {
            code: room.code,
            seat,
            players: room.seats.map((s) => (s ? { name: s.name, connected: s.connected } : null)),
            stats: room.stats,
            match,
            gauntlet: room.gauntlet,
            games: catalog(),
            serverNow: Date.now(),
            notice: room.notice && room.notice.seat !== seat && Date.now() - room.notice.at < 8000 ? room.notice.text : null,
        };
    }

    function broadcast(room, lite) {
        const quick = lite && room.match && !room.match.result;
        room.seats.forEach((s, seat) => {
            if (s && s.socketId) nsp.to(s.socketId).emit("room", viewFor(room, seat, quick));
        });
    }

    function finish(room, result) {
        const m = room.match;
        if (!m || m.result) return;
        clearTimers(room);
        m.result = { winner: result.winner === 0 || result.winner === 1 ? result.winner : null, text: String(result.text || "").slice(0, 140) };
        if (m.result.winner === null) room.stats.draws++;
        else room.stats.wins[m.result.winner]++;
        room.stats.played.push({ game: m.game, winner: m.result.winner });
        if (room.stats.played.length > 100) room.stats.played.shift();
        const gt = room.gauntlet;
        if (gt && !gt.done && gt.list[gt.index] === m.game) {
            if (m.result.winner !== null) gt.score[m.result.winner]++;
            const need = Math.floor(gt.rounds / 2) + 1;
            if (gt.index + 1 >= gt.rounds || gt.score[0] >= need || gt.score[1] >= need) gt.done = true;
        }
    }

    function check(room) {
        const m = room.match;
        if (!m || m.result) return;
        let r = null;
        try {
            r = GAMES[m.game].result(m.state);
        } catch (e) {
            console.log("[DUELS result error]", m.game, e);
        }
        if (r) finish(room, r);
    }

    function ctxFor(room, no) {
        return {
            rng: room.match.rng,
            now: () => Date.now(),
            // run fn later (if this match is still the current one), then re-check and broadcast
            later: (ms, fn) => {
                const t = setTimeout(
                    safe(() => {
                        room.timers = room.timers.filter((x) => x !== t);
                        if (!room.match || room.match.no !== no || room.match.result) return;
                        fn(Date.now());
                        check(room);
                        broadcast(room, true);
                    }),
                    ms
                );
                room.timers.push(t);
            },
        };
    }

    function startMatch(room, gameId, options) {
        const g = GAMES[gameId];
        if (!g) return false;
        clearTimers(room);
        const seed = Math.floor(Math.random() * 2 ** 31);
        const no = ++room.matchNo;
        room.match = { no, game: gameId, seed, rng: mulberry32(seed), state: null, result: null, startedAt: Date.now() };
        room.match.state = g.init({ seed, rng: room.match.rng, options: options || {}, ctx: ctxFor(room, no) });
        check(room);
        return true;
    }

    nsp.on("connection", (socket) => {
        let room = null;
        let seat = null;
        const touch = () => room && (room.touched = Date.now());
        const mine = () => room && seat !== null && room.seats[seat] && room.seats[seat].socketId === socket.id;

        function sit(r, s, name, key) {
            r.seats[s] = { key: key || makeKey(), name, socketId: socket.id, connected: true };
            room = r;
            seat = s;
            socket.join(r.code);
            touch();
            return r.seats[s].key;
        }

        socket.on("duel:create", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const name = cleanName(data && data.name, 16);
            if (!name) return ack({ ok: false, error: "Enter your name." });
            const r = newRoom(makeCode(new Set(rooms.keys())));
            rooms.set(r.code, r);
            const key = sit(r, 0, name);
            console.log("[DUELS] room created " + r.code);
            ack({ ok: true, code: r.code, key, seat: 0 });
            broadcast(r);
        }));

        socket.on("duel:join", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r) return ack({ ok: false, error: "That room code doesn't exist." });
            const name = cleanName(data && data.name, 16);
            const key = String((data && data.key) || "");
            let s = r.seats.findIndex((x) => x && key && x.key === key);
            if (s === -1) {
                if (!name) return ack({ ok: false, error: "Enter your name." });
                s = r.seats.findIndex((x) => !x);
                if (s === -1) {
                    const away = r.seats.findIndex((x) => x && !x.connected && x.name.toLowerCase() === name.toLowerCase());
                    if (away === -1) return ack({ ok: false, error: "This room already has two players." });
                    s = away;
                }
            }
            const finalName = name || r.seats[s].name;
            const newKey = sit(r, s, finalName, r.seats[s] ? r.seats[s].key : null);
            ack({ ok: true, code: r.code, key: newKey, seat: s });
            broadcast(r);
        }));

        socket.on("duel:start", safe((data) => {
            if (!mine() || !room.seats[0] || !room.seats[1]) return;
            if (room.match && !room.match.result) return;
            const id = String((data && data.game) || "");
            if (!GAMES[id]) return;
            room.gauntlet = null;
            if (startMatch(room, id, data && data.options)) {
                touch();
                broadcast(room);
            }
        }));

        socket.on("duel:gauntlet", safe((data) => {
            if (!mine() || !room.seats[0] || !room.seats[1]) return;
            if (room.match && !room.match.result) return;
            const rounds = [3, 5, 7, 9].includes(Number(data && data.rounds)) ? Number(data.rounds) : 5;
            const quick = Object.values(GAMES).filter((g) => g.quick).map((g) => g.id);
            if (!quick.length) return;
            const list = [];
            let bag = [];
            while (list.length < rounds) {
                if (!bag.length) bag = quick.slice().sort(() => Math.random() - 0.5);
                const next = bag.pop();
                if (list[list.length - 1] !== next || quick.length === 1) list.push(next);
            }
            room.gauntlet = { rounds, list, index: 0, score: [0, 0], done: false };
            startMatch(room, list[0]);
            touch();
            broadcast(room);
        }));

        // Next game in the gauntlet (either player can press it once the current one is over).
        socket.on("duel:next", safe(() => {
            if (!mine()) return;
            const gt = room.gauntlet;
            if (!gt || gt.done || !room.match || !room.match.result) return;
            gt.index++;
            startMatch(room, gt.list[gt.index]);
            touch();
            broadcast(room);
        }));

        socket.on("duel:rematch", safe(() => {
            if (!mine() || !room.match || !room.match.result || room.gauntlet) return;
            startMatch(room, room.match.game);
            touch();
            broadcast(room);
        }));

        socket.on("duel:menu", safe(() => {
            if (!mine()) return;
            // leaving mid-game just cancels it; nobody's record changes
            room.notice = room.match && !room.match.result ? { text: room.seats[seat].name + " left the game.", at: Date.now(), seat } : null;
            clearTimers(room);
            room.match = null;
            room.gauntlet = null;
            touch();
            broadcast(room);
        }));

        socket.on("duel:move", safe((data, ack) => {
            const reply = typeof ack === "function" ? ack : () => { };
            if (!mine() || !room.match || room.match.result) return reply({ ok: false });
            if (JSON.stringify(data || {}).length > 4000) return reply({ ok: false });
            const m = room.match;
            const g = GAMES[m.game];
            let res;
            try {
                res = g.move(m.state, seat, data || {}, ctxFor(room, m.no)) || { ok: true };
            } catch (e) {
                console.log("[DUELS move error]", m.game, e);
                res = { error: "That move didn't work." };
            }
            touch();
            check(room);
            if (!res.quiet || room.match.result) broadcast(room, true);
            reply(res.error ? { ok: false, error: res.error } : { ok: true });
        }));

        socket.on("disconnect", safe(() => {
            if (room && seat !== null && room.seats[seat] && room.seats[seat].socketId === socket.id) {
                room.seats[seat].connected = false;
                broadcast(room);
            }
        }));
    });
};

module.exports.GAMES = GAMES;
module.exports.mulberry32 = mulberry32;
