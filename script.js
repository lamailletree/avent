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
const generateOsmButton = document.querySelector("#generate-osm-enigma");
const generateGeminiButton = document.querySelector("#generate-gemini-enigma");
const geminiConsent = document.querySelector("#gemini-consent");
const generatedEnigmaStatus = document.querySelector("#generated-enigma-status");
const generatedEnigmaResult = document.querySelector("#generated-enigma-result");
const generatedEnigmaText = document.querySelector("#generated-enigma-text");
const generatedEnigmaPlace = document.querySelector("#generated-enigma-place");
const generatedPlaceLink = document.querySelector("#generated-place-link");
const imageByNumber = new Map();
let cloudEnigmaImages = new Map();
let googleDriveServicePromise;
let lastFocusedElement = null;
let calendarRenderId = 0;
let selectedEnigmaDate = null;
let generationInProgress = false;

const today = new Date();
let selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
document.querySelector("#previous-month").addEventListener("click", () => changeMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => changeMonth(1));
document.querySelector("#current-month").addEventListener("click", () => {
  selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  renderCalendar();
});
renderCalendar();

generateOsmButton.addEventListener("click", () => generateSharedEnigma("openstreetmap"));
generateGeminiButton.addEventListener("click", () => generateSharedEnigma("gemini"));
geminiConsent.addEventListener("change", () => {
  generateGeminiButton.disabled = generationInProgress || !geminiConsent.checked;
});

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
  generateOsmButton.disabled = false;
  generateGeminiButton.disabled = !geminiConsent.checked;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  closeButton.focus();
}

async function generateSharedEnigma(mode) {
  generationInProgress = true;
  const buttons = [generateOsmButton, generateGeminiButton];
  for (const button of buttons) button.disabled = true;
  generatedEnigmaResult.hidden = true;
  generatedEnigmaStatus.textContent = "Recherche d’un lieu naturel à proximité…";
  generatedEnigmaStatus.hidden = false;
  delete generatedEnigmaStatus.dataset.error;

  try {
    const requestSharedEnigma = (location = {}) => fetch("/api/enigma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...location, mode, calendarDate: selectedEnigmaDate }),
    });
    let response = await requestSharedEnigma();
    let result = await response.json();

    if (response.status === 428 && result.needsLocation) {
      if (!navigator.geolocation) {
        throw new Error("La géolocalisation n’est pas disponible dans ce navigateur.");
      }
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 60000,
          timeout: 15000,
        });
      });
      const { latitude, longitude, accuracy } = position.coords;
      if (accuracy > 250) {
        throw new Error("La position est trop imprécise. Autorise la localisation précise et réessaie à l’extérieur.");
      }
      generatedEnigmaStatus.textContent = "Recherche d’un lieu naturel puis création de l’énigme…";
      response = await requestSharedEnigma({ latitude, longitude, accuracy });
      result = await response.json();
    }

    if (!response.ok) throw new Error(result.error ?? `La requête a échoué (${response.status}).`);

    generatedEnigmaText.textContent = result.text;
    generatedEnigmaPlace.textContent = result.alreadyShared
      ? "Cette énigme est déjà partagée pour cette date."
      : "Cette énigme est maintenant partagée pour cette date.";
    generatedPlaceLink.href = `https://www.openstreetmap.org/${encodeURIComponent(result.osmId)}`;
    generatedPlaceLink.hidden = false;
    generatedEnigmaResult.hidden = false;
    generatedEnigmaStatus.textContent = "";
    generatedEnigmaStatus.hidden = true;
    generationInProgress = false;
  } catch (error) {
    generationInProgress = false;
    generatedEnigmaStatus.textContent = error.code === 1
      ? "La localisation a été refusée. Autorise-la pour chercher un lieu à proximité."
      : error.message;
    generatedEnigmaStatus.dataset.error = "true";
    for (const button of buttons) {
      button.disabled = button === generateGeminiButton && !geminiConsent.checked;
    }
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
