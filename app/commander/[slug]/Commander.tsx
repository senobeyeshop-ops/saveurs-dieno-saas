"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { CATEGORIES, fcfa, messageErreur } from "@/lib/format"

export type MenuPublic = {
  nom: string; adresse: string | null; telephone: string | null
  ouvert: boolean; message: string | null
  articles: { id: string; nom: string; categorie: string; prix: number }[]
}

export function Commander({ slug, menu }: { slug: string; menu: MenuPublic }) {
  const router = useRouter()
  const [panier, setPanier] = useState<Record<string, number>>({})
  const [nom, setNom] = useState("")
  const [tel, setTel] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const cats = useMemo(() => {
    const presentes = [...new Set(menu.articles.map((a) => a.categorie))]
    return [...CATEGORIES.filter((c) => presentes.includes(c)), ...presentes.filter((c) => !CATEGORIES.includes(c))]
  }, [menu.articles])
  const lignes = menu.articles.filter((a) => panier[a.id] > 0).map((a) => ({ ...a, q: panier[a.id] }))
  const total = lignes.reduce((s, l) => s + l.q * l.prix, 0)
  const nb = lignes.reduce((s, l) => s + l.q, 0)
  const changer = (id: string, d: number) => setPanier((p) => ({ ...p, [id]: Math.max(0, Math.min(50, (p[id] ?? 0) + d)) }))

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    if (!lignes.length) { setMsg("Ajoutez au moins un article."); return }
    setBusy(true); setMsg(null)
    const { data, error } = await createClient().rpc("passer_commande", {
      p_slug: slug, p_nom: nom, p_telephone: tel, p_note: note || null,
      p_lignes: lignes.map((l) => ({ article_id: l.id, quantite: l.q })),
    })
    if (error || !data) { setBusy(false); setMsg(messageErreur(error)); return }
    router.push(`/suivi/${data}`)
  }

  return (
    <main className="public" style={{ placeItems: "start center" }}>
      <div className="card" style={{ width: "min(560px, 100%)" }}>
        <div>
          <div className="logo" style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "1.6rem", color: "var(--coral)", textTransform: "uppercase" }}>{menu.nom}</div>
          <p className="muted" style={{ margin: "4px 0 0" }}>Commandez en ligne, payez et récupérez au comptoir{menu.adresse ? ` · ${menu.adresse}` : ""}.</p>
        </div>

        {!menu.ouvert ? (
          <div className="etat s-annule">Les commandes en ligne sont fermées pour le moment.{menu.telephone ? ` Appelez-nous au ${menu.telephone}.` : ""}</div>
        ) : (
          <>
            {menu.message && <div className="panel">{menu.message}</div>}
            {cats.map((c) => (
              <section key={c} className="stack" style={{ gap: 8 }}>
                <div className="cat-title">{c}</div>
                {menu.articles.filter((a) => a.categorie === c).map((a) => (
                  <div key={a.id} className="row between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                    <div><b>{a.nom}</b><br /><span className="muted">{fcfa(a.prix)}</span></div>
                    {panier[a.id] ? (
                      <div className="qty">
                        <button type="button" onClick={() => changer(a.id, -1)} aria-label={`Retirer un ${a.nom}`}>−</button>
                        <span>{panier[a.id]}</span>
                        <button type="button" onClick={() => changer(a.id, 1)} aria-label={`Ajouter un ${a.nom}`}>+</button>
                      </div>
                    ) : <button type="button" className="btn" onClick={() => changer(a.id, 1)}>Ajouter</button>}
                  </div>
                ))}
              </section>
            ))}

            <form className="panel stack" style={{ gap: 10 }} onSubmit={envoyer} id="valider">
              <h3>Votre commande</h3>
              {lignes.length ? lignes.map((l) => (
                <div key={l.id} className="row between"><span>{l.q} × {l.nom}</span><b>{fcfa(l.q * l.prix)}</b></div>
              )) : <p className="muted">Votre panier est vide.</p>}
              <div className="total"><span>Total à payer au retrait</span><strong>{fcfa(total)}</strong></div>
              <label className="f">Votre nom<input id="nomClient" value={nom} onChange={(e) => setNom(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" /></label>
              <label className="f">Votre numéro WhatsApp<input id="telClient" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} required placeholder="ex. 77 123 45 67" autoComplete="tel" /></label>
              <label className="f">Précision (facultatif)<input id="noteClient" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="ex. sans piment, je passe vers 13 h" /></label>
              <p className="muted" style={{ margin: 0 }}>Le restaurant valide votre commande avant de la préparer. Vous payez en espèces, Wave ou Orange Money au moment du retrait.</p>
              {msg && <p className="err" role="alert">{msg}</p>}
              <button className="btn primary big" disabled={busy || !lignes.length}>{busy ? "Envoi…" : `Envoyer ma commande · ${fcfa(total)}`}</button>
            </form>
          </>
        )}
      </div>
      {menu.ouvert && nb > 0 && (
        <div className="mobilebar">
          <span>{nb} article{nb > 1 ? "s" : ""}</span>
          <strong>{fcfa(total)}</strong>
          <button className="btn primary" onClick={() => document.getElementById("valider")?.scrollIntoView({ behavior: "smooth" })}>Commander</button>
        </div>
      )}
    </main>
  )
}
