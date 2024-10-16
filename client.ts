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

const hide = (element: HTMLElement) => {
  element.setAttribute("hidden", "");
};

const show = (element: HTMLElement) => {
  element.removeAttribute("hidden");
};

const start = async () => {
  const homeView = getElementById<HTMLDivElement>("home");
  const roomView = getElementById<HTMLDivElement>("room");

  const connect = async (roomName: string) => {
    const connections: { [key: number]: RTCPeerConnection } = {};

    const webcamStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    getElementById<HTMLVideoElement>("local_video").srcObject = webcamStream;
    getElementById<HTMLButtonElement>("room-copy").addEventListener(
      "click",
      async () => {
        await navigator.clipboard.writeText(window.location.toString());
      }
    );

    let muted = false;
    let videoTurnedOff = false;

    const muteButton = getElementById<HTMLButtonElement>("mute-button");
    const videoButton = getElementById<HTMLButtonElement>("video-button");
    const yourVideoIsOff =
      getElementById<HTMLButtonElement>("your-video-is-off");
    const youAreMuted = getElementById<HTMLButtonElement>("you-are-muted");
    const turnOnMicrophone =
      getElementById<HTMLSpanElement>("turn-on-microphone");
    const turnOnCamera = getElementById<HTMLSpanElement>("turn-on-camera");

    const toggleVideo = () => {
      videoTurnedOff = !videoTurnedOff;

      webcamStream.getVideoTracks().forEach((track) => {
        track.enabled = !videoTurnedOff;
      });

      videoButton.innerText = videoTurnedOff ? "Cam ⛔" : "Cam ✅";

      if (videoTurnedOff) {
        show(yourVideoIsOff);
      } else {
        hide(yourVideoIsOff);
      }
    };

    const toggleMicrophone = () => {
      muted = !muted;

      webcamStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      muteButton.innerText = muted ? "Mic ⛔" : "Mic ✅";

      if (muted) {
        show(youAreMuted);
      } else {
        hide(youAreMuted);
      }
    };

    turnOnMicrophone.addEventListener("click", toggleMicrophone);
    turnOnCamera.addEventListener("click", toggleVideo);
    muteButton.addEventListener("click", toggleMicrophone);
    videoButton.addEventListener("click", toggleVideo);

    const serverUrl = window.location.origin.replace("http", "ws");
    const connection = new WebSocket(serverUrl, "json");

    const getNewConnection = (localId: number, remoteId: number) => {
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerConnection.ontrack = (event) => {
        if (event.track.kind != "video") return;

        const waiting = getElementById<HTMLDivElement>("waiting");
        hide(waiting);

        const newDiv: HTMLDivElement = document.createElement("div");
        const newVideo: HTMLVideoElement = document.createElement("video");
        newVideo.autoplay = true;
        newVideo.srcObject = event.streams[0];
        newVideo.classList.add("m-auto");
        newVideo.classList.add("w-full");
        newVideo.classList.add("h-full");
        newVideo.classList.add("drop-shadow-[2px_2px_5px_rgba(0,0,0,1)]");
        newDiv.id = `client_${remoteId}`;
        newDiv.appendChild(newVideo);
        newDiv.classList.add("m-auto");
        newDiv.classList.add("w-[80vw]");
        newDiv.classList.add("h-[80vh]");

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

    const waiting = getElementById<HTMLDivElement>("waiting");

    const handleWelcome = async (message: WelcomeData) => {
      if (message.clientIds.length == 1) {
        show(waiting);
      }

      const promises = message.clientIds
        .filter((clientId: number) => clientId != message.clientId)
        .map((clientId: number) => sendOffer(message.clientId, clientId));
      await Promise.all(promises);
    };

    const handleMaxOccupancy = () => {
      const errorMessage = getElementById<HTMLDivElement>("error");
      show(errorMessage);
      errorMessage.innerText =
        "This room already has the maximum number of occupants.";
    };

    const handleClose = (message: CloseData) => {
      const peerConnection = connections[message.clientId];
      peerConnection.close();
      delete connections[message.clientId];
      getElementById<HTMLVideoElement>(`client_${message.clientId}`).remove();

      if (Object.keys(connections).length < 1) {
        show(waiting);
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
        channelName: roomName,
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

  const renderHome = () => {
    show(homeView);
    hide(roomView);
  };

  const renderRoom = async (roomName: string) => {
    hide(homeView);
    show(roomView);
    getElementById<HTMLSpanElement>("room-name-display").innerText = roomName;
    await connect(roomName);
  };

  if (window.location.pathname === "" || window.location.pathname === "/") {
    renderHome();
    getElementById<HTMLButtonElement>("go").addEventListener("click", () => {
      const roomName = getElementById<HTMLInputElement>("room-name-input").value;
      history.pushState({}, "", `/${roomName}`);
      renderRoom(roomName);
    });
  } else {
    const roomName = window.location.pathname.replace(/^\//, "");
    await renderRoom(roomName);
  }

  const sendToServer = (connection: WebSocket, message: MessageData) => {
    console.log("Sent message: ", message);
    connection.send(JSON.stringify(message));
  };
};

export { start };
