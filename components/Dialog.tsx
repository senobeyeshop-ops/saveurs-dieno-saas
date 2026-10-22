"use client"

import { useEffect } from "react"

export function Dialog({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [onClose])
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  )
}
