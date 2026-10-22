"use client"

import { useCallback, useEffect, useState } from "react"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import type { Commande, CommandeLigne, Vente, VenteLigne } from "@/lib/database.types"
import { decaler, aujourdHui, heure, messageErreur, numCmd } from "@/lib/format"

type Cmd = Vente & { vente_lignes: VenteLigne[] }
type Web = Commande & { commande_lignes: CommandeLigne[] }
const RETARD_MIN = 15

export default function Cuisine() {
  const { resto, supabase, toast } = useResto()
  const [attente, setAttente] = useState<Cmd[] | null>(null)
  const [livrees, setLivrees] = useState<Cmd[]>([])
  const [web, setWeb] = useState<Web[]>([])
  const [aSignaler, setASignaler] = useState<Cmd | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [maintenant, setMaintenant] = useState(() => Date.now())

  const charger = useCallback(async () => {
    const depuis = decaler(aujourdHui(), -1)
    const [a, l, w] = await Promise.all([
      supabase.from("ventes").select("*, vente_lignes(*)").eq("restaurant_id", resto.id)
        .eq("statut", "en_attente").gte("jour", depuis).order("created_at"),
      supabase.from("ventes").select("*, vente_lignes(*)").eq("restaurant_id", resto.id)
        .eq("statut", "livre").eq("jour", aujourdHui()).order("livre_at", { ascending: false }).limit(6),
      supabase.from("commandes").select("*, commande_lignes(*)").eq("restaurant_id", resto.id)
        .in("statut", ["validee", "prete"]).gte("jour", depuis).order("valide_at"),
    ])
    setWeb((w.data as Web[]) ?? [])
    if (a.error) toast(messageErreur(a.error))
    setAttente((a.data as Cmd[]) ?? [])
    setLivrees((l.data as Cmd[]) ?? [])
    setMaintenant(Date.now())
  }, [supabase, resto.id, toast])

  // La file se met à jour toute seule toutes les 10 secondes.
  useEffect(() => {
    charger()
    const t = window.setInterval(charger, 10000)
    return () => window.clearInterval(t)
  }, [charger])

  async function livrer(c: Cmd) {
    setBusy(c.id)
    const { error } = await supabase.rpc("marquer_livre", { p_vente: c.id })
    setBusy(null)
    if (error) toast(messageErreur(error)); else { toast(`Commande ${String(c.numero).padStart(3, "0")} livrée`); charger() }
  }

  async function prete(c: Web) {
    setBusy(c.id)
    const { error } = await supabase.rpc("commande_prete", { p_commande: c.id })
    setBusy(null)
    if (error) toast(messageErreur(error)); else { toast(`${numCmd(c.numero)} prête : la caisse peut prévenir le client`); charger() }
  }

  async function signaler(e: React.FormEvent) {
    e.preventDefault()
    if (!aSignaler) return
    const { error } = await supabase.rpc("signaler_probleme", { p_vente: aSignaler.id, p_note: note })
    if (error) toast(messageErreur(error)); else { toast("Problème signalé au gérant"); setASignaler(null); setNote(""); charger() }
  }

  const minutes = (c: Cmd) => Math.max(0, Math.floor((maintenant - new Date(c.created_at).getTime()) / 60000))

  return (
    <div className="stack">
      <div className="row between">
        <h2>Commandes en attente {attente ? `(${attente.length})` : ""}</h2>
        <button className="btn" onClick={charger}>Actualiser</button>
      </div>

      {attente === null ? <div className="empty">Chargement…</div> : attente.length === 0 ? (
        <div className="empty">Aucune commande en attente. Les nouvelles commandes payées apparaissent ici automatiquement.</div>
      ) : (
        <div className="queue">
          {attente.map((c) => {
            const m = minutes(c)
            return (
              <div key={c.id} className={`panel cmd${m >= RETARD_MIN ? " late" : ""}`}>
                <div className="row between">
                  <span className="num">{String(c.numero).padStart(3, "0")}</span>
                  <span className={m >= RETARD_MIN ? "err" : "muted"}>{heure(c.created_at)} · {m} min</span>
                </div>
                <ul>{c.vente_lignes.map((l) => <li key={l.id}>{l.quantite} × {l.nom}</li>)}</ul>
                {c.probleme_at && <div className="flag">Problème signalé : {c.probleme || "sans précision"}</div>}
                <button className="btn primary big" disabled={busy === c.id} onClick={() => livrer(c)}>
                  {busy === c.id ? "Enregistrement…" : "Livré"}
                </button>
                <button className="btn ghost" onClick={() => { setASignaler(c); setNote(c.probleme ?? "") }}>Signaler un problème</button>
              </div>
            )
          })}
        </div>
      )}

      {web.length > 0 && (
        <>
          <h2>Commandes en ligne ({web.filter((c) => c.statut === "validee").length} à préparer)</h2>
          <div className="queue">
            {web.map((c) => (
              <div key={c.id} className="panel cmd web" style={c.statut === "prete" ? { opacity: 0.6 } : undefined}>
                <div className="row between">
                  <span className="num">{numCmd(c.numero)}</span>
                  <span className="muted">{c.valide_at ? heure(c.valide_at) : heure(c.created_at)}</span>
                </div>
                <b>{c.nom_client} · à retirer au comptoir</b>
                <ul>{c.commande_lignes.map((l) => <li key={l.id}>{l.quantite} × {l.nom}</li>)}</ul>
                {c.note && <div className="flag">« {c.note} »</div>}
                {c.statut === "validee"
                  ? <button className="btn primary big" disabled={busy === c.id} onClick={() => prete(c)}>{busy === c.id ? "Enregistrement…" : "Prête"}</button>
                  : <div className="muted">Prête{c.prete_at ? ` depuis ${heure(c.prete_at)}` : ""}, en attente du client</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {livrees.length > 0 && (
        <div className="panel stack" style={{ gap: 6 }}>
          <h3>Livrées récemment</h3>
          {livrees.map((c) => (
            <div key={c.id} className="row between">
              <span><b>{String(c.numero).padStart(3, "0")}</b> · {c.vente_lignes.map((l) => `${l.quantite}× ${l.nom}`).join(", ")}</span>
              <span className="muted">{c.livre_at ? heure(c.livre_at) : ""}</span>
            </div>
          ))}
        </div>
      )}

      {aSignaler && (
        <Dialog label="Signaler un problème" onClose={() => setASignaler(null)}>
          <h2>Commande {String(aSignaler.numero).padStart(3, "0")}</h2>
          <p className="muted">Le gérant verra ce message dans la page Ventes et décidera s&apos;il faut annuler le ticket.</p>
          <form className="stack" style={{ gap: 10 }} onSubmit={signaler}>
            <input id="noteProbleme" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. Plus de poulet, client parti…" maxLength={200} autoFocus />
            <div className="row"><button type="button" className="btn" onClick={() => setASignaler(null)}>Fermer</button><button className="btn primary">Signaler</button></div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
