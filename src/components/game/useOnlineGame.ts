import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameState } from "./types";
import { freshState, BOMBS, CELLS } from "./types";

type Role = "host" | "guest";

interface OnlineGameReturn {
  role: Role | null;
  roomId: string | null;
  connected: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  gameState: GameState;
  sendMove: (action: string, payload: any) => void;
  createRoom: () => void;
  joining: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function useOnlineGame(): OnlineGameReturn {
  const [role, setRole] = useState<Role | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [gameState, setGameState] = useState<GameState>(freshState());
  const [joining, setJoining] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const roleRef = useRef<Role | null>(null);

  // Get local camera
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      setLocalStream(stream);
      return stream;
    } catch {
      return null;
    }
  }, []);

  const setupPeerConnection = useCallback((stream: MediaStream | null) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setConnected(true);
      }
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        setConnected(false);
      }
    };

    // Data channel for game state
    if (roleRef.current === "host") {
      const dc = pc.createDataChannel("game");
      dc.onopen = () => setConnected(true);
      dc.onmessage = (e) => handleDataMessage(e.data);
      dataChannelRef.current = dc;
    } else {
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dc.onopen = () => setConnected(true);
        dc.onmessage = (ev) => handleDataMessage(ev.data);
        dataChannelRef.current = dc;
      };
    }

    return pc;
  }, []);

  const handleDataMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "state") {
        setGameState(msg.state);
      }
    } catch {}
  }, []);

  const sendMove = useCallback((action: string, payload: any) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify({ type: "move", action, payload }));
    }
  }, []);

  const createRoom = useCallback(async () => {
    const id = generateRoomId();
    setRoomId(id);
    setRole("host");
    roleRef.current = "host";

    const stream = await getLocalStream();
    const pc = setupPeerConnection(stream);

    // Subscribe to signaling channel
    const channel = supabase.channel(`room-${id}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }: any) => {
      const msg = payload;

      if (msg.type === "answer" && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      }

      if (msg.type === "ice-candidate" && msg.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {}
      }

      if (msg.type === "join") {
        // Guest joined, create offer
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            channel.send({
              type: "broadcast",
              event: "signal",
              payload: { type: "ice-candidate", candidate: e.candidate.toJSON(), from: "host" },
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "offer", sdp: { type: offer.type, sdp: offer.sdp } },
        });
      }
    });

    await channel.subscribe();
    channelRef.current = channel;
  }, [getLocalStream, setupPeerConnection]);

  // Check URL for room param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setRoomId(room);
      setRole("guest");
      roleRef.current = "guest";
      setJoining(true);

      (async () => {
        const stream = await getLocalStream();
        const pc = setupPeerConnection(stream);

        const channel = supabase.channel(`room-${room}`, {
          config: { broadcast: { self: false } },
        });

        channel.on("broadcast", { event: "signal" }, async ({ payload }: any) => {
          const msg = payload;

          if (msg.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            pc.onicecandidate = (e) => {
              if (e.candidate) {
                channel.send({
                  type: "broadcast",
                  event: "signal",
                  payload: { type: "ice-candidate", candidate: e.candidate.toJSON(), from: "guest" },
                });
              }
            };
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: "broadcast",
              event: "signal",
              payload: { type: "answer", sdp: { type: answer.type, sdp: answer.sdp } },
            });
          }

          if (msg.type === "ice-candidate" && msg.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch {}
          }
        });

        await channel.subscribe();
        channelRef.current = channel;

        // Tell host we joined
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "join" },
        });

        setJoining(false);
      })();
    }

    return () => {
      pcRef.current?.close();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [getLocalStream, setupPeerConnection]);

  return {
    role,
    roomId,
    connected,
    remoteStream,
    localStream,
    gameState,
    sendMove,
    createRoom,
    joining,
  };
}
