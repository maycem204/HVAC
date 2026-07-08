# HVAC Services Platform

Plateforme moderne de mise en relation clients et techniciens pour les services HVAC (chauffage, ventilation, climatisation).

## Fonctionnalités

- **Espace Client**: Chatbot intelligent pour diagnostiquer les problèmes HVAC et obtenir des devis
- **Espace Technicien**: Gestion des rendez-vous, upload de grilles tarifaires PDF (optionnel)
- **Sélection de région**: Choix par écrit ou via interface de sélection
- **Système de rendez-vous**: Les clients peuvent planifier des interventions via le chatbot
- **Design moderne**: Interface utilisateur moderne avec TailwindCSS et composants shadcn/ui

## Technologies

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: FastAPI (Python)
- **Base de données**: Supabase
- **Authentification**: Supabase Auth
- **UI Components**: shadcn/ui (custom implementation)
- **Icons**: Lucide React

## Installation

1. Installer les dépendances frontend:
```bash
cd frontend
npm install
```

2. Configurer Supabase:
   - Créer un fichier `.env` dans le dossier `frontend/`
   - Ajouter votre clé Supabase anon:
   ```
   VITE_SUPABASE_ANON_KEY=votre-clé-anon-supabase
   ```

3. Installer les dépendances backend:
```bash
cd ..
pip install -r requirements.txt
```

## Lancement

### Frontend (React)
```bash
cd frontend
npm run dev
```
L'application sera disponible sur http://127.0.0.1:5174

### Backend (FastAPI)
```bash
uvicorn main:app --reload
```
L'API sera disponible sur http://localhost:8000

## Structure du projet

```
frontend/
├── src/
│   ├── components/ui/    # Composants UI réutilisables
│   ├── lib/              # Utilitaires (Supabase, utils)
│   ├── pages/            # Pages principales
│   │   ├── HomePage.jsx       # Page d'accueil avec auth
│   │   ├── ClientDashboard.jsx # Espace client avec chatbot
│   │   └── TechnicianDashboard.jsx # Espace technicien
│   ├── App.jsx           # Application principale avec routing
│   └── index.css         # Styles globaux
├── tailwind.config.js    # Configuration Tailwind
└── package.json

main.py                   # API FastAPI
persistence/              # Gestion des données
services/                # Services métier
pricing/                 # Calcul des prix
llm/                     # Intégration LLM
```

## Configuration Supabase

L'application utilise Supabase pour l'authentification. Assurez-vous de:

1. Créer un projet sur https://supabase.com
2. Configurer l'authentification email/password
3. Créer une table `profiles` avec les colonnes:
   - id (UUID, référence auth.users)
   - full_name (text)
   - email (text)
   - role (text: 'client' ou 'technician')
   - region (text)
   - region_coordinates (json, optionnel)

## Développement

### Ajouter de nouvelles fonctionnalités

1. **Nouvelle page**: Créer un fichier dans `src/pages/`
2. **Nouveau composant**: Créer dans `src/components/ui/`
3. **Nouvelle route**: Ajouter dans `App.jsx`
4. **Nouvelle API endpoint**: Ajouter dans `main.py`

### Styles

L'application utilise TailwindCSS avec un thème personnalisé. Les couleurs sont définies dans `tailwind.config.js` et `src/index.css`.
