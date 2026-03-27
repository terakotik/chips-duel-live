import { useState, useRef, useCallback, useEffect } from "react";
import { freshState, BOMBS } from "./game/types";
import type { GameState } from "./game/types";
import { BoardGrid } from "./game/BoardGrid";
import { Hearts } from "./game/Hearts";
import { OnlineVideoZone, type OnlineVideoZoneHandle } from "./game/OnlineVideoZone";
import { ResultScreen } from "./game/ResultScreen";
import { useGameRecorder } from "./game/useGameRecorder";
import { useOnlineGame } from "./game/useOnlineGame";
import { Copy, Check, Loader2 } from "lucide-react";

export default function ChipsDuel() {
  const online = useOnlineGame();
  const [G, setG] = useState<GameState>(freshState);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const v1Ref = useRef<OnlineVideoZoneHandle | null>(null);
  const v2Ref = useRef<OnlineVideoZoneHandle | null>(null);
  const { startRecording, stopRecording, updateGameState } = useGameRecorder(
    v1Ref as any,
    v2Ref as any
  );
  const recordingStarted = useRef(false);

  // Start recording when both connected
  useEffect(() => {
    if (online.connected && !recordingStarted.current) {
      recordingStarted.current = true;
      const t = setTimeout(() => startRecording(), 500);
      return () => clearTimeout(t);
    }
  }, [online.connected, startRecording]);

  // Sync game state to recorder
  useEffect(() => {
    updateGameState(G);
  }, [G, updateGameState]);

  // Listen for moves from remote peer
  useEffect(() => {
    if (!online.onMove) return;
    const unsub = online.onMove((action: string, payload: any) => {
      if (action === "sync") {
        setG(payload as GameState);
      }
    });
    return unsub;
  }, [online.onMove]);

  // Stop recording on result
  useEffect(() => {
    if (G.phase === "result") {
      stopRecording().then((blob) => {
        if (blob) setVideoBlob(blob);
      });
    }
  }, [G.phase, stopRecording]);

  // Broadcast state change to peer
  const broadcastState = useCallback(
    (newState: GameState) => {
      setG(newState);
      online.sendMove("sync", newState);
    },
    [online.sendMove]
  );

  const restart = useCallback(() => {
    const s = freshState();
    broadcastState(s);
    setVideoBlob(null);
    recordingStarted.current = false;
    setTimeout(() => {
      recordingStarted.current = true;
      startRecording();
    }, 500);
  }, [broadcastState, startRecording]);

  const setupClick = useCallback(
    (i: number) => {
      setG((prev) => {
        const g = structuredClone(prev);
        const isP1S = g.phase === "p1-setup";

        // Host is P1, Guest is P2
        if (isP1S && online.role !== "host") return prev;
        if (!isP1S && g.phase === "p2-setup" && online.role !== "guest") return prev;

        if (isP1S) {
          if (g.p1Bombs.includes(i)) {
            g.p1Bombs = g.p1Bombs.filter((x) => x !== i);
            g.p2Board[i] = "hidden";
          } else if (g.p1Bombs.length < BOMBS) {
            g.p1Bombs.push(i);
            g.p2Board[i] = "marked";
          }
          if (g.p1Bombs.length === BOMBS) g.phase = "p2-setup";
        } else {
          if (g.p2Bombs.includes(i)) {
            g.p2Bombs = g.p2Bombs.filter((x) => x !== i);
            g.p1Board[i] = "hidden";
          } else if (g.p2Bombs.length < BOMBS) {
            g.p2Bombs.push(i);
            g.p1Board[i] = "marked";
          }
          if (g.p2Bombs.length === BOMBS) {
            g.phase = "playing";
            g.cur = 1;
          }
        }
        online.sendMove("sync", g);
        return g;
      });
    },
    [online.role, online.sendMove]
  );

  const playClick = useCallback(
    (owner: 1 | 2, i: number) => {
      setG((prev) => {
        const g = structuredClone(prev);
        if (g.phase !== "playing") return prev;

        // Host = P1, Guest = P2
        if (g.cur === 1 && online.role !== "host") return prev;
        if (g.cur === 2 && online.role !== "guest") return prev;
        if (g.cur === 1 && owner !== 2) return prev;
        if (g.cur === 2 && owner !== 1) return prev;

        const board = owner === 1 ? g.p1Board : g.p2Board;
        if (board[i] !== "hidden" && board[i] !== "marked") return prev;
        const bombs = g.cur === 1 ? g.p1Bombs : g.p2Bombs;
        const hit = bombs.includes(i);
        board[i] = hit ? "revealed-bomb" : "revealed-safe";
        if (hit) {
          g.lives[g.cur - 1]--;
          if (g.lives[g.cur - 1] <= 0) {
            g.phase = "result";
            g.winner = g.cur === 1 ? 2 : 1;
            online.sendMove("sync", g);
            return g;
          }
        }
        g.cur = g.cur === 1 ? 2 : 1;
        online.sendMove("sync", g);
        return g;
      });
    },
    [online.role, online.sendMove]
  );

  const copyLink = useCallback(() => {
    if (!online.roomId) return;
    const url = `${window.location.origin}?room=${online.roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [online.roomId]);

  // Lobby: no room yet
  if (!online.roomId) {
    return (
      <div className="w-screen h-[100dvh] flex flex-col items-center justify-center gap-6 bg-background px-6">
        <h1 className="text-lg text-primary text-center">CHIPS DUEL</h1>
        <p className="text-[9px] text-muted-foreground text-center max-w-[260px]">
          Создай комнату и отправь ссылку другу
        </p>
        <button
          onClick={online.createRoom}
          className="bg-primary text-primary-foreground px-8 py-3 text-[10px] font-[inherit] rounded-lg shadow-[0_4px_0_hsl(var(--board-border))] active:shadow-none active:translate-y-1 transition-all"
        >
          СОЗДАТЬ КОМНАТУ
        </button>
      </div>
    );
  }

  // Waiting for peer
  if (!online.connected) {
    return (
      <div className="w-screen h-[100dvh] flex flex-col items-center justify-center gap-6 bg-background px-6">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <h2 className="text-[11px] text-primary text-center">
          {online.joining ? "Подключение..." : "Ожидание соперника"}
        </h2>
        <div className="bg-secondary/80 px-4 py-2 rounded-lg max-w-[280px]">
          <p className="text-[8px] text-accent text-center font-mono">
            {online.statusText}
          </p>
        </div>
        {online.role === "host" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-[8px] text-muted-foreground text-center">
              Отправь эту ссылку другу:
            </p>
            <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg">
              <span className="text-[7px] text-foreground break-all max-w-[200px]">
                {window.location.origin}?room={online.roomId}
              </span>
              <button onClick={copyLink} className="text-primary">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (G.phase === "result") {
    return (
      <ResultScreen winner={G.winner!} videoBlob={videoBlob} onRestart={restart} />
    );
  }

  const isSetup = G.phase === "p1-setup" || G.phase === "p2-setup";
  const isP1S = G.phase === "p1-setup";
  const cnt = isP1S ? G.p1Bombs.length : G.p2Bombs.length;
  const p1Turn = G.phase === "playing" && G.cur === 1;
  const p2Turn = G.phase === "playing" && G.cur === 2;

  const myPlayer = online.role === "host" ? 1 : 2;
  const isMyTurn =
    (G.phase === "playing" && G.cur === myPlayer) ||
    (isP1S && online.role === "host") ||
    (G.phase === "p2-setup" && online.role === "guest");

  return (
    <div className="w-screen h-[100dvh] flex flex-col overflow-hidden">
      <div className="flex-1 flex min-h-0 gap-0">
        <div className="w-1/2 h-full relative">
          <OnlineVideoZone ref={v1Ref} stream={online.localStream} label="me" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <Hearts count={G.lives[myPlayer - 1]} />
          </div>
          <div className="absolute top-1 left-1 text-[6px] text-foreground/50 bg-background/50 px-1 rounded">
            ТЫ (P{myPlayer})
          </div>
          {isMyTurn && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse bg-background/50 px-2 py-0.5 rounded">
              ТВОЙ ХОД
            </div>
          )}
        </div>
        <div className="w-1/2 h-full relative">
          <OnlineVideoZone ref={v2Ref} stream={online.remoteStream} label="opponent" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <Hearts count={G.lives[myPlayer === 1 ? 1 : 0]} />
          </div>
          <div className="absolute top-1 left-1 text-[6px] text-foreground/50 bg-background/50 px-1 rounded">
            СОПЕРНИК
          </div>
          {!isMyTurn && G.phase === "playing" && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground bg-background/50 px-2 py-0.5 rounded">
              ХОД СОПЕРНИКА
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-1 py-3 bg-background/80 backdrop-blur-sm">
        <div className="text-[7px] text-accent text-center bg-secondary/80 px-3 py-1 rounded-full max-w-[300px]">
          {online.statusText}
        </div>
        {isSetup && (
          <div className="text-[8px] text-foreground text-center bg-background/60 backdrop-blur-sm px-3 py-1 rounded-md">
            {isMyTurn
              ? `Отметь бомбы (${cnt}/${BOMBS})`
              : "Соперник расставляет бомбы..."}
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <BoardGrid
            board={G.p1Board}
            owner={1}
            G={G}
            onSetupClick={setupClick}
            onPlayClick={playClick}
          />
          <span className="text-[7px] text-foreground/60 bg-background/40 px-1 py-0.5 rounded">
            VS
          </span>
          <BoardGrid
            board={G.p2Board}
            owner={2}
            G={G}
            onSetupClick={setupClick}
            onPlayClick={playClick}
          />
        </div>
        {G.phase === "playing" && (
          <div className="text-[8px] text-foreground bg-background/60 backdrop-blur-sm px-3 py-1 rounded-md">
            {isMyTurn ? "Твой ход — выбери ячейку" : "Ход соперника..."}
          </div>
        )}
      </div>
    </div>
  );
}
