const caseImages = new Map([
  [1, "cases/1.png"],
  [2, "cases/2.png"],
]);

const calendarTitle = document.querySelector("#calendar-title");
const calendarGrid = document.querySelector("#calendar-grid");
const boardImage = document.querySelector(".board-image");
const calendarStatus = document.querySelector("#calendar-status");
const monthPickerLabel = document.querySelector("#month-picker-label");
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modal-title");
const modalImage = document.querySelector("#enigma-image");
const modalMessage = document.querySelector("#modal-message");
const closeButton = document.querySelector("#close-button");
const imageFrame = document.querySelector(".image-frame");
const generatedEnigma = document.querySelector("#generated-enigma");
const enigmaGenerationMode = document.querySelector("#enigma-generation-mode");
const generateEnigmaButton = document.querySelector("#generate-enigma");
const geminiConsent = document.querySelector("#gemini-consent");
const manualLocationForm = document.querySelector("#manual-location-form");
const manualLocationQuery = document.querySelector("#manual-location-query");
const manualLocationSearchButton = document.querySelector("#manual-location-search-button");
const manualLocationStatus = document.querySelector("#manual-location-status");
const manualLocationResults = document.querySelector("#manual-location-results");
const manualLocationSelection = document.querySelector("#manual-location-selection");
const generatedEnigmaStatus = document.querySelector("#generated-enigma-status");
const generatedEnigmaResult = document.querySelector("#generated-enigma-result");
const generatedEnigmaText = document.querySelector("#generated-enigma-text");
const generatedEnigmaPlace = document.querySelector("#generated-enigma-place");
const generatedPlaceLink = document.querySelector("#generated-place-link");
const placeAttribution = document.querySelector("#place-attribution");
const imageByNumber = new Map();
let cloudEnigmaImages = new Map();
let googleDriveServicePromise;
let lastFocusedElement = null;
let calendarRenderId = 0;
let selectedEnigmaDate = null;
let generationInProgress = false;
let manualLocationMap = null;
let manualLocationMarker = null;
let selectedManualLocation = null;

const today = new Date();
let selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
document.querySelector("#previous-month").addEventListener("click", () => changeMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => changeMonth(1));
document.querySelector("#current-month").addEventListener("click", () => {
  selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  renderCalendar();
});
renderCalendar();

generateEnigmaButton.addEventListener("click", () => generateSharedEnigma(enigmaGenerationMode.value));
enigmaGenerationMode.addEventListener("change", updateGenerateButton);
manualLocationForm.addEventListener("submit", searchManualLocation);
geminiConsent.addEventListener("change", updateGenerateButton);

function updateGenerateButton() {
  generateEnigmaButton.disabled = generationInProgress
    || (enigmaGenerationMode.value === "gemini" && !geminiConsent.checked);
}

async function getGoogleDriveService() {
  if (!googleDriveServicePromise) {
    googleDriveServicePromise = import("./google-config.js").then(({ googleConfig }) => {
      const requiredKeys = ["clientId", "googleDriveApiKey"];
      const configured = requiredKeys.every((key) => (
        typeof googleConfig[key] === "string"
        && googleConfig[key].length > 0
        && !googleConfig[key].startsWith("REMPLACER")
      ));
      return configured ? import("./google-drive.js") : null;
    });
  }
  return googleDriveServicePromise;
}

function renderCalendar() {
  const renderId = ++calendarRenderId;
  const [year, month] = selectedMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const numberOfDays = new Date(year, month, 0).getDate();
  const firstDayOffset = (date.getDay() + 6) % 7;

  const formattedMonth = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
  calendarTitle.textContent = formattedMonth;
  monthPickerLabel.textContent = formattedMonth;
  calendarGrid.replaceChildren();

  for (const weekday of ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]) {
    const heading = document.createElement("span");
    heading.className = "weekday";
    heading.setAttribute("aria-hidden", "true");
    heading.textContent = weekday;
    calendarGrid.append(heading);
  }

  for (let index = 0; index < firstDayOffset; index += 1) {
    const emptyDay = document.createElement("span");
    emptyDay.className = "empty-day";
    emptyDay.setAttribute("aria-hidden", "true");
    calendarGrid.append(emptyDay);
  }

  for (let number = 1; number <= numberOfDays; number += 1) {
    addCase(number);
  }

  void updateCloudAssets(selectedMonth, numberOfDays, renderId);
}

function changeMonth(offset) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  selectedMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  renderCalendar();
}

async function updateCloudAssets(monthKey, numberOfDays, renderId) {
  try {
    const service = await getGoogleDriveService();
    if (!service) {
      cloudEnigmaImages = new Map();
      boardImage.src = "fond-calendrier.svg";
      boardImage.dataset.cloud = "false";
      for (const button of calendarGrid.querySelectorAll(".case-button")) {
        void updateEnigmaButton(button, Number(button.dataset.day));
      }
      return;
    }
    const assets = await service.loadMonthAssets(monthKey, numberOfDays);
    if (renderId !== calendarRenderId) return;

    cloudEnigmaImages = assets.enigmas;
    boardImage.dataset.cloud = String(Boolean(assets.background));
    boardImage.src = assets.background ?? "fond-calendrier.svg";
    for (const button of calendarGrid.querySelectorAll(".case-button")) {
      const day = Number(button.dataset.day);
      const image = button.querySelector(".case-image");
      const imageUrl = assets.cases.get(day);
      if (imageUrl && image) {
        image.dataset.cloud = "true";
        image.src = imageUrl;
      }
      void updateEnigmaButton(button, day);
    }
    calendarStatus.hidden = true;
  } catch (error) {
    if (renderId !== calendarRenderId) return;
    cloudEnigmaImages = new Map();
    boardImage.dataset.cloud = "false";
    boardImage.src = "fond-calendrier.svg";
    for (const button of calendarGrid.querySelectorAll(".case-button")) {
      void updateEnigmaButton(button, Number(button.dataset.day));
    }
    calendarStatus.textContent = `Les images du mois n’ont pas pu être chargées : ${error.message}. Les exemples locaux sont affichés.`;
    calendarStatus.hidden = false;
  }
}

boardImage.addEventListener("error", () => {
  if (boardImage.dataset.cloud === "true") {
    boardImage.dataset.cloud = "false";
    boardImage.src = "fond-calendrier.svg";
    calendarStatus.textContent = "Le fond de ce mois est référencé dans Drive, mais le navigateur n’a pas pu afficher son image.";
    calendarStatus.hidden = false;
  }
});

async function addCase(number) {
  const caseButton = document.createElement("button");
  caseButton.className = "case-button";
  caseButton.type = "button";
  caseButton.dataset.day = number;
  caseButton.setAttribute("aria-label", `Jour ${number}, vérification de l’énigme en cours`);
  caseButton.disabled = true;

  const caseImage = document.createElement("img");
  caseImage.className = "case-image";
  caseImage.alt = "";
  caseImage.addEventListener("error", () => {
    if (caseImage.dataset.cloud === "true") {
      caseImage.dataset.cloud = "false";
      caseImage.src = caseImages.get(number) ?? `cases/${number}.png`;
    } else {
      caseImage.remove();
    }
  });
  caseImage.src = caseImages.get(number) ?? `cases/${number}.png`;

  const dayNumber = document.createElement("span");
  dayNumber.className = "day-number";
  dayNumber.setAttribute("aria-hidden", "true");
  dayNumber.textContent = number;
  caseButton.append(caseImage, dayNumber);
  calendarGrid.append(caseButton);

  void updateEnigmaButton(caseButton, number);
}

async function updateEnigmaButton(caseButton, number) {
  const extension = await findEnigmaImage(number);
  if (!caseButton.isConnected) return;
  const cloudImage = cloudEnigmaImages.get(number);
  const localImage = extension ? `enigme/${number}${extension}` : null;
  const imageUrl = cloudImage ?? localImage;
  const canGenerate = isPastOrCurrentDay(number);
  caseButton.disabled = !imageUrl && !canGenerate;
  caseButton.setAttribute(
    "aria-label",
    imageUrl
      ? `Ouvrir l’énigme ${number}`
      : canGenerate
        ? `Créer une énigme pour le jour ${number}`
        : `Jour ${number}, énigme indisponible`,
  );
  caseButton.title = imageUrl
    ? `Ouvrir l’énigme ${number}`
    : canGenerate
      ? `Créer une énigme nature pour le jour ${number}`
      : `L’énigme ${number} n’est pas encore disponible`;

  caseButton.onclick = imageUrl
    ? () => openEnigma(number, imageUrl, caseButton, cloudImage ? localImage : null)
    : canGenerate
      ? () => openEnigmaGenerator(number)
      : null;
}

function isPastOrCurrentDay(number) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, number);
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  return selectedDate <= currentDate;
}

function openEnigmaGenerator(number) {
  lastFocusedElement = calendarGrid.querySelector(`[data-day="${number}"]`);
  const [year, month] = selectedMonth.split("-").map(Number);
  selectedEnigmaDate = `${year}-${String(month).padStart(2, "0")}-${String(number).padStart(2, "0")}`;
  modalTitle.textContent = `Énigme ${number}`;
  imageFrame.hidden = true;
  modalImage.hidden = true;
  modalMessage.hidden = true;
  generatedEnigma.hidden = false;
  generatedEnigmaResult.hidden = true;
  generatedEnigmaStatus.hidden = true;
  generatedEnigmaStatus.textContent = "";
  manualLocationForm.reset();
  manualLocationResults.replaceChildren();
  manualLocationResults.hidden = true;
  manualLocationStatus.textContent = "";
  manualLocationStatus.hidden = true;
  manualLocationSelection.textContent = "";
  manualLocationSelection.hidden = true;
  selectedManualLocation = null;
  updateGenerateButton();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  initializeManualLocationMap();
  closeButton.focus();
}

function initializeManualLocationMap() {
  if (typeof L === "undefined") {
    manualLocationStatus.textContent = "La carte n’a pas pu être chargée. Tu peux tout de même chercher et choisir une adresse.";
    manualLocationStatus.hidden = false;
    return;
  }

  if (!manualLocationMap) {
    manualLocationMap = L.map("manual-location-map", { scrollWheelZoom: false })
      .setView([46.6, 2.4], 6);
    L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}", {
      minZoom: 6,
      maxZoom: 16,
      attribution: '&copy; <a href="https://cartes.gouv.fr/cgu">IGN - Géoplateforme</a>',
    }).addTo(manualLocationMap);
    manualLocationMap.on("click", (event) => {
      setManualLocation(event.latlng.lat, event.latlng.lng, "Point choisi sur la carte", false);
    });
  } else {
    manualLocationMap.setView([46.6, 2.4], 6);
    if (manualLocationMarker) {
      manualLocationMap.removeLayer(manualLocationMarker);
      manualLocationMarker = null;
    }
  }

  selectedManualLocation = null;
  requestAnimationFrame(() => manualLocationMap.invalidateSize());
}

function setManualLocation(latitude, longitude, label, moveMap = true) {
  selectedManualLocation = { latitude, longitude, accuracy: 0 };
  if (manualLocationMap) {
    const position = [latitude, longitude];
    if (!manualLocationMarker) {
      manualLocationMarker = L.marker(position, { draggable: true }).addTo(manualLocationMap);
      manualLocationMarker.on("dragend", () => {
        const moved = manualLocationMarker.getLatLng();
        setManualLocation(moved.lat, moved.lng, "Point déplacé sur la carte", false);
      });
    } else {
      manualLocationMarker.setLatLng(position);
    }
    if (moveMap) manualLocationMap.setView(position, 15);
  }

  manualLocationSelection.textContent = `${label}. Tu peux déplacer le repère pour préciser le point.`;
  manualLocationSelection.hidden = false;
}

async function searchManualLocation(event) {
  event.preventDefault();
  const query = manualLocationQuery.value.trim();
  if (query.length < 3) {
    manualLocationStatus.textContent = "Saisis au moins trois caractères pour chercher une adresse.";
    manualLocationStatus.hidden = false;
    return;
  }

  manualLocationSearchButton.disabled = true;
  manualLocationStatus.textContent = "Recherche des adresses en France…";
  manualLocationStatus.hidden = false;
  manualLocationResults.replaceChildren();
  manualLocationResults.hidden = true;
  manualLocationSelection.textContent = "";
  manualLocationSelection.hidden = true;
  selectedManualLocation = null;
  if (manualLocationMarker) {
    manualLocationMap.removeLayer(manualLocationMarker);
    manualLocationMarker = null;
  }
  try {
    const url = new URL("https://data.geopf.fr/geocodage/search");
    url.searchParams.set("q", query);
    url.searchParams.set("index", "address");
    url.searchParams.set("limit", "5");
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Le service d’adresses répond ${response.status}.`);
    const result = await response.json();
    const features = (result.features ?? []).filter((feature) => (
      Array.isArray(feature.geometry?.coordinates)
      && Number.isFinite(feature.geometry.coordinates[0])
      && Number.isFinite(feature.geometry.coordinates[1])
      && typeof feature.properties?.label === "string"
    ));

    if (features.length === 0) {
      manualLocationStatus.textContent = "Aucune adresse trouvée en France. Essaie avec une adresse ou une commune plus précise.";
      return;
    }

    for (const feature of features) {
      const [longitude, latitude] = feature.geometry.coordinates;
      const option = document.createElement("button");
      option.className = "manual-location-result";
      option.type = "button";
      option.textContent = feature.properties.label;
      option.addEventListener("click", () => {
        manualLocationQuery.value = feature.properties.label;
        setManualLocation(latitude, longitude, feature.properties.label);
        manualLocationStatus.textContent = "Adresse sélectionnée. Vérifie le point sur la carte, puis choisis un mode de création.";
        manualLocationResults.hidden = true;
      });
      manualLocationResults.append(option);
    }
    manualLocationStatus.textContent = "Choisis une adresse dans les résultats.";
    manualLocationResults.hidden = false;
  } catch (error) {
    manualLocationStatus.textContent = error.name === "TimeoutError"
      ? "La recherche d’adresse a expiré. Réessaie."
      : error.message || "Impossible de rechercher cette adresse.";
  } finally {
    manualLocationSearchButton.disabled = false;
  }
}

async function generateSharedEnigma(mode) {
  generationInProgress = true;
  updateGenerateButton();
  generatedEnigmaResult.hidden = true;
  generatedEnigmaStatus.textContent = mode === "gemini"
    ? "Connexion à Gemini…"
    : "Recherche d’un lieu naturel à proximité…";
  generatedEnigmaStatus.hidden = false;
  delete generatedEnigmaStatus.dataset.error;

  try {
    const requestTimeout = AbortSignal.timeout(55000);
    const requestSharedEnigma = (location = {}) => fetch("/api/enigma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...location, mode, calendarDate: selectedEnigmaDate }),
      signal: requestTimeout,
    });
    let response = await requestSharedEnigma();
    let result = await response.json();

    if (response.status === 428 && result.needsLocation) {
      let location = selectedManualLocation;
      let locationSource = "manual";
      if (!location) {
        locationSource = "gps";
        if (!navigator.geolocation) {
          throw new Error("La géolocalisation n’est pas disponible dans ce navigateur. Cherche une adresse ou choisis un point sur la carte.");
        }
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 60000,
            timeout: 15000,
          });
        });
        location = position.coords;
        if (location.accuracy > 250) {
          throw new Error("La position est trop imprécise. Autorise la localisation précise et réessaie à l’extérieur, ou choisis un point sur la carte.");
        }
      }
      generatedEnigmaStatus.textContent = mode === "gemini"
        ? "Gemini rédige l’énigme…"
        : "Recherche d’un lieu naturel puis création de l’énigme…";
      response = await requestSharedEnigma({ ...location, locationSource });
      result = await response.json();
    }

    if (!response.ok) throw new Error(result.error ?? `La requête a échoué (${response.status}).`);

    generatedEnigmaText.textContent = result.text;
    generatedEnigmaPlace.textContent = result.alreadyShared
      ? "Cette énigme est déjà partagée pour cette date."
      : "Cette énigme est maintenant partagée pour cette date.";
    generatedPlaceLink.href = result.placeUrl
      ?? `https://www.openstreetmap.org/${encodeURIComponent(result.osmId)}`;
    generatedPlaceLink.textContent = result.placeSource === "ign"
      ? "Voir le lieu sur la carte IGN"
      : "Voir le lieu sur OpenStreetMap";
    generatedPlaceLink.hidden = false;
    placeAttribution.href = result.placeSource === "ign"
      ? "https://cartes.gouv.fr/cgu"
      : "https://www.openstreetmap.org/copyright";
    placeAttribution.textContent = result.placeSource === "ign"
      ? "© IGN - Géoplateforme"
      : "© contributeurs OpenStreetMap";
    generatedEnigmaResult.hidden = false;
    generatedEnigmaStatus.textContent = "";
    generatedEnigmaStatus.hidden = true;
    generationInProgress = false;
  } catch (error) {
    generationInProgress = false;
    generatedEnigmaStatus.textContent = error.code === 1
      ? "La localisation a été refusée. Autorise-la pour chercher un lieu à proximité."
      : error.name === "TimeoutError" || error.name === "AbortError"
        ? "La génération a dépassé le délai d’attente. Réessaie ou choisis le mode modèle."
        : error.message;
    generatedEnigmaStatus.dataset.error = "true";
    updateGenerateButton();
  }
}

function findEnigmaImage(number) {
  if (!imageByNumber.has(number)) {
    imageByNumber.set(number, new Promise((resolve) => {
      const extensions = [".png", ".jpg"];
      const probe = new Image();

      function tryNextExtension() {
        const extension = extensions.shift();
        if (!extension) {
          resolve(null);
          return;
        }

        probe.onload = () => resolve(extension);
        probe.onerror = tryNextExtension;
        probe.src = `enigme/${number}${extension}`;
      }

      tryNextExtension();
    }));
  }

  return imageByNumber.get(number);
}

function openEnigma(number, imageUrl, trigger, fallbackUrl = null) {
  lastFocusedElement = trigger;
  modalTitle.textContent = `Énigme ${number}`;
  imageFrame.hidden = false;
  generatedEnigma.hidden = true;
  modalImage.hidden = false;
  modalMessage.hidden = true;
  modalImage.hidden = false;
  modalImage.alt = `Image de l’énigme ${number}`;
  let triedFallback = false;
  modalImage.onerror = () => {
    if (fallbackUrl && !triedFallback) {
      triedFallback = true;
      modalImage.src = fallbackUrl;
      return;
    }
    modalImage.hidden = true;
    modalMessage.textContent = `L’image de l’énigme ${number} ne peut pas être chargée. La case a été désactivée.`;
    modalMessage.hidden = false;
    trigger.disabled = true;
    trigger.setAttribute("aria-label", `Jour ${number}, énigme indisponible`);
    trigger.title = `L’énigme ${number} n’est pas encore disponible`;
  };
  modalImage.onload = () => {
    modalMessage.hidden = true;
  };
  modal.hidden = false;
  document.body.classList.add("modal-open");
  closeButton.focus();
  modalImage.src = imageUrl;
}

function closeModal() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  modalImage.removeAttribute("src");
  lastFocusedElement?.focus();
}

closeButton.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
