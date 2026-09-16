import { describe, expect, it } from "vitest";
import { assertTransition, castVote, shouldResetVotesOnRevisionChange, tallyVotes } from "@/domain/voting";
import { minimalCandidate } from "../helpers";

describe("meeting state machine", () => {
  it("allows the normal FairTurn lifecycle", () => {
    expect(assertTransition("draft", "collecting")).toBe("collecting");
    expect(assertTransition("collecting", "calculating")).toBe("calculating");
    expect(assertTransition("calculating", "voting")).toBe("voting");
    expect(assertTransition("voting", "region_locked")).toBe("region_locked");
    expect(assertTransition("region_locked", "venue_voting")).toBe("venue_voting");
    expect(assertTransition("venue_voting", "confirmed")).toBe("confirmed");
    expect(assertTransition("confirmed", "completed")).toBe("completed");
  });

  it("blocks invalid transitions", () => {
    expect(() => assertTransition("cancelled", "completed")).toThrow();
  });

  it("resets votes when private inputs change across revisions", () => {
    expect(shouldResetVotesOnRevisionChange(1, 2, true)).toBe(true);
    expect(shouldResetVotesOnRevisionChange(1, 2, false)).toBe(false);
  });
});

describe("voting", () => {
  it("handles revision scoped votes and tie break", () => {
    const candidates = [minimalCandidate("a", 80, 90, 80), minimalCandidate("b", 82, 70, 90)];
    let votes = castVote([], {
      meetingId: "m1",
      revision: 1,
      participantId: "p1",
      candidateId: "a",
      createdAt: "2026-09-16T00:00:00.000Z"
    }, { anonymous: false, changeAllowed: true, deadline: null, autoTieBreak: true });
    votes = castVote(votes, {
      meetingId: "m1",
      revision: 1,
      participantId: "p2",
      candidateId: "b",
      createdAt: "2026-09-16T00:00:00.000Z"
    }, { anonymous: false, changeAllowed: true, deadline: null, autoTieBreak: true });
    votes = castVote(votes, {
      meetingId: "m1",
      revision: 2,
      participantId: "p3",
      candidateId: "b",
      createdAt: "2026-09-16T00:00:00.000Z"
    }, { anonymous: false, changeAllowed: true, deadline: null, autoTieBreak: true });

    const result = tallyVotes({
      candidates,
      participantIds: ["p1", "p2", "p3"],
      votes,
      revision: 1,
      settings: { anonymous: false, changeAllowed: true, deadline: null, autoTieBreak: true }
    });
    expect(result.tiedCandidateIds).toEqual(["a", "b"]);
    expect(result.winningCandidateId).toBe("a");
    expect(result.missingParticipantIds).toEqual(["p3"]);
  });
});
