// 1v1 Duels and Game Night: a pile of mini games played on phones, session records and gauntlets.
// Namespace: /duels. Duel rooms have exactly two seats; group rooms (Game Night) are open to anyone with the
// code (up to MAX_GROUP), the creator hosts and picks the games, and late joiners watch until the next one.
// Group rooms can also have TV screens: no seat, never counted, they get each game's public tv() view.
// Each game lives in ./games/<id>.js and follows the contract in ./CONTRACT.md.
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
const MAX_GROUP = 16;
// lobby extras: a player picks one of AVATARS (the phones draw them), and anyone can throw a quick reaction
const AVATARS = 24;
const REACTS = ["🎉", "😂", "🔥", "😱", "👏", "🍻", "💀", "❤️"];
const HOST_GRACE_MS = 15000;

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

const range = (g) => (Array.isArray(g.players) ? g.players : [2, 2]);
const fits = (g, n) => n >= range(g)[0] && n <= range(g)[1];

function catalog() {
    return Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, quick: !!g.quick, kind: g.kind, players: range(g), options: g.options || null }));
}

function newRoom(code, group) {
    return {
        code,
        group,
        host: 0,
        seats: group ? [] : [null, null], // { key, name, socketId, connected }; null = empty (duel) or left (group)
        stats: { wins: group ? [] : [0, 0], draws: 0, played: [] },
        match: null, // { no, game, players: [room seat per game seat], state, result, seed, startedAt }
        gauntlet: null, // { rounds, list, index, score: [per room seat], done }
        tvs: [], // { key, socketId, connected }
        timers: [],
        notice: null,
        touched: Date.now(),
        matchNo: 0,
        pick: null, // the game the host has picked (group rooms), shown to everyone before it starts
    };
}

// room seats that would play if a game started now
const active = (room) => (room.group ? room.seats.map((s, i) => (s && s.connected ? i : -1)).filter((i) => i >= 0) : [0, 1]);

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

    // lite: mid-match updates skip the games list and stats (the client keeps its last copy). seat -1 = a TV.
    function viewFor(room, seat, lite) {
        const m = room.match;
        let match = null;
        if (m) {
            const g = GAMES[m.game];
            const me = m.players.indexOf(seat);
            let gameView = null;
            try {
                if (me >= 0) gameView = g.view(m.state, me);
            } catch (e) {
                console.log("[DUELS view error]", m.game, e);
            }
            match = { no: m.no, game: m.game, name: g.name, kind: g.kind, players: m.players, me, view: gameView, result: m.result, startedAt: m.startedAt };
            if (me === -1) {
                try {
                    match.tv = g.tv ? g.tv(m.state, { players: m.players.length }) : null;
                } catch (e) {
                    console.log("[DUELS tv error]", m.game, e);
                    match.tv = null;
                }
            }
        }
        const players = room.seats.map((s, i) => (s ? { name: s.name, connected: s.connected, avatar: Number.isInteger(s.avatar) ? s.avatar : i % AVATARS } : null));
        const tvs = room.tvs.filter((t) => t.connected).length;
        if (lite) return { lite: true, code: room.code, seat, players, host: room.host, tvs, match, serverNow: Date.now(), notice: null };
        return {
            code: room.code,
            group: room.group,
            seat,
            host: room.host,
            players,
            tvs,
            stats: room.stats,
            match,
            gauntlet: room.gauntlet,
            pick: room.pick,
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
        if (room.tvs.some((t) => t.connected)) {
            const v = viewFor(room, -1, quick);
            room.tvs.forEach((t) => t.connected && nsp.to(t.socketId).emit("room", v));
        }
    }

    function finish(room, result) {
        const m = room.match;
        if (!m || m.result) return;
        clearTimers(room);
        const n = m.players.length;
        const w = Number.isInteger(result.winner) && result.winner >= 0 && result.winner < n ? m.players[result.winner] : null;
        const pl = result.places;
        let places = null;
        if (Array.isArray(pl) && pl.length === n && pl.every((p) => Number.isInteger(p) && p >= 1 && p <= n)) {
            places = room.seats.map(() => null);
            m.players.forEach((s, i) => (places[s] = pl[i]));
        }
        m.result = { winner: w, places, text: String(result.text || "").slice(0, 140) };
        if (n === 1 && Number.isFinite(result.score)) m.result.score = result.score;
        if (w === null) room.stats.draws++;
        else room.stats.wins[w]++;
        room.stats.played.push({ game: m.game, winner: w });
        if (room.stats.played.length > 100) room.stats.played.shift();
        const gt = room.gauntlet;
        if (gt && !gt.done && gt.list[gt.index] === m.game) {
            if (w !== null) gt.score[w]++;
            const left = gt.rounds - gt.index - 1;
            const sorted = gt.score.slice().sort((a, b) => b - a);
            const clinched = room.group ? sorted[0] > (sorted[1] || 0) + left : sorted[0] >= Math.floor(gt.rounds / 2) + 1;
            if (left <= 0 || clinched) gt.done = true;
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

    // only options the game declares (options: { key: [default, ...allowed] }) reach init
    function pickOptions(g, given) {
        const out = {};
        for (const [k, allowed] of Object.entries(g.options || {})) out[k] = given && allowed.includes(given[k]) ? given[k] : allowed[0];
        return out;
    }

    function startMatch(room, gameId, given) {
        const g = GAMES[gameId];
        const options = g && g.options ? pickOptions(g, given) : given || {};
        const players = active(room);
        if (!g || !fits(g, players.length)) return false;
        clearTimers(room);
        const seed = Math.floor(Math.random() * 2 ** 31);
        const no = ++room.matchNo;
        room.match = { no, game: gameId, players, seed, rng: mulberry32(seed), state: null, result: null, startedAt: Date.now(), options };
        room.match.state = g.init({ seed, rng: room.match.rng, options, ctx: ctxFor(room, no), players: players.length });
        check(room);
        return true;
    }

    function quickList(room, rounds) {
        const n = active(room).length;
        const quick = Object.values(GAMES).filter((g) => g.quick && fits(g, n)).map((g) => g.id);
        if (!quick.length) return null;
        const list = [];
        let bag = [];
        while (list.length < rounds) {
            if (!bag.length) bag = quick.slice().sort(() => Math.random() - 0.5);
            const next = bag.pop();
            if (list[list.length - 1] !== next || quick.length === 1) list.push(next);
        }
        return list;
    }

    function passHost(room) {
        const h = room.seats[room.host];
        if (h && h.connected) return;
        const next = room.seats.findIndex((s, i) => s && s.connected && i !== room.host);
        if (next >= 0) room.host = next;
    }

    nsp.on("connection", (socket) => {
        let room = null;
        let seat = null;
        let tv = null;
        const touch = () => room && (room.touched = Date.now());
        const mine = () => room && seat !== null && room.seats[seat] && room.seats[seat].socketId === socket.id;
        // duels: either player; group rooms: only the host picks
        const picker = () => mine() && (!room.group || room.host === seat);
        // a group can start a one-player game on its own; gauntlets still need two
        const ready = (min = 2) => (room.group ? active(room).length >= min : !!(room.seats[0] && room.seats[1]));

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
            const r = newRoom(makeCode(new Set(rooms.keys())), !!(data && data.group));
            rooms.set(r.code, r);
            if (r.group) r.stats.wins.push(0);
            const key = sit(r, 0, name);
            console.log("[DUELS] " + (r.group ? "group" : "duel") + " room created " + r.code);
            ack({ ok: true, code: r.code, key, seat: 0 });
            broadcast(r);
        }));

        socket.on("duel:join", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r) return ack({ ok: false, error: "That room code doesn't exist." });
            if (data && data.group !== undefined && !!data.group !== r.group) {
                return ack({ ok: false, error: r.group ? "That's a Game Night room. Join it at /gamenight." : "That's a 1v1 Duels room. Join it at /duels." });
            }
            const name = cleanName(data && data.name, 16);
            const key = String((data && data.key) || "");
            let s = r.seats.findIndex((x) => x && key && x.key === key);
            if (s === -1) {
                if (!name) return ack({ ok: false, error: "Enter your name." });
                const away = r.seats.findIndex((x) => x && !x.connected && x.name.toLowerCase() === name.toLowerCase());
                if (r.group) {
                    if (away !== -1) s = away;
                    else {
                        if (active(r).length >= MAX_GROUP) return ack({ ok: false, error: "This room is full (" + MAX_GROUP + " players)." });
                        s = r.seats.length;
                        r.seats.push(null);
                        r.stats.wins.push(0);
                        if (r.gauntlet) r.gauntlet.score.push(0);
                    }
                } else {
                    s = r.seats.findIndex((x) => !x);
                    if (s === -1) {
                        if (away === -1) return ack({ ok: false, error: "This room already has two players." });
                        s = away;
                    }
                }
            }
            const finalName = name || r.seats[s].name;
            const newKey = sit(r, s, finalName, r.seats[s] ? r.seats[s].key : null);
            const h = r.seats[r.host];
            if (r.group && (!h || (!h.connected && Date.now() - (h.awayAt || 0) > HOST_GRACE_MS))) r.host = s;
            ack({ ok: true, code: r.code, key: newKey, seat: s });
            broadcast(r);
        }));

        // a TV screen for a group room: code only, rejoins with its key
        socket.on("duel:tv", safe((data, ack) => {
            if (typeof ack !== "function" || room) return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r) return ack({ ok: false, error: "That room code doesn't exist." });
            if (!r.group) return ack({ ok: false, error: "TV screens are for Game Night rooms." });
            const key = String((data && data.key) || "");
            tv = r.tvs.find((t) => key && t.key === key);
            if (!tv) {
                r.tvs = r.tvs.filter((t) => t.connected).slice(-7);
                tv = { key: makeKey() };
                r.tvs.push(tv);
            }
            tv.socketId = socket.id;
            tv.connected = true;
            room = r;
            socket.join(r.code);
            touch();
            ack({ ok: true, code: r.code, key: tv.key, seat: -1 });
            broadcast(r);
        }));

        // the host's current pick, so everyone can read about it before it starts
        socket.on("duel:pick", safe((data) => {
            if (!room || !room.group || !picker()) return;
            const id = data && data.game ? String(data.game) : null;
            if (id !== null && !GAMES[id]) return;
            if (room.pick === id) return;
            room.pick = id;
            touch();
            broadcast(room);
        }));

        socket.on("duel:avatar", safe((data) => {
            if (!mine()) return;
            const a = Number(data && data.avatar);
            if (!Number.isInteger(a) || a < 0 || a >= AVATARS) return;
            room.seats[seat].avatar = a;
            touch();
            broadcast(room);
        }));

        // a quick emoji from the lobby; everyone in the room (and the TV) sees it float up
        let lastReact = 0;
        socket.on("duel:react", safe((data) => {
            if (!mine() || !room.group) return;
            const e = String((data && data.e) || "");
            if (!REACTS.includes(e) || Date.now() - lastReact < 600) return;
            lastReact = Date.now();
            nsp.to(room.code).emit("react", { seat, e, at: Date.now() });
        }));

        socket.on("duel:start", safe((data) => {
            if (!picker() || !ready(1)) return;
            if (room.match && !room.match.result) return;
            const id = String((data && data.game) || "");
            if (!GAMES[id]) return;
            const gauntlet = room.gauntlet;
            room.gauntlet = null;
            if (startMatch(room, id, data && data.options)) {
                touch();
                broadcast(room);
            } else room.gauntlet = gauntlet;
        }));

        socket.on("duel:gauntlet", safe((data) => {
            if (!picker() || !ready()) return;
            if (room.match && !room.match.result) return;
            const rounds = [3, 5, 7, 9].includes(Number(data && data.rounds)) ? Number(data.rounds) : 5;
            const list = quickList(room, rounds);
            if (!list) return;
            room.gauntlet = { rounds, list, index: 0, score: room.seats.map(() => 0), done: false };
            startMatch(room, list[0]);
            touch();
            broadcast(room);
        }));

        // Next game in the gauntlet (either duel player, or the group host, once the current one is over).
        socket.on("duel:next", safe(() => {
            if (!picker()) return;
            const gt = room.gauntlet;
            if (!gt || gt.done || !room.match || !room.match.result) return;
            // the crowd may have changed: swap in a quick game that fits if this one doesn't
            const n = active(room).length;
            if (n < 2) return;
            if (!fits(GAMES[gt.list[gt.index + 1]], n)) {
                const alt = quickList(room, 1);
                if (!alt) return;
                gt.list[gt.index + 1] = alt[0];
            }
            gt.index++;
            startMatch(room, gt.list[gt.index]);
            touch();
            broadcast(room);
        }));

        socket.on("duel:rematch", safe(() => {
            if (!picker() || !room.match || !room.match.result || room.gauntlet) return;
            if (startMatch(room, room.match.game, room.match.options)) {
                touch();
                broadcast(room);
            }
        }));

        socket.on("duel:menu", safe(() => {
            if (!mine() || !room.match) return;
            const running = !room.match.result;
            // in a group, a player in the game can quit it (that ends it for everyone); the host closes the results
            if (room.group && (running ? !room.match.players.includes(seat) : room.host !== seat)) return;
            // leaving mid-game just cancels it; nobody's record changes
            room.notice = running ? { text: room.seats[seat].name + " left the game.", at: Date.now(), seat } : null;
            clearTimers(room);
            room.match = null;
            room.gauntlet = null;
            touch();
            broadcast(room);
        }));

        // leave a group room for good (duel rooms keep the seat so you can come back)
        socket.on("duel:leave", safe(() => {
            if (!mine() || !room.group) return;
            const r = room;
            const name = r.seats[seat].name;
            if (r.match && !r.match.result && r.match.players.includes(seat)) {
                r.notice = { text: name + " left the game.", at: Date.now(), seat };
                clearTimers(r);
                r.match = null;
                r.gauntlet = null;
            }
            r.seats[seat] = null;
            socket.leave(r.code);
            passHost(r);
            room = null;
            seat = null;
            broadcast(r);
        }));

        socket.on("duel:move", safe((data, ack) => {
            const reply = typeof ack === "function" ? ack : () => { };
            if (!mine() || !room.match || room.match.result) return reply({ ok: false });
            if (JSON.stringify(data || {}).length > 4000) return reply({ ok: false });
            const m = room.match;
            const me = m.players.indexOf(seat);
            if (me < 0) return reply({ ok: false, error: "You're watching this one." });
            const g = GAMES[m.game];
            let res;
            try {
                res = g.move(m.state, me, data || {}, { ...ctxFor(room, m.no), host: picker() }) || { ok: true };
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
            if (tv && tv.socketId === socket.id) {
                tv.connected = false;
                broadcast(room);
                return;
            }
            if (room && seat !== null && room.seats[seat] && room.seats[seat].socketId === socket.id) {
                room.seats[seat].connected = false;
                room.seats[seat].awayAt = Date.now();
                // a refresh shouldn't cost the host the room: hand it on only if they stay away
                if (room.group && room.host === seat) {
                    const r = room;
                    setTimeout(safe(() => {
                        passHost(r);
                        broadcast(r);
                    }), HOST_GRACE_MS).unref();
                }
                broadcast(room);
            }
        }));
    });
};

module.exports.GAMES = GAMES;
module.exports.mulberry32 = mulberry32;
module.exports.MAX_GROUP = MAX_GROUP;
