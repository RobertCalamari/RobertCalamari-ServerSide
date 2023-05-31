
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
            socket.emit('backtocodenamehome');
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

            let [firstred, ...restred] = data.redTeam;
            let spymasterredlist = [...restred,firstred];

            let [firstblue, ...restblue] = data.blueTeam;
            let spymasterbluelist = [...restblue,firstblue];

            rlist[data.room].roominfo.where = data.where;
            rlist[data.room].roominfo.selectedWords = randomWords;
            rlist[data.room].roominfo.startingTeam = startingTeam;
            rlist[data.room].roominfo.redWords = redWords;
            rlist[data.room].roominfo.blueWords = blueWords;
            rlist[data.room].roominfo.grayWord = grayWord;
            rlist[data.room].roominfo.spymasterredlist = spymasterredlist;
            rlist[data.room].roominfo.spymasterbluelist = spymasterbluelist;
            rlist[data.room].roominfo.clickedMsg = data.clickedMsg;
            rlist[data.room].roominfo.clickedCards = [[],[]];
    
            updatePlayerClient(data.room, 'newgame', {datatype:'newgame'});
        }
    }catch(e){
        console.log(e);
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