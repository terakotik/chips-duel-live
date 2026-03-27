import { LIVES } from "./types";

export function Hearts({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: LIVES }, (_, i) => (
        <span key={i} className="text-[10px]" style={{ opacity: i < count ? 1 : 0.2 }}>❤️</span>
      ))}
    </div>
  );
}
