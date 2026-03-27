import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

export interface VideoZoneHandle {
  getVideo: () => HTMLVideoElement | null;
}

export const VideoZone = forwardRef<VideoZoneHandle, { id: string; facingMode: string }>(
  ({ id, facingMode }, fwdRef) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useImperativeHandle(fwdRef, () => ({
      getVideo: () => videoRef.current,
    }));

    useEffect(() => {
      const el = containerRef.current;
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
          videoRef.current = v;
          el.appendChild(v);
        })
        .catch(() => {});
      return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
    }, [facingMode]);

    return <div ref={containerRef} id={id} className="w-full h-full bg-secondary" />;
  }
);

VideoZone.displayName = "VideoZone";
