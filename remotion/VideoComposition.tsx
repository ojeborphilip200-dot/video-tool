import { Series, OffthreadVideo, Audio, AbsoluteFill, staticFile } from "remotion";

export type ClipProps = {
  url: string;
  trimStart: number;
  trimEnd: number;
};

export type VideoCompositionProps = {
  clips: ClipProps[];
  fps: number;
  narrationSrc?: string;
  musicSrc?: string;
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  clips,
  fps,
  narrationSrc,
  musicSrc,
}) => {
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
                muted
              />
            </Series.Sequence>
          );
        })}
      </Series>

      {narrationSrc && <Audio src={narrationSrc} volume={1} />}
      {musicSrc && <Audio src={musicSrc} volume={0.18} loop />}
    </AbsoluteFill>
  );
};