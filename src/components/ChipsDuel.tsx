import { useState, useRef, useCallback, useEffect } from "react";
import { freshState, BOMBS } from "./game/types";
import type { GameState } from "./game/types";
import { BoardGrid } from "./game/BoardGrid";
import { Hearts } from "./game/Hearts";
import { VideoZone, type VideoZoneHandle } from "./game/VideoZone";
import { ResultScreen } from "./game/ResultScreen";
import { useGameRecorder } from "./game/useGameRecorder";

export default function ChipsDuel() {
  const [G, setG] = useState<GameState>(freshState);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const v1Ref = useRef<VideoZoneHandle | null>(null);
  const v2Ref = useRef<VideoZoneHandle | null>(null);
  const { startRecording, stopRecording, updateGameState } = useGameRecorder(v1Ref, v2Ref);
  const recordingStarted = useRef(false);

  // Start recording on mount
  useEffect(() => {
    if (!recordingStarted.current) {
      recordingStarted.current = true;
      // Small delay to let cameras initialize
      const t = setTimeout(() => startRecording(), 1500);
      return () => clearTimeout(t);
    }
  }, [startRecording]);

  // Sync game state to recorder
  useEffect(() => {
    updateGameState(G);
  }, [G, updateGameState]);

  // Stop recording on result
  useEffect(() => {
    if (G.phase === "result") {
      stopRecording().then(blob => {
        if (blob) setVideoBlob(blob);
      });
    }
  }, [G.phase, stopRecording]);

  const restart = useCallback(() => {
    setG(freshState());
    setVideoBlob(null);
    recordingStarted.current = false;
    setTimeout(() => {
      recordingStarted.current = true;
      startRecording();
    }, 1500);
  }, [startRecording]);

  const setupClick = useCallback((i: number) => {
    setG(prev => {
      const g = structuredClone(prev);
      const isP1S = g.phase === "p1-setup";
      if (isP1S) {
        if (g.p1Bombs.includes(i)) { g.p1Bombs = g.p1Bombs.filter(x => x !== i); g.p2Board[i] = "hidden"; }
        else if (g.p1Bombs.length < BOMBS) { g.p1Bombs.push(i); g.p2Board[i] = "marked"; }
        if (g.p1Bombs.length === BOMBS) g.phase = "p2-setup";
      } else {
        if (g.p2Bombs.includes(i)) { g.p2Bombs = g.p2Bombs.filter(x => x !== i); g.p1Board[i] = "hidden"; }
        else if (g.p2Bombs.length < BOMBS) { g.p2Bombs.push(i); g.p1Board[i] = "marked"; }
        if (g.p2Bombs.length === BOMBS) { g.phase = "playing"; g.cur = 1; }
      }
      return g;
    });
  }, []);

  const playClick = useCallback((owner: 1 | 2, i: number) => {
    setG(prev => {
      const g = structuredClone(prev);
      if (g.phase !== "playing") return prev;
      if (g.cur === 1 && owner !== 2) return prev;
      if (g.cur === 2 && owner !== 1) return prev;
      const board = owner === 1 ? g.p1Board : g.p2Board;
      if (board[i] !== "hidden" && board[i] !== "marked") return prev;
      const bombs = g.cur === 1 ? g.p1Bombs : g.p2Bombs;
      const hit = bombs.includes(i);
      board[i] = hit ? "revealed-bomb" : "revealed-safe";
      if (hit) {
        g.lives[g.cur - 1]--;
        if (g.lives[g.cur - 1] <= 0) { g.phase = "result"; g.winner = g.cur === 1 ? 2 : 1; return g; }
      }
      g.cur = g.cur === 1 ? 2 : 1;
      return g;
    });
  }, []);

  if (G.phase === "result") {
    return <ResultScreen winner={G.winner!} videoBlob={videoBlob} onRestart={restart} />;
  }

  const isSetup = G.phase === "p1-setup" || G.phase === "p2-setup";
  const isP1S = G.phase === "p1-setup";
  const cnt = isP1S ? G.p1Bombs.length : G.p2Bombs.length;
  const p1Turn = G.phase === "playing" && G.cur === 1;
  const p2Turn = G.phase === "playing" && G.cur === 2;

  return (
    <div className="w-screen h-[100dvh] flex flex-col overflow-hidden">
      <div className="flex-1 flex min-h-0 gap-0">
        <div className="w-1/2 h-full relative">
          <VideoZone ref={v1Ref} id="v1" facingMode="user" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <Hearts count={G.lives[0]} />
          </div>
          {p1Turn && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">◀ ХОД</div>}
          {isP1S && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">СТАВИТ 💣</div>}
        </div>
        <div className="w-1/2 h-full relative">
          <VideoZone ref={v2Ref} id="v2" facingMode="environment" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <Hearts count={G.lives[1]} />
          </div>
          {p2Turn && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">◀ ХОД</div>}
          {!isP1S && isSetup && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">СТАВИТ 💣</div>}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-1 py-3 bg-background/80 backdrop-blur-sm">
        {isSetup && (
          <div className="text-[8px] text-foreground text-center bg-background/60 backdrop-blur-sm px-3 py-1 rounded-md">
            Игрок {isP1S ? 1 : 2}: отметь бомбы ({cnt}/{BOMBS})
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <BoardGrid board={G.p1Board} owner={1} G={G} onSetupClick={setupClick} onPlayClick={playClick} />
          <span className="text-[7px] text-foreground/60 bg-background/40 px-1 py-0.5 rounded">VS</span>
          <BoardGrid board={G.p2Board} owner={2} G={G} onSetupClick={setupClick} onPlayClick={playClick} />
        </div>
        {G.phase === "playing" && (
          <div className="text-[8px] text-foreground bg-background/60 backdrop-blur-sm px-3 py-1 rounded-md">
            Ход Игрока {G.cur}
          </div>
        )}
      </div>
    </div>
  );
}
