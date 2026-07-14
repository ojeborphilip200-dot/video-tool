import { NextRequest, NextResponse } from "next/server";
import { cancelJob } from "../_lib/jobs";

export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No job id" }, { status: 400 });
  const ok = cancelJob(id);
  return NextResponse.json({ cancelled: ok });
}
