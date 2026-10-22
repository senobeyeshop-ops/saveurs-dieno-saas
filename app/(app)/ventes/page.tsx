"use client"

import { useCallback, useEffect, useState } from "react"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import { Recu, type RecuData } from "@/components/Recu"
import type { Vente, VenteLigne } from "@/lib/database.types"
import { MODES, STATUTS, aujourdHui, decaler, fcfa, heure, jourLong, lienWhatsApp, messageErreur, texteRecuWhatsApp } from "@/lib/format"

type VenteAvecLignes = Vente & { vente_lignes: VenteLigne[] }
const classeMode = (m: string) => (m === "Wave" ? "m-wave" : m === "Orange Money" ? "m-om" : "m-especes")

export default function Ventes() {
  const { resto, supabase, toast, peutGerer, userId } = useResto()
  const [jour, setJour] = useState(aujourdHui())
  const [ventes, setVentes] = useState<VenteAvecLignes[] | null>(null)
  const [recu, setRecu] = useState<VenteAvecLignes | null>(null)
  const [aAnnuler, setAAnnuler] = useState<VenteAvecLignes | null>(null)
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [filtre, setFiltre] = useState("")
  const [statut, setStatut] = useState("")
  const [envoi, setEnvoi] = useState<VenteAvecLignes | null>(null)
  const [telEnvoi, setTelEnvoi] = useState("")

  useEffect(() => {
    supabase.from("membres").select("user_id, nom_affiche").eq("restaurant_id", resto.id).then(({ data }) => {
      const m: Record<string, string> = {}
      for (const x of data ?? []) m[x.user_id] = x.user_id === userId ? "Vous" : (x.nom_affiche || `Membre ${x.user_id.slice(0, 6)}`)
      setNoms(m)
    })
  }, [supabase, resto.id, userId])
  const nomCaissier = (id: string | null) => (id ? noms[id] ?? "Ancien membre" : "—")

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

  async function livrer(v: VenteAvecLignes) {
    const { error } = await supabase.rpc("marquer_livre", { p_vente: v.id })
    if (error) toast(messageErreur(error)); else { toast(`Ticket ${String(v.numero).padStart(3, "0")} livré`); charger() }
  }

  const lienEnvoi = (v: VenteAvecLignes, tel: string) =>
    lienWhatsApp(tel, texteRecuWhatsApp(resto, { numero: v.numero, total: v.total, mode: v.mode_paiement, jeton: v.jeton, lignes: v.vente_lignes }, window.location.origin))

  async function exporter() {
    const debut = jour.slice(0, 8) + "01"
    const fin = decaler(debut.slice(0, 8) + "28", 4).slice(0, 8) + "01"
    const { data, error } = await supabase.from("ventes").select("*, vente_lignes(*)")
      .eq("restaurant_id", resto.id).gte("jour", debut).lt("jour", fin).order("created_at")
    if (error) { toast(messageErreur(error)); return }
    const lignes = [["Date", "Heure", "Ticket", "Caissier", "Article", "Quantité", "Prix unitaire", "Montant", "Paiement", "Statut", "Téléphone client"]]
    for (const v of (data as VenteAvecLignes[]) ?? []) for (const l of v.vente_lignes)
      lignes.push([v.jour, heure(v.created_at), String(v.numero), nomCaissier(v.caissier_id), l.nom, String(l.quantite), String(l.prix_unitaire), String(l.quantite * l.prix_unitaire), v.mode_paiement, STATUTS[v.statut] ?? v.statut, v.telephone_client ?? ""])
    const csv = "﻿" + lignes.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    a.download = `ventes-${resto.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${debut.slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const visibles = (ventes ?? []).filter((v) => (!filtre || v.caissier_id === filtre) && (!statut || v.statut === statut))
  const enAttente = (ventes ?? []).filter((v) => v.statut === "en_attente")
  const signales = enAttente.filter((v) => v.probleme_at)
  const valides = visibles.filter((v) => !v.annulee)
  const parCaissier = new Map<string, VenteAvecLignes[]>()
  for (const v of (ventes ?? []).filter((x) => !x.annulee)) {
    const k = v.caissier_id ?? ""
    parCaissier.set(k, [...(parCaissier.get(k) ?? []), v])
  }
  const somme = (l: VenteAvecLignes[], m?: string) => l.filter((v) => !m || v.mode_paiement === m).reduce((s, v) => s + v.total, 0)
  const ca = valides.reduce((s, v) => s + v.total, 0)
  const vers = (v: VenteAvecLignes): RecuData => ({ numero: v.numero, date: v.created_at, mode: v.mode_paiement, total: v.total, recu: v.montant_recu, annulee: v.annulee, statut: v.statut, lignes: v.vente_lignes })

  return (
    <div className="stack">
      <div className="row between">
        <h2>{peutGerer ? "Ventes" : "Mes ventes"} du {jourLong(jour)}</h2>
        <div className="row">
          <button className="btn" onClick={() => setJour(decaler(jour, -1))} aria-label="Jour précédent">‹</button>
          <input id="jour" type="date" value={jour} max={aujourdHui()} onChange={(e) => e.target.value && setJour(e.target.value)} style={{ width: "auto" }} />
          <button className="btn" onClick={() => setJour(decaler(jour, 1))} disabled={jour >= aujourdHui()} aria-label="Jour suivant">›</button>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><h3>Chiffre d&apos;affaires</h3><div className="v">{fcfa(ca)}</div></div>
        <div className="kpi"><h3>Tickets</h3><div className="v">{valides.length}{visibles.length > valides.length ? <small> · {visibles.length - valides.length} annulé(s)</small> : null}</div></div>
        <div className="kpi"><h3>En attente</h3><div className="v">{enAttente.length}</div></div>
        {MODES.map((m) => <div className="kpi" key={m}><h3>{m}</h3><div className="v">{fcfa(valides.filter((v) => v.mode_paiement === m).reduce((s, v) => s + v.total, 0))}</div></div>)}
      </div>
      {peutGerer && signales.length > 0 && (
        <div className="alert">
          <b>La cuisine signale un problème</b>
          <span>{signales.map((v) => `Ticket ${String(v.numero).padStart(3, "0")} : ${v.probleme || "sans précision"}`).join(" · ")}</span>
        </div>
      )}
      <div className="chips">
        {[["", "Tous"], ["en_attente", "En attente"], ["livre", "Livrés"], ["annule", "Annulés"]].map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={statut === k} onClick={() => setStatut(k)}>{l}</button>
        ))}
      </div>
      {peutGerer && parCaissier.size > 0 && (
        <div className="panel stack" style={{ gap: 10 }}>
          <div className="row between">
            <h3>Par caissier</h3>
            <select aria-label="Filtrer par caissier" value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ width: "auto" }}>
              <option value="">Tous les caissiers</option>
              {[...parCaissier.keys()].map((k) => <option key={k} value={k}>{nomCaissier(k || null)}</option>)}
            </select>
          </div>
          <div className="tbl">
            <table>
              <thead><tr><th>Caissier</th><th className="num">Tickets</th>{MODES.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {[...parCaissier.entries()].map(([k, l]) => (
                  <tr key={k}>
                    <td>{nomCaissier(k || null)}</td>
                    <td className="num">{l.length}</td>
                    {MODES.map((m) => <td key={m} className="num">{fcfa(somme(l, m))}</td>)}
                    <td className="num"><b>{fcfa(somme(l))}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Les espèces de chaque ligne sont ce que ce caissier doit remettre en fin de service. Les tickets annulés ne sont pas comptés.</p>
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={exporter}>Exporter le mois en CSV</button>
        <span className="muted">Journal des ventes pour la comptabilité (s&apos;ouvre dans Excel).</span>
      </div>
      {ventes === null ? <div className="empty">Chargement…</div> : visibles.length === 0 ? <div className="empty">Aucune vente enregistrée ce jour-là.</div> : (
        <div className="tbl">
          <table>
            <thead><tr><th>Heure</th><th>N°</th>{peutGerer && <th>Caissier</th>}<th>Articles</th><th>Paiement</th><th>Statut</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.id} className={v.annulee ? "cancel" : undefined}>
                  <td>{heure(v.created_at)}</td>
                  <td>{String(v.numero).padStart(3, "0")}</td>
                  {peutGerer && <td>{nomCaissier(v.caissier_id)}</td>}
                  <td>{v.vente_lignes.map((l) => `${l.quantite}× ${l.nom}`).join(", ")}</td>
                  <td><span className={`pill ${classeMode(v.mode_paiement)}`}>{v.mode_paiement}</span></td>
                  <td>
                    <span className={`pill s-${v.statut}`}>{STATUTS[v.statut] ?? v.statut}</span>
                    {v.statut === "en_attente" && v.probleme_at && <small className="err" style={{ display: "block" }}>Problème : {v.probleme || "signalé"}</small>}
                  </td>
                  <td className="num"><b>{fcfa(v.total)}</b></td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                      <button className="btn ghost" onClick={() => setRecu(v)}>Reçu</button>
                      {!v.annulee && <button className="btn ghost" onClick={() => { setEnvoi(v); setTelEnvoi(v.telephone_client ?? "") }}>WhatsApp</button>}
                      {peutGerer && v.statut === "en_attente" && <button className="btn ghost" onClick={() => livrer(v)}>Livré</button>}
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
      {envoi && (
        <Dialog label="Envoyer le reçu par WhatsApp" onClose={() => setEnvoi(null)}>
          <h2>Reçu du ticket {String(envoi.numero).padStart(3, "0")}</h2>
          <p className="muted">WhatsApp s&apos;ouvre avec le message prêt. Il reste à appuyer sur Envoyer. Le client pourra suivre sa commande grâce au lien.</p>
          <label className="f">Numéro WhatsApp du client
            <input id="telEnvoi" type="tel" inputMode="tel" value={telEnvoi} onChange={(e) => setTelEnvoi(e.target.value)} placeholder="ex. 77 123 45 67" autoFocus />
          </label>
          <div className="row">
            <button className="btn" onClick={() => setEnvoi(null)}>Fermer</button>
            <a className="btn wa" target="_blank" rel="noopener noreferrer" aria-disabled={telEnvoi.replace(/\D/g, "").length < 9}
              href={lienEnvoi(envoi, telEnvoi)} onClick={(e) => { if (telEnvoi.replace(/\D/g, "").length < 9) { e.preventDefault(); toast("Saisissez le numéro du client") } else setEnvoi(null) }}>
              Ouvrir WhatsApp
            </a>
          </div>
        </Dialog>
      )}
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
