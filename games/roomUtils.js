// Shared helpers for the newer room-based games (Category Clash, Password Chaos).
// These games use their own socket.io namespaces and socket.io rooms, so they never
// touch the global player/room lists the older games in index.js use.
const crypto = require("crypto");

// No look-alike letters (I/O/0/1) so codes are easy to read off a TV.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function makeCode(taken) {
    for (let tries = 0; tries < 1000; tries++) {
        let code = "";
        for (let i = 0; i < 4; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
        if (!taken.has(code)) return code;
    }
    throw new Error("Could not allocate a room code");
}

function makeKey() {
    return crypto.randomBytes(16).toString("hex");
}

function cleanName(name, max = 20) {
    return String(name || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanCode(code) {
    return String(code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Rooms are deleted after this long with no activity at all.
const IDLE_MS = 3 * 60 * 60 * 1000;

function startSweeper(rooms, onDelete) {
    const t = setInterval(() => {
        const now = Date.now();
        for (const [code, room] of rooms) {
            if (now - room.touched > IDLE_MS) {
                rooms.delete(code);
                if (onDelete) onDelete(code);
            }
        }
    }, 10 * 60 * 1000);
    t.unref();
}

// Wrap a socket handler so a bad payload can never crash the server.
function safe(fn) {
    return (...args) => {
        try {
            fn(...args);
        } catch (e) {
            console.log("[game handler error]", e);
        }
    };
}

module.exports = { makeCode, makeKey, cleanName, cleanCode, shuffle, startSweeper, safe };
