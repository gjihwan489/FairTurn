import {
  DEFAULT_FARE_CAP_WON,
  DEFAULT_MAX_TRANSFERS,
  DEFAULT_MAX_TRAVEL_MINUTES,
  DEFAULT_MAX_WALK_MINUTES,
  FAIRNESS_STDDEV_CAP,
  LEDGER_DECAY
} from "./config";
import type {
  ActivityType,
  CandidateType,
  ConstraintViolation,
  MeetingCandidate,
  MeetingHub,
  ParticipantConstraints,
  ParticipantInput,
  ParticipantRoutePair,
  PersonalBurden,
  RelaxationSuggestion,
  ScoreComponents,
  ScoringWeights,
  SourcedValue,
  TransitRouteResult
} from "./types";

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stddev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

export function known<T>(value: SourcedValue<T>) {
  return value.status === "known" || value.status === "estimated" || value.status === "stale";
}

function sourcedScore(
  value: number | null,
  status: SourcedValue<unknown>["status"],
  source: string | null,
  confidence: number,
  warning?: string
): SourcedValue<number> {
  return {
    value,
    status,
    source,
    fetchedAt: status === "unknown" ? null : new Date().toISOString(),
    confidence,
    warning
  };
}

export function lastTransitRisk(buffer: SourcedValue<number>): SourcedValue<number> {
  if (!known(buffer) || buffer.value === null) {
    return sourcedScore(
      null,
      buffer.status,
      buffer.source,
      buffer.confidence,
      buffer.warning ?? "막차 여유시간을 확인하지 못했습니다."
    );
  }
  if (buffer.value >= 60) return sourcedScore(0, buffer.status, buffer.source, buffer.confidence);
  if (buffer.value >= 30) return sourcedScore(25, buffer.status, buffer.source, buffer.confidence);
  if (buffer.value >= 15) return sourcedScore(60, buffer.status, buffer.source, buffer.confidence);
  if (buffer.value >= 1) return sourcedScore(85, buffer.status, buffer.source, buffer.confidence);
  return sourcedScore(100, buffer.status, buffer.source, buffer.confidence);
}

function crowdScore(route: TransitRouteResult) {
  if (!known(route.crowding) || route.crowding.value === null) {
    return sourcedScore(
      null,
      route.crowding.status,
      route.crowding.source,
      route.crowding.confidence,
      route.crowding.warning ?? "혼잡도를 확인하지 못했습니다."
    );
  }
  const values = {
    relaxed: 0,
    normal: 25,
    crowded: 60,
    very_crowded: 90
  };
  return sourcedScore(values[route.crowding.value], route.crowding.status, route.crowding.source, route.crowding.confidence);
}

function accessibilityScore(route: TransitRouteResult, constraints: ParticipantConstraints) {
  const scores: SourcedValue<number>[] = [];
  if (constraints.avoidStairs || constraints.wheelchairAccess) {
    if (known(route.stairsRisk) && route.stairsRisk.value !== null) {
      const value = route.stairsRisk.value === "none" ? 0 : route.stairsRisk.value === "some" ? 55 : 95;
      scores.push(sourcedScore(value, route.stairsRisk.status, route.stairsRisk.source, route.stairsRisk.confidence));
    } else {
      scores.push(
        sourcedScore(
          null,
          route.stairsRisk.status,
          route.stairsRisk.source,
          route.stairsRisk.confidence,
          "정확한 계단 데이터를 확인하지 못했습니다."
        )
      );
    }
  }
  if (constraints.avoidSlopes) {
    if (known(route.slopeRisk) && route.slopeRisk.value !== null) {
      const value = route.slopeRisk.value === "flat" ? 0 : route.slopeRisk.value === "mild" ? 35 : 90;
      scores.push(sourcedScore(value, route.slopeRisk.status, route.slopeRisk.source, route.slopeRisk.confidence));
    } else {
      scores.push(
        sourcedScore(
          null,
          route.slopeRisk.status,
          route.slopeRisk.source,
          route.slopeRisk.confidence,
          "정확한 경사 데이터를 확인하지 못했습니다."
        )
      );
    }
  }
  if (constraints.needsElevator || constraints.wheelchairAccess) {
    if (known(route.elevatorAvailable) && route.elevatorAvailable.value !== null) {
      scores.push(
        sourcedScore(route.elevatorAvailable.value ? 0 : 100, route.elevatorAvailable.status, route.elevatorAvailable.source, route.elevatorAvailable.confidence)
      );
    } else {
      scores.push(
        sourcedScore(
          null,
          route.elevatorAvailable.status,
          route.elevatorAvailable.source,
          route.elevatorAvailable.confidence,
          "엘리베이터 이용 가능 여부를 확인하지 못했습니다."
        )
      );
    }
  }
  const available = scores.filter((score) => known(score) && score.value !== null);
  if (available.length === 0) {
    return sourcedScore(null, "unknown", null, 0.2, "접근성 데이터가 부족합니다.");
  }
  return sourcedScore(mean(available.map((score) => score.value ?? 0)), "estimated", "route-accessibility", mean(available.map((score) => score.confidence)));
}

function combineCrowdAccessibility(route: TransitRouteResult, constraints: ParticipantConstraints) {
  const crowd = crowdScore(route);
  const access = accessibilityScore(route, constraints);
  const available = [crowd, access].filter((score) => known(score) && score.value !== null);
  if (available.length === 0) {
    return sourcedScore(null, "unknown", null, 0.2, "혼잡·접근성 데이터가 모두 미확인입니다.");
  }
  return sourcedScore(mean(available.map((score) => score.value ?? 0)), "estimated", "crowd-accessibility", mean(available.map((score) => score.confidence)));
}

export function evaluateHardConstraints(
  participant: ParticipantInput,
  route: TransitRouteResult,
  returnRoute: TransitRouteResult | null
): ConstraintViolation[] {
  const constraints = participant.constraints;
  const violations: ConstraintViolation[] = [];
  const pushViolation = (
    constraint: ConstraintViolation["constraint"],
    actual: number | string | boolean | null,
    limit: number | string | boolean | null,
    excess: number,
    message: string
  ) => {
    violations.push({
      participantId: participant.id,
      participantName: participant.displayName,
      constraint,
      actual,
      limit,
      excess,
      message
    });
  };

  if (route.totalTravelMinutes.value === null || !known(route.totalTravelMinutes)) {
    pushViolation("maxTravelMinutes", null, constraints.maxTravelMinutes ?? DEFAULT_MAX_TRAVEL_MINUTES, 100, "이동시간이 없어 추천 경로로 사용할 수 없습니다.");
    return violations;
  }
  const maxTravel = constraints.maxTravelMinutes;
  if (maxTravel !== undefined && route.totalTravelMinutes.value > maxTravel) {
    pushViolation("maxTravelMinutes", route.totalTravelMinutes.value, maxTravel, route.totalTravelMinutes.value - maxTravel, `${participant.displayName}의 최대 이동시간을 초과합니다.`);
  }
  if (constraints.maxTransfers !== undefined && known(route.transfers) && route.transfers.value !== null && route.transfers.value > constraints.maxTransfers) {
    pushViolation("maxTransfers", route.transfers.value, constraints.maxTransfers, route.transfers.value - constraints.maxTransfers, `${participant.displayName}의 최대 환승 횟수를 초과합니다.`);
  }
  if (constraints.maxWalkMinutes !== undefined && known(route.walkMinutes) && route.walkMinutes.value !== null && route.walkMinutes.value > constraints.maxWalkMinutes) {
    pushViolation("maxWalkMinutes", route.walkMinutes.value, constraints.maxWalkMinutes, route.walkMinutes.value - constraints.maxWalkMinutes, `${participant.displayName}의 최대 도보시간을 초과합니다.`);
  }
  if (constraints.maxFareWon !== undefined && known(route.fareWon) && route.fareWon.value !== null && route.fareWon.value > constraints.maxFareWon) {
    pushViolation("maxFareWon", route.fareWon.value, constraints.maxFareWon, route.fareWon.value - constraints.maxFareWon, `${participant.displayName}의 최대 교통비를 초과합니다.`);
  }
  if (constraints.minLastTransitBufferMinutes !== undefined) {
    const buffer = returnRoute?.lastTransitBufferMinutes ?? route.lastTransitBufferMinutes;
    if (known(buffer) && buffer.value !== null && buffer.value < constraints.minLastTransitBufferMinutes) {
      pushViolation(
        "minLastTransitBufferMinutes",
        buffer.value,
        constraints.minLastTransitBufferMinutes,
        constraints.minLastTransitBufferMinutes - buffer.value,
        `${participant.displayName}의 막차 여유시간 조건을 만족하지 못합니다.`
      );
    }
  }
  if (constraints.needsElevator && known(route.elevatorAvailable) && route.elevatorAvailable.value === false) {
    pushViolation("needsElevator", false, true, 100, `${participant.displayName}에게 엘리베이터가 필요한 경로입니다.`);
  }
  return violations;
}

export function calculatePersonalBurden(
  participant: ParticipantInput,
  route: TransitRouteResult,
  returnRoute: TransitRouteResult | null
): PersonalBurden {
  const constraints = participant.constraints;
  const maxTravel = constraints.maxTravelMinutes ?? DEFAULT_MAX_TRAVEL_MINUTES;
  const transferCap = constraints.maxTransfers ?? DEFAULT_MAX_TRANSFERS;
  const maxWalk = constraints.maxWalkMinutes ?? DEFAULT_MAX_WALK_MINUTES;
  const warnings: string[] = [...route.warnings];
  if (maxTravel === DEFAULT_MAX_TRAVEL_MINUTES && constraints.maxTravelMinutes === undefined) warnings.push("최대 이동시간 기본값 90분을 사용했습니다.");
  if (maxWalk === DEFAULT_MAX_WALK_MINUTES && constraints.maxWalkMinutes === undefined) warnings.push("최대 도보시간 기본값 20분을 사용했습니다.");

  const time = known(route.totalTravelMinutes) && route.totalTravelMinutes.value !== null
    ? sourcedScore(clamp(route.totalTravelMinutes.value / maxTravel) * 100, route.totalTravelMinutes.status, route.totalTravelMinutes.source, route.totalTravelMinutes.confidence)
    : sourcedScore(null, route.totalTravelMinutes.status, route.totalTravelMinutes.source, route.totalTravelMinutes.confidence, "이동시간은 핵심 항목이므로 없으면 추천에 사용할 수 없습니다.");

  const transfers = known(route.transfers) && route.transfers.value !== null
    ? sourcedScore(clamp(route.transfers.value / transferCap) * 100, route.transfers.status, route.transfers.source, route.transfers.confidence)
    : sourcedScore(null, route.transfers.status, route.transfers.source, route.transfers.confidence, "환승 횟수를 확인하지 못했습니다.");

  const walk = known(route.walkMinutes) && route.walkMinutes.value !== null
    ? sourcedScore(clamp(route.walkMinutes.value / maxWalk) * 100, route.walkMinutes.status, route.walkMinutes.source, route.walkMinutes.confidence)
    : sourcedScore(null, route.walkMinutes.status, route.walkMinutes.source, route.walkMinutes.confidence, "도보시간을 확인하지 못했습니다.");

  const fare = known(route.fareWon) && route.fareWon.value !== null
    ? sourcedScore(clamp(route.fareWon.value / DEFAULT_FARE_CAP_WON) * 100, route.fareWon.status, route.fareWon.source, route.fareWon.confidence)
    : sourcedScore(null, route.fareWon.status, route.fareWon.source, route.fareWon.confidence, "교통비를 확인하지 못했습니다.");

  const returnRisk = lastTransitRisk(returnRoute?.lastTransitBufferMinutes ?? route.lastTransitBufferMinutes);
  const crowdAccessibility = combineCrowdAccessibility(route, constraints);

  const weighted = [
    { score: time, weight: 0.45 },
    { score: transfers, weight: 0.15 },
    { score: walk, weight: 0.1 },
    { score: fare, weight: 0.05 },
    { score: returnRisk, weight: 0.15 },
    { score: crowdAccessibility, weight: 0.1 }
  ];

  if (time.value === null || !known(time)) {
    return {
      participantId: participant.id,
      participantName: participant.displayName,
      total: null,
      components: { time, transfers, walk, fare, returnRisk, crowdAccessibility },
      confirmedWeightRatio: 0,
      warnings,
      hardConstraintViolations: evaluateHardConstraints(participant, route, returnRoute)
    };
  }

  const available = weighted.filter(({ score }) => known(score) && score.value !== null);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const total = available.reduce((sum, item) => sum + ((item.score.value ?? 0) * item.weight) / availableWeight, 0);

  for (const item of weighted) {
    if (!known(item.score) || item.score.value === null) {
      warnings.push(item.score.warning ?? "일부 부담 항목이 미확인입니다.");
    }
  }

  return {
    participantId: participant.id,
    participantName: participant.displayName,
    total,
    components: { time, transfers, walk, fare, returnRisk, crowdAccessibility },
    confirmedWeightRatio: availableWeight,
    warnings,
    hardConstraintViolations: evaluateHardConstraints(participant, route, returnRoute)
  };
}

export function updateLedger(oldLedger: number, currentBurden: number, groupMeanBurden: number) {
  return LEDGER_DECAY * oldLedger + currentBurden - groupMeanBurden;
}

export function provisionalLedgers(participants: ParticipantInput[], burdens: PersonalBurden[]) {
  const usable = burdens.filter((burden) => burden.total !== null);
  const groupMean = mean(usable.map((burden) => burden.total ?? 0));
  return usable.map((burden) => {
    const participant = participants.find((item) => item.id === burden.participantId);
    return {
      participantId: burden.participantId,
      value: updateLedger(participant?.oldLedger ?? 0, burden.total ?? 0, groupMean)
    };
  });
}

function entropyScore(distribution: number[]) {
  const positive = distribution.filter((value) => value > 0);
  if (positive.length <= 1) return positive.length === 1 ? 20 : 0;
  const total = positive.reduce((sum, value) => sum + value, 0);
  const entropy = -positive.reduce((sum, value) => {
    const p = value / total;
    return sum + p * Math.log(p);
  }, 0);
  return clamp(entropy / Math.log(positive.length)) * 100;
}

export function calculateHubQuality(hub: MeetingHub) {
  const poiValues = Object.values(hub.poiDistribution).filter((value) => known(value) && value.value !== null).map((value) => value.value ?? 0);
  const diversity = entropyScore(poiValues);
  const evening = known(hub.eveningOpenRatio) && hub.eveningOpenRatio.value !== null ? hub.eveningOpenRatio.value * 100 : null;
  const transit = known(hub.transitLineCount) && hub.transitLineCount.value !== null ? clamp(hub.transitLineCount.value / 5) * 100 : null;
  const floating = known(hub.floatingPopulation) && hub.floatingPopulation.value !== null ? hub.floatingPopulation.value : null;
  const anchor = known(hub.commerceScore) && hub.commerceScore.value !== null ? hub.commerceScore.value : null;
  const parts = [
    { value: diversity, weight: 0.35 },
    { value: evening, weight: 0.25 },
    { value: transit, weight: 0.2 },
    { value: floating, weight: 0.1 },
    { value: anchor, weight: 0.1 }
  ].filter((part) => part.value !== null);
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return 0;
  return parts.reduce((sum, part) => sum + ((part.value ?? 0) * part.weight) / totalWeight, 0);
}

export function calculatePreferenceFit(hub: MeetingHub, participants: ParticipantInput[], activityTypes: ActivityType[]) {
  const requested = new Set(activityTypes);
  const values: number[] = [];
  for (const participant of participants) {
    const likes = new Set(participant.preferences.activityLikes);
    const dislikes = new Set(participant.preferences.activityDislikes);
    let score = 50;
    for (const activity of activitiesInHub(hub)) {
      const availability = hub.activityDistribution[activity];
      const availabilityScore = known(availability) && availability.value !== null ? availability.value / 100 : 0.5;
      if (requested.has(activity)) score += 8 * availabilityScore;
      if (likes.has(activity)) score += 5 * availabilityScore;
      if (dislikes.has(activity)) score -= 7 * availabilityScore;
    }
    values.push(clamp(score / 100, 0, 1) * 100);
  }
  return mean(values);
}

function activitiesInHub(hub: MeetingHub) {
  return Object.keys(hub.activityDistribution) as ActivityType[];
}

export function crowdingPenalty(hub: MeetingHub) {
  if (!known(hub.crowding) || hub.crowding.value === null) return 0;
  if (hub.crowding.value === "very_crowded") return 12;
  if (hub.crowding.value === "crowded") return 6;
  return 0;
}

export function calculateCandidateScore(params: {
  participants: ParticipantInput[];
  hub: MeetingHub;
  burdens: PersonalBurden[];
  activityTypes: ActivityType[];
  weights: ScoringWeights;
}): ScoreComponents {
  const validBurdens = params.burdens.filter((burden) => burden.total !== null);
  if (validBurdens.length === 0) {
    return {
      efficiency: 0,
      worstPersonProtection: 0,
      currentFairness: 0,
      cumulativeBalance: 0,
      hubQuality: calculateHubQuality(params.hub),
      groupPreferenceFit: calculatePreferenceFit(params.hub, params.participants, params.activityTypes),
      excessiveCrowdingPenalty: crowdingPenalty(params.hub),
      finalScore: 0
    };
  }
  const burdenValues = validBurdens.map((burden) => burden.total ?? 0);
  const efficiency = 100 - mean(burdenValues);
  const worstPersonProtection = 100 - Math.max(...burdenValues);
  const currentFairness = 100 - clamp(stddev(burdenValues) / FAIRNESS_STDDEV_CAP) * 100;
  const ledgerValues = provisionalLedgers(params.participants, params.burdens).map((ledger) => ledger.value);
  const cumulativeBalance = 100 - clamp(stddev(ledgerValues) / FAIRNESS_STDDEV_CAP) * 100;
  const hubQuality = calculateHubQuality(params.hub);
  const groupPreferenceFit = calculatePreferenceFit(params.hub, params.participants, params.activityTypes);
  const excessiveCrowdingPenalty = crowdingPenalty(params.hub);
  const finalScore =
    efficiency * params.weights.efficiency +
    worstPersonProtection * params.weights.worstPersonProtection +
    cumulativeBalance * params.weights.cumulativeBalance +
    hubQuality * params.weights.hubQuality +
    groupPreferenceFit * params.weights.groupPreferenceFit -
    excessiveCrowdingPenalty;

  return {
    efficiency,
    worstPersonProtection,
    currentFairness,
    cumulativeBalance,
    hubQuality,
    groupPreferenceFit,
    excessiveCrowdingPenalty,
    finalScore
  };
}

export function hasHardConstraintFailure(candidate: MeetingCandidate) {
  return candidate.burdens.some((burden) => burden.hardConstraintViolations.length > 0 || burden.total === null);
}

export function findMinimalRelaxation(candidates: MeetingCandidate[]): RelaxationSuggestion | null {
  const failed = candidates
    .map((candidate) => {
      const violations = candidate.burdens.flatMap((burden) => burden.hardConstraintViolations);
      return {
        candidate,
        violations,
        totalExcess: violations.reduce((sum, violation) => sum + violation.excess, 0)
      };
    })
    .filter((item) => item.violations.length > 0)
    .sort((a, b) => a.totalExcess - b.totalExcess);

  const best = failed[0];
  if (!best) return null;
  const first = best.violations[0];
  return {
    candidateHubId: best.candidate.hub.id,
    candidateHubName: best.candidate.hub.displayName,
    totalExcess: best.totalExcess,
    violations: best.violations,
    message: first
      ? `모두의 조건을 만족하는 지역이 없습니다. ${first.participantName}의 ${constraintLabel(first.constraint)} 조건을 ${Math.ceil(first.excess)}만큼 완화하면 ${best.candidate.hub.displayName} 후보를 검토할 수 있습니다.`
      : "모두의 조건을 만족하는 지역이 없습니다."
  };
}

function constraintLabel(constraint: ConstraintViolation["constraint"]) {
  const labels: Record<string, string> = {
    maxTravelMinutes: "최대 이동시간",
    maxTransfers: "최대 환승",
    maxWalkMinutes: "최대 도보",
    maxFareWon: "최대 교통비",
    minLastTransitBufferMinutes: "막차 여유시간",
    needsElevator: "엘리베이터",
    wheelchairAccess: "휠체어 접근성",
    returnRoute: "귀가 경로"
  };
  return labels[String(constraint)] ?? String(constraint);
}

export function assignCandidateTypes(candidates: MeetingCandidate[], maxCount: number) {
  const typeWinners: Array<{ type: CandidateType; candidate: MeetingCandidate | undefined }> = [
    { type: "balanced", candidate: [...candidates].sort((a, b) => b.score.finalScore - a.score.finalScore)[0] },
    { type: "play", candidate: [...candidates].sort((a, b) => b.score.hubQuality + b.score.groupPreferenceFit - (a.score.hubQuality + a.score.groupPreferenceFit))[0] },
    { type: "return_safe", candidate: [...candidates].sort((a, b) => b.score.worstPersonProtection + b.score.cumulativeBalance - (a.score.worstPersonProtection + a.score.cumulativeBalance))[0] },
    { type: "fast", candidate: [...candidates].sort((a, b) => averageTravelMinutes(a) - averageTravelMinutes(b))[0] }
  ];
  const selected = new Map<string, MeetingCandidate>();
  for (const winner of typeWinners) {
    if (!winner.candidate) continue;
    const existing = selected.get(winner.candidate.id);
    if (existing) {
      existing.candidateTypes = [...new Set([...existing.candidateTypes, winner.type])];
    } else if (selected.size < maxCount) {
      winner.candidate.candidateTypes = [...new Set([...winner.candidate.candidateTypes, winner.type])];
      selected.set(winner.candidate.id, winner.candidate);
    } else {
      const nearAlternative = candidates.find((candidate) => !selected.has(candidate.id));
      if (nearAlternative) {
        nearAlternative.candidateTypes = [...new Set([...nearAlternative.candidateTypes, winner.type])];
        selected.set(nearAlternative.id, nearAlternative);
      }
    }
  }
  for (const candidate of candidates.sort((a, b) => b.score.finalScore - a.score.finalScore)) {
    if (selected.size >= maxCount) break;
    if (!selected.has(candidate.id)) selected.set(candidate.id, candidate);
  }
  return [...selected.values()].sort((a, b) => b.score.finalScore - a.score.finalScore);
}

export function averageTravelMinutes(candidate: MeetingCandidate) {
  const times = candidate.routePairs
    .map((pair) => pair.outbound.totalTravelMinutes.value)
    .filter((value): value is number => typeof value === "number");
  return times.length > 0 ? mean(times) : Number.POSITIVE_INFINITY;
}

export function candidateConfidence(candidate: {
  burdens: PersonalBurden[];
  routePairs: ParticipantRoutePair[];
  hub: MeetingHub;
}) {
  const burdenConfidence = mean(candidate.burdens.map((burden) => burden.confirmedWeightRatio));
  const routeConfidence = mean(
    candidate.routePairs.map((pair) =>
      mean([
        pair.outbound.totalTravelMinutes.confidence,
        pair.outbound.walkMinutes.confidence,
        pair.outbound.transfers.confidence,
        pair.returnRoute?.totalTravelMinutes.confidence ?? 0.2
      ])
    )
  );
  return clamp(mean([burdenConfidence, routeConfidence, candidate.hub.confidence]), 0, 1);
}

export function explanationFacts(candidate: MeetingCandidate) {
  const travelTimes = candidate.routePairs
    .map((pair) => pair.outbound.totalTravelMinutes.value)
    .filter((value): value is number => typeof value === "number");
  const burdenValues = candidate.burdens.map((burden) => burden.total).filter((value): value is number => typeof value === "number");
  return [
    {
      label: "평균 이동시간",
      value: `${Math.round(mean(travelTimes))}분`,
      tone: "neutral" as const
    },
    {
      label: "최장 이동시간",
      value: `${Math.round(Math.max(...travelTimes))}분`,
      tone: "warning" as const
    },
    {
      label: "이동 부담 편차",
      value: `${stddev(burdenValues).toFixed(1)}점`,
      tone: stddev(burdenValues) <= 10 ? "positive" as const : "neutral" as const
    },
    {
      label: "상권 매력도",
      value: `${Math.round(candidate.score.hubQuality)}점`,
      tone: candidate.score.hubQuality >= 75 ? "positive" as const : "neutral" as const
    },
    {
      label: "데이터 신뢰도",
      value: `${Math.round(candidate.confidence * 100)}%`,
      tone: candidate.confidence >= 0.65 ? "positive" as const : "warning" as const
    }
  ];
}
