"use client"

import { useCallback, useEffect, useState } from "react"
import { useResto } from "@/components/Resto"
import { Graphique14 } from "@/components/Graphique14"
import { aujourdHui, decaler, fcfa, messageErreur, periode } from "@/lib/format"

type P = "jour" | "semaine" | "mois" | "trente"
type Jour = { jour: string; ca: number; tickets: number; esp: number; wave: number; om: number }
type Donnees = { jours: Jour[]; dep: { jour: string; montant: number }[]; top: { nom: string; q: number; v: number }[]; heures: Map<string, number> }

const LABELS: Record<P, string> = { jour: "aujourd'hui", semaine: "sur 7 jours", mois: "ce mois", trente: "sur 30 jours" }

export default function TableauDeBord() {
  const { resto, supabase, toast } = useResto()
  const [p, setP] = useState<P>("jour")
  const [d, setD] = useState<Donnees | null>(null)
  const [serie, setSerie] = useState<{ jour: string; ca: number; dep: number }[]>([])

  const charger = useCallback(async () => {
    const [a, b] = periode(p)
    const debut14 = decaler(aujourdHui(), -13)
    const min = a < debut14 ? a : debut14
    const [sv, sd, sa, vh] = await Promise.all([
      supabase.from("stats_ventes_jour").select("*").eq("restaurant_id", resto.id).gte("jour", min).lte("jour", b),
      supabase.from("stats_depenses_jour").select("*").eq("restaurant_id", resto.id).gte("jour", min).lte("jour", b),
      supabase.from("stats_articles_jour").select("*").eq("restaurant_id", resto.id).gte("jour", a).lte("jour", b),
      supabase.from("ventes").select("created_at, total").eq("restaurant_id", resto.id).eq("annulee", false).gte("jour", a).lte("jour", b).limit(5000),
    ])
    const err = sv.error || sd.error || sa.error || vh.error
    if (err) toast(messageErreur(err))
    const jours: Jour[] = (sv.data ?? []).map((r) => ({ jour: r.jour!, ca: Number(r.ca ?? 0), tickets: Number(r.tickets ?? 0), esp: Number(r.ca_especes ?? 0), wave: Number(r.ca_wave ?? 0), om: Number(r.ca_orange_money ?? 0) }))
    const dep = (sd.data ?? []).map((r) => ({ jour: r.jour!, montant: Number(r.depenses ?? 0) }))
    const agg = new Map<string, { q: number; v: number }>()
    for (const r of sa.data ?? []) { const x = agg.get(r.nom!) ?? { q: 0, v: 0 }; x.q += Number(r.quantite ?? 0); x.v += Number(r.montant ?? 0); agg.set(r.nom!, x) }
    const heures = new Map<string, number>()
    for (const v of vh.data ?? []) {
      const h = new Date(v.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", hour12: false, timeZone: "Africa/Dakar" }).slice(0, 2)
      heures.set(h, (heures.get(h) ?? 0) + v.total)
    }
    setD({
      jours: jours.filter((j) => j.jour >= a), dep: dep.filter((x) => x.jour >= a),
      top: [...agg.entries()].map(([nom, x]) => ({ nom, ...x })).sort((x, y) => y.v - x.v).slice(0, 6), heures,
    })
    const s: { jour: string; ca: number; dep: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const j = decaler(aujourdHui(), -i)
      s.push({ jour: j, ca: jours.find((x) => x.jour === j)?.ca ?? 0, dep: dep.find((x) => x.jour === j)?.montant ?? 0 })
    }
    setSerie(s)
  }, [supabase, resto.id, p, toast])
  useEffect(() => { charger() }, [charger])

  const ca = d?.jours.reduce((s, j) => s + j.ca, 0) ?? 0
  const tickets = d?.jours.reduce((s, j) => s + j.tickets, 0) ?? 0
  const dep = d?.dep.reduce((s, x) => s + x.montant, 0) ?? 0
  const res = ca - dep
  const modes = [
    ["Espèces", d?.jours.reduce((s, j) => s + j.esp, 0) ?? 0, "--cash"],
    ["Wave", d?.jours.reduce((s, j) => s + j.wave, 0) ?? 0, "--wave"],
    ["Orange Money", d?.jours.reduce((s, j) => s + j.om, 0) ?? 0, "--om"],
  ] as const
  const pic = d ? [...d.heures.entries()].sort((a, b) => b[1] - a[1])[0] : undefined
  const maxTop = d?.top[0]?.v || 1

  return (
    <div className="stack">
      <div className="row between">
        <h2>Tableau de bord {LABELS[p]}</h2>
        <div className="chips">
          {([["jour", "Jour"], ["semaine", "7 jours"], ["mois", "Mois"], ["trente", "30 jours"]] as [P, string][]).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={p === k} onClick={() => setP(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><h3>Chiffre d&apos;affaires</h3><div className="v">{fcfa(ca)}</div></div>
        <div className="kpi"><h3>Dépenses</h3><div className="v">{fcfa(dep)}</div></div>
        <div className={`kpi res ${res < 0 ? "neg" : ""}`}><h3>Résultat de caisse</h3><div className="v">{fcfa(res)}</div></div>
        <div className="kpi"><h3>Tickets · panier moyen</h3><div className="v">{tickets} <small>· {fcfa(tickets ? ca / tickets : 0)}</small></div></div>
      </div>
      <div className="panel stack" style={{ gap: 10 }}>
        <div className="row between">
          <h3>Recettes et dépenses, 14 derniers jours</h3>
          <div className="legend"><span><i style={{ background: "var(--brand)" }} />Ventes</span><span><i style={{ background: "var(--coral)", opacity: 0.55 }} />Dépenses</span></div>
        </div>
        <Graphique14 serie={serie} />
      </div>
      <div className="two">
        <div className="panel stack" style={{ gap: 12 }}>
          <h3>Articles les plus vendus</h3>
          {d && d.top.length ? (
            <div className="bars">
              {d.top.map((t) => (
                <div className="bar" key={t.nom}>
                  <span>{t.nom}</span>
                  <div className="track"><div className="fill" style={{ width: `${Math.max(3, (t.v / maxTop) * 100)}%` }} /></div>
                  <span className="n">{t.q} · {fcfa(t.v)}</span>
                </div>
              ))}
            </div>
          ) : <div className="empty">Pas encore de ventes sur la période.</div>}
        </div>
        <div className="panel stack" style={{ gap: 12 }}>
          <h3>Encaissements par moyen de paiement</h3>
          <div className="bars">
            {modes.map(([m, v, c]) => (
              <div className="bar" key={m}>
                <span>{m}</span>
                <div className="track"><div className="fill" style={{ width: `${ca ? Math.max(v ? 3 : 0, (v / ca) * 100) : 0}%`, background: `var(${c})` }} /></div>
                <span className="n">{fcfa(v)}</span>
              </div>
            ))}
          </div>
          <p className="muted">{pic ? `Heure la plus active : ${pic[0]}h–${String(Number(pic[0]) + 1).padStart(2, "0")}h (${fcfa(pic[1])}).` : "L'heure de pointe apparaîtra après les premières ventes."}</p>
        </div>
      </div>
    </div>
  )
}
