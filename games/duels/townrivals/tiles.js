// Town Rivals tiles. Every tile is data:
//   tags    what it counts as for other tiles (home, nature, water, industry, shop, food, farm, fun, civic, law, crime, transport)
//   pts     points it scores where it stands, income: coins every round
//   adj     bonuses from the 4 neighbours: { tag?, who: "any" | "mine" | "rival", pts?, coins? } per matching neighbour
//   global  the same, but counted across the whole town (never itself)
//   give    what it does TO each neighbour with that tag: { tag, who, pts } (the neighbour's owner gets the points)
//   steal   coins taken each round from every rival with a tile next to it, unless law is next to it
//   special "interest" (+1 coin per 5 held) or [lo, hi] random coins each round
// w (how often it shows up in the market) comes from the cost: cheap tiles are common, big ones rare.
const T = {
    // ---- homes ----
    house: { icon: "🏠", name: "House", cost: 2, tags: ["home"], pts: 1, text: "1 point. Parks and nice things next to it make it worth more." },
    cottage: { icon: "🛖", name: "Cottage", cost: 1, tags: ["home"], pts: 1, text: "1 point. Cheap and cosy." },
    apartment: { icon: "🏢", name: "Apartments", cost: 4, tags: ["home"], pts: 2, adj: [{ tag: "transport", who: "any", pts: 1 }], text: "2 points, +1 for each transport tile next to it." },
    mansion: { icon: "🏰", name: "Mansion", cost: 6, tags: ["home"], pts: 4, adj: [{ tag: "industry", who: "any", pts: -2 }], text: "4 points, but −2 for each industry tile next to it." },
    trailer: { icon: "🚐", name: "Trailer Park", cost: 1, tags: ["home"], pts: 0, adj: [{ tag: "home", who: "any", pts: 1 }], text: "+1 point for each home next to it (anyone's)." },
    skyscraper: { icon: "🏙️", name: "Skyscraper", cost: 8, tags: ["home", "shop"], pts: 5, give: [{ tag: "home", who: "rival", pts: -1 }], text: "5 points. Casts a shadow: rival homes next to it lose 1." },
    haunted: { icon: "👻", name: "Haunted House", cost: 2, tags: ["home", "fun"], pts: 2, give: [{ tag: "home", who: "any", pts: -1 }], text: "2 points, but every home next to it loses 1 (spooky)." },
    cabin: { icon: "🪵", name: "Cabin", cost: 2, tags: ["home", "nature"], pts: 1, adj: [{ tag: "nature", who: "any", pts: 1 }], text: "1 point, +1 for each nature tile next to it." },
    hotel: { icon: "🏨", name: "Hotel", cost: 5, tags: ["home", "fun"], pts: 2, adj: [{ tag: "fun", who: "any", coins: 1 }], text: "2 points. +1 coin a round for each fun tile next to it." },
    // ---- nature + water ----
    park: { icon: "🌳", name: "Park", cost: 2, tags: ["nature"], give: [{ tag: "home", who: "any", pts: 1 }], text: "Every home next to it scores +1, even your rivals'." },
    garden: { icon: "🌷", name: "Garden", cost: 1, tags: ["nature"], give: [{ tag: "home", who: "mine", pts: 1 }], text: "Your homes next to it score +1 (only yours)." },
    forest: { icon: "🌲", name: "Forest", cost: 2, tags: ["nature"], pts: 1, income: 1, text: "1 point and +1 coin a round (lumber)." },
    lake: { icon: "🏞️", name: "Lake", cost: 3, tags: ["nature", "water"], give: [{ tag: "home", who: "any", pts: 1 }, { tag: "fun", who: "any", pts: 1 }], text: "Homes and fun tiles next to it score +1 (anyone's)." },
    beach: { icon: "🏖️", name: "Beach", cost: 4, tags: ["water", "fun"], pts: 2, adj: [{ tag: "fun", who: "any", pts: 1 }], text: "2 points, +1 for each fun tile next to it." },
    zoo: { icon: "🦁", name: "Zoo", cost: 5, tags: ["fun", "nature"], pts: 3, give: [{ tag: "home", who: "any", pts: 1 }], text: "3 points, and homes next to it score +1." },
    statue: { icon: "🗽", name: "Statue", cost: 3, tags: ["civic"], pts: 2, adj: [{ tag: "nature", who: "any", pts: 1 }], text: "2 points, +1 for each nature tile next to it." },
    bridge: { icon: "🌉", name: "Bridge", cost: 2, tags: ["transport", "water"], pts: 1, adj: [{ tag: "water", who: "any", pts: 1 }], text: "1 point, +1 for each water tile next to it. Links districts." },
    lighthouse: { icon: "🗼", name: "Lighthouse", cost: 3, tags: ["water", "civic"], pts: 1, global: [{ tag: "water", who: "mine", coins: 1 }], text: "1 point. +1 coin a round for every water tile you own." },
    dock: { icon: "⚓", name: "Dock", cost: 3, tags: ["water", "transport", "industry"], income: 1, adj: [{ tag: "water", who: "any", coins: 1 }], text: "+1 coin a round, +1 more for each water tile next to it." },
    // ---- farms + food ----
    farm: { icon: "🌾", name: "Farm", cost: 3, tags: ["farm"], income: 2, text: "+2 coins every round." },
    orchard: { icon: "🍎", name: "Orchard", cost: 3, tags: ["farm", "nature"], income: 2, text: "+2 coins a round. Counts as nature." },
    ranch: { icon: "🐄", name: "Ranch", cost: 3, tags: ["farm"], income: 1, adj: [{ tag: "farm", who: "any", coins: 1 }], text: "+1 coin a round, +1 more for each farm next to it." },
    greenhouse: { icon: "🌱", name: "Greenhouse", cost: 2, tags: ["farm", "nature"], pts: 1, income: 1, text: "1 point and +1 coin a round." },
    vineyard: { icon: "🍇", name: "Vineyard", cost: 3, tags: ["farm", "food"], income: 1, adj: [{ tag: "fun", who: "any", pts: 1 }], text: "+1 coin a round, +1 point for each fun tile next to it (wine tours)." },
    bakery: { icon: "🥐", name: "Bakery", cost: 2, tags: ["shop", "food"], adj: [{ tag: "home", who: "any", coins: 1 }], text: "+1 coin a round for each home next to it." },
    cafe: { icon: "☕", name: "Café", cost: 2, tags: ["shop", "food"], adj: [{ tag: "shop", who: "any", coins: 1 }], text: "+1 coin a round for each shop next to it." },
    foodtruck: { icon: "🚚", name: "Food Truck", cost: 2, tags: ["food", "shop", "transport"], adj: [{ tag: "fun", who: "any", coins: 1 }], text: "+1 coin a round for each fun tile next to it." },
    market: { icon: "🧺", name: "Market", cost: 3, tags: ["shop", "food"], adj: [{ tag: "farm", who: "any", coins: 1 }], text: "+1 coin a round for each farm next to it." },
    brewery: { icon: "🛢️", name: "Brewery", cost: 4, tags: ["industry", "food"], income: 2, adj: [{ tag: "fun", who: "any", coins: 1 }], text: "+2 coins a round, +1 more for each fun tile next to it." },
    // ---- industry ----
    factory: { icon: "🏭", name: "Factory", cost: 4, tags: ["industry"], income: 3, give: [{ tag: "home", who: "rival", pts: -1 }], text: "+3 coins a round. Rival homes next to it lose 1 point." },
    mine: { icon: "⛏️", name: "Mine", cost: 4, tags: ["industry"], income: 4, give: [{ tag: "home", who: "any", pts: -1 }], text: "+4 coins a round, but every home next to it loses 1." },
    power: { icon: "⚡", name: "Power Plant", cost: 5, tags: ["industry"], income: 1, global: [{ tag: "industry", who: "mine", coins: 1 }], text: "+1 coin a round, +1 more for every other industry tile you own." },
    windmill: { icon: "🌬️", name: "Windmill", cost: 3, tags: ["industry", "nature"], income: 2, text: "+2 coins a round. Clean: no pollution." },
    recycling: { icon: "♻️", name: "Recycling", cost: 3, tags: ["industry", "civic"], pts: 1, adj: [{ tag: "industry", who: "any", pts: 1 }], text: "1 point, +1 for each industry tile next to it." },
    lab: { icon: "🧪", name: "Laboratory", cost: 5, tags: ["industry", "civic"], pts: 1, income: 2, adj: [{ tag: "civic", who: "any", pts: 1 }], text: "1 point and +2 coins a round. +1 point per civic tile next to it." },
    // ---- shops ----
    shop: { icon: "🏪", name: "Shop", cost: 3, tags: ["shop"], adj: [{ tag: "home", who: "any", coins: 1 }], text: "+1 coin a round for each home next to it (anyone's)." },
    mall: { icon: "🛍️", name: "Mall", cost: 6, tags: ["shop"], pts: 1, adj: [{ tag: "home", who: "any", coins: 2 }], text: "1 point. +2 coins a round for each home next to it." },
    bank: { icon: "🏦", name: "Bank", cost: 5, tags: ["civic", "shop"], pts: 1, special: "interest", text: "1 point. Interest: +1 coin a round for every 5 coins you have." },
    lotto: { icon: "🎟️", name: "Lotto Booth", cost: 1, tags: ["shop"], special: [0, 3], text: "0 to 3 coins a round, totally random." },
    pawn: { icon: "💍", name: "Pawn Shop", cost: 2, tags: ["shop", "crime"], adj: [{ tag: "crime", who: "any", coins: 2 }], text: "+2 coins a round for each crime tile next to it. Counts as crime." },
    gas: { icon: "⛽", name: "Gas Station", cost: 2, tags: ["transport", "shop"], income: 1, adj: [{ tag: "transport", who: "any", coins: 1 }], text: "+1 coin a round, +1 more for each transport tile next to it." },
    // ---- fun ----
    tavern: { icon: "🍺", name: "Tavern", cost: 3, tags: ["fun", "food"], adj: [{ who: "rival", pts: 1 }], text: "+1 point for each rival tile next to it." },
    stadium: { icon: "🏟️", name: "Stadium", cost: 6, tags: ["fun"], pts: 3, adj: [{ tag: "home", who: "any", pts: 1 }], text: "3 points, +1 for each home next to it (fans)." },
    theater: { icon: "🎭", name: "Theater", cost: 4, tags: ["fun"], pts: 2, adj: [{ tag: "shop", who: "any", pts: 1 }], text: "2 points, +1 for each shop next to it." },
    arcade: { icon: "🕹️", name: "Arcade", cost: 3, tags: ["fun"], pts: 1, adj: [{ tag: "home", who: "rival", coins: 1 }], text: "1 point. +1 coin a round for each rival home next to it (their kids come over)." },
    casino: { icon: "🎰", name: "Casino", cost: 4, tags: ["fun", "crime"], special: [0, 6], text: "0 to 6 random coins a round. Counts as crime." },
    club: { icon: "🪩", name: "Nightclub", cost: 4, tags: ["fun"], pts: 1, adj: [{ who: "rival", pts: 1 }], give: [{ tag: "home", who: "any", pts: -1 }], text: "1 point, +1 per rival tile next to it. Homes next to it lose 1 (noise)." },
    spa: { icon: "🧖", name: "Spa", cost: 4, tags: ["fun", "water"], pts: 3, adj: [{ tag: "industry", who: "any", pts: -1 }], text: "3 points, −1 for each industry tile next to it." },
    rink: { icon: "⛸️", name: "Ice Rink", cost: 3, tags: ["fun"], pts: 2, text: "2 points. Simple fun." },
    // ---- civic + law ----
    police: { icon: "🚓", name: "Police", cost: 2, tags: ["law", "civic"], pts: 1, text: "1 point. Crime next to it can't steal." },
    fire: { icon: "🚒", name: "Fire Station", cost: 3, tags: ["law", "civic"], pts: 1, give: [{ tag: "home", who: "any", pts: 1 }], text: "1 point. Homes next to it feel safe: +1. Stops crime next to it." },
    jail: { icon: "⛓️", name: "Jail", cost: 4, tags: ["law", "civic"], pts: 1, global: [{ tag: "crime", who: "any", pts: 1 }], text: "1 point, +1 for every crime tile in town (anyone's). Stops crime next to it." },
    school: { icon: "🏫", name: "School", cost: 4, tags: ["civic"], pts: 2, adj: [{ tag: "home", who: "any", pts: 1 }], text: "2 points, +1 for each home next to it." },
    hospital: { icon: "🏥", name: "Hospital", cost: 5, tags: ["civic"], pts: 2, give: [{ tag: "home", who: "any", pts: 1 }], text: "2 points, and homes next to it score +1." },
    library: { icon: "📚", name: "Library", cost: 3, tags: ["civic"], pts: 1, adj: [{ tag: "civic", who: "any", pts: 1 }], text: "1 point, +1 for each civic tile next to it." },
    museum: { icon: "🖼️", name: "Museum", cost: 5, tags: ["civic", "fun"], pts: 3, adj: [{ tag: "civic", who: "any", pts: 1 }], text: "3 points, +1 for each civic tile next to it." },
    chapel: { icon: "⛪", name: "Chapel", cost: 3, tags: ["civic"], pts: 2, give: [{ tag: "home", who: "mine", pts: 1 }], text: "2 points. Your homes next to it score +1." },
    graveyard: { icon: "🪦", name: "Graveyard", cost: 1, tags: ["civic"], pts: 2, give: [{ tag: "home", who: "any", pts: -1 }], text: "2 points, but homes next to it lose 1." },
    postoffice: { icon: "🏤", name: "Post Office", cost: 3, tags: ["civic"], global: [{ tag: "civic", who: "mine", coins: 1 }], text: "+1 coin a round for every civic tile you own." },
    observatory: { icon: "🔭", name: "Observatory", cost: 4, tags: ["civic"], pts: 5, adj: [{ who: "any", pts: -1 }], text: "5 points, −1 for every tile next to it (needs quiet)." },
    weather: { icon: "📡", name: "Weather Station", cost: 2, tags: ["civic"], global: [{ tag: "nature", who: "mine", coins: 1 }], text: "+1 coin a round for every nature tile you own." },
    monument: { icon: "🏛️", name: "Monument", cost: 7, tags: ["civic"], pts: 5, adj: [{ tag: "nature", who: "any", pts: 1 }], text: "5 points, +1 for each nature tile next to it." },
    // ---- crime ----
    thief: { icon: "🦹", name: "Thief Den", cost: 3, tags: ["crime"], steal: 1, text: "Each round, steals 1 coin from every rival with a tile next to it. Law next to it stops it." },
    gang: { icon: "🕶️", name: "Gang Hideout", cost: 4, tags: ["crime"], steal: 2, text: "Each round, steals 2 coins from every rival next to it. Law next to it stops it." },
    smuggler: { icon: "🏴‍☠️", name: "Smuggler Port", cost: 4, tags: ["crime", "water"], income: 2, steal: 1, text: "+2 coins a round, and steals 1 from every rival next to it." },
    // ---- transport ----
    road: { icon: "🛣️", name: "Road", cost: 1, tags: ["transport"], text: "Links your tiles. Your biggest connected district scores +1 per tile." },
    busstop: { icon: "🚏", name: "Bus Stop", cost: 1, tags: ["transport"], adj: [{ tag: "home", who: "any", coins: 1 }], text: "+1 coin a round for each home next to it." },
    parking: { icon: "🅿️", name: "Parking Lot", cost: 1, tags: ["transport"], adj: [{ tag: "shop", who: "any", pts: 1 }], text: "+1 point for each shop next to it." },
    station: { icon: "🚉", name: "Train Station", cost: 5, tags: ["transport"], pts: 2, global: [{ tag: "transport", who: "mine", pts: 1 }], text: "2 points, +1 for every other transport tile you own." },
    airport: { icon: "✈️", name: "Airport", cost: 7, tags: ["transport"], pts: 4, income: 2, give: [{ tag: "home", who: "any", pts: -1 }], text: "4 points and +2 coins a round. Homes next to it lose 1 (noise)." },
    // ---- the town's own ----
    fountain: { icon: "⛲", name: "Fountain", cost: 0, tags: ["nature", "water"], give: [{ tag: "home", who: "any", pts: 1 }], text: "The town square. Homes next to it score +1.", town: true },
};
Object.values(T).forEach((d) => (d.w = d.town ? 0 : d.cost <= 2 ? 3 : d.cost <= 4 ? 2 : 1));
module.exports = { TILES: T };
