# Coffee Community

Application web statique pour suivre les contributions financieres d'une equipe aux achats de dosettes de cafe.

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
