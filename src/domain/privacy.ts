import crypto from "node:crypto";
import type { MeetingCandidate, ParticipantInput } from "./types";

export interface SharedParticipantDto {
  id: string;
  displayName: string;
  coarseOriginLabel: string;
  responseStatus: "pending" | "complete";
  preferenceSummary: string[];
}

export interface SharedCandidateDto {
  id: string;
  revision: number;
  hubName: string;
  hubRegion: string;
  candidateTypes: string[];
  finalScore: number;
  confidence: number;
  participantBurdens: Array<{
    participantId: string;
    participantName: string;
    burden: number | null;
    transferBurden: number | null;
    walkBurden: number | null;
    fareBurden: number | null;
  }>;
  explanationFacts: MeetingCandidate["explanationFacts"];
  warnings: string[];
  missing: string[];
}

export function sanitizeParticipantForGroup(participant: ParticipantInput): SharedParticipantDto {
  return {
    id: participant.id,
    displayName: participant.displayName,
    coarseOriginLabel: participant.coarseOriginLabel,
    responseStatus: participant.origin && participant.returnLocation ? "complete" : "pending",
    preferenceSummary: participant.preferences.activityLikes.slice(0, 3)
  };
}

export function sanitizeCandidateForGroup(candidate: MeetingCandidate): SharedCandidateDto {
  return {
    id: candidate.id,
    revision: candidate.revision,
    hubName: candidate.hub.displayName,
    hubRegion: candidate.hub.region,
    candidateTypes: candidate.candidateTypes,
    finalScore: candidate.score.finalScore,
    confidence: candidate.confidence,
    participantBurdens: candidate.burdens.map((burden) => ({
      participantId: burden.participantId,
      participantName: burden.participantName,
      burden: burden.total,
      transferBurden: burden.components.transfers.value,
      walkBurden: burden.components.walk.value,
      fareBurden: burden.components.fare.value
    })),
    explanationFacts: candidate.explanationFacts,
    warnings: candidate.warnings,
    missing: candidate.missing
  };
}

export function sanitizeSharedMeeting(input: {
  meetingId: string;
  revision: number;
  participants: ParticipantInput[];
  candidates: MeetingCandidate[];
}) {
  return {
    meetingId: input.meetingId,
    revision: input.revision,
    participants: input.participants.map(sanitizeParticipantForGroup),
    candidates: input.candidates.map(sanitizeCandidateForGroup)
  };
}

export function assertNoPrivateLocationLeak(payload: unknown) {
  const serialized = JSON.stringify(payload);
  const blocked = [
    "exactOrigin",
    "returnCoordinate",
    "origin\":{\"",
    "returnLocation",
    "coordinate",
    "address",
    "lat",
    "lng"
  ];
  return blocked.filter((token) => serialized.includes(token));
}

export function createInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string, secret = process.env.FAIRTURN_INVITE_TOKEN_SECRET ?? "fairturn-dev-secret") {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export function maskSensitiveError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message
    .replace(/KakaoAK\s+[A-Za-z0-9._-]+/g, "KakaoAK [redacted]")
    .replace(/apiKey=[A-Za-z0-9._-]+/g, "apiKey=[redacted]")
    .replace(/\b\d{2,3}\.\d{3,}\b/g, "[coordinate-redacted]");
}
