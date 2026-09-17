import { z } from "zod";

const coordinateSchema = z.object({
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132)
});

const boundedString = (max: number) => z.string().trim().min(1).max(max);

const locationSchema = z.object({
  label: boundedString(80),
  coordinate: coordinateSchema,
  address: z.string().max(200).optional()
});

const constraintsSchema = z.object({
  maxTravelMinutes: z.number().positive().max(240).optional(),
  maxTransfers: z.number().int().min(0).max(8).optional(),
  maxWalkMinutes: z.number().positive().max(120).optional(),
  maxFareWon: z.number().int().positive().max(100000).optional(),
  minLastTransitBufferMinutes: z.number().int().min(0).max(240).optional(),
  avoidStairs: z.boolean().optional(),
  avoidSlopes: z.boolean().optional(),
  needsElevator: z.boolean().optional(),
  wheelchairAccess: z.boolean().optional(),
  unavailableModes: z.array(z.enum(["transit", "walk", "taxi", "mixed"])).optional()
});

const preferencesSchema = z.object({
  activityLikes: z.array(
    z.enum([
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
    ])
  ),
  activityDislikes: z.array(
    z.enum([
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
    ])
  ),
  placeCategoryLikes: z.array(boundedString(40)).max(12),
  crowdingAvoidance: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
});

const participantSchema = z.object({
  id: boundedString(80),
  displayName: boundedString(80),
  profileId: z.string().max(120).nullable().optional(),
  friendId: z.string().max(120).nullable().optional(),
  coarseOriginLabel: boundedString(80),
  origin: locationSchema,
  returnLocation: locationSchema,
  availableFrom: z.string().optional(),
  desiredArrival: z.string().optional(),
  expectedReturnStart: z.string().optional(),
  mode: z.enum(["transit", "walk", "taxi", "mixed"]),
  constraints: constraintsSchema,
  preferences: preferencesSchema,
  oldLedger: z.number(),
  exactLocationConsent: z.boolean()
});

export const recommendationRequestSchema = z.object({
  meetingId: boundedString(120),
  revision: z.number().int().positive(),
  startsAt: boundedString(40),
  expectedEndsAt: z.string().max(40).nullable().optional(),
  activityTypes: z.array(
    z.enum([
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
    ])
  ),
  candidateCount: z.number().int().min(1).max(4),
  preset: z.enum(["balanced", "time_first", "hub_first", "late_return", "fare_first", "accessibility_first"]),
  weights: z.object({
    efficiency: z.number().min(0).max(1),
    worstPersonProtection: z.number().min(0).max(1),
    cumulativeBalance: z.number().min(0).max(1),
    hubQuality: z.number().min(0).max(1),
    groupPreferenceFit: z.number().min(0).max(1)
  }),
  participants: z.array(participantSchema).min(1).max(8),
  providerMode: z.enum(["fixture", "live"])
});

const sharedCandidateSchema = z.object({
  id: boundedString(160),
  meetingId: boundedString(120),
  revision: z.number().int().positive(),
  hub: z.object({
    id: boundedString(80),
    displayName: boundedString(80),
    region: boundedString(80)
  }).passthrough(),
  burdens: z.array(z.object({
    participantId: boundedString(80),
    participantName: boundedString(80),
    total: z.number().nullable()
  }).passthrough()).max(8),
  score: z.object({ finalScore: z.number() }).passthrough(),
  candidateTypes: z.array(z.string().max(40)).max(4),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(200)).max(20),
  missing: z.array(z.string().max(120)).max(40),
  explanationFacts: z.array(z.object({
    label: z.string().max(80),
    value: z.string().max(120),
    tone: z.enum(["positive", "neutral", "warning"])
  })).max(12)
}).passthrough();

export const sharedMeetingRequestSchema = z.object({
  meetingId: boundedString(120),
  revision: z.number().int().positive(),
  participants: z.array(participantSchema).min(1).max(8),
  candidates: z.array(sharedCandidateSchema).max(4)
});

export const venuesRequestSchema = z.object({
  meetingId: boundedString(120),
  candidateId: z.string().max(160).optional(),
  hubId: boundedString(80),
  hubName: boundedString(80),
  radiusMeters: z.number().int().min(100).max(800).default(500),
  categories: z.array(boundedString(30)).max(8).default([])
});
