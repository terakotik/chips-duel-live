import { useState, useRef, useEffect, useCallback } from "react";

const CELLS = 9;
const BOMBS = 3;
const LIVES = 3;

type CellState = "hidden" | "marked" | "revealed-safe" | "revealed-bomb";
type Phase = "menu" | "p1-setup" | "p2-setup" | "playing" | "result";

interface GameState {
  phase: Phase;
  p1Board: CellState[];
  p2Board: CellState[];
  p1Bombs: number[];
  p2Bombs: number[];
  lives: [number, number];
  cur: 1 | 2;
  winner: 1 | 2 | null;
}

const freshState = (): GameState => ({
  phase: "menu",
  p1Board: Array(CELLS).fill("hidden"),
  p2Board: Array(CELLS).fill("hidden"),
  p1Bombs: [],
  p2Bombs: [],
  lives: [LIVES, LIVES],
  cur: 1,
  winner: null,
});

const EMOJI = { hidden: "🥔", safe: "😋", bomb: "💣", mark: "💀" };

function Hearts({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: LIVES }, (_, i) => (
        <span key={i} className="text-[10px]" style={{ opacity: i < count ? 1 : 0.2 }}>❤️</span>
      ))}
    </div>
  );
}

function Cell({ state, dimmed, onClick }: { state: CellState; dimmed: boolean; onClick?: () => void }) {
  const base = "w-9 h-9 flex items-center justify-center text-base rounded-sm border transition-all duration-150";
  let bg: string;
  let emoji = EMOJI.hidden;
  let clickable = !!onClick;

  if (state === "marked") { bg = "bg-destructive border-destructive/60"; emoji = EMOJI.mark; clickable = false; }
  else if (state === "revealed-safe") { bg = "bg-[hsl(var(--cell-safe))] border-[hsl(var(--cell-safe-border))]"; emoji = EMOJI.safe; clickable = false; }
  else if (state === "revealed-bomb") { bg = "bg-[hsl(var(--cell-bomb))] border-[hsl(var(--cell-bomb-border))]"; emoji = EMOJI.bomb; clickable = false; }
  else if (dimmed) { bg = "bg-[hsl(var(--cell-dim))] border-[hsl(var(--cell-dim-border))]"; clickable = false; }
  else { bg = "bg-primary border-primary/60 shadow-[inset_-1px_-1px_0] shadow-primary/30"; }

  return (
    <div
      className={`${base} ${bg} ${clickable ? "cursor-pointer active:scale-90" : "cursor-default"}`}
      onClick={clickable ? onClick : undefined}
    >
      {emoji}
    </div>
  );
}

function BoardGrid({ board, owner, G, onSetupClick, onPlayClick }: {
  board: CellState[]; owner: 1 | 2; G: GameState;
  onSetupClick: (i: number) => void; onPlayClick: (owner: 1 | 2, i: number) => void;
}) {
  const isSetup = G.phase === "p1-setup" || G.phase === "p2-setup";
  const isP1S = G.phase === "p1-setup";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[6px] text-foreground/50">P{owner}</span>
      <div className="grid grid-cols-3 gap-[3px] bg-[hsl(var(--board-bg))] p-1 rounded border border-[hsl(var(--board-border))]">
        {board.map((c, i) => {
          let dimmed = false;
          let click: (() => void) | undefined;

          if (isSetup && c === "hidden") {
            if ((isP1S && owner === 2) || (!isP1S && owner === 1)) click = () => onSetupClick(i);
            else dimmed = true;
          } else if (G.phase === "playing" && c === "hidden") {
            if ((G.cur === 1 && owner === 2) || (G.cur === 2 && owner === 1)) click = () => onPlayClick(owner, i);
            else dimmed = true;
          }
          if (c !== "hidden") { click = undefined; dimmed = false; }

          return <Cell key={i} state={c} dimmed={dimmed} onClick={click} />;
        })}
      </div>
    </div>
  );
}

function VideoZone({ id, facingMode }: { id: string; facingMode: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode }, audio: false })
      .then(s => {
        streamRef.current = s;
        const v = document.createElement("video");
        v.srcObject = s;
        v.autoplay = true;
        v.playsInline = true;
        v.muted = true;
        v.className = "w-full h-full object-cover";
        el.appendChild(v);
      })
      .catch(() => {});
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [facingMode]);

  return (
    <div ref={ref} id={id} className="w-full h-full bg-secondary flex items-center justify-center text-3xl">
      {id === "v1" ? "👱‍♀️" : "🧔"}
    </div>
  );
}

export default function ChipsDuel() {
  const [G, setG] = useState<GameState>(freshState);

  const start = () => setG({
    ...freshState(), phase: "p1-setup",
    p1Board: Array(CELLS).fill("hidden"), p2Board: Array(CELLS).fill("hidden"),
  });

  const setupClick = useCallback((i: number) => {
    setG(prev => {
      const g = structuredClone(prev);
      const isP1S = g.phase === "p1-setup";
      if (isP1S) {
        if (g.p1Bombs.includes(i)) { g.p1Bombs = g.p1Bombs.filter(x => x !== i); g.p2Board[i] = "hidden"; }
        else if (g.p1Bombs.length < BOMBS) { g.p1Bombs.push(i); g.p2Board[i] = "marked"; }
      } else {
        if (g.p2Bombs.includes(i)) { g.p2Bombs = g.p2Bombs.filter(x => x !== i); g.p1Board[i] = "hidden"; }
        else if (g.p2Bombs.length < BOMBS) { g.p2Bombs.push(i); g.p1Board[i] = "marked"; }
      }
      return g;
    });
  }, []);

  const confirm = useCallback(() => {
    setG(prev => {
      const g = structuredClone(prev);
      if (g.phase === "p1-setup" && g.p1Bombs.length === BOMBS) {
        g.p2Board = g.p2Board.map(c => c === "marked" ? "hidden" : c); g.phase = "p2-setup";
      } else if (g.phase === "p2-setup" && g.p2Bombs.length === BOMBS) {
        g.p1Board = g.p1Board.map(c => c === "marked" ? "hidden" : c); g.phase = "playing"; g.cur = 1;
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
      if (board[i] !== "hidden") return prev;
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

  // Меню
  if (G.phase === "menu") {
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center gap-5 px-8">
        <div className="text-6xl">🥔</div>
        <h1 className="text-lg text-primary text-center leading-relaxed">CHIPS<br />DUEL</h1>
        <p className="text-[8px] text-muted-foreground max-w-[240px] text-center leading-[2]">
          Отметь 3 бомбы на доске соперника. Потом по очереди кликай — не подорвись!
        </p>
        <button onClick={start} className="bg-primary text-primary-foreground px-8 py-3 text-[10px] font-[inherit] rounded-lg shadow-[0_4px_0_hsl(var(--board-border))] active:shadow-none active:translate-y-1 transition-all">
          ИГРАТЬ
        </button>
      </div>
    );
  }

  // Результат
  if (G.phase === "result") {
    return (
      <div className="fixed inset-0 bg-background/90 backdrop-blur z-50 flex flex-col items-center justify-center gap-5 px-8">
        <div className="text-6xl">{G.winner === 1 ? "👱‍♀️" : "🧔"}</div>
        <h1 className="text-lg text-primary text-center leading-relaxed">Игрок {G.winner}<br />победил!</h1>
        <button onClick={start} className="bg-primary text-primary-foreground px-8 py-3 text-[10px] font-[inherit] rounded-lg shadow-[0_4px_0_hsl(var(--board-border))] active:shadow-none active:translate-y-1 transition-all">
          ЗАНОВО
        </button>
      </div>
    );
  }

  const isSetup = G.phase === "p1-setup" || G.phase === "p2-setup";
  const isP1S = G.phase === "p1-setup";
  const cnt = isP1S ? G.p1Bombs.length : G.p2Bombs.length;
  const p1Turn = G.phase === "playing" && G.cur === 1;
  const p2Turn = G.phase === "playing" && G.cur === 2;

  return (
    <div className="w-screen h-[100dvh] flex flex-col overflow-hidden">
      {/* Верх: два игрока рядом */}
      <div className="flex-1 flex min-h-0">
        {/* Игрок 1 — левая половина */}
        <div className="w-1/2 h-full relative">
          <VideoZone id="v1" facingMode="user" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <Hearts count={G.lives[0]} />
          </div>
          {p1Turn && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">◀ ХОД</div>}
          {isP1S && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">СТАВИТ 💣</div>}
        </div>
        {/* Игрок 2 — правая половина */}
        <div className="w-1/2 h-full relative">
          <VideoZone id="v2" facingMode="environment" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <Hearts count={G.lives[1]} />
          </div>
          {p2Turn && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">◀ ХОД</div>}
          {!isP1S && isSetup && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-accent animate-pulse-turn bg-background/50 px-2 py-0.5 rounded">СТАВИТ 💣</div>}
        </div>
      </div>

      {/* Низ: игровые доски */}
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
        {isSetup && cnt === BOMBS && (
          <button onClick={confirm} className="bg-primary text-primary-foreground px-5 py-2 text-[8px] font-[inherit] rounded-lg shadow-[0_3px_0_hsl(var(--board-border))] active:shadow-none active:translate-y-1 transition-all">
            ГОТОВО ✓
          </button>
        )}
        {G.phase === "playing" && (
          <div className="text-[8px] text-foreground bg-background/60 backdrop-blur-sm px-3 py-1 rounded-md">
            Ход Игрока {G.cur}
          </div>
        )}
      </div>
    </div>
  );
}
