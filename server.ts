import http from "http";
import express from "express";
import { server as WebSocketServer } from "websocket";
import { openConnection } from "./sockets";
import randomWords from "random-words";

let webServer: http.Server;

const app = express();

app.set("view engine", "ejs");

webServer = http.createServer({}, app);

app.set("trust proxy", true);

app.use(function (request, response, next) {
  if (process.env.NODE_ENV != "development" && !request.secure) {
    return response.redirect("https://" + request.headers.host + request.url);
  }

  next();
});
app.use(express.static("dist"));
app.get("/", function (req, res) {
  res.render("index", {
    roomName: randomWords({ exactly: 4, join: "-", maxLength: 8 }),
  });
});
app.get("/:name", function (req, res) {
  res.render("index", {
    roomName: "",
  });
});
const PORT = process.env.PORT || 3000;
webServer.listen(PORT, function () {
  console.log(`Server is listening on port ${PORT}`);
});

const wsServer = new WebSocketServer({
  httpServer: webServer,
  autoAcceptConnections: false,
});

wsServer.on("request", openConnection);
