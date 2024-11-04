const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const twilio = require('twilio');


const PORT = process.env.PORT || 5002;

const app = express();

const server = http.createServer(app);

app.use(cors());

let connectedUsers=[];
let rooms=[];

//create GET end point to check if the rrom exsist
app.get('/api/room-exists/:roomId',(req,res)=>{
    const {roomId} = req.params;//desructs
    // console.log("from the params geeting");
    // console.log(roomId);
    const room = rooms.find(room=>room.id==roomId);///find accoeding the id from the clinet
    
    
    if (room) {
        //send jsom the room is exist
        if (room.connectedUsers.length>3) {
            //the room is full
            return res.send({roomExists:true,full:true});
          
        }else {
            return res.send({roomExists:true,full:false});//the use can connection
        }
           

    }else{
            //send jsom the room is not exist
            return res.send({roomExists:false,full:false});
    }



});

const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});


// socket.io handlers - events that recived

io.on("connection", (socket) => {
    console.log(`user connected ${socket.id}`);
  
    socket.on("create-new-room", (data) => {

      createNewRoomHandler(data, socket);
    });
  
    socket.on("join-room", (data) => {
      joinRoomHandler(data, socket);
    });
  
    socket.on("disconnect", () => {
      disconnectHandler(socket);
    });
  
    socket.on("conn-signal", (data) => {
      signalingHandler(data, socket);
    });
  
    socket.on("conn-init", (data) => {
      initializeConnectionHandler(data, socket);
    });
  
    // socket.on("direct-message", (data) => {
    //   directMessageHandler(data, socket);
    // });
  });
  





///Handler function 
const createNewRoomHandler = (data, socket) => {
    console.log("host is creating new room");
    console.log(data);
    const { identity } = data;
  
    const roomId = uuidv4();//generate randpm uniq id
  
    // create new user
    const newUser = {
      identity,
      id: uuidv4(),
      socketId: socket.id,
      roomId,
    };
  
    // push that user to connectedUsers
    connectedUsers = [...connectedUsers, newUser];
  
    //create new room
    const newRoom = {
      id: roomId,
      connectedUsers: [newUser],
    };
    // join socket.io room
    socket.join(roomId);
  
    rooms = [...rooms, newRoom];
  
     // emit to that client which created that room roomId
    socket.emit("room-id", { roomId });
  
    // emit an event to all users connected
    // to that room about new users which are right in this room
    socket.emit("room-update", { connectedUsers: newRoom.connectedUsers });
  };

  //join rrom handler function
  const joinRoomHandler = (data, socket) => {
    const { identity, roomId } = data;
  
    const newUser = {
      identity,
      id: uuidv4(),
      socketId: socket.id,
      roomId,
    };
  
    // join room as user which just is trying to join room passing room id
    const room = rooms.find((room) => room.id === roomId);
    //add new user to the conncted users
    room.connectedUsers = [...room.connectedUsers, newUser];
  
    // join socket.io room
    socket.join(roomId);
  
    // add new user to connected users array
    connectedUsers = [...connectedUsers, newUser];
    // send emity to roomId users
    io.to(roomId).emit("room-update", { connectedUsers: room.connectedUsers });
    // emit to all users which are already in this room to prepare peer connection
    room.connectedUsers.forEach((user) => {
      if (user.socketId !== socket.id) {
        const data = {
          connUserSocketId: socket.id,
        };
        //?outcoming prepare msg
        io.to(user.socketId).emit("conn-prepare", data);
      }
    });
  
  };
  
  const disconnectHandler = (socket) => {
    // find if user has been registered - if yes remove him from room and connected users array
    const user = connectedUsers.find((user) => user.socketId === socket.id);
  
    if (user) {
      // remove user from room in server
      const room = rooms.find((room) => room.id === user.roomId);
        //remove user from the room array.
      room.connectedUsers = room.connectedUsers.filter(
        (user) => user.socketId !== socket.id
      );
  
      // leave socket io room
      socket.leave(user.roomId);
      
          // close the room if amount of the users which will stay in room will be 0
    if (room.connectedUsers.length > 0) {
        // emit to all users which are still in the room that user disconnected
        io.to(room.id).emit("user-disconnected", { socketId: socket.id });
  
        // emit an event to rest of the users which left in the toom new connectedUsers in room
        io.to(room.id).emit("room-update", {
          connectedUsers: room.connectedUsers,
        });
      } else {
        // remove the room 
        rooms = rooms.filter((r) => r.id !== room.id);
      }

    }
  };

  const signalingHandler = (data, socket) => {
    //destruct parameters 
    const { connUserSocketId, signal } = data;
    //prepare obj
    const signalingData = { signal, connUserSocketId: socket.id };
    //?send event to the client
    io.to(connUserSocketId).emit("conn-signal", signalingData);
  };

  // information from clients which are already in room that They have preapred for incoming connection
const initializeConnectionHandler = (data, socket) => {
    //destruct parameters
    const { connUserSocketId } = data;
    //prepare obj
    const initData = { connUserSocketId: socket.id };
    io.to(connUserSocketId).emit("conn-init", initData);
  };

  server.listen(PORT, () => {
    console.log(`Server is listening on ${PORT}`);
})