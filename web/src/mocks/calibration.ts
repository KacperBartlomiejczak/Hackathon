import type { EvalResult, ModuleId, ModuleSettings } from "@/types";

interface Sample {
  label: boolean;
  score: number;
}

function buildSamples(module: ModuleId): Sample[] {
  let seed = 1000 + module * 7919;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: 40 }, (_, i) => {
    const label = i % 2 === 0;
    const base = label ? 0.62 : 0.38;
    const score = Math.min(0.99, Math.max(0.01, base + (next() - 0.5) * 0.7));
    return { label, score: Math.round(score * 100) / 100 };
  });
}

const samples: Record<ModuleId, Sample[]> = {
  1: buildSamples(1),
  2: buildSamples(2),
  3: buildSamples(3),
};

export function mockEval(module: ModuleId, threshold: number): EvalResult {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const s of samples[module]) {
    const predicted = s.score >= threshold;
    if (predicted && s.label) tp += 1;
    else if (predicted && !s.label) fp += 1;
    else if (!predicted && s.label) fn += 1;
    else tn += 1;
  }
  return {
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    tp,
    fp,
    fn,
    tn,
  };
}

export const mockModuleSettings: Record<ModuleId, ModuleSettings> = {
  1: { module: 1, threshold: 0.6, weights: { llm: 0.6, rules: 0.25, emb: 0.15 } },
  2: { module: 2, threshold: 0.55, weights: { llm: 0.5, rules: 0.3, emb: 0.2 } },
  3: { module: 3, threshold: 0.65, weights: { llm: 0.55, rules: 0.3, emb: 0.15 } },
};
