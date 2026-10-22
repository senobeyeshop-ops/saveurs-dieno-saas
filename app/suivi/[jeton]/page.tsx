import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Recu } from "@/components/Recu"
import { STATUTS_CMD, fcfa, heure, numCmd } from "@/lib/format"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Suivi de commande", robots: { index: false, follow: false } }

type Suivi = {
  restaurant: { nom: string; telephone: string | null; adresse: string | null; slug: string }
  numero: number; date: string; nom_client: string; total: number; note: string | null
  statut: string; motif_refus: string | null; prete_at: string | null; retire_at: string | null; recu_jeton: string | null
  lignes: { nom: string; quantite: number; prix_unitaire: number }[]
}

const MESSAGES: Record<string, string> = {
  nouvelle: "Commande reçue. Le restaurant va la valider dans quelques instants.",
  validee: "Commande validée : elle est en préparation.",
  prete: "Votre commande est prête ! Venez la retirer et la payer au comptoir.",
  retiree: "Commande retirée. Merci et bon appétit !",
  refusee: "Le restaurant n'a pas pu accepter cette commande.",
}
const ETAPES = ["nouvelle", "validee", "prete", "retiree"]

export default async function SuiviCommande({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params
  const supabase = await createClient()
  const { data } = /^[0-9a-f]{32}$/.test(jeton) ? await supabase.rpc("suivi_commande", { p_jeton: jeton }) : { data: null }
  const c = data as Suivi | null

  if (!c) {
    return <main className="public"><div className="card"><h2>Commande introuvable</h2><p className="muted">Ce lien n&apos;est pas valide.</p></div></main>
  }

  const enCours = ["nouvelle", "validee", "prete"].includes(c.statut)
  const rang = ETAPES.indexOf(c.statut)
  return (
    <main className="public">
      {enCours && <meta httpEquiv="refresh" content="15" />}
      <div className="card">
        <div className="row between">
          <b style={{ fontFamily: "var(--display)", fontSize: "1.3rem" }}>{c.restaurant.nom}</b>
          <span className="muted">Commande {numCmd(c.numero)}</span>
        </div>
        <div className={`etat s-${c.statut}`}>
          {STATUTS_CMD[c.statut] ?? c.statut}
          {c.statut === "prete" && c.prete_at ? ` depuis ${heure(c.prete_at)}` : ""}
          {c.statut === "retiree" && c.retire_at ? ` à ${heure(c.retire_at)}` : ""}
        </div>
        <p style={{ textAlign: "center", margin: 0 }}>{MESSAGES[c.statut]}{c.statut === "refusee" && c.motif_refus ? ` Motif : ${c.motif_refus}` : ""}</p>
        {c.statut !== "refusee" && (
          <div className="etapes">
            {["Reçue", "Validée", "Prête", "Retirée"].map((e, i) => <span key={e} className={i <= rang ? "fait" : undefined}>{i <= rang ? "✓ " : ""}{e}</span>)}
          </div>
        )}

        {c.statut === "retiree" && c.recu_jeton ? (
          <p style={{ textAlign: "center", margin: 0 }}><Link className="btn" href={`/r/${c.recu_jeton}`}>Voir mon reçu</Link></p>
        ) : (
          <Recu
            resto={c.restaurant}
            data={{ numero: c.numero, date: c.date, mode: "À payer au retrait", total: c.total, recu: null, lignes: c.lignes }}
          />
        )}
        {c.note && <p className="muted" style={{ margin: 0 }}>Votre précision : {c.note}</p>}
        {enCours && <p className="muted" style={{ textAlign: "center", margin: 0 }}>Gardez cette page ouverte : elle se met à jour toute seule. Total à payer au retrait : <b>{fcfa(c.total)}</b>.</p>}
        {c.restaurant.telephone && <p className="muted" style={{ textAlign: "center", margin: 0 }}>Une question ? Appelez le {c.restaurant.telephone}.</p>}
        {!enCours && <p style={{ textAlign: "center", margin: 0 }}><Link href={`/commander/${c.restaurant.slug}`}>Passer une nouvelle commande</Link></p>}
      </div>
    </main>
  )
}
