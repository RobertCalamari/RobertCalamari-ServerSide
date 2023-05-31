
console.log(`User Connected: ${socket.id}`);
socket.emit("checkforroom", {socket:socket.id});

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
                        if(rlist[data.room].players[i].name==data.playername){
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

socket.on('disconnect2',function(data){
    playerDisconnect(socket.id,data.forgood);
});


//This is when a socket is disconnected from the server
socket.on('disconnect',function(){
    playerDisconnect(socket.id,false);
});