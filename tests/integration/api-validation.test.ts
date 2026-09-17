import { describe, expect, it } from "vitest";
import { POST as recommendationsPost } from "@/app/api/recommendations/route";
import { POST as sharedMeetingPost } from "@/app/api/shared-meeting/route";
import { POST as venuesPost } from "@/app/api/venues/route";

function post(body: unknown, ip: string) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": ip
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

describe("api validation and rate limiting", () => {
  it("returns 400 for malformed shared meeting JSON", async () => {
    const response = await sharedMeetingPost(post("{bad-json", "api-bad-json"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid venue requests", async () => {
    const response = await venuesPost(post({ candidate: { id: "client-object" }, categories: ["식당"] }, "api-bad-venue"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid recommendations payloads", async () => {
    const response = await recommendationsPost(post({ meetingId: "m1" }, "api-bad-reco"));
    expect(response.status).toBe(400);
  });

  it("returns 429 with Retry-After after the configured limit", async () => {
    process.env.FAIRTURN_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.FAIRTURN_RATE_LIMIT_MAX = "1";
    const payload = {
      meetingId: "m1",
      hubId: "hongdae",
      hubName: "홍대입구",
      radiusMeters: 500,
      categories: ["식당"]
    };
    const first = await venuesPost(post(payload, "api-rate-limit"));
    const second = await venuesPost(post(payload, "api-rate-limit"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    process.env.FAIRTURN_RATE_LIMIT_MAX = "60";
  });
});
