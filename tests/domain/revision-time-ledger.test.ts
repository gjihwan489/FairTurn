import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyAttendanceLedger } from "@/domain/ledger";
import { applyRecommendationInputChange } from "@/domain/meeting-state";
import { localDateTimeInputToIso, toLocalDateTimeInputValue, validateMeetingTimes } from "@/domain/time";
import { minimalCandidate, participant } from "../helpers";

describe("revision managed recommendation input changes", () => {
  it("increments revision, returns to collecting, and clears derived state", () => {
    const meeting = {
      state: "voting" as const,
      revision: 3,
      participants: [participant("p1", "서연", "seongnam"), participant("p2", "민준", "bucheon")],
      candidates: [minimalCandidate("a", 80)],
      votes: [{ meetingId: "m1", revision: 3, participantId: "p1", candidateId: "a", createdAt: "2026-09-17T00:00:00.000Z" }],
      lockedCandidateId: "a",
      venues: [],
      selectedVenueId: "v1",
      relaxationMessage: "relax",
      warnings: []
    };

    const next = applyRecommendationInputChange(meeting, { selectedVenueId: null });

    expect(next.revision).toBe(4);
    expect(next.state).toBe("collecting");
    expect(next.candidates).toEqual([]);
    expect(next.votes).toEqual([]);
    expect(next.lockedCandidateId).toBeNull();
    expect(next.relaxationMessage).toBeNull();
  });

  it("blocks edits after completion without explicit restore", () => {
    expect(() =>
      applyRecommendationInputChange({
        state: "completed",
        revision: 1,
        participants: [],
        candidates: [],
        votes: [],
        lockedCandidateId: null,
        venues: [],
        selectedVenueId: null,
        relaxationMessage: null,
        warnings: []
      }, {})
    ).toThrow("완료");
  });
});

describe("local datetime handling", () => {
  it("formats datetime-local without UTC slicing", () => {
    const date = new Date(2026, 8, 17, 19, 5);
    expect(toLocalDateTimeInputValue(date)).toBe("2026-09-17T19:05");
    expect(localDateTimeInputToIso("2026-09-17T19:05")).toContain("T");
  });

  it("rejects an end time before the start time", () => {
    expect(() => validateMeetingTimes("2026-09-17T20:00", "2026-09-17T19:00")).toThrow("예상 종료");
  });
});

describe("attendance based ledger application", () => {
  it("excludes absent and non-persistent guest participants", () => {
    const candidate = minimalCandidate("hub", 80);
    candidate.burdens = [
      { participantId: "p1", participantName: "서연", total: 70 } as never,
      { participantId: "p2", participantName: "민준", total: 50 } as never,
      { participantId: "guest", participantName: "비회원", total: 10 } as never
    ];

    const result = applyAttendanceLedger({
      candidate,
      currentLedger: { p1: 0, p2: 0 },
      attendanceByParticipantId: { p1: "attended", p2: "attended", guest: "attended" },
      permanentParticipantIds: ["p1", "p2"],
      alreadyApplied: false
    });

    expect(result.appliedParticipantIds).toEqual(["p1", "p2"]);
    expect(result.ledger).not.toHaveProperty("guest");
  });

  it("prevents duplicate meeting completion", () => {
    expect(() =>
      applyAttendanceLedger({
        candidate: minimalCandidate("hub", 80),
        currentLedger: {},
        attendanceByParticipantId: {},
        permanentParticipantIds: [],
        alreadyApplied: true
      })
    ).toThrow("이미");
  });
});

describe("group_members migration shape", () => {
  it("uses a surrogate id key and partial unique indexes", () => {
    const sql = readFileSync(join(process.cwd(), "db", "migrations", "001_initial.sql"), "utf8");
    expect(sql).toContain("id uuid PRIMARY KEY DEFAULT gen_random_uuid()");
    expect(sql).toContain("CHECK (num_nonnulls(profile_id, friend_id) = 1)");
    expect(sql).toContain("idx_group_members_group_profile_unique");
    expect(sql).toContain("idx_group_members_group_friend_unique");
  });
});
