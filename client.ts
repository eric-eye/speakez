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

const start = async () => {
  if (window.location.pathname === "" || window.location.pathname === "/") {
    getElementById<HTMLDivElement>("home").removeAttribute("hidden");
    getElementById<HTMLDivElement>("chat").setAttribute("hidden", "");
    getElementById<HTMLButtonElement>("go").addEventListener("click", go);
  } else if (window.location.pathname.match("^/channels/")) {
    getElementById<HTMLDivElement>("home").setAttribute("hidden", "");
    getElementById<HTMLDivElement>("chat").removeAttribute("hidden");
    await connect();
  }
};

const go = async () => {
  const channelName =
    getElementById<HTMLInputElement>("channel-name-input").value;
  history.pushState({}, "", `/channels/${channelName}`);
  getElementById<HTMLDivElement>("home").setAttribute("hidden", "");
  getElementById<HTMLDivElement>("chat").removeAttribute("hidden");

  await connect();
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

  getElementById<HTMLSpanElement>("channel-name-display").innerText =
    channelName;
  getElementById<HTMLVideoElement>("local_video").srcObject = webcamStream;
  getElementById<HTMLButtonElement>("channel-copy").addEventListener(
    "click",
    async () => {
      await navigator.clipboard.writeText(window.location.toString());
    }
  );

  let muted = false;
  let videoTurnedOff = false;

  const muteButton = getElementById<HTMLButtonElement>("mute-button");
  const videoButton = getElementById<HTMLButtonElement>("video-button");

  videoButton.addEventListener("click", () => {
    const yourVideoIsOff =
      getElementById<HTMLButtonElement>("your-video-is-off");

    if (!videoTurnedOff) {
      webcamStream.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      videoTurnedOff = !videoTurnedOff;
      yourVideoIsOff.classList.remove("hidden");
      videoButton.innerText = "Turn video on";
    } else {
      webcamStream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      videoTurnedOff = !videoTurnedOff;
      yourVideoIsOff.classList.add("hidden");
      videoButton.innerText = "Turn video off";
    }
  });

  muteButton.addEventListener("click", () => {
    const youAreMuted = getElementById<HTMLButtonElement>("you-are-muted");

    if (!muted) {
      webcamStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      muted = !muted;
      youAreMuted.classList.remove("hidden");
      muteButton.innerText = "Unmute";
    } else {
      webcamStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      muted = !muted;
      youAreMuted.classList.add("hidden");
      muteButton.innerText = "Mute";
    }
  });

  const serverUrl = window.location.origin.replace("http", "ws");
  const connection = new WebSocket(serverUrl, "json");

  const getNewConnection = (localId: number, remoteId: number) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.ontrack = (event) => {
      if (event.track.kind != "video") return;

      const waiting = document.getElementById("waiting") as HTMLDivElement;
      waiting.classList.add("hidden");

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
    if (message.clientIds.length == 1) {
      const waiting = document.getElementById("waiting") as HTMLDivElement;
      waiting.classList.remove("hidden");
    }

    const promises = message.clientIds
      .filter((clientId: number) => clientId != message.clientId)
      .map((clientId: number) => sendOffer(message.clientId, clientId));
    await Promise.all(promises);
  };

  const handleMaxOccupancy = () => {
    const errorMessage: HTMLDivElement = document.getElementById(
      "error"
    ) as HTMLDivElement;
    errorMessage.classList.remove("hidden");
    errorMessage.innerText =
      "This room already has the maximum number of occupants.";
  };

  const handleClose = (message: CloseData) => {
    const peerConnection = connections[message.clientId];
    peerConnection.close();
    delete connections[message.clientId];
    getElementById<HTMLVideoElement>(`client_${message.clientId}`).remove();

    if (Object.keys(connections).length < 1) {
      const waiting = document.getElementById("waiting") as HTMLDivElement;
      waiting.classList.remove("hidden");
    }
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
      case "max-occupancy":
        handleMaxOccupancy();
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
export { start };
