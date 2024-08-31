const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const e = require("express");

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

//--------------------------------------------------------------------------------------------------------------------------

var SOCKET_LIST = {};
var plist = {};
var rlist = {};
var timers = [];

//This is a room object. it has the id, name and what game(type) is selected
var Room = function(codeid,type,maxp){
   var self = {
    room:codeid,
    roomtype:type,
    maxplayers:maxp,
    currplayers:0,
    spectate:"",
    totalMoney: 0, // New field
    players:{},
    spectaters:{},
    roominfo:{
        gamestarted:false,
        where: 'lobby',
        }
    }
    return self;
}

//This is a player object. it has the id, name and what room the player is in
var Player = function(id,nameid,rname){
   var self = {
    id:id,
    name:nameid,
    loggedin:true,
    roomname:rname,
    host:false,
    moneyHolding: 0, // New field
    overallMoney: 0, // New field
    isAlive: true, // New field
    itemsHolding: [], // New field
    gameinfo: {}
    }
    //console.log("[ENTITY] - Player Entity Created: " +  nameid);
    return self;
}

//When a room is created it is assigned a room object and added to the list of rooms(rlist)
Room.onCreate = function(codename, roomtype,maxp){
    var room = Room(codename,roomtype,maxp);
    rlist[codename] = room;
}

Room.onDisconnect = function(codename){
    delete rlist[codename];
    delete ROOMS[codename];
}

//When a player is connected it is assigned a player object and added to the player list(plist)
Player.onConnect = function(socket,nameid,rname){
    var player = Player(socket,nameid,rname);
    rlist[rname].players[rlist[rname].currplayers] = player;
    rlist[rname].currplayers++;
    plist[socket] = player;
}

//When a player is disconnected they are removed from the player list(plist)
Player.onDisconnect = function(socket){
        delete plist[socket];
}

//This is the list of users
var USERS = {
    //Stored as username:password
}

//This is the list of rooms
var ROOMS = {
    //Stored as username:password
}

var addUser = function(data,cb){
    setTimeout(function(){
        USERS[data.username] = data.room;
        cb();
    },10);
}

//Checks if the room exists
function isValidRoom(data){
    for(var i in ROOMS){
        if(data == i){
            return "true";
        }
    }
}

//Adds a room
var addRoom = function(data,cb){
    setTimeout(function(){
        ROOMS[data] = data;
        cb();
    },10);
}

function shuffleArray(array) {
    let currentIndex = array.length,  randomIndex;
  
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
  
      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
  
      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
  
    return array;
  }

var kickOutTimer = function(ptko) {
    setTimeout(function(){ 
    	if(ptko.loggedin == false)
    	{
    		playerDisconnect(ptko.id,true);
    		console.log("[DISCONNECT] - Player Deleted: " + ptko.name);
    	}
    	else{

    	}
	 }, 900000); //200000
}

var updatePlayerClient = function(data, calltype, extrainfo) {
    if(calltype == 'undefined' || calltype === undefined || calltype === null || calltype === ''){
        calltype = 'undefined';
    }
    try{
        // console.log(calltype);
        for(var i in rlist[data].players){
            SOCKET_LIST[rlist[data].players[i].id].emit('updateplayersclient',{playerslist:rlist[data].players, roomtype:rlist[data].roomtype, playerinfo:rlist[data].players[i].gameinfo, activeplayerclient:rlist[data].players[i].name, calltype:calltype, list:extrainfo, room:data, roominfo:rlist[data].roominfo});
        }  
    }catch(e){
        console.log(e);
    }
	          
}

var createPlayerObj = function(id,name,room,data){
	Player.onConnect(id,name,room);
    updatePlayerClient(room, 'update');
}

function checkEmptyFields(playername, roomname){
    if(roomname == '' || playername == ''){
        return true;
    }else{
        return false;
    }
}

function cleanUpRoomName(room){
    room = room.replace(/\s/g, '').toUpperCase();
    return room;
}

function cleanUpPlayerName(playername){
    return playername.trim();
}

var playerDisconnect = function(pid,forgood){
	var currentroom = "";
	var templist = {};
	var counter = 0;
	try{
		if(forgood==true){
			for(var i in plist){
		        if(plist[i].id == pid){
		            plist[pid].loggedin = false;
		            currentroom = plist[pid].roomname;
		            rlist[currentroom].currplayers--;
		            for(var j in rlist[currentroom].players){
				        if(rlist[currentroom].players[j].id==pid)
				        {
				        }
				        else{
				        	templist[counter]=rlist[currentroom].players[j];
				        	counter++;
				        }
				    }    
				    rlist[currentroom].players = templist;
                    if(rlist[currentroom].currplayers > 0)
                    {
				        rlist[currentroom].players[0].host = true;
                    }
				    updatePlayerClient(currentroom, 'update');
                    // updatePlayerClient(currentroom, 'teampick');
		        }
		    }
            console.log("[ROOM DELETE TEST] - Players Left: "+ rlist[currentroom].currplayers);
            if(rlist[currentroom].currplayers <= 0)
            {
                Room.onDisconnect(currentroom);
                console.log("[ROOM DELETE] - ROOM DELETED: "+ currentroom);
            }
		}
		else{
			for(var i in plist){
		        if(plist[i].id == pid){
		            //If it was a player then it allows the player to exit the browser but be able to log back into the game
		            console.log("[LOGGED OUT] - User logged out! : " +  plist[i].name);
		            plist[pid].loggedin = false;
		            kickOutTimer(plist[pid]);
		        }
		    }
		}
	}
	catch(e){
        console.log("Error Cought", e);
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////------LOGIN------///////////////////////////////////////////////////////////////////////////////////

io.on("connection", (socket) => {


    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;
    console.log(`User Connected: ${socket.id}`);
    console.log('new commit');
    socket.emit("checkforroom", {socket:socket.id});
   
    //Makes a user when they are not the host of the room
	socket.on('make_player',function(data){
		var nameIsUsed=false;
		var loggedstatus = true;
		var tempsocket=0;
		var tempplayer;
        var gamestart = false;
        data.room = cleanUpRoomName(data.room);
        data.playername = cleanUpPlayerName(data.playername);
        if(checkEmptyFields(data.playername, data.room)){
            socket.emit("signInResponse", {success:false,msg:"Please make sure you have filled out both fields!"});
        }else if(data.playername.length > 15){
            socket.emit("signInResponse", {success:false,msg:"Please choose a shorter name!"});
        }else{
            if(isValidRoom(data.room)){
                
                if(rlist[data.room].currplayers>=rlist[data.room].maxplayers){
                    socket.emit('signInResponse',{success:false,msg:"Room is full!"});  
                }
                else{
                    if(rlist[data.room].roominfo.gamestarted == true){
                        socket.emit('signInResponse',{success:false,msg:"The game has already started!"});  
                    }
                    else{
                        for(var i in rlist[data.room].players){
                            if(rlist[data.room].players[i].name.toUpperCase() == data.playername.toUpperCase()){
                                nameIsUsed=true;
                                loggedstatus = rlist[data.room].players[i].loggedin;
                                tempsocket = rlist[data.room].players[i].id;
                                tempplayer = rlist[data.room].players[i];
                                // gamestart = rlist[data.room].players[i].gameinfo.gamestart;
                                break;
                            }
                            else{
                            }
                        }

                        if(nameIsUsed==true && loggedstatus==true){
                            socket.emit('signInResponse',{success:false,msg:"That name is already taken!"});  
                        }
                        else if(nameIsUsed==true && loggedstatus==false){
                            delete SOCKET_LIST[socket.id];
                            SOCKET_LIST[tempsocket] = socket;
                            socket.id = tempsocket;
                            tempplayer.loggedin = true;
                            // socket.emit('signInResponse',{success:true,room:data.room,roomtype:data.roomtype, playername:data.playername}); 
                            updatePlayerClient(data.room, 'loginreconnect', {datatype:'loginreconnect'});
                        }
                        else{
                            createPlayerObj(socket.id,data.playername,data.room,data);
                            updatePlayerClient(data.room, 'newplayer', {datatype:'newplayer'});
                            // socket.emit('signInResponse',{success:true,room:data.room,roomtype:data.roomtype, playername:data.playername}); 
                        }
                    }
                }
            } 
            else {
                socket.emit('signInResponse',{success:false,msg:"Room does not exist!"});         
            }
        }
    });

    socket.on('make_room',function(data){
        let dataRoom = cleanUpRoomName(data.room);
        let dataPlayername = cleanUpPlayerName(data.playername);
        if(checkEmptyFields(dataPlayername, dataRoom)){
            socket.emit("signInResponse", {success:false,msg:"Please make sure you have filled out both fields!"});
        }else if(dataPlayername.length > 15){
            socket.emit("signInResponse", {success:false,msg:"Please choose a shorter name!"});
        }else{
            if(isValidRoom(dataRoom)){
                socket.emit('signInResponse',{success:false,msg:"Room is already taken!"});
                console.log("[ROOM MAKE] - Room already exists: " + dataRoom);
            } 
            else{
                console.log("[ROOM MAKE] - Making Room: " + dataRoom);
                addRoom(dataRoom,function(){
                    Room.onCreate(dataRoom,data.roomtype,data.maxplayers);
                    createPlayerObj(socket.id,dataPlayername,dataRoom,data);
                    rlist[dataRoom].players[0].host = true;
                    rlist[dataRoom].roominfo.where = 'lobby';
                    // socket.emit('signInResponse',{success:true,room:dataRoom,roomtype:data.roomtype});  
                    updatePlayerClient(dataRoom, 'updatelobby', {datatype:'lobby'});
                            
                });   
            }
        }
    });

    

    socket.on('room_check',function(data){
        if(typeof rlist[data.room] === 'undefined' || data.room == '' || data.playername == ''){
        }else{
            try{
                for(var i in rlist[data.room].players){
                    if(rlist[data.room].players[i].name==data.playername){
                        delete SOCKET_LIST[rlist[data.room].players[i].id];
                        plist[data.socketid] = plist[rlist[data.room].players[i].id];
                        delete plist[rlist[data.room].players[i].id];
                        rlist[data.room].players[i].id = data.socketid;
                        rlist[data.room].players[i].loggedin = true;
                        updatePlayerClient(data.room, 'reconnect-mobile', {datatype:'reconnect-mobile'});
                    }
                }
            }catch(e){
                console.log(e);
            }
        }
    });

	socket.on('disconnect2',function(data){
		playerDisconnect(socket.id,data.forgood);
	});


    //This is when a socket is disconnected from the server
    socket.on('disconnect',function(){
    	playerDisconnect(socket.id,false);
    });

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////------CODENAMES------///////////////////////////////////////////////////////////////////////////////////

    socket.on('join_codename_team',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                for(var i in rlist[data.room].players){
                    if(rlist[data.room].players[i].name==data.playername){
                        rlist[data.room].players[i].gameinfo.color = data.color;
                    }
                }
                updatePlayerClient(data.room, 'teamchosen', {datatype:'teamchosen'});
            }
        }catch(e){
            console.log(e);
        }
    });

    socket.on('randomize_codename_team',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                let copyPlayersList = [];
                for (let i = 0; i < rlist[data.room].currplayers; i++) {
                    copyPlayersList.push(i);
                }
                shuffledlist = shuffleArray(copyPlayersList);
                if(shuffledlist.length%2 != 0){
                        let randnum = Math.floor(Math.random() * 2);
                        let newcolor = 'red';
                        if(randnum == 1){
                            newcolor = 'blue';
                        }
                        rlist[data.room].players[shuffledlist[shuffledlist.length-1]].gameinfo.color = newcolor;
                        shuffledlist = shuffledlist.slice(0,-1);
                }else{
                }
                
                for(var i in shuffledlist){
                    if(i < shuffledlist.length/2){
                        rlist[data.room].players[shuffledlist[i]].gameinfo.color = 'red';
                    }else{
                        rlist[data.room].players[shuffledlist[i]].gameinfo.color = 'blue';
                    }
                }
                updatePlayerClient(data.room, 'randomizeteam', {datatype:'randomizeteam'});
            }
            
        }catch(e){
            console.log(e);
        }
    });

    socket.on('start_codename_game',function(data){    
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                if(data.redTeam.length < 2 || data.blueTeam.length < 2){
                    socket.emit("startgameerrormessage", {msg:"You must have at least 2 players on each team!"});
                }else{
                    const copyList = [...data.allWords];
                    const randomWords = [];
                    for (let i = 0; i < 25; i++) {
                        const randomIndex = Math.floor(Math.random() * copyList.length);
                        const word = copyList.splice(randomIndex, 1)[0];
                        randomWords.push(word);
                    }

                    const redWords = [];
                    const blueWords = [];
                    const grayWord = [];
                    const copyWords = [...randomWords];

                    let randnum = Math.floor(Math.random() * 2);
                    let startingTeam = 'red';
                    if(randnum === 1){
                        startingTeam = 'red';
                        const randomIndex = Math.floor(Math.random() * copyWords.length);
                        const word = copyWords.splice(randomIndex, 1)[0];
                        redWords.push(word);
                    }else{
                        startingTeam = 'blue';
                        const randomIndex = Math.floor(Math.random() * copyWords.length);
                        const word = copyWords.splice(randomIndex, 1)[0];
                        blueWords.push(word);
                    }

                    for (let i = 0; i < 8; i++) {
                        const randomIndex = Math.floor(Math.random() * copyWords.length);
                        const word = copyWords.splice(randomIndex, 1)[0];
                        redWords.push(word);
                    }

                    for (let i = 0; i < 8; i++) {
                        const randomIndex = Math.floor(Math.random() * copyWords.length);
                        const word = copyWords.splice(randomIndex, 1)[0];
                        blueWords.push(word);
                    }
                    
                    const randomIndex = Math.floor(Math.random() * copyWords.length);
                    const word = copyWords.splice(randomIndex, 1)[0];
                    grayWord.push(word);

                    let spymasterredlist = shuffleArray(data.redTeam);
                    let spymasterbluelist = shuffleArray(data.blueTeam);

                    for(var i in rlist[data.room].players){
                        rlist[data.room].players[i].gameinfo.gamestart = true;
                        // rlist[data.room].players[i].gameinfo.saveddata = {selectedWords:randomWords, startingTeam:startingTeam, redWords:redWords, blueWords:blueWords, grayWord:grayWord, spymasterredlist:spymasterredlist, spymasterbluelist:spymasterbluelist};
                    }
                    rlist[data.room].roominfo.where = data.where;
                    rlist[data.room].roominfo.selectedWords = randomWords;
                    rlist[data.room].roominfo.currTeam = startingTeam;
                    rlist[data.room].roominfo.redWords = redWords;
                    rlist[data.room].roominfo.blueWords = blueWords;
                    rlist[data.room].roominfo.grayWord = grayWord
                    rlist[data.room].roominfo.spymasterredlist = spymasterredlist;
                    rlist[data.room].roominfo.spymasterbluelist = spymasterbluelist;
                    rlist[data.room].roominfo.clickedMsg = data.clickedMsg;
                    rlist[data.room].roominfo.clickedCards = [[],[]];
            
                    updatePlayerClient(data.room, 'gamestart', {datatype:'gamestart'});
                }
            }
        }catch(e){
            console.log(e);
        }
    });

    socket.on('send_codename_clue',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                for (let i = 0; i < data.guesses.length; i++) {
                    var ascii = data.guesses.charCodeAt(i);
                    if (ascii < 48 || ascii > 57) {
                        data.guesses = 1;
                    }
                }
                data.guesses=parseInt(data.guesses)+1;        
                rlist[data.room].roominfo.where = data.where;
                rlist[data.room].roominfo.guesses = data.guesses;
                rlist[data.room].roominfo.scoreRed = data.scoreRed;
                rlist[data.room].roominfo.scoreBlue = data.scoreBlue;
                rlist[data.room].roominfo.code = data.code;
                rlist[data.room].roominfo.clickedMsg = data.clickedMsg;
                updatePlayerClient(data.room, 'sentclue', {datatype:'sentclue'});
            }
        }catch(e){
            console.log(e);
        }
    });

    socket.on('send_clicked_card_next_turn',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                rlist[data.room].roominfo.where = data.where;
                rlist[data.room].roominfo.guesses = data.guesses;
                rlist[data.room].roominfo.cardClicked = data.cardClicked;
                rlist[data.room].roominfo.clickedCards = data.clickedCards;
                rlist[data.room].roominfo.scoreRed = data.scoreRed;
                rlist[data.room].roominfo.scoreBlue = data.scoreBlue;
                rlist[data.room].roominfo.clickedMsg = data.clickedMsg;
                rlist[data.room].roominfo.currTeam = data.currTeam;

                updatePlayerClient(data.room, 'cardclickednextturn', {datatype:'cardclickednextturn'});
            }
        }catch(e){
            console.log(e);
        }    
    });

    socket.on('send_clicked_card_cont_turn',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                rlist[data.room].roominfo.where = data.where;
                rlist[data.room].roominfo.guesses = data.guesses;
                rlist[data.room].roominfo.cardClicked = data.cardClicked;
                rlist[data.room].roominfo.clickedCards = data.clickedCards;
                rlist[data.room].roominfo.scoreRed = data.scoreRed;
                rlist[data.room].roominfo.scoreBlue = data.scoreBlue;
                rlist[data.room].roominfo.clickedMsg = data.clickedMsg;


                updatePlayerClient(data.room, 'cardclickednextturn', {datatype:'cardclickednextturn'});
            }
        }catch(e){
            console.log(e);
        }    
    });

    socket.on('game_over_codename',function(data){
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                rlist[data.room].roominfo.where = data.where;
                rlist[data.room].roominfo.winners = data.winners;
                rlist[data.room].roominfo.reason = data.reason;
                rlist[data.room].roominfo.clickedMsg = data.clickedMsg;

                updatePlayerClient(data.room, 'gameover', {datatype:'gameover'});
            }
        }catch(e){
        console.log(e);
        }
    });

    socket.on('exit_codename_game',function(data){
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                socket.emit('backtohome');
                playerDisconnect(socket.id,true);
                updatePlayerClient(data.room, 'codenameexit', {datatype:'codenameexit'});
            }
        }catch(e){
            console.log(e);
        }
    });

    socket.on('new_codename_game',function(data){
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                const copyList = [...data.allWords];
                const randomWords = [];
                for (let i = 0; i < 25; i++) {
                    const randomIndex = Math.floor(Math.random() * copyList.length);
                    const word = copyList.splice(randomIndex, 1)[0];
                    randomWords.push(word);
                }

                const redWords = [];
                const blueWords = [];
                const grayWord = [];
                const copyWords = [...randomWords];

                let randnum = Math.floor(Math.random() * 2);
                let startingTeam = 'red';
                if(randnum === 1){
                    startingTeam = 'red';
                    const randomIndex = Math.floor(Math.random() * copyWords.length);
                    const word = copyWords.splice(randomIndex, 1)[0];
                    redWords.push(word);
                }else{
                    startingTeam = 'blue';
                    const randomIndex = Math.floor(Math.random() * copyWords.length);
                    const word = copyWords.splice(randomIndex, 1)[0];
                    blueWords.push(word);
                }

                for (let i = 0; i < 8; i++) {
                    const randomIndex = Math.floor(Math.random() * copyWords.length);
                    const word = copyWords.splice(randomIndex, 1)[0];
                    redWords.push(word);
                }

                for (let i = 0; i < 8; i++) {
                    const randomIndex = Math.floor(Math.random() * copyWords.length);
                    const word = copyWords.splice(randomIndex, 1)[0];
                    blueWords.push(word);
                }
                
                const randomIndex = Math.floor(Math.random() * copyWords.length);
                const word = copyWords.splice(randomIndex, 1)[0];
                grayWord.push(word);

                // let [firstred, ...restred] = data.redTeam;
                // let spymasterredlist = [...restred,firstred];

                // let [firstblue, ...restblue] = data.blueTeam;
                // let spymasterbluelist = [...restblue,firstblue];

                rlist[data.room].roominfo.spymasterredlist.push(rlist[data.room].roominfo.spymasterredlist.shift());
                rlist[data.room].roominfo.spymasterbluelist.push(rlist[data.room].roominfo.spymasterbluelist.shift());

                setTimeout(() => {
                    rlist[data.room].roominfo.where = data.where;
                    rlist[data.room].roominfo.selectedWords = randomWords;
                    rlist[data.room].roominfo.startingTeam = startingTeam;
                    rlist[data.room].roominfo.redWords = redWords;
                    rlist[data.room].roominfo.blueWords = blueWords;
                    rlist[data.room].roominfo.grayWord = grayWord;
                    rlist[data.room].roominfo.spymasterredlist = rlist[data.room].roominfo.spymasterredlist;
                    rlist[data.room].roominfo.spymasterbluelist = rlist[data.room].roominfo.spymasterbluelist;
                    rlist[data.room].roominfo.clickedMsg = data.clickedMsg;
                    rlist[data.room].roominfo.clickedCards = [[],[]];
            
                    updatePlayerClient(data.room, 'newgame', {datatype:'newgame'});
                }, 600);
            }
        }catch(e){
            console.log(e);
        }
	});

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////------SPYFALL------///////////////////////////////////////////////////////////////////////////////////

    socket.on('start_spyfall_game',function(data){    
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                if(rlist[data.room].currplayers < 4){
                    socket.emit("startgameerrormessage", {msg:"You must have at least 4 players to play!"});
                }else{
                    const copyList = [...data.allLocations];
                    let randomLocations = [];
                    for (let i = 0; i < 26; i++) {
                        const randomIndex = Math.floor(Math.random() * copyList.length);
                        const word = copyList.splice(randomIndex, 1)[0];
                        randomLocations.push(word);
                    }

                    randomLocations.sort(function(a, b){
                        var nameA = a.location.toLowerCase(), nameB = b.location.toLowerCase();
                        if (nameA < nameB) 
                         return -1;
                        if (nameA > nameB)
                         return 1;
                        return 0; 
                       });

                    let pickedLocation = randomLocations[Math.floor(Math.random() * randomLocations.length)];
                    let pickedSpy = Math.floor(Math.random() * rlist[data.room].currplayers);
                    let allNewRoles = [];

                    for(let i = 0; i < rlist[data.room].currplayers;i++){
                        if(i <= pickedLocation.roles.length){
                            allNewRoles[allNewRoles.length] = pickedLocation.roles[i];
                        }else{
                            const randomIndex = Math.floor(Math.random() * pickedLocation.roles.length);
                            allNewRoles[allNewRoles.length] = pickedLocation.roles[randomIndex];
                        }
                    }
                    allNewRoles = shuffleArray(allNewRoles);

                    for(let i in rlist[data.room].players){
                        if(pickedSpy == i){
                            rlist[data.room].players[i].gameinfo.role = 'Spy';
                        }else{
                            rlist[data.room].players[i].gameinfo.role = allNewRoles[i];
                        }


                        rlist[data.room].players[i].gameinfo.gamestart = true;
                    }

                    rlist[data.room].roominfo.where = data.where;
                    rlist[data.room].roominfo.timer = 480;
                    rlist[data.room].roominfo.pickedLocation = pickedLocation.location;
                    rlist[data.room].roominfo.pickedSpy = rlist[data.room].players[pickedSpy];
                    rlist[data.room].roominfo.randomLocations = randomLocations;
            
                    updatePlayerClient(data.room, 'gamestart', {datatype:'gamestart'});
                }
            }
        }catch(e){
            console.log(e);
        }
    });

    socket.on('spyfall_timer',function(data){    
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                    if(data.startorstop == 'start'){
                        
                        var WinnerCountdown = setInterval(function(){
                            rlist[data.room].roominfo.timer--;
                            for(var i in rlist[data.room].players){
                                SOCKET_LIST[rlist[data.room].players[i].id].emit('counter', {timer:rlist[data.room].roominfo.timer});
                            } 
                            if (rlist[data.room].roominfo.timer <= 0) {
                              clearInterval(WinnerCountdown);
                            }
                          }, 1000);
                    }else if(data.startorstop == 'pause'){
                        pauseInterval(WinnerCountdown);
                        
                    }
            
                    
                
            }
        }catch(e){
            console.log(e);
        }
    });




    socket.on('exit_spyfall_game',function(data){
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                socket.emit('backtohome');
                playerDisconnect(socket.id,true);
                updatePlayerClient(data.room, 'spyfallexit', {datatype:'spyfallexit'});
            }
        }catch(e){
            console.log(e);
        }
    });




    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////------ Planning Poker ------///////////////////////////////////////////////////////////////////////////////////

    socket.on('planningpoker_update_storypoints',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                for(var i in rlist[data.room].players){
                    if(rlist[data.room].players[i].name==data.playername){
                        rlist[data.room].players[i].gameinfo.storypoints = data.number;
                    }
                }
                updatePlayerClient(data.room, 'itemclicked', {datatype:'itemclicked'});
            }
        }catch(e){
            console.log(e);
        }    
    });

    socket.on('planningpoker_update_days',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                for(var i in rlist[data.room].players){
                    if(rlist[data.room].players[i].name==data.playername){
                        rlist[data.room].players[i].gameinfo.days = data.number;
                    }
                }
                updatePlayerClient(data.room, 'itemclicked', {datatype:'itemclicked'});
            }
        }catch(e){
            console.log(e);
        }    
    });

    socket.on('planningpoker_start_round',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                for(var i in rlist[data.room].players){
                        rlist[data.room].players[i].gameinfo.days = '-';
                        rlist[data.room].players[i].gameinfo.storypoints = '-';
                }
                rlist[data.room].roominfo.desc = data.desc;
                rlist[data.room].roominfo.where = 'roundstart';
                updatePlayerClient(data.room, 'roundstart', {datatype:'roundstart'});
            }
        }catch(e){
            console.log(e);
        }    
    });

    socket.on('planningpoker_in_round',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                rlist[data.room].roominfo.where = 'inround';
                updatePlayerClient(data.room, 'inround', {datatype:'inround'});
            }
        }catch(e){
            console.log(e);
        }    
    });

    socket.on('planningpoker_reveal_round',function(data){   
        try{
            if(typeof rlist[data.room] === 'undefined'){
            }else{
                rlist[data.room].roominfo.where = 'roundreveal';
                updatePlayerClient(data.room, 'roundreveal', {datatype:'roundreveal'});
            }
        }catch(e){
            console.log(e);
        }    
    });

    
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////------  ------///////////////////////////////////////////////////////////////////////////////////


    socket.on('add_money', function(data) {
        const room = rlist[data.room];
        if (room) {
            room.totalMoney += 1;
            io.to(data.room).emit('update_total_money', { totalMoney: room.totalMoney });
        }
    });

    socket.on('get_inventory', function(data) {
        const player = plist[socket.id];
        if (player) {
            socket.emit('update_inventory', { itemsHolding: player.itemsHolding });
        }
    });











});

server.listen(3001, () => {
  console.log("SERVER IS RUNNING");
});