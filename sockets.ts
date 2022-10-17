import {
  JoinData,
  MessageData,
  NewIceCandidateData,
  SocketConnection,
  SocketRequest,
  VideoAnswerData,
  VideoOfferData,
} from "./types";

const channels: Record<string, number> = {};
const connections: Record<string, Record<number, SocketConnection>> = {};

const openConnection = (request: SocketRequest) => {
  const connection: SocketConnection = request.accept("json", request.origin);
  let channelName: string;
  let clientId: number;
  let peerConnections: Record<number, SocketConnection>;

  const getPeer = (peerId: number) => {
    for (const clientId in peerConnections) {
      if (parseInt(clientId) == peerId) {
        return peerConnections[peerId];
      }
    }

    return null;
  };

  const sendToClient = (socket: SocketConnection, message: MessageData) => {
    socket.sendUTF(JSON.stringify(message));
  };

  sendToClient(connection, { type: "handshake" });

  const handleJoin = (decoded: JoinData) => {
    channelName = decoded.channelName;

    if (!channels[channelName]) {
      channels[channelName] = 0;
    }

    channels[channelName]++;

    clientId = channels[channelName];

    if (!connections[channelName]) {
      connections[channelName] = {};
    }

    peerConnections = connections[channelName];

    peerConnections[clientId] = connection;

    sendToClient(connection, {
      type: "welcome",
      clientId,
      clientIds: Object.keys(peerConnections).map(parseInt),
    });
  };

  const forwardToClient = (recipientId: number, data: MessageData) => {
    const peer = getPeer(recipientId) as SocketConnection;
    sendToClient(peer, data);
  };

  const handleVideoOffer = (data: VideoOfferData) => {
    forwardToClient(data.recipientId, data);
  };

  const handleVideoAnswer = (data: VideoAnswerData) => {
    forwardToClient(data.recipientId, data);
  };

  const handleNewIceCandidate = (data: NewIceCandidateData) => {
    forwardToClient(data.recipientId, data);
  };

  const handleUtf8Data = (utf8Data: string) => {
    const decoded: MessageData = JSON.parse(utf8Data);

    console.log(`[${channelName}][${clientId}] Received: ${utf8Data}`);

    if (decoded.type == "join") {
      handleJoin(decoded);
    }

    if (decoded.type == "video-offer") {
      handleVideoOffer(decoded);
    }

    if (decoded.type == "video-answer") {
      handleVideoAnswer(decoded);
    }

    if (decoded.type == "new-ice-candidate") {
      handleNewIceCandidate(decoded);
    }
  };

  connection.on("message", (message) => {
    switch (message.type) {
      case "utf8":
        handleUtf8Data(message.utf8Data);
    }
  });

  connection.on("close", () => {
    let departedClientId;

    for (const clientId in peerConnections) {
      if (peerConnections[clientId] == connection) {
        departedClientId = clientId;
        delete peerConnections[clientId];
      }
    }

    for (const clientId in peerConnections) {
      sendToClient(peerConnections[clientId], {
        type: "close",
        clientId: parseInt(departedClientId as string),
      });
    }
  });
};

export { openConnection };
