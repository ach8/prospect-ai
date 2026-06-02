# Accès au Serveur VPS (Production)

Ce fichier permet de garder en mémoire les informations d'accès au serveur VPS pour les déploiements et la maintenance.

- **IP du serveur** : `69.62.125.13`
- **Utilisateur** : `root`
- **Commande de connexion SSH** : `ssh root@69.62.125.13`
- **Chemin du projet sur le VPS** : `/root/prospect-ai`

*Note pour l'IA (Antigravity)* : Lors des déploiements, tu peux exécuter directement des commandes via SSH comme par exemple : `ssh root@69.62.125.13 "cd /root/prospect-ai && git pull origin main && docker compose up -d --build"`
