"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import type { Membre } from "@/lib/database.types"
import { ROLES, messageErreur } from "@/lib/format"

export default function Equipe() {
  const { resto, supabase, toast, role, userId, peutGerer } = useResto()
  const [membres, setMembres] = useState<Membre[] | null>(null)
  const [aRetirer, setARetirer] = useState<Membre | null>(null)
  const [emailBloque, setEmailBloque] = useState("")
  const router = useRouter()
  const [ouvert, setOuvert] = useState(resto.commandes_ouvertes)
  const [messageCmd, setMessageCmd] = useState(resto.message_commande ?? "")
  const [origine, setOrigine] = useState("")
  useEffect(() => { setOrigine(window.location.origin) }, [])
  const lienCommande = `${origine}/commander/${resto.slug}`
  const [raz, setRaz] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [remettreStock, setRemettreStock] = useState(true)
  const [razBusy, setRazBusy] = useState(false)
  const [infos, setInfos] = useState({ nom: resto.nom, telephone: resto.telephone ?? "", adresse: resto.adresse ?? "" })
  const proprio = role === "proprietaire"

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from("membres").select("*").eq("restaurant_id", resto.id).order("created_at")
    if (error) toast(messageErreur(error))
    setMembres(data ?? [])
  }, [supabase, resto.id, toast])
  useEffect(() => { charger() }, [charger])

  if (!peutGerer) return <div className="empty">Seuls le propriétaire et le gérant voient l&apos;équipe.</div>

  async function changerRole(m: Membre, r: string) {
    const { error } = await supabase.from("membres").update({ role: r }).eq("restaurant_id", m.restaurant_id).eq("user_id", m.user_id)
    if (error) toast(messageErreur(error)); else { toast("Rôle mis à jour"); charger() }
  }
  async function retirer(m: Membre) {
    const { error } = await supabase.from("membres").delete().eq("restaurant_id", m.restaurant_id).eq("user_id", m.user_id)
    setARetirer(null)
    if (error) toast(messageErreur(error)); else { toast("Membre retiré"); charger() }
  }
  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from("restaurants").update({ nom: infos.nom.trim(), telephone: infos.telephone.trim() || null, adresse: infos.adresse.trim() || null }).eq("id", resto.id)
    if (error) toast(messageErreur(error)); else toast("Informations enregistrées. Elles apparaîtront sur les reçus.")
  }
  async function debloquer(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc("debloquer_compte", { p_restaurant: resto.id, p_email: emailBloque })
    if (error) toast(messageErreur(error))
    else { toast("Si ce compte était bloqué, il peut ressaisir le code dès maintenant."); setEmailBloque("") }
  }
  async function remettreAZero(e: React.FormEvent) {
    e.preventDefault()
    setRazBusy(true)
    const { data, error } = await supabase.rpc("reinitialiser_ventes", { p_restaurant: resto.id, p_confirmation: confirmation, p_remettre_stock: remettreStock })
    setRazBusy(false)
    if (error) { toast(messageErreur(error)); return }
    setRaz(false); setConfirmation("")
    toast(`${data ?? 0} ticket(s) supprimé(s). Les ventes repartent de zéro.`)
  }
  async function reglerCommandes(ouvrir: boolean, message = messageCmd) {
    const { error } = await supabase.from("restaurants").update({ commandes_ouvertes: ouvrir, message_commande: message.trim() || null }).eq("id", resto.id)
    if (error) { toast(messageErreur(error)); return }
    setOuvert(ouvrir)
    toast(ouvrir ? "Commandes en ligne ouvertes" : "Commandes en ligne fermées")
    router.refresh()
  }
  async function copierLien() {
    try { await navigator.clipboard.writeText(lienCommande); toast("Lien copié") } catch { toast("Sélectionnez le lien pour le copier") }
  }
  async function copier() {
    try { await navigator.clipboard.writeText(resto.code_invitation); toast("Code copié") } catch { toast("Sélectionnez le code pour le copier") }
  }

  return (
    <div className="stack">
      <h2>Équipe</h2>
      <div className="panel stack" style={{ gap: 10 }}>
        <h3>Inviter un caissier</h3>
        <p>Le caissier crée son compte sur cette application, puis saisit ce code sur l&apos;écran de bienvenue.</p>
        <div className="row"><span className="code">{resto.code_invitation}</span><button className="btn" onClick={copier}>Copier</button></div>
        <p className="muted">Un caissier encaisse, voit ses propres ventes, saisit des dépenses et des achats de stock. Il ne peut ni annuler un ticket, ni changer les prix, ni voir le tableau de bord.</p>
        <p className="muted">Pour la cuisine : la personne rejoint avec ce même code, puis vous changez son rôle en « Cuisine » ci-dessous. Elle voit alors uniquement les commandes en attente et le stock, et marque les commandes livrées.</p>
      </div>
      {membres === null ? <div className="empty">Chargement…</div> : (
        <div className="tbl">
          <table>
            <thead><tr><th>Membre</th><th>Rôle</th><th>Depuis</th><th /></tr></thead>
            <tbody>
              {membres.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.user_id === userId ? <b>Vous</b> : (m.nom_affiche || `Membre ${m.user_id.slice(0, 6)}`)}</td>
                  <td>
                    {proprio && m.user_id !== userId ? (
                      <select aria-label="Rôle" value={m.role} onChange={(e) => changerRole(m, e.target.value)} style={{ width: "auto" }}>
                        <option value="gerant">Gérant</option><option value="caissier">Caissier</option><option value="cuisine">Cuisine</option>
                      </select>
                    ) : ROLES[m.role]}
                  </td>
                  <td>{new Date(m.created_at).toLocaleDateString("fr-FR")}</td>
                  <td>{proprio && m.user_id !== userId && <button className="btn ghost danger" onClick={() => setARetirer(m)}>Retirer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {proprio && (
        <div className="panel stack" style={{ gap: 10 }}>
          <div className="row between">
            <h3>Commande en ligne</h3>
            <span className={`pill ${ouvert ? "s-livre" : "s-annule"}`}>{ouvert ? "Ouverte" : "Fermée"}</span>
          </div>
          <p className="muted">Vos clients commandent depuis ce lien, sans compte. Ils paient et retirent au comptoir. Chaque commande arrive en haut de la caisse et doit être validée avant d&apos;aller en cuisine.</p>
          <div className="row">
            <span className="code" style={{ fontSize: ".9rem", wordBreak: "break-all" }}>{lienCommande}</span>
            <button className="btn" onClick={copierLien}>Copier</button>
            <a className="btn wa" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Commandez chez ${resto.nom} en ligne, puis retirez et payez au comptoir : ${lienCommande}`)}`}>Partager sur WhatsApp</a>
            <a className="btn ghost" href={`/commander/${resto.slug}`} target="_blank" rel="noopener noreferrer">Voir la page</a>
          </div>
          <label className="f">Message affiché aux clients (facultatif)
            <input id="messageCmd" value={messageCmd} onChange={(e) => setMessageCmd(e.target.value)} maxLength={200} placeholder="ex. Commandes de 8 h à 22 h · Fermé le dimanche" />
          </label>
          <div className="row">
            {ouvert
              ? <button className="btn danger" onClick={() => reglerCommandes(false)}>Fermer les commandes en ligne</button>
              : <button className="btn primary" onClick={() => reglerCommandes(true)}>Ouvrir les commandes en ligne</button>}
            <button className="btn ghost" onClick={() => reglerCommandes(ouvert)}>Enregistrer le message</button>
          </div>
        </div>
      )}
      {proprio && (
        <form className="panel stack" style={{ gap: 10 }} onSubmit={debloquer}>
          <h3>Débloquer un compte</h3>
          <p className="muted">Après 10 codes erronés, un compte est bloqué 15 minutes. Saisissez l&apos;e-mail de la personne pour la débloquer tout de suite.</p>
          <div className="row">
            <input id="emailBloque" type="email" value={emailBloque} onChange={(e) => setEmailBloque(e.target.value)} placeholder="e-mail du compte bloqué" required style={{ flex: 1, minWidth: 200 }} />
            <button className="btn">Débloquer</button>
          </div>
        </form>
      )}
      {proprio && (
        <form className="panel form-grid" onSubmit={enregistrer}>
          <h3 className="span2" style={{ gridColumn: "1 / -1" }}>Informations du restaurant (en-tête des reçus)</h3>
          <label className="f">Nom<input id="rNom" value={infos.nom} onChange={(e) => setInfos({ ...infos, nom: e.target.value })} required minLength={2} /></label>
          <label className="f">Téléphone<input id="rTel" value={infos.telephone} onChange={(e) => setInfos({ ...infos, telephone: e.target.value })} /></label>
          <label className="f">Adresse<input id="rAdr" value={infos.adresse} onChange={(e) => setInfos({ ...infos, adresse: e.target.value })} /></label>
          <button className="btn primary">Enregistrer</button>
        </form>
      )}
      {proprio && (
        <div className="panel stack" style={{ gap: 10, borderColor: "var(--bad)" }}>
          <h3 className="err">Remettre les ventes à zéro</h3>
          <p className="muted">Supprime définitivement tous les tickets de {resto.nom} (ventes, reçus, historique). Le menu, le stock, les dépenses et l&apos;équipe sont conservés. Utile après une période d&apos;essai.</p>
          <div><button className="btn danger" onClick={() => { setRaz(true); setConfirmation("") }}>Remettre les ventes à zéro…</button></div>
        </div>
      )}
      {raz && (
        <Dialog label="Remettre les ventes à zéro" onClose={() => setRaz(false)}>
          <h2>Supprimer toutes les ventes ?</h2>
          <p>Cette action est <b>définitive</b> : les tickets, les reçus en ligne des clients et les totaux du tableau de bord disparaissent. Pensez à exporter le mois en CSV avant si vous en avez besoin.</p>
          <form className="stack" style={{ gap: 10 }} onSubmit={remettreAZero}>
            <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" checked={remettreStock} onChange={(e) => setRemettreStock(e.target.checked)} style={{ width: "auto", marginTop: 4 }} />
              <span>Remettre en stock les ingrédients consommés par ces ventes (à décocher si le stock a déjà été recompté par inventaire)</span>
            </label>
            <label className="f">Pour confirmer, tapez le nom du restaurant : <b>{resto.nom}</b>
              <input id="confirmRaz" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" autoFocus />
            </label>
            <div className="row">
              <button type="button" className="btn" onClick={() => setRaz(false)}>Annuler</button>
              <button className="btn primary" disabled={razBusy || confirmation.trim().toLowerCase() !== resto.nom.trim().toLowerCase()}>
                {razBusy ? "Suppression…" : "Supprimer toutes les ventes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {aRetirer && (
        <Dialog label="Retirer le membre" onClose={() => setARetirer(null)}>
          <h2>Retirer ce membre ?</h2>
          <p>Il n&apos;aura plus accès à la caisse de {resto.nom}. Ses ventes passées restent enregistrées.</p>
          <div className="row"><button className="btn" onClick={() => setARetirer(null)}>Garder</button><button className="btn primary" onClick={() => retirer(aRetirer)}>Retirer</button></div>
        </Dialog>
      )}
    </div>
  )
}
