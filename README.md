# Coffee Community

Application web statique pour suivre les contributions financieres d'une equipe aux achats de dosettes de cafe.

Les donnees sont synchronisees avec Supabase. Si Supabase n'est pas disponible, l'application utilise le `localStorage` du navigateur comme fallback.

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

- `coffee_members`
- `coffee_entries`

Pour changer de projet Supabase, ouvrir Project Settings > API dans Supabase, puis remplacer `url` et `anonKey` dans `supabase-config.js` :

```js
window.COFFEE_COMMUNITY_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "ey...",
};
```

Note: cette configuration donne un acces lecture/ecriture public a la base via la cle `anon`, ce qui convient pour une petite equipe de confiance. Pour une app publique, il faudra ajouter une authentification et des politiques RLS plus strictes.
