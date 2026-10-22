-- 1. Limite des essais de code : 10 erreurs, puis 15 minutes de blocage.
--    Le propriétaire peut débloquer un compte par son e-mail.
create table if not exists private.tentatives_code (
  user_id uuid primary key references auth.users(id) on delete cascade,
  echecs integer not null default 0,
  bloque_jusqua timestamptz
);
revoke all on private.tentatives_code from public, anon, authenticated;

-- Renvoie l'id du restaurant rejoint, ou null si le code est inconnu
-- (pas d'exception dans ce cas, sinon le compteur d'erreurs serait annulé).
create or replace function public.rejoindre_restaurant(p_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_code text := upper(trim(p_code));
  t private.tentatives_code%rowtype;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;

  select * into t from private.tentatives_code where user_id = v_uid for update;
  if found and t.bloque_jusqua is not null and t.bloque_jusqua > now() then
    raise exception 'Trop de codes erronés. Réessayez après % (heure de Dakar), ou demandez au propriétaire de vous débloquer.',
      to_char(t.bloque_jusqua at time zone 'Africa/Dakar', 'HH24:MI');
  end if;

  select id into v_id from public.restaurants where code_proprietaire = v_code for update;
  if v_id is not null then
    insert into public.membres(restaurant_id, user_id, role) values (v_id, v_uid, 'proprietaire')
      on conflict (restaurant_id, user_id) do update set role = 'proprietaire';
    update public.restaurants set code_proprietaire = null where id = v_id;
    delete from private.tentatives_code where user_id = v_uid;
    return v_id;
  end if;

  select id into v_id from public.restaurants where code_invitation = v_code;
  if v_id is not null then
    insert into public.membres(restaurant_id, user_id, role) values (v_id, v_uid, 'caissier')
      on conflict (restaurant_id, user_id) do nothing;
    delete from private.tentatives_code where user_id = v_uid;
    return v_id;
  end if;

  insert into private.tentatives_code(user_id, echecs) values (v_uid, 1)
    on conflict (user_id) do update set
      echecs = case when private.tentatives_code.bloque_jusqua is not null then 1 else private.tentatives_code.echecs + 1 end,
      bloque_jusqua = null;
  update private.tentatives_code set echecs = 0, bloque_jusqua = now() + interval '15 minutes'
    where user_id = v_uid and echecs >= 10;
  return null;
end $$;

-- Débloque un compte : réservé au propriétaire d'un restaurant.
-- Ne dit pas si l'e-mail existe, pour ne pas révéler les comptes.
create or replace function public.debloquer_compte(p_restaurant uuid, p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.a_role(p_restaurant, array['proprietaire']) then raise exception 'Accès refusé'; end if;
  delete from private.tentatives_code t
    using auth.users u
    where t.user_id = u.id and lower(u.email) = lower(trim(p_email));
end $$;

revoke all on function public.debloquer_compte(uuid, text) from public, anon;
grant execute on function public.debloquer_compte(uuid, text) to authenticated;

-- 2. Un caissier ne voit que ses propres tickets ; propriétaire et gérant voient tout.
drop policy if exists "lire ventes" on public.ventes;
create policy "lire ventes" on public.ventes for select to authenticated using (
  (select private.a_role(restaurant_id, array['proprietaire','gerant']))
  or ((select private.est_membre(restaurant_id)) and caissier_id = (select auth.uid()))
);

drop policy if exists "lire lignes" on public.vente_lignes;
create policy "lire lignes" on public.vente_lignes for select to authenticated using (
  (select private.a_role(restaurant_id, array['proprietaire','gerant']))
  or exists (select 1 from public.ventes v where v.id = vente_lignes.vente_id and v.caissier_id = (select auth.uid()))
);

create index if not exists ventes_caissier_idx on public.ventes (restaurant_id, caissier_id, jour);
