import os
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine

# =====================================================================
# 1. CONFIGURATION DU FICHIER EXCEL ET DU MODELE
# =====================================================================

# Nom exact de ton fichier Excel local (dans le même dossier ou spécifier le chemin)
CHEMIN_EXCEL = "HVAC_Pricing_Base_MENA (1).xlsx"
NOM_FEUILLE_PANNES = "Types_Pannes_Installations"

# Modèle d'embeddings multilingue (comprend le français et les contextes régionaux)
NOM_MODELE_EMBEDDING = "paraphrase-multilingual-MiniLM-L12-v2"

# Vérification de la présence du fichier Excel avant de lancer
if not os.path.exists(CHEMIN_EXCEL):
    print(f"❌ Erreur : Le fichier '{CHEMIN_EXCEL}' est introuvable.")
    print("Veuillez placer ce script dans le même dossier que votre fichier Excel.")
    exit(1)

# =====================================================================
# 2. CHARGEMENT ET ENRICHISSEMENT DES DONNÉES (Astuce Métier)
# =====================================================================

print("📖 Lecture du fichier Excel en cours...")
try:
    # Lecture directe de la feuille Excel grâce à pandas et openpyxl
    df = pd.read_excel(CHEMIN_EXCEL, sheet_name=NOM_FEUILLE_PANNES)
except Exception as e:
    print(f"❌ Impossible de lire la feuille '{NOM_FEUILLE_PANNES}' : {e}")
    exit(1)

# Nettoyage des colonnes : on supprime les lignes entièrement vides et on remplace les NaN par du texte vide
df = df.dropna(subset=['code', 'nom_intervention'])
df = df.fillna("")

print(f"✅ {len(df)} lignes de pannes et installations chargées avec succès !")

print("🧠 Création des descriptions enrichies sémantiquement...")
# On combine la catégorie, la sous-catégorie et l'intervention pour donner un contexte maximal à l'embedding
df['texte_enrichi'] = df.apply(
    lambda r: f"Catégorie: {r['categorie']}. Sous-catégorie: {r['sous_categorie']}. Intervention: {r['nom_intervention']}.",
    axis=1
)

# =====================================================================
# 3. VECTORISATION DE LA BASE (EMBEDDINGS)
# =====================================================================

print(f"🔄 Chargement du modèle d'embedding '{NOM_MODELE_EMBEDDING}'...")
# Cette étape télécharge le modèle (~420 Mo) au premier lancement, puis l'utilise localement hors-ligne
model = SentenceTransformer(NOM_MODELE_EMBEDDING)

print("⚡ Génération des vecteurs mathématiques pour les pannes (cette étape prend quelques secondes)...")
# On transforme toutes nos super-phrases enrichies de l'Excel en vecteurs
pannes_embeddings = model.encode(df['texte_enrichi'].tolist(), show_progress_bar=True)

# On associe chaque vecteur à sa ligne d'origine dans le DataFrame
df['vector'] = list(pannes_embeddings)

# =====================================================================
# 4. MOTEUR DE RECHERCHE MATHEMATIQUE (Similitude Cosinus)
# =====================================================================

def rechercher_panne_excel(requete_client: str, top_k: int = 3):
    """Calcule la similarité entre la phrase du client et notre base de données Excel."""
    # 1. On vectorise la phrase tapée par l'utilisateur
    vecteur_client = model.encode(requete_client)
    
    scores = []
    # 2. On calcule la distance sémantique avec chaque ligne de l'Excel
    for idx, row in df.iterrows():
        # Similarité cosinus = 1 - distance de cosinus
        similarite = 1 - cosine(vecteur_client, row['vector'])
        scores.append((similarite, row['code'], row['nom_intervention'], row['categorie'], row['type_intervention']))
        
    # 3. On trie du plus proche au plus éloigné
    scores.sort(reverse=True, key=lambda x: x[0])
    return scores[:top_k]

# =====================================================================
# 5. BOUCLE DE TEST INTERACTIVE
# =====================================================================

print("\n🚀 LE MOTEUR DE RECHERCHE VECTORIEL EXCEL EST PRÊT !")
print("Vous pouvez maintenant tester des phrases réelles de vos clients.")
print("Tapez 'quit' pour arrêter le test.\n")

while True:
    phrase_test = input("Entrez une description de panne (ex: 'ca coule dehors', 'compresseur mort') : ").strip()
    if phrase_test.lower() == 'quit':
        print("Fin du test à blanc.")
        break
    if not phrase_test:
        continue
        
    print("\n🔍 Recherche sémantique dans la base Excel...")
    resultats = rechercher_panne_excel(phrase_test, top_k=3)
    
    print("\n--- 🏆 TOP 3 DES CORRESPONDANCES TROUVÉES ---")
    for i, (score, code, nom, cat, type_int) in enumerate(resultats, 1):
        # Un score > 0.45 indique généralement une bonne correspondance sémantique
        status_fiabilite = "🟢 Fiable" if score > 0.50 else "🟡 Moyen (à vérifier)" if score > 0.38 else "🔴 Faible (Hors catalogue ?)"
        print(f"Top {i} : [{code}] - {nom}")
        print(f"      Catégorie : {cat} | Type : {type_int}")
        print(f"      Score de proximité mathématique : {score:.4f} ({status_fiabilite})")
        print("-" * 65)
    print("\n")

