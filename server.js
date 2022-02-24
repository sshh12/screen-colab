const express = require("express");
const app = express();
const http = require("http");

const port = process.env.PORT || 5000;
const server = http.createServer(app);
const io = require("socket.io")(server);

const genRandomID = () => {
  const vocab = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  for (var i = 0; i < 6; i++) {
    result += vocab.charAt(Math.floor(Math.random() * vocab.length));
  }
  return result;
};

const rooms = {};

app.use(express.static(__dirname + "/build"));
app.use((req, res, next) => {
  console.log(req.pathname);
  return res.sendFile("./index.html", { root: __dirname + "/build" });
});

io.sockets.on("error", (e) => console.log(e));
io.sockets.on("connection", (socket) => {
  let roomID = genRandomID();
  socket.on("share", () => {
    console.log("share", roomID);
    rooms[roomID] = {
      sharerSocketID: socket.id,
      watchers: new Set(),
    };
    socket.emit("roomID", roomID);
  });
  socket.on("watch", (newRoomID) => {
    roomID = newRoomID;
    if (!rooms[roomID]) {
      socket.emit("exit");
    }
    socket.to(rooms[roomID].sharerSocketID).emit("watch", socket.id);
    rooms[roomID].watchers.add(socket.id);
  });
  socket.on("stop", () => {
    console.log("stop", roomID);
    for (let watchID of rooms[roomID].watchers) {
      socket.to(watchID).emit("exit");
    }
    delete rooms[roomID];
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
    if (!rooms[roomID]) {
      return;
    }
    socket.to(rooms[roomID].sharerSocketID).emit("rtc:disconnect", socket.id);
    if (socket.id in rooms[roomID].watchers) {
      rooms[roomID].watchers.remove(socket.id);
    }
  });
});
server.listen(port, () => console.log(`Server is running on port ${port}`));
