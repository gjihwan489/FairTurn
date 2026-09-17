import { NextResponse } from "next/server";
import { calculateRecommendations } from "@/domain/recommendation";
import { maskSensitiveError } from "@/domain/privacy";
import { recommendationRequestSchema } from "@/lib/validation";
import { apiError, parseJsonBody, rateLimited } from "@/lib/api";

export async function POST(request: Request) {
  const limited = rateLimited("recommendations", request);
  if (limited) return limited;
  try {
    const body = await parseJsonBody(request);
    const parsed = recommendationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          status: "error",
          validationWarnings: parsed.error.issues.map((issue) => issue.message),
          providerWarnings: [],
          candidates: [],
          relaxation: null,
          calculatedAt: new Date().toISOString()
        },
        { status: 400 }
      );
    }
    const result = await calculateRecommendations(parsed.data);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-FairTurn-Provider-Mode": result.providerMode
      }
    });
  } catch (error) {
    const parsedError = apiError(error);
    if (parsedError.status !== 500) return parsedError;
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        message: maskSensitiveError(error),
        candidates: [],
        relaxation: null,
        calculatedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
