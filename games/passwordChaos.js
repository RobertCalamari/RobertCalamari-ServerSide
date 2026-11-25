// Password Chaos online rooms. Namespace: /passwordchaos
//
// One host screen runs the room (picks the mode, starts, moves to the next round).
// Everyone else joins on their phone and types their own password. The server checks each
// password against the unlocked rules and tells the room who has passed, in what order.
// The host can also play by giving a name when creating the room.
const { makeCode, makeKey, cleanName, cleanCode, shuffle, startSweeper, safe } = require("./roomUtils");
const { levelRules, chaosRules } = require("./passwordRules");

const MAX_PLAYERS = 40;
const MAX_PASSWORD = 300;
const LEVELS = levelRules.length;

const rooms = new Map();

function activeRules(room) {
    return room.ruleIds.map((id) => (id.startsWith("C") ? chaosRules[+id.slice(1)] : levelRules[room.level - 1][+id.slice(1)]));
}

function unlocked(room) {
    return activeRules(room).slice(0, room.round);
}

function failedFor(room, password) {
    if (!password) return [];
    return unlocked(room)
        .map((r, i) => (r.test(password) ? -1 : i))
        .filter((i) => i >= 0);
}

function evaluate(room, p) {
    const failed = failedFor(room, p.password);
    const passing = p.password.length > 0 && failed.length === 0;
    if (passing && !p.passedAt) p.passedAt = Date.now();
    if (!passing) p.passedAt = null;
    p.failed = failed;
}

function publicState(room) {
    const rules = activeRules(room);
    const passed = [...room.players.values()].filter((p) => p.passedAt).sort((a, b) => a.passedAt - b.passedAt);
    return {
        code: room.code,
        phase: room.phase,
        mode: room.mode,
        level: room.level,
        levels: LEVELS,
        round: room.round,
        totalRules: rules.length,
        rules: rules.slice(0, room.round).map((r) => r.text), // locked rules stay secret
        hostConnected: Boolean(room.hostSocketId),
        players: [...room.players.values()].map((p) => ({
            pid: p.pid,
            name: p.name,
            connected: p.connected,
            typed: p.password.length > 0,
            failedCount: p.failed.length,
            place: p.passedAt ? passed.indexOf(p) + 1 : null,
            score: p.score,
        })),
    };
}

function startLevel(room) {
    if (room.mode === "chaos") {
        room.ruleIds = shuffle(chaosRules.map((_, i) => "C" + i)).slice(0, 30);
    } else {
        room.ruleIds = levelRules[room.level - 1].map((_, i) => "L" + i);
    }
    room.round = 1;
}

function clearPasswords(room) {
    for (const p of room.players.values()) {
        p.password = "";
        p.failed = [];
        p.passedAt = null;
    }
}

module.exports = function attachPasswordChaos(io) {
    const nsp = io.of("/passwordchaos");
    startSweeper(rooms);

    const broadcast = (room) => nsp.to(room.code).emit("state", publicState(room));
    // Each player gets the exact rules they're failing; only they see their own password.
    const sendMine = (room, p) => {
        if (p.socketId) nsp.to(p.socketId).emit("mine", { password: p.password, failed: p.failed, round: room.round, level: room.level });
    };

    function addPlayer(room, name, key, socketId) {
        let p = key ? [...room.players.values()].find((x) => x.key === key) : null;
        if (!p) {
            const clash = [...room.players.values()].find((x) => x.name.toLowerCase() === name.toLowerCase());
            if (clash && clash.connected) return { error: "Someone in this room already has that name." };
            if (clash) p = clash;
        }
        if (!p) {
            if (room.players.size >= MAX_PLAYERS) return { error: "This room is full." };
            p = { pid: room.nextPid++, key: key || makeKey(), name, password: "", failed: [], passedAt: null, score: 0, socketId: null, connected: false };
            room.players.set(p.pid, p);
        }
        p.name = name;
        p.socketId = socketId;
        p.connected = true;
        return { p };
    }

    nsp.on("connection", (socket) => {
        let room = null;
        let me = null;
        let hosting = false;
        const touch = () => room && (room.touched = Date.now());
        const isHost = () => hosting && room && room.hostSocketId === socket.id;

        socket.on("host:create", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const code = makeCode(new Set(rooms.keys()));
            room = {
                code,
                hostKey: makeKey(),
                hostSocketId: socket.id,
                phase: "lobby",
                mode: "structured",
                level: 1,
                round: 1,
                ruleIds: [],
                players: new Map(),
                nextPid: 1,
                touched: Date.now(),
            };
            rooms.set(code, room);
            hosting = true;
            socket.join(code);
            const name = cleanName(data && data.name);
            if (name) me = addPlayer(room, name, "", socket.id).p;
            console.log("[PASSWORD CHAOS] room created " + code);
            ack({ ok: true, code, hostKey: room.hostKey, pid: me ? me.pid : null, playerKey: me ? me.key : null });
            broadcast(room);
        }));

        socket.on("host:resume", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r || r.hostKey !== String(data && data.hostKey)) return ack({ ok: false });
            room = r;
            hosting = true;
            room.hostSocketId = socket.id;
            socket.join(room.code);
            const key = String((data && data.playerKey) || "");
            const mine = key && [...room.players.values()].find((x) => x.key === key);
            if (mine) {
                me = mine;
                me.socketId = socket.id;
                me.connected = true;
            }
            touch();
            ack({ ok: true, code: room.code, pid: me ? me.pid : null });
            broadcast(room);
            if (me) sendMine(room, me);
        }));

        socket.on("host:mode", safe((data) => {
            if (!isHost() || room.phase !== "lobby") return;
            room.mode = data && data.mode === "chaos" ? "chaos" : "structured";
            touch();
            broadcast(room);
        }));

        socket.on("host:start", safe(() => {
            if (!isHost() || !room.players.size) return;
            room.phase = "playing";
            room.level = 1;
            for (const p of room.players.values()) p.score = 0;
            startLevel(room);
            clearPasswords(room);
            touch();
            broadcast(room);
            for (const p of room.players.values()) sendMine(room, p);
        }));

        socket.on("host:next", safe(() => {
            if (!isHost() || room.phase !== "playing") return;
            // Score the round that just ended: 3 / 2 / 1 for the first three to pass, 1 for everyone else who passed.
            const passed = [...room.players.values()].filter((p) => p.passedAt).sort((a, b) => a.passedAt - b.passedAt);
            passed.forEach((p, i) => (p.score += Math.max(1, 3 - i)));

            clearPasswords(room);
            if (room.round < room.ruleIds.length) {
                room.round++;
            } else if (room.mode === "structured" && room.level < LEVELS) {
                room.level++;
                startLevel(room);
            } else {
                room.phase = "complete";
            }
            touch();
            broadcast(room);
            for (const p of room.players.values()) sendMine(room, p);
        }));

        socket.on("host:restart", safe(() => {
            if (!isHost()) return;
            room.phase = "lobby";
            room.level = 1;
            room.round = 1;
            room.ruleIds = [];
            clearPasswords(room);
            for (const p of room.players.values()) p.score = 0;
            touch();
            broadcast(room);
            for (const p of room.players.values()) sendMine(room, p);
        }));

        socket.on("host:kick", safe((data) => {
            if (!isHost()) return;
            const p = room.players.get(Number(data && data.pid));
            if (!p || p === me) return;
            room.players.delete(p.pid);
            if (p.socketId) nsp.to(p.socketId).emit("kicked");
            touch();
            broadcast(room);
        }));

        socket.on("player:join", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r) return ack({ ok: false, error: "That room code doesn't exist. Check the code on the host's screen." });
            const name = cleanName(data && data.name);
            if (!name) return ack({ ok: false, error: "Enter your name." });
            const res = addPlayer(r, name, String((data && data.playerKey) || "").slice(0, 64), socket.id);
            if (res.error) return ack({ ok: false, error: res.error });
            room = r;
            me = res.p;
            socket.join(r.code);
            touch();
            ack({ ok: true, code: r.code, pid: me.pid, playerKey: me.key });
            broadcast(r);
            sendMine(r, me);
        }));

        socket.on("player:password", safe((data) => {
            if (!room || !me || !room.players.has(me.pid) || room.phase !== "playing") return;
            const before = [Boolean(me.passedAt), me.failed.length, me.password.length > 0].join();
            me.password = String((data && data.password) || "").slice(0, MAX_PASSWORD);
            evaluate(room, me);
            touch();
            sendMine(room, me);
            // Only tell the whole room when something visible changed.
            if (before !== [Boolean(me.passedAt), me.failed.length, me.password.length > 0].join()) broadcast(room);
        }));

        socket.on("disconnect", safe(() => {
            if (!room) return;
            if (isHost()) room.hostSocketId = null;
            if (me && me.socketId === socket.id) me.connected = false;
            broadcast(room);
        }));
    });
};
