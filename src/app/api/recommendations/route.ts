import { NextResponse } from "next/server";
import { calculateRecommendations } from "@/domain/recommendation";
import { maskSensitiveError } from "@/domain/privacy";
import { recommendationRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
