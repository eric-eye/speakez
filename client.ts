import adapter from "webrtc-adapter";
import {
  CloseData,
  MessageData,
  NewIceCandidateData,
  VideoAnswerData,
  VideoOfferData,
  WelcomeData,
} from "./types";

function getElementById<T>(id: string): T {
  return document.getElementById(id) as T;
}

const go = () => {
  const channelName = getElementById<HTMLInputElement>("channel-name").value;

  location.href = `/channels/${channelName}`;
};

const sendToServer = (connection: WebSocket, message: MessageData) => {
  console.log("Sent message: ", message);
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

      const newDiv: HTMLDivElement = document.createElement("div");
      const newVideo: HTMLVideoElement = document.createElement("video");
      newVideo.autoplay = true;
      newVideo.srcObject = event.streams[0];
      newVideo.classList.add("m-auto");
      newDiv.id = `client_${remoteId}`;
      newDiv.classList.add("basis-1/6");
      newDiv.classList.add("grow");
      newDiv.appendChild(newVideo);

      getElementById<HTMLDivElement>("remotes").appendChild(newDiv);
    };

    peerConnection.onicecandidate = (event) => {
      sendToServer(connection, {
        type: "new-ice-candidate",
        candidate: event.candidate as RTCIceCandidate,
        senderId: localId,
        recipientId: remoteId,
      });
    };
    webcamStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, webcamStream);
    });

    return peerConnection;
  };

  const sendOffer = async (senderId: number, recipientId: number) => {
    const peerConnection = getNewConnection(senderId, recipientId);
    await peerConnection.setLocalDescription(
      await peerConnection.createOffer()
    );
    connections[recipientId] = peerConnection;

    sendToServer(connection, {
      type: "video-offer",
      sdp: peerConnection.localDescription as RTCSessionDescription,
      senderId,
      recipientId,
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
      message.recipientId,
      message.senderId
    );
    connections[message.senderId] = peerConnection;
    const rtcSessionDescription = new RTCSessionDescription(message.sdp);
    await peerConnection.setRemoteDescription(rtcSessionDescription);
    await peerConnection.setLocalDescription(
      await peerConnection.createAnswer()
    );

    sendToServer(connection, {
      type: "video-answer",
      sdp: peerConnection.localDescription as RTCSessionDescription,
      recipientId: message.senderId,
      senderId: message.recipientId,
    });
  };

  const handleVideoAnswer = async (message: VideoAnswerData) => {
    const peerConnection = connections[message.senderId];
    const rtcSessionDescription = new RTCSessionDescription(message.sdp);
    await peerConnection.setRemoteDescription(rtcSessionDescription);
  };

  const handleNewIceCandidate = async (message: NewIceCandidateData) => {
    if (message.candidate) {
      const peerConnection = connections[message.senderId];
      await peerConnection.addIceCandidate(message.candidate);
    }
  };

  const handleHandshake = () => {
    sendToServer(connection, {
      type: "join",
      channelName,
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
        await handleVideoAnswer(message);
        break;
      case "new-ice-candidate":
        await handleNewIceCandidate(message);
        break;
      case "handshake":
        handleHandshake();
        break;
    }
  };
};

export { connect, go };
