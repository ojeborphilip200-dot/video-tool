import { bundle } from "@remotion/bundler";
import path from "path";

async function main() {
  const entryPoint = path.join(process.cwd(), "remotion", "index.ts");
  const outDir = path.join(process.cwd(), ".remotion-bundle");

  const bundleLocation = await bundle({
    entryPoint,
    outDir,
  });

  console.log("Bundled successfully to:", bundleLocation);
}

main();