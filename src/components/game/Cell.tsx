import type { CellState } from "./types";

export function Cell({ state, onClick, owner }: { state: CellState; onClick?: () => void; owner: 1 | 2 }) {
  const base = "w-9 h-9 flex items-center justify-center rounded-sm border transition-all duration-150";
  const ownerBg = owner === 1
    ? "bg-[hsl(45,80%,55%)] border-[hsl(45,80%,40%)]"
    : "bg-[hsl(145,40%,40%)] border-[hsl(145,40%,30%)]";

  let content: React.ReactNode = <span className="text-base">🥔</span>;
  const clickable = !!onClick;

  if (state === "marked") content = <span className="text-base">☠️</span>;
  else if (state === "revealed-safe") content = null;
  else if (state === "revealed-bomb") content = <span className="text-base">💣</span>;

  return (
    <div
      className={`${base} ${ownerBg} ${clickable ? "cursor-pointer active:scale-90" : "cursor-default"}`}
      onClick={clickable ? onClick : undefined}
    >
      {content}
    </div>
  );
}
