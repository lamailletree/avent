# Calendrier des énigmes

Le mois se choisit au-dessus du calendrier. Le nombre de jours et leur
position dans la semaine sont calculés automatiquement (28 à 31 jours).

## Images

- `fond-calendrier.svg` est le fond de secours, sans cases.
- Les exemples de cases sont `cases/1.png` et `cases/2.png`. Les fichiers
  locaux restent affichés si aucun visuel n’a été téléversé dans Drive.
- Les fichiers locaux des énigmes restent dans `enigme/`, nommés par numéro,
  comme solution de secours. Les formats `.png` et `.jpg` sont acceptés.
  Les énigmes peuvent aussi être téléversées depuis l’administration ; la version
  Drive est prioritaire sur le fichier local.

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
WebP ; les images de case sont PNG et les énigmes PNG ou JPEG. La taille
maximale est de 10 Mo par fichier.

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
   site, puis reconnecte-toi pour téléverser les images du calendrier et les
   énigmes numérotées.

L’administration est accessible depuis le menu supérieur, sur `admin.html`.
Après connexion, elle permet de parcourir les dossiers et fichiers du dossier
Drive configuré, ainsi que d’ajouter ou de supprimer les fonds, les cases et
les énigmes.

### Énigmes générées et partagées

Quand une énigme manque pour aujourd’hui ou une date passée, le premier
visiteur peut choisir une énigme modèle ou Gemini. Le navigateur demande alors
la permission de localisation (avec une précision GPS de 250 m ou moins), ou
permet de rechercher une adresse en France et de choisir un point sur la carte.
La recherche d’adresse et le fond de carte utilisent la Géoplateforme de l’IGN.
Avec le GPS, le serveur cherche un lieu de plein air dans OpenStreetMap à une
distance maximale d’un kilomètre. Avec un point choisi manuellement, le mode
modèle cherche un point d’intérêt naturel dans la Géoplateforme à moins de
500 mètres, sans appeler OpenStreetMap ; le mode Gemini appelle directement
Gemini sans recherche de lieu dans un autre service cartographique.
L’énigme est ensuite enregistrée par date dans Upstash Redis : le même texte et
le même lieu s’affichent à tous les visiteurs, même s’ils vivent ailleurs.
La position GPS n’est pas enregistrée dans le puzzle. S’il n’y a pas de lieu
approprié, la génération échoue plutôt que de proposer un lieu urbain. Les
services de géocodage, de tuiles et de points d’intérêt restent soumis à leurs
conditions d’usage et à leur disponibilité ; la couverture IGN peut varier.

Pour activer ce comportement sur Vercel :

1. Crée une base Redis Upstash et renseigne `UPSTASH_REDIS_REST_URL` et
   `UPSTASH_REDIS_REST_TOKEN` dans les variables d’environnement Vercel.
2. Pour le choix Gemini, crée une clé Google AI Studio et ajoute
   `GEMINI_API_KEY` à Vercel. La clé reste côté serveur. Choisis également un
   identifiant de modèle accessible dans ton compte et configure `GEMINI_MODEL`.
3. Redéploie le site. Les tests locaux nécessitent `vercel dev` pour exécuter
   `/api/enigma`.

Upstash propose une offre gratuite avec des quotas ([tarifs](https://upstash.com/pricing/redis);
actuellement 250 Mo de données, 10 Go de bande passante et 500 000 commandes
par mois). Le quota gratuit de Gemini dépend du modèle et peut changer
([tarifs](https://ai.google.dev/gemini-api/docs/pricing)) ; Google indique que
les données de l’offre gratuite peuvent servir à améliorer ses produits. Le
choix Gemini demande donc une confirmation avant l’envoi du nom et du type du
lieu à Google. L’option modèle n’envoie pas ces données à Gemini. Les services
publics OpenStreetMap sont soumis à leurs règles d’usage et sans garantie de
disponibilité. Les cartes et résultats sont attribués selon leur source :
[contributeurs OpenStreetMap](https://www.openstreetmap.org/copyright) pour le
parcours GPS, ou [Géoplateforme](https://cartes.gouv.fr/cgu) pour le parcours
manuel.

Les puzzles partagés sont conservés sans date d’expiration dans Redis. Le
premier visiteur qui crée l’énigme d’une date choisit donc le lieu et le mode
de génération pour tous les autres visiteurs de cette date.

Le dossier dédié et ses images sont publics en lecture : n’y place aucun
document privé. Les modifications nécessitent un jeton Google associé au
compte administrateur. L’API Drive ne facture pas les téléversements, mais
reste soumise aux quotas d’API et à l’espace disponible dans le compte Google.

Pour tester les modules JavaScript localement, sers le dossier via HTTP plutôt
que d’ouvrir `index.html` directement, par exemple avec `python -m http.server`.
