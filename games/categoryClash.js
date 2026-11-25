// Category Clash online rooms.
//
// The game itself still runs on the host's screen (the TV). This module only:
//   - creates a room code for the host,
//   - lets players join from their phones and pick a team (or be shuffled by the host),
//   - relays the host's rendered screen to every phone so players can follow along.
// Namespace: /categoryclash
const { makeCode, makeKey, cleanName, cleanCode, shuffle, startSweeper, safe } = require("./roomUtils");

const MAX_PLAYERS = 40;
const MAX_TEAMS = 4;
const MAX_MIRROR_CHARS = 2_500_000; // board HTML + an occasional picture

const rooms = new Map(); // code -> room

function newRoom(code, hostSocketId) {
    return {
        code,
        hostKey: makeKey(),
        hostSocketId,
        teams: [], // [{ name, color }]
        players: new Map(), // pid -> { pid, key, name, team, socketId, connected }
        mirror: null, // last screen the host sent: { html, meta }
        panel: null, // { team, panel }: private controls for the team whose turn it is
        nextPid: 1,
        touched: Date.now(),
    };
}

function rosterOf(room) {
    return {
        teams: room.teams,
        hostConnected: Boolean(room.hostSocketId),
        players: [...room.players.values()].map((p) => ({ pid: p.pid, name: p.name, team: p.team, connected: p.connected })),
    };
}

function cleanTeams(raw) {
    if (!Array.isArray(raw)) return null;
    const teams = raw.slice(0, MAX_TEAMS).map((t, i) => ({
        name: cleanName(t && t.name, 24) || `Team ${i + 1}`,
        color: /^#[0-9a-fA-F]{3,8}$/.test(String(t && t.color)) ? t.color : "#888888",
    }));
    return teams.length >= 1 ? teams : null;
}

module.exports = function attachCategoryClash(io) {
    const nsp = io.of("/categoryclash");
    // Only players on the team that's up get its panel (e.g. their Letter Grab letters); everyone else gets null.
    const sendPanels = (room) => {
        const pn = room.panel;
        for (const p of room.players.values()) {
            if (!p.socketId) continue;
            const mine = pn && p.team != null && p.team === pn.team;
            nsp.to(p.socketId).emit("panel", { team: pn ? pn.team : null, panel: mine ? pn.panel : null });
        }
    };
    const broadcastRoster = (room) => {
        nsp.to(room.code).emit("roster", rosterOf(room));
        sendPanels(room); // team changes can change who sees the panel
    };

    startSweeper(rooms);

    nsp.on("connection", (socket) => {
        let role = null; // "host" | "player"
        let room = null;
        let me = null; // player record when role === "player"

        const touch = () => {
            if (room) room.touched = Date.now();
        };
        const isHost = () => role === "host" && room && room.hostSocketId === socket.id;

        // ---------- host ----------
        socket.on("host:create", safe((_data, ack) => {
            if (typeof ack !== "function") return;
            const code = makeCode(new Set(rooms.keys()));
            room = newRoom(code, socket.id);
            rooms.set(code, room);
            role = "host";
            socket.join(code);
            console.log("[CATEGORY CLASH] room created " + code);
            ack({ ok: true, code, hostKey: room.hostKey, roster: rosterOf(room) });
        }));

        // After a refresh the host page reconnects to its room with the saved key.
        socket.on("host:resume", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r || r.hostKey !== String(data && data.hostKey)) return ack({ ok: false });
            room = r;
            role = "host";
            room.hostSocketId = socket.id;
            socket.join(room.code);
            touch();
            ack({ ok: true, code: room.code, roster: rosterOf(room) });
            broadcastRoster(room);
        }));

        socket.on("host:teams", safe((data) => {
            if (!isHost()) return;
            const teams = cleanTeams(data && data.teams);
            if (!teams) return;
            const changed = JSON.stringify(teams) !== JSON.stringify(room.teams);
            if (!changed) return;
            room.teams = teams;
            for (const p of room.players.values()) if (p.team != null && p.team >= teams.length) p.team = null;
            touch();
            broadcastRoster(room);
        }));

        // Spread every player evenly across the teams in a random order.
        socket.on("host:randomize", safe(() => {
            if (!isHost() || !room.teams.length) return;
            const n = room.teams.length;
            const offset = Math.floor(Math.random() * n);
            shuffle([...room.players.values()]).forEach((p, i) => {
                p.team = (i + offset) % n;
            });
            touch();
            broadcastRoster(room);
        }));

        socket.on("host:move", safe((data) => {
            if (!isHost()) return;
            const p = room.players.get(Number(data && data.pid));
            if (!p) return;
            const t = data.team;
            p.team = t === null ? null : Number.isInteger(t) && t >= 0 && t < room.teams.length ? t : p.team;
            touch();
            broadcastRoster(room);
        }));

        socket.on("host:kick", safe((data) => {
            if (!isHost()) return;
            const p = room.players.get(Number(data && data.pid));
            if (!p) return;
            room.players.delete(p.pid);
            if (p.socketId) nsp.to(p.socketId).emit("kicked");
            touch();
            broadcastRoster(room);
        }));

        socket.on("host:mirror", safe((data) => {
            if (!isHost()) return;
            const html = String((data && data.html) || "");
            if (html.length > MAX_MIRROR_CHARS) return;
            const meta = data && typeof data.meta === "object" && data.meta ? data.meta : {};
            room.mirror = {
                html,
                meta: {
                    phase: String(meta.phase || ""),
                    turnTeam: Number.isInteger(meta.turnTeam) ? meta.turnTeam : null,
                    scores: Array.isArray(meta.scores) ? meta.scores.slice(0, MAX_TEAMS).map((n) => Number(n) || 0) : [],
                    privateTeam: Number.isInteger(meta.privateTeam) ? meta.privateTeam : null,
                    activeTeam: Number.isInteger(meta.activeTeam) ? meta.activeTeam : null,
                    acts: Array.isArray(meta.acts) ? meta.acts.filter((a) => ["open", "wk", "wpL", "oddPick"].includes(a)) : [],
                },
            };
            touch();
            socket.to(room.code).emit("mirror", room.mirror);
        }));

        socket.on("host:panel", safe((data) => {
            if (!isHost()) return;
            const team = data && Number.isInteger(data.team) ? data.team : null;
            const panel = data && data.panel && typeof data.panel === "object" ? data.panel : null;
            const json = JSON.stringify(panel || null);
            if (json.length > 20000) return;
            room.panel = team === null || !panel ? null : { team, panel };
            touch();
            sendPanels(room);
        }));

        // ---------- player ----------
        // A phone on the team that's up does something (answers, picks a square, types letters).
        // The host's page decides whether it's allowed and replies.
        socket.on("player:action", safe((data, ack) => {
            const reply = typeof ack === "function" ? ack : () => { };
            if (role !== "player" || !room || !me || !room.players.has(me.pid)) return reply({ ok: false });
            if (me.team == null) return reply({ ok: false, error: "Join a team first." });
            if (!room.hostSocketId) return reply({ ok: false, error: "The host's screen is reconnecting." });
            const act = String((data && data.act) || "").slice(0, 20);
            const payload = data && typeof data.data === "object" && data.data ? data.data : {};
            if (JSON.stringify(payload).length > 2000) return reply({ ok: false });
            touch();
            nsp.to(room.hostSocketId).timeout(5000).emit("action", { pid: me.pid, name: me.name, team: me.team, act, data: payload }, (err, res) => {
                reply(err || !res || !res[0] ? { ok: false, error: "The host's screen didn't answer. Try again." } : res[0]);
            });
        }));
        socket.on("player:join", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r) return ack({ ok: false, error: "That room code doesn't exist. Check the code on the TV." });
            const name = cleanName(data && data.name);
            if (!name) return ack({ ok: false, error: "Enter your name." });
            const key = String((data && data.playerKey) || "").slice(0, 64);

            let p = key ? [...r.players.values()].find((x) => x.key === key) : null;
            if (!p) {
                const clash = [...r.players.values()].find((x) => x.name.toLowerCase() === name.toLowerCase());
                if (clash && clash.connected) return ack({ ok: false, error: "Someone in this room already has that name." });
                if (clash) p = clash; // same name, reconnecting from a new device
            }
            if (!p) {
                if (r.players.size >= MAX_PLAYERS) return ack({ ok: false, error: "This room is full." });
                p = { pid: r.nextPid++, key: key || makeKey(), name, team: null, socketId: null, connected: false };
                r.players.set(p.pid, p);
            }
            p.name = name;
            p.socketId = socket.id;
            p.connected = true;

            room = r;
            role = "player";
            me = p;
            socket.join(r.code);
            touch();
            ack({ ok: true, code: r.code, pid: p.pid, playerKey: p.key, roster: rosterOf(r), mirror: r.mirror });
            broadcastRoster(r);
        }));

        // A TV/big screen that just shows the game (no name, not on a team).
        socket.on("viewer:join", safe((data, ack) => {
            if (typeof ack !== "function") return;
            const r = rooms.get(cleanCode(data && data.code));
            if (!r) return ack({ ok: false, error: "That room code doesn't exist. Check the code on the host's screen." });
            room = r;
            role = "viewer";
            socket.join(r.code);
            touch();
            ack({ ok: true, code: r.code, roster: rosterOf(r), mirror: r.mirror });
        }));

        socket.on("player:team", safe((data) => {
            if (role !== "player" || !room || !me || !room.players.has(me.pid)) return;
            const t = data && data.team;
            if (t === null) me.team = null;
            else if (Number.isInteger(t) && t >= 0 && t < room.teams.length) me.team = t;
            else return;
            touch();
            broadcastRoster(room);
        }));

        socket.on("disconnect", safe(() => {
            if (!room) return;
            if (isHost()) {
                room.hostSocketId = null;
                broadcastRoster(room);
            } else if (me && me.socketId === socket.id) {
                me.connected = false;
                broadcastRoster(room);
            }
        }));
    });
};
