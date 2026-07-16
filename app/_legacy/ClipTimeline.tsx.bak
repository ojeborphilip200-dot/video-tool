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
    <div style={{ marginTop: "14px" }}>
      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: "40px",
          background: "#0f1013",
          border: "1px solid #2a2c32",
          borderRadius: "8px",
          userSelect: "none",
          overflow: "hidden",
        }}
      >
        <div
          onMouseDown={(e) => handleMouseDown(e, "move")}
          style={{
            position: "absolute",
            top: "4px",
            bottom: "4px",
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            background: "linear-gradient(180deg, #ff9d75, #ff8a65)",
            borderRadius: "6px",
            cursor: "grab",
            boxShadow: "0 0 0 1px rgba(255,138,101,0.4)",
          }}
        />

        <div
          onMouseDown={(e) => handleMouseDown(e, "start")}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${startPct}%`,
            transform: "translateX(-50%)",
            width: "12px",
            cursor: "ew-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: "3px", height: "20px", background: "#fff", borderRadius: "2px" }} />
        </div>

        <div
          onMouseDown={(e) => handleMouseDown(e, "end")}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${endPct}%`,
            transform: "translateX(-50%)",
            width: "12px",
            cursor: "ew-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: "3px", height: "20px", background: "#fff", borderRadius: "2px" }} />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "ui-monospace, monospace",
          fontSize: "11px",
          color: "#5c5f68",
          marginTop: "6px",
        }}
      >
        <span>{trimStart.toFixed(1)}s</span>
        <span style={{ color: "#9295a0" }}>{totalDuration.toFixed(1)}s total</span>
        <span>{trimEnd.toFixed(1)}s</span>
      </div>
    </div>
  );
  }