import { NextRequest, NextResponse } from "next/server";
import { getJob } from "../_lib/jobs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No id provided" }, { status: 400 });
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const { outputPath, ...publicFields } = job;
  return NextResponse.json(publicFields);
}
