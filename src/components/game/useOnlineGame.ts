import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameState } from "./types";
import { freshState } from "./types";

type Role = "host" | "guest";
type MoveListener = (action: string, payload: any) => void;

interface OnlineGameReturn {
  role: Role | null;
  roomId: string | null;
  connected: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  sendMove: (action: string, payload: any) => void;
  onMove: ((listener: MoveListener) => () => void) | null;
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
  const [joining, setJoining] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const roleRef = useRef<Role | null>(null);
  const listenersRef = useRef<Set<MoveListener>>(new Set());
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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

  const handleDataMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "move") {
        listenersRef.current.forEach((fn) => fn(msg.action, msg.payload));
      }
    } catch {}
  }, []);

  const waitForChannelSubscription = useCallback((channel: any) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Channel subscription timed out"));
      }, 10000);

      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timeout);
          resolve();
        }

        if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
          window.clearTimeout(timeout);
          reject(new Error(`Channel subscription failed: ${status}`));
        }
      });
    });
  }, []);

  const flushPendingIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    }
  }, []);

  const addOrQueueIceCandidate = useCallback(
    async (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
      if (!pc.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    },
    []
  );

  const setupPeerConnection = useCallback(
    (stream: MediaStream | null, isHost: boolean) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === "connected" || s === "completed") setConnected(true);
        if (s === "disconnected" || s === "failed") setConnected(false);
      };

      if (isHost) {
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
    },
    [handleDataMessage]
  );

  const sendMove = useCallback((action: string, payload: any) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify({ type: "move", action, payload }));
    }
  }, []);

  const onMove = useCallback((listener: MoveListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const createRoom = useCallback(async () => {
    const id = generateRoomId();
    setRoomId(id);
    setRole("host");
    roleRef.current = "host";
    pendingIceCandidatesRef.current = [];

    const stream = await getLocalStream();
    const pc = setupPeerConnection(stream, true);

    const channel = supabase.channel(`room-${id}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }: any) => {
      const msg = payload;

      if (msg.type === "answer" && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await flushPendingIceCandidates(pc);
      }

      if (msg.type === "ice-candidate" && msg.candidate && msg.from !== "host") {
        await addOrQueueIceCandidate(pc, msg.candidate);
      }

      if (msg.type === "join") {
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

    await waitForChannelSubscription(channel);
    channelRef.current = channel;
  }, [addOrQueueIceCandidate, flushPendingIceCandidates, getLocalStream, setupPeerConnection, waitForChannelSubscription]);

  // Auto-join if URL has ?room=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (!room) return;

    setRoomId(room);
    setRole("guest");
    roleRef.current = "guest";
    setJoining(true);
    pendingIceCandidatesRef.current = [];

    let mounted = true;

    (async () => {
      const stream = await getLocalStream();
      if (!mounted) return;
      const pc = setupPeerConnection(stream, false);

      const channel = supabase.channel(`room-${room}`, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "signal" }, async ({ payload }: any) => {
        const msg = payload;

        if (msg.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushPendingIceCandidates(pc);
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

        if (msg.type === "ice-candidate" && msg.candidate && msg.from !== "guest") {
          await addOrQueueIceCandidate(pc, msg.candidate);
        }
      });

      await waitForChannelSubscription(channel);
      channelRef.current = channel;

      const sendJoin = () => {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "join" },
        });
      };

      sendJoin();

      const retryJoinId = window.setInterval(() => {
        if (pc.remoteDescription || pc.connectionState === "connected") {
          window.clearInterval(retryJoinId);
          return;
        }

        sendJoin();
      }, 1500);

      window.setTimeout(() => {
        window.clearInterval(retryJoinId);
        setJoining(false);
      }, 6000);
    })();

    return () => {
      mounted = false;
      pendingIceCandidatesRef.current = [];
      pcRef.current?.close();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [addOrQueueIceCandidate, flushPendingIceCandidates, getLocalStream, setupPeerConnection, waitForChannelSubscription]);

  return {
    role,
    roomId,
    connected,
    remoteStream,
    localStream,
    sendMove,
    onMove,
    createRoom,
    joining,
  };
}
