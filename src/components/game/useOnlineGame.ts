import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  statusText: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
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
  const [statusText, setStatusText] = useState("Инициализация...");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const listenersRef = useRef<Set<MoveListener>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const setStatus = useCallback((text: string) => {
    console.log("[status]", text);
    if (mountedRef.current) setStatusText(text);
  }, []);

  const getLocalStream = useCallback(async () => {
    try {
      setStatus("Запрос камеры...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      if (mountedRef.current) setLocalStream(stream);
      setStatus("Камера получена");
      return stream;
    } catch (e) {
      setStatus("Камера недоступна");
      return null;
    }
  }, [setStatus]);

  const handleDataMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "move") {
        listenersRef.current.forEach((fn) => fn(msg.action, msg.payload));
      }
    } catch {}
  }, []);

  const sendMove = useCallback((action: string, payload: any) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify({ type: "move", action, payload }));
    }
  }, []);

  const onMove = useCallback((listener: MoveListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const startAsHost = useCallback(async (room: string) => {
    setStatus("Получаю камеру...");
    const stream = await getLocalStream();

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    }

    pc.ontrack = (e) => {
      setStatus("Получен видеопоток соперника");
      if (mountedRef.current) setRemoteStream(e.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log("[host] ICE:", s);
      if (s === "connected" || s === "completed") {
        setStatus("Соединение установлено ✓");
        if (mountedRef.current) setConnected(true);
      }
      if (s === "disconnected") setStatus("Соединение прервано");
      if (s === "failed") setStatus("Соединение не удалось ✗");
    };

    // Data channel for game moves
    const dc = pc.createDataChannel("game");
    dc.onopen = () => {
      setStatus("Канал данных открыт ✓");
      if (mountedRef.current) setConnected(true);
    };
    dc.onmessage = (e) => handleDataMessage(e.data);
    dataChannelRef.current = dc;

    // Signaling via Supabase broadcast
    const channel = supabase.channel(`room-${room}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    let pendingCandidates: RTCIceCandidateInit[] = [];

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "ice-candidate", candidate: e.candidate.toJSON(), from: "host" },
        });
      }
    };

    channel.on("broadcast", { event: "signal" }, async ({ payload }: any) => {
      const msg = payload;
      console.log("[host] got signal:", msg.type);

      if (msg.type === "join") {
        setStatus("Гость подключается, создаю оффер...");
        try {
          // Reset connection if we were already negotiating
          if (pc.signalingState !== "stable") {
            console.log("[host] not stable, ignoring join");
            return;
          }
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          setStatus("Оффер отправлен, жду ответ...");
          channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "offer", sdp: { type: offer.type, sdp: offer.sdp } },
          });
        } catch (e) {
          console.error("[host] offer error:", e);
          setStatus("Ошибка создания оффера");
        }
      }

      if (msg.type === "answer") {
        setStatus("Получен ответ, устанавливаю соединение...");
        try {
          if (pc.signalingState !== "have-local-offer") {
            console.log("[host] ignoring answer, state:", pc.signalingState);
            return;
          }
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          // Flush pending ICE candidates
          for (const c of pendingCandidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          }
          pendingCandidates = [];
          setStatus("Ответ принят, ожидаю ICE...");
        } catch (e) {
          console.error("[host] answer error:", e);
          setStatus("Ошибка обработки ответа");
        }
      }

      if (msg.type === "ice-candidate" && msg.candidate && msg.from !== "host") {
        if (!pc.remoteDescription) {
          pendingCandidates.push(msg.candidate);
        } else {
          try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
        }
      }
    });

    channel.subscribe((status) => {
      console.log("[host] channel status:", status);
      if (status === "SUBSCRIBED") {
        setStatus("Комната создана, жду гостя...");
      }
    });
  }, [getLocalStream, handleDataMessage, setStatus]);

  const startAsGuest = useCallback(async (room: string) => {
    setStatus("Получаю камеру...");
    const stream = await getLocalStream();

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    }

    pc.ontrack = (e) => {
      setStatus("Получен видеопоток хоста");
      if (mountedRef.current) setRemoteStream(e.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log("[guest] ICE:", s);
      if (s === "connected" || s === "completed") {
        setStatus("Соединение установлено ✓");
        if (mountedRef.current) {
          setConnected(true);
          setJoining(false);
        }
      }
      if (s === "disconnected") setStatus("Соединение прервано");
      if (s === "failed") setStatus("Соединение не удалось ✗");
    };

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.onopen = () => {
        setStatus("Канал данных открыт ✓");
        if (mountedRef.current) setConnected(true);
      };
      dc.onmessage = (ev) => handleDataMessage(ev.data);
      dataChannelRef.current = dc;
    };

    const channel = supabase.channel(`room-${room}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    let pendingCandidates: RTCIceCandidateInit[] = [];

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "ice-candidate", candidate: e.candidate.toJSON(), from: "guest" },
        });
      }
    };

    channel.on("broadcast", { event: "signal" }, async ({ payload }: any) => {
      const msg = payload;
      console.log("[guest] got signal:", msg.type);

      if (msg.type === "offer") {
        setStatus("Получен оффер, создаю ответ...");
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          // Flush pending ICE candidates
          for (const c of pendingCandidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          }
          pendingCandidates = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          setStatus("Ответ отправлен, ожидаю ICE...");
          channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "answer", sdp: { type: answer.type, sdp: answer.sdp } },
          });
        } catch (e) {
          console.error("[guest] answer error:", e);
          setStatus("Ошибка создания ответа");
        }
      }

      if (msg.type === "ice-candidate" && msg.candidate && msg.from !== "guest") {
        if (!pc.remoteDescription) {
          pendingCandidates.push(msg.candidate);
        } else {
          try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
        }
      }
    });

    channel.subscribe((status) => {
      console.log("[guest] channel status:", status);
      if (status === "SUBSCRIBED") {
        setStatus("Подключён к комнате, отправляю запрос...");
        // Send join signal, retry a few times
        const sendJoin = () => {
          channel.send({ type: "broadcast", event: "signal", payload: { type: "join" } });
        };
        sendJoin();
        // Retry join every 2 seconds, up to 5 times
        let retries = 0;
        const interval = setInterval(() => {
          retries++;
          if (!mountedRef.current || pc.remoteDescription || retries > 5) {
            clearInterval(interval);
            if (mountedRef.current && !pc.remoteDescription && retries > 5) {
              setStatus("Хост не отвечает. Перезагрузите страницу.");
              setJoining(false);
            }
            return;
          }
          setStatus(`Повторная попытка подключения (${retries}/5)...`);
          sendJoin();
        }, 2000);
      }
    });
  }, [getLocalStream, handleDataMessage, setStatus]);

  const createRoom = useCallback(() => {
    const id = generateRoomId();
    setRoomId(id);
    setRole("host");
    startAsHost(id);
  }, [startAsHost]);

  // Auto-join if URL has ?room=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (!room) return;

    setRoomId(room);
    setRole("guest");
    setJoining(true);
    startAsGuest(room);

    return () => {
      mountedRef.current = false;
      pcRef.current?.close();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    statusText,
  };
}
