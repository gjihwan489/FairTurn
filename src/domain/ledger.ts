import { mean, updateLedger } from "./scoring";
import type { MeetingCandidate } from "./types";

export type AttendanceStatus = "attended" | "absent" | "unknown";

export function applyAttendanceLedger(params: {
  candidate: MeetingCandidate;
  currentLedger: Record<string, number>;
  attendanceByParticipantId: Record<string, AttendanceStatus>;
  permanentParticipantIds: string[];
  alreadyApplied: boolean;
}) {
  if (params.alreadyApplied) {
    throw new Error("이미 이 모임의 장부가 반영되었습니다.");
  }
  const attended = new Set(
    Object.entries(params.attendanceByParticipantId)
      .filter(([, status]) => status === "attended")
      .map(([participantId]) => participantId)
  );
  if (attended.size < 2) {
    throw new Error("참석자가 2명 이상이어야 장부를 반영할 수 있습니다.");
  }
  const permanent = new Set(params.permanentParticipantIds);
  const burdens = params.candidate.burdens.filter(
    (burden) => burden.total !== null && attended.has(burden.participantId) && permanent.has(burden.participantId)
  );
  if (burdens.length < 2) {
    throw new Error("그룹 장부에 영구 저장할 참석자가 2명 이상이어야 합니다.");
  }
  const groupMean = mean(burdens.map((burden) => burden.total ?? 0));
  const nextLedger = { ...params.currentLedger };
  for (const burden of burdens) {
    nextLedger[burden.participantId] = updateLedger(nextLedger[burden.participantId] ?? 0, burden.total ?? 0, groupMean);
  }
  return {
    ledger: nextLedger,
    appliedParticipantIds: burdens.map((burden) => burden.participantId),
    groupMean
  };
}
