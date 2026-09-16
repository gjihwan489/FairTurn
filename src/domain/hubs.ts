import { sourced } from "./config";
import type { ActivityType, MeetingHub } from "./types";

const activities: ActivityType[] = [
  "meal",
  "cafe",
  "drinks",
  "movie",
  "exhibition",
  "shopping",
  "performance",
  "walk",
  "board_game",
  "experience",
  "sports"
];

function activityDistribution(
  values: Partial<Record<ActivityType, number>>,
  source = "curated-mvp-hub-seed"
) {
  return Object.fromEntries(
    activities.map((activity) => [
      activity,
      values[activity] === undefined
        ? sourced<number>(null, "unknown", null, 0.2, "MVP seed has no verified category count.")
        : sourced(values[activity] ?? null, "estimated", source, 0.65)
    ])
  ) as MeetingHub["activityDistribution"];
}

function poiDistribution(values: Record<string, number | null>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value === null
        ? sourced<number>(null, "unknown", null, 0.2, "Verified POI count unavailable.")
        : sourced(value, "estimated", "curated-mvp-hub-seed", 0.65)
    ])
  );
}

function hub(input: {
  id: string;
  displayName: string;
  region: string;
  lat: number;
  lng: number;
  radius: number;
  stationIds: string[];
  busStopIds?: string[];
  transitLineCount: number;
  activity: Partial<Record<ActivityType, number>>;
  poi: Record<string, number | null>;
  eveningOpenRatio?: number | null;
  commerceScore?: number | null;
  floatingPopulation?: number | null;
  crowding?: "relaxed" | "normal" | "crowded" | "very_crowded" | null;
  confidence: number;
  missing?: string[];
}): MeetingHub {
  return {
    id: input.id,
    displayName: input.displayName,
    region: input.region,
    representative: { lat: input.lat, lng: input.lng },
    searchRadiusMeters: input.radius,
    stationIds: input.stationIds,
    busStopIds: input.busStopIds ?? [],
    transitLineCount: sourced(input.transitLineCount, "estimated", "curated-mvp-hub-seed", 0.7),
    poiDistribution: poiDistribution(input.poi),
    activityDistribution: activityDistribution(input.activity),
    eveningOpenRatio:
      input.eveningOpenRatio === undefined || input.eveningOpenRatio === null
        ? sourced<number>(null, "unknown", null, 0.25, "Evening opening ratio is not verified.")
        : sourced(input.eveningOpenRatio, "estimated", "curated-mvp-hub-seed", 0.6),
    commerceScore:
      input.commerceScore === undefined || input.commerceScore === null
        ? sourced<number>(null, "unknown", null, 0.25, "Commercial vitality data is unavailable.")
        : sourced(input.commerceScore, "estimated", "curated-mvp-hub-seed", 0.6),
    floatingPopulation:
      input.floatingPopulation === undefined || input.floatingPopulation === null
        ? sourced<number>(null, "unknown", null, 0.2, "Floating population coverage unavailable for this region.")
        : sourced(input.floatingPopulation, "estimated", "curated-mvp-hub-seed", 0.55),
    crowding:
      input.crowding === undefined || input.crowding === null
        ? sourced(null, "unknown", null, 0.2, "Live crowding data is unavailable.")
        : sourced(input.crowding, "estimated", "curated-mvp-hub-seed", 0.45, "Not real-time crowding."),
    accessibilityCoverage: sourced<number>(null, "unknown", null, 0.2, "Precise stair and slope coverage is unavailable."),
    sources: ["manual MVP hub registry", "public-provider-ready schema"],
    updatedAt: "2026-09-16T00:00:00.000Z",
    confidence: input.confidence,
    missing: input.missing ?? ["verified live crowding", "verified stair/slope coverage"]
  };
}

export const MEETING_HUBS: MeetingHub[] = [
  hub({
    id: "hongdae",
    displayName: "홍대입구",
    region: "서울 마포구",
    lat: 37.5572,
    lng: 126.9245,
    radius: 700,
    stationIds: ["hongik-univ"],
    transitLineCount: 4,
    activity: { meal: 88, cafe: 92, drinks: 94, shopping: 65, performance: 78, board_game: 72 },
    poi: { restaurant: 88, cafe: 92, bar: 94, culture: 78, shopping: 65 },
    eveningOpenRatio: 0.82,
    commerceScore: 88,
    floatingPopulation: 84,
    crowding: "crowded",
    confidence: 0.66
  }),
  hub({
    id: "sindorim",
    displayName: "신도림",
    region: "서울 구로구",
    lat: 37.5088,
    lng: 126.8913,
    radius: 650,
    stationIds: ["sindorim"],
    transitLineCount: 5,
    activity: { meal: 70, cafe: 62, drinks: 45, movie: 65, shopping: 72 },
    poi: { restaurant: 70, cafe: 62, bar: 45, movie: 65, shopping: 72 },
    eveningOpenRatio: 0.62,
    commerceScore: 69,
    floatingPopulation: 78,
    crowding: "normal",
    confidence: 0.68
  }),
  hub({
    id: "gangnam",
    displayName: "강남역",
    region: "서울 강남구",
    lat: 37.4979,
    lng: 127.0276,
    radius: 700,
    stationIds: ["gangnam"],
    transitLineCount: 5,
    activity: { meal: 92, cafe: 89, drinks: 85, movie: 60, shopping: 70, experience: 66 },
    poi: { restaurant: 92, cafe: 89, bar: 85, academy: 55, shopping: 70 },
    eveningOpenRatio: 0.8,
    commerceScore: 92,
    floatingPopulation: 90,
    crowding: "very_crowded",
    confidence: 0.67
  }),
  hub({
    id: "geondae",
    displayName: "건대입구",
    region: "서울 광진구",
    lat: 37.5404,
    lng: 127.0692,
    radius: 650,
    stationIds: ["konkuk-univ"],
    transitLineCount: 3,
    activity: { meal: 86, cafe: 78, drinks: 82, shopping: 64, board_game: 65 },
    poi: { restaurant: 86, cafe: 78, bar: 82, shopping: 64, activity: 65 },
    eveningOpenRatio: 0.78,
    commerceScore: 80,
    floatingPopulation: 75,
    crowding: "crowded",
    confidence: 0.64
  }),
  hub({
    id: "jamsil",
    displayName: "잠실",
    region: "서울 송파구",
    lat: 37.5133,
    lng: 127.1002,
    radius: 800,
    stationIds: ["jamsil"],
    transitLineCount: 4,
    activity: { meal: 82, cafe: 82, movie: 85, shopping: 92, walk: 76, sports: 70 },
    poi: { restaurant: 82, cafe: 82, movie: 85, shopping: 92, park: 76 },
    eveningOpenRatio: 0.73,
    commerceScore: 86,
    floatingPopulation: 82,
    crowding: "crowded",
    confidence: 0.65
  }),
  hub({
    id: "sadang",
    displayName: "사당",
    region: "서울 동작구",
    lat: 37.4766,
    lng: 126.9816,
    radius: 600,
    stationIds: ["sadang"],
    transitLineCount: 4,
    activity: { meal: 78, cafe: 66, drinks: 72, walk: 42 },
    poi: { restaurant: 78, cafe: 66, bar: 72, shopping: 35 },
    eveningOpenRatio: 0.72,
    commerceScore: 73,
    floatingPopulation: 76,
    crowding: "normal",
    confidence: 0.66
  }),
  hub({
    id: "yeongdeungpo",
    displayName: "영등포",
    region: "서울 영등포구",
    lat: 37.5156,
    lng: 126.9075,
    radius: 750,
    stationIds: ["yeongdeungpo"],
    transitLineCount: 4,
    activity: { meal: 82, cafe: 70, drinks: 76, movie: 76, shopping: 84 },
    poi: { restaurant: 82, cafe: 70, bar: 76, movie: 76, shopping: 84 },
    eveningOpenRatio: 0.76,
    commerceScore: 84,
    floatingPopulation: 80,
    crowding: "crowded",
    confidence: 0.66
  }),
  hub({
    id: "bucheon-station",
    displayName: "부천역 상권",
    region: "경기 부천시",
    lat: 37.4841,
    lng: 126.7828,
    radius: 650,
    stationIds: ["bucheon"],
    transitLineCount: 3,
    activity: { meal: 72, cafe: 64, drinks: 64, movie: 58, shopping: 62 },
    poi: { restaurant: 72, cafe: 64, bar: 64, movie: 58, shopping: 62 },
    eveningOpenRatio: null,
    commerceScore: 70,
    floatingPopulation: null,
    crowding: null,
    confidence: 0.52,
    missing: ["Gyeonggi floating population parity", "live crowding", "verified evening opening ratio"]
  }),
  hub({
    id: "sinjungdong",
    displayName: "신중동역 상권",
    region: "경기 부천시",
    lat: 37.5035,
    lng: 126.7752,
    radius: 650,
    stationIds: ["sinjung-dong"],
    transitLineCount: 2,
    activity: { meal: 74, cafe: 72, drinks: 58, movie: 54, shopping: 60 },
    poi: { restaurant: 74, cafe: 72, bar: 58, movie: 54, shopping: 60 },
    eveningOpenRatio: null,
    commerceScore: 72,
    floatingPopulation: null,
    crowding: null,
    confidence: 0.5,
    missing: ["Gyeonggi commercial data coverage", "live crowding", "verified evening opening ratio"]
  }),
  hub({
    id: "sangdong",
    displayName: "상동역 상권",
    region: "경기 부천시",
    lat: 37.5058,
    lng: 126.753,
    radius: 650,
    stationIds: ["sang-dong"],
    transitLineCount: 2,
    activity: { meal: 70, cafe: 70, drinks: 54, shopping: 62, walk: 50 },
    poi: { restaurant: 70, cafe: 70, bar: 54, shopping: 62, park: 50 },
    eveningOpenRatio: null,
    commerceScore: 68,
    floatingPopulation: null,
    crowding: null,
    confidence: 0.49,
    missing: ["Gyeonggi commercial data coverage", "live crowding", "verified evening opening ratio"]
  }),
  hub({
    id: "pangyo",
    displayName: "판교",
    region: "경기 성남시",
    lat: 37.3948,
    lng: 127.1112,
    radius: 700,
    stationIds: ["pangyo"],
    transitLineCount: 3,
    activity: { meal: 74, cafe: 82, drinks: 45, shopping: 66, walk: 60 },
    poi: { restaurant: 74, cafe: 82, bar: 45, shopping: 66, park: 60 },
    eveningOpenRatio: null,
    commerceScore: 73,
    floatingPopulation: null,
    crowding: null,
    confidence: 0.5,
    missing: ["Gyeonggi floating population parity", "live crowding", "verified evening opening ratio"]
  }),
  hub({
    id: "yatap",
    displayName: "야탑",
    region: "경기 성남시",
    lat: 37.4112,
    lng: 127.1287,
    radius: 650,
    stationIds: ["yatap"],
    transitLineCount: 2,
    activity: { meal: 68, cafe: 62, drinks: 48, movie: 58, shopping: 55 },
    poi: { restaurant: 68, cafe: 62, bar: 48, movie: 58, shopping: 55 },
    eveningOpenRatio: null,
    commerceScore: 65,
    floatingPopulation: null,
    crowding: null,
    confidence: 0.48,
    missing: ["Gyeonggi floating population parity", "live crowding", "verified evening opening ratio"]
  }),
  hub({
    id: "gwangmyeong-sageori",
    displayName: "광명사거리",
    region: "경기 광명시",
    lat: 37.4793,
    lng: 126.8548,
    radius: 600,
    stationIds: ["gwangmyeong-sageori"],
    transitLineCount: 2,
    activity: { meal: 62, cafe: 55, drinks: 42, shopping: 50 },
    poi: { restaurant: 62, cafe: 55, bar: 42, shopping: 50 },
    eveningOpenRatio: null,
    commerceScore: 58,
    floatingPopulation: null,
    crowding: null,
    confidence: 0.46,
    missing: ["Gyeonggi commercial data coverage", "live crowding", "verified evening opening ratio"]
  })
];

export function getHubById(id: string) {
  return MEETING_HUBS.find((hubItem) => hubItem.id === id) ?? null;
}
