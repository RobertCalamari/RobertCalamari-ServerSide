// Visual-check server: the real server with the card shop's table preset to 10 slots and extra cash (in memory only).
const G = require("C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/games/duels/games/cardshop.js");
G.CFG.slots = 5;
G.CFG.cash = 10;
process.chdir("C:/Users/D/Documents/New folder/RobertCalamari-ServerSide");
process.env.PORT = "4006";
require("C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/index.js");
