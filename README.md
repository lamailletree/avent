# Calendrier des énigmes

Le mois se choisit au-dessus du calendrier. Le nombre de jours et leur
position dans la semaine sont calculés automatiquement (28 à 31 jours).

## Images

- `fond-calendrier.svg` est le fond de secours, sans cases.
- Les exemples de cases sont `cases/1.png` et `cases/2.png`. Les fichiers
  locaux restent affichés si aucun visuel n’a été téléversé dans Drive.
- Les énigmes ouvertes au clic restent dans `enigme/`, nommées par numéro.
  Les fichiers `.png` et `.jpg` sont acceptés.

## Administration gratuite avec Google Drive

La connexion utilise Google Identity Services et les images sont stockées dans
un dossier Google Drive dédié. Le projet n’utilise **ni Firebase, ni Storage,
ni Firestore, ni base de données applicative**. Un petit fichier
`calendar-index.json` conserve les identifiants des images ; c’est un manifeste,
pas une base de données.

Les images sont nommées `AAAA-MM-fond` et `AAAA-MM-case-N.png`. Le dossier est
partagé en lecture avec toute personne ayant le lien afin que le calendrier
public puisse afficher les images. Les téléversements restent réservés au
compte `lamaille35@gmail.com`. Les images de fond acceptées sont PNG, JPEG ou
WebP ; les images de case sont PNG. La taille maximale est de 10 Mo par fichier.
Le stockage utilise l’espace Drive du compte (15 Go gratuits pour un compte
Google personnel, partagés avec Gmail et Photos).

### Configuration initiale

1. Dans Google Cloud Console, crée ou sélectionne un projet et active
   **Google Drive API**. Cette solution n’utilise pas Firebase Storage et ne
   nécessite pas d’activer la facturation.
2. Configure l’écran de consentement OAuth et ajoute le scope
   `https://www.googleapis.com/auth/drive.file`. Si l’application est en mode
   test, ajoute `lamaille35@gmail.com` parmi les utilisateurs de test.
3. Crée un identifiant client OAuth de type **Application Web**. Ajoute le
   domaine du site aux origines JavaScript autorisées (et `http://localhost`
   pour un essai local).
4. Crée une clé API, restreins-la à **Google Drive API** et au domaine du site
   (référents HTTP). Cette clé est publique côté navigateur ; ne l’utilise pas
   comme secret.
5. Renseigne `clientId` et `googleDriveApiKey` dans `google-config.js`.
   Laisse `googleDriveFolderId` et `googleDriveManifestId` vides au premier
   déploiement.
6. Sers le site via HTTP/HTTPS, ouvre **Administration** et connecte-toi avec
   `lamaille35@gmail.com`. Clique **Créer le dossier public**.
7. Copie les deux identifiants affichés dans `google-config.js`, redéploie le
   site, puis reconnecte-toi pour téléverser les images par mois.

Le dossier dédié et ses images sont publics en lecture : n’y place aucun
document privé. Les modifications nécessitent un jeton Google associé au
compte administrateur. L’API Drive ne facture pas les téléversements, mais
reste soumise aux quotas d’API et à l’espace disponible dans le compte Google.

Pour tester les modules JavaScript localement, sers le dossier via HTTP plutôt
que d’ouvrir `index.html` directement, par exemple avec `python -m http.server`.
