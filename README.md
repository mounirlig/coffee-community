# Coffee Community

Coffee Community est une application web statique pour suivre les contributions financieres d'une equipe aux achats de dosettes de cafe.

L'application permet de creer une equipe, de partager un code equipe, puis de suivre les membres, les contributions, les achats de dosettes et le solde disponible. Elle est volontairement simple : il n'y a pas de creation de compte, pas d'email, pas de mot de passe et pas d'identite locale obligatoire.

## Fonctionnement utilisateur

### 1. Creer ou rejoindre une equipe

Au premier chargement, l'utilisateur arrive directement sur le panneau **Equipe**.

Il peut :

- creer une nouvelle equipe avec un nom ;
- rejoindre une equipe existante avec son code equipe ;
- changer d'equipe via la liste des equipes deja connues par son navigateur.

Chaque equipe possede un `invite_code` genere par Supabase. Ce code est affiche dans le panneau equipe quand une equipe est active. Il suffit de le partager aux autres personnes pour qu'elles puissent rejoindre la meme equipe.

Le panneau **Equipe** est repliable avec le bouton **Masquer / Afficher**. Son etat est conserve dans le navigateur avec `localStorage`.

### 2. Ajouter les membres

Une fois une equipe active, l'utilisateur peut ajouter les membres de l'equipe. Un membre represente une personne qui contribue a la caisse cafe ou qui achete des dosettes.

Supprimer un membre reste possible. Si ce membre est deja utilise dans des contributions ou achats, l'application demande une confirmation avant suppression.

### 3. Enregistrer les contributions

Une contribution correspond a de l'argent ajoute a la caisse cafe par un membre.

Champs utilises :

- membre ;
- montant ;
- date ;
- note optionnelle.

Les contributions augmentent le total collecte et le solde de caisse.

### 4. Enregistrer les achats

Un achat correspond a une depense pour acheter des dosettes.

Champs utilises :

- montant ;
- date ;
- nombre de dosettes ;
- membre acheteur ;
- note optionnelle.

Les achats augmentent le total des achats et diminuent le solde de caisse.

### 5. Consulter le resume et l'historique

Le tableau de bord affiche :

- total collecte ;
- total des achats de dosettes ;
- solde de caisse ;
- nombre de membres.

L'historique liste toutes les lignes saisies. Il peut etre filtre par :

- tout ;
- contributions ;
- achats.

Chaque ligne d'historique peut etre supprimee avec confirmation.

### 6. Importer et exporter les donnees

Les boutons **Exporter** et **Importer** sont situes en bas de page.

- **Exporter** telecharge un fichier JSON contenant les membres et les mouvements de l'equipe active.
- **Importer** lit un fichier JSON compatible, vide les donnees de l'equipe active, puis recree les membres et les mouvements importes.

L'import est donc une operation de remplacement complet des donnees de l'equipe active.

## Persistance des donnees

Les donnees principales sont synchronisees avec Supabase :

- equipes ;
- membres ;
- contributions ;
- achats.

Le navigateur conserve aussi quelques informations locales dans `localStorage` :

- `coffee-community-active-team` : equipe active ;
- `coffee-community-known-teams` : equipes deja rejointes depuis ce navigateur ;
- `coffee-community-team-collapsed` : etat replie/deplie du panneau equipe ;
- `coffee-community-data-v6` : cache local des membres et mouvements.

Le cache local sert surtout de secours ou de transition d'affichage. La source de verite reste Supabase quand la configuration distante est disponible.

## Modele d'acces et securite

L'application ne demande aucune authentification.

Concretement :

- aucune adresse email n'est demandee ;
- aucun mot de passe n'est utilise ;
- aucune session Supabase Auth n'est creee ;
- toute personne qui possede le code d'une equipe peut rejoindre cette equipe.

Ce modele est adapte a un usage interne simple, base sur la confiance, par exemple une petite equipe qui partage une caisse cafe.

La cle publique Supabase `anonKey` est visible cote client. C'est normal pour une application frontend connectee a Supabase. La securite ne repose pas sur le secret de cette cle, mais sur les regles SQL et les fonctions exposees.

Les tables Supabase gardent Row Level Security active pour bloquer l'acces direct depuis le client. L'application passe par des fonctions RPC publiques `security definer` qui limitent les operations au `team_id` ou au `invite_code` fourni.

Limite importante : sans authentification forte, l'application ne peut pas garantir qu'une personne est bien membre legitime d'une equipe. Pour une isolation stricte par utilisateur, il faudrait remettre une authentification Supabase Auth et des policies RLS basees sur `auth.uid()` et les memberships.

## Stack technique

### Frontend

L'application est une app web statique sans framework.

Technologies utilisees :

- HTML natif dans `index.html` ;
- CSS natif dans `styles.css` ;
- JavaScript vanilla dans `app.js` ;
- Supabase JS charge depuis CDN ;
- SVG inline pour le logo cafe anime ;
- animations CSS pour la fumee du logo.

Il n'y a pas de build frontend, pas de bundler, pas de TypeScript et pas de dependances npm necessaires pour l'execution.

### Backend et base de donnees

Le backend est fourni par Supabase.

Supabase fournit :

- base PostgreSQL ;
- fonctions RPC ;
- Row Level Security ;
- realtime PostgreSQL changes pour rafraichir les membres et mouvements.

Les fonctions RPC utilisees par l'application sont notamment :

- `create_coffee_team_public(p_team_name)` ;
- `join_coffee_team_public(p_invite_code)` ;
- `get_coffee_team_public(p_team_id)` ;
- `list_coffee_members_public(p_team_id)` ;
- `list_coffee_entries_public(p_team_id)` ;
- `create_coffee_member_public(p_team_id, p_name)` ;
- `delete_coffee_member_public(p_team_id, p_member_id)` ;
- `create_coffee_entry_public(...)` ;
- `delete_coffee_entry_public(p_team_id, p_entry_id)` ;
- `clear_coffee_team_data_public(p_team_id)`.

### Deploiement

Le deploiement est fait sur Vercel.

Le projet est deploye comme site statique :

- pas de commande de build ;
- fichiers servis depuis la racine ;
- `vercel.json` configure les clean URLs, les headers et le fallback vers `index.html`.

URL de production actuelle :

```text
https://coffee-community-eight.vercel.app/
```

## Structure des fichiers

```text
.
|-- index.html            # Structure HTML de l'application
|-- styles.css            # Styles, layout responsive et animation du logo
|-- app.js                # Logique applicative, Supabase, rendu et interactions
|-- supabase-config.js    # URL Supabase et anonKey publique
|-- supabase-schema.sql   # Schema SQL et fonctions RPC Supabase
|-- Dockerfile            # Image Nginx non-root pour Kubernetes
|-- nginx.conf            # Configuration Nginx de l'image Docker
|-- .dockerignore         # Fichiers exclus du contexte Docker
|-- vercel.json           # Configuration de deploiement Vercel
|-- package.json          # Script local minimal
|-- README.md             # Documentation projet
```

## Lancer en local

Depuis la racine du projet :

```bash
python3 -m http.server 4173
```

Puis ouvrir :

```text
http://localhost:4173
```

ou :

```text
http://127.0.0.1:4173
```

Le script npm equivalent est disponible :

```bash
npm run dev
```

## Configuration Supabase

La configuration client est dans `supabase-config.js`.

```js
window.COFFEE_COMMUNITY_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "sb_publishable_...",
};
```

Pour changer de projet Supabase :

1. ouvrir Supabase ;
2. aller dans Project Settings > API ;
3. copier l'URL du projet ;
4. copier la cle publique publishable ou anon ;
5. remplacer les valeurs dans `supabase-config.js` ;
6. appliquer le schema contenu dans `supabase-schema.sql` sur le nouveau projet.

## Schema de donnees

Le schema SQL est conserve dans `supabase-schema.sql`.

Tables principales :

- `coffee_teams` : equipes et codes d'invitation ;
- `coffee_team_memberships` : table historique conservee pour compatibilite avec l'ancien modele authentifie ;
- `coffee_members` : membres d'une equipe ;
- `coffee_entries` : contributions et achats.

La colonne `type` de `coffee_entries` distingue :

- `contribution` ;
- `purchase`.

Pour une contribution, `member_id` est utilise. Pour un achat, `buyer_id` et `pods` sont utilises.

## Deployer sur Vercel

Le projet peut etre importe directement dans Vercel.

Configuration recommandee :

- Framework Preset : `Other` ;
- Build Command : vide ;
- Output Directory : vide ou racine du projet ;
- Install Command : non necessaire.

Le fichier `vercel.json` contient deja :

- `cleanUrls: true` ;
- `trailingSlash: false` ;
- headers `X-Content-Type-Options: nosniff` ;
- cache court pour `app.js`, `styles.css` et `supabase-config.js` ;
- rewrite vers `index.html`.

## Construire une image Docker

Le repo contient un `Dockerfile` permettant de construire une image OCI fonctionnelle pour un environnement cloud ou Kubernetes.

L'image utilise :

- `nginxinc/nginx-unprivileged:1.27-alpine` ;
- un utilisateur non-root fourni par l'image de base ;
- le port applicatif `8080` ;
- une route de sante `GET /healthz` ;
- un fallback `try_files` vers `index.html` ;
- des headers de base, dont `X-Content-Type-Options: nosniff` ;
- un cache court pour `app.js`, `styles.css` et `supabase-config.js`.

Construire l'image :

```bash
docker build -t coffee-community:local .
```

Lancer l'image localement :

```bash
docker run --rm -p 8080:8080 coffee-community:local
```

Puis ouvrir :

```text
http://localhost:8080
```

Verifier la route de sante :

```bash
curl http://localhost:8080/healthz
```

Exemple minimal de deploiement Kubernetes :

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coffee-community
spec:
  replicas: 2
  selector:
    matchLabels:
      app: coffee-community
  template:
    metadata:
      labels:
        app: coffee-community
    spec:
      containers:
        - name: coffee-community
          image: registry.example.com/coffee-community:latest
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            capabilities:
              drop:
                - ALL
---
apiVersion: v1
kind: Service
metadata:
  name: coffee-community
spec:
  selector:
    app: coffee-community
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

Avant de pousser vers un registre, tagger l'image selon le registre cible :

```bash
docker tag coffee-community:local registry.example.com/coffee-community:latest
docker push registry.example.com/coffee-community:latest
```

## Verification rapide

Commandes utiles avant de pousser :

```bash
node --check app.js
git diff --check
docker build -t coffee-community:local .
```

Pour tester le flux Supabase, verifier dans l'interface :

1. creer une equipe ;
2. copier le code equipe ;
3. ajouter un membre ;
4. saisir une contribution ;
5. saisir un achat ;
6. recharger la page ;
7. verifier que les donnees sont toujours presentes.

## Limites connues

- Le modele sans authentification repose sur la confidentialite du code equipe.
- Il n'y a pas de roles administrateur ou proprietaire.
- Toute personne ayant acces au code equipe peut ajouter, importer ou supprimer des donnees de cette equipe.
- L'import remplace toutes les donnees de l'equipe active.
- La table `coffee_team_memberships` reste presente pour compatibilite historique, mais le flux actuel ne l'utilise plus.
