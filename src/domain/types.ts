export type DataStatus = "known" | "estimated" | "stale" | "unknown" | "error";

export interface SourcedValue<T> {
  value: T | null;
  status: DataStatus;
  source: string | null;
  fetchedAt: string | null;
  confidence: number;
  warning?: string;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export type TravelMode = "transit" | "walk" | "taxi" | "mixed";

export type ActivityType =
  | "meal"
  | "cafe"
  | "drinks"
  | "movie"
  | "exhibition"
  | "shopping"
  | "performance"
  | "walk"
  | "board_game"
  | "experience"
  | "sports";

export type MeetingState =
  | "draft"
  | "collecting"
  | "calculating"
  | "voting"
  | "region_locked"
  | "venue_voting"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "calculation_failed"
  | "expired";

export type CandidateType = "balanced" | "play" | "return_safe" | "fast";

export interface ParticipantConstraints {
  maxTravelMinutes?: number;
  maxTransfers?: number;
  maxWalkMinutes?: number;
  maxFareWon?: number;
  minLastTransitBufferMinutes?: number;
  avoidStairs?: boolean;
  avoidSlopes?: boolean;
  needsElevator?: boolean;
  wheelchairAccess?: boolean;
  unavailableModes?: TravelMode[];
}

export interface ParticipantPreferences {
  activityLikes: ActivityType[];
  activityDislikes: ActivityType[];
  placeCategoryLikes: string[];
  crowdingAvoidance: 0 | 1 | 2 | 3;
}

export interface PrivateLocationInput {
  label: string;
  coordinate: Coordinate;
  address?: string;
}

export interface ParticipantInput {
  id: string;
  displayName: string;
  profileId?: string | null;
  friendId?: string | null;
  coarseOriginLabel: string;
  origin: PrivateLocationInput;
  returnLocation: PrivateLocationInput;
  availableFrom?: string;
  desiredArrival?: string;
  expectedReturnStart?: string;
  mode: TravelMode;
  constraints: ParticipantConstraints;
  preferences: ParticipantPreferences;
  oldLedger: number;
  exactLocationConsent: boolean;
}

export interface MeetingHub {
  id: string;
  displayName: string;
  region: string;
  representative: Coordinate;
  searchRadiusMeters: number;
  stationIds: string[];
  busStopIds: string[];
  transitLineCount: SourcedValue<number>;
  poiDistribution: Record<string, SourcedValue<number>>;
  activityDistribution: Record<ActivityType, SourcedValue<number>>;
  eveningOpenRatio: SourcedValue<number>;
  commerceScore: SourcedValue<number>;
  floatingPopulation: SourcedValue<number>;
  crowding: SourcedValue<"relaxed" | "normal" | "crowded" | "very_crowded">;
  accessibilityCoverage: SourcedValue<number>;
  sources: string[];
  updatedAt: string;
  confidence: number;
  missing: string[];
}

export interface RouteStep {
  mode: "walk" | "bus" | "subway" | "rail" | "transfer";
  name: string;
  minutes: number;
  from?: string;
  to?: string;
}

export interface TransitRouteResult {
  provider: string;
  direction: "outbound" | "return";
  isTimeDependent: boolean;
  totalTravelMinutes: SourcedValue<number>;
  transitMinutes: SourcedValue<number>;
  walkMinutes: SourcedValue<number>;
  walkDistanceMeters: SourcedValue<number>;
  transfers: SourcedValue<number>;
  busRideCount: SourcedValue<number>;
  subwayRideCount: SourcedValue<number>;
  fareWon: SourcedValue<number>;
  lastTransitBufferMinutes: SourcedValue<number>;
  crowding: SourcedValue<"relaxed" | "normal" | "crowded" | "very_crowded">;
  stairsRisk: SourcedValue<"none" | "some" | "many">;
  slopeRisk: SourcedValue<"flat" | "mild" | "steep">;
  elevatorAvailable: SourcedValue<boolean>;
  steps: RouteStep[];
  departureStop: string | null;
  arrivalStop: string | null;
  fetchedAt: string;
  warnings: string[];
  error: string | null;
  missing: string[];
}

export interface ParticipantRoutePair {
  participantId: string;
  outbound: TransitRouteResult;
  returnRoute: TransitRouteResult | null;
}

export interface PersonalBurden {
  participantId: string;
  participantName: string;
  total: number | null;
  components: {
    time: SourcedValue<number>;
    transfers: SourcedValue<number>;
    walk: SourcedValue<number>;
    fare: SourcedValue<number>;
    returnRisk: SourcedValue<number>;
    crowdAccessibility: SourcedValue<number>;
  };
  confirmedWeightRatio: number;
  warnings: string[];
  hardConstraintViolations: ConstraintViolation[];
}

export interface ConstraintViolation {
  participantId: string;
  participantName: string;
  constraint: keyof ParticipantConstraints | "returnRoute";
  actual: number | string | boolean | null;
  limit: number | string | boolean | null;
  excess: number;
  message: string;
}

export interface ScoreComponents {
  efficiency: number;
  worstPersonProtection: number;
  currentFairness: number;
  cumulativeBalance: number;
  hubQuality: number;
  groupPreferenceFit: number;
  excessiveCrowdingPenalty: number;
  finalScore: number;
}

export interface MeetingCandidate {
  id: string;
  meetingId: string;
  revision: number;
  hub: MeetingHub;
  burdens: PersonalBurden[];
  routePairs: ParticipantRoutePair[];
  score: ScoreComponents;
  candidateTypes: CandidateType[];
  confidence: number;
  warnings: string[];
  missing: string[];
  explanationFacts: ExplanationFact[];
  relaxation?: RelaxationSuggestion;
}

export interface ExplanationFact {
  label: string;
  value: string;
  tone: "positive" | "neutral" | "warning";
}

export interface RelaxationSuggestion {
  candidateHubId: string;
  candidateHubName: string;
  totalExcess: number;
  violations: ConstraintViolation[];
  message: string;
}

export interface RecommendationRequest {
  meetingId: string;
  revision: number;
  startsAt: string;
  expectedEndsAt?: string | null;
  activityTypes: ActivityType[];
  candidateCount: number;
  preset: ScoringPreset;
  weights: ScoringWeights;
  participants: ParticipantInput[];
  providerMode: "fixture" | "live";
}

export interface RecommendationResponse {
  ok: boolean;
  revision: number;
  providerMode: "fixture" | "live";
  demoData: boolean;
  status: "ready" | "no_candidates" | "partial" | "error";
  candidates: MeetingCandidate[];
  relaxation: RelaxationSuggestion | null;
  validationWarnings: string[];
  providerWarnings: string[];
  calculatedAt: string;
}

export type ScoringPreset =
  | "balanced"
  | "time_first"
  | "hub_first"
  | "late_return"
  | "fare_first"
  | "accessibility_first";

export interface ScoringWeights {
  efficiency: number;
  worstPersonProtection: number;
  cumulativeBalance: number;
  hubQuality: number;
  groupPreferenceFit: number;
}

export interface ProviderStatus {
  configured: boolean;
  reachable: boolean;
  dataReady: boolean;
  lastCheckedAt: string;
  latencyMs: number | null;
  warning: string | null;
  cacheUsed?: boolean;
  lastSuccessAt?: string | null;
}

export interface VoteInput {
  meetingId: string;
  revision: number;
  participantId: string;
  candidateId: string;
  createdAt: string;
}

export interface VoteSettings {
  anonymous: boolean;
  changeAllowed: boolean;
  deadline: string | null;
  autoTieBreak: boolean;
}

export interface VoteResult {
  winningCandidateId: string | null;
  tiedCandidateIds: string[];
  missingParticipantIds: string[];
  reason: string;
}

export interface BurdenLedger {
  groupId: string;
  stableParticipantId: string;
  cumulativeBurden: number;
  meetingCount: number;
  lastUpdatedAt: string;
}

export interface LedgerEntry {
  ledgerId: string;
  meetingId: string;
  predictedBurden: number;
  confirmedBurden: number;
  groupMean: number;
  delta: number;
  reason: string;
  reversibleHistory: Array<{
    at: string;
    previousBurden: number;
    nextBurden: number;
    reason: string;
  }>;
}

export interface VenueOption {
  id: string;
  meetingId: string;
  hubId: string;
  externalPlaceId: string;
  displayName: string;
  category: string;
  coordinate: Coordinate;
  provider: string;
  placeUrl: string | null;
  score: number;
  distanceFromHubMeters: SourcedValue<number>;
  popularity: SourcedValue<number>;
  openingStatus: SourcedValue<"likely_open" | "unknown" | "closed">;
  sourceMetadata: {
    fetchedAt: string;
    rawStoragePolicy: string;
  };
}
