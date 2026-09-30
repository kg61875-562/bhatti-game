const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname,"index.html"));
});

const rooms = {};

function makeCode(){
  let code;
  do {
    code = Math.random().toString(36).substring(2,7).toUpperCase();
  } while(rooms[code]);
  return code;
}

io.on("connection",(socket)=>{

  console.log("Player connected:",socket.id);

  socket.on("createRoom",({name},callback)=>{
    const code=makeCode();

    rooms[code]={
      players:[],
      currentColor:"r",
      dice:0
    };

    const player={
      id:socket.id,
      name:name || "Player",
      color:"r"
    };

    rooms[code].players.push(player);
    socket.join(code);
    socket.roomCode=code;
    socket.playerColor="r";

    callback({
      ok:true,
      code,
      color:"r",
      players:rooms[code].players
    });

    io.to(code).emit("roomUpdate",rooms[code]);
  });

  socket.on("joinRoom",({code,name},callback)=>{
    code=String(code || "").toUpperCase();

    if(!rooms[code])
      return callback({ok:false,error:"Room nahi mila"});

    if(rooms[code].players.length>=4)
      return callback({ok:false,error:"Room full hai"});

    const colors=["r","g","b","y"];
    const used=rooms[code].players.map(p=>p.color);
    const color=colors.find(c=>!used.includes(c));

    const player={
      id:socket.id,
      name:name || "Player",
      color
    };

    rooms[code].players.push(player);
    socket.join(code);
    socket.roomCode=code;
    socket.playerColor=color;

    callback({
      ok:true,
      code,
      color,
      players:rooms[code].players
    });

    io.to(code).emit("roomUpdate",rooms[code]);
  });

  socket.on("onlineRoll",()=>{
    const code=socket.roomCode;
    if(!code || !rooms[code]) return;

    const room=rooms[code];

    if(socket.playerColor!==room.currentColor){
      socket.emit("onlineError","Abhi aapki bari nahi hai");
      return;
    }

    const dice=Math.floor(Math.random()*6)+1;
    room.dice=dice;

    io.to(code).emit("onlineDice",{
      dice,
      color:socket.playerColor
    });
  });

  socket.on("onlineMove",({player,index})=>{
    const code=socket.roomCode;
    if(!code || !rooms[code]) return;

    const room=rooms[code];

    if(socket.playerColor!==room.currentColor){
      socket.emit("onlineError","Abhi aapki bari nahi hai");
      return;
    }

    if(player!==socket.playerColor) return;

    io.to(code).emit("onlineMove",{
      player,
      index,
      dice:room.dice
    });

    const order=room.players.map(p=>p.color);
    const at=order.indexOf(room.currentColor);

    if(at>=0 && order.length>0){
      room.currentColor=order[(at+1)%order.length];
    }

    room.dice=0;

    io.to(code).emit("onlineTurn",{
      color:room.currentColor
    });
  });

  socket.on("disconnect",()=>{
    console.log("Player disconnected:",socket.id);

    const code=socket.roomCode;

    if(!code || !rooms[code]) return;

    rooms[code].players=
      rooms[code].players.filter(p=>p.id!==socket.id);

    if(rooms[code].players.length===0){
      delete rooms[code];
      return;
    }

    const colors=rooms[code].players.map(p=>p.color);

    if(!colors.includes(rooms[code].currentColor)){
      rooms[code].currentColor=colors[0];
    }

    io.to(code).emit("roomUpdate",rooms[code]);
    io.to(code).emit("onlineTurn",{
      color:rooms[code].currentColor
    });
  });

});

server.listen(PORT,"0.0.0.0",()=>{
  console.log("🚀 Bhatti REAL ONLINE Server running on port "+PORT);
});
