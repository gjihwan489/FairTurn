import type { MeetingCandidate, MeetingState, VoteInput, VoteResult, VoteSettings } from "./types";

const transitions: Record<MeetingState, MeetingState[]> = {
  draft: ["collecting", "cancelled", "expired"],
  collecting: ["calculating", "draft", "cancelled", "expired"],
  calculating: ["voting", "calculation_failed", "collecting", "cancelled"],
  voting: ["region_locked", "calculating", "cancelled", "expired"],
  region_locked: ["venue_voting", "confirmed", "cancelled"],
  venue_voting: ["confirmed", "region_locked", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  calculation_failed: ["collecting", "cancelled"],
  expired: ["collecting", "cancelled"]
};

const allowedActions: Record<MeetingState, string[]> = {
  draft: ["edit_meeting", "add_participant", "remove_participant"],
  collecting: ["submit_private_input", "edit_private_input", "start_calculation"],
  calculating: ["cancel_calculation"],
  voting: ["vote_region", "change_vote", "close_vote", "recalculate"],
  region_locked: ["start_venue_vote", "confirm_without_venue"],
  venue_voting: ["vote_venue", "confirm_venue"],
  confirmed: ["complete_meeting", "cancel_meeting"],
  completed: ["adjust_burden"],
  cancelled: [],
  calculation_failed: ["edit_private_input", "retry_calculation"],
  expired: ["extend_deadline"]
};

export function canTransition(from: MeetingState, to: MeetingState) {
  return transitions[from].includes(to);
}

export function assertTransition(from: MeetingState, to: MeetingState) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid meeting state transition: ${from} -> ${to}`);
  }
  return to;
}

export function canPerformAction(state: MeetingState, action: string) {
  return allowedActions[state].includes(action);
}

export function validVotesForRevision(votes: VoteInput[], revision: number) {
  return votes.filter((vote) => vote.revision === revision);
}

export function castVote(votes: VoteInput[], vote: VoteInput, settings: VoteSettings) {
  if (settings.deadline && new Date(vote.createdAt) > new Date(settings.deadline)) {
    throw new Error("Voting deadline has passed.");
  }
  const sameParticipant = votes.find(
    (existing) =>
      existing.meetingId === vote.meetingId &&
      existing.revision === vote.revision &&
      existing.participantId === vote.participantId
  );
  if (sameParticipant && !settings.changeAllowed) {
    throw new Error("Vote changes are not allowed.");
  }
  return [
    ...votes.filter(
      (existing) =>
        !(
          existing.meetingId === vote.meetingId &&
          existing.revision === vote.revision &&
          existing.participantId === vote.participantId
        )
    ),
    vote
  ];
}

export function tallyVotes(params: {
  candidates: MeetingCandidate[];
  participantIds: string[];
  votes: VoteInput[];
  revision: number;
  settings: VoteSettings;
}): VoteResult {
  const revisionVotes = validVotesForRevision(params.votes, params.revision);
  const missingParticipantIds = params.participantIds.filter(
    (participantId) => !revisionVotes.some((vote) => vote.participantId === participantId)
  );
  const counts = new Map<string, number>();
  for (const vote of revisionVotes) {
    counts.set(vote.candidateId, (counts.get(vote.candidateId) ?? 0) + 1);
  }
  const maxVotes = Math.max(0, ...counts.values());
  const tiedCandidateIds = [...counts.entries()]
    .filter(([, count]) => count === maxVotes)
    .map(([candidateId]) => candidateId);
  if (tiedCandidateIds.length === 0) {
    return {
      winningCandidateId: null,
      tiedCandidateIds: [],
      missingParticipantIds,
      reason: "아직 투표가 없습니다."
    };
  }
  if (tiedCandidateIds.length === 1) {
    return {
      winningCandidateId: tiedCandidateIds[0],
      tiedCandidateIds: [],
      missingParticipantIds,
      reason: "최다 득표 후보입니다."
    };
  }
  if (!params.settings.autoTieBreak) {
    return {
      winningCandidateId: null,
      tiedCandidateIds,
      missingParticipantIds,
      reason: "동률입니다. 방장 선택이 필요합니다."
    };
  }
  const tied = params.candidates.filter((candidate) => tiedCandidateIds.includes(candidate.id));
  const winner = [...tied].sort((a, b) => {
    const cumulative = b.score.cumulativeBalance - a.score.cumulativeBalance;
    if (cumulative !== 0) return cumulative;
    const worst = b.score.worstPersonProtection - a.score.worstPersonProtection;
    if (worst !== 0) return worst;
    const returnSafe = b.score.worstPersonProtection + b.score.cumulativeBalance - (a.score.worstPersonProtection + a.score.cumulativeBalance);
    if (returnSafe !== 0) return returnSafe;
    return b.score.finalScore - a.score.finalScore;
  })[0];
  return {
    winningCandidateId: winner?.id ?? null,
    tiedCandidateIds,
    missingParticipantIds,
    reason: "동률 처리: 누적 공평성, 가장 힘든 사람 보호, 귀가 안정성 순으로 자동 결정했습니다."
  };
}

export function shouldResetVotesOnRevisionChange(previousRevision: number, nextRevision: number, changedPrivateInputs: boolean) {
  if (nextRevision === previousRevision) return false;
  return changedPrivateInputs;
}
