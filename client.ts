import adapter from 'webrtc-adapter';

const connect = async () => {
  const connections: {[key: number]: RTCPeerConnection} = {};

  const webcamStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });

  (document.getElementById("local_video") as HTMLVideoElement).srcObject = webcamStream;

  const serverUrl = window.location.origin.replace("http", "ws");
  const connection = new WebSocket(serverUrl, "json");

  const getNewConnection = (localId: number, remoteId: number) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {urls: "stun:stun.l.google.com:19302"}
      ]
    });

    peerConnection.ontrack = (event) => {
      if (event.track.kind != "video") return;

      const newVideo: HTMLVideoElement = document.createElement("video");
      newVideo.autoplay = true;
      newVideo.srcObject = event.streams[0];
      newVideo.id = `client_${remoteId}`;

      (document.getElementById("remotes") as HTMLDivElement).appendChild(newVideo);
    }

    peerConnection.onicecandidate = (event) => {
      connection.send(JSON.stringify({
        type: "new-ice-candidate",
        candidate: event.candidate,
        localId,
        remoteId,
      }))
    }
    webcamStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, webcamStream);
    })

    return peerConnection;
  }

  connection.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    const sendOffer = async (peerClientId: number) => {
      const peerConnection = getNewConnection(message.clientId, peerClientId);
      await peerConnection.setLocalDescription(await peerConnection.createOffer());
      connections[peerClientId] = peerConnection;

      connection.send(JSON.stringify({
        type: "video-offer",
        sdp: peerConnection.localDescription,
        offeringClientId: message.clientId,
        answeringClientId: peerClientId,
      }))
    }

    if (message.type == "id") {
      const promises = message.clientIds.filter((clientId: number) => clientId != message.clientId).map((clientId: number) => sendOffer(clientId));
      await Promise.all(promises);
    }

    if (message.type == "close") {
      const peerConnection = connections[message.clientId];
      peerConnection.close();
      delete connections[message.clientId];
      (document.getElementById(`client_${message.clientId}`) as HTMLVideoElement).remove();
    }

    if (message.type == "video-offer") {
      const peerConnection = getNewConnection(message.answeringClientId, message.offeringClientId);
      connections[message.offeringClientId] = peerConnection;
      const rtcSessionDescription = new RTCSessionDescription(message.sdp);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
      await peerConnection.setLocalDescription(await peerConnection.createAnswer());

      connection.send(JSON.stringify({
        type: "video-answer",
        sdp: peerConnection.localDescription,
        offeringClientId: message.offeringClientId,
        answeringClientId: message.answeringClientId,
      }))
    }

    if (message.type == "video-answer") {
      const peerConnection = connections[message.answeringClientId];
      const rtcSessionDescription = new RTCSessionDescription(message.sdp);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }

    if (message.type == "new-ice-candidate") {
      if (message.candidate) {
        console.log(connections);
        console.log(message.localId);
        const peerConnection = connections[message.localId];
        await peerConnection.addIceCandidate(message.candidate);
      }
    }
  }
}

export {connect};
