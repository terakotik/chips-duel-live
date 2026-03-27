import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

export interface OnlineVideoZoneHandle {
  getVideo: () => HTMLVideoElement | null;
}

interface Props {
  stream: MediaStream | null;
  label: string;
}

export const OnlineVideoZone = forwardRef<OnlineVideoZoneHandle, Props>(
  ({ stream, label }, fwdRef) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(fwdRef, () => ({
      getVideo: () => videoRef.current,
    }));

    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);

    return (
      <div className="w-full h-full bg-secondary relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={label === "me"}
          className="w-full h-full object-cover"
        />
        {!stream && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-[8px]">
            {label === "me" ? "Камера..." : "Ожидание..."}
          </div>
        )}
      </div>
    );
  }
);

OnlineVideoZone.displayName = "OnlineVideoZone";
