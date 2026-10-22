"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { Restaurant } from "@/lib/database.types"
import { createClient } from "@/lib/supabase/client"

type Ctx = {
  resto: Restaurant
  role: "proprietaire" | "gerant" | "caissier"
  userId: string
  peutGerer: boolean
  toast: (m: string) => void
  supabase: ReturnType<typeof createClient>
}

const RestoCtx = createContext<Ctx | null>(null)

export function RestoProvider({ resto, role, userId, children }: { resto: Restaurant; role: string; userId: string; children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const toast = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2800)
  }, [])
  const r = (["proprietaire", "gerant", "caissier"].includes(role) ? role : "caissier") as Ctx["role"]
  const value = useMemo(() => ({ resto, role: r, userId, peutGerer: r !== "caissier", toast, supabase }), [resto, r, userId, toast, supabase])
  return (
    <RestoCtx.Provider value={value}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </RestoCtx.Provider>
  )
}

export function useResto() {
  const c = useContext(RestoCtx)
  if (!c) throw new Error("useResto hors du RestoProvider")
  return c
}
