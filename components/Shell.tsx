"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useResto } from "@/components/Resto"
import { ROLES } from "@/lib/format"

const ONGLETS = [
  { href: "/caisse", label: "Caisse", gestion: false },
  { href: "/ventes", label: "Ventes", gestion: false },
  { href: "/depenses", label: "Dépenses", gestion: false },
  { href: "/stock", label: "Stock", gestion: false },
  { href: "/tableau-de-bord", label: "Tableau de bord", gestion: true },
  { href: "/menu", label: "Menu & prix", gestion: true },
  { href: "/equipe", label: "Équipe", gestion: true },
]

export function Shell({ restaurants, children }: { restaurants: { id: string; nom: string }[]; children: React.ReactNode }) {
  const { resto, role, peutGerer, supabase } = useResto()
  const path = usePathname()
  const router = useRouter()

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
            {ONGLETS.filter((o) => peutGerer || !o.gestion).map((o) => (
              <Link key={o.href} href={o.href} aria-current={path.startsWith(o.href) ? "page" : undefined}>{o.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  )
}
