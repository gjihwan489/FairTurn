import { DEFAULT_SCORE_WEIGHTS, sourced } from "@/domain/config";
import type {
  ActivityType,
  MeetingCandidate,
  ParticipantInput,
  RecommendationRequest,
  TransitRouteResult
} from "@/domain/types";

export const locations = {
  seongnam: { label: "성남", coordinate: { lat: 37.3826, lng: 127.1189 }, address: "경기 성남시 분당구" },
  bucheon: { label: "부천", coordinate: { lat: 37.5035, lng: 126.766 }, address: "경기 부천시" },
  sinchon: { label: "신촌", coordinate: { lat: 37.5598, lng: 126.9424 }, address: "서울 서대문구 신촌" },
  gwangmyeong: { label: "광명", coordinate: { lat: 37.4786, lng: 126.8646 }, address: "경기 광명시" }
};

export function participant(id: string, displayName: string, locationKey: keyof typeof locations, oldLedger = 0): ParticipantInput {
  const location = locations[locationKey];
  return {
    id,
    displayName,
    friendId: id,
    profileId: null,
    coarseOriginLabel: location.label,
    origin: location,
    returnLocation: location,
    mode: "transit",
    constraints: {
      maxTravelMinutes: 90,
      maxTransfers: 3,
      maxWalkMinutes: 20,
      maxFareWon: 9000,
      minLastTransitBufferMinutes: 20,
      avoidStairs: false,
      avoidSlopes: false,
      needsElevator: false,
      wheelchairAccess: false,
      unavailableModes: []
    },
    preferences: {
      activityLikes: ["meal", "cafe"],
      activityDislikes: [],
      placeCategoryLikes: ["식당", "카페"],
      crowdingAvoidance: 2
    },
    oldLedger,
    exactLocationConsent: false
  };
}

export function route(overrides: Partial<TransitRouteResult> = {}): TransitRouteResult {
  const base: TransitRouteResult = {
    provider: "test",
    direction: "outbound",
    isTimeDependent: false,
    totalTravelMinutes: sourced(45, "known", "test", 1),
    transitMinutes: sourced(35, "known", "test", 1),
    walkMinutes: sourced(10, "known", "test", 1),
    walkDistanceMeters: sourced(750, "known", "test", 1),
    transfers: sourced(1, "known", "test", 1),
    busRideCount: sourced(0, "known", "test", 1),
    subwayRideCount: sourced(1, "known", "test", 1),
    fareWon: sourced(1600, "known", "test", 1),
    lastTransitBufferMinutes: sourced(65, "known", "test", 1),
    crowding: sourced("normal", "known", "test", 1),
    stairsRisk: sourced("none", "known", "test", 1),
    slopeRisk: sourced("flat", "known", "test", 1),
    elevatorAvailable: sourced(true, "known", "test", 1),
    steps: [],
    departureStop: "A",
    arrivalStop: "B",
    fetchedAt: "2026-09-16T00:00:00.000Z",
    warnings: [],
    error: null,
    missing: []
  };
  return { ...base, ...overrides };
}

export function request(participants = [
  participant("p1", "서연", "seongnam", 24),
  participant("p2", "민준", "bucheon", -8),
  participant("p3", "하린", "sinchon", -4),
  participant("p4", "지환", "gwangmyeong", -12)
]): RecommendationRequest {
  return {
    meetingId: "meeting-test",
    revision: 1,
    startsAt: "2026-09-18T19:00:00.000Z",
    expectedEndsAt: "2026-09-18T22:00:00.000Z",
    activityTypes: ["meal", "cafe", "drinks"] as ActivityType[],
    candidateCount: 4,
    preset: "balanced",
    weights: DEFAULT_SCORE_WEIGHTS,
    participants,
    providerMode: "fixture"
  };
}

export function minimalCandidate(id: string, finalScore: number, cumulative = 80, worst = 80): MeetingCandidate {
  return {
    id,
    meetingId: "m1",
    revision: 1,
    hub: {
      id,
      displayName: id,
      region: "서울",
      representative: { lat: 37.5, lng: 127 },
      searchRadiusMeters: 500,
      stationIds: [],
      busStopIds: [],
      transitLineCount: sourced(1, "known", "test", 1),
      poiDistribution: {},
      activityDistribution: {} as MeetingCandidate["hub"]["activityDistribution"],
      eveningOpenRatio: sourced(0.5, "known", "test", 1),
      commerceScore: sourced(50, "known", "test", 1),
      floatingPopulation: sourced(50, "known", "test", 1),
      crowding: sourced("normal", "known", "test", 1),
      accessibilityCoverage: sourced(null, "unknown", null, 0.2),
      sources: ["test"],
      updatedAt: "2026-09-16T00:00:00.000Z",
      confidence: 0.9,
      missing: []
    },
    burdens: [],
    routePairs: [],
    score: {
      efficiency: finalScore,
      worstPersonProtection: worst,
      currentFairness: 90,
      cumulativeBalance: cumulative,
      hubQuality: finalScore,
      groupPreferenceFit: finalScore,
      excessiveCrowdingPenalty: 0,
      finalScore
    },
    candidateTypes: [],
    confidence: 0.9,
    warnings: [],
    missing: [],
    explanationFacts: []
  };
}
