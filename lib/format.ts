export const CATEGORIES = ["Salés", "Crêpes salées", "Sucrés", "Crêpes sucrées", "Boissons"]
export const MODES = ["Espèces", "Wave", "Orange Money"] as const
export type Mode = (typeof MODES)[number]
export const DEP_CATS = ["Matières premières", "Emballages", "Gaz", "Électricité / eau", "Salaires", "Loyer", "Transport", "Entretien", "Autre"]
export const UNITES = ["pièce", "kg", "litre", "paquet", "plateau", "sachet", "bouteille", "pot"]
export const ROLES: Record<string, string> = { proprietaire: "Propriétaire", gerant: "Gérant", caissier: "Caissier" }

export const MODELE_STOCK: [string, string, number][] = [
  ["Pain baguette", "pièce", 30], ["Pain burger", "pièce", 20], ["Pain tacos (tortilla)", "pièce", 15],
  ["Poulet", "kg", 3], ["Viande hachée", "kg", 3], ["Jambon", "kg", 1], ["Fromage", "kg", 1], ["Thon (boîte)", "pièce", 6],
  ["Œufs", "plateau", 2], ["Farine", "kg", 10], ["Sucre", "kg", 5], ["Beurre / margarine", "kg", 2], ["Lait", "litre", 3],
  ["Nutella", "pot", 1], ["Huile", "litre", 5], ["Frites surgelées", "kg", 5], ["Mayonnaise / ketchup", "bouteille", 2],
  ["Emballages sandwich", "paquet", 2], ["Gaz (bouteille 12 kg)", "bouteille", 1],
]

export const fcfa = (n: number | null | undefined) =>
  (Math.round(Number(n) || 0)).toLocaleString("fr-FR").replace(/ | /g, " ") + " F"

export const qte = (n: number | null | undefined) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/ | /g, " ")

/** Lit un nombre saisi au clavier (« 0,25 », « 2 000 »). */
export const lireNombre = (v: string) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, ""))
  return Number.isFinite(n) ? n : 0
}

const pad = (n: number) => String(n).padStart(2, "0")
/** Date du jour à Dakar (UTC+0) au format AAAA-MM-JJ. */
export const aujourdHui = () => {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
export const decaler = (jour: string, n: number) => {
  const [y, m, d] = jour.split("-").map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + n))
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`
}
export const jourLong = (jour: string) => {
  const [y, m, d] = jour.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
}
export const jourCourt = (jour: string) => jour.split("-").reverse().join("/")
export const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" })

export function periode(p: "jour" | "semaine" | "mois" | "trente"): [string, string] {
  const t = aujourdHui()
  if (p === "jour") return [t, t]
  if (p === "semaine") return [decaler(t, -6), t]
  if (p === "mois") return [t.slice(0, 8) + "01", t]
  return [decaler(t, -29), t]
}

/** Message d'erreur lisible depuis une erreur Supabase/Postgres. */
export const messageErreur = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? ""
  if (/Invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect."
  if (/Email not confirmed/i.test(m)) return "Confirmez d'abord votre adresse avec le lien reçu par e-mail."
  if (/already registered/i.test(m)) return "Un compte existe déjà avec cet e-mail. Connectez-vous."
  if (/Password should be/i.test(m)) return "Le mot de passe doit contenir au moins 6 caractères."
  if (/row-level security|Accès refusé|permission denied/i.test(m)) return "Votre rôle ne permet pas cette action."
  if (/Failed to fetch|NetworkError/i.test(m)) return "Pas de connexion internet. Réessayez dans un instant."
  return m || "Une erreur est survenue. Réessayez."
}
