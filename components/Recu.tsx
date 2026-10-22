import type { Restaurant } from "@/lib/database.types"
import { fcfa } from "@/lib/format"

export type RecuData = {
  numero: number
  date: string
  mode: string
  total: number
  recu: number | null
  annulee?: boolean
  lignes: { nom: string; quantite: number; prix_unitaire: number }[]
}

export function Recu({ resto, data }: { resto: Restaurant; data: RecuData }) {
  const d = new Date(data.date)
  return (
    <div className="receipt">
      <div className="c">
        <b>{resto.nom.toUpperCase()}</b>
        {resto.adresse && <><br />{resto.adresse}</>}
        {resto.telephone && <><br />{resto.telephone}</>}
      </div>
      <hr />
      <div className="r">
        <span>Ticket n° {String(data.numero).padStart(3, "0")}</span>
        <span>{d.toLocaleDateString("fr-FR", { timeZone: "Africa/Dakar" })} {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" })}</span>
      </div>
      <hr />
      {data.lignes.map((l, i) => (
        <div className="r" key={i}><span>{l.quantite} × {l.nom}</span><span>{fcfa(l.quantite * l.prix_unitaire)}</span></div>
      ))}
      <hr />
      <div className="r"><b>TOTAL</b><b>{fcfa(data.total)}</b></div>
      <div className="r"><span>Payé par</span><span>{data.mode}</span></div>
      {data.recu ? (
        <>
          <div className="r"><span>Reçu</span><span>{fcfa(data.recu)}</span></div>
          <div className="r"><span>Rendu</span><span>{fcfa(data.recu - data.total)}</span></div>
        </>
      ) : null}
      {data.annulee && <><hr /><div className="c"><b>TICKET ANNULÉ</b></div></>}
      <hr />
      <div className="c">Merci et à bientôt !</div>
    </div>
  )
}
