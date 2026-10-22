"use client"

import { useCallback, useEffect, useState } from "react"
import { useResto } from "@/components/Resto"
import { Dialog } from "@/components/Dialog"
import type { Article, Ingredient, Recette } from "@/lib/database.types"
import { CATEGORIES, fcfa, lireNombre, messageErreur, qte } from "@/lib/format"

export default function Menu() {
  const { resto, supabase, toast, peutGerer } = useResto()
  const [articles, setArticles] = useState<Article[] | null>(null)
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [recettes, setRecettes] = useState<Recette[]>([])
  const [n, setN] = useState({ nom: "", cat: CATEGORIES[0], prix: "" })
  const [prix, setPrix] = useState<Record<string, string>>({})
  const [rec, setRec] = useState<Article | null>(null)
  const [recQ, setRecQ] = useState<Record<string, string>>({})
  const [aSuppr, setASuppr] = useState<Article | null>(null)

  const charger = useCallback(async () => {
    const [a, i, r] = await Promise.all([
      supabase.from("articles").select("*").eq("restaurant_id", resto.id).order("categorie").order("ordre"),
      supabase.from("ingredients").select("*").eq("restaurant_id", resto.id).order("nom"),
      supabase.from("recettes").select("*").eq("restaurant_id", resto.id),
    ])
    if (a.error) toast(messageErreur(a.error))
    const liste = (a.data ?? []).sort((x, y) => (CATEGORIES.indexOf(x.categorie) - CATEGORIES.indexOf(y.categorie)) || x.ordre - y.ordre)
    setArticles(liste); setIngs(i.data ?? []); setRecettes(r.data ?? [])
    setPrix(Object.fromEntries(liste.map((x) => [x.id, String(x.prix)])))
  }, [supabase, resto.id, toast])
  useEffect(() => { charger() }, [charger])

  if (!peutGerer) return <div className="empty">Seuls le propriétaire et le gérant modifient le menu.</div>

  async function maj(a: Article, champs: Partial<Article>, msg: string) {
    const { error } = await supabase.from("articles").update(champs).eq("id", a.id)
    if (error) { toast(messageErreur(error)); return }
    toast(msg); charger()
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault()
    const p = Math.round(lireNombre(n.prix))
    if (!n.nom.trim() || p <= 0) { toast("Indiquez un nom et un prix."); return }
    const ordre = (articles ?? []).filter((a) => a.categorie === n.cat).length + 1
    const { error } = await supabase.from("articles").insert({ restaurant_id: resto.id, nom: n.nom.trim(), categorie: n.cat, prix: p, ordre })
    if (error) { toast(messageErreur(error)); return }
    toast(`${n.nom.trim()} ajouté au menu`); setN({ ...n, nom: "", prix: "" }); charger()
  }

  function ouvrirRecette(a: Article) {
    setRecQ(Object.fromEntries(recettes.filter((r) => r.article_id === a.id).map((r) => [r.ingredient_id, String(r.quantite).replace(".", ",")])))
    setRec(a)
  }

  async function enregistrerRecette(e: React.FormEvent) {
    e.preventDefault()
    if (!rec) return
    const lignes = ings.map((i) => ({ article_id: rec.id, ingredient_id: i.id, restaurant_id: resto.id, quantite: lireNombre(recQ[i.id] ?? "") })).filter((l) => l.quantite > 0)
    const del = await supabase.from("recettes").delete().eq("article_id", rec.id)
    if (del.error) { toast(messageErreur(del.error)); return }
    if (lignes.length) {
      const ins = await supabase.from("recettes").insert(lignes)
      if (ins.error) { toast(messageErreur(ins.error)); return }
    }
    toast(`Recette de ${rec.nom} enregistrée`); setRec(null); charger()
  }

  async function supprimer(a: Article) {
    const { error } = await supabase.from("articles").delete().eq("id", a.id)
    setASuppr(null)
    if (error) toast(messageErreur(error)); else { toast(`${a.nom} retiré du menu`); charger() }
  }

  const resume = (a: Article) => recettes.filter((r) => r.article_id === a.id)
    .map((r) => { const i = ings.find((x) => x.id === r.ingredient_id); return i ? `${qte(r.quantite)} ${i.unite} ${i.nom}` : null })
    .filter(Boolean).join(", ")

  return (
    <div className="stack">
      <h2>Menu &amp; prix</h2>
      <p className="muted">Un nouveau prix s&apos;applique tout de suite à la caisse. Les tickets déjà encaissés gardent leur prix.</p>
      <form className="panel form-grid" onSubmit={ajouter}>
        <label className="f span2">Nouvel article<input id="aNom" value={n.nom} onChange={(e) => setN({ ...n, nom: e.target.value })} placeholder="ex. Jus de bissap" required /></label>
        <label className="f">Catégorie<select id="aCat" value={n.cat} onChange={(e) => setN({ ...n, cat: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Prix (F)<input id="aPrix" inputMode="numeric" value={n.prix} onChange={(e) => setN({ ...n, prix: e.target.value })} placeholder="ex. 500" required /></label>
        <button className="btn primary">Ajouter au menu</button>
      </form>
      {articles === null ? <div className="empty">Chargement…</div> : articles.length === 0 ? <div className="empty">Le menu est vide. Ajoutez votre premier article ci-dessus.</div> : (
        <div className="tbl">
          <table>
            <thead><tr><th>Article</th><th>Catégorie</th><th>Recette (stock)</th><th className="num">Prix</th><th>En vente</th><th /></tr></thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.nom}</b>{a.prix_variable && <><br /><small className="muted">Prix libre de {fcfa(a.prix_min)} à {fcfa(a.prix_max)}</small></>}</td>
                  <td>{a.categorie}</td>
                  <td><button className="btn ghost" onClick={() => ouvrirRecette(a)} style={{ textAlign: "left" }}>{resume(a) || "Définir"}</button></td>
                  <td className="num">
                    {a.prix_variable ? "variable" : (
                      <input className="prix-in" id={`px-${a.id}`} inputMode="numeric" value={prix[a.id] ?? ""} aria-label={`Prix de ${a.nom}`}
                        onChange={(e) => setPrix({ ...prix, [a.id]: e.target.value })}
                        onBlur={() => { const v = Math.round(lireNombre(prix[a.id] ?? "")); if (v > 0 && v !== a.prix) maj(a, { prix: v }, `${a.nom} : ${fcfa(v)}`); else setPrix({ ...prix, [a.id]: String(a.prix) }) }} />
                    )}
                  </td>
                  <td><input type="checkbox" className="switch" id={`sw-${a.id}`} checked={a.actif} aria-label={`${a.nom} en vente`} onChange={(e) => maj(a, { actif: e.target.checked }, e.target.checked ? `${a.nom} remis en vente` : `${a.nom} masqué de la caisse`)} /></td>
                  <td><button className="btn ghost danger" onClick={() => setASuppr(a)}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rec && (
        <Dialog label={`Recette ${rec.nom}`} onClose={() => setRec(null)}>
          <h2>Recette · {rec.nom}</h2>
          {ings.length === 0 ? (
            <><p>Ajoutez d&apos;abord vos ingrédients dans l&apos;onglet Stock.</p><button className="btn" onClick={() => setRec(null)}>Fermer</button></>
          ) : (
            <form className="stack" style={{ gap: 8 }} onSubmit={enregistrerRecette}>
              <p className="muted">Quantité consommée pour <b>une</b> unité vendue. Laissez vide ce qui n&apos;est pas utilisé.</p>
              {ings.map((i) => (
                <label key={i.id} className="rec">
                  <span>{i.nom} <small className="muted">({i.unite})</small></span>
                  <input inputMode="decimal" placeholder="0" value={recQ[i.id] ?? ""} onChange={(e) => setRecQ({ ...recQ, [i.id]: e.target.value })} />
                </label>
              ))}
              <div className="row" style={{ marginTop: 6 }}><button type="button" className="btn" onClick={() => setRec(null)}>Annuler</button><button className="btn primary" style={{ flex: 1 }}>Enregistrer la recette</button></div>
            </form>
          )}
        </Dialog>
      )}
      {aSuppr && (
        <Dialog label="Retirer l'article" onClose={() => setASuppr(null)}>
          <h2>Retirer « {aSuppr.nom} » du menu ?</h2>
          <p>Pour une rupture passagère, décochez plutôt « En vente ». Les anciens tickets restent intacts.</p>
          <div className="row"><button className="btn" onClick={() => setASuppr(null)}>Garder</button><button className="btn primary" onClick={() => supprimer(aSuppr)}>Retirer</button></div>
        </Dialog>
      )}
    </div>
  )
}
