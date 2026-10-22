-- Aides RLS : security definer pour lire membres sans récursion de politique ; schéma non exposé
create or replace function private.est_membre(p_restaurant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.membres m where m.restaurant_id = p_restaurant and m.user_id = (select auth.uid())) $$;

create or replace function private.a_role(p_restaurant uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.membres m where m.restaurant_id = p_restaurant and m.user_id = (select auth.uid()) and m.role = any(p_roles)) $$;

revoke all on function private.est_membre(uuid) from public;
revoke all on function private.a_role(uuid, text[]) from public;
grant execute on function private.est_membre(uuid) to authenticated;
grant execute on function private.a_role(uuid, text[]) to authenticated;

alter table public.restaurants enable row level security;
alter table public.membres enable row level security;
alter table public.articles enable row level security;
alter table public.ingredients enable row level security;
alter table public.recettes enable row level security;
alter table public.ventes enable row level security;
alter table public.vente_lignes enable row level security;
alter table public.depenses enable row level security;
alter table public.mouvements_stock enable row level security;

-- Restaurants : création passe par la fonction creer_restaurant ; lecture par les membres
create policy "membres lisent leur restaurant" on public.restaurants for select to authenticated
  using ((select private.est_membre(id)));
create policy "proprietaire modifie le restaurant" on public.restaurants for update to authenticated
  using ((select private.a_role(id, array['proprietaire'])))
  with check ((select private.a_role(id, array['proprietaire'])));

-- Membres : chacun voit l'équipe de son restaurant ; le propriétaire gère les rôles
create policy "voir l'equipe" on public.membres for select to authenticated
  using ((select private.est_membre(restaurant_id)));
create policy "proprietaire change les roles" on public.membres for update to authenticated
  using ((select private.a_role(restaurant_id, array['proprietaire'])) and user_id <> (select auth.uid()))
  with check ((select private.a_role(restaurant_id, array['proprietaire'])) and role in ('gerant','caissier'));
create policy "proprietaire retire un membre" on public.membres for delete to authenticated
  using ((select private.a_role(restaurant_id, array['proprietaire'])) and user_id <> (select auth.uid()));

-- Catalogue : lecture par tous les membres, écriture par propriétaire et gérant
create policy "lire articles" on public.articles for select to authenticated using ((select private.est_membre(restaurant_id)));
create policy "gerer articles ins" on public.articles for insert to authenticated with check ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));
create policy "gerer articles upd" on public.articles for update to authenticated using ((select private.a_role(restaurant_id, array['proprietaire','gerant']))) with check ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));
create policy "gerer articles del" on public.articles for delete to authenticated using ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));

create policy "lire ingredients" on public.ingredients for select to authenticated using ((select private.est_membre(restaurant_id)));
create policy "gerer ingredients ins" on public.ingredients for insert to authenticated with check ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));
create policy "gerer ingredients upd" on public.ingredients for update to authenticated using ((select private.a_role(restaurant_id, array['proprietaire','gerant']))) with check ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));
create policy "gerer ingredients del" on public.ingredients for delete to authenticated using ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));

create policy "lire recettes" on public.recettes for select to authenticated using ((select private.est_membre(restaurant_id)));
create policy "gerer recettes ins" on public.recettes for insert to authenticated with check ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));
create policy "gerer recettes upd" on public.recettes for update to authenticated using ((select private.a_role(restaurant_id, array['proprietaire','gerant']))) with check ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));
create policy "gerer recettes del" on public.recettes for delete to authenticated using ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));

-- Ventes : lecture par les membres ; écriture uniquement via les fonctions encaisser / annuler_vente
create policy "lire ventes" on public.ventes for select to authenticated using ((select private.est_membre(restaurant_id)));
create policy "lire lignes" on public.vente_lignes for select to authenticated using ((select private.est_membre(restaurant_id)));

-- Dépenses : tout membre saisit ; suppression par propriétaire et gérant
create policy "lire depenses" on public.depenses for select to authenticated using ((select private.est_membre(restaurant_id)));
create policy "saisir depense" on public.depenses for insert to authenticated
  with check ((select private.est_membre(restaurant_id)) and created_by = (select auth.uid()));
create policy "supprimer depense" on public.depenses for delete to authenticated using ((select private.a_role(restaurant_id, array['proprietaire','gerant'])));

-- Mouvements : lecture par les membres ; écriture via la fonction mouvement_stock
create policy "lire mouvements" on public.mouvements_stock for select to authenticated using ((select private.est_membre(restaurant_id)));

-- Droits API explicites (les nouvelles tables ne sont plus exposées par défaut)
grant select, update on public.restaurants to authenticated;
grant select, update, delete on public.membres to authenticated;
grant select, insert, update, delete on public.articles, public.ingredients, public.recettes to authenticated;
grant select on public.ventes, public.vente_lignes, public.mouvements_stock to authenticated;
grant select, insert, delete on public.depenses to authenticated;
revoke all on all tables in schema public from anon;
