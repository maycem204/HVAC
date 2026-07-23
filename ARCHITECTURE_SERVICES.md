# Abstraction des services externes

Cette architecture garde les routes HTTP et les formats de données existants. Les couches métier
ne connaissent plus les SDK ou protocoles propres aux fournisseurs.

## IA

- `backend/config/external-services.js` résout `AI_PROVIDER` et les paramètres du fournisseur.
- `backend/services/ai-service.js` expose uniquement `extract`, `redact` et `judge`.
- `backend/providers/ai/factory.js` sélectionne DeepSeek, OpenAI ou Anthropic/Claude.
- `backend/services/llm/factory.js` reste une façade compatible avec les anciens imports.

Pour changer de fournisseur, renseigner `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL` et `AI_MODEL`.
Les anciennes variables `LLM_*` restent acceptées pour les déploiements existants.

## Embeddings

- `backend/services/embedding-service.js` prépare les requêtes, normalise les vecteurs et expose
  la méthode stable `embed`.
- `backend/providers/embeddings/` contient les adaptateurs Gemini et OpenAI-compatible.
- `backend/services/pricing/embedding-client.js` reste un alias compatible.

La production Render utilise actuellement `gemini-embedding-2`. Le mode `openai-compatible`
fonctionne avec OpenAI, BGE-M3, TEI, vLLM ou un serveur local compatible avec `/v1/embeddings`.
La dimension demeure 1024 pour rester compatible avec les colonnes pgvector existantes.

## Cartographie et géocodage

- `frontend/src/config/maps.ts` centralise les tuiles et les directions.
- `frontend/src/services/map-service.ts` fournit l’URL d’itinéraire au reste du frontend.
- `frontend/src/providers/maps/` contient les adaptateurs Leaflet et Google Directions.
- `backend/services/geocoding.js` est la façade stable de géocodage.
- `backend/providers/maps/` contient l’adaptateur Nominatim.

Les tuiles se changent avec `VITE_MAP_TILE_URL` et `VITE_MAP_TILE_ATTRIBUTION`. Ajouter l’origine
du nouveau serveur dans `MAP_TILE_ORIGINS` permet à la politique CSP de charger ses images.
Un fournisseur de directions ou de géocodage supplémentaire s’ajoute dans son dossier `providers`
et dans la factory correspondante, sans modifier les routes API.
