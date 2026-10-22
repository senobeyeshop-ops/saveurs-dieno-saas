-- Statut des commandes (en attente / livré / annulé), rôle Cuisine,
-- téléphone du client et reçu public consultable par lien WhatsApp.

-- 1. Colonnes sur les ventes
alter table public.ventes
  add column if not exists statut text not null default 'en_attente',
  add column if not exists livre_par uuid references auth.users(id) on delete set null,
  add column if not exists livre_at timestamptz,
  add column if not exists telephone_client text,
  add column if not exists jeton text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists probleme text,
  add column if not exists probleme_par uuid references auth.users(id) on delete set null,
  add column if not exists probleme_at timestamptz;

alter table public.ventes drop constraint if exists ventes_statut_check;
alter table public.ventes add constraint ventes_statut_check check (statut in ('en_attente', 'livre', 'annule'));
create unique index if not exists ventes_jeton_idx on public.ventes (jeton);
create index if not exists ventes_statut_idx on public.ventes (restaurant_id, statut, jour);

-- Les tickets déjà enregistrés sont considérés comme livrés (ou annulés).
update public.ventes set statut = case when annulee then 'annule' else 'livre' end where statut = 'en_attente';

-- 2. Rôle Cuisine
alter table public.membres drop constraint if exists membres_role_check;
alter table public.membres add constraint membres_role_check check (role in ('proprietaire', 'gerant', 'caissier', 'cuisine'));

drop policy if exists "proprietaire change les roles" on public.membres;
create policy "proprietaire change les roles" on public.membres for update to authenticated
  using ((select private.a_role(restaurant_id, array['proprietaire'])) and user_id <> (select auth.uid()))
  with check ((select private.a_role(restaurant_id, array['proprietaire'])) and role in ('gerant', 'caissier', 'cuisine'));

-- La cuisine lit les commandes des deux derniers jours (pour la file d'attente).
drop policy if exists "lire ventes" on public.ventes;
create policy "lire ventes" on public.ventes for select to authenticated using (
  (select private.a_role(restaurant_id, array['proprietaire', 'gerant']))
  or ((select private.a_role(restaurant_id, array['caissier'])) and caissier_id = (select auth.uid()))
  or ((select private.a_role(restaurant_id, array['cuisine'])) and jour >= (now() at time zone 'Africa/Dakar')::date - 1)
);

drop policy if exists "lire lignes" on public.vente_lignes;
create policy "lire lignes" on public.vente_lignes for select to authenticated using (
  (select private.a_role(restaurant_id, array['proprietaire', 'gerant']))
  or exists (
    select 1 from public.ventes v
    where v.id = vente_lignes.vente_id
      and ((v.caissier_id = (select auth.uid()) and (select private.a_role(v.restaurant_id, array['caissier'])))
        or ((select private.a_role(v.restaurant_id, array['cuisine'])) and v.jour >= (now() at time zone 'Africa/Dakar')::date - 1))
  )
);

-- 3. Encaissement : téléphone du client, statut « en attente », la cuisine ne peut pas encaisser.
drop function if exists public.encaisser(uuid, text, integer, jsonb);
create function public.encaisser(p_restaurant uuid, p_mode text, p_recu integer, p_lignes jsonb, p_telephone text default null)
returns table(vente_id uuid, numero integer, total integer, jeton text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_jour date := (now() at time zone 'Africa/Dakar')::date;
  v_vente uuid; v_num integer; v_total integer := 0; v_jeton text; v_tel text;
  l jsonb; a public.articles%rowtype; v_q integer; v_pu integer;
begin
  if v_uid is null or not private.a_role(p_restaurant, array['proprietaire', 'gerant', 'caissier']) then raise exception 'Accès refusé'; end if;
  if p_mode not in ('Espèces', 'Wave', 'Orange Money') then raise exception 'Moyen de paiement inconnu'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Commande vide'; end if;
  v_tel := nullif(regexp_replace(coalesce(p_telephone, ''), '[^0-9+]', '', 'g'), '');
  if v_tel is not null and length(regexp_replace(v_tel, '\D', '', 'g')) not between 9 and 15 then raise exception 'Numéro du client invalide'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_restaurant::text || v_jour::text, 0));
  select coalesce(max(v.numero), 0) + 1 into v_num from public.ventes v where v.restaurant_id = p_restaurant and v.jour = v_jour;
  insert into public.ventes(restaurant_id, numero, jour, mode_paiement, total, montant_recu, caissier_id, statut, telephone_client)
    values (p_restaurant, v_num, v_jour, p_mode, 0, nullif(p_recu, 0), v_uid, 'en_attente', v_tel)
    returning id, ventes.jeton into v_vente, v_jeton;

  for l in select * from jsonb_array_elements(p_lignes) loop
    select * into a from public.articles where id = (l->>'article_id')::uuid and restaurant_id = p_restaurant;
    if not found or not a.actif then raise exception 'Article indisponible'; end if;
    v_q := (l->>'quantite')::integer;
    if v_q is null or v_q < 1 or v_q > 500 then raise exception 'Quantité invalide pour %', a.nom; end if;
    if a.prix_variable then
      v_pu := (l->>'prix_unitaire')::integer;
      if v_pu is null or v_pu < a.prix_min or v_pu > a.prix_max then raise exception 'Prix hors fourchette pour %', a.nom; end if;
    else v_pu := a.prix; end if;
    insert into public.vente_lignes(vente_id, restaurant_id, article_id, nom, quantite, prix_unitaire)
      values (v_vente, p_restaurant, a.id, a.nom, v_q, v_pu);
    v_total := v_total + v_q * v_pu;
  end loop;

  if p_mode = 'Espèces' and p_recu is not null and p_recu > 0 and p_recu < v_total then raise exception 'Montant reçu inférieur au total'; end if;
  update public.ventes set total = v_total where id = v_vente;

  insert into public.mouvements_stock(restaurant_id, ingredient_id, type, quantite, vente_id, created_by)
    select p_restaurant, r.ingredient_id, 'vente', -sum(r.quantite * vl.quantite), v_vente, v_uid
    from public.vente_lignes vl join public.recettes r on r.article_id = vl.article_id
    where vl.vente_id = v_vente group by r.ingredient_id;
  update public.ingredients i set stock = i.stock + m.quantite
    from public.mouvements_stock m where m.vente_id = v_vente and m.ingredient_id = i.id and m.type = 'vente';

  return query select v_vente, v_num, v_total, v_jeton;
end $$;
revoke all on function public.encaisser(uuid, text, integer, jsonb, text) from public, anon;
grant execute on function public.encaisser(uuid, text, integer, jsonb, text) to authenticated;

-- 4. Annulation (propriétaire et gérant seulement) : passe aussi le statut à « annulé ».
create or replace function public.annuler_vente(p_vente uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.ventes%rowtype;
begin
  select * into v from public.ventes where id = p_vente for update;
  if not found or not private.a_role(v.restaurant_id, array['proprietaire', 'gerant']) then raise exception 'Accès refusé'; end if;
  if v.annulee then return; end if;
  update public.ventes set annulee = true, annulee_par = auth.uid(), statut = 'annule' where id = p_vente;
  insert into public.mouvements_stock(restaurant_id, ingredient_id, type, quantite, vente_id, note, created_by)
    select restaurant_id, ingredient_id, 'annulation', -quantite, vente_id, 'Ticket ' || v.numero || ' annulé', auth.uid()
    from public.mouvements_stock where vente_id = p_vente and type = 'vente';
  update public.ingredients i set stock = i.stock - m.quantite
    from public.mouvements_stock m where m.vente_id = p_vente and m.type = 'vente' and m.ingredient_id = i.id;
end $$;

-- 5. Marquer « livré » : propriétaire, gérant ou cuisine.
create or replace function public.marquer_livre(p_vente uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.ventes%rowtype;
begin
  select * into v from public.ventes where id = p_vente for update;
  if not found or not private.a_role(v.restaurant_id, array['proprietaire', 'gerant', 'cuisine']) then raise exception 'Accès refusé'; end if;
  if v.statut = 'annule' then raise exception 'Ce ticket est annulé'; end if;
  if v.statut = 'livre' then return; end if;
  update public.ventes set statut = 'livre', livre_par = auth.uid(), livre_at = now() where id = p_vente;
end $$;
revoke all on function public.marquer_livre(uuid) from public, anon;
grant execute on function public.marquer_livre(uuid) to authenticated;

-- 6. Signaler un problème (la cuisine prévient le gérant, qui décide d'annuler).
create or replace function public.signaler_probleme(p_vente uuid, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.ventes%rowtype;
begin
  select * into v from public.ventes where id = p_vente for update;
  if not found or not private.a_role(v.restaurant_id, array['proprietaire', 'gerant', 'cuisine']) then raise exception 'Accès refusé'; end if;
  if v.statut <> 'en_attente' then raise exception 'Seule une commande en attente peut être signalée'; end if;
  update public.ventes set probleme = nullif(left(trim(p_note), 200), ''), probleme_par = auth.uid(), probleme_at = now()
    where id = p_vente;
end $$;
revoke all on function public.signaler_probleme(uuid, text) from public, anon;
grant execute on function public.signaler_probleme(uuid, text) to authenticated;

-- 7. Reçu public : lisible par quiconque possède le lien (jeton aléatoire de 32 caractères).
--    Ne renvoie ni le téléphone du client ni l'identité du caissier.
create or replace function public.recu_public(p_jeton text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('nom', r.nom, 'telephone', r.telephone, 'adresse', r.adresse),
    'numero', v.numero, 'date', v.created_at, 'mode', v.mode_paiement, 'total', v.total,
    'recu', v.montant_recu, 'statut', v.statut, 'livre_at', v.livre_at,
    'lignes', coalesce((select jsonb_agg(jsonb_build_object('nom', l.nom, 'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire) order by l.nom)
                        from public.vente_lignes l where l.vente_id = v.id), '[]'::jsonb)
  )
  from public.ventes v join public.restaurants r on r.id = v.restaurant_id
  where v.jeton = p_jeton and length(p_jeton) = 32
$$;
revoke all on function public.recu_public(text) from public;
grant execute on function public.recu_public(text) to anon, authenticated;

-- 8. Le jeton et le téléphone ne sont lisibles que par l'équipe (via la politique « lire ventes »).
