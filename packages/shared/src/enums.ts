export const CITIES = ["msk", "spb"] as const;
export type City = (typeof CITIES)[number];

export const TIERS = ["budget", "mid", "premium"] as const;
export type Tier = (typeof TIERS)[number];

export const FORMATS = ["zags", "vyezdnaya", "kamernaya"] as const;
export type WeddingFormat = (typeof FORMATS)[number];

export const CATEGORY_UNITS = ["per_guest", "fixed"] as const;
export type CategoryUnit = (typeof CATEGORY_UNITS)[number];

export const BENCHMARK_SOURCES = ["seed", "crowd"] as const;
export type BenchmarkSource = (typeof BENCHMARK_SOURCES)[number];
