import http from "http";
import express from "express";
import { connection as Connection, server as WebSocketServer } from "websocket";

let webServer: http.Server;
const connections: Record<string, Record<number, Connection>> = {};

const app = express();

webServer = http.createServer({}, app);

let nextClientId = 1;

const channels: Record<string, number> = {};

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});
app.get("/channels/:name", function (req, res) {
  res.sendFile(__dirname + "/chat.html");
});
app.use(express.static("dist"));
const PORT = process.env.PORT || 3000;
webServer.listen(PORT, function () {
  console.log(`Server is listening on port ${PORT}`);
});

const wsServer = new WebSocketServer({
  httpServer: webServer,
  autoAcceptConnections: false,
});

wsServer.on("request", (request) => {
  const connection: Connection = request.accept("json", request.origin);
  let channelName: string;
  let clientId: number;
  let peerConnections: Record<number, Connection>;

  connection.sendUTF(
    JSON.stringify({
      type: "handshake",
    })
  );

  connection.on("message", (message: any) => {
    const decoded = JSON.parse(message.utf8Data);

    console.log(
      `[${channelName}][${clientId}] Received: ${JSON.stringify(decoded)}`
    );

    if (decoded.type == "join") {
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

      connection.sendUTF(
        JSON.stringify({
          type: "welcome",
          clientId,
          clientIds: Object.keys(peerConnections),
        })
      );
    }

    if (decoded.type == "video-offer") {
      for (const clientId in peerConnections) {
        if (clientId == decoded.answeringClientId) {
          peerConnections[clientId].sendUTF(
            JSON.stringify({
              type: "video-offer",
              sdp: decoded.sdp,
              offeringClientId: decoded.offeringClientId,
              answeringClientId: decoded.answeringClientId,
            })
          );
        }
      }
    }

    if (decoded.type == "video-answer") {
      for (const clientId in peerConnections) {
        if (clientId == decoded.offeringClientId) {
          peerConnections[clientId].sendUTF(
            JSON.stringify({
              type: "video-answer",
              sdp: decoded.sdp,
              offeringClientId: decoded.offeringClientId,
              answeringClientId: decoded.answeringClientId,
            })
          );
        }
      }
    }

    if (decoded.type == "new-ice-candidate") {
      for (const clientId in peerConnections) {
        if (clientId == decoded.remoteId) {
          peerConnections[clientId].sendUTF(
            JSON.stringify({
              type: "new-ice-candidate",
              candidate: decoded.candidate,
              remoteId: decoded.remoteId,
              localId: decoded.localId,
            })
          );
        }
      }
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
      peerConnections[clientId].sendUTF(
        JSON.stringify({
          type: "close",
          clientId: departedClientId,
        })
      );
    }
  });
});
