import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { Recu, type RecuData } from "@/components/Recu"
import { STATUTS, heure } from "@/lib/format"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Votre reçu", robots: { index: false, follow: false } }

type RecuPublic = {
  restaurant: { nom: string; telephone: string | null; adresse: string | null }
  numero: number; date: string; mode: string; total: number; recu: number | null
  statut: string; livre_at: string | null
  lignes: { nom: string; quantite: number; prix_unitaire: number }[]
}

const MESSAGES: Record<string, string> = {
  en_attente: "Votre commande est payée et en préparation.",
  livre: "Votre commande vous a été remise. Bon appétit !",
  annule: "Cette commande a été annulée. Adressez-vous au comptoir.",
}

export default async function RecuClient({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params
  const supabase = await createClient()
  const { data } = /^[0-9a-f]{32}$/.test(jeton) ? await supabase.rpc("recu_public", { p_jeton: jeton }) : { data: null }
  const r = data as RecuPublic | null

  if (!r) {
    return (
      <main className="public">
        <div className="card"><h2>Reçu introuvable</h2><p className="muted">Ce lien n&apos;est pas valide. Vérifiez le message reçu sur WhatsApp.</p></div>
      </main>
    )
  }

  const recu: RecuData = { numero: r.numero, date: r.date, mode: r.mode, total: r.total, recu: r.recu, statut: r.statut, lignes: r.lignes }
  return (
    <main className="public">
      {r.statut === "en_attente" && <meta httpEquiv="refresh" content="20" />}
      <div className="card">
        <div className={`etat s-${r.statut}`}>
          {STATUTS[r.statut] ?? r.statut}{r.statut === "livre" && r.livre_at ? ` à ${heure(r.livre_at)}` : ""}
        </div>
        <p style={{ textAlign: "center", margin: 0 }}>{MESSAGES[r.statut]}</p>
        <Recu resto={r.restaurant} data={recu} />
        {r.statut === "en_attente" && <p className="muted" style={{ textAlign: "center", margin: 0 }}>Cette page se met à jour toute seule.</p>}
      </div>
    </main>
  )
}
