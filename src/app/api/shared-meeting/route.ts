import { NextResponse } from "next/server";
import { assertNoPrivateLocationLeak, sanitizeSharedMeeting } from "@/domain/privacy";
import type { MeetingCandidate, ParticipantInput } from "@/domain/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    meetingId: string;
    revision: number;
    participants: ParticipantInput[];
    candidates: MeetingCandidate[];
  };
  const dto = sanitizeSharedMeeting(body);
  const leaks = assertNoPrivateLocationLeak(dto);
  if (leaks.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Shared DTO failed privacy checks.",
        blockedTokens: leaks
      },
      { status: 500 }
    );
  }
  return NextResponse.json(dto, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
