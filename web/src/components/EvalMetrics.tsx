import { Tile } from "@/components/Tile";
import type { EvalResult } from "@/types";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function f1(precision: number, recall: number): number {
  const sum = precision + recall;
  return sum === 0 ? 0 : (2 * precision * recall) / sum;
}

const cell = "border border-line p-2";

export function EvalMetrics({ data }: { data: EvalResult }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile label="Oznaczone flagą" value={String(data.tp + data.fp)} hint="wyników przy tym progu" />
        <Tile label="Precyzja" value={percent(data.precision)} />
        <Tile label="Czułość" value={percent(data.recall)} />
        <Tile label="F1" value={percent(f1(data.precision, data.recall))} />
        <Tile label="FP" value={String(data.fp)} hint="fałszywe alarmy" />
        <Tile label="FN" value={String(data.fn)} hint="pominięte naruszenia" />
      </div>
      <table className="w-full max-w-sm border-collapse text-center text-sm">
        <caption className="pb-1 text-left text-xs uppercase text-slate-500">Macierz pomyłek</caption>
        <thead>
          <tr>
            <th className={cell} />
            <th className={`${cell} font-medium`}>Flaga</th>
            <th className={`${cell} font-medium`}>Brak flagi</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className={`${cell} font-medium`}>Naruszenie</th>
            <td className={`${cell} bg-emerald-50 tabular-nums`}>TP: {data.tp}</td>
            <td className={`${cell} bg-red-50 tabular-nums`}>FN: {data.fn}</td>
          </tr>
          <tr>
            <th className={`${cell} font-medium`}>Brak naruszenia</th>
            <td className={`${cell} bg-red-50 tabular-nums`}>FP: {data.fp}</td>
            <td className={`${cell} bg-emerald-50 tabular-nums`}>TN: {data.tn}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
