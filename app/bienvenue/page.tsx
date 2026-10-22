"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { messageErreur } from "@/lib/format"

export default function Bienvenue() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [nom, setNom] = useState("")
  const [tel, setTel] = useState("")
  const [adr, setAdr] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function choisir(id: string) {
    document.cookie = `resto=${id}; path=/; max-age=31536000; samesite=lax`
    router.replace("/caisse")
    router.refresh()
  }

  async function rejoindre(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { data, error } = await createClient().rpc("rejoindre_restaurant", { p_code: code.trim() })
    setBusy(false)
    if (error) setMsg(messageErreur(error)); else choisir(data)
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { data, error } = await createClient().rpc("creer_restaurant", { p_nom: nom, p_telephone: tel, p_adresse: adr })
    setBusy(false)
    if (error) setMsg(messageErreur(error)); else choisir(data)
  }

  async function deconnexion() {
    await createClient().auth.signOut()
    router.replace("/connexion")
  }

  return (
    <main className="auth">
      <div className="card">
        <div>
          <div className="logo">Bienvenue</div>
          <p className="muted" style={{ marginTop: 6 }}>Rattachez votre compte à un restaurant pour ouvrir la caisse.</p>
        </div>
        <form onSubmit={rejoindre} className="stack" style={{ gap: 10 }}>
          <h3>J&apos;ai un code</h3>
          <p className="muted">Code équipe à 6 caractères donné par le gérant, ou code propriétaire (PROP-…).</p>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ex. 3B6B4C" required autoCapitalize="characters" />
          <button className="btn primary" disabled={busy}>Rejoindre le restaurant</button>
        </form>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
        <form onSubmit={creer} className="stack" style={{ gap: 10 }}>
          <h3>Ouvrir un nouveau restaurant</h3>
          <input id="rnom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du restaurant" required minLength={2} />
          <input id="rtel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Téléphone (optionnel)" inputMode="tel" />
          <input id="radr" value={adr} onChange={(e) => setAdr(e.target.value)} placeholder="Quartier, ville (optionnel)" />
          <button className="btn" disabled={busy}>Créer et devenir propriétaire</button>
        </form>
        {msg && <p className="err" role="alert">{msg}</p>}
        <button className="btn ghost" onClick={deconnexion}>Se déconnecter</button>
      </div>
    </main>
  )
}
