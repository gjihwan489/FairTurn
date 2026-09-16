import { sourced } from "@/domain/config";
import type {
  Coordinate,
  ParticipantInput,
  ProviderStatus,
  TransitRouteResult,
  TravelMode
} from "@/domain/types";

export interface TransitRouteInput {
  participant: ParticipantInput;
  from: Coordinate;
  to: Coordinate;
  departureTime?: string | null;
  direction: "outbound" | "return";
  mode: TravelMode;
}

export interface TransitMatrixInput {
  routes: TransitRouteInput[];
}

export interface TransitMatrixResult {
  results: TransitRouteResult[];
  warnings: string[];
}

export interface TransitRoutingProvider {
  getRoute(input: TransitRouteInput): Promise<TransitRouteResult>;
  getRouteMatrix?(input: TransitMatrixInput): Promise<TransitMatrixResult>;
  getStatus(): Promise<ProviderStatus>;
}

function haversineMinutes(from: Coordinate, to: Coordinate) {
  const earthKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const km = earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const transitMinutes = Math.round(km * 2.5 + 12);
  return { km, transitMinutes };
}

function routeRiskFromCoordinate(from: Coordinate, to: Coordinate) {
  const slopeSeed = Math.abs(Math.round((from.lat - to.lat) * 1000)) % 3;
  const stairsSeed = Math.abs(Math.round((from.lng - to.lng) * 1000)) % 3;
  return {
    slopeRisk: slopeSeed === 0 ? "flat" : slopeSeed === 1 ? "mild" : "steep",
    stairsRisk: stairsSeed === 0 ? "none" : stairsSeed === 1 ? "some" : "many",
    elevatorAvailable: stairsSeed !== 2
  } as const;
}

export class FixtureTransitProvider implements TransitRoutingProvider {
  async getRoute(input: TransitRouteInput): Promise<TransitRouteResult> {
    const now = new Date().toISOString();
    const { km, transitMinutes } = haversineMinutes(input.from, input.to);
    const walkMinutes = Math.max(4, Math.round(5 + (km % 2) * 4));
    const transfers = Math.min(3, Math.max(0, Math.round(km / 18)));
    const total = Math.round(transitMinutes + walkMinutes + transfers * 4);
    const fare = 1500 + Math.min(2800, Math.round(km / 10) * 200);
    const busRideCount = km > 22 ? 1 : 0;
    const subwayRideCount = Math.max(1, transfers + 1 - busRideCount);
    const risk = routeRiskFromCoordinate(input.from, input.to);
    const returnBuffer =
      input.direction === "return"
        ? sourced<number>(null, "unknown", null, 0.2, "Fixture provider does not know actual last-train schedules.")
        : sourced<number>(null, "unknown", null, 0.2, "Outbound route has no last-train relevance.");

    return {
      provider: "fixture-transit",
      direction: input.direction,
      isTimeDependent: false,
      totalTravelMinutes: sourced(total, "estimated", "fixture-transit", 0.82, "데모 데이터 - 정적 경로 추정입니다."),
      transitMinutes: sourced(transitMinutes, "estimated", "fixture-transit", 0.8),
      walkMinutes: sourced(walkMinutes, "estimated", "fixture-transit", 0.76),
      walkDistanceMeters: sourced(walkMinutes * 75, "estimated", "fixture-transit", 0.74),
      transfers: sourced(transfers, "estimated", "fixture-transit", 0.78),
      busRideCount: sourced(busRideCount, "estimated", "fixture-transit", 0.72),
      subwayRideCount: sourced(subwayRideCount, "estimated", "fixture-transit", 0.72),
      fareWon: sourced(fare, "estimated", "fixture-transit", 0.7),
      lastTransitBufferMinutes: returnBuffer,
      crowding: sourced(null, "unknown", null, 0.2, "Fixture provider does not provide live crowding."),
      stairsRisk: sourced(risk.stairsRisk, "estimated", "fixture-transit", 0.42, "Fixture accessibility is not verified."),
      slopeRisk: sourced(risk.slopeRisk, "estimated", "fixture-transit", 0.42, "Fixture slope is not verified."),
      elevatorAvailable: sourced(risk.elevatorAvailable, "estimated", "fixture-transit", 0.42, "Fixture elevator data is not verified."),
      steps: [
        {
          mode: "walk",
          name: "출발지 접근 도보",
          minutes: Math.ceil(walkMinutes / 2),
          from: input.direction === "outbound" ? "비공개 출발 권역" : "허브",
          to: "가까운 대중교통"
        },
        {
          mode: subwayRideCount > 0 ? "subway" : "bus",
          name: "정적 대중교통 추정",
          minutes: transitMinutes,
          from: "주요 정류장",
          to: "허브 인근 정류장"
        },
        {
          mode: "walk",
          name: "도착지 접근 도보",
          minutes: Math.floor(walkMinutes / 2),
          from: "허브 인근 정류장",
          to: input.direction === "outbound" ? "모임 허브" : "비공개 귀가 권역"
        }
      ],
      departureStop: "비공개 권역 인근",
      arrivalStop: "허브 인근",
      fetchedAt: now,
      warnings: ["데모 데이터입니다.", "실시간 대기시간과 막차 여유시간은 제공하지 않습니다."],
      error: null,
      missing: ["live wait time", "last transit schedule", "verified accessibility"]
    };
  }

  async getRouteMatrix(input: TransitMatrixInput): Promise<TransitMatrixResult> {
    const results = await Promise.all(input.routes.map((route) => this.getRoute(route)));
    return {
      results,
      warnings: ["Fixture matrix returned static estimates only."]
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      configured: true,
      reachable: true,
      dataReady: true,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 0,
      warning: "Fixture provider is active. Results must be labelled as demo data.",
      cacheUsed: false,
      lastSuccessAt: new Date().toISOString()
    };
  }
}

export class ODsayTransitProvider implements TransitRoutingProvider {
  private apiKey: string | undefined;

  constructor(apiKey = process.env.ODSAY_API_KEY) {
    this.apiKey = apiKey;
  }

  async getStatus(): Promise<ProviderStatus> {
    const started = performance.now();
    if (!this.apiKey) {
      return {
        configured: false,
        reachable: false,
        dataReady: false,
        lastCheckedAt: new Date().toISOString(),
        latencyMs: null,
        warning: "ODSAY_API_KEY is not configured.",
        cacheUsed: false,
        lastSuccessAt: null
      };
    }

    return {
      configured: true,
      reachable: false,
      dataReady: false,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - started),
      warning: "Live ODsay calls are disabled in this build unless explicitly integrated. ODsay public transit routing should be labelled as static route estimation, not real-time wait-time routing.",
      cacheUsed: false,
      lastSuccessAt: null
    };
  }

  async getRoute(_input: TransitRouteInput): Promise<TransitRouteResult> {
    throw new Error("ODsay live routing is not enabled. Use FixtureTransitProvider or implement the live adapter with server-only API keys.");
  }
}

export function getTransitProvider(mode: "fixture" | "live"): TransitRoutingProvider {
  if (mode === "live" && process.env.FAIRTURN_ENABLE_LIVE_PROVIDERS === "true") {
    return new ODsayTransitProvider();
  }
  return new FixtureTransitProvider();
}
