"use client"

import { useCallback, useEffect, useState } from "react"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import type { Depense } from "@/lib/database.types"
import { DEP_CATS, aujourdHui, fcfa, jourCourt, lireNombre, messageErreur, periode } from "@/lib/format"

type P = "jour" | "semaine" | "mois"

export default function Depenses() {
  const { resto, supabase, toast, peutGerer, userId } = useResto()
  const [p, setP] = useState<P>("mois")
  const [liste, setListe] = useState<Depense[] | null>(null)
  const [jour, setJour] = useState(aujourdHui())
  const [libelle, setLibelle] = useState("")
  const [cat, setCat] = useState(DEP_CATS[0])
  const [montant, setMontant] = useState("")
  const [mode, setMode] = useState("Espèces")
  const [aSuppr, setASuppr] = useState<Depense | null>(null)

  const charger = useCallback(async () => {
    const [a, b] = periode(p)
    const { data, error } = await supabase.from("depenses").select("*").eq("restaurant_id", resto.id)
      .gte("jour", a).lte("jour", b).order("jour", { ascending: false }).order("created_at", { ascending: false })
    if (error) toast(messageErreur(error))
    setListe(data ?? [])
  }, [supabase, resto.id, p, toast])
  useEffect(() => { charger() }, [charger])

  async function ajouter(e: React.FormEvent) {
    e.preventDefault()
    const m = Math.round(lireNombre(montant))
    if (!libelle.trim() || m <= 0) { toast("Indiquez un libellé et un montant."); return }
    const { error } = await supabase.from("depenses").insert({ restaurant_id: resto.id, jour, libelle: libelle.trim(), categorie: cat, montant: m, mode_paiement: mode, created_by: userId })
    if (error) { toast(messageErreur(error)); return }
    setLibelle(""); setMontant(""); toast("Dépense ajoutée"); charger()
  }

  async function supprimer(d: Depense) {
    const { error } = await supabase.from("depenses").delete().eq("id", d.id)
    setASuppr(null)
    if (error) toast(messageErreur(error)); else { toast("Dépense supprimée"); charger() }
  }

  const total = (liste ?? []).reduce((s, d) => s + d.montant, 0)
  const parCat = DEP_CATS.map((c) => [c, (liste ?? []).filter((d) => d.categorie === c).reduce((s, d) => s + d.montant, 0)] as const).filter(([, v]) => v > 0)

  return (
    <div className="stack">
      <h2>Dépenses</h2>
      <form className="panel form-grid" onSubmit={ajouter}>
        <label className="f">Date<input id="dJour" type="date" value={jour} max={aujourdHui()} onChange={(e) => setJour(e.target.value)} required /></label>
        <label className="f span2">Libellé<input id="dLib" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="ex. 2 sacs de farine, gaz 12 kg" required /></label>
        <label className="f">Catégorie<select id="dCat" value={cat} onChange={(e) => setCat(e.target.value)}>{DEP_CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Montant (F)<input id="dMt" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="ex. 15000" required /></label>
        <label className="f">Payé par<select id="dMode" value={mode} onChange={(e) => setMode(e.target.value)}>{["Espèces", "Wave", "Orange Money", "Virement"].map((m) => <option key={m}>{m}</option>)}</select></label>
        <button className="btn primary">Ajouter la dépense</button>
      </form>
      <div className="row between">
        <div className="chips">
          {([["jour", "Aujourd'hui"], ["semaine", "7 jours"], ["mois", "Ce mois"]] as [P, string][]).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={p === k} onClick={() => setP(k)}>{l}</button>
          ))}
        </div>
        <b>Total : {fcfa(total)}</b>
      </div>
      {parCat.length > 1 && (
        <div className="row" style={{ gap: 8 }}>{parCat.map(([c, v]) => <span key={c} className="pill" style={{ color: "var(--muted)" }}>{c} · {fcfa(v)}</span>)}</div>
      )}
      {liste === null ? <div className="empty">Chargement…</div> : liste.length === 0 ? (
        <div className="empty">Aucune dépense sur cette période. Notez ici vos achats de farine, œufs, viande, gaz, salaires…</div>
      ) : (
        <div className="tbl">
          <table>
            <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Paiement</th><th className="num">Montant</th>{peutGerer && <th />}</tr></thead>
            <tbody>
              {liste.map((d) => (
                <tr key={d.id}>
                  <td>{jourCourt(d.jour)}</td><td>{d.libelle}</td><td>{d.categorie}</td><td>{d.mode_paiement}</td>
                  <td className="num"><b>{fcfa(d.montant)}</b></td>
                  {peutGerer && <td><button className="btn ghost danger" onClick={() => setASuppr(d)}>Supprimer</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aSuppr && (
        <Dialog label="Supprimer la dépense" onClose={() => setASuppr(null)}>
          <h2>Supprimer cette dépense ?</h2>
          <p>{aSuppr.libelle} · {fcfa(aSuppr.montant)}</p>
          <div className="row"><button className="btn" onClick={() => setASuppr(null)}>Garder</button><button className="btn primary" onClick={() => supprimer(aSuppr)}>Supprimer</button></div>
        </Dialog>
      )}
    </div>
  )
}
