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
const imageByNumber = new Map();
let googleDriveServicePromise;
let lastFocusedElement = null;
let calendarRenderId = 0;

const today = new Date();
let selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
document.querySelector("#previous-month").addEventListener("click", () => changeMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => changeMonth(1));
document.querySelector("#current-month").addEventListener("click", () => {
  selectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  renderCalendar();
});
renderCalendar();

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
      boardImage.src = "fond-calendrier.svg";
      boardImage.dataset.cloud = "false";
      return;
    }
    const assets = await service.loadMonthAssets(monthKey, numberOfDays);
    if (renderId !== calendarRenderId) return;

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
    }
    calendarStatus.hidden = true;
  } catch (error) {
    if (renderId !== calendarRenderId) return;
    boardImage.dataset.cloud = "false";
    boardImage.src = "fond-calendrier.svg";
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

  const extension = await findEnigmaImage(number);
  caseButton.disabled = !extension;
  caseButton.setAttribute(
    "aria-label",
    extension ? `Ouvrir l’énigme ${number}` : `Jour ${number}, énigme indisponible`,
  );
  caseButton.title = extension
    ? `Ouvrir l’énigme ${number}`
    : `L’énigme ${number} n’est pas encore disponible`;

  if (extension) {
    caseButton.addEventListener("click", () => openEnigma(number, extension, caseButton));
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

function openEnigma(number, extension, trigger) {
  lastFocusedElement = trigger;
  modalTitle.textContent = `Énigme ${number}`;
  modalMessage.hidden = true;
  modalImage.hidden = false;
  modalImage.alt = `Image de l’énigme ${number}`;
  modalImage.onerror = () => {
    modalImage.hidden = true;
    modalMessage.textContent = `L’image enigme/${number}${extension} ne peut pas être chargée. La case a été désactivée.`;
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
  modalImage.src = `enigme/${number}${extension}`;
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
