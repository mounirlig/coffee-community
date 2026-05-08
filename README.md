# Coffee Community

Application web statique pour suivre les contributions financieres d'une equipe aux achats de dosettes de cafe.

Les donnees sont synchronisees avec Supabase et isolees par equipe. Les utilisateurs se connectent par lien email, creent ou choisissent une equipe, ou rejoignent une equipe existante avec un code d'invitation.

## Lancer en local

```bash
python3 -m http.server 4173
```

Puis ouvrir `http://localhost:4173`.

## Deployer sur Vercel

Ce projet est une app statique sans dependances ni build.

1. Importer le depot dans Vercel.
2. Garder le framework sur `Other`.
3. Laisser la commande de build vide.
4. Laisser le dossier de sortie vide ou a la racine du projet.

Le fichier `vercel.json` configure les URLs propres, les headers de base et le fallback vers `index.html`.

## Supabase

Le projet est branche sur Supabase avec le fichier `supabase-config.js`.

Le schema SQL applique est conserve dans `supabase-schema.sql`. Il cree :

- `coffee_teams`
- `coffee_team_memberships`
- `coffee_members`
- `coffee_entries`

Les policies RLS s'appuient sur `auth.uid()` et sur `coffee_team_memberships` pour limiter les lectures/ecritures aux membres de chaque equipe.

Chaque equipe possede un `invite_code`. Un utilisateur connecte peut rejoindre l'equipe via la fonction RPC `join_coffee_team`, puis les policies RLS lui donnent acces uniquement a cette equipe.

Pour changer de projet Supabase, ouvrir Project Settings > API dans Supabase, puis remplacer `url` et `anonKey` dans `supabase-config.js` :

```js
window.COFFEE_COMMUNITY_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "ey...",
};
```

Note: la cle publique Supabase reste visible cote client, ce qui est normal. La securite repose sur l'authentification Supabase et les policies RLS par equipe.
