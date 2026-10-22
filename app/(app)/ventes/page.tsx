"use client"

import { useCallback, useEffect, useState } from "react"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import { Recu, type RecuData } from "@/components/Recu"
import type { Vente, VenteLigne } from "@/lib/database.types"
import { MODES, aujourdHui, decaler, fcfa, heure, jourLong, messageErreur } from "@/lib/format"

type VenteAvecLignes = Vente & { vente_lignes: VenteLigne[] }
const classeMode = (m: string) => (m === "Wave" ? "m-wave" : m === "Orange Money" ? "m-om" : "m-especes")

export default function Ventes() {
  const { resto, supabase, toast, peutGerer } = useResto()
  const [jour, setJour] = useState(aujourdHui())
  const [ventes, setVentes] = useState<VenteAvecLignes[] | null>(null)
  const [recu, setRecu] = useState<VenteAvecLignes | null>(null)
  const [aAnnuler, setAAnnuler] = useState<VenteAvecLignes | null>(null)

  const charger = useCallback(async () => {
    setVentes(null)
    const { data, error } = await supabase.from("ventes").select("*, vente_lignes(*)")
      .eq("restaurant_id", resto.id).eq("jour", jour).order("numero", { ascending: false })
    if (error) toast(messageErreur(error))
    setVentes((data as VenteAvecLignes[]) ?? [])
  }, [supabase, resto.id, jour, toast])
  useEffect(() => { charger() }, [charger])

  async function annuler(v: VenteAvecLignes) {
    const { error } = await supabase.rpc("annuler_vente", { p_vente: v.id })
    setAAnnuler(null)
    if (error) toast(messageErreur(error)); else { toast(`Ticket ${v.numero} annulé, stock remis`); charger() }
  }

  async function exporter() {
    const debut = jour.slice(0, 8) + "01"
    const fin = decaler(debut.slice(0, 8) + "28", 4).slice(0, 8) + "01"
    const { data, error } = await supabase.from("ventes").select("*, vente_lignes(*)")
      .eq("restaurant_id", resto.id).gte("jour", debut).lt("jour", fin).order("created_at")
    if (error) { toast(messageErreur(error)); return }
    const lignes = [["Date", "Heure", "Ticket", "Article", "Quantité", "Prix unitaire", "Montant", "Paiement", "Statut"]]
    for (const v of (data as VenteAvecLignes[]) ?? []) for (const l of v.vente_lignes)
      lignes.push([v.jour, heure(v.created_at), String(v.numero), l.nom, String(l.quantite), String(l.prix_unitaire), String(l.quantite * l.prix_unitaire), v.mode_paiement, v.annulee ? "Annulé" : "Validé"])
    const csv = "﻿" + lignes.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    a.download = `ventes-${resto.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${debut.slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const valides = (ventes ?? []).filter((v) => !v.annulee)
  const ca = valides.reduce((s, v) => s + v.total, 0)
  const vers = (v: VenteAvecLignes): RecuData => ({ numero: v.numero, date: v.created_at, mode: v.mode_paiement, total: v.total, recu: v.montant_recu, annulee: v.annulee, lignes: v.vente_lignes })

  return (
    <div className="stack">
      <div className="row between">
        <h2>Ventes du {jourLong(jour)}</h2>
        <div className="row">
          <button className="btn" onClick={() => setJour(decaler(jour, -1))} aria-label="Jour précédent">‹</button>
          <input id="jour" type="date" value={jour} max={aujourdHui()} onChange={(e) => e.target.value && setJour(e.target.value)} style={{ width: "auto" }} />
          <button className="btn" onClick={() => setJour(decaler(jour, 1))} disabled={jour >= aujourdHui()} aria-label="Jour suivant">›</button>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><h3>Chiffre d&apos;affaires</h3><div className="v">{fcfa(ca)}</div></div>
        <div className="kpi"><h3>Tickets</h3><div className="v">{valides.length}{ventes && ventes.length > valides.length ? <small> · {ventes.length - valides.length} annulé(s)</small> : null}</div></div>
        {MODES.map((m) => <div className="kpi" key={m}><h3>{m}</h3><div className="v">{fcfa(valides.filter((v) => v.mode_paiement === m).reduce((s, v) => s + v.total, 0))}</div></div>)}
      </div>
      <div className="row">
        <button className="btn" onClick={exporter}>Exporter le mois en CSV</button>
        <span className="muted">Journal des ventes pour la comptabilité (s&apos;ouvre dans Excel).</span>
      </div>
      {ventes === null ? <div className="empty">Chargement…</div> : ventes.length === 0 ? <div className="empty">Aucune vente enregistrée ce jour-là.</div> : (
        <div className="tbl">
          <table>
            <thead><tr><th>Heure</th><th>N°</th><th>Articles</th><th>Paiement</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {ventes.map((v) => (
                <tr key={v.id} className={v.annulee ? "cancel" : undefined}>
                  <td>{heure(v.created_at)}</td>
                  <td>{String(v.numero).padStart(3, "0")}</td>
                  <td>{v.vente_lignes.map((l) => `${l.quantite}× ${l.nom}`).join(", ")}</td>
                  <td><span className={`pill ${classeMode(v.mode_paiement)}`}>{v.mode_paiement}</span></td>
                  <td className="num"><b>{fcfa(v.total)}</b></td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                      <button className="btn ghost" onClick={() => setRecu(v)}>Reçu</button>
                      {peutGerer && !v.annulee && <button className="btn ghost danger" onClick={() => setAAnnuler(v)}>Annuler</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {recu && <Dialog label="Reçu" onClose={() => setRecu(null)}><Recu resto={resto} data={vers(recu)} /><button className="btn" onClick={() => setRecu(null)}>Fermer</button></Dialog>}
      {aAnnuler && (
        <Dialog label="Annuler le ticket" onClose={() => setAAnnuler(null)}>
          <h2>Annuler le ticket {String(aAnnuler.numero).padStart(3, "0")} ?</h2>
          <p>Il restera visible, barré, ne comptera plus dans le chiffre d&apos;affaires, et les ingrédients consommés reviendront en stock.</p>
          <div className="row"><button className="btn" onClick={() => setAAnnuler(null)}>Garder</button><button className="btn primary" onClick={() => annuler(aAnnuler)}>Annuler le ticket</button></div>
        </Dialog>
      )}
    </div>
  )
}
