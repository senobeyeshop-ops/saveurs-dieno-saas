"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { messageErreur } from "@/lib/format"

export default function Connexion() {
  const router = useRouter()
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion")
  const [email, setEmail] = useState("")
  const [mdp, setMdp] = useState("")
  const [nom, setNom] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("erreur") === "lien") setMsg("Ce lien a expiré. Connectez-vous ou recréez votre compte.")
  }, [])

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null); setInfo(null)
    const supabase = createClient()
    try {
      if (mode === "connexion") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: mdp })
        if (error) throw error
        router.replace("/")
        router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password: mdp,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback`, data: { nom_affiche: nom.trim() } },
        })
        if (error) throw error
        if (data.session) { router.replace("/"); router.refresh() }
        else setInfo(`Compte créé. Ouvrez le lien envoyé à ${email} pour l'activer, puis connectez-vous.`)
      }
    } catch (err) {
      setMsg(messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
    <form className="card" onSubmit={envoyer}>
      <div>
        <div className="logo">Saveurs Dieno</div>
        <p className="muted" style={{ marginTop: 6 }}>Caisse et gestion du restaurant</p>
      </div>
      <div className="chips" role="tablist">
        <button type="button" className="chip" aria-pressed={mode === "connexion"} onClick={() => setMode("connexion")}>Se connecter</button>
        <button type="button" className="chip" aria-pressed={mode === "inscription"} onClick={() => setMode("inscription")}>Créer un compte</button>
      </div>
      {mode === "inscription" && (
        <label className="f">Votre prénom et nom<input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Assane Diène" required autoComplete="name" /></label>
      )}
      <label className="f">E-mail<input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label className="f">Mot de passe<input id="mdp" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} required minLength={6} autoComplete={mode === "connexion" ? "current-password" : "new-password"} /></label>
      {msg && <p className="err" role="alert">{msg}</p>}
      {info && <p role="status" style={{ color: "var(--ok)", fontWeight: 600 }}>{info}</p>}
      <button className="btn primary big" disabled={busy}>{busy ? "Patientez…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}</button>
    </form>
    </main>
  )
}
