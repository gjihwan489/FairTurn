import { MAX_DETAILED_HUBS, MAX_PRIMARY_HUBS, PRESET_WEIGHTS } from "./config";
import { MEETING_HUBS } from "./hubs";
import {
  assignCandidateTypes,
  calculateCandidateScore,
  calculatePersonalBurden,
  candidateConfidence,
  explanationFacts,
  findMinimalRelaxation,
  hasHardConstraintFailure,
  mean
} from "./scoring";
import type {
  MeetingCandidate,
  MeetingHub,
  ParticipantInput,
  ParticipantRoutePair,
  RecommendationRequest,
  RecommendationResponse,
  ScoringWeights,
  VenueOption
} from "./types";
import { getPlaceProvider } from "@/providers/place";
import { getTransitProvider, type TransitRoutingProvider } from "@/providers/transit";

export function validateRecommendationRequest(request: RecommendationRequest) {
  const warnings: string[] = [];
  if (request.participants.length < 2) warnings.push("최소 2명 이상의 참여자가 필요합니다.");
  for (const participant of request.participants) {
    if (!participant.origin?.coordinate || !participant.returnLocation?.coordinate) {
      warnings.push(`${participant.displayName}의 출발지 또는 귀가 목적지가 누락되었습니다.`);
    }
    if (!participant.coarseOriginLabel) warnings.push(`${participant.displayName}의 공유용 출발 권역이 없습니다.`);
  }
  if (request.candidateCount < 1) warnings.push("후보 개수는 1개 이상이어야 합니다.");
  return warnings;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function geographicCenter(participants: ParticipantInput[]) {
  return {
    lat: mean(participants.map((participant) => participant.origin.coordinate.lat)),
    lng: mean(participants.map((participant) => participant.origin.coordinate.lng))
  };
}

export function selectPrimaryHubs(participants: ParticipantInput[], max = MAX_PRIMARY_HUBS) {
  const center = geographicCenter(participants);
  return [...MEETING_HUBS]
    .map((hub) => ({
      hub,
      distance: haversineKm(center, hub.representative)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max)
    .map((item) => item.hub);
}

async function buildRoutePairs(
  provider: TransitRoutingProvider,
  request: RecommendationRequest,
  hub: MeetingHub
): Promise<ParticipantRoutePair[]> {
  return Promise.all(
    request.participants.map(async (participant) => {
      const outbound = await provider.getRoute({
        participant,
        from: participant.origin.coordinate,
        to: hub.representative,
        departureTime: request.startsAt,
        direction: "outbound",
        mode: participant.mode
      });
      const returnRoute = request.expectedEndsAt
        ? await provider.getRoute({
            participant,
            from: hub.representative,
            to: participant.returnLocation.coordinate,
            departureTime: request.expectedEndsAt,
            direction: "return",
            mode: participant.mode
          })
        : null;
      return {
        participantId: participant.id,
        outbound,
        returnRoute
      };
    })
  );
}

function buildCandidate(
  request: RecommendationRequest,
  hub: MeetingHub,
  routePairs: ParticipantRoutePair[],
  weights: ScoringWeights
): MeetingCandidate {
  const burdens = routePairs.map((pair) => {
    const participant = request.participants.find((item) => item.id === pair.participantId);
    if (!participant) {
      throw new Error(`Participant not found for route pair: ${pair.participantId}`);
    }
    return calculatePersonalBurden(participant, pair.outbound, pair.returnRoute);
  });
  const score = calculateCandidateScore({
    participants: request.participants,
    hub,
    burdens,
    activityTypes: request.activityTypes,
    weights
  });
  const candidate: MeetingCandidate = {
    id: `${request.meetingId}-${request.revision}-${hub.id}`,
    meetingId: request.meetingId,
    revision: request.revision,
    hub,
    burdens,
    routePairs,
    score,
    candidateTypes: [],
    confidence: 0,
    warnings: [
      ...new Set([
        ...burdens.flatMap((burden) => burden.warnings),
        ...routePairs.flatMap((pair) => [...pair.outbound.warnings, ...(pair.returnRoute?.warnings ?? [])])
      ])
    ],
    missing: [
      ...new Set([
        ...hub.missing,
        ...routePairs.flatMap((pair) => [...pair.outbound.missing, ...(pair.returnRoute?.missing ?? [])])
      ])
    ],
    explanationFacts: []
  };
  candidate.confidence = candidateConfidence(candidate);
  candidate.explanationFacts = explanationFacts(candidate);
  return candidate;
}

export async function calculateRecommendations(request: RecommendationRequest): Promise<RecommendationResponse> {
  const validationWarnings = validateRecommendationRequest(request);
  const calculatedAt = new Date().toISOString();
  if (validationWarnings.some((warning) => warning.includes("최소 2명"))) {
    return {
      ok: false,
      revision: request.revision,
      providerMode: request.providerMode,
      demoData: request.providerMode === "fixture",
      status: "error",
      candidates: [],
      relaxation: null,
      validationWarnings,
      providerWarnings: [],
      calculatedAt
    };
  }

  const provider = getTransitProvider(request.providerMode);
  const weights = request.weights ?? PRESET_WEIGHTS[request.preset] ?? PRESET_WEIGHTS.balanced;
  const primaryHubs = selectPrimaryHubs(request.participants, MAX_PRIMARY_HUBS);
  const firstPassCandidates = await Promise.all(
    primaryHubs.map(async (hub) => buildCandidate(request, hub, await buildRoutePairs(provider, request, hub), weights))
  );

  const possibleFirstPass = firstPassCandidates
    .filter((candidate) => !hasHardConstraintFailure(candidate))
    .sort((a, b) => b.score.finalScore - a.score.finalScore);
  const detailedBase = (possibleFirstPass.length > 0 ? possibleFirstPass : firstPassCandidates)
    .slice(0, MAX_DETAILED_HUBS)
    .sort((a, b) => b.score.finalScore - a.score.finalScore);

  const possibleDetailed = detailedBase.filter((candidate) => !hasHardConstraintFailure(candidate));
  if (possibleDetailed.length === 0) {
    const relaxation = findMinimalRelaxation(firstPassCandidates);
    return {
      ok: false,
      revision: request.revision,
      providerMode: request.providerMode,
      demoData: request.providerMode === "fixture",
      status: "no_candidates",
      candidates: [],
      relaxation,
      validationWarnings,
      providerWarnings: ["모든 후보가 하나 이상의 필수 조건을 위반했습니다."],
      calculatedAt
    };
  }

  const selected = assignCandidateTypes(possibleDetailed, Math.max(3, Math.min(4, request.candidateCount)));
  return {
    ok: true,
    revision: request.revision,
    providerMode: request.providerMode,
    demoData: request.providerMode === "fixture",
    status: selected.length < request.candidateCount ? "partial" : "ready",
    candidates: selected,
    relaxation: null,
    validationWarnings,
    providerWarnings: request.providerMode === "fixture" ? ["Fixture Provider 사용 중: 화면에 데모 데이터로 표시해야 합니다."] : [],
    calculatedAt
  };
}

export async function recommendVenuesForCandidate(candidate: MeetingCandidate, categories: string[]): Promise<VenueOption[]> {
  const provider = getPlaceProvider("fixture");
  return provider.searchVenues({
    meetingId: candidate.meetingId,
    hubId: candidate.hub.id,
    hubName: candidate.hub.displayName,
    categories,
    radiusMeters: candidate.hub.searchRadiusMeters
  });
}
