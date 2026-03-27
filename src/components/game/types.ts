export const CELLS = 9;
export const BOMBS = 3;
export const LIVES = 3;

export type CellState = "hidden" | "marked" | "revealed-safe" | "revealed-bomb";
export type Phase = "p1-setup" | "p2-setup" | "playing" | "result";

export interface GameState {
  phase: Phase;
  p1Board: CellState[];
  p2Board: CellState[];
  p1Bombs: number[];
  p2Bombs: number[];
  lives: [number, number];
  cur: 1 | 2;
  winner: 1 | 2 | null;
}

export const freshState = (): GameState => ({
  phase: "p1-setup",
  p1Board: Array(CELLS).fill("hidden"),
  p2Board: Array(CELLS).fill("hidden"),
  p1Bombs: [],
  p2Bombs: [],
  lives: [LIVES, LIVES],
  cur: 1,
  winner: null,
});
