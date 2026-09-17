import type { ParticipantInput } from "./types";

export function stripPrivateLocationForStorage<T extends { participants?: ParticipantInput[]; meetings?: Array<{ participants: ParticipantInput[] }> }>(
  value: T
): T {
  if ("participants" in value && Array.isArray(value.participants)) {
    return {
      ...value,
      participants: value.participants.map(stripParticipantAddress)
    };
  }
  if ("meetings" in value && Array.isArray(value.meetings)) {
    return {
      ...value,
      meetings: value.meetings.map((meeting) => ({
        ...meeting,
        participants: meeting.participants.map(stripParticipantAddress)
      }))
    };
  }
  return value;
}

function stripParticipantAddress(participant: ParticipantInput): ParticipantInput {
  return {
    ...participant,
    origin: { ...participant.origin, address: undefined },
    returnLocation: { ...participant.returnLocation, address: undefined }
  };
}
