-- Schéma privé (non exposé) pour les fonctions d'aide RLS
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 2 and 80),
  telephone text,
  adresse text,
  email text,
  code_invitation text not null unique default upper(substr(md5(random()::text), 1, 6)),
  code_proprietaire text unique default ('PROP-' || upper(substr(md5(random()::text), 1, 8))),
  created_at timestamptz not null default now()
);

create table public.membres (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'caissier' check (role in ('proprietaire','gerant','caissier')),
  nom_affiche text,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index membres_user_idx on public.membres(user_id);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 80),
  categorie text not null default 'Salés',
  prix integer not null check (prix >= 0),
  prix_variable boolean not null default false,
  prix_min integer check (prix_min >= 0),
  prix_max integer check (prix_max >= 0),
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  check (not prix_variable or (prix_min is not null and prix_max is not null and prix_min <= prix_max))
);
create index articles_restaurant_idx on public.articles(restaurant_id);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 80),
  unite text not null default 'pièce',
  stock numeric(12,3) not null default 0,
  seuil numeric(12,3) not null default 0 check (seuil >= 0),
  cout_unitaire integer not null default 0 check (cout_unitaire >= 0),
  created_at timestamptz not null default now()
);
create index ingredients_restaurant_idx on public.ingredients(restaurant_id);

create table public.recettes (
  article_id uuid not null references public.articles(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  quantite numeric(12,3) not null check (quantite > 0),
  primary key (article_id, ingredient_id)
);
create index recettes_ingredient_idx on public.recettes(ingredient_id);
create index recettes_restaurant_idx on public.recettes(restaurant_id);

create table public.ventes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  numero integer not null,
  jour date not null default (now() at time zone 'Africa/Dakar')::date,
  mode_paiement text not null check (mode_paiement in ('Espèces','Wave','Orange Money')),
  total integer not null check (total >= 0),
  montant_recu integer,
  annulee boolean not null default false,
  annulee_par uuid references auth.users(id) on delete set null,
  caissier_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (restaurant_id, jour, numero)
);
create index ventes_restaurant_jour_idx on public.ventes(restaurant_id, jour desc);
create index ventes_caissier_idx on public.ventes(caissier_id);
create index ventes_annulee_par_idx on public.ventes(annulee_par);

create table public.vente_lignes (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  article_id uuid references public.articles(id) on delete set null,
  nom text not null,
  quantite integer not null check (quantite > 0),
  prix_unitaire integer not null check (prix_unitaire >= 0)
);
create index vente_lignes_vente_idx on public.vente_lignes(vente_id);
create index vente_lignes_restaurant_idx on public.vente_lignes(restaurant_id);
create index vente_lignes_article_idx on public.vente_lignes(article_id);

create table public.depenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  jour date not null default (now() at time zone 'Africa/Dakar')::date,
  libelle text not null check (char_length(libelle) between 1 and 160),
  categorie text not null default 'Autre',
  montant integer not null check (montant > 0),
  mode_paiement text not null default 'Espèces' check (mode_paiement in ('Espèces','Wave','Orange Money','Virement')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index depenses_restaurant_jour_idx on public.depenses(restaurant_id, jour desc);
create index depenses_created_by_idx on public.depenses(created_by);

-- type : achat (+), perte (−), vente (−), annulation (+ remise), inventaire (fixe le niveau)
create table public.mouvements_stock (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  type text not null check (type in ('achat','perte','vente','annulation','inventaire')),
  quantite numeric(12,3) not null,
  cout integer,
  note text,
  vente_id uuid references public.ventes(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index mouvements_restaurant_date_idx on public.mouvements_stock(restaurant_id, created_at desc);
create index mouvements_ingredient_idx on public.mouvements_stock(ingredient_id);
create index mouvements_vente_idx on public.mouvements_stock(vente_id);
create index mouvements_created_by_idx on public.mouvements_stock(created_by);
