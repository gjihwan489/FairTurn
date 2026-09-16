import { describe, expect, it } from "vitest";
import { sourced } from "@/domain/config";
import {
  assignCandidateTypes,
  calculateCandidateScore,
  calculatePersonalBurden,
  evaluateHardConstraints,
  findMinimalRelaxation,
  lastTransitRisk,
  mean,
  provisionalLedgers,
  stddev,
  updateLedger
} from "@/domain/scoring";
import { minimalCandidate, participant, route } from "../helpers";

describe("personal burden scoring", () => {
  it("calculates weighted burden from known route metrics", () => {
    const person = participant("p1", "서연", "seongnam");
    const burden = calculatePersonalBurden(person, route(), route({ direction: "return" }));

    expect(burden.total).not.toBeNull();
    expect(burden.components.time.value).toBe(50);
    expect(burden.components.transfers.value).toBeCloseTo(33.333, 2);
    expect(burden.confirmedWeightRatio).toBeCloseTo(1);
  });

  it("distinguishes known zero from unknown values during reweighting", () => {
    const person = participant("p1", "서연", "seongnam");
    const burden = calculatePersonalBurden(
      person,
      route({
        transfers: sourced(0, "known", "test", 1),
        fareWon: sourced(null, "unknown", null, 0.2)
      }),
      route({ direction: "return", lastTransitBufferMinutes: sourced(null, "unknown", null, 0.2) })
    );

    expect(burden.components.transfers.value).toBe(0);
    expect(burden.components.fare.value).toBeNull();
    expect(burden.confirmedWeightRatio).toBeCloseTo(0.8);
  });

  it("keeps last transit risk unknown when no last train data exists", () => {
    const risk = lastTransitRisk(sourced(null, "unknown", null, 0.2));
    expect(risk.value).toBeNull();
    expect(risk.status).toBe("unknown");
  });

  it("applies hard constraints before normal score use", () => {
    const person = participant("p1", "서연", "seongnam");
    person.constraints.maxTravelMinutes = 30;
    const violations = evaluateHardConstraints(person, route({ totalTravelMinutes: sourced(45, "known", "test", 1) }), null);
    expect(violations).toHaveLength(1);
    expect(violations[0].constraint).toBe("maxTravelMinutes");
  });
});

describe("fairness math", () => {
  it("calculates mean and standard deviation", () => {
    expect(mean([10, 20, 30])).toBe(20);
    expect(stddev([10, 20, 30])).toBeCloseTo(8.1649658, 6);
  });

  it("updates ledger with decay and current group delta", () => {
    expect(updateLedger(20, 70, 50)).toBeCloseTo(37);
  });

  it("calculates provisional ledger values per candidate", () => {
    const people = [participant("p1", "서연", "seongnam", 20), participant("p2", "민준", "bucheon", -10)];
    const burdens = people.map((person, index) => ({
      participantId: person.id,
      participantName: person.displayName,
      total: index === 0 ? 70 : 50,
      components: {
        time: sourced(0, "known", "test", 1),
        transfers: sourced(0, "known", "test", 1),
        walk: sourced(0, "known", "test", 1),
        fare: sourced(0, "known", "test", 1),
        returnRisk: sourced(0, "known", "test", 1),
        crowdAccessibility: sourced(0, "known", "test", 1)
      },
      confirmedWeightRatio: 1,
      warnings: [],
      hardConstraintViolations: []
    }));
    const ledgers = provisionalLedgers(people, burdens);
    expect(ledgers.find((item) => item.participantId === "p1")?.value).toBeCloseTo(27);
    expect(ledgers.find((item) => item.participantId === "p2")?.value).toBeCloseTo(-18.5);
  });
});

describe("candidate scoring and selection", () => {
  it("calculates candidate score with explainable components", () => {
    const people = [participant("p1", "서연", "seongnam"), participant("p2", "민준", "bucheon")];
    const hub = minimalCandidate("hub-a", 80).hub;
    const burdens = people.map((person, index) => calculatePersonalBurden(person, route({ totalTravelMinutes: sourced(index === 0 ? 40 : 60, "known", "test", 1) }), null));
    const score = calculateCandidateScore({
      participants: people,
      hub,
      burdens,
      activityTypes: ["meal"],
      weights: {
        efficiency: 0.3,
        worstPersonProtection: 0.2,
        cumulativeBalance: 0.25,
        hubQuality: 0.15,
        groupPreferenceFit: 0.1
      }
    });
    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.cumulativeBalance).toBeLessThanOrEqual(100);
  });

  it("deduplicates candidate type winners onto a single card", () => {
    const selected = assignCandidateTypes([
      minimalCandidate("same-winner", 95, 95, 95),
      minimalCandidate("second", 80, 70, 70),
      minimalCandidate("third", 75, 65, 65)
    ], 4);
    const winner = selected.find((candidate) => candidate.id === "same-winner");
    expect(winner?.candidateTypes.length).toBeGreaterThan(1);
    expect(new Set(selected.map((candidate) => candidate.id)).size).toBe(selected.length);
  });

  it("finds a minimal relaxation instead of excluding a person", () => {
    const candidate = minimalCandidate("tight", 10);
    candidate.burdens = [
      {
        participantId: "p1",
        participantName: "서연",
        total: 80,
        components: {
          time: sourced(100, "known", "test", 1),
          transfers: sourced(0, "known", "test", 1),
          walk: sourced(0, "known", "test", 1),
          fare: sourced(0, "known", "test", 1),
          returnRisk: sourced(null, "unknown", null, 0.2),
          crowdAccessibility: sourced(null, "unknown", null, 0.2)
        },
        confirmedWeightRatio: 0.75,
        warnings: [],
        hardConstraintViolations: [
          {
            participantId: "p1",
            participantName: "서연",
            constraint: "maxTravelMinutes",
            actual: 68,
            limit: 60,
            excess: 8,
            message: "초과"
          }
        ]
      }
    ];
    const relaxation = findMinimalRelaxation([candidate]);
    expect(relaxation?.message).toContain("8");
    expect(relaxation?.message).toContain("tight");
  });
});
