"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import type { Article, Ingredient, Mouvement, Recette } from "@/lib/database.types"
import { MODELE_STOCK, UNITES, aujourdHui, decaler, fcfa, jourCourt, lireNombre, messageErreur, qte } from "@/lib/format"

type Action = { type: "achat" | "perte" | "inventaire"; ing: Ingredient }
const ETATS = { ok: "OK", low: "Stock bas", out: "Rupture" } as const
const etat = (i: Ingredient) => (Number(i.stock) <= 0 ? "out" : Number(i.stock) <= Number(i.seuil) ? "low" : "ok")
const LIB_MVT: Record<string, string> = { achat: "Achat", perte: "Perte", vente: "Vente", annulation: "Annulation", inventaire: "Inventaire" }

export default function Stock() {
  const { resto, supabase, toast, peutGerer } = useResto()
  const [ings, setIngs] = useState<Ingredient[] | null>(null)
  const [mvts, setMvts] = useState<Mouvement[]>([])
  const [recettes, setRecettes] = useState<Recette[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [aSuppr, setASuppr] = useState<Ingredient | null>(null)
  const [f, setF] = useState({ nom: "", unite: UNITES[0], stock: "", seuil: "", cout: "" })
  const [m, setM] = useState({ q: "", cout: "", note: "Périmé", depense: true, mode: "Espèces", seuil: "", cu: "" })
  const [busy, setBusy] = useState(false)

  const charger = useCallback(async () => {
    const depuis = decaler(aujourdHui(), -7) + "T00:00:00Z"
    const [i, mv, r, a] = await Promise.all([
      supabase.from("ingredients").select("*").eq("restaurant_id", resto.id).order("nom"),
      supabase.from("mouvements_stock").select("*").eq("restaurant_id", resto.id).gte("created_at", depuis).order("created_at", { ascending: false }).limit(500),
      supabase.from("recettes").select("*").eq("restaurant_id", resto.id),
      supabase.from("articles").select("*").eq("restaurant_id", resto.id).eq("actif", true),
    ])
    if (i.error) toast(messageErreur(i.error))
    setIngs(i.data ?? []); setMvts(mv.data ?? []); setRecettes(r.data ?? []); setArticles(a.data ?? [])
  }, [supabase, resto.id, toast])
  useEffect(() => { charger() }, [charger])

  // Consommation par les ventes sur 7 jours → jours de stock restants
  const conso7 = useMemo(() => {
    const c = new Map<string, number>()
    for (const x of mvts) if (x.type === "vente" || x.type === "annulation") c.set(x.ingredient_id, (c.get(x.ingredient_id) ?? 0) - Number(x.quantite))
    return c
  }, [mvts])

  const liste = useMemo(() => [...(ings ?? [])].sort((a, b) => ({ out: 0, low: 1, ok: 2 }[etat(a)] - { out: 0, low: 1, ok: 2 }[etat(b)]) || a.nom.localeCompare(b.nom, "fr")), [ings])
  const alertes = liste.filter((i) => etat(i) !== "ok")
  const valeur = liste.reduce((s, i) => s + Math.max(0, Number(i.stock)) * i.cout_unitaire, 0)
  const sansRecette = articles.filter((a) => !recettes.some((r) => r.article_id === a.id)).length

  async function ajouter(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nom.trim()) return
    const { error } = await supabase.from("ingredients").insert({ restaurant_id: resto.id, nom: f.nom.trim(), unite: f.unite, stock: lireNombre(f.stock), seuil: lireNombre(f.seuil), cout_unitaire: Math.round(lireNombre(f.cout)) })
    if (error) { toast(messageErreur(error)); return }
    toast(`${f.nom.trim()} ajouté au stock`); setF({ nom: "", unite: UNITES[0], stock: "", seuil: "", cout: "" }); charger()
  }

  async function modele() {
    const existants = new Set((ings ?? []).map((i) => i.nom))
    const lignes = MODELE_STOCK.filter(([n]) => !existants.has(n)).map(([nom, unite, seuil]) => ({ restaurant_id: resto.id, nom, unite, seuil, stock: 0 }))
    const { error } = await supabase.from("ingredients").insert(lignes)
    if (error) { toast(messageErreur(error)); return }
    toast("Liste type ajoutée : faites l'inventaire de chaque ingrédient"); charger()
  }

  function ouvrir(type: Action["type"], ing: Ingredient) {
    setM({ q: type === "inventaire" ? "" : "", cout: "", note: "Périmé", depense: true, mode: "Espèces", seuil: String(ing.seuil), cu: ing.cout_unitaire ? String(ing.cout_unitaire) : "" })
    setAction({ type, ing })
  }

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!action) return
    const q = lireNombre(m.q)
    if (m.q.trim() === "" || (action.type !== "inventaire" && q <= 0)) { toast("Indiquez une quantité."); return }
    setBusy(true)
    const { error } = await supabase.rpc("mouvement_stock", {
      p_ingredient: action.ing.id, p_type: action.type, p_quantite: q,
      p_cout: action.type === "achat" ? Math.round(lireNombre(m.cout)) : undefined,
      p_note: action.type === "perte" ? m.note : undefined,
      p_en_depense: action.type === "achat" && m.depense, p_mode: m.mode,
    })
    if (!error && action.type === "inventaire" && peutGerer) {
      await supabase.from("ingredients").update({ seuil: lireNombre(m.seuil), cout_unitaire: Math.round(lireNombre(m.cu)) }).eq("id", action.ing.id)
    }
    setBusy(false)
    if (error) { toast(messageErreur(error)); return }
    toast(action.type === "achat" ? `+${qte(q)} ${action.ing.unite} de ${action.ing.nom}` : action.type === "perte" ? "Perte enregistrée" : `Inventaire de ${action.ing.nom} enregistré`)
    setAction(null); charger()
  }

  async function supprimer(i: Ingredient) {
    const { error } = await supabase.from("ingredients").delete().eq("id", i.id)
    setASuppr(null)
    if (error) toast(messageErreur(error)); else { toast(`${i.nom} n'est plus suivi`); charger() }
  }

  const nomIng = (id: string) => ings?.find((i) => i.id === id)?.nom ?? "Ingrédient retiré"
  if (ings === null) return <div className="empty">Chargement du stock…</div>

  return (
    <div className="stack">
      <div className="row between"><h2>Stock des ingrédients</h2><span className="muted">Mis à jour à chaque vente</span></div>
      {alertes.length > 0 && <div className="alert"><b>{alertes.length} ingrédient{alertes.length > 1 ? "s" : ""} à racheter</b><span>{alertes.map((i) => i.nom).join(" · ")}</span></div>}
      {liste.length > 0 && (
        <div className="kpis">
          <div className="kpi"><h3>Ingrédients suivis</h3><div className="v">{liste.length}</div></div>
          <div className="kpi"><h3>Valeur estimée du stock</h3><div className="v">{fcfa(valeur)}</div></div>
          <div className="kpi"><h3>Articles sans recette</h3><div className="v">{sansRecette}{sansRecette > 0 && <small> non décomptés</small>}</div></div>
        </div>
      )}
      {peutGerer && (
        <form className="panel form-grid" onSubmit={ajouter}>
          <label className="f span2">Nouvel ingrédient<input id="sNom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} placeholder="ex. Pain baguette" required /></label>
          <label className="f">Unité<select id="sUnit" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}>{UNITES.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="f">En stock<input id="sQte" inputMode="decimal" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} placeholder="ex. 40" /></label>
          <label className="f">Seuil d&apos;alerte<input id="sSeuil" inputMode="decimal" value={f.seuil} onChange={(e) => setF({ ...f, seuil: e.target.value })} placeholder="ex. 10" /></label>
          <label className="f">Coût unitaire (F)<input id="sCout" inputMode="numeric" value={f.cout} onChange={(e) => setF({ ...f, cout: e.target.value })} placeholder="ex. 150" /></label>
          <button className="btn primary">Ajouter</button>
        </form>
      )}
      {liste.length === 0 ? (
        <div className="empty">
          <h2>Aucun ingrédient suivi</h2>
          <p>Ajoutez vos ingrédients un par un, ou partez d&apos;une liste type de fast-food (quantités à zéro, à compléter par un inventaire).</p>
          {peutGerer ? <button className="btn primary" onClick={modele}>Utiliser la liste type ({MODELE_STOCK.length} ingrédients)</button> : <p>Demandez au gérant de créer la liste des ingrédients.</p>}
        </div>
      ) : (
        <>
          <div className="tbl">
            <table>
              <thead><tr><th>Ingrédient</th><th>En stock</th><th>État</th><th>Conso. / jour</th><th>Tient encore</th><th /></tr></thead>
              <tbody>
                {liste.map((i) => {
                  const st = Number(i.stock); const e = etat(i); const pj = (conso7.get(i.id) ?? 0) / 7
                  const ref = Math.max(Number(i.seuil) * 3, st, 1)
                  const col = e === "ok" ? "var(--ok)" : e === "low" ? "var(--warn)" : "var(--bad)"
                  const jours = pj > 0 ? st / pj : null
                  return (
                    <tr key={i.id}>
                      <td><b>{i.nom}</b><br /><small className="muted">Seuil {qte(i.seuil)} {i.unite}{i.cout_unitaire ? ` · ${fcfa(i.cout_unitaire)} / ${i.unite}` : ""}</small></td>
                      <td><div className="lvl"><b>{qte(st)} {i.unite}</b><div className="track"><div className="fill" style={{ width: `${Math.max(0, Math.min(100, (st / ref) * 100))}%`, background: col }} /></div></div></td>
                      <td><span className={`st ${e}`}>{ETATS[e]}</span></td>
                      <td>{pj > 0 ? `${qte(pj)} ${i.unite}` : <span className="muted">—</span>}</td>
                      <td>{jours === null ? <span className="muted">—</span> : jours < 1 ? <b className="err">moins d&apos;un jour</b> : `${Math.floor(jours)} j`}</td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                          <button className="btn" onClick={() => ouvrir("achat", i)}>+ Achat</button>
                          <button className="btn ghost" onClick={() => ouvrir("perte", i)}>Perte</button>
                          {peutGerer && <button className="btn ghost" onClick={() => ouvrir("inventaire", i)}>Inventaire</button>}
                          {peutGerer && <button className="btn ghost danger" onClick={() => setASuppr(i)} aria-label={`Ne plus suivre ${i.nom}`}>✕</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="panel stack" style={{ gap: 8 }}>
            <h3>Comment le stock baisse tout seul</h3>
            <p>Dans <Link href="/menu">Menu &amp; prix</Link>, la colonne <b>Recette</b> indique ce que consomme chaque article (ex. Sandwich poulet = 1 pain baguette + 0,1 kg de poulet). Chaque ticket encaissé retire ces quantités ; un ticket annulé les remet.</p>
          </div>
          {mvts.length > 0 && (
            <div className="panel stack" style={{ gap: 8 }}>
              <h3>Mouvements des 7 derniers jours</h3>
              {mvts.filter((x) => x.type !== "vente").slice(0, 12).map((x) => (
                <div key={x.id} className="row between">
                  <span>{jourCourt(x.created_at.slice(0, 10))} · {LIB_MVT[x.type]} · {nomIng(x.ingredient_id)}{x.note ? <span className="muted"> ({x.note})</span> : null}</span>
                  <b style={{ color: Number(x.quantite) >= 0 ? "var(--ok)" : "var(--bad)" }}>{Number(x.quantite) >= 0 ? "+" : "−"}{qte(Math.abs(Number(x.quantite)))}</b>
                </div>
              ))}
              <p className="muted">Les sorties dues aux ventes sont comptées dans « Conso. / jour ».</p>
            </div>
          )}
        </>
      )}

      {action && (
        <Dialog label="Mouvement de stock" onClose={() => setAction(null)}>
          <h2>{action.type === "achat" ? "Achat" : action.type === "perte" ? "Perte" : "Inventaire"} · {action.ing.nom}</h2>
          {action.type === "inventaire" && <p className="muted">Comptez ce qu&apos;il reste réellement. Le stock calculé ({qte(action.ing.stock)} {action.ing.unite}) sera remplacé par votre comptage.</p>}
          <form className="stack" style={{ gap: 12 }} onSubmit={valider}>
            <label className="f">{action.type === "inventaire" ? "Quantité comptée" : "Quantité"} ({action.ing.unite})<input id="mQ" inputMode="decimal" value={m.q} onChange={(e) => setM({ ...m, q: e.target.value })} required autoFocus /></label>
            {action.type === "achat" && (
              <>
                <label className="f">Prix payé au total (F)<input id="mCout" inputMode="numeric" value={m.cout} onChange={(e) => setM({ ...m, cout: e.target.value })} placeholder="optionnel" /></label>
                <label className="f">Payé par<select id="mMode" value={m.mode} onChange={(e) => setM({ ...m, mode: e.target.value })}>{["Espèces", "Wave", "Orange Money", "Virement"].map((x) => <option key={x}>{x}</option>)}</select></label>
                <label className="row" style={{ gap: 8, fontWeight: 600 }}><input type="checkbox" id="mDep" checked={m.depense} onChange={(e) => setM({ ...m, depense: e.target.checked })} /> Enregistrer aussi dans les dépenses</label>
              </>
            )}
            {action.type === "perte" && (
              <label className="f">Motif<select id="mNote" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })}>{["Périmé", "Abîmé / brûlé", "Consommation du personnel", "Erreur de saisie", "Autre"].map((x) => <option key={x}>{x}</option>)}</select></label>
            )}
            {action.type === "inventaire" && (
              <div className="form-grid">
                <label className="f">Seuil d&apos;alerte<input id="iSeuil" inputMode="decimal" value={m.seuil} onChange={(e) => setM({ ...m, seuil: e.target.value })} /></label>
                <label className="f">Coût unitaire (F)<input id="iCout" inputMode="numeric" value={m.cu} onChange={(e) => setM({ ...m, cu: e.target.value })} /></label>
              </div>
            )}
            <div className="row"><button type="button" className="btn" onClick={() => setAction(null)}>Annuler</button><button className="btn primary" style={{ flex: 1 }} disabled={busy}>Enregistrer</button></div>
          </form>
        </Dialog>
      )}
      {aSuppr && (
        <Dialog label="Ne plus suivre" onClose={() => setASuppr(null)}>
          <h2>Ne plus suivre « {aSuppr.nom} » ?</h2>
          <p>Ses mouvements et les recettes qui l&apos;utilisent seront supprimés.</p>
          <div className="row"><button className="btn" onClick={() => setASuppr(null)}>Garder</button><button className="btn primary" onClick={() => supprimer(aSuppr)}>Retirer</button></div>
        </Dialog>
      )}
    </div>
  )
}
