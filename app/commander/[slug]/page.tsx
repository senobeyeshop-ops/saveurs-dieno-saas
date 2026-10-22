import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { Commander, type MenuPublic } from "./Commander"

export const dynamic = "force-dynamic"

async function charger(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("menu_public", { p_slug: slug })
  return data as MenuPublic | null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const menu = await charger((await params).slug)
  return { title: menu ? `Commander chez ${menu.nom}` : "Commander" }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const menu = await charger(slug)
  if (!menu) {
    return (
      <main className="public">
        <div className="card"><h2>Restaurant introuvable</h2><p className="muted">Vérifiez le lien qui vous a été partagé.</p></div>
      </main>
    )
  }
  return <Commander slug={slug} menu={menu} />
}
