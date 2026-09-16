import { NextResponse } from "next/server";
import { getPlaceProvider } from "@/providers/place";
import { getTransitProvider } from "@/providers/transit";

export async function GET() {
  const providerMode = process.env.FAIRTURN_PROVIDER_MODE === "live" ? "live" : "fixture";
  const [transit, place] = await Promise.all([
    getTransitProvider(providerMode).getStatus(),
    getPlaceProvider(providerMode).getStatus()
  ]);
  return NextResponse.json(
    {
      providerMode,
      cache: {
        configured: false,
        reachable: false,
        dataReady: false,
        lastCheckedAt: new Date().toISOString(),
        latencyMs: null,
        warning: "Redis is not configured in this local MVP build; deterministic in-process fixture results are used.",
        cacheUsed: false,
        lastSuccessAt: null
      },
      transit,
      place,
      secretsExposed: false
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
