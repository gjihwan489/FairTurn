import { z } from "zod";

const coordinateSchema = z.object({
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132)
});

const locationSchema = z.object({
  label: z.string().min(1),
  coordinate: coordinateSchema,
  address: z.string().optional()
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
  placeCategoryLikes: z.array(z.string()),
  crowdingAvoidance: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
});

const participantSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  profileId: z.string().nullable().optional(),
  friendId: z.string().nullable().optional(),
  coarseOriginLabel: z.string().min(1),
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
  meetingId: z.string().min(1),
  revision: z.number().int().positive(),
  startsAt: z.string().min(1),
  expectedEndsAt: z.string().nullable().optional(),
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
