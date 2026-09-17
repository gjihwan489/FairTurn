import { describe, expect, it } from "vitest";
import { assertNoPrivateLocationLeak, sanitizeSharedMeeting } from "@/domain/privacy";
import { calculateRecommendations } from "@/domain/recommendation";
import { stripPrivateLocationForStorage } from "@/domain/storage";
import { request } from "../helpers";

describe("privacy DTO", () => {
  it("does not include exact origins, return coordinates, raw addresses, lat, or lng", async () => {
    const req = request();
    const result = await calculateRecommendations(req);
    const shared = sanitizeSharedMeeting({
      meetingId: req.meetingId,
      revision: req.revision,
      participants: req.participants,
      candidates: result.candidates
    });
    const leaks = assertNoPrivateLocationLeak(shared);

    expect(leaks).toEqual([]);
    expect(JSON.stringify(shared)).not.toContain("경기 성남시 분당구");
    expect(JSON.stringify(shared)).toContain("성남");
  });

  it("strips raw address strings before local storage persistence", () => {
    const req = request();
    const sanitized = stripPrivateLocationForStorage({ participants: req.participants });

    expect(JSON.stringify(sanitized)).not.toContain("경기 성남시 분당구");
    expect(sanitized.participants[0].origin.address).toBeUndefined();
  });
});
