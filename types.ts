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

export interface CloseData {
  type: "close";
  clientId: number;
}

export interface WelcomeData {
  type: "welcome";
  clientId: number;
  clientIds: number[];
}

export interface HandshakeData {
  type: "handshake";
}

export type MessageData =
  | HandshakeData
  | WelcomeData
  | CloseData
  | JoinData
  | VideoOfferData
  | VideoAnswerData
  | NewIceCandidateData;
