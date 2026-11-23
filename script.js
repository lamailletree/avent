const caseImages = new Map([
  [1, "cases/1.png"],
  [2, "cases/2.png"],
]);

const monthPicker = document.querySelector("#month-picker");
const calendarTitle = document.querySelector("#calendar-title");
const calendarGrid = document.querySelector("#calendar-grid");
const boardImage = document.querySelector(".board-image");
const calendarStatus = document.querySelector("#calendar-status");
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modal-title");
const modalImage = document.querySelector("#enigma-image");
const modalMessage = document.querySelector("#modal-message");
const closeButton = document.querySelector("#close-button");
const adminToggle = document.querySelector("#admin-toggle");
const adminPanel = document.querySelector("#admin-panel");
const adminStatus = document.querySelector("#admin-status");
const adminEditor = document.querySelector("#admin-editor");
const googleSignInButton = document.querySelector("#google-sign-in");
const driveFolderSetup = document.querySelector("#drive-folder-setup");
const driveAssetControls = document.querySelector("#drive-asset-controls");
const driveFolderResult = document.querySelector("#drive-folder-result");
const driveFolderConfig = document.querySelector("#drive-folder-config");
const adminMonth = document.querySelector("#admin-month");
const caseNumber = document.querySelector("#case-number");
const imageByNumber = new Map();
let googleDriveServicePromise;
let currentAdminUser = null;
let lastFocusedElement = null;
let calendarRenderId = 0;

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
monthPicker.value = currentMonth;
adminMonth.value = currentMonth;
updateCaseNumberLimit();
monthPicker.addEventListener("change", renderCalendar);
adminMonth.addEventListener("change", updateCaseNumberLimit);
renderCalendar();

adminToggle.addEventListener("click", async () => {
  adminPanel.hidden = !adminPanel.hidden;
  adminToggle.setAttribute("aria-expanded", String(!adminPanel.hidden));
  if (!adminPanel.hidden) await initializeAdmin();
});

googleSignInButton.addEventListener("click", async () => {
  googleSignInButton.disabled = true;
  try {
    const service = await getGoogleDriveService();
    if (!service) throw new Error("Complète d’abord google-config.js (voir le README).");
    currentAdminUser = await service.signInAdmin();
    adminEditor.hidden = false;
    googleSignInButton.hidden = true;
    updateDriveAdminUI(service, currentAdminUser);
    setAdminStatus(`Connecté en tant que ${currentAdminUser.email}.`);
  } catch (error) {
    currentAdminUser = null;
    adminEditor.hidden = true;
    googleSignInButton.hidden = false;
    setAdminStatus(error.message, true);
  } finally {
    googleSignInButton.disabled = false;
  }
});

document.querySelector("#create-drive-folder").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    const service = await getGoogleDriveService();
    const { folderId, manifestId } = await service.createPublicFolder();
    driveFolderConfig.textContent = `googleDriveFolderId: "${folderId}",\ngoogleDriveManifestId: "${manifestId}"`;
    driveFolderResult.hidden = false;
    setAdminStatus("Dossier Drive créé et partagé en lecture. Copie les identifiants dans google-config.js, puis redéploie le site.");
  } catch (error) {
    setAdminStatus(error.message, true);
  } finally {
    event.currentTarget.disabled = false;
  }
});

document.querySelector("#copy-drive-folder").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(driveFolderConfig.textContent);
    setAdminStatus("Configuration du dossier copiée.");
  } catch (error) {
    setAdminStatus(`Impossible de copier l’identifiant : ${error.message}`, true);
  }
});

document.querySelector("#google-sign-out").addEventListener("click", async () => {
  try {
    const service = await getGoogleDriveService();
    service?.signOutAdmin();
    currentAdminUser = null;
    adminEditor.hidden = true;
    googleSignInButton.hidden = false;
    setAdminStatus("Déconnecté.");
  } catch (error) {
    setAdminStatus(error.message, true);
  }
});

document.querySelector("#upload-background").addEventListener("click", async (event) => {
  const fileInput = document.querySelector("#background-file");
  const file = fileInput.files[0];
  if (!file) {
    setAdminStatus("Choisis une image de fond avant de l’enregistrer.", true);
    return;
  }

  await runAdminAction(event.currentTarget, async (service) => {
    await service.uploadBackground(adminMonth.value, file);
    fileInput.value = "";
    setAdminStatus(`Le fond de ${adminMonth.value} a été enregistré.`);
    refreshCalendarIfCurrentMonth(adminMonth.value);
  });
});

document.querySelector("#delete-background").addEventListener("click", async (event) => {
  await runAdminAction(event.currentTarget, async (service) => {
    await service.deleteBackground(adminMonth.value);
    setAdminStatus(`Le fond de ${adminMonth.value} a été supprimé ; le fond par défaut sera affiché.`);
    refreshCalendarIfCurrentMonth(adminMonth.value);
  });
});

document.querySelector("#case-upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.querySelector("#case-file");
  const file = fileInput.files[0];
  if (!file) {
    setAdminStatus("Choisis un fichier PNG pour la case.", true);
    return;
  }

  await runAdminAction(event.submitter ?? event.currentTarget.querySelector('[type="submit"]'), async (service) => {
    const day = Number(caseNumber.value);
    await service.uploadCase(adminMonth.value, day, file);
    fileInput.value = "";
    setAdminStatus(`L’image de la case ${day} (${adminMonth.value}) a été enregistrée.`);
    refreshCalendarIfCurrentMonth(adminMonth.value);
  });
});

document.querySelector("#delete-case").addEventListener("click", async (event) => {
  const day = Number(caseNumber.value);
  await runAdminAction(event.currentTarget, async (service) => {
    await service.deleteCase(adminMonth.value, day);
    setAdminStatus(`L’image de la case ${day} (${adminMonth.value}) a été supprimée.`);
    refreshCalendarIfCurrentMonth(adminMonth.value);
  });
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

async function initializeAdmin() {
  try {
    const service = await getGoogleDriveService();
    if (!service) {
      googleSignInButton.disabled = true;
      setAdminStatus("Google n’est pas encore configuré. Consulte le README et renseigne google-config.js.", true);
      return;
    }

    googleSignInButton.disabled = false;
    currentAdminUser = service.getCurrentAdmin();
    const authorized = service.isAuthorizedAdmin();
    adminEditor.hidden = !authorized;
    googleSignInButton.hidden = authorized;
    updateDriveAdminUI(service);
    if (authorized) {
      setAdminStatus(`Connecté en tant que ${currentAdminUser.email}.`);
    } else if (!adminStatus.dataset.error) {
      setAdminStatus("Connecte-toi avec le compte Google administrateur.");
    }
  } catch (error) {
    setAdminStatus(`Impossible d’initialiser Google Drive : ${error.message}`, true);
  }
}

function updateDriveAdminUI(service) {
  const authorized = service.isAuthorizedAdmin();
  const hasDriveAccess = authorized && service.hasDriveAccess();
  const hasDriveFolder = service.hasDriveFolder();
  driveFolderSetup.hidden = !hasDriveAccess || hasDriveFolder;
  driveAssetControls.hidden = !hasDriveAccess || !hasDriveFolder;
  adminEditor.hidden = !authorized;
  googleSignInButton.hidden = authorized;
}

function setAdminStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.dataset.error = String(isError);
}

async function runAdminAction(button, action) {
  let service;
  try {
    service = await getGoogleDriveService();
    if (!service) throw new Error("Google Drive n’est pas configuré. Consulte le README.");
    button.disabled = true;
    await action(service);
  } catch (error) {
    setAdminStatus(`Échec de l’opération : ${error.message}`, true);
    if (service) {
      currentAdminUser = service.getCurrentAdmin();
      updateDriveAdminUI(service);
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function updateCaseNumberLimit() {
  if (!adminMonth.value) return;
  const [year, month] = adminMonth.value.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  caseNumber.max = lastDay;
  if (Number(caseNumber.value) > lastDay) caseNumber.value = lastDay;
}

function refreshCalendarIfCurrentMonth(monthKey) {
  if (monthPicker.value === monthKey) renderCalendar();
}

function renderCalendar() {
  if (!monthPicker.value) return;

  const renderId = ++calendarRenderId;
  const [year, month] = monthPicker.value.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const numberOfDays = new Date(year, month, 0).getDate();
  const firstDayOffset = (date.getDay() + 6) % 7;

  calendarTitle.textContent = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
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

  void updateCloudAssets(monthPicker.value, numberOfDays, renderId);
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
