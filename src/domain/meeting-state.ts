import type { MeetingCandidate, MeetingState, ParticipantInput, VenueOption, VoteInput } from "./types";

export interface RevisionManagedMeeting {
  state: MeetingState;
  revision: number;
  participants: ParticipantInput[];
  candidates: MeetingCandidate[];
  votes: VoteInput[];
  lockedCandidateId: string | null;
  venues: VenueOption[];
  selectedVenueId: string | null;
  relaxationMessage: string | null;
  warnings: string[];
}

export const REVISION_RESET_WARNING =
  "추천 입력이 변경되어 계산 revision이 올라갔고 기존 후보·투표·장소 선택은 초기화되었습니다.";

export function resetDerivedRecommendationState<T extends RevisionManagedMeeting>(
  meeting: T,
  warning = REVISION_RESET_WARNING
): T {
  if (meeting.state === "completed" || meeting.state === "cancelled") {
    throw new Error("완료되었거나 취소된 모임은 명시적인 복원 절차 없이 추천 입력을 수정할 수 없습니다.");
  }
  return {
    ...meeting,
    state: "collecting",
    revision: meeting.revision + 1,
    candidates: [],
    votes: [],
    lockedCandidateId: null,
    venues: [],
    selectedVenueId: null,
    relaxationMessage: null,
    warnings: [...meeting.warnings.filter((item) => item !== warning), warning]
  };
}

export function applyRecommendationInputChange<T extends RevisionManagedMeeting>(
  meeting: T,
  patch: Partial<Omit<T, keyof RevisionManagedMeeting>> &
    Partial<Pick<T, "participants">> &
    Record<string, unknown>,
  warning?: string
): T {
  return {
    ...resetDerivedRecommendationState(meeting, warning),
    ...patch
  };
}

export function canRetryCalculationFrom(state: MeetingState) {
  return state === "collecting" || state === "calculation_failed" || state === "voting";
}
