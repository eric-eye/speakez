import http from "http";
import express from "express";
import { server as WebSocketServer } from "websocket";
import { openConnection } from "./sockets";

let webServer: http.Server;

const app = express();

webServer = http.createServer({}, app);

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

wsServer.on("request", openConnection);
