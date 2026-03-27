import { useRef, useCallback } from "react";
import type { GameState, CellState } from "./types";
import type { VideoZoneHandle } from "./VideoZone";
import { CELLS } from "./types";

const REC_W = 480;
const REC_H = 854; // 9:16 TikTok aspect
const FPS = 12;

export function useGameRecorder(
  v1Ref: React.RefObject<VideoZoneHandle | null>,
  v2Ref: React.RefObject<VideoZoneHandle | null>,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);
  const gameStateRef = useRef<GameState | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#0f1318";
    ctx.fillRect(0, 0, REC_W, REC_H);

    // Draw video feeds side by side in top half
    const vidH = Math.floor(REC_H * 0.55);
    const halfW = Math.floor(REC_W / 2);

    const v1 = v1Ref.current?.getVideo();
    const v2 = v2Ref.current?.getVideo();
    if (v1 && v1.readyState >= 2) {
      try { ctx.drawImage(v1, 0, 0, halfW, vidH); } catch {}
    }
    if (v2 && v2.readyState >= 2) {
      try { ctx.drawImage(v2, halfW, 0, halfW, vidH); } catch {}
    }

    // Draw game state
    const G = gameStateRef.current;
    if (G) {
      const boardY = vidH + 20;
      drawBoard(ctx, G.p1Board, 20, boardY, 1, G);
      drawBoard(ctx, G.p2Board, REC_W / 2 + 10, boardY, 2, G);

      // Lives
      ctx.font = "12px sans-serif";
      drawHearts(ctx, G.lives[0], 20, vidH + 10);
      drawHearts(ctx, G.lives[1], REC_W / 2 + 10, vidH + 10);

      // Phase info
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      if (G.phase === "playing") {
        ctx.fillText(`Ход Игрока ${G.cur}`, REC_W / 2, REC_H - 20);
      } else if (G.phase === "p1-setup" || G.phase === "p2-setup") {
        const pn = G.phase === "p1-setup" ? 1 : 2;
        ctx.fillText(`Игрок ${pn} ставит 💣`, REC_W / 2, REC_H - 20);
      } else if (G.phase === "result" && G.winner) {
        ctx.fillText(`Игрок ${G.winner} победил! 🏆`, REC_W / 2, REC_H - 20);
      }
      ctx.textAlign = "left";
    }
  }, [v1Ref, v2Ref]);

  const startRecording = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = REC_W;
    canvas.height = REC_H;
    canvasRef.current = canvas;
    chunksRef.current = [];
    blobRef.current = null;

    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
      videoBitsPerSecond: 800_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      blobRef.current = new Blob(chunksRef.current, { type: "video/webm" });
    };
    recorderRef.current = recorder;
    recorder.start(500);

    // Render loop
    const tick = () => {
      drawFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [drawFrame]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    cancelAnimationFrame(rafRef.current);
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        resolve(blobRef.current);
        return;
      }
      rec.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: "video/webm" });
        resolve(blobRef.current);
      };
      rec.stop();
    });
  }, []);

  const updateGameState = useCallback((g: GameState) => {
    gameStateRef.current = g;
  }, []);

  return { startRecording, stopRecording, updateGameState, blobRef };
}

function drawBoard(ctx: CanvasRenderingContext2D, board: CellState[], x: number, y: number, owner: 1 | 2, G: GameState) {
  const cellSize = 42;
  const gap = 4;
  const cols = 3;

  for (let i = 0; i < CELLS; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cellSize + gap);
    const cy = y + row * (cellSize + gap);

    // Cell background - fixed colors
    ctx.fillStyle = owner === 1 ? "hsl(45,80%,55%)" : "hsl(145,40%,40%)";
    ctx.fillRect(cx, cy, cellSize, cellSize);
    ctx.strokeStyle = owner === 1 ? "hsl(45,80%,40%)" : "hsl(145,40%,30%)";
    ctx.strokeRect(cx, cy, cellSize, cellSize);

    // Content
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const state = board[i];
    if (state === "hidden") {
      ctx.fillText("🥔", cx + cellSize / 2, cy + cellSize / 2);
    } else if (state === "marked") {
      ctx.fillText("☠️", cx + cellSize / 2, cy + cellSize / 2);
    } else if (state === "revealed-bomb") {
      ctx.fillText("💣", cx + cellSize / 2, cy + cellSize / 2);
    }
    // revealed-safe: empty cell, just background
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawHearts(ctx: CanvasRenderingContext2D, count: number, x: number, y: number) {
  ctx.font = "10px sans-serif";
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = i < count ? 1 : 0.2;
    ctx.fillText("❤️", x + i * 14, y);
  }
  ctx.globalAlpha = 1;
}
