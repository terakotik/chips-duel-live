import type { CellState, GameState } from "./types";
import { Cell } from "./Cell";

export function BoardGrid({ board, owner, G, onSetupClick, onPlayClick }: {
  board: CellState[]; owner: 1 | 2; G: GameState;
  onSetupClick: (i: number) => void; onPlayClick: (owner: 1 | 2, i: number) => void;
}) {
  const isSetup = G.phase === "p1-setup" || G.phase === "p2-setup";
  const isP1S = G.phase === "p1-setup";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[6px] text-foreground/50">P{owner}</span>
      <div className={`grid grid-cols-3 gap-[3px] p-1 rounded border ${
        owner === 1
          ? "bg-[hsl(40,60%,20%)] border-[hsl(40,60%,30%)]"
          : "bg-[hsl(200,50%,20%)] border-[hsl(200,50%,30%)]"
      }`}>
        {board.map((c, i) => {
          let click: (() => void) | undefined;
          const isPlaying = G.phase === "playing";

          if (isSetup && (c === "hidden" || c === "marked")) {
            if ((isP1S && owner === 2) || (!isP1S && owner === 1)) click = () => onSetupClick(i);
          } else if (isPlaying && (c === "hidden" || c === "marked")) {
            if ((G.cur === 1 && owner === 2) || (G.cur === 2 && owner === 1)) click = () => onPlayClick(owner, i);
          }
          if (c !== "hidden" && c !== "marked") { click = undefined; }

          return <Cell key={i} state={c} onClick={click} owner={owner} />;
        })}
      </div>
    </div>
  );
}
