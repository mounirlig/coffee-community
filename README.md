# Coffee Community

Application web statique pour suivre les contributions financieres d'une equipe aux achats de dosettes de cafe.

Les donnees sont synchronisees avec Supabase quand `supabase-config.js` contient l'URL du projet et la cle publique `anon`. Si Supabase n'est pas configure, l'application utilise le `localStorage` du navigateur.

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

## Configurer Supabase

1. Creer un projet Supabase.
2. Ouvrir le SQL Editor.
3. Copier/coller le contenu de `supabase-schema.sql`, puis executer le script.
4. Ouvrir Project Settings > API.
5. Copier `Project URL` et la cle publique `anon`.
6. Remplir `supabase-config.js` :

```js
window.COFFEE_COMMUNITY_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "ey...",
};
```

7. Commit, push, puis redeployer sur Vercel.

Note: cette configuration donne un acces lecture/ecriture public a la base via la cle `anon`, ce qui convient pour une petite equipe de confiance. Pour une app publique, il faudra ajouter une authentification et des politiques RLS plus strictes.
