import { fcfa, jourLong } from "@/lib/format"

function pas(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

export function Graphique14({ serie }: { serie: { jour: string; ca: number; dep: number }[] }) {
  if (!serie.length) return null
  const brut = Math.max(1000, ...serie.map((s) => Math.max(s.ca, s.dep)))
  const step = pas(brut / 4)
  const max = step * Math.ceil(brut / step)
  const W = 760, H = 240, L = 64, B = 28, T = 12, R = 8
  const cw = (W - L - R) / serie.length
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  const dernier = serie[serie.length - 1].jour
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventes et dépenses des 14 derniers jours">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR")}k` : v}</text>
          </g>
        ))}
        {serie.map((s, i) => {
          const x = L + i * cw, bw = cw * 0.36
          return (
            <g key={s.jour}>
              <rect x={x + cw * 0.12} y={y(s.ca)} width={bw} height={y(0) - y(s.ca)} rx={3} fill="var(--brand)"><title>{`${jourLong(s.jour)} · ventes ${fcfa(s.ca)}`}</title></rect>
              <rect x={x + cw * 0.12 + bw + 2} y={y(s.dep)} width={bw} height={y(0) - y(s.dep)} rx={3} fill="var(--coral)" fillOpacity={0.55}><title>{`${jourLong(s.jour)} · dépenses ${fcfa(s.dep)}`}</title></rect>
              <text x={x + cw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={s.jour === dernier ? "var(--fg)" : "var(--muted)"} fontWeight={s.jour === dernier ? 700 : 400}>{`${s.jour.slice(8)}/${s.jour.slice(5, 7)}`}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
