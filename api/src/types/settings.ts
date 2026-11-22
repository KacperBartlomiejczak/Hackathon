import { z } from "zod";

const moduleSchema = z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)]));
const unit = z.number().min(0).max(1);

export const moduleParamsSchema = z.object({ module: moduleSchema });

// Full replace: every field required. Weights must sum to 1 (±0.01).
export const settingsBodySchema = z.object({
  threshold: unit,
  weights: z
    .object({ llm: unit, rules: unit, emb: unit })
    .strict()
    .refine((w) => Math.abs(w.llm + w.rules + w.emb - 1) <= 0.01, {
      message: "weights must sum to 1 (±0.01)",
    }),
});

export const evalQuerySchema = z.object({
  module: moduleSchema,
  // `?threshold=` would coerce to 0 (Number("") === 0); treat it as missing instead.
  threshold: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().min(0).max(1)),
});

export type ModuleSettings = {
  module: number;
  threshold: number;
  weights: { llm: number; rules: number; emb: number };
};
