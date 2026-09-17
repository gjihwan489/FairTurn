import { NextResponse } from "next/server";
import { recommendVenuesForHub } from "@/domain/recommendation";
import { apiError, parseJsonBody, rateLimited } from "@/lib/api";
import { venuesRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const limited = rateLimited("venues", request);
  if (limited) return limited;
  try {
    const body = await parseJsonBody(request);
    const parsed = venuesRequestSchema.parse(body);
    const venues = await recommendVenuesForHub(parsed);
    return NextResponse.json({
      ok: true,
      demoData: true,
      venues
    });
  } catch (error) {
    return apiError(error);
  }
}
