-- Commande en ligne : retrait sur place, paiement au retrait, validation par la caisse.
-- Parcours : nouvelle (à valider) → validee (en préparation) → prete → retiree (encaissée, ticket créé)
--            ou refusee.

-- 1. Réglages du restaurant
alter table public.restaurants
  add column if not exists slug text,
  add column if not exists commandes_ouvertes boolean not null default false,
  add column if not exists message_commande text;

create or replace function private.slugifier(p text) returns text language sql immutable set search_path = ''
as $$ select trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''),
  'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ', 'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy')), '[^a-z0-9]+', '-', 'g')) $$;

create or replace function private.definir_slug() returns trigger language plpgsql security definer set search_path = ''
as $$
declare base text; essai text; n integer := 1;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  base := coalesce(nullif(private.slugifier(new.nom), ''), 'restaurant');
  essai := base;
  while exists (select 1 from public.restaurants where slug = essai and id <> new.id) loop
    n := n + 1; essai := base || '-' || n;
  end loop;
  new.slug := essai;
  return new;
end $$;
revoke all on function private.definir_slug() from public;

drop trigger if exists restaurants_slug on public.restaurants;
create trigger restaurants_slug before insert or update of slug on public.restaurants
  for each row execute function private.definir_slug();
update public.restaurants set slug = null where slug is null;  -- déclenche le calcul pour les restaurants existants
alter table public.restaurants alter column slug set not null;
create unique index if not exists restaurants_slug_idx on public.restaurants (slug);

grant select (slug, commandes_ouvertes, message_commande) on public.restaurants to authenticated;
grant update (commandes_ouvertes, message_commande) on public.restaurants to authenticated;

-- 2. Tables des commandes en ligne
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  numero integer not null,
  jour date not null default ((now() at time zone 'Africa/Dakar')::date),
  nom_client text not null,
  telephone text not null,
  note text,
  total integer not null default 0,
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'validee', 'prete', 'retiree', 'refusee')),
  motif_refus text,
  jeton text not null unique default replace(gen_random_uuid()::text, '-', ''),
  vente_id uuid references public.ventes(id) on delete set null,
  valide_par uuid references auth.users(id) on delete set null,
  valide_at timestamptz,
  prete_at timestamptz,
  retire_at timestamptz,
  created_at timestamptz not null default now(),
  unique (restaurant_id, jour, numero)
);
create index if not exists commandes_resto_statut_idx on public.commandes (restaurant_id, statut, jour);
create index if not exists commandes_tel_idx on public.commandes (restaurant_id, telephone, statut);

create table if not exists public.commande_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  article_id uuid references public.articles(id) on delete set null,
  nom text not null,
  quantite integer not null check (quantite between 1 and 50),
  prix_unitaire integer not null check (prix_unitaire >= 0)
);
create index if not exists commande_lignes_cmd_idx on public.commande_lignes (commande_id);

alter table public.commandes enable row level security;
alter table public.commande_lignes enable row level security;
revoke all on public.commandes, public.commande_lignes from anon;
grant select on public.commandes, public.commande_lignes to authenticated;

create policy "equipe lit les commandes" on public.commandes for select to authenticated
  using ((select private.est_membre(restaurant_id)));
create policy "equipe lit les lignes de commande" on public.commande_lignes for select to authenticated
  using ((select private.est_membre(restaurant_id)));

-- 3. Fonctions publiques (sans compte)
create or replace function public.menu_public(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'nom', r.nom, 'adresse', r.adresse, 'telephone', r.telephone,
    'ouvert', r.commandes_ouvertes, 'message', r.message_commande,
    'articles', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'categorie', a.categorie, 'prix', a.prix) order by a.ordre, a.nom)
                          from public.articles a where a.restaurant_id = r.id and a.actif and not a.prix_variable), '[]'::jsonb)
  )
  from public.restaurants r where r.slug = lower(trim(p_slug))
$$;

create or replace function public.passer_commande(p_slug text, p_nom text, p_telephone text, p_lignes jsonb, p_note text default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  r public.restaurants%rowtype; v_tel text; v_nom text; v_jour date := (now() at time zone 'Africa/Dakar')::date;
  v_cmd uuid; v_num integer; v_total integer := 0; v_jeton text;
  l jsonb; a public.articles%rowtype; v_q integer;
begin
  select * into r from public.restaurants where slug = lower(trim(p_slug));
  if not found then raise exception 'Restaurant introuvable'; end if;
  if not r.commandes_ouvertes then raise exception 'Les commandes en ligne sont fermées pour le moment.'; end if;

  v_nom := left(trim(coalesce(p_nom, '')), 60);
  if char_length(v_nom) < 2 then raise exception 'Indiquez votre nom.'; end if;
  v_tel := regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g');
  if length(v_tel) = 9 then v_tel := '221' || v_tel; end if;
  if length(v_tel) not between 11 and 15 then raise exception 'Numéro de téléphone invalide.'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Votre panier est vide.'; end if;
  if jsonb_array_length(p_lignes) > 30 then raise exception 'Trop d''articles différents dans une seule commande.'; end if;

  -- Garde-fous contre les fausses commandes
  if (select count(*) from public.commandes c where c.restaurant_id = r.id and c.telephone = v_tel and c.statut = 'nouvelle') >= 3 then
    raise exception 'Vous avez déjà des commandes en attente de validation. Patientez ou appelez le restaurant.';
  end if;
  if (select count(*) from public.commandes c where c.restaurant_id = r.id and c.statut = 'nouvelle') >= 40 then
    raise exception 'Le restaurant reçoit beaucoup de commandes. Réessayez dans quelques minutes.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cmd' || r.id::text || v_jour::text, 0));
  select coalesce(max(c.numero), 0) + 1 into v_num from public.commandes c where c.restaurant_id = r.id and c.jour = v_jour;
  insert into public.commandes(restaurant_id, numero, jour, nom_client, telephone, note)
    values (r.id, v_num, v_jour, v_nom, v_tel, nullif(left(trim(coalesce(p_note, '')), 200), ''))
    returning id, commandes.jeton into v_cmd, v_jeton;

  for l in select * from jsonb_array_elements(p_lignes) loop
    select * into a from public.articles where id = (l->>'article_id')::uuid and restaurant_id = r.id;
    if not found or not a.actif or a.prix_variable then raise exception 'Un article n''est plus disponible. Rechargez la page.'; end if;
    v_q := (l->>'quantite')::integer;
    if v_q is null or v_q < 1 or v_q > 50 then raise exception 'Quantité invalide pour %', a.nom; end if;
    insert into public.commande_lignes(commande_id, restaurant_id, article_id, nom, quantite, prix_unitaire)
      values (v_cmd, r.id, a.id, a.nom, v_q, a.prix);
    v_total := v_total + v_q * a.prix;
  end loop;
  update public.commandes set total = v_total where id = v_cmd;
  return v_jeton;
end $$;

create or replace function public.suivi_commande(p_jeton text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('nom', r.nom, 'telephone', r.telephone, 'adresse', r.adresse, 'slug', r.slug),
    'numero', c.numero, 'date', c.created_at, 'nom_client', c.nom_client, 'total', c.total, 'note', c.note,
    'statut', c.statut, 'motif_refus', c.motif_refus, 'prete_at', c.prete_at, 'retire_at', c.retire_at,
    'recu_jeton', v.jeton,
    'lignes', coalesce((select jsonb_agg(jsonb_build_object('nom', l.nom, 'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire) order by l.nom)
                        from public.commande_lignes l where l.commande_id = c.id), '[]'::jsonb)
  )
  from public.commandes c join public.restaurants r on r.id = c.restaurant_id
  left join public.ventes v on v.id = c.vente_id
  where c.jeton = p_jeton and length(p_jeton) = 32
$$;

revoke all on function public.menu_public(text), public.passer_commande(text, text, text, jsonb, text), public.suivi_commande(text) from public;
grant execute on function public.menu_public(text), public.passer_commande(text, text, text, jsonb, text), public.suivi_commande(text) to anon, authenticated;

-- 4. Fonctions de l'équipe
create or replace function public.valider_commande(p_commande uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare c public.commandes%rowtype;
begin
  select * into c from public.commandes where id = p_commande for update;
  if not found or not private.a_role(c.restaurant_id, array['proprietaire', 'gerant', 'caissier']) then raise exception 'Accès refusé'; end if;
  if c.statut <> 'nouvelle' then raise exception 'Cette commande a déjà été traitée'; end if;
  update public.commandes set statut = 'validee', valide_par = auth.uid(), valide_at = now() where id = p_commande;
end $$;

create or replace function public.refuser_commande(p_commande uuid, p_motif text)
returns void language plpgsql security definer set search_path = ''
as $$
declare c public.commandes%rowtype;
begin
  select * into c from public.commandes where id = p_commande for update;
  if not found or not private.a_role(c.restaurant_id, array['proprietaire', 'gerant', 'caissier']) then raise exception 'Accès refusé'; end if;
  if c.statut not in ('nouvelle', 'validee', 'prete') then raise exception 'Cette commande ne peut plus être refusée'; end if;
  update public.commandes set statut = 'refusee', motif_refus = nullif(left(trim(coalesce(p_motif, '')), 200), '') where id = p_commande;
end $$;

create or replace function public.commande_prete(p_commande uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare c public.commandes%rowtype;
begin
  select * into c from public.commandes where id = p_commande for update;
  if not found or not private.a_role(c.restaurant_id, array['proprietaire', 'gerant', 'cuisine']) then raise exception 'Accès refusé'; end if;
  if c.statut <> 'validee' then raise exception 'Seule une commande validée peut être marquée prête'; end if;
  update public.commandes set statut = 'prete', prete_at = now() where id = p_commande;
end $$;

-- Le client vient retirer et payer : crée le ticket de caisse (déjà « livré ») et clôt la commande.
create or replace function public.encaisser_commande(p_commande uuid, p_mode text, p_recu integer)
returns table(vente_id uuid, numero integer, total integer, jeton text)
language plpgsql security definer set search_path = ''
as $$
declare c public.commandes%rowtype; res record;
begin
  select * into c from public.commandes where id = p_commande for update;
  if not found or not private.a_role(c.restaurant_id, array['proprietaire', 'gerant', 'caissier']) then raise exception 'Accès refusé'; end if;
  if c.statut not in ('validee', 'prete') then raise exception 'Cette commande ne peut pas être encaissée (statut : %)', c.statut; end if;

  select * into res from public.encaisser(c.restaurant_id, p_mode, p_recu,
    (select jsonb_agg(jsonb_build_object('article_id', l.article_id, 'quantite', l.quantite)) from public.commande_lignes l where l.commande_id = c.id),
    c.telephone);
  update public.ventes set statut = 'livre', livre_par = auth.uid(), livre_at = now() where id = res.vente_id;
  update public.commandes set statut = 'retiree', retire_at = now(), vente_id = res.vente_id where id = c.id;
  return query select res.vente_id, res.numero, res.total, res.jeton;
end $$;

revoke all on function public.valider_commande(uuid), public.refuser_commande(uuid, text), public.commande_prete(uuid), public.encaisser_commande(uuid, text, integer) from public, anon;
grant execute on function public.valider_commande(uuid), public.refuser_commande(uuid, text), public.commande_prete(uuid), public.encaisser_commande(uuid, text, integer) to authenticated;

-- 5. La remise à zéro des ventes efface aussi les commandes en ligne.
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
    update public.ingredients i set stock = i.stock - m.net
      from (select ingredient_id, sum(quantite) as net from public.mouvements_stock
            where restaurant_id = p_restaurant and vente_id is not null group by ingredient_id) m
      where i.id = m.ingredient_id and i.restaurant_id = p_restaurant;
  end if;
  delete from public.commandes where restaurant_id = p_restaurant;
  delete from public.mouvements_stock where restaurant_id = p_restaurant and vente_id is not null;
  delete from public.vente_lignes where restaurant_id = p_restaurant;
  delete from public.ventes where restaurant_id = p_restaurant;
  get diagnostics v_nb = row_count;
  return v_nb;
end $$;
revoke all on function public.reinitialiser_ventes(uuid, text, boolean) from public, anon;
grant execute on function public.reinitialiser_ventes(uuid, text, boolean) to authenticated;
