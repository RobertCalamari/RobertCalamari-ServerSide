// Password Chaos rules, copied from the original single-screen game (Others/PasswordGame.html).
// They run on the server so every player is judged the same way.
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const planets = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
const colors = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "black", "white"];
const animals = ["cat", "dog", "frog", "bear", "lion", "tiger", "shark", "bird", "goat"];
const foods = ["pizza", "taco", "burger", "sushi", "pasta", "cheese", "sandwich", "hotdog"];
const fruits = ["apple", "banana", "orange", "grape", "mango", "peach"];
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const seasons = ["spring", "summer", "fall", "winter"];

function rule(text, test) {
    return { text, test };
}

function digitSum(password) {
    const nums = password.match(/\d/g);
    if (!nums) return 0;
    return nums.reduce((sum, n) => sum + Number(n), 0);
}

function containsAny(password, list) {
    const lower = password.toLowerCase();
    return list.some(item => lower.includes(item));
}

/* STRUCTURED MODE RULES */

const levelRules = [
    [
        rule("At least 8 characters.", p => p.length >= 8),
        rule("Must contain a number.", p => /\d/.test(p)),
        rule("Must contain uppercase.", p => /[A-Z]/.test(p)),
        rule("Must contain special character.", p => /[^a-zA-Z0-9]/.test(p)),
        rule("Must include pizza.", p => p.toLowerCase().includes("pizza")),
        rule("Numbers must add to 10.", p => digitSum(p) === 10),
        rule("Must include a color.", p => containsAny(p, colors)),
        rule("Must include cat.", p => p.toLowerCase().includes("cat")),
        rule("Must end with !", p => p.endsWith("!")),
        rule("No spaces allowed.", p => !p.includes(" ")),
        rule("Must include two numbers.", p => (p.match(/\d/g) || []).length >= 2),
        rule("Length must be odd.", p => p.length % 2 === 1),
        rule("Must include LOL.", p => p.includes("LOL")),
        rule("Must start with a letter.", p => /^[a-z]/i.test(p)),
        rule("Must include a month.", p => containsAny(p, months)),
        rule("Must include game.", p => p.toLowerCase().includes("game")),
        rule("Must include three ! marks.", p => (p.match(/!/g) || []).length >= 3),
        rule("Must include a planet.", p => containsAny(p, planets)),
        rule("Must include boss backwards.", p => p.toLowerCase().includes("ssob")),
        rule("At least 15 characters.", p => p.length >= 15),
        rule("Must include ?.", p => p.includes("?")),
        rule("Must include number 7.", p => p.includes("7")),
        rule("Must include taco.", p => p.toLowerCase().includes("taco")),
        rule("Must not contain z.", p => !p.toLowerCase().includes("z")),
        rule("Must include $.", p => p.includes("$")),
        rule("At least 3 uppercase letters.", p => (p.match(/[A-Z]/g) || []).length >= 3),
        rule("Must include chaos.", p => p.toLowerCase().includes("chaos")),
        rule("Exactly two periods.", p => (p.match(/\./g) || []).length === 2),
        rule("Must include 404.", p => p.includes("404")),
        rule("Must end with done.", p => p.toLowerCase().endsWith("done"))
    ],

    [
        rule("At least 12 characters.", p => p.length >= 12),
        rule("Numbers must add to 25.", p => digitSum(p) === 25),
        rule("Must include an animal.", p => containsAny(p, animals)),
        rule("Must include a food.", p => containsAny(p, foods)),
        rule("Must not contain e.", p => !p.toLowerCase().includes("e")),
        rule("Must include a planet.", p => containsAny(p, planets)),
        rule("Must include four numbers.", p => (p.match(/\d/g) || []).length >= 4),
        rule("Must include wizard.", p => p.toLowerCase().includes("wizard")),
        rule("Must include @.", p => p.includes("@")),
        rule("Must include a weekday.", p => containsAny(p, days)),
        rule("Length must be even.", p => p.length % 2 === 0),
        rule("Must include haha.", p => p.toLowerCase().includes("haha")),
        rule("Must include Roman numeral.", p => /(I|V|X|L|C|D|M)/.test(p)),
        rule("Must not contain lowercase a.", p => !p.includes("a")),
        rule("Must include 123.", p => p.includes("123")),
        rule("Must include a season.", p => containsAny(p, seasons)),
        rule("Must include tiny.", p => p.toLowerCase().includes("tiny")),
        rule("At least 2 special characters.", p => (p.match(/[^a-zA-Z0-9]/g) || []).length >= 2),
        rule("Must include a fruit.", p => containsAny(p, fruits)),
        rule("Must include nope.", p => p.toLowerCase().includes("nope")),
        rule("Must include number 0.", p => p.includes("0")),
        rule("Must include a double letter.", p => /(.)\1/.test(p)),
        rule("Must include frog.", p => p.toLowerCase().includes("frog")),
        rule("Must include %.", p => p.includes("%")),
        rule("At least 5 uppercase letters.", p => (p.match(/[A-Z]/g) || []).length >= 5),
        rule("Must include blue.", p => p.toLowerCase().includes("blue")),
        rule("Must not end with a number.", p => !/\d$/.test(p)),
        rule("Must include final.", p => p.toLowerCase().includes("final")),
        rule("Must include the year 2026.", p => p.includes("2026")),
        rule("Must end with !!!", p => p.endsWith("!!!"))
    ],

    [
        rule("At least 18 characters.", p => p.length >= 18),
        rule("Numbers must add to 40.", p => digitSum(p) === 40),
        rule("Must include a planet.", p => containsAny(p, planets)),
        rule("Must include a month.", p => containsAny(p, months)),
        rule("Must include a color.", p => containsAny(p, colors)),
        rule("Must include a food.", p => containsAny(p, foods)),
        rule("Must include dragon.", p => p.toLowerCase().includes("dragon")),
        rule("At least 6 numbers.", p => (p.match(/\d/g) || []).length >= 6),
        rule("Must include number 9.", p => p.includes("9")),
        rule("Must include underscore.", p => p.includes("_")),
        rule("Must include two ? marks.", p => (p.match(/\?/g) || []).length >= 2),
        rule("Must not contain s.", p => !p.toLowerCase().includes("s")),
        rule("Must include weekday.", p => containsAny(p, days)),
        rule("Must include cheese.", p => p.toLowerCase().includes("cheese")),
        rule("Exactly one comma.", p => (p.match(/,/g) || []).length === 1),
        rule("Must include a fruit.", p => containsAny(p, fruits)),
        rule("Must include lava.", p => p.toLowerCase().includes("lava")),
        rule("Must start with #.", p => p.startsWith("#")),
        rule("Must include 777.", p => p.includes("777")),
        rule("Must include lowercase q.", p => p.includes("q")),
        rule("Must include capital Z.", p => p.includes("Z")),
        rule("Must include sandwich.", p => p.toLowerCase().includes("sandwich")),
        rule("Three different special characters.", p => new Set((p.match(/[^a-zA-Z0-9]/g) || [])).size >= 3),
        rule("Must include banana.", p => p.toLowerCase().includes("banana")),
        rule("No spaces allowed.", p => !p.includes(" ")),
        rule("Must include plus sign.", p => p.includes("+")),
        rule("Must include victory.", p => p.toLowerCase().includes("victory")),
        rule("At least 30 characters.", p => p.length >= 30),
        rule("Must include password backwards.", p => p.toLowerCase().includes("drowssap")),
        rule("Must end with THEEND.", p => p.endsWith("THEEND"))
    ],

    [
        rule("At least 25 characters.", p => p.length >= 25),
        rule("Numbers must add to 50.", p => digitSum(p) === 50),
        rule("Must include a planet.", p => containsAny(p, planets)),
        rule("Must include a month.", p => containsAny(p, months)),
        rule("Must include a weekday.", p => containsAny(p, days)),
        rule("Must include a color.", p => containsAny(p, colors)),
        rule("Must include a food.", p => containsAny(p, foods)),
        rule("Must include an animal.", p => containsAny(p, animals)),
        rule("Must include a fruit.", p => containsAny(p, fruits)),
        rule("Must include nightmare.", p => p.toLowerCase().includes("nightmare")),
        rule("Exactly three ! marks.", p => (p.match(/!/g) || []).length === 3),
        rule("Exactly two ? marks.", p => (p.match(/\?/g) || []).length === 2),
        rule("Must not contain t.", p => !p.toLowerCase().includes("t")),
        rule("Must include 999.", p => p.includes("999")),
        rule("Must include ABC.", p => p.includes("ABC")),
        rule("Must include xyz.", p => p.includes("xyz")),
        rule("Must start with START.", p => p.startsWith("START")),
        rule("Must include pipe symbol |.", p => p.includes("|")),
        rule("Must include tilde ~.", p => p.includes("~")),
        rule("At least 8 uppercase letters.", p => (p.match(/[A-Z]/g) || []).length >= 8),
        rule("At least 8 numbers.", p => (p.match(/\d/g) || []).length >= 8),
        rule("Must include impossible.", p => p.toLowerCase().includes("impossible")),
        rule("Must include colon.", p => p.includes(":")),
        rule("Must include semicolon.", p => p.includes(";")),
        rule("Must include goblin.", p => p.toLowerCase().includes("goblin")),
        rule("Number 4 exactly three times.", p => (p.match(/4/g) || []).length === 3),
        rule("Must include champion.", p => p.toLowerCase().includes("champion")),
        rule("Must include 000.", p => p.includes("000")),
        rule("Must include the word unlocked.", p => p.toLowerCase().includes("unlocked")),
        rule("Must end with COMPLETE.", p => p.endsWith("COMPLETE"))
    ]
];

/* CHAOS MODE RULES */

const chaosRules = [
    rule("At least 8 characters.", p => p.length >= 8),
    rule("At least 12 characters.", p => p.length >= 12),
    rule("At least 16 characters.", p => p.length >= 16),
    rule("Must contain a number.", p => /\d/.test(p)),
    rule("Must contain uppercase.", p => /[A-Z]/.test(p)),
    rule("Must contain lowercase.", p => /[a-z]/.test(p)),
    rule("Must contain a special character.", p => /[^a-zA-Z0-9]/.test(p)),
    rule("Numbers must add to 15.", p => digitSum(p) === 15),
    rule("Numbers must add to 20.", p => digitSum(p) === 20),
    rule("Numbers must add to 30.", p => digitSum(p) === 30),
    rule("Must include pizza.", p => p.toLowerCase().includes("pizza")),
    rule("Must include taco.", p => p.toLowerCase().includes("taco")),
    rule("Must include banana.", p => p.toLowerCase().includes("banana")),
    rule("Must include dragon.", p => p.toLowerCase().includes("dragon")),
    rule("Must include wizard.", p => p.toLowerCase().includes("wizard")),
    rule("Must include goblin.", p => p.toLowerCase().includes("goblin")),
    rule("Must include a planet.", p => containsAny(p, planets)),
    rule("Must include a color.", p => containsAny(p, colors)),
    rule("Must include a month.", p => containsAny(p, months)),
    rule("Must include a weekday.", p => containsAny(p, days)),
    rule("Must include a season.", p => containsAny(p, seasons)),
    rule("Must include an animal.", p => containsAny(p, animals)),
    rule("Must include a fruit.", p => containsAny(p, fruits)),
    rule("Must include a food.", p => containsAny(p, foods)),
    rule("Must end with !", p => p.endsWith("!")),
    rule("Must end with !!!", p => p.endsWith("!!!")),
    rule("Must end with done.", p => p.toLowerCase().endsWith("done")),
    rule("Must start with START.", p => p.startsWith("START")),
    rule("Must start with #.", p => p.startsWith("#")),
    rule("Must include @.", p => p.includes("@")),
    rule("Must include $.", p => p.includes("$")),
    rule("Must include %.", p => p.includes("%")),
    rule("Must include ?.", p => p.includes("?")),
    rule("Must include two ? marks.", p => (p.match(/\?/g) || []).length >= 2),
    rule("Must include exactly two periods.", p => (p.match(/\./g) || []).length === 2),
    rule("Must include a comma.", p => p.includes(",")),
    rule("Must include underscore.", p => p.includes("_")),
    rule("Must include plus sign.", p => p.includes("+")),
    rule("Must include pipe symbol |.", p => p.includes("|")),
    rule("Must include tilde ~.", p => p.includes("~")),
    rule("No spaces allowed.", p => !p.includes(" ")),
    rule("Length must be odd.", p => p.length % 2 === 1),
    rule("Length must be even.", p => p.length % 2 === 0),
    rule("Must include LOL.", p => p.includes("LOL")),
    rule("Must include haha.", p => p.toLowerCase().includes("haha")),
    rule("Must include 123.", p => p.includes("123")),
    rule("Must include 404.", p => p.includes("404")),
    rule("Must include 777.", p => p.includes("777")),
    rule("Must include 999.", p => p.includes("999")),
    rule("Must include the year 2026.", p => p.includes("2026")),
    rule("Must include boss backwards.", p => p.toLowerCase().includes("ssob")),
    rule("Must include password backwards.", p => p.toLowerCase().includes("drowssap")),
    rule("Must include a double letter.", p => /(.)\1/.test(p)),
    rule("At least 3 uppercase letters.", p => (p.match(/[A-Z]/g) || []).length >= 3),
    rule("At least 5 uppercase letters.", p => (p.match(/[A-Z]/g) || []).length >= 5),
    rule("At least 4 numbers.", p => (p.match(/\d/g) || []).length >= 4),
    rule("At least 6 numbers.", p => (p.match(/\d/g) || []).length >= 6),
    rule("Must not contain z.", p => !p.toLowerCase().includes("z")),
    rule("Must not contain e.", p => !p.toLowerCase().includes("e")),
    rule("Must not end with a number.", p => !/\d$/.test(p)),
    rule("Must include final.", p => p.toLowerCase().includes("final")),
    rule("Must include chaos.", p => p.toLowerCase().includes("chaos")),
    rule("Must include victory.", p => p.toLowerCase().includes("victory")),
    rule("Must include unlocked.", p => p.toLowerCase().includes("unlocked"))
];

module.exports = { levelRules, chaosRules };
