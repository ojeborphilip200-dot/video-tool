import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { getJob } from "../_lib/jobs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No id provided" }, { status: 400 });
  const job = getJob(id);
  if (!job || job.status !== "done" || !job.outputPath) {
    return NextResponse.json({ error: "Result not ready" }, { status: 404 });
  }
  const buf = await fs.readFile(job.outputPath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": "attachment; filename=final-video.mp4",
    },
  });
}
