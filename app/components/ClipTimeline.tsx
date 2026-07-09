"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type ClipTimelineProps = {
  totalDuration: number;
  trimStart: number;
  trimEnd: number;
  onChange: (start: number, end: number) => void;
};

export default function ClipTimeline({
  totalDuration,
  trimStart,
  trimEnd,
  onChange,
}: ClipTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | "move" | null>(null);
  const dragOffsetRef = useRef(0);

  const pxToSeconds = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return ratio * totalDuration;
    },
    [totalDuration]
  );

  function handleMouseDown(e: React.MouseEvent, type: "start" | "end" | "move") {
    e.preventDefault();
    setDragging(type);
    if (type === "move") {
      dragOffsetRef.current = pxToSeconds(e.clientX) - trimStart;
    }
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging) return;
      const seconds = pxToSeconds(e.clientX);

      if (dragging === "start") {
        const newStart = Math.min(seconds, trimEnd - 0.2);
        onChange(Math.max(0, newStart), trimEnd);
      } else if (dragging === "end") {
        const newEnd = Math.max(seconds, trimStart + 0.2);
        onChange(trimStart, Math.min(totalDuration, newEnd));
      } else if (dragging === "move") {
        const width = trimEnd - trimStart;
        let newStart = seconds - dragOffsetRef.current;
        newStart = Math.max(0, Math.min(newStart, totalDuration - width));
        onChange(newStart, newStart + width);
      }
    }

    function handleMouseUp() {
      setDragging(null);
    }

    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, trimStart, trimEnd, totalDuration, onChange, pxToSeconds]);

  const startPct = totalDuration > 0 ? (trimStart / totalDuration) * 100 : 0;
  const endPct = totalDuration > 0 ? (trimEnd / totalDuration) * 100 : 100;

  return (
    <div style={{ marginTop: "10px" }}>
      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: "36px",
          background: "#e5e5e5",
          borderRadius: "6px",
          userSelect: "none",
        }}
      >
        {/* Selected region */}
        <div
          onMouseDown={(e) => handleMouseDown(e, "move")}
          style={{
            position: "absolute",
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            height: "100%",
            background: "#4f83ff",
            borderRadius: "4px",
            cursor: "grab",
          }}
        />

        {/* Left trim handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, "start")}
          style={{
            position: "absolute",
            left: `${startPct}%`,
            transform: "translateX(-50%)",
            width: "10px",
            height: "100%",
            background: "#1e3a8a",
            cursor: "ew-resize",
            borderRadius: "3px",
          }}
        />

        {/* Right trim handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, "end")}
          style={{
            position: "absolute",
            left: `${endPct}%`,
            transform: "translateX(-50%)",
            width: "10px",
            height: "100%",
            background: "#1e3a8a",
            cursor: "ew-resize",
            borderRadius: "3px",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#666", marginTop: "4px" }}>
        <span>{trimStart.toFixed(1)}s</span>
        <span>Clip length: {totalDuration.toFixed(1)}s</span>
        <span>{trimEnd.toFixed(1)}s</span>
      </div>
    </div>
  );
}