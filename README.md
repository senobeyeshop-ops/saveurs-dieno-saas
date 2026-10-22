# Saveurs Dieno · Caisse (SaaS multi-restaurants)

Caisse et gestion de fast-food pour le Sénégal : encaissement Espèces / Wave / Orange Money, reçus, ventes du jour, dépenses, stock d'ingrédients décompté à chaque vente, tableau de bord, menu et équipe avec rôles.

- **Front** : Next.js 16 (App Router), sans framework CSS.
- **Base** : Supabase, projet `saveurs-dieno` (`nyyakvflebhuahkuwfan`, Irlande), déjà créé et rempli.
- **Hébergement prévu** : Netlify (`netlify.toml` fourni).

## 1. Ce qui est déjà en place dans Supabase

- 9 tables protégées par RLS : chaque restaurant ne voit que ses propres données.
- Rôles : **propriétaire** (tout), **gérant** (tout sauf l'équipe), **caissier** (caisse, ventes, dépenses, achats de stock).
- Fonctions serveur : `encaisser` (prix relus en base, numéro de ticket du jour, sortie de stock en une transaction), `annuler_vente`, `mouvement_stock`, `creer_restaurant`, `rejoindre_restaurant`.
- **Saveurs Dieno** est créé avec ses 22 articles. Il attend son propriétaire :
  - code propriétaire (usage unique) : `PROP-1FE7CE1E`
  - code équipe pour les caissiers : `3B6B4C`

Les migrations SQL sont dans `supabase/migrations/` pour recréer la base à l'identique.

## 2. Déployer sur Netlify

1. Mettez ce dossier sur GitHub (nouveau dépôt privé), sans le fichier `.env.local`.
2. Sur Netlify : **Add new site → Import an existing project**, puis choisissez le dépôt. La commande `npm run build` et le plugin Next.js sont lus depuis `netlify.toml`.
3. Dans **Site configuration → Environment variables**, ajoutez :
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://nyyakvflebhuahkuwfan.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_M9cEEx_ZfG-ZevTfSz2pUQ_vIFdbj_J`
4. Lancez le déploiement et notez l'adresse obtenue (ex. `https://saveurs-dieno.netlify.app`).

## 3. Régler l'authentification dans Supabase (obligatoire)

Dans le tableau de bord Supabase : **Authentication → URL Configuration**.

- **Site URL** : l'adresse Netlify.
- **Redirect URLs** : ajoutez `https://VOTRE-SITE.netlify.app/auth/callback`.

Sans ce réglage, le lien de confirmation reçu par e-mail renvoie vers `localhost`.

## 4. Premier démarrage

1. Ouvrez le site, puis **Créer un compte**. Confirmez l'adresse avec le lien reçu.
2. Sur l'écran de bienvenue, saisissez le code propriétaire `PROP-1FE7CE1E`. Vous devenez propriétaire de Saveurs Dieno et le code est désactivé.
3. **Stock** : utilisez la liste type, puis faites l'inventaire de chaque ingrédient.
4. **Menu & prix** : définissez la recette de chaque article (ex. Sandwich poulet = 1 pain + 0,1 kg de poulet).
5. **Équipe** : donnez le code `3B6B4C` aux caissiers. Ils créent leur compte puis saisissent ce code.

Sur téléphone, « Ajouter à l'écran d'accueil » installe la caisse comme une application.

## 5. Vendre à d'autres restaurants

Tout nouveau compte peut **ouvrir un nouveau restaurant** depuis l'écran de bienvenue. Il en devient propriétaire et ne voit que ses données. Un même compte peut gérer plusieurs restaurants : un sélecteur apparaît en haut de l'écran.

## Développement local

```bash
npm install
cp .env.example .env.local
npm run dev
```
