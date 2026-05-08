# Coffee Community

Application web statique pour suivre les contributions financieres d'une equipe aux achats de dosettes de cafe.

Les donnees sont synchronisees avec Supabase et separent les equipes par code d'invitation. Il n'y a pas d'authentification email : chaque personne choisit simplement un nom d'utilisateur local, stocke dans son navigateur.

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

L'application utilise des fonctions RPC publiques `security definer` pour creer/rejoindre une equipe et manipuler ses membres et mouvements sans compte Supabase Auth. Les tables gardent RLS active pour bloquer l'acces direct depuis le client.

Chaque equipe possede un `invite_code`. Une personne peut rejoindre une equipe avec ce code, puis le navigateur garde la liste des equipes connues en `localStorage`.

Pour changer de projet Supabase, ouvrir Project Settings > API dans Supabase, puis remplacer `url` et `anonKey` dans `supabase-config.js` :

```js
window.COFFEE_COMMUNITY_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "ey...",
};
```

Note: la cle publique Supabase reste visible cote client, ce qui est normal. Comme il n'y a plus de verification email, ce modele convient a un usage interne simple et base sur la confiance. Toute personne qui possede le code d'une equipe peut la rejoindre et agir dessus. Pour une isolation forte par utilisateur, il faudra remettre une authentification Supabase et des policies RLS par membership verifie.
