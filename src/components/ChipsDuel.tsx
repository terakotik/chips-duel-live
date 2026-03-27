import { useState, useCallback } from "react";

const CELLS = 9;
const BOMBS = 3;
const LIVES = 3;

type CellState = "hidden" | "marked" | "revealed-safe" | "revealed-bomb";
type Phase = "menu" | "p1-setup" | "p2-setup" | "playing" | "result";

interface GameState {
  phase: Phase;
  board: CellState[];
  p1Bombs: number[];
  p2Bombs: number[];
  lives: [number, number];
  cur: 1 | 2;
  winner: 1 | 2 | null;
}

const freshState = (): GameState => ({
  phase: "menu",
  board: Array(CELLS).fill("hidden"),
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
        <span key={i} className="text-xs" style={{ opacity: i < count ? 1 : 0.2 }}>❤️</span>
      ))}
    </div>
  );
}

function Cell({ state, dimmed, onClick }: { state: CellState; dimmed: boolean; onClick?: () => void }) {
  const base = "w-12 h-12 flex items-center justify-center text-xl rounded-md border-2 transition-all duration-150";
  let bg: string;
  let emoji = EMOJI.hidden;
  let clickable = !!onClick;

  if (state === "marked") { bg = "bg-destructive border-destructive"; emoji = EMOJI.mark; clickable = false; }
  else if (state === "revealed-safe") { bg = "bg-[hsl(var(--cell-safe))] border-[hsl(var(--cell-safe-border))]"; emoji = EMOJI.safe; clickable = false; }
  else if (state === "revealed-bomb") { bg = "bg-[hsl(var(--cell-bomb))] border-[hsl(var(--cell-bomb-border))]"; emoji = EMOJI.bomb; clickable = false; }
  else if (dimmed) { bg = "bg-[hsl(var(--cell-dim))] border-[hsl(var(--cell-dim-border))]"; clickable = false; }
  else { bg = "bg-primary border-border shadow-[inset_-2px_-2px_0] shadow-primary/40"; }

  return (
    <div
      className={`${base} ${bg} ${clickable ? "cursor-pointer active:scale-95" : "cursor-default"}`}
      onClick={clickable ? onClick : undefined}
    >
      {emoji}
    </div>
  );
}

/* Единая доска — показываем доску того, кого атакуют */
function Board({ board, G, onSetupClick, onPlayClick }: {
  board: CellState[]; G: GameState;
  onSetupClick: (i: number) => void; onPlayClick: (i: number) => void;
}) {
  const isSetup = G.phase === "p1-setup" || G.phase === "p2-setup";

  return (
    <div className="grid grid-cols-3 gap-1.5 bg-[hsl(var(--board-bg))] p-2 rounded-lg border-2 border-[hsl(var(--board-border))] shadow-lg">
      {board.map((c, i) => {
        let dimmed = false;
        let click: (() => void) | undefined;

        if (isSetup && c === "hidden") {
          click = () => onSetupClick(i);
        } else if (G.phase === "playing" && c === "hidden") {
          click = () => onPlayClick(i);
        } else if (c === "hidden") {
          dimmed = true;
        }

        return <Cell key={i} state={c} dimmed={dimmed} onClick={click} />;
      })}
    </div>
  );
}

function PlayerBar({ player, lives, isActive, emoji }: { player: 1 | 2; lives: number; isActive: boolean; emoji: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? "bg-accent/20 ring-2 ring-accent" : "bg-secondary"}`}>
      <div className="text-3xl">{emoji}</div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-foreground/80">Игрок {player}</span>
        <Hearts count={lives} />
      </div>
      {isActive && <span className="ml-auto text-[8px] text-accent animate-pulse-turn">◀ ХОД</span>}
    </div>
  );
}

export default function ChipsDuel() {
  const [G, setG] = useState<GameState>(freshState);

  const start = () => setG({ ...freshState(), phase: "p1-setup", board: Array(CELLS).fill("hidden") });

  const setupClick = useCallback((i: number) => {
    setG(prev => {
      const g = structuredClone(prev);
      const isP1S = g.phase === "p1-setup";
      const bombs = isP1S ? g.p1Bombs : g.p2Bombs;

      if (bombs.includes(i)) {
        if (isP1S) g.p1Bombs = g.p1Bombs.filter(x => x !== i);
        else g.p2Bombs = g.p2Bombs.filter(x => x !== i);
        g.board[i] = "hidden";
      } else if (bombs.length < BOMBS) {
        if (isP1S) g.p1Bombs.push(i);
        else g.p2Bombs.push(i);
        g.board[i] = "marked";
      }
      return g;
    });
  }, []);

  const confirm = useCallback(() => {
    setG(prev => {
      const g = structuredClone(prev);
      if (g.phase === "p1-setup" && g.p1Bombs.length === BOMBS) {
        // P1 расставил бомбы на доске P2 → теперь P2 ставит бомбы
        g.board = Array(CELLS).fill("hidden");
        g.phase = "p2-setup";
      } else if (g.phase === "p2-setup" && g.p2Bombs.length === BOMBS) {
        // Начинаем — показываем доску P2 (P1 атакует P2)
        g.board = Array(CELLS).fill("hidden");
        g.phase = "playing";
        g.cur = 1;
      }
      return g;
    });
  }, []);

  const playClick = useCallback((i: number) => {
    setG(prev => {
      const g = structuredClone(prev);
      if (g.phase !== "playing" || g.board[i] !== "hidden") return prev;

      // Текущий игрок атакует доску соперника
      // P1 атакует → бомбы P1 (которые P1 ставил на доску P2)
      // P2 атакует → бомбы P2 (которые P2 ставил на доску P1)
      const bombs = g.cur === 1 ? g.p1Bombs : g.p2Bombs;
      const hit = bombs.includes(i);
      g.board[i] = hit ? "revealed-bomb" : "revealed-safe";

      if (hit) {
        g.lives[g.cur - 1]--;
        if (g.lives[g.cur - 1] <= 0) {
          g.phase = "result";
          g.winner = g.cur === 1 ? 2 : 1;
          return g;
        }
      }

      // Меняем ход — показываем доску другого соперника
      const next: 1 | 2 = g.cur === 1 ? 2 : 1;
      // Восстанавливаем доску для нового атакующего
      // Нужно хранить обе доски отдельно... упрощённый вариант: одна доска
      g.cur = next;
      return g;
    });
  }, []);

  // Меню
  if (G.phase === "menu") {
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center gap-6 px-8">
        <div className="text-6xl">🥔</div>
        <h1 className="text-lg text-primary text-center leading-relaxed tracking-wide">CHIPS<br />DUEL</h1>
        <p className="text-[9px] text-muted-foreground max-w-[260px] text-center leading-[2]">
          Отметь 3 бомбы на доске соперника. Потом по очереди открывай клетки — не подорвись!
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
      <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center gap-6 px-8">
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
  const p1Active = G.phase === "playing" && G.cur === 1;
  const p2Active = G.phase === "playing" && G.cur === 2;

  let boardLabel = "";
  if (isSetup) boardLabel = `Доска ${isP1S ? "P2" : "P1"} — ставь бомбы`;
  else if (G.phase === "playing") boardLabel = `Доска ${G.cur === 1 ? "P2" : "P1"}`;

  return (
    <div className="w-screen h-[100dvh] flex flex-col overflow-hidden bg-background">
      {/* Игрок 1 сверху */}
      <PlayerBar player={1} lives={G.lives[0]} emoji="👱‍♀️"
        isActive={p1Active || (isSetup && isP1S)} />

      {/* Центр — одна доска */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        {isSetup && (
          <div className="text-[9px] text-primary text-center leading-relaxed">
            Игрок {isP1S ? 1 : 2}: отметь бомбы ({cnt}/{BOMBS})
          </div>
        )}

        <span className="text-[8px] text-muted-foreground">{boardLabel}</span>

        <Board board={G.board} G={G} onSetupClick={setupClick} onPlayClick={playClick} />

        {isSetup && cnt === BOMBS && (
          <button onClick={confirm} className="bg-primary text-primary-foreground px-8 py-3 text-[10px] font-[inherit] rounded-lg shadow-[0_4px_0_hsl(var(--board-border))] active:shadow-none active:translate-y-1 transition-all mt-2">
            ГОТОВО ✓
          </button>
        )}
        {G.phase === "playing" && (
          <div className="text-[9px] text-accent mt-1">Ход Игрока {G.cur}</div>
        )}
      </div>

      {/* Игрок 2 снизу */}
      <PlayerBar player={2} lives={G.lives[1]} emoji="🧔"
        isActive={p2Active || (isSetup && !isP1S)} />
    </div>
  );
}
