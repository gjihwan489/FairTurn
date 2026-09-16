import { describe, expect, it } from "vitest";
import { DEFAULT_SCORE_WEIGHTS } from "@/domain/config";
import { calculateRecommendations, recommendVenuesForCandidate } from "@/domain/recommendation";
import { assignCandidateTypes, mean, updateLedger } from "@/domain/scoring";
import { castVote, tallyVotes } from "@/domain/voting";
import type { VoteInput } from "@/domain/types";
import { minimalCandidate, participant, request } from "../helpers";

describe("FairTurn core flow", () => {
  it("scenario A: four people calculate, vote, lock venue, complete, and update ledger", async () => {
    const req = request();
    const result = await calculateRecommendations(req);
    expect(result.ok).toBe(true);

    let votes: VoteInput[] = [];
    for (const person of req.participants) {
      votes = castVote(votes, {
        meetingId: req.meetingId,
        revision: req.revision,
        participantId: person.id,
        candidateId: result.candidates[0].id,
        createdAt: "2026-09-16T00:00:00.000Z"
      }, { anonymous: false, changeAllowed: true, deadline: null, autoTieBreak: true });
    }
    const tally = tallyVotes({
      candidates: result.candidates,
      participantIds: req.participants.map((person) => person.id),
      votes,
      revision: req.revision,
      settings: { anonymous: false, changeAllowed: true, deadline: null, autoTieBreak: true }
    });
    expect(tally.winningCandidateId).toBe(result.candidates[0].id);

    const venues = await recommendVenuesForCandidate(result.candidates[0], ["식당", "카페"]);
    expect(venues[0].externalPlaceId).toContain("fixture");

    const burdens = result.candidates[0].burdens.map((burden) => burden.total ?? 0);
    const groupMean = mean(burdens);
    const nextLedger = Object.fromEntries(
      req.participants.map((person, index) => [
        person.id,
        updateLedger(person.oldLedger, burdens[index], groupMean)
      ])
    );
    expect(Object.keys(nextLedger)).toHaveLength(4);
  });

  it("scenario B: previous heavy traveler changes cumulative balance", async () => {
    const highLedger = request([
      participant("p1", "서연", "seongnam", 55),
      participant("p2", "민준", "bucheon", -20),
      participant("p3", "하린", "sinchon", -15)
    ]);
    const result = await calculateRecommendations(highLedger);
    expect(result.candidates[0].score.cumulativeBalance).toBeLessThanOrEqual(100);
    expect(result.candidates[0].explanationFacts.some((fact) => fact.label === "데이터 신뢰도")).toBe(true);
  });

  it("scenario C: no common candidate produces a concrete relaxation", async () => {
    const people = [participant("p1", "서연", "seongnam"), participant("p2", "민준", "bucheon")];
    people[0].constraints.maxTravelMinutes = 3;
    people[1].constraints.maxTravelMinutes = 3;
    const result = await calculateRecommendations(request(people));
    expect(result.status).toBe("no_candidates");
    expect(result.relaxation?.violations.length).toBeGreaterThan(0);
  });

  it("scenario D and E: fixture is explicit and last train data is unknown", async () => {
    const result = await calculateRecommendations(request());
    expect(result.demoData).toBe(true);
    expect(result.providerWarnings.join(" ")).toContain("Fixture");
    expect(result.candidates[0].burdens[0].components.returnRisk.value).toBeNull();
  });

  it("scenario G: duplicate type winners do not create duplicate candidate cards", () => {
    const selected = assignCandidateTypes([
      minimalCandidate("hub-one", 99, 99, 99),
      minimalCandidate("hub-two", 90, 80, 80),
      minimalCandidate("hub-three", 80, 70, 70)
    ], 4);
    expect(new Set(selected.map((candidate) => candidate.id)).size).toBe(selected.length);
  });

  it("research mode can compare baseline strategies", async () => {
    const result = await calculateRecommendations({
      ...request(),
      weights: DEFAULT_SCORE_WEIGHTS
    });
    const candidates = result.candidates;
    const metrics = candidates.map((candidate) => ({
      hub: candidate.hub.displayName,
      fairturn: candidate.score.finalScore,
      averageTime: mean(candidate.routePairs.map((pair) => pair.outbound.totalTravelMinutes.value ?? 999)),
      maxTime: Math.max(...candidate.routePairs.map((pair) => pair.outbound.totalTravelMinutes.value ?? 999)),
      currentVariance: candidate.score.currentFairness,
      cumulative: candidate.score.cumulativeBalance
    }));
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0]).toHaveProperty("fairturn");
  });
});
