import { NextResponse } from "next/server";
import { recommendVenuesForCandidate } from "@/domain/recommendation";
import type { MeetingCandidate } from "@/domain/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    candidate: MeetingCandidate;
    categories: string[];
  };
  const venues = await recommendVenuesForCandidate(body.candidate, body.categories ?? []);
  return NextResponse.json({
    ok: true,
    demoData: true,
    venues
  });
}
