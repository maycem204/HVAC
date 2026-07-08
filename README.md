# HVAC Quote Chatbot

Application FastAPI qui combine:
- un chatbot de devis HVAC,
- une extraction LLM/heuristique,
- deux interfaces de connexion (client et technicien),
- upload PDF des tarifs technicien,
- scraping des prix web par région pour comparer client/technicien.

## Lancer le projet

1. (Optionnel) Renseigner `ANTHROPIC_API_KEY` dans `.env`.
2. Installer les dépendances avec `pip install -r requirements.txt`.
3. Démarrer l'application avec `uvicorn main:app --reload`.
4. Ouvrir `http://localhost:8000`.

Si la clé Anthropic est absente ou invalide, l'application passe en extraction de secours et l'interface l'indique explicitement.

## Routes utiles

- `GET /` page du chatbot
- `POST /chat` réponse conversationnelle
- `POST /quote` estimation structurée
- `GET /health` vérification rapide
- `POST /auth/register` création compte client/technicien
- `POST /auth/login` connexion client/technicien
- `GET /me` profil courant (Bearer token)
- `POST /technician/upload-price-pdf` upload PDF technicien
- `GET /technician/pdfs` liste des PDF d'un technicien
- `GET /technician/price-rules` lire les règles de prix extraites
- `POST /technician/price-rules` modifier manuellement les règles de prix
- `GET /market/prices` scraping prix par région du profil connecté (+ région tierce optionnelle)
- `POST /outcomes/record` enregistrement d'un devis conclu
- `GET /outcomes?type_panne=...&region=...` lecture des historiques
