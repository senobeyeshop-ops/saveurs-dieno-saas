"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useResto } from "@/components/Resto"
import { ROLES } from "@/lib/format"

const G = ["proprietaire", "gerant"]
const ONGLETS = [
  { href: "/caisse", label: "Caisse", roles: [...G, "caissier"] },
  { href: "/cuisine", label: "Cuisine", roles: [...G, "cuisine"] },
  { href: "/ventes", label: "Ventes", roles: [...G, "caissier"] },
  { href: "/depenses", label: "Dépenses", roles: [...G, "caissier"] },
  { href: "/stock", label: "Stock", roles: [...G, "caissier", "cuisine"] },
  { href: "/tableau-de-bord", label: "Tableau de bord", roles: G },
  { href: "/menu", label: "Menu & prix", roles: G },
  { href: "/equipe", label: "Équipe", roles: G },
]

export function Shell({ restaurants, children }: { restaurants: { id: string; nom: string }[]; children: React.ReactNode }) {
  const { resto, role, supabase } = useResto()
  const path = usePathname()
  const router = useRouter()
  const onglets = ONGLETS.filter((o) => o.roles.includes(role))
  const autorise = onglets.some((o) => path.startsWith(o.href))

  // Chaque rôle arrive sur son premier onglet autorisé (la cuisine sur « Cuisine »).
  useEffect(() => {
    if (!autorise && onglets[0]) router.replace(onglets[0].href)
  }, [autorise, onglets, router])

  function changer(id: string) {
    document.cookie = `resto=${id}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }
  async function deconnexion() {
    await supabase.auth.signOut()
    router.replace("/connexion")
    router.refresh()
  }

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="head">
            <div className="brand">
              <h1>{resto.nom}</h1>
              {resto.adresse && <small>{resto.adresse}</small>}
            </div>
            <div className="who">
              <span>{ROLES[role]}</span>
              {restaurants.length > 1 && (
                <select aria-label="Changer de restaurant" value={resto.id} onChange={(e) => changer(e.target.value)}>
                  {restaurants.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
              )}
              <Link href="/bienvenue" className="btn ghost" style={{ color: "#fff", borderColor: "#4a4566", padding: "4px 10px" }}>+ Restaurant</Link>
              <button onClick={deconnexion}>Déconnexion</button>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {onglets.map((o) => (
              <Link key={o.href} href={o.href} aria-current={path.startsWith(o.href) ? "page" : undefined}>{o.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap">{autorise ? children : <div className="empty">Ouverture…</div>}</main>
    </>
  )
}
