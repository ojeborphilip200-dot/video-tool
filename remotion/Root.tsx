import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { VideoComposition } from "./VideoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={90}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="MainVideo"
        component={VideoComposition}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          clips: [],
          fps: 30,
        }}
      />
    </>
  );
};