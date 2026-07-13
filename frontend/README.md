# HVAC Frontend

Frontend React + Vite + TailwindCSS pour la plateforme HVAC.

## Architecture

Le frontend doit appeler une seule API via `VITE_API_URL`.

API de production : Node/Express + PostgreSQL/pgvector sur `http://127.0.0.1:5000`.
Le frontend ne doit appeler ni DeepSeek ni le serveur d'embeddings directement.

## Installation

```bash
npm install
```

## Configuration

Seule `VITE_API_URL` est autorisée côté navigateur. Placez `DEEPSEEK_API_KEY` et
la configuration d'embeddings dans le fichier `.env` à la racine du projet, jamais dans
`frontend/.env` et jamais dans une variable préfixée par `VITE_`.

Créer `frontend/.env` a partir de `frontend/.env.example`.

```bash
VITE_API_URL=http://127.0.0.1:5000
```

## Lancement

```bash
npm run dev
```

L'application est servie par defaut sur `http://127.0.0.1:5174`.
