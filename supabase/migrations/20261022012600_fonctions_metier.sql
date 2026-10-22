-- Le code propriétaire ne se lit jamais par l'API
revoke select on public.restaurants from authenticated;
grant select (id, nom, telephone, adresse, email, code_invitation, created_at) on public.restaurants to authenticated;
revoke update on public.restaurants from authenticated;
grant update (nom, telephone, adresse, email) on public.restaurants to authenticated;

-- Créer un restaurant : l'appelant en devient propriétaire
create or replace function public.creer_restaurant(p_nom text, p_telephone text default null, p_adresse text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  insert into public.restaurants(nom, telephone, adresse, code_proprietaire)
    values (trim(p_nom), nullif(trim(p_telephone),''), nullif(trim(p_adresse),''), null) returning id into v_id;
  insert into public.membres(restaurant_id, user_id, role) values (v_id, v_uid, 'proprietaire');
  return v_id;
end $$;

-- Rejoindre : code propriétaire (usage unique) ou code d'invitation équipe (rôle caissier)
create or replace function public.rejoindre_restaurant(p_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text := upper(trim(p_code));
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  select id into v_id from public.restaurants where code_proprietaire = v_code for update;
  if v_id is not null then
    insert into public.membres(restaurant_id, user_id, role) values (v_id, v_uid, 'proprietaire')
      on conflict (restaurant_id, user_id) do update set role = 'proprietaire';
    update public.restaurants set code_proprietaire = null where id = v_id;
    return v_id;
  end if;
  select id into v_id from public.restaurants where code_invitation = v_code;
  if v_id is null then raise exception 'Code inconnu. Vérifiez les 6 caractères donnés par le gérant.'; end if;
  insert into public.membres(restaurant_id, user_id, role) values (v_id, v_uid, 'caissier')
    on conflict (restaurant_id, user_id) do nothing;
  return v_id;
end $$;

-- Encaisser : prix relus en base, numéro de ticket du jour, sortie de stock selon les recettes, en une transaction
create or replace function public.encaisser(p_restaurant uuid, p_mode text, p_recu integer, p_lignes jsonb)
returns table (vente_id uuid, numero integer, total integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_jour date := (now() at time zone 'Africa/Dakar')::date;
  v_vente uuid; v_num integer; v_total integer := 0;
  l jsonb; a public.articles%rowtype; v_q integer; v_pu integer;
begin
  if v_uid is null or not private.est_membre(p_restaurant) then raise exception 'Accès refusé'; end if;
  if p_mode not in ('Espèces','Wave','Orange Money') then raise exception 'Moyen de paiement inconnu'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Commande vide'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_restaurant::text || v_jour::text, 0));
  select coalesce(max(v.numero),0)+1 into v_num from public.ventes v where v.restaurant_id = p_restaurant and v.jour = v_jour;
  insert into public.ventes(restaurant_id, numero, jour, mode_paiement, total, montant_recu, caissier_id)
    values (p_restaurant, v_num, v_jour, p_mode, 0, nullif(p_recu,0), v_uid) returning id into v_vente;

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

  return query select v_vente, v_num, v_total;
end $$;

-- Annuler un ticket : propriétaire ou gérant ; remet le stock consommé
create or replace function public.annuler_vente(p_vente uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.ventes%rowtype;
begin
  select * into v from public.ventes where id = p_vente for update;
  if not found or not private.a_role(v.restaurant_id, array['proprietaire','gerant']) then raise exception 'Accès refusé'; end if;
  if v.annulee then return; end if;
  update public.ventes set annulee = true, annulee_par = auth.uid() where id = p_vente;
  insert into public.mouvements_stock(restaurant_id, ingredient_id, type, quantite, vente_id, note, created_by)
    select restaurant_id, ingredient_id, 'annulation', -quantite, vente_id, 'Ticket ' || v.numero || ' annulé', auth.uid()
    from public.mouvements_stock where vente_id = p_vente and type = 'vente';
  update public.ingredients i set stock = i.stock - m.quantite
    from public.mouvements_stock m where m.vente_id = p_vente and m.type = 'vente' and m.ingredient_id = i.id;
end $$;

-- Achat, perte, inventaire ; un achat payé peut créer la dépense correspondante
create or replace function public.mouvement_stock(p_ingredient uuid, p_type text, p_quantite numeric, p_cout integer default null, p_note text default null, p_en_depense boolean default false, p_mode text default 'Espèces')
returns void language plpgsql security definer set search_path = ''
as $$
declare i public.ingredients%rowtype; v_delta numeric;
begin
  select * into i from public.ingredients where id = p_ingredient for update;
  if not found or not private.est_membre(i.restaurant_id) then raise exception 'Accès refusé'; end if;
  if p_type not in ('achat','perte','inventaire') then raise exception 'Type de mouvement inconnu'; end if;
  if p_quantite is null or p_quantite < 0 or (p_type <> 'inventaire' and p_quantite = 0) then raise exception 'Quantité invalide'; end if;
  if p_type = 'inventaire' and not private.a_role(i.restaurant_id, array['proprietaire','gerant']) then raise exception 'Seul le propriétaire ou le gérant fait l''inventaire'; end if;
  v_delta := case p_type when 'achat' then p_quantite when 'perte' then -p_quantite else p_quantite - i.stock end;
  insert into public.mouvements_stock(restaurant_id, ingredient_id, type, quantite, cout, note, created_by)
    values (i.restaurant_id, i.id, p_type, v_delta, nullif(p_cout,0), nullif(trim(p_note),''), auth.uid());
  update public.ingredients set stock = stock + v_delta,
    cout_unitaire = case when p_type = 'achat' and coalesce(p_cout,0) > 0 then round(p_cout / p_quantite)::integer else cout_unitaire end
    where id = i.id;
  if p_type = 'achat' and p_en_depense and coalesce(p_cout,0) > 0 then
    insert into public.depenses(restaurant_id, libelle, categorie, montant, mode_paiement, created_by)
      values (i.restaurant_id, 'Achat ' || trim(to_char(p_quantite, 'FM999999990.###')) || ' ' || i.unite || ' ' || i.nom, 'Matières premières', p_cout,
              case when p_mode in ('Espèces','Wave','Orange Money','Virement') then p_mode else 'Espèces' end, auth.uid());
  end if;
end $$;

revoke all on function public.creer_restaurant(text,text,text) from public, anon;
revoke all on function public.rejoindre_restaurant(text) from public, anon;
revoke all on function public.encaisser(uuid,text,integer,jsonb) from public, anon;
revoke all on function public.annuler_vente(uuid) from public, anon;
revoke all on function public.mouvement_stock(uuid,text,numeric,integer,text,boolean,text) from public, anon;
grant execute on function public.creer_restaurant(text,text,text) to authenticated;
grant execute on function public.rejoindre_restaurant(text) to authenticated;
grant execute on function public.encaisser(uuid,text,integer,jsonb) to authenticated;
grant execute on function public.annuler_vente(uuid) to authenticated;
grant execute on function public.mouvement_stock(uuid,text,numeric,integer,text,boolean,text) to authenticated;

-- Vues de synthèse (respectent la RLS de l'appelant)
create view public.stats_ventes_jour with (security_invoker = true) as
  select restaurant_id, jour,
    sum(total)::bigint as ca, count(*)::int as tickets,
    sum(total) filter (where mode_paiement = 'Espèces')::bigint as ca_especes,
    sum(total) filter (where mode_paiement = 'Wave')::bigint as ca_wave,
    sum(total) filter (where mode_paiement = 'Orange Money')::bigint as ca_orange_money
  from public.ventes where not annulee group by restaurant_id, jour;

create view public.stats_articles_jour with (security_invoker = true) as
  select vl.restaurant_id, v.jour, vl.nom, sum(vl.quantite)::int as quantite, sum(vl.quantite * vl.prix_unitaire)::bigint as montant
  from public.vente_lignes vl join public.ventes v on v.id = vl.vente_id
  where not v.annulee group by vl.restaurant_id, v.jour, vl.nom;

create view public.stats_depenses_jour with (security_invoker = true) as
  select restaurant_id, jour, sum(montant)::bigint as depenses from public.depenses group by restaurant_id, jour;

grant select on public.stats_ventes_jour, public.stats_articles_jour, public.stats_depenses_jour to authenticated;
revoke all on public.stats_ventes_jour, public.stats_articles_jour, public.stats_depenses_jour from anon;
