# HVAC Quote Platform

Plateforme de devis et de mise en relation HVAC.

## Architecture

- Backend unique Node.js/Express.
- PostgreSQL avec pgvector comme source de vérité tarifaire.
- DeepSeek extrait les paramètres, rédige le devis et contrôle sa fidélité. Il ne calcule jamais un prix.
- Qwen3-Embedding-8B génère localement les embeddings multilingues via un serveur compatible OpenAI.
- Le moteur JavaScript applique une formule déterministe et auditée.

Le flux est exposé par `POST /api/pricing/quote`. Les scores inférieurs à 0,50 et les devis rejetés trois fois par le juge sont transférés à un technicien.

## Installation du pricing

1. Copier `.env.example` vers `.env` à la racine.
2. Ajouter `DEEPSEEK_API_KEY` dans `.env`. Les embeddings locaux ne nécessitent pas de clé API.
3. Lancer PostgreSQL avec pgvector sur le port 5433, puis exécuter `npm run backend:db:init`.
4. Importer une seule fois le classeur avec `node backend/scripts/import-pricing-xlsx.js "HVAC_Pricing_Base_MENA (1).xlsx"`.
5. Générer les embeddings avec `npm --prefix backend run pricing:embed`.
6. Démarrer avec `npm run backend` et `npm run frontend`.

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

Après l'import, PostgreSQL est la source de vérité. Le classeur Excel n'est jamais lu pendant une requête client.

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

## Déploiement

L'application dispose d'une image Docker multi-étapes : le frontend Vite est compilé puis servi par Express, avec Socket.IO sur le même domaine. Le point de contrôle est `GET /health`.

1. Créer une base PostgreSQL avec l'extension pgvector et exécuter `npm run backend:db:init`.
2. Définir au minimum `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `LLM_PROVIDER`, `LLM_API_KEY` et `EMBEDDING_BASE_URL`.
3. Construire l'image avec `docker build -t quoteai-hvac .`.
4. Lancer avec `docker run --env-file .env.production -p 5000:5000 quoteai-hvac`.

Le fichier `render.yaml` permet également un déploiement Blueprint sur Render. Les secrets marqués `sync: false` doivent être renseignés dans le tableau de bord. Ne déployez jamais le fichier `.env` local.
