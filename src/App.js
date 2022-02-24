import "./App.css";
import io from "socket.io-client";
import React, { useEffect, useState } from "react";
import { ThemeProvider } from "theme-ui";
import { Box, Text, Flex, Button } from "rebass";
import theme from "./theme";

const SOCKET_SERVER = "http://" + window.location.hostname + ":4000";
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
  if (window.location.pathname === "/share") {
    Page = Broadcast;
  } else if (window.location.pathname === "/watch") {
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
              Screen Colab
            </Text>
          </Flex>
        )}
        <Page />
      </div>
    </ThemeProvider>
  );
}

function Landing() {
  return (
    <Box mt={200}>
      <Button variant="primary" bg={"#33e"}>
        <a style={{ textDecoration: "none", color: "#fff" }} href="/share">
          Share Screen
        </a>
      </Button>
      <br />
      <Button variant="primary" bg={"#a0c"} mt={20}>
        <a style={{ textDecoration: "none", color: "#fff" }} href="/watch">
          Watch
        </a>
      </Button>
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
    const socket = io.connect(SOCKET_SERVER);
    let peerConnection;
    socket.on("connect", () => {
      socket.emit("watcher");
    });
    socket.on("offer", (id, description) => {
      peerConnection = new RTCPeerConnection(RTC_CONFIG);
      peerConnection
        .setRemoteDescription(description)
        .then(() => peerConnection.createAnswer())
        .then((sdp) => peerConnection.setLocalDescription(sdp))
        .then(() => {
          socket.emit("answer", id, peerConnection.localDescription);
        });
      peerConnection.ontrack = (event) => {
        const mediaStream = event.streams[0];
        setPlaying(true);
        document.querySelector("video").srcObject = mediaStream;
      };
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("candidate", id, event.candidate);
        }
      };
    });
    socket.on("candidate", (id, candidate) => {
      peerConnection
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e) => console.error(e));
    });
    socket.on("broadcaster", () => {
      socket.emit("watcher");
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
  const displayMediaOptions = {
    video: {
      cursor: "always",
    },
    audio: true,
  };
  const startStream = async () => {
    let captureStream = null;
    try {
      captureStream = await navigator.mediaDevices.getDisplayMedia(
        displayMediaOptions
      );
    } catch (err) {
      console.error(err);
    }
    return captureStream;
  };
  useEffect(() => {
    startStream().then((stream) => {
      const socket = io.connect(SOCKET_SERVER);
      const peerConnections = {};
      socket.on("connect", () => {
        socket.emit("broadcaster");
      });
      socket.on("answer", (id, description) => {
        peerConnections[id].setRemoteDescription(description);
      });

      socket.on("watcher", (id) => {
        const peerConnection = new RTCPeerConnection(RTC_CONFIG);
        peerConnections[id] = peerConnection;
        stream
          .getTracks()
          .forEach((track) => peerConnection.addTrack(track, stream));

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("candidate", id, event.candidate);
          }
        };

        peerConnection
          .createOffer()
          .then((sdp) => peerConnection.setLocalDescription(sdp))
          .then(() => {
            socket.emit("offer", id, peerConnection.localDescription);
          });
      });
      socket.on("candidate", (id, candidate) => {
        peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
      });
      socket.on("disconnectPeer", (id) => {
        peerConnections[id].close();
        delete peerConnections[id];
      });
    });
  }, []);
  return <div>Test</div>;
}

export default App;
