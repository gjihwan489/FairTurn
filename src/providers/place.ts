import type { ProviderStatus, VenueOption } from "@/domain/types";

export interface PlaceProvider {
  getStatus(): Promise<ProviderStatus>;
  searchVenues(input: {
    meetingId: string;
    hubId: string;
    hubName: string;
    categories: string[];
    radiusMeters: number;
  }): Promise<VenueOption[]>;
}

export class FixturePlaceProvider implements PlaceProvider {
  async getStatus(): Promise<ProviderStatus> {
    return {
      configured: true,
      reachable: true,
      dataReady: true,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 0,
      warning: "Fixture place provider is active. Place popularity and opening status are not live data.",
      cacheUsed: false,
      lastSuccessAt: new Date().toISOString()
    };
  }

  async searchVenues(input: {
    meetingId: string;
    hubId: string;
    hubName: string;
    categories: string[];
    radiusMeters: number;
  }): Promise<VenueOption[]> {
    const now = new Date().toISOString();
    const categories = input.categories.length > 0 ? input.categories : ["식당", "카페", "술집"];
    return categories.slice(0, 4).map((category, index) => ({
      id: `${input.meetingId}-${input.hubId}-venue-${index + 1}`,
      meetingId: input.meetingId,
      hubId: input.hubId,
      externalPlaceId: `fixture-${input.hubId}-${index + 1}`,
      displayName: `${input.hubName} ${category} 후보 ${index + 1}`,
      category,
      coordinate: { lat: 37.5 + index * 0.001, lng: 126.95 + index * 0.001 },
      provider: "fixture-place",
      placeUrl: null,
      score: 82 - index * 5,
      distanceFromHubMeters: {
        value: 180 + index * 90,
        status: "estimated",
        source: "fixture-place",
        fetchedAt: now,
        confidence: 0.65
      },
      popularity: {
        value: null,
        status: "unknown",
        source: null,
        fetchedAt: null,
        confidence: 0.2,
        warning: "Popularity is not provided by fixture data."
      },
      openingStatus: {
        value: "unknown",
        status: "unknown",
        source: null,
        fetchedAt: null,
        confidence: 0.2,
        warning: "Opening hours are not verified."
      },
      sourceMetadata: {
        fetchedAt: now,
        rawStoragePolicy: "No raw provider response stored in fixture mode."
      }
    }));
  }
}

export class KakaoPlaceProvider implements PlaceProvider {
  private restApiKey: string | undefined;

  constructor(restApiKey = process.env.KAKAO_REST_API_KEY) {
    this.restApiKey = restApiKey;
  }

  async getStatus(): Promise<ProviderStatus> {
    if (!this.restApiKey) {
      return {
        configured: false,
        reachable: false,
        dataReady: false,
        lastCheckedAt: new Date().toISOString(),
        latencyMs: null,
        warning: "KAKAO_REST_API_KEY is not configured.",
        cacheUsed: false,
        lastSuccessAt: null
      };
    }
    return {
      configured: true,
      reachable: false,
      dataReady: false,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: null,
      warning: "Kakao Local live calls are server-only and not enabled in fixture mode.",
      cacheUsed: false,
      lastSuccessAt: null
    };
  }

  async searchVenues(): Promise<VenueOption[]> {
    throw new Error("Kakao live venue search is not enabled in fixture mode.");
  }
}

export function getPlaceProvider(mode: "fixture" | "live"): PlaceProvider {
  if (mode === "live" && process.env.FAIRTURN_ENABLE_LIVE_PROVIDERS === "true") {
    return new KakaoPlaceProvider();
  }
  return new FixturePlaceProvider();
}
