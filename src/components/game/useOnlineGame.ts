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

function generatePeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
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
  const roleRef = useRef<Role | null>(null);
  const mountedRef = useRef(true);
  const listenersRef = useRef<Set<MoveListener>>(new Set());
  const sessionIdRef = useRef(generatePeerId());
  const localStreamRef = useRef<MediaStream | null>(null);
  const offerSentRef = useRef(false);
  const remoteDescriptionSetRef = useRef(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setStatus = useCallback((text: string) => {
    console.log("[online]", text);
    if (mountedRef.current) {
      setStatusText(text);
    }
  }, []);

  const cleanupPeerConnection = useCallback(() => {
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    offerSentRef.current = false;

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (mountedRef.current) {
      setRemoteStream(null);
    }
  }, []);

  const cleanupAll = useCallback(() => {
    cleanupPeerConnection();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (mountedRef.current) {
      setLocalStream(null);
      setConnected(false);
      setJoining(false);
    }
  }, [cleanupPeerConnection]);

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    try {
      setStatus("Запрашиваю камеру...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      localStreamRef.current = stream;
      if (mountedRef.current) {
        setLocalStream(stream);
      }
      setStatus("Камера подключена");
      return stream;
    } catch (error) {
      console.error("[online] local stream error", error);
      setStatus("Не удалось открыть камеру");
      return null;
    }
  }, [setStatus]);

  const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("[online] failed to flush ICE candidate", error);
      }
    }
  }, []);

  const createPeerConnection = useCallback(
    (isHost: boolean) => {
      cleanupPeerConnection();

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.ontrack = (event) => {
        if (mountedRef.current) {
          setRemoteStream(event.streams[0] ?? null);
        }
        setStatus("Игрок найден, видео подключено ✓");
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate || !channelRef.current || !roleRef.current) {
          return;
        }

        channelRef.current.send({
          type: "broadcast",
          event: "signal",
          payload: {
            type: "ice-candidate",
            candidate: event.candidate.toJSON(),
            from: roleRef.current,
          },
        });
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log("[online] ICE", roleRef.current, state);

        if (state === "checking") {
          setStatus("Игрок в комнате, соединяю видео...");
        }

        if (state === "connected" || state === "completed") {
          setStatus("Игрок найден, соединение активно ✓");
        }

        if (state === "disconnected") {
          setStatus("Связь нестабильна, пытаюсь восстановить...");
        }

        if (state === "failed") {
          setStatus("Игрок в комнате, но видео не подключилось");
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log("[online] PC", roleRef.current, state);

        if (state === "failed") {
          setStatus("Ошибка видео-соединения, игра остаётся доступна");
        }
      };

      if (isHost) {
        offerSentRef.current = false;
      }

      return pc;
    },
    [cleanupPeerConnection, setStatus]
  );

  const ensurePeerConnection = useCallback(
    (isHost: boolean) => {
      return pcRef.current ?? createPeerConnection(isHost);
    },
    [createPeerConnection]
  );

  const handleDataMessage = useCallback((action: string, payload: any) => {
    listenersRef.current.forEach((listener) => listener(action, payload));
  }, []);

  const sendOffer = useCallback(async () => {
    if (!channelRef.current || offerSentRef.current || roleRef.current !== "host") {
      return;
    }

    const pc = ensurePeerConnection(true);

    try {
      offerSentRef.current = true;
      setStatus("Игрок в комнате, отправляю запрос на соединение...");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await channelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: {
          type: "offer",
          sdp: { type: offer.type, sdp: offer.sdp },
        },
      });
      setStatus("Оффер отправлен, жду ответ...");
    } catch (error) {
      console.error("[online] offer error", error);
      offerSentRef.current = false;
      setStatus("Не удалось создать соединение");
    }
  }, [ensurePeerConnection, setStatus]);

  const handleSignal = useCallback(
    async (message: any, isHost: boolean) => {
      const pc = ensurePeerConnection(isHost);

      if (message.type === "offer" && !isHost) {
        try {
          setStatus("Получен оффер, создаю ответ...");
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          remoteDescriptionSetRef.current = true;
          await flushPendingCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await channelRef.current?.send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "answer",
              sdp: { type: answer.type, sdp: answer.sdp },
            },
          });
          setStatus("Ответ отправлен, завершаю соединение...");
        } catch (error) {
          console.error("[online] answer error", error);
          setStatus("Не удалось ответить на подключение");
        }
        return;
      }

      if (message.type === "answer" && isHost) {
        try {
          setStatus("Получен ответ, подключаю видео...");
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          remoteDescriptionSetRef.current = true;
          await flushPendingCandidates(pc);
        } catch (error) {
          console.error("[online] remote answer error", error);
          setStatus("Не удалось завершить соединение");
        }
        return;
      }

      if (message.type === "ice-candidate" && message.candidate) {
        if (!remoteDescriptionSetRef.current) {
          pendingIceCandidatesRef.current.push(message.candidate);
          return;
        }

        try {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch (error) {
          console.error("[online] ICE candidate error", error);
        }
      }
    },
    [ensurePeerConnection, flushPendingCandidates, setStatus]
  );

  const bindChannel = useCallback(
    async (room: string, isHost: boolean) => {
      const channel = supabase.channel(`room-${room}`, {
        config: {
          broadcast: { self: false },
          presence: { key: sessionIdRef.current },
        },
      });

      channelRef.current = channel;

      channel.on("broadcast", { event: "move" }, ({ payload }: any) => {
        handleDataMessage(payload.action, payload.payload);
      });

      channel.on("broadcast", { event: "signal" }, ({ payload }: any) => {
        console.log("[online] signal", payload?.type);
        void handleSignal(payload, isHost);
      });

      channel.on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState() as Record<string, unknown[]>;
        const participantCount = Object.keys(presenceState).length;
        const hasPeer = participantCount > 1;

        if (mountedRef.current) {
          setConnected(hasPeer);
          setJoining(!hasPeer && !isHost);
        }

        if (hasPeer) {
          setStatus(isHost ? "Игрок вошёл в комнату" : "Хост найден, синхронизация... ");
          if (isHost && !offerSentRef.current) {
            void sendOffer();
          }
          return;
        }

        cleanupPeerConnection();
        setStatus(isHost ? "Комната создана, жду игрока..." : "Зашёл в комнату, жду хоста...");
      });

      channel.subscribe((status) => {
        console.log("[online] channel", status);

        if (status === "SUBSCRIBED") {
          setStatus(isHost ? "Комната создана, жду игрока..." : "Подключился к комнате...");
          void channel.track({
            sessionId: sessionIdRef.current,
            role: isHost ? "host" : "guest",
            joinedAt: new Date().toISOString(),
          });
        }

        if (status === "CHANNEL_ERROR") {
          setStatus("Ошибка канала связи");
        }

        if (status === "TIMED_OUT") {
          setStatus("Таймаут соединения с комнатой");
        }
      });
    },
    [cleanupPeerConnection, handleDataMessage, handleSignal, sendOffer, setStatus]
  );

  const sendMove = useCallback((action: string, payload: any) => {
    if (!channelRef.current) {
      return;
    }

    channelRef.current.send({
      type: "broadcast",
      event: "move",
      payload: { action, payload },
    });
  }, []);

  const onMove = useCallback((listener: MoveListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const createRoom = useCallback(async () => {
    cleanupAll();

    const id = generateRoomId();
    setRoomId(id);
    setRole("host");
    roleRef.current = "host";
    setJoining(false);

    await getLocalStream();
    await bindChannel(id, true);
  }, [bindChannel, cleanupAll, getLocalStream]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (!room) {
      setStatus("Создай комнату для старта");
      return;
    }

    setRoomId(room);
    setRole("guest");
    roleRef.current = "guest";
    setJoining(true);

    void (async () => {
      await getLocalStream();
      await bindChannel(room, false);
    })();

    return () => {
      cleanupAll();
    };
  }, [bindChannel, cleanupAll, getLocalStream, setStatus]);

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
