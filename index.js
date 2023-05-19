const express = require('express')
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const cors = require("cors");

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {

    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
    }


});

server.listen(process.env.PORT || 8000);