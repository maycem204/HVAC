# QuoteAI HVAC

Plateforme de devis assisté par IA, de planification et de mise en relation entre clients et techniciens HVAC.

## Fonctionnalités principales

- diagnostic conversationnel en français et en arabe ;
- devis régionalisé dans la devise locale à partir d'un catalogue contrôlé ;
- classement des techniciens par spécialité, disponibilité et distance ;
- rendez-vous, agenda, leads, notifications et messagerie en temps réel ;
- grilles tarifaires importables depuis CSV, Excel ou PDF texte ;
- avis clients et suivi du prix réel des interventions.

## Architecture

- Backend unique Node.js/Express.
- PostgreSQL avec pgvector comme source de vérité tarifaire.
- DeepSeek extrait les paramètres, rédige le devis et contrôle sa fidélité. Il ne calcule jamais un prix.
- Un fournisseur configurable génère les embeddings multilingues : serveur local compatible OpenAI par défaut, ou Gemini sur Render.
- Le moteur JavaScript applique une formule déterministe et auditée.
- Socket.IO diffuse les messages et mises à jour sur le même serveur HTTP.

Le flux est exposé par `POST /api/pricing/quote`. Les scores inférieurs à 0,50 et les pannes des services IA sont transférés vers le traitement humain. Après trois rejets du texte par le juge, le calcul validé est présenté avec un rendu déterministe.

## Prérequis

- Node.js 22 recommandé et npm ;
- PostgreSQL avec les extensions `vector` et `unaccent` ;
- une clé pour le fournisseur LLM sélectionné ;
- un service d'embeddings compatible avec la configuration choisie ;
- Docker, facultatif, pour les services locaux ou le déploiement.

## Installation locale

1. Installer les dépendances :

   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```

2. Copier `.env.example` vers `.env` à la racine et remplacer les valeurs de démonstration, notamment `DATABASE_URL`, `JWT_SECRET` et la clé LLM.
3. Créer la base PostgreSQL et initialiser le schéma :

   ```bash
   npm run backend:db:init
   ```

4. Importer le catalogue, puis générer ses embeddings :

   ```bash
   npm --prefix backend run pricing:import
   npm --prefix backend run pricing:embed
   ```

5. Dans deux terminaux, lancer l'API et le frontend :

   ```bash
   npm run backend:dev
   npm run frontend
   ```

Par défaut, l'API écoute sur `http://127.0.0.1:5000` et Vite sur `http://127.0.0.1:5174`.

## Installation du pricing

Après l'import, PostgreSQL devient la source de vérité tarifaire. Le classeur Excel n'est jamais lu pendant une requête client. Il faut le réimporter uniquement lorsque le catalogue source change, puis régénérer les embeddings.

### Serveur d'embeddings local

Le backend attend l'API OpenAI `POST /v1/embeddings` sur le port 8081 (le port 8080 est utilisé par EnterpriseDB). Avec un GPU NVIDIA, lancer Qwen3 via Hugging Face Text Embeddings Inference :

```bash
docker run --gpus all -p 8081:80 -v hf_cache:/data ghcr.io/huggingface/text-embeddings-inference:1.9 --model-id Qwen/Qwen3-Embedding-8B --dtype float16
```

Sans GPU, utiliser l'image CPU et BGE-M3, puis remplacer `EMBEDDING_MODEL` dans `.env` :

```bash
docker run --name quoteai_embeddings_bge_lean --restart unless-stopped -p 8081:80 -v hf_cache:/data ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 --model-id BAAI/bge-m3 --tokenization-workers 2 --max-concurrent-requests 16 --max-batch-tokens 2048 --max-client-batch-size 16
```

```dotenv
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_QUERY_INSTRUCTION=
```

Si Docker dispose de moins de 12 Go de mémoire, utiliser `multilingual-e5-large-instruct`, officiellement pris en charge par TEI CPU et dont la dimension native est déjà 1024 :

```bash
docker run -p 8081:80 -v hf_cache:/data ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 --model-id intfloat/multilingual-e5-large-instruct --tokenization-workers 2 --max-batch-tokens 4096
```

```dotenv
EMBEDDING_MODEL=intfloat/multilingual-e5-large-instruct
EMBEDDING_QUERY_INSTRUCTION=Retrieve the HVAC fault catalog entry that best matches the user request
```

Après chaque changement de modèle ou de dimension, relancer `npm --prefix backend run pricing:embed`. Les vecteurs sont ramenés à 1024 dimensions et normalisés côté backend pour rester compatibles avec le schéma pgvector.

Sur CPU, les embeddings utilisent des lots de 8 documents et un délai maximal de 180 secondes, configurables avec `EMBEDDING_BATCH_SIZE` et `EMBEDDING_TIMEOUT_MS`.

### Cohérence conversationnelle et prix minimums

Le chat transmet les dix derniers messages au moteur afin de résoudre les réponses courtes dans leur contexte. Une demande d'aide simple, par exemple l'accès à un filtre sale, reçoit des consignes d'entretien avant toute proposition commerciale. Un devis n'est calculé que lorsque le client demande réellement une intervention.

Les petites interventions utilisent un plancher local de déplacement afin d'éviter les montants artificiellement bas. Les calibrations initiales sont de 2 500 DZD en Algérie (tarif public de nettoyage à Alger, 2026) et 45 TND en Tunisie (fourchette publique de 40 à 65 TND, 2025-2026). Elles sont stockées dans `pricing_service_minimums` et restent modifiables sans toucher au moteur de calcul.

Si la rédaction produite par le LLM échoue trois fois au contrôle de fidélité, le backend génère un texte déterministe à partir du calcul validé. Le client conserve ainsi une estimation cohérente au lieu de recevoir un faux échec technique.

### Import de la grille d'un technicien

L'espace technicien accepte les fichiers CSV, Excel `.xlsx`/`.xlsm` et les PDF contenant du texte sélectionnable, jusqu'à 5 Mo. L'extraction recherche automatiquement les variantes françaises et anglaises des colonnes `Service`/`Prestation`, `Prix`/`Tarif`, `Unité` et `Catégorie`, même lorsque l'en-tête n'est pas sur la première ligne. Les PDF constitués uniquement d'images nécessitent d'abord une reconnaissance OCR.
## Fournisseur LLM interchangeable

Le moteur de tarification dépend uniquement de l'interface `extract()`, `redact()` et `judge()`. Les adaptateurs DeepSeek, OpenAI et Anthropic se sélectionnent sans modifier l'orchestrateur :

```env
LLM_PROVIDER=deepseek # deepseek | openai | anthropic
LLM_API_KEY=...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

Pour OpenAI, utilisez une base terminant par `/v1`; pour Anthropic, `https://api.anthropic.com/v1`. Les anciennes variables `DEEPSEEK_*`, ainsi que les variables `OPENAI_*` et `ANTHROPIC_*`, restent disponibles comme valeurs de repli spécifiques au fournisseur.

## Vérification

```bash
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Déploiement

L'application dispose d'une image Docker multi-étapes : le frontend Vite est compilé puis servi par Express, avec Socket.IO sur le même domaine. Le point de contrôle est `GET /health`.

1. Créer une base PostgreSQL avec l'extension pgvector et exécuter `npm run backend:db:init`.
2. Définir au minimum `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `LLM_PROVIDER`, `LLM_API_KEY`, `EMBEDDING_PROVIDER`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL` et, si nécessaire, `EMBEDDING_API_KEY`.
3. Construire l'image avec `docker build -t quoteai-hvac .`.
4. Lancer avec `docker run --env-file .env.production -p 5000:5000 quoteai-hvac`.

Le fichier `render.yaml` permet également un déploiement Blueprint sur Render. Au démarrage, le conteneur initialise le schéma, charge les comptes de démonstration et importe le catalogue avant de lancer l'indexation en arrière-plan. Les secrets marqués `sync: false` doivent être renseignés dans le tableau de bord. Ne déployez jamais le fichier `.env` local.
