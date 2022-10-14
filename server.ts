import http from "http";
import express from "express";
import { connection as Connection, server as WebSocketServer } from "websocket";

let webServer: http.Server;
const connections: { [clientId: number]: Connection } = {};

const app = express();

webServer = http.createServer({}, app);

let nextClientId = 1;

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

  connections[nextClientId] = connection;

  connection.sendUTF(
    JSON.stringify({
      type: "id",
      clientId: nextClientId,
      clientIds: Object.keys(connections),
    })
  );

  nextClientId++;

  connection.on("message", (message: any) => {
    const decoded = JSON.parse(message.utf8Data);

    if (decoded.type == "video-offer") {
      for (const clientId in connections) {
        if (clientId == decoded.answeringClientId) {
          connections[clientId].sendUTF(
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
      for (const clientId in connections) {
        if (clientId == decoded.offeringClientId) {
          connections[clientId].sendUTF(
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
      for (const clientId in connections) {
        if (clientId == decoded.remoteId) {
          connections[clientId].sendUTF(
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

    for (const clientId in connections) {
      if (connections[clientId] == connection) {
        departedClientId = clientId;
        delete connections[clientId];
      }
    }

    for (const clientId in connections) {
      connections[clientId].sendUTF(
        JSON.stringify({
          type: "close",
          clientId: departedClientId,
        })
      );
    }
  });
});
