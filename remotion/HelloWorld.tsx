import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const HelloWorld: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#101114", justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ color: "white", fontSize: 80, opacity }}>
        Hello from Remotion
      </h1>
    </AbsoluteFill>
  );
};