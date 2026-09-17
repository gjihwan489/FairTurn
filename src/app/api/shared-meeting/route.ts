import { NextResponse } from "next/server";
import { assertNoPrivateLocationLeak, sanitizeSharedMeeting } from "@/domain/privacy";
import { apiError, parseJsonBody, rateLimited } from "@/lib/api";
import { sharedMeetingRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = rateLimited("shared-meeting", request);
  if (limited) return limited;
  try {
    const body = await parseJsonBody(request);
    const parsed = sharedMeetingRequestSchema.parse(body);
    const dto = sanitizeSharedMeeting(parsed as unknown as Parameters<typeof sanitizeSharedMeeting>[0]);
    const leaks = assertNoPrivateLocationLeak(dto);
    if (leaks.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          status: "privacy_error",
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
  } catch (error) {
    return apiError(error);
  }
}
