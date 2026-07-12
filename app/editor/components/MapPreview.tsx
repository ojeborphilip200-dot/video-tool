"use client";

import { useEffect, useMemo, useState } from "react";
import { createMapRenderer, MapConfig } from "../../api/_lib/mapEngine";

// One shared world-data fetch for the whole session
let worldPromise: Promise<any> | null = null;
function loadWorld(): Promise<any> {
  if (!worldPromise) {
    worldPromise = fetch("/map-data/world.geo.json").then((r) => r.json());
  }
  return worldPromise;
}

// Live map preview: runs the SAME engine the server rasterizer uses, so what
// you scrub here is frame-identical to the exported animation.
export default function MapPreview({ config, t }: { config: MapConfig; t: number }) {
  const [world, setWorld] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);

  const frame = useMemo(
    () => (world ? createMapRenderer(world, config, 1280, 720) : null),
    [world, JSON.stringify(config)]
  );

  if (!frame) {
    return (
      <span style={{ fontSize: "11px", color: "var(--ed-text-3)" }}>Loading map…</span>
    );
  }

  const svg = frame(Math.max(0, t)).replace(
    /^<svg width="\d+" height="\d+"/,
    '<svg width="100%" height="100%"'
  );

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
