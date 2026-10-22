"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import { Recu, type RecuData } from "@/components/Recu"
import type { Article, Ingredient, Recette } from "@/lib/database.types"
import { CATEGORIES, MODES, fcfa, lireNombre, messageErreur, type Mode } from "@/lib/format"

type Ligne = { article: Article; q: number; pu: number }
const classeMode = (m: string) => (m === "Wave" ? "m-wave" : m === "Orange Money" ? "m-om" : "m-especes")

export default function Caisse() {
  const { resto, supabase, toast } = useResto()
  const [articles, setArticles] = useState<Article[] | null>(null)
  const [recettes, setRecettes] = useState<Recette[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [cat, setCat] = useState("Tous")
  const [panier, setPanier] = useState<Ligne[]>([])
  const [mode, setMode] = useState<Mode>("Espèces")
  const [recu, setRecu] = useState("")
  const [busy, setBusy] = useState(false)
  const [variable, setVariable] = useState<Article | null>(null)
  const [prixLibre, setPrixLibre] = useState("")
  const [ticket, setTicket] = useState<RecuData | null>(null)

  const charger = useCallback(async () => {
    const [a, r, i] = await Promise.all([
      supabase.from("articles").select("*").eq("restaurant_id", resto.id).eq("actif", true).order("ordre"),
      supabase.from("recettes").select("*").eq("restaurant_id", resto.id),
      supabase.from("ingredients").select("*").eq("restaurant_id", resto.id),
    ])
    if (a.error) toast(messageErreur(a.error))
    setArticles(a.data ?? [])
    setRecettes(r.data ?? [])
    setIngredients(i.data ?? [])
  }, [supabase, resto.id, toast])

  useEffect(() => { charger() }, [charger])

  const alertes = ingredients.filter((i) => Number(i.stock) <= Number(i.seuil))
  const enRupture = useMemo(() => {
    const st = new Map(ingredients.map((i) => [i.id, Number(i.stock)]))
    return new Set(recettes.filter((r) => (st.get(r.ingredient_id) ?? 0) < Number(r.quantite)).map((r) => r.article_id))
  }, [ingredients, recettes])

  const cats = useMemo(() => {
    const presentes = new Set((articles ?? []).map((a) => a.categorie))
    return [...CATEGORIES.filter((c) => presentes.has(c)), ...[...presentes].filter((c) => !CATEGORIES.includes(c))]
  }, [articles])

  const total = panier.reduce((s, l) => s + l.q * l.pu, 0)
  const nb = panier.reduce((s, l) => s + l.q, 0)
  const recuN = lireNombre(recu)

  function ajouter(a: Article, pu: number) {
    setPanier((p) => {
      const i = p.findIndex((l) => l.article.id === a.id && l.pu === pu)
      if (i >= 0) return p.map((l, k) => (k === i ? { ...l, q: l.q + 1 } : l))
      return [...p, { article: a, q: 1, pu }]
    })
  }
  function toucher(a: Article) {
    if (a.prix_variable) { setVariable(a); setPrixLibre(""); return }
    ajouter(a, a.prix)
  }
  function changerQ(i: number, d: number) {
    setPanier((p) => p.map((l, k) => (k === i ? { ...l, q: l.q + d } : l)).filter((l) => l.q > 0))
  }

  async function encaisser() {
    if (!panier.length || busy) return
    if (mode === "Espèces" && recuN > 0 && recuN < total) { toast("Le montant reçu est inférieur au total."); return }
    setBusy(true)
    const lignes = panier.map((l) => ({ article_id: l.article.id, quantite: l.q, prix_unitaire: l.pu }))
    const { data, error } = await supabase.rpc("encaisser", {
      p_restaurant: resto.id, p_mode: mode, p_recu: mode === "Espèces" ? Math.round(recuN) : 0, p_lignes: lignes,
    })
    setBusy(false)
    if (error || !data?.[0]) { toast(messageErreur(error)); return }
    const v = data[0]
    setTicket({
      numero: v.numero, date: new Date().toISOString(), mode, total: v.total,
      recu: mode === "Espèces" && recuN > 0 ? recuN : null,
      lignes: panier.map((l) => ({ nom: l.article.nom, quantite: l.q, prix_unitaire: l.pu })),
    })
    setPanier([]); setRecu("")
    charger()
  }

  if (articles === null) return <div className="empty">Chargement du menu…</div>
  if (!articles.length) {
    return (
      <div className="empty">
        <h2>Aucun article en vente</h2>
        <p>Ajoutez vos sandwichs, fatayas, viennoiseries et crêpes dans « Menu &amp; prix » pour commencer à encaisser.</p>
        <Link className="btn primary" href="/menu">Ouvrir le menu</Link>
      </div>
    )
  }

  const montrer = cat === "Tous" ? cats : [cat]
  return (
    <div className="stack">
      {alertes.length > 0 && (
        <div className="alert">
          <b>Stock bas</b>
          <span>{alertes.slice(0, 5).map((i) => i.nom).join(" · ")}{alertes.length > 5 ? ` et ${alertes.length - 5} autre(s)` : ""}</span>
          <Link href="/stock" className="btn ghost" style={{ marginLeft: "auto" }}>Voir le stock</Link>
        </div>
      )}
      <div className="pos">
        <div className="stack" style={{ gap: 14, minWidth: 0 }}>
          <div className="chips">
            {["Tous", ...cats].map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          {montrer.map((c) => (
            <section key={c} className="stack" style={{ gap: 8 }}>
              <div className="cat-title">{c}</div>
              <div className="grid">
                {articles.filter((a) => a.categorie === c).map((a) => {
                  const q = panier.filter((l) => l.article.id === a.id).reduce((s, l) => s + l.q, 0)
                  return (
                    <button key={a.id} className="prod" onClick={() => toucher(a)}>
                      <b>{a.nom}</b>
                      <span className="px">{a.prix_variable ? `${a.prix_min}–${fcfa(a.prix_max)}` : fcfa(a.prix)}</span>
                      {q > 0 && <span className="qbadge">{q}</span>}
                      {enRupture.has(a.id) && <span className="warn-dot" title="Un ingrédient manque en stock" />}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="ticket panel" id="ticket">
          <h2>Commande</h2>
          {panier.length ? (
            <div className="lines">
              {panier.map((l, i) => (
                <div className="line" key={l.article.id + ":" + l.pu}>
                  <div style={{ minWidth: 0 }}>{l.article.nom}<small>{fcfa(l.pu)} l&apos;unité</small></div>
                  <div className="qty">
                    <button onClick={() => changerQ(i, -1)} aria-label={`Retirer un ${l.article.nom}`}>−</button>
                    <span>{l.q}</span>
                    <button onClick={() => changerQ(i, 1)} aria-label={`Ajouter un ${l.article.nom}`}>+</button>
                  </div>
                  <b>{fcfa(l.q * l.pu)}</b>
                </div>
              ))}
            </div>
          ) : <div className="empty">Touchez un article pour l&apos;ajouter.</div>}
          <div className="total"><span>Total à payer</span><strong>{fcfa(total)}</strong></div>
          <div className="modes">
            {MODES.map((m) => <button key={m} className={`mode ${classeMode(m)}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>)}
          </div>
          {mode === "Espèces" && (
            <div className="cashcalc">
              <label className="f">Montant reçu<input id="recu" inputMode="numeric" placeholder="ex. 2000" value={recu} onChange={(e) => setRecu(e.target.value)} /></label>
              <div style={{ fontWeight: 700, textAlign: "right" }}>
                {!recuN ? <span className="muted">Monnaie à rendre</span> : recuN >= total ? `À rendre : ${fcfa(recuN - total)}` : <span className="err">Manque {fcfa(total - recuN)}</span>}
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn ghost" disabled={!panier.length} onClick={() => { setPanier([]); setRecu("") }}>Vider</button>
            <button className="btn primary big" style={{ flex: 1 }} disabled={!panier.length || busy} onClick={encaisser}>
              {busy ? "Enregistrement…" : `Encaisser ${fcfa(total)}`}
            </button>
          </div>
        </aside>
      </div>

      {panier.length > 0 && (
        <div className="mobilebar">
          <span>{nb} article{nb > 1 ? "s" : ""}</span>
          <strong>{fcfa(total)}</strong>
          <button className="btn primary" onClick={() => document.getElementById("ticket")?.scrollIntoView({ behavior: "smooth" })}>Voir la commande</button>
        </div>
      )}

      {variable && (
        <Dialog label={variable.nom} onClose={() => setVariable(null)}>
          <h2>{variable.nom}</h2>
          <p className="muted">Prix de {fcfa(variable.prix_min)} à {fcfa(variable.prix_max)}. Choisissez le prix de cette part.</p>
          <div className="row">
            {[variable.prix_min ?? 0, 150, 200, variable.prix_max ?? 0]
              .filter((v, i, t) => v > 0 && t.indexOf(v) === i && v >= (variable.prix_min ?? 0) && v <= (variable.prix_max ?? 0))
              .map((v) => <button key={v} className="btn" onClick={() => { ajouter(variable, v); setVariable(null) }}>{fcfa(v)}</button>)}
          </div>
          <form className="row" onSubmit={(e) => {
            e.preventDefault()
            const v = Math.round(lireNombre(prixLibre))
            if (v < (variable.prix_min ?? 0) || v > (variable.prix_max ?? 0)) { toast(`Choisissez un prix entre ${fcfa(variable.prix_min)} et ${fcfa(variable.prix_max)}.`); return }
            ajouter(variable, v); setVariable(null)
          }}>
            <input id="prixLibre" inputMode="numeric" placeholder="Autre prix" value={prixLibre} onChange={(e) => setPrixLibre(e.target.value)} style={{ flex: 1, width: "auto" }} />
            <button className="btn primary">Ajouter</button>
          </form>
        </Dialog>
      )}

      {ticket && (
        <Dialog label="Vente enregistrée" onClose={() => setTicket(null)}>
          <h2>Vente enregistrée</h2>
          <Recu resto={resto} data={ticket} />
          <button className="btn primary big" onClick={() => setTicket(null)}>Nouvelle commande</button>
        </Dialog>
      )}
    </div>
  )
}
