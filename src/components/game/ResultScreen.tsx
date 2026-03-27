import { useState, useEffect } from "react";
import { Download, Share2 } from "lucide-react";

interface ResultScreenProps {
  winner: 1 | 2;
  videoBlob: Blob | null;
  onRestart: () => void;
}

export function ResultScreen({ winner, videoBlob, onRestart }: ResultScreenProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (videoBlob) {
      const url = URL.createObjectURL(videoBlob);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoBlob]);

  useEffect(() => {
    setCanShare(typeof navigator.share === "function" && typeof navigator.canShare === "function");
  }, []);

  const handleDownload = () => {
    if (!videoUrl || !videoBlob) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `chips-duel-${Date.now()}.webm`;
    a.click();
  };

  const handleShare = async () => {
    if (!videoBlob) return;
    const file = new File([videoBlob], `chips-duel-${Date.now()}.webm`, { type: "video/webm" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Chips Duel 🥔💣",
          text: "Смотри как мы играли в Chips Duel!",
          files: [file],
        });
      } else {
        handleDownload();
      }
    } catch {
      // User cancelled share
    }
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur z-50 flex flex-col items-center justify-center gap-4 px-6">
      <div className="text-5xl">{winner === 1 ? "👱‍♀️" : "🧔"}</div>
      <h1 className="text-sm text-primary text-center leading-relaxed">
        Игрок {winner}<br />победил!
      </h1>

      {videoUrl && (
        <video
          src={videoUrl}
          controls
          className="w-full max-w-[280px] rounded-lg border border-border"
          style={{ maxHeight: "35vh" }}
        />
      )}

      <div className="flex gap-3">
        {videoBlob && (
          <>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2.5 text-[9px] font-[inherit] rounded-lg active:scale-95 transition-transform"
            >
              <Download size={14} />
              СКАЧАТЬ
            </button>
            {canShare && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 bg-accent text-accent-foreground px-4 py-2.5 text-[9px] font-[inherit] rounded-lg active:scale-95 transition-transform"
              >
                <Share2 size={14} />
                В TIKTOK
              </button>
            )}
          </>
        )}
      </div>

      <button
        onClick={onRestart}
        className="bg-primary text-primary-foreground px-8 py-3 text-[9px] font-[inherit] rounded-lg shadow-[0_4px_0_hsl(var(--board-border))] active:shadow-none active:translate-y-1 transition-all mt-2"
      >
        ЗАНОВО
      </button>
    </div>
  );
}
