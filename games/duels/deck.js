// Standard 52-card deck for the card games. A card is a 2-char string: rank (23456789TJQKA) + suit (SHDC), e.g. "TH".
const SUITS = ["S", "H", "D", "C"];
const RANKS = "23456789TJQKA";
const rank = (c) => RANKS.indexOf(c[0]) + 2; // 2..14 (ace high)
const suit = (c) => c[1];
const label = (c) => (c[0] === "T" ? "10" : c[0]) + { S: "♠", H: "♥", D: "♦", C: "♣" }[c[1]];
const isCard = (c) => typeof c === "string" && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);

function shuffle(rng, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const fresh = () => SUITS.flatMap((s) => RANKS.split("").map((r) => r + s));
const deck = (rng) => shuffle(rng, fresh());

// sort by suit (in `order`) then rank
function sortHand(cards, order = "SHCD") {
    return cards.slice().sort((a, b) => order.indexOf(suit(a)) - order.indexOf(suit(b)) || rank(a) - rank(b));
}

// remove `cards` from `hand` in place; false (and untouched) if any is missing or repeated
function take(hand, cards) {
    if (!Array.isArray(cards) || !cards.length || new Set(cards).size !== cards.length || !cards.every((c) => hand.includes(c))) return false;
    cards.forEach((c) => hand.splice(hand.indexOf(c), 1));
    return true;
}

// pace multiplier for display pauses (tests run faster with CARDS_PACE=0.1); turn timers are never scaled
const PACE = Math.max(0.05, Math.min(1, Number(process.env.CARDS_PACE) || 1));
const pause = (ms) => Math.round(ms * PACE);

module.exports = { SUITS, RANKS, rank, suit, label, isCard, shuffle, fresh, deck, sortHand, take, pause };
