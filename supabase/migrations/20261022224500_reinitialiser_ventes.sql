-- Remise à zéro des ventes d'un restaurant, réservée au propriétaire.
-- Le propriétaire doit retaper le nom exact du restaurant pour confirmer.
-- Option : remettre en stock les ingrédients consommés par ces ventes.
create or replace function public.reinitialiser_ventes(p_restaurant uuid, p_confirmation text, p_remettre_stock boolean default true)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_nom text; v_nb integer;
begin
  if not private.a_role(p_restaurant, array['proprietaire']) then raise exception 'Seul le propriétaire peut remettre les ventes à zéro'; end if;
  select nom into v_nom from public.restaurants where id = p_restaurant for update;
  if lower(trim(coalesce(p_confirmation, ''))) <> lower(trim(v_nom)) then
    raise exception 'Confirmation incorrecte : tapez exactement « % »', v_nom;
  end if;

  if p_remettre_stock then
    -- Les mouvements liés aux ventes (sorties et retours d'annulation) sont annulés sur le stock.
    update public.ingredients i set stock = i.stock - m.net
      from (select ingredient_id, sum(quantite) as net from public.mouvements_stock
            where restaurant_id = p_restaurant and vente_id is not null group by ingredient_id) m
      where i.id = m.ingredient_id and i.restaurant_id = p_restaurant;
  end if;
  delete from public.mouvements_stock where restaurant_id = p_restaurant and vente_id is not null;
  delete from public.vente_lignes where restaurant_id = p_restaurant;
  delete from public.ventes where restaurant_id = p_restaurant;
  get diagnostics v_nb = row_count;
  return v_nb;
end $$;
revoke all on function public.reinitialiser_ventes(uuid, text, boolean) from public, anon;
grant execute on function public.reinitialiser_ventes(uuid, text, boolean) to authenticated;
