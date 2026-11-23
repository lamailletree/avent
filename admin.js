const adminStatus = document.querySelector("#admin-status");
const adminEditor = document.querySelector("#admin-editor");
const googleSignInButton = document.querySelector("#google-sign-in");
const googleSignOutButton = document.querySelector("#google-sign-out");
const driveFolderSetup = document.querySelector("#drive-folder-setup");
const driveAssetControls = document.querySelector("#drive-asset-controls");
const driveFolderResult = document.querySelector("#drive-folder-result");
const driveFolderConfig = document.querySelector("#drive-folder-config");
const caseNumber = document.querySelector("#case-number");
const adminMonthLabel = document.querySelector("#admin-month-label");
const driveBreadcrumbs = document.querySelector("#drive-breadcrumbs");
const driveBrowserStatus = document.querySelector("#drive-browser-status");
const driveFileGrid = document.querySelector("#drive-file-grid");

const today = new Date();
let selectedMonth = monthKeyFor(today);
let googleDriveServicePromise;
let currentAdminUser = null;
let folderStack = [];
let browserRequestId = 0;

updateAdminMonth();
updateCaseNumberLimit();
document.querySelector("#admin-previous-month").addEventListener("click", () => changeAdminMonth(-1));
document.querySelector("#admin-next-month").addEventListener("click", () => changeAdminMonth(1));
document.querySelector("#admin-current-month").addEventListener("click", () => {
  selectedMonth = monthKeyFor(today);
  updateAdminMonth();
});

googleSignInButton.addEventListener("click", async () => {
  googleSignInButton.disabled = true;
  try {
    const service = await getGoogleDriveService();
    if (!service) throw new Error("Google n’est pas configuré. Consulte google-config.js.");
    currentAdminUser = await service.signInAdmin();
    updateDriveAdminUI(service);
    setAdminStatus(`Connecté en tant que ${currentAdminUser.email}.`);
    if (service.hasDriveFolder()) {
      folderStack = [{ id: null, name: "Dossier du calendrier" }];
      await refreshDriveFiles();
    }
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
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const service = await getGoogleDriveService();
    if (!service) throw new Error("Google n’est pas configuré. Consulte google-config.js.");
    const { folderId, manifestId } = await service.createPublicFolder();
    driveFolderConfig.textContent = `googleDriveFolderId: "${folderId}",\ngoogleDriveManifestId: "${manifestId}"`;
    driveFolderResult.hidden = false;
    setAdminStatus("Dossier Drive créé et partagé en lecture. Copie les identifiants dans google-config.js, puis redéploie le site.");
    updateDriveAdminUI(service);
  } catch (error) {
    setAdminStatus(error.message, true);
  } finally {
    button.disabled = false;
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

googleSignOutButton.addEventListener("click", async () => {
  try {
    const service = await getGoogleDriveService();
    service?.signOutAdmin();
    currentAdminUser = null;
    folderStack = [];
    adminEditor.hidden = true;
    googleSignInButton.hidden = false;
    googleSignOutButton.hidden = true;
    driveFileGrid.replaceChildren();
    driveBreadcrumbs.replaceChildren();
    driveBrowserStatus.textContent = "";
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
    await service.uploadBackground(selectedMonth, file);
    fileInput.value = "";
    setAdminStatus(`Le fond de ${selectedMonth} a été enregistré.`);
    await refreshDriveFiles();
  });
});

document.querySelector("#delete-background").addEventListener("click", async (event) => {
  await runAdminAction(event.currentTarget, async (service) => {
    await service.deleteBackground(selectedMonth);
    setAdminStatus(`Le fond de ${selectedMonth} a été supprimé ; le fond par défaut sera affiché.`);
    await refreshDriveFiles();
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

  const day = Number(caseNumber.value);
  await runAdminAction(event.submitter ?? event.currentTarget.querySelector('[type="submit"]'), async (service) => {
    await service.uploadCase(selectedMonth, day, file);
    fileInput.value = "";
    setAdminStatus(`L’image de la case ${day} (${selectedMonth}) a été enregistrée.`);
    await refreshDriveFiles();
  });
});

document.querySelector("#delete-case").addEventListener("click", async (event) => {
  const day = Number(caseNumber.value);
  await runAdminAction(event.currentTarget, async (service) => {
    await service.deleteCase(selectedMonth, day);
    setAdminStatus(`L’image de la case ${day} (${selectedMonth}) a été supprimée.`);
    await refreshDriveFiles();
  });
});

document.querySelector("#enigma-upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.querySelector("#enigma-file");
  const file = fileInput.files[0];
  if (!file) {
    setAdminStatus("Choisis un fichier PNG ou JPEG pour l’énigme.", true);
    return;
  }

  const day = Number(document.querySelector("#enigma-number").value);
  await runAdminAction(event.submitter ?? event.currentTarget.querySelector('[type="submit"]'), async (service) => {
    await service.uploadEnigma(day, file);
    fileInput.value = "";
    setAdminStatus(`L’image de l’énigme ${day} a été enregistrée.`);
    await refreshDriveFiles();
  });
});

document.querySelector("#delete-enigma").addEventListener("click", async (event) => {
  const day = Number(document.querySelector("#enigma-number").value);
  await runAdminAction(event.currentTarget, async (service) => {
    await service.deleteEnigma(day);
    setAdminStatus(`L’image de l’énigme ${day} a été supprimée de Drive.`);
    await refreshDriveFiles();
  });
});

document.querySelector("#refresh-drive-files").addEventListener("click", refreshDriveFiles);

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
    updateDriveAdminUI(service);
    if (service.isAuthorizedAdmin()) {
      setAdminStatus(`Connecté en tant que ${currentAdminUser.email}.`);
      if (service.hasDriveFolder()) {
        folderStack = [{ id: null, name: "Dossier du calendrier" }];
        await refreshDriveFiles();
      }
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
  googleSignOutButton.hidden = !authorized;
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

function monthKeyFor(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function changeAdminMonth(offset) {
  const [year, month] = selectedMonth.split("-").map(Number);
  selectedMonth = monthKeyFor(new Date(year, month - 1 + offset, 1));
  updateAdminMonth();
}

function updateAdminMonth() {
  const [year, month] = selectedMonth.split("-").map(Number);
  adminMonthLabel.textContent = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
  updateCaseNumberLimit();
}

function updateCaseNumberLimit() {
  const [year, month] = selectedMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  caseNumber.max = lastDay;
  if (Number(caseNumber.value) > lastDay) caseNumber.value = lastDay;
}

async function refreshDriveFiles() {
  const service = await getGoogleDriveService();
  if (!service || !service.isAuthorizedAdmin() || !service.hasDriveFolder()) return;

  const requestId = ++browserRequestId;
  const currentFolder = folderStack.at(-1);
  delete driveBrowserStatus.dataset.error;
  driveBrowserStatus.textContent = "Chargement du dossier…";
  driveFileGrid.replaceChildren();
  renderBreadcrumbs();

  try {
    const files = await service.listDriveAssets(currentFolder?.id);
    if (requestId !== browserRequestId) return;
    renderDriveFiles(files);
    driveBrowserStatus.textContent = files.length
      ? `${files.length} élément${files.length > 1 ? "s" : ""} dans ce dossier.`
      : "Ce dossier est vide.";
    delete driveBrowserStatus.dataset.error;
  } catch (error) {
    if (requestId !== browserRequestId) return;
    driveBrowserStatus.textContent = `Impossible de charger ce dossier : ${error.message}`;
    driveBrowserStatus.dataset.error = "true";
  }
}

function renderBreadcrumbs() {
  driveBreadcrumbs.replaceChildren();
  folderStack.forEach((folder, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "drive-breadcrumb-separator";
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = "/";
      driveBreadcrumbs.append(separator);
    }

    const crumb = document.createElement(index === folderStack.length - 1 ? "span" : "button");
    crumb.className = "drive-breadcrumb";
    crumb.textContent = folder.name;
    if (index === folderStack.length - 1) {
      crumb.setAttribute("aria-current", "location");
    } else {
      crumb.type = "button";
      crumb.addEventListener("click", () => {
        folderStack = folderStack.slice(0, index + 1);
        void refreshDriveFiles();
      });
    }
    driveBreadcrumbs.append(crumb);
  });
}

function renderDriveFiles(files) {
  driveFileGrid.replaceChildren();
  for (const file of files) {
    const isFolder = file.mimeType === "application/vnd.google-apps.folder";
    const isImage = file.mimeType.startsWith("image/");
    const card = document.createElement("article");
    card.className = "drive-file-card";

    if (isImage && file.previewUrl) {
      const preview = document.createElement("img");
      preview.className = "drive-file-preview";
      preview.src = file.previewUrl;
      preview.alt = `Aperçu de ${file.name}`;
      preview.loading = "lazy";
      card.append(preview);
    } else {
      const icon = document.createElement("span");
      icon.className = `drive-file-icon${isFolder ? " folder" : ""}`;
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = isFolder ? "📁" : "▧";
      card.append(icon);
    }

    const info = document.createElement("div");
    info.className = "drive-file-info";
    const name = document.createElement("h4");
    name.textContent = file.name;
    info.append(name);

    const details = document.createElement("p");
    details.textContent = isFolder ? "Dossier" : file.mimeType;
    if (file.modifiedTime) {
      details.textContent += ` · modifié le ${new Intl.DateTimeFormat("fr-FR").format(new Date(file.modifiedTime))}`;
    }
    if (file.size) details.textContent += ` · ${formatFileSize(Number(file.size))}`;
    info.append(details);
    card.append(info);

    const actions = document.createElement("div");
    actions.className = "drive-file-actions";
    if (isFolder) {
      const openFolder = document.createElement("button");
      openFolder.className = "text-button";
      openFolder.type = "button";
      openFolder.textContent = "Ouvrir";
      openFolder.addEventListener("click", () => {
        folderStack.push({ id: file.id, name: file.name });
        void refreshDriveFiles();
      });
      actions.append(openFolder);
    }

    const openLink = document.createElement("a");
    openLink.className = "text-button";
    openLink.href = file.webViewLink ?? (
      isFolder
        ? `https://drive.google.com/drive/folders/${encodeURIComponent(file.id)}`
        : `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`
    );
    openLink.target = "_blank";
    openLink.rel = "noreferrer";
    openLink.textContent = "Voir dans Drive";
    actions.append(openLink);
    card.append(actions);
    driveFileGrid.append(card);
  }
}

function formatFileSize(size) {
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

void initializeAdmin();
