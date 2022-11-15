import "./App.css";
import React, { useEffect, useState, useRef } from "react";
import { ThemeProvider } from "theme-ui";
import { Box, Text, Flex, Button } from "rebass";
import { Label, Input, Checkbox } from "@rebass/forms";
import * as Ably from "ably/promises";
import QRCode from "react-qr-code";
import theme from "./theme";

const RTC_CONFIG = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};
const BASE_URL = window.location.origin;
const API_URL = "https://sc.sshh.io";

const genRandomID = () => {
  const vocab = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  for (var i = 0; i < 6; i++) {
    result += vocab.charAt(Math.floor(Math.random() * vocab.length));
  }
  return result;
};

function App() {
  let [ably, setAbly] = useState(null);
  useEffect(() => {
    const clientId = genRandomID();
    const ably = new Ably.Realtime.Promise({
      authUrl: `${API_URL}/api/token-request?clientId=${clientId}`,
    });
    setAbly(ably);
  }, []);
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
        <Page ably={ably} />
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
  const [channelId, setChannelId] = useState(null);
  useEffect(() => {
    setChannelId(genRandomID());
  }, []);
  const shareStreamOpts = {
    mediaOpts: {
      video: {
        cursor: showCursor ? "always" : "never",
      },
      audio: captureAudio,
    },
    streamOpts: {
      channelId: channelId,
    },
  };
  return (
    <Box mt={60}>
      {!(showViewSettings || showShareSettings) && (
        <div>
          <Button
            bg={"#33e"}
            sx={{ cursor: "pointer" }}
            onClick={() => setShowShareSettings(true)}
          >
            Share Screen
          </Button>
          <br />
          <Button
            bg={"#a0c"}
            sx={{ cursor: "pointer" }}
            onClick={() => setShowViewSettings(true)}
            mt={30}
          >
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

function Watch({ ably }) {
  const [winSize, setWinSize] = useState([
    window.innerWidth,
    window.innerHeight,
  ]);
  const [playing, setPlaying] = useState(false);
  const videoElem = useRef(null);
  useEffect(() => {
    let startWatching = async () => {
      if (!ably) {
        return;
      }
      const watchId = genRandomID();
      const channelID = window.location.pathname.split("/")[2];
      const channel = ably.channels.get(`channel:${channelID}`);
      channel.publish("watch", { watchId: watchId });
      let peerConnection;
      channel.subscribe("rtc:candidate", ({ data }) => {
        if (data.watchId !== watchId) {
          return;
        }
        peerConnection
          .addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch((e) => console.error(e));
      });
      channel.subscribe("rtc:offer", ({ data }) => {
        if (data.watchId !== watchId) {
          return;
        }
        peerConnection = new RTCPeerConnection(RTC_CONFIG);
        peerConnection
          .setRemoteDescription(data.offer)
          .then(() => peerConnection.createAnswer())
          .then((sdp) => peerConnection.setLocalDescription(sdp))
          .then(() => {
            channel.publish("rtc:answer", {
              watchId: watchId,
              answer: peerConnection.localDescription,
            });
          });
        peerConnection.ontrack = (event) => {
          const mediaStream = event.streams[0];
          setPlaying(true);
          videoElem.current.srcObject = mediaStream;
          setTimeout(() => videoElem.current.play(), 1000);
        };
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            channel.publish("rtc:candidate2", {
              watchId: watchId,
              candidate: event.candidate,
            });
          }
        };
      });
      channel.subscribe("exit", () => {
        window.location.href = "/";
      });
    };
    startWatching();
    const onWinResize = () => {
      setWinSize([window.innerWidth, window.innerHeight]);
    };
    window.addEventListener("resize", onWinResize);
  }, [ably]);
  return (
    <div>
      <video
        controls
        ref={videoElem}
        style={{
          maxWidth: winSize[0] + "px",
          maxHeight: winSize[1] + "px",
          display: playing ? "block" : "none",
        }}
        playsInline
        autoPlay
      ></video>
      {!playing && (
        <Text fontSize={"1.5em"} mt={20}>
          Waiting for stream...
        </Text>
      )}
    </div>
  );
}

function Broadcast({ ably }) {
  const [channel, setChannel] = useState(null);
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
    if (!ably) {
      return;
    }
    const { mediaOpts, streamOpts } = JSON.parse(
      decodeURIComponent(window.location.search.replace("?o=", ""))
    );
    setChannel(streamOpts.channelId);
    startStream(mediaOpts).then((stream) => {
      const channel = ably.channels.get(`channel:${streamOpts.channelId}`);
      const peerConnections = {};
      channel.subscribe("watch", ({ data }) => {
        const peerConnection = new RTCPeerConnection(RTC_CONFIG);
        peerConnections[data.watchId] = peerConnection;
        stream
          .getTracks()
          .forEach((track) => peerConnection.addTrack(track, stream));
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            channel.publish("rtc:candidate", {
              watchId: data.watchId,
              candidate: event.candidate,
            });
          }
        };
        peerConnection
          .createOffer()
          .then((sdp) => peerConnection.setLocalDescription(sdp))
          .then(() => {
            channel.publish("rtc:offer", {
              watchId: data.watchId,
              offer: peerConnection.localDescription,
            });
          });
      });
      channel.subscribe("rtc:answer", ({ data }) => {
        peerConnections[data.watchId].setRemoteDescription(data.answer);
      });
      channel.subscribe("rtc:candidate2", ({ data }) => {
        peerConnections[data.watchId].addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      });
      window.runOnExit = () => {
        channel.publish("exit", {});
        channel.detach();
      };
    });
  }, [ably]);
  return (
    <div>
      {channel && (
        <Box mt={25}>
          <Text fontWeight={600} fontSize={"2em"} letterSpacing={"0.6rem"}>
            {channel}
          </Text>
          <Box mt={25} textAlign={"center"}>
            <Input
              value={BASE_URL + "/watch/" + channel}
              id="channel-link"
              name="channel-link"
              type="text"
              maxWidth={"300px"}
              margin={"auto"}
              onClick={(evt) => {
                evt.target.select();
                document.execCommand("copy");
              }}
            />
          </Box>
          <Box m={20}>
            <QRCode value={BASE_URL + "/watch/" + channel} />
          </Box>
          <Button
            bg={"#ef0f0f"}
            mt={20}
            onClick={() => {
              window.runOnExit();
              setTimeout(() => (window.location.href = "/"), 100);
            }}
          >
            STOP
          </Button>
        </Box>
      )}
    </div>
  );
}

export default App;
