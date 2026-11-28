// Drink or Drown deck, transcribed from the printed cards (CardGame folder). [text, who, value, copies?, extra?]
// who: "you" (no target) | "anyone" (you pick n people) | "everyone". value = number points to play = points scored.
// extra.fx: a card that moves cards around (handled by the game); extra.n: people to pick; extra.share: the target
// scores it too; extra.pot: it goes in the middle until someone claims it.
const ACTION = [
    ["Pick someone to freestyle for 30 seconds", "anyone", 3],
    ["Give out 1 sip", "anyone", 1, 2],
    ["Choose 2 people to swap seats", "anyone", 3, 1, { n: 2 }],
    ["Pick someone to do 20 pushups", "anyone", 3],
    ["Pick someone to do a cartwheel", "anyone", 3],
    ["Pick someone to show their most recent deleted photo", "anyone", 3],
    ["Start a waterfall. If anyone stops early, get double points", "everyone", 2],
    ["Give out 2 sips", "anyone", 1, 2],
    ["Discard a play card from hand, then draw 3 cards", "you", 1, 1, { fx: "swap3" }],
    ["Ask someone truth or dare", "anyone", 3],
    ["Drink twice and draw two times", "you", 2, 1, { fx: "draw2" }],
    ["Lefties drink", "everyone", 1],
    ["Righties drink", "everyone", 1],
    ["Shuffle the discard pile back into the deck", "you", 1, 2, { fx: "reshuffle" }],
    ["Discard your hand, then draw and drink the amount discarded", "you", 1, 2, { fx: "newhand" }],
    ["The oldest player drinks twice", "everyone", 1],
    ["The youngest player drinks twice", "everyone", 1],
    ["The last person to stand up drinks 3 times", "everyone", 3],
    ["Pick someone to not use their hands for 5 minutes", "anyone", 5],
    ["For the rest of the game, if anyone says someone's name, drink and give them a card from your hand", "everyone", 8],
    ["Everybody drink!", "everyone", 1, 3],
    ["Pick a category, then go around the room saying words related to it. First to repeat or mess up drinks 3 times", "everyone", 2],
    ["First person to pet a dog or cat gives out 3 sips. If there is no dog or cat, you take them instead", "everyone", 2],
    ["Take a card from someone's hand", "you", 1, 3, { fx: "steal" }],
    ["Pick someone to take a selfie and post it right now", "anyone", 4],
    ["Pick someone to take off their shirt or pants. They choose", "anyone", 8],
    ["Pick someone to do 20 squats", "anyone", 3],
    ["Drink twice and draw two times", "you", 2, 2, { fx: "draw2" }],
    ["Shuffle the discard pile back into the deck", "you", 1, 1, { fx: "reshuffle" }],
    ["All girls drink", "everyone", 2],
    ["All guys drink", "everyone", 2],
    ["Pick someone and everyone ask them a question. They drink for each answer they don't give", "anyone", 3],
    ["Pick someone to chug their drink", "anyone", 8],
    ["Whoever has the closest birthday, finish your drink", "everyone", 4],
    ["Take someone's point card, then discard this card", "anyone", 5, 1, { fx: "takepoint" }],
    ["Pick someone to not use their phone for 20 minutes", "anyone", 5],
    ["Get everyone and take a group photo. Post and tag it with #DrinkOrDrownGame", "everyone", 2],
    ["Nobody can look at their phone anymore. The next player who does drinks 4 times", "everyone", 3],
    ["Give out as many sips as there are pairs of shoes in the room", "anyone", 3],
    ["Pick two people. They must drink whenever the other person does", "anyone", 6, 1, { n: 2 }],
    ["Pick someone to do a shoey", "anyone", 8],
    ["Pick someone to do their best griddy", "anyone", 2],
    ["Pick someone to count to 100. They can't say anything else until they are done", "anyone", 4],
    ["Pick someone to be blindfolded for 5 minutes", "anyone", 5],
    ["Open a new drink and finish it. Then take a point card from everyone. They choose", "you", 6, 1, { fx: "taxall" }],
    ["Grab any card from the discard pile and put it in your hand", "you", 3, 2, { fx: "dig" }],
    ["Pick someone and insult them. Then share this card with them", "anyone", 5, 1, { share: true }],
    ["Pick someone to take a shot. Double points if you take one with them", "anyone", 6],
    ["Pick a player to drink for as many empty drinks there are on the table", "anyone", 3],
    ["Pick someone to stand for the next 5 minutes", "anyone", 5],
    ["Create a rule", "you", 4],
    ["Say who the hottest person in the room is. Then share this card with them", "anyone", 3, 1, { share: true }],
    ["Pick someone to say the alphabet backwards their first try. If they fail they drink 3 times", "anyone", 3],
    ["Pick someone and they can only communicate while adding animal noises when they talk", "anyone", 5],
    ["Make 2 people change shirts", "anyone", 5, 1, { n: 2 }],
    ["Pick 2 people to swap drinks", "anyone", 5, 1, { n: 2 }],
    ["Pick a word, then go around the room rhyming with that word. The first to repeat or mess up drinks 3 times", "everyone", 5],
    ["Pick someone to do stand up. They have 30 seconds to make someone laugh, otherwise they finish their drink", "anyone", 5],
    ["Make a bitch cup. When someone gets points, they pour some of their drink in. Whoever tops it off drinks it and receives this card", "everyone", 5, 1, { pot: true }],
];

const CHALLENGE = [
    ["Water Bottle Flip: Pick someone to see who can flip a water bottle upright first", "anyone", 5],
    ["Flip Cup: Everyone plays flip cup. The last to flip is out. Continue until 1 person wins it all", "everyone", 3],
    ["Cup Stacker: Pick someone to see who can stack 10 cups faster", "anyone", 3],
    ["Chug Off: Pick someone to see who can chug their drink first", "anyone", 5],
    ["Wordle: Play today's Wordle. Least amount of guesses wins. Maybe set a timer", "everyone", 2],
    ["Rock, Paper, Scissors: See who can win a best out of 3", "anyone", 2],
    ["Plank: Pick someone to see who can hold a plank the longest", "anyone", 4],
    ["Quarters: Pick someone to see who can bounce a quarter in a shotglass first", "anyone", 2],
    ["Detective: Pick someone to race. Have someone choose an object, and the first player to bring it here wins", "anyone", 4],
    ["Arm Wrestle: Pick someone to arm wrestle", "anyone", 2],
    ["Memory Words: Say a word, the next person repeats what has been said and adds on. Continue until someone wins", "everyone", 3],
    ["Staring Contest: Pick someone to see who can not blink longer", "anyone", 2],
    ["Shotgun: Pick someone to see who can shotgun a drink faster", "anyone", 5],
    ["High Low: See who can get more cards correct without messing up", "anyone", 3],
    ["Push Ups: Pick someone to see who can do more pushups", "anyone", 3],
    ["Paper Airplanes: See who can make a paper airplane and have it fly the farthest", "everyone", 2],
    ["Card Memory: Pick someone to see who can find more matches from a deck of cards spread out on the table", "anyone", 5],
    ["Drawing Competition: You choose what to draw. Everyone then draws it. After 1 min, everyone votes on the winner", "everyone", 2],
];

// [text, cost, effect, copies]
const COUNTER = [
    ["Divert to yourself, then keep the card if completed", 1, "self", 2],
    ["If someone was targeted with an action card, play an action card along with it, with the same target", 2, "along", 2],
    ["If someone was targeted with an action card, divert back to the person who played it", 1, "back", 2],
    ["This does not cancel the played card, but the person who played it gets their next turn skipped", 0, "skip", 2],
    ["If someone was targeted with an action card, divert to any player beside who played it", 0, "beside", 2],
    ["Cancel the card that was just played, and discard it", 2, "cancel", 2],
    ["The action card just played triggers twice", 1, "twice", 1],
    ["Cancel the card that was just played, and return it to the owner's hand", 0, "return", 2],
    ["Cancel the card that was just played, and put it in your hand", 1, "steal", 2],
    ["If someone was targeted with an action card, divert to an adjacent player", 0, "adjacent", 2],
    ["If someone was targeted with an action card, everyone now does what it says", 0, "everyone", 2],
];

const WAIT = [
    ["Until someone talks about their pet", 2], ["Until someone says \"I'm tired\"", 4], ["Until someone says any Gen Z slang", 3],
    ["Until someone says your name", 4], ["Until someone asks for the time", 3], ["Until someone pops a Zyn", 2],
    ["Until someone says a curse word", 2], ["Until someone opens a new drink", 2], ["Until someone starts complaining", 2],
    ["Until someone yawns", 2], ["Until someone goes to the bathroom", 1], ["Until someone sneezes", 2],
    ["Until someone is bored of this game", 5], ["Until someone starts dancing", 4], ["Until someone brings up politics", 3],
    ["Until a couple does PDA", 2], ["Until someone says \"sorry\"", 2], ["Until someone sits down", 2],
    ["Until someone spills a drink", 5], ["Until someone talks about their job", 3], ["Until someone takes a picture", 3],
    ["Until someone asks whose turn it is", 3], ["Until someone touches their face", 2], ["Until someone says \"that's funny\"", 4],
    ["Until the clock reads xx:17", 3], ["Until someone gives a thumbs up", 3], ["Until someone starts clapping", 3],
    ["Until someone eats something", 2], ["Until someone quotes anything", 4], ["Until someone coughs", 2],
    ["Until someone stands up", 2], ["Until someone laughs", 2], ["Until someone starts singing or humming", 2],
    ["Until someone uses their phone", 1], ["Until someone asks a question", 1], ["Until someone plays a wait card", 2],
    ["Until someone picks something up off the floor", 2], ["Until someone yells at someone else", 2],
];

// number cards as printed: value -> copies; 0 = "Any number, but drink that amount (up to 6)"
const NUMBER = [[1, 10], [2, 12], [3, 10], [4, 4], [5, 1], [0, 5]];

function build() {
    const all = [];
    const add = (c, copies = 1) => {
        for (let i = 0; i < copies; i++) all.push({ ...c, id: all.length });
    };
    ACTION.forEach(([text, who, v, copies, x]) => add({ t: "action", text, who, v, ...(x || {}) }, copies));
    CHALLENGE.forEach(([text, who, v]) => add({ t: "challenge", text, who, v }));
    COUNTER.forEach(([text, v, k, copies]) => add({ t: "counter", text, v, k }, copies));
    WAIT.forEach(([text, v]) => add({ t: "wait", text, v }));
    NUMBER.forEach(([v, copies]) => add(v ? { t: "number", v } : { t: "number", v: 0, wild: true, text: "Any number, but drink that amount (up to 6)" }, copies));
    return all;
}

module.exports = { CARDS: build() };
