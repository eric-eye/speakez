export {
  request as SocketRequest,
  connection as SocketConnection,
} from "websocket";

export interface JoinData {
  type: "join";
  channelName: string;
}

export interface PeerToPeer {
  senderId: number;
  recipientId: number;
}

export interface VideoOfferData extends PeerToPeer {
  type: "video-offer";
  sdp: RTCSessionDescription;
}

export interface VideoAnswerData extends PeerToPeer {
  type: "video-answer";
  sdp: RTCSessionDescription;
}

export interface NewIceCandidateData extends PeerToPeer {
  type: "new-ice-candidate";
  candidate: RTCIceCandidate;
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
