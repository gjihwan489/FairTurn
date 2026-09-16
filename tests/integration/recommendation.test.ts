import { describe, expect, it } from "vitest";
import { calculateRecommendations, recommendVenuesForCandidate } from "@/domain/recommendation";
import { getPlaceProvider } from "@/providers/place";
import { getTransitProvider, ODsayTransitProvider } from "@/providers/transit";
import { participant, request } from "../helpers";

describe("recommendation integration", () => {
  it("calculates hub candidates for a normal four person meeting", async () => {
    const result = await calculateRecommendations(request());

    expect(result.ok).toBe(true);
    expect(result.demoData).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
    expect(result.candidates.every((candidate) => candidate.hub.id)).toBe(true);
    expect(result.candidates.flatMap((candidate) => candidate.candidateTypes)).toContain("balanced");
    expect(result.providerWarnings.join(" ")).toContain("Fixture");
  });

  it("keeps last train risk unknown when fixture has no schedule", async () => {
    const result = await calculateRecommendations(request());
    const returnRisk = result.candidates[0].burdens[0].components.returnRisk;

    expect(returnRisk.value).toBeNull();
    expect(returnRisk.status).toBe("unknown");
  });

  it("returns a relaxation proposal when no common candidate satisfies constraints", async () => {
    const people = [
      participant("p1", "서연", "seongnam"),
      participant("p2", "민준", "bucheon")
    ];
    people[0].constraints.maxTravelMinutes = 5;
    people[1].constraints.maxTravelMinutes = 5;

    const result = await calculateRecommendations(request(people));
    expect(result.ok).toBe(false);
    expect(result.status).toBe("no_candidates");
    expect(result.relaxation?.message).toContain("조건");
  });

  it("applies previous ledger burden to cumulative balance", async () => {
    const compensated = request([
      participant("p1", "서연", "seongnam", 40),
      participant("p2", "민준", "bucheon", -20),
      participant("p3", "하린", "sinchon", -10)
    ]);
    const neutral = request([
      participant("p1", "서연", "seongnam", 0),
      participant("p2", "민준", "bucheon", 0),
      participant("p3", "하린", "sinchon", 0)
    ]);
    const [withLedger, withoutLedger] = await Promise.all([
      calculateRecommendations(compensated),
      calculateRecommendations(neutral)
    ]);

    expect(withLedger.candidates[0].score.cumulativeBalance).not.toBe(withoutLedger.candidates[0].score.cumulativeBalance);
  });

  it("recommends venues after a region is locked without inventing opening hours", async () => {
    const result = await calculateRecommendations(request());
    const venues = await recommendVenuesForCandidate(result.candidates[0], ["식당", "카페"]);
    expect(venues).toHaveLength(2);
    expect(venues[0].openingStatus.status).toBe("unknown");
  });
});

describe("provider status", () => {
  it("distinguishes fixture and live provider readiness", async () => {
    const fixtureTransit = await getTransitProvider("fixture").getStatus();
    const liveTransit = await new ODsayTransitProvider(undefined).getStatus();
    const fixturePlace = await getPlaceProvider("fixture").getStatus();

    expect(fixtureTransit.configured).toBe(true);
    expect(fixtureTransit.warning).toContain("Fixture");
    expect(liveTransit.configured).toBe(false);
    expect(fixturePlace.dataReady).toBe(true);
  });
});
