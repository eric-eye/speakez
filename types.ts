export {
  request as SocketRequest,
  connection as SocketConnection,
} from "websocket";

export interface JoinData {
  type: "join";
  channelName: string;
}

export interface VideoOfferData {
  type: "video-offer";
  sdp: RTCSessionDescription;
  offeringClientId: number;
  answeringClientId: number;
}

export interface VideoAnswerData {
  type: "video-answer";
  sdp: RTCSessionDescription;
  offeringClientId: number;
  answeringClientId: number;
}

export interface NewIceCandidateData {
  type: "new-ice-candidate";
  candidate: RTCIceCandidate;
  localId: number;
  remoteId: number;
}
