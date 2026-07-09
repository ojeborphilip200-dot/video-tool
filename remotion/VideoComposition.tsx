import { Series, OffthreadVideo, AbsoluteFill } from "remotion";

export type ClipProps = {
  url: string;
  trimStart: number;
  trimEnd: number;
};

export type VideoCompositionProps = {
  clips: ClipProps[];
  fps: number;
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({ clips, fps }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {clips.map((clip, i) => {
          const durationInSeconds = clip.trimEnd - clip.trimStart;
          const durationInFrames = Math.max(1, Math.round(durationInSeconds * fps));

          return (
            <Series.Sequence key={i} durationInFrames={durationInFrames}>
              <OffthreadVideo
                src={clip.url}
                startFrom={Math.round(clip.trimStart * fps)}
                endAt={Math.round(clip.trimEnd * fps)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};