import "./App.css";
import io from "socket.io-client";
import React, { useEffect, useState } from "react";
import { ThemeProvider } from "theme-ui";
import { Box, Text, Flex, Button } from "rebass";
import { Label, Input, Checkbox } from "@rebass/forms";
import theme from "./theme";

const SOCKET_SERVER = "http://" + window.location.hostname + ":4000";
const BASE_URL = window.location.origin;
const RTC_CONFIG = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

function App() {
  let Page;
  let showNav = true;
  if (window.location.pathname.startsWith("/share")) {
    Page = Broadcast;
  } else if (window.location.pathname.startsWith("/watch")) {
    Page = Watch;
    showNav = false;
  } else {
    Page = Landing;
  }
  return (
    <ThemeProvider theme={theme}>
      <div className="App">
        {showNav && (
          <Flex px={2} color="white" bg="black" alignItems="center">
            <Text p={2} fontWeight="bold">
              <a href="/" style={{ textDecoration: "none", color: "#fff" }}>
                Screen Colab
              </a>
            </Text>
          </Flex>
        )}
        <Page />
      </div>
    </ThemeProvider>
  );
}

function Landing() {
  const [showShareSettings, setShowShareSettings] = useState(false);
  const [showViewSettings, setShowViewSettings] = useState(false);
  const [roomID, setRoomID] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [captureAudio, setCaptureAudio] = useState(false);
  const shareStreamOpts = {
    video: {
      cursor: showCursor ? "always" : "never",
    },
    audio: captureAudio,
  };
  return (
    <Box mt={60}>
      {!(showViewSettings || showShareSettings) && (
        <div>
          <Button bg={"#33e"} onClick={() => setShowShareSettings(true)}>
            Share Screen
          </Button>
          <br />
          <Button bg={"#a0c"} onClick={() => setShowViewSettings(true)} mt={30}>
            View Screen
          </Button>
        </div>
      )}
      {showShareSettings && (
        <div>
          <Box
            style={{
              transform: "translateX(-50%)",
              left: "50%",
              position: "absolute",
            }}
          >
            <Label>
              <Checkbox
                id="show-cur"
                name="show-cur"
                checked={showCursor}
                onClick={(evt) => setShowCursor(!showCursor)}
              />
              Show Cursor
            </Label>
            <Label>
              <Checkbox
                id="cap-aud"
                name="cap-aud"
                checked={captureAudio}
                onClick={(evt) => setCaptureAudio(!captureAudio)}
              />
              Capture Audio
            </Label>
          </Box>
          <Button bg={"#33e"} mt={68}>
            <a
              style={{ textDecoration: "none", color: "#fff" }}
              href={`/share?o=${window.encodeURIComponent(
                JSON.stringify(shareStreamOpts)
              )}`}
            >
              Start Sharing
            </a>
          </Button>
        </div>
      )}
      {showViewSettings && (
        <div>
          <Box
            style={{
              transform: "translateX(-50%)",
              left: "50%",
              position: "absolute",
            }}
          >
            <Input
              value={roomID}
              placeholder="Room ID"
              id="room-id"
              name="room-id"
              type="text"
              maxWidth={"300px"}
              margin={"auto"}
              onChange={(evt) => setRoomID(evt.target.value.toUpperCase())}
            />
          </Box>
          {roomID && (
            <Button bg={"#a0e"} mt={68}>
              <a
                style={{ textDecoration: "none", color: "#fff" }}
                href={`/watch/${roomID}`}
              >
                View
              </a>
            </Button>
          )}
        </div>
      )}
    </Box>
  );
}

function Watch() {
  const [winSize, setWinSize] = useState([
    window.innerWidth,
    window.innerHeight,
  ]);
  const [playing, setPlaying] = useState(false);
  let startWatching = async () => {
    const roomID = window.location.pathname.split("/")[2];
    const socket = io.connect(SOCKET_SERVER);
    let peerConnection;
    socket.on("connect", () => {
      socket.emit("watch", roomID);
    });
    socket.on("rtc:offer", (id, description) => {
      peerConnection = new RTCPeerConnection(RTC_CONFIG);
      peerConnection
        .setRemoteDescription(description)
        .then(() => peerConnection.createAnswer())
        .then((sdp) => peerConnection.setLocalDescription(sdp))
        .then(() => {
          socket.emit("rtc:answer", id, peerConnection.localDescription);
        });
      peerConnection.ontrack = (event) => {
        const mediaStream = event.streams[0];
        setPlaying(true);
        document.querySelector("video").srcObject = mediaStream;
      };
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("rtc:candidate", id, event.candidate);
        }
      };
    });
    socket.on("rtc:candidate", (id, candidate) => {
      peerConnection
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e) => console.error(e));
    });
  };
  useEffect(() => {
    startWatching();
  }, []);
  useEffect(() => {
    const onWinResize = () => {
      setWinSize([window.innerWidth, window.innerHeight]);
    };
    window.addEventListener("resize", onWinResize);
  });
  return (
    <div>
      <video
        style={{
          maxWidth: winSize[0] + "px",
          maxHeight: winSize[0] + "px",
          display: playing ? "block" : "none",
        }}
        playsInline
        autoPlay
        muted
      ></video>
      {!playing && (
        <Text fontSize={"1.5em"} mt={20}>
          Waiting for stream...
        </Text>
      )}
    </div>
  );
}

function Broadcast() {
  const [room, setRoom] = useState("");
  const displayMediaOptions = {
    video: {
      cursor: "always",
    },
    audio: true,
  };
  const startStream = async (options) => {
    let captureStream = null;
    try {
      captureStream = await navigator.mediaDevices.getDisplayMedia(options);
    } catch (err) {
      console.error(err);
    }
    return captureStream;
  };
  useEffect(() => {
    const displayMediaOptions = JSON.parse(
      decodeURIComponent(window.location.search.replace("?o=", ""))
    );
    startStream(displayMediaOptions).then((stream) => {
      const socket = io.connect(SOCKET_SERVER);
      const peerConnections = {};
      socket.on("connect", () => {
        socket.emit("share");
      });
      socket.on("roomID", (roomID) => {
        setRoom(roomID);
      });
      socket.on("rtc:answer", (id, description) => {
        peerConnections[id].setRemoteDescription(description);
      });
      socket.on("watch", (id) => {
        const peerConnection = new RTCPeerConnection(RTC_CONFIG);
        peerConnections[id] = peerConnection;
        stream
          .getTracks()
          .forEach((track) => peerConnection.addTrack(track, stream));
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("rtc:candidate", id, event.candidate);
          }
        };
        peerConnection
          .createOffer()
          .then((sdp) => peerConnection.setLocalDescription(sdp))
          .then(() => {
            socket.emit("rtc:offer", id, peerConnection.localDescription);
          });
      });
      socket.on("rtc:candidate", (id, candidate) => {
        peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
      });
      socket.on("rtc:disconnect", (id) => {
        peerConnections[id].close();
        delete peerConnections[id];
      });
    });
  }, []);
  return (
    <div>
      {room && (
        <Box mt={25}>
          <Text fontWeight={600} fontSize={"2em"}>
            {room}
          </Text>
          <Box mt={25} textAlign={"center"}>
            <Input
              value={BASE_URL + "/watch/" + room}
              id="room-link"
              name="room-link"
              type="text"
              maxWidth={"300px"}
              margin={"auto"}
              onClick={(evt) => {
                evt.target.select();
                document.execCommand("copy");
              }}
            />
          </Box>
          <Button bg={"#ef0f0f"} mt={20}>
            <a style={{ textDecoration: "none", color: "#fff" }} href={`/`}>
              STOP
            </a>
          </Button>
        </Box>
      )}
    </div>
  );
}

export default App;
