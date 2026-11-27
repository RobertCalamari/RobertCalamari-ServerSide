// English word lists for the word games (see data/WORDS-LICENSE.txt). TOP = the most familiar words, COMMON = TOP plus
// everyday words (counted as "possible" and shown as missed), VALID = COMMON plus less common ones, accepted as answers.
const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, "data", f), "utf8").split(/\s+/).filter(Boolean);
const TOP = new Set(read("words-top.txt"));
const COMMON = [...TOP].concat(read("words-common.txt"));
const VALID = new Set(COMMON.concat(read("words-more.txt")));

const count = (w) => {
    const c = {};
    for (const ch of w) c[ch] = (c[ch] || 0) + 1;
    return c;
};

// can `w` be spelled from the letter counts `c`?
function fits(w, c) {
    const used = {};
    for (const ch of w) {
        used[ch] = (used[ch] || 0) + 1;
        if (used[ch] > (c[ch] || 0)) return false;
    }
    return true;
}

// common words (3+ letters) that can be made from `word`'s letters
function inside(word) {
    const c = count(word);
    return COMMON.filter((w) => w.length >= 3 && w.length <= word.length && fits(w, c));
}

module.exports = { TOP, COMMON, VALID, count, fits, inside };
