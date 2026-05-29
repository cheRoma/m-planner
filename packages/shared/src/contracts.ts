import { z } from "zod";
import { CITIES, TIERS, FORMATS } from "./enums";

export const EstimateRequestSchema = z.object({
  city: z.enum(CITIES),
  format: z.enum(FORMATS),
  tier: z.enum(TIERS),
  guests: z.number().int().min(1).max(2000),
});
export type EstimateRequest = z.infer<typeof EstimateRequestSchema>;

// Money crosses the API boundary as a decimal string of kopecks (bigint-safe in JSON).
export const AggregateSchema = z.object({
  categorySlug: z.string(),
  source: z.enum(["seed", "crowd"]),
  p25: z.string(),       // kopecks as string
  median: z.string(),
  p75: z.string(),
  sampleCount: z.number().int(),
  asOfYear: z.number().int().nullable(),
});
export type AggregateDTO = z.infer<typeof AggregateSchema>;

export const EstimateLineSchema = z.object({
  categorySlug: z.string(),
  label: z.string(),                  // "По 7 реальным свадьбам" | "Ориентир (2026)"
  source: z.enum(["seed", "crowd"]),
  low: z.string(),                    // p25 × guests (or fixed), kopecks string
  mid: z.string(),
  high: z.string(),
});
export type EstimateLine = z.infer<typeof EstimateLineSchema>;

export const EstimateResultSchema = z.object({
  lines: z.array(EstimateLineSchema),
  totalLow: z.string(),
  totalMid: z.string(),
  totalHigh: z.string(),
});
export type EstimateResult = z.infer<typeof EstimateResultSchema>;
