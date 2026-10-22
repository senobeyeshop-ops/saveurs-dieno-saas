-- Nom affiché dans l'équipe (affichage seulement, jamais utilisé pour les droits)
create or replace function private.nom_utilisateur(p_uid uuid)
returns text language sql stable security definer set search_path = ''
as $$ select nullif(trim(coalesce(u.raw_user_meta_data->>'nom_affiche', split_part(u.email, '@', 1))), '') from auth.users u where u.id = p_uid $$;
revoke all on function private.nom_utilisateur(uuid) from public;

create or replace function private.remplir_nom_membre()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if new.nom_affiche is null then new.nom_affiche := private.nom_utilisateur(new.user_id); end if;
  return new;
end $$;
revoke all on function private.remplir_nom_membre() from public;

create trigger membres_nom before insert on public.membres
  for each row execute function private.remplir_nom_membre();
