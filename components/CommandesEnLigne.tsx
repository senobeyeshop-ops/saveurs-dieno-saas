"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import { Recu, type RecuData } from "@/components/Recu"
import type { Commande, CommandeLigne } from "@/lib/database.types"
import { MODES, STATUTS_CMD, aujourdHui, decaler, fcfa, heure, lienWhatsApp, lireNombre, messageErreur, numCmd, texteRecuWhatsApp, type Mode } from "@/lib/format"

type Cmd = Commande & { commande_lignes: CommandeLigne[] }
const classeMode = (m: string) => (m === "Wave" ? "m-wave" : m === "Orange Money" ? "m-om" : "m-especes")

/** Commandes passées par les clients depuis la page publique : validation, retrait et encaissement. */
export function CommandesEnLigne({ apresEncaissement }: { apresEncaissement?: () => void }) {
  const { resto, supabase, toast } = useResto()
  const [cmds, setCmds] = useState<Cmd[]>([])
  const [aRefuser, setARefuser] = useState<Cmd | null>(null)
  const [motif, setMotif] = useState("")
  const [aEncaisser, setAEncaisser] = useState<Cmd | null>(null)
  const [mode, setMode] = useState<Mode>("Espèces")
  const [recu, setRecu] = useState("")
  const [ticket, setTicket] = useState<(RecuData & { jeton: string; telephone: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const nbNouvelles = useRef(0)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from("commandes").select("*, commande_lignes(*)")
      .eq("restaurant_id", resto.id).in("statut", ["nouvelle", "validee", "prete"])
      .gte("jour", decaler(aujourdHui(), -1)).order("created_at")
    if (error) return
    const liste = (data as Cmd[]) ?? []
    const n = liste.filter((c) => c.statut === "nouvelle").length
    if (n > nbNouvelles.current) toast(`Nouvelle commande en ligne (${n} à valider)`)
    nbNouvelles.current = n
    setCmds(liste)
  }, [supabase, resto.id, toast])

  useEffect(() => {
    charger()
    const t = window.setInterval(charger, 15000)
    return () => window.clearInterval(t)
  }, [charger])

  async function valider(c: Cmd) {
    const { error } = await supabase.rpc("valider_commande", { p_commande: c.id })
    if (error) toast(messageErreur(error)); else { toast(`${numCmd(c.numero)} validée, envoyée en cuisine`); charger() }
  }
  async function refuser(e: React.FormEvent) {
    e.preventDefault()
    if (!aRefuser) return
    const { error } = await supabase.rpc("refuser_commande", { p_commande: aRefuser.id, p_motif: motif })
    if (error) toast(messageErreur(error)); else { toast(`${numCmd(aRefuser.numero)} refusée`); setARefuser(null); setMotif(""); charger() }
  }
  async function encaisser(e: React.FormEvent) {
    e.preventDefault()
    if (!aEncaisser || busy) return
    const c = aEncaisser
    const recuN = lireNombre(recu)
    if (mode === "Espèces" && recuN > 0 && recuN < c.total) { toast("Le montant reçu est inférieur au total."); return }
    setBusy(true)
    const { data, error } = await supabase.rpc("encaisser_commande", { p_commande: c.id, p_mode: mode, p_recu: mode === "Espèces" ? Math.round(recuN) : 0 })
    setBusy(false)
    if (error || !data?.[0]) { toast(messageErreur(error)); return }
    const v = data[0]
    setAEncaisser(null); setRecu("")
    setTicket({
      numero: v.numero, date: new Date().toISOString(), mode, total: v.total, recu: mode === "Espèces" && recuN > 0 ? recuN : null,
      statut: "livre", jeton: v.jeton, telephone: c.telephone,
      lignes: c.commande_lignes.map((l) => ({ nom: l.nom, quantite: l.quantite, prix_unitaire: l.prix_unitaire })),
    })
    charger(); apresEncaissement?.()
  }

  const contacter = (c: Cmd, texte: string) => lienWhatsApp(c.telephone, texte)
  const lienSuivi = (c: Cmd) => `${window.location.origin}/suivi/${c.jeton}`

  if (!cmds.length && !ticket) return null
  const nouvelles = cmds.filter((c) => c.statut === "nouvelle")

  return (
    <>
      {cmds.length > 0 && (
        <div className="panel stack" style={{ gap: 10, borderColor: nouvelles.length ? "var(--bad)" : "var(--wave)", borderWidth: 2 }}>
          <div className="row between">
            <h3>Commandes en ligne</h3>
            {nouvelles.length > 0 && <span className="pill s-nouvelle">{nouvelles.length} à valider</span>}
          </div>
          <div className="queue">
            {cmds.map((c) => (
              <div key={c.id} className="panel stack" style={{ gap: 8, padding: 12 }}>
                <div className="row between">
                  <b>{numCmd(c.numero)} · {c.nom_client}</b>
                  <span className={`pill s-${c.statut}`}>{STATUTS_CMD[c.statut]}</span>
                </div>
                <span className="muted">{heure(c.created_at)} · +{c.telephone}</span>
                <div>{c.commande_lignes.map((l) => `${l.quantite}× ${l.nom}`).join(", ")}</div>
                {c.note && <div className="muted">« {c.note} »</div>}
                <b>{fcfa(c.total)} à payer au retrait</b>
                <div className="row" style={{ gap: 6 }}>
                  {c.statut === "nouvelle" ? (
                    <>
                      <button className="btn primary" onClick={() => valider(c)}>Valider</button>
                      <button className="btn ghost danger" onClick={() => { setARefuser(c); setMotif("") }}>Refuser</button>
                      <a className="btn ghost" target="_blank" rel="noopener noreferrer"
                        href={contacter(c, `Bonjour ${c.nom_client}, ici ${resto.nom} au sujet de votre commande ${numCmd(c.numero)}. `)}>Appeler sur WhatsApp</a>
                    </>
                  ) : (
                    <>
                      <button className="btn primary" onClick={() => { setAEncaisser(c); setMode("Espèces"); setRecu("") }}>Encaisser au retrait</button>
                      {c.statut === "prete" && (
                        <a className="btn wa" target="_blank" rel="noopener noreferrer"
                          href={contacter(c, `Bonjour ${c.nom_client}, votre commande ${numCmd(c.numero)} chez ${resto.nom} est prête. Total à payer au retrait : ${fcfa(c.total)}. Suivi : ${lienSuivi(c)}`)}>Prévenir le client</a>
                      )}
                      <button className="btn ghost danger" onClick={() => { setARefuser(c); setMotif("") }}>Annuler</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aRefuser && (
        <Dialog label="Refuser la commande" onClose={() => setARefuser(null)}>
          <h2>Refuser {numCmd(aRefuser.numero)} ?</h2>
          <p className="muted">Le client verra le motif sur sa page de suivi.</p>
          <form className="stack" style={{ gap: 10 }} onSubmit={refuser}>
            <input id="motifRefus" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. Plus de poulet aujourd'hui" maxLength={200} autoFocus />
            <div className="row"><button type="button" className="btn" onClick={() => setARefuser(null)}>Retour</button><button className="btn primary">Refuser la commande</button></div>
          </form>
        </Dialog>
      )}

      {aEncaisser && (
        <Dialog label="Encaisser la commande" onClose={() => setAEncaisser(null)}>
          <h2>{numCmd(aEncaisser.numero)} · {aEncaisser.nom_client}</h2>
          <div>{aEncaisser.commande_lignes.map((l) => <div key={l.id} className="row between"><span>{l.quantite} × {l.nom}</span><span>{fcfa(l.quantite * l.prix_unitaire)}</span></div>)}</div>
          <form className="stack" style={{ gap: 10 }} onSubmit={encaisser}>
            <div className="total"><span>Total</span><strong>{fcfa(aEncaisser.total)}</strong></div>
            <div className="modes">
              {MODES.map((m) => <button type="button" key={m} className={`mode ${classeMode(m)}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>)}
            </div>
            {mode === "Espèces" && (
              <label className="f">Montant reçu (facultatif)<input id="recuCmd" inputMode="numeric" value={recu} onChange={(e) => setRecu(e.target.value)} placeholder="ex. 5000" /></label>
            )}
            <p className="muted" style={{ margin: 0 }}>Le prix encaissé est celui du menu au moment du retrait.</p>
            <button className="btn primary big" disabled={busy}>{busy ? "Enregistrement…" : `Encaisser et remettre au client`}</button>
          </form>
        </Dialog>
      )}

      {ticket && (
        <Dialog label="Commande retirée" onClose={() => setTicket(null)}>
          <h2>Commande retirée</h2>
          <Recu resto={resto} data={ticket} />
          {mode === "Espèces" && ticket.recu ? <p style={{ margin: 0 }}><b>À rendre : {fcfa(ticket.recu - ticket.total)}</b></p> : null}
          <a className="btn wa big" target="_blank" rel="noopener noreferrer"
            href={lienWhatsApp(ticket.telephone, texteRecuWhatsApp(resto, ticket, window.location.origin))}>Envoyer le reçu par WhatsApp</a>
          <button className="btn primary big" onClick={() => setTicket(null)}>Fermer</button>
        </Dialog>
      )}
    </>
  )
}
