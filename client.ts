import adapter from "webrtc-adapter";
import { CloseData, MessageData, VideoOfferData, WelcomeData } from "./types";

function getElementById<T>(id: string): T {
  return document.getElementById(id) as T;
}

const go = () => {
  const channelName = getElementById<HTMLInputElement>("channel-name").value;

  location.href = `/channels/${channelName}`;
};

const sendToServer = (connection: WebSocket, message: MessageData) => {
  connection.send(JSON.stringify(message));
};

const connect = async () => {
  const channelName = window.location.pathname.replace(/^.*\//, "");

  const connections: { [key: number]: RTCPeerConnection } = {};

  const webcamStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });

  getElementById<HTMLVideoElement>("local_video").srcObject = webcamStream;

  const serverUrl = window.location.origin.replace("http", "ws");
  const connection = new WebSocket(serverUrl, "json");

  const getNewConnection = (localId: number, remoteId: number) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.ontrack = (event) => {
      if (event.track.kind != "video") return;

      const newVideo: HTMLVideoElement = document.createElement("video");
      newVideo.autoplay = true;
      newVideo.srcObject = event.streams[0];
      newVideo.id = `client_${remoteId}`;

      getElementById<HTMLDivElement>("remotes").appendChild(newVideo);
    };

    peerConnection.onicecandidate = (event) => {
      sendToServer(connection, {
        type: "new-ice-candidate",
        candidate: event.candidate as RTCIceCandidate,
        localId,
        remoteId,
      });
    };
    webcamStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, webcamStream);
    });

    return peerConnection;
  };

  const sendOffer = async (
    offeringClientId: number,
    answeringClientId: number
  ) => {
    const peerConnection = getNewConnection(
      offeringClientId,
      answeringClientId
    );
    await peerConnection.setLocalDescription(
      await peerConnection.createOffer()
    );
    connections[answeringClientId] = peerConnection;

    sendToServer(connection, {
      type: "video-offer",
      sdp: peerConnection.localDescription as RTCSessionDescription,
      offeringClientId,
      answeringClientId,
    });
  };

  const handleWelcome = async (message: WelcomeData) => {
    const promises = message.clientIds
      .filter((clientId: number) => clientId != message.clientId)
      .map((clientId: number) => sendOffer(message.clientId, clientId));
    await Promise.all(promises);
  };

  const handleClose = (message: CloseData) => {
    const peerConnection = connections[message.clientId];
    peerConnection.close();
    delete connections[message.clientId];
    getElementById<HTMLVideoElement>(`client_${message.clientId}`).remove();
  };

  const handleVideoOffer = async (message: VideoOfferData) => {
    const peerConnection = getNewConnection(
      message.answeringClientId,
      message.offeringClientId
    );
    connections[message.offeringClientId] = peerConnection;
    const rtcSessionDescription = new RTCSessionDescription(message.sdp);
    await peerConnection.setRemoteDescription(rtcSessionDescription);
    await peerConnection.setLocalDescription(
      await peerConnection.createAnswer()
    );

    sendToServer(connection, {
      type: "video-answer",
      sdp: peerConnection.localDescription as RTCSessionDescription,
      offeringClientId: message.offeringClientId,
      answeringClientId: message.answeringClientId,
    });
  };

  connection.onmessage = async (event) => {
    const message: MessageData = JSON.parse(event.data);

    console.log("Received message: ", message);

    switch (message.type) {
      case "welcome":
        await handleWelcome(message);
        break;
      case "close":
        handleClose(message);
        break;
      case "video-offer":
        await handleVideoOffer(message);
        break;
      case "video-answer":
        const peerConnection = connections[message.answeringClientId];
        const rtcSessionDescription = new RTCSessionDescription(message.sdp);
        await peerConnection.setRemoteDescription(rtcSessionDescription);
        break;
      case "new-ice-candidate":
        if (message.candidate) {
          const peerConnection = connections[message.localId];
          await peerConnection.addIceCandidate(message.candidate);
        }
      case "handshake":
        sendToServer(connection, {
          type: "join",
          channelName,
        });
    }
  };
};

export { connect, go };
