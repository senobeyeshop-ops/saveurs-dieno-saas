import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { RestoProvider } from "@/components/Resto"
import { Shell } from "@/components/Shell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const uid = data?.claims?.sub
  if (!uid) redirect("/connexion")

  const { data: membres } = await supabase.from("membres").select("restaurant_id, role").eq("user_id", uid)
  if (!membres || membres.length === 0) redirect("/bienvenue")

  const { data: restos } = await supabase
    .from("restaurants")
    .select("id, nom, telephone, adresse, email, code_invitation, created_at, slug, commandes_ouvertes, message_commande")
    .in("id", membres.map((m) => m.restaurant_id))
    .order("nom")
  if (!restos || restos.length === 0) redirect("/bienvenue")

  const choix = (await cookies()).get("resto")?.value
  const resto = restos.find((r) => r.id === choix) ?? restos[0]
  const role = membres.find((m) => m.restaurant_id === resto.id)?.role ?? "caissier"

  return (
    <RestoProvider key={resto.id} resto={resto} role={role} userId={uid}>
      <Shell restaurants={restos.map((r) => ({ id: r.id, nom: r.nom }))}>{children}</Shell>
    </RestoProvider>
  )
}
