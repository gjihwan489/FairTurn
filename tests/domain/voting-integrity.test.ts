import { describe, expect, it } from "vitest";
import { castVote, tallyVotes } from "@/domain/voting";
import { minimalCandidate } from "../helpers";

describe("voting integrity", () => {
  it("rejects forged participant and candidate ids", () => {
    expect(() =>
      castVote([], {
        meetingId: "m1",
        revision: 1,
        participantId: "outsider",
        candidateId: "a",
        createdAt: "2026-09-17T00:00:00.000Z"
      }, { anonymous: false, changeAllowed: true, deadline: null, autoTieBreak: true }, {
        meetingId: "m1",
        revision: 1,
        participantIds: ["p1"],
        candidateIds: ["a"]
      })
    ).toThrow("참여자");
  });

  it("ignores stale, external, duplicate, and deadline-expired votes during tally", () => {
    const candidates = [minimalCandidate("a", 80), minimalCandidate("b", 70)];
    const result = tallyVotes({
      meetingId: "m1",
      candidates,
      participantIds: ["p1", "p2"],
      revision: 1,
      settings: { anonymous: false, changeAllowed: true, deadline: "2026-09-17T10:00:00.000Z", autoTieBreak: true },
      votes: [
        { meetingId: "m1", revision: 1, participantId: "p1", candidateId: "a", createdAt: "2026-09-17T09:00:00.000Z" },
        { meetingId: "m1", revision: 1, participantId: "p1", candidateId: "b", createdAt: "2026-09-17T09:01:00.000Z" },
        { meetingId: "m2", revision: 1, participantId: "p2", candidateId: "b", createdAt: "2026-09-17T09:00:00.000Z" },
        { meetingId: "m1", revision: 2, participantId: "p2", candidateId: "b", createdAt: "2026-09-17T09:00:00.000Z" },
        { meetingId: "m1", revision: 1, participantId: "p2", candidateId: "forged", createdAt: "2026-09-17T09:00:00.000Z" },
        { meetingId: "m1", revision: 1, participantId: "p2", candidateId: "b", createdAt: "2026-09-17T11:00:00.000Z" }
      ]
    });

    expect(result.winningCandidateId).toBe("a");
    expect(result.missingParticipantIds).toEqual(["p2"]);
  });
});
