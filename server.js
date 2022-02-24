const express = require("express");
const app = express();
const http = require("http");

const port = process.env.PORT || 4000;
const server = http.createServer(app);
const io = require("socket.io")(server);

app.use(express.static(__dirname + "/build"));

const genRandomID = () => {
  const vocab = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  for (var i = 0; i < 6; i++) {
    result += vocab.charAt(Math.floor(Math.random() * vocab.length));
  }
  return result;
};

const rooms = {};

io.sockets.on("error", (e) => console.log(e));
io.sockets.on("connection", (socket) => {
  let roomID = genRandomID();
  socket.on("share", () => {
    console.log("share", roomID);
    rooms[roomID] = {
      sharerSocketID: socket.id,
    };
    socket.emit("roomID", roomID);
  });
  socket.on("watch", (newRoomID) => {
    roomID = newRoomID;
    socket.to(rooms[roomID].sharerSocketID).emit("watch", socket.id);
  });
  socket.on("rtc:offer", (id, message) => {
    socket.to(id).emit("rtc:offer", socket.id, message);
  });
  socket.on("rtc:answer", (id, message) => {
    socket.to(id).emit("rtc:answer", socket.id, message);
  });
  socket.on("rtc:candidate", (id, message) => {
    socket.to(id).emit("rtc:candidate", socket.id, message);
  });
  socket.on("disconnect", () => {
    socket.to(rooms[roomID].sharerSocketID).emit("rtc:disconnect", socket.id);
  });
});
server.listen(port, () => console.log(`Server is running on port ${port}`));
