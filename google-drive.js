import { adminEmail, googleConfig } from "./google-config.js";

const driveApi = "https://www.googleapis.com/drive/v3";
const driveUploadApi = "https://www.googleapis.com/upload/drive/v3";
const oauthScopes = "openid email profile https://www.googleapis.com/auth/drive.file";
const maximumImageSize = 10 * 1024 * 1024;
let accessToken = null;
let tokenExpiresAt = 0;
let adminUser = null;

function isAdmin(user = adminUser) {
  return user?.email?.toLowerCase() === adminEmail && user.email_verified === true;
}

function clearSession() {
  accessToken = null;
  tokenExpiresAt = 0;
  adminUser = null;
}

function requireAdmin() {
  if (!isAdmin()) {
    throw new Error(`Connecte-toi avec le compte Google ${adminEmail}.`);
  }
}

function requireAccessToken() {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    clearSession();
    throw new Error("La session Google a expiré. Reconnecte-toi.");
  }
}

function requireDriveAccess() {
  requireAdmin();
  requireAccessToken();
  if (!hasDriveFolder()) {
    throw new Error("Crée d’abord le dossier Drive depuis l’administration.");
  }
}

function validateMonth(monthKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new Error("Choisis un mois valide.");
  }
}

function googleIdentity() {
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Le service de connexion Google n’est pas chargé. Recharge la page et réessaie.");
  }
  return window.google.accounts.oauth2;
}

function requestGoogleToken(prompt) {
  return new Promise((resolve, reject) => {
    const oauth = googleIdentity();
    const tokenClient = oauth.initTokenClient({
      client_id: googleConfig.clientId,
      scope: oauthScopes,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Connexion Google : ${response.error_description ?? response.error}`));
          return;
        }
        resolve(response);
      },
      error_callback: (error) => reject(new Error(`Connexion Google : ${error.message}`)),
    });
    tokenClient.requestAccessToken({ prompt });
  });
}

async function readResponse(response, authenticated = false) {
  if (response.ok) return response.json();
  const result = await response.json().catch(() => null);
  const details = result?.error?.message ?? `${response.status} ${response.statusText}`;
  if (authenticated && response.status === 401) clearSession();
  throw new Error(`Google Drive : ${details}`);
}

async function listFiles({ name, parentId = googleConfig.googleDriveFolderId } = {}) {
  requireDriveAccess();
  const url = new URL(`${driveApi}/files`);
  const query = [`'${parentId}' in parents`, "trashed = false"];
  if (name) query.push(`name = '${name}'`);
  url.searchParams.set("q", query.join(" and "));
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)");
  url.searchParams.set("pageSize", "1000");

  const files = [];
  let pageToken;
  do {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await readResponse(await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }), true);
    files.push(...(result.files ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return files;
}

async function uploadDriveFile(name, mimeType, parentId, content, existingFileId) {
  requireAccessToken();
  const boundary = `avent_${crypto.randomUUID()}`;
  const metadata = { name, mimeType };
  if (parentId) metadata.parents = [parentId];
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });
  const filePath = existingFileId
    ? `/files/${encodeURIComponent(existingFileId)}`
    : "/files";
  const response = await fetch(`${driveUploadApi}${filePath}?uploadType=multipart&fields=id,name`, {
    method: existingFileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": body.type,
    },
    body,
  });
  return readResponse(response, true);
}

async function readManifest(publicRead = false) {
  const url = new URL(`${driveApi}/files/${encodeURIComponent(googleConfig.googleDriveManifestId)}`);
  url.searchParams.set("alt", "media");
  const headers = {};
  if (publicRead) {
    url.searchParams.set("key", googleConfig.googleDriveApiKey);
  } else {
    requireDriveAccess();
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return readResponse(await fetch(url, {
    headers,
    cache: publicRead ? "no-store" : "default",
  }), !publicRead);
}

async function writeManifest(manifest) {
  requireDriveAccess();
  manifest.updatedAt = Date.now();
  const response = await fetch(
    `${driveUploadApi}/files/${encodeURIComponent(googleConfig.googleDriveManifestId)}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(manifest),
    },
  );
  await readResponse(response, true);
}

async function updateManifest(monthKey, update) {
  const manifest = await readManifest();
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Le fichier d’index Drive n’a pas un format JSON valide.");
  }
  const previousMonth = manifest[monthKey] ?? {};
  const month = {
    ...previousMonth,
    cases: { ...(previousMonth.cases ?? {}) },
  };
  update(month);
  if (!month.background && Object.keys(month.cases).length === 0) {
    delete manifest[monthKey];
  } else {
    manifest[monthKey] = month;
  }
  await writeManifest(manifest);
}

async function updateEnigmaManifest(day, update) {
  const manifest = await readManifest();
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Le fichier d’index Drive n’a pas un format JSON valide.");
  }
  const previousEnigmas = manifest.enigmas ?? {};
  if (typeof previousEnigmas !== "object" || Array.isArray(previousEnigmas)) {
    throw new Error("La liste des énigmes dans l’index Drive n’a pas un format valide.");
  }
  const enigmas = { ...previousEnigmas };
  update(enigmas);
  if (Object.keys(enigmas).length === 0) {
    delete manifest.enigmas;
  } else {
    manifest.enigmas = enigmas;
  }
  await writeManifest(manifest);
}

function publicImageUrl(fileId, revision) {
  const url = new URL(`${driveApi}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("key", googleConfig.googleDriveApiKey);
  url.searchParams.set("v", String(revision));
  return url.toString();
}

export async function listDriveAssets(parentId) {
  const files = await listFiles(parentId ? { parentId } : {});
  return files.map((file) => ({
    ...file,
    previewUrl: file.mimeType.startsWith("image/")
      ? publicImageUrl(file.id, file.modifiedTime ?? "")
      : null,
  }));
}

export function isAuthorizedAdmin() {
  return isAdmin();
}

export function getCurrentAdmin() {
  return adminUser;
}

export function hasDriveAccess() {
  return Boolean(accessToken && Date.now() < tokenExpiresAt);
}

export function hasDriveFolder() {
  return Boolean(googleConfig.googleDriveFolderId && googleConfig.googleDriveManifestId);
}

export async function signInAdmin() {
  const response = await requestGoogleToken("select_account");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${response.access_token}` },
  });
  if (!profileResponse.ok) {
    throw new Error(`Impossible de vérifier le compte Google (${profileResponse.status}).`);
  }
  const user = await profileResponse.json();
  if (user.email?.toLowerCase() !== adminEmail || user.email_verified !== true) {
    googleIdentity().revoke(response.access_token, () => {});
    throw new Error(`Ce compte n’est pas autorisé. Utilise ${adminEmail}.`);
  }

  adminUser = user;
  accessToken = response.access_token;
  tokenExpiresAt = Date.now() + Number(response.expires_in) * 1000;
  return user;
}

export function signOutAdmin() {
  const token = accessToken;
  clearSession();
  if (token) googleIdentity().revoke(token, () => {});
}

export async function createPublicFolder() {
  requireAdmin();
  requireAccessToken();

  const folderResponse = await fetch(`${driveApi}/files?fields=id,name`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Calendrier Avent",
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const folder = await readResponse(folderResponse, true);

  const permissionResponse = await fetch(`${driveApi}/files/${encodeURIComponent(folder.id)}/permissions?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "anyone", role: "reader" }),
  });
  await readResponse(permissionResponse, true);
  const manifest = await uploadDriveFile(
    "calendar-index.json",
    "application/json",
    folder.id,
    new Blob(["{}"], { type: "application/json" }),
  );
  return { folderId: folder.id, manifestId: manifest.id };
}

export async function loadMonthAssets(monthKey, numberOfDays) {
  validateMonth(monthKey);
  if (!hasDriveFolder()) return { background: null, cases: new Map(), enigmas: new Map() };

  const manifest = await readManifest(true);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Le fichier d’index Drive n’a pas un format JSON valide.");
  }
  const month = manifest[monthKey] ?? {};
  const revision = manifest.updatedAt ?? "";
  const cases = new Map();
  for (const [dayString, fileId] of Object.entries(month.cases ?? {})) {
    const day = Number(dayString);
    if (Number.isInteger(day) && day >= 1 && day <= numberOfDays && typeof fileId === "string") {
      cases.set(day, publicImageUrl(fileId, revision));
    }
  }

  const enigmas = new Map();
  const manifestEnigmas = manifest.enigmas ?? {};
  if (typeof manifestEnigmas !== "object" || Array.isArray(manifestEnigmas)) {
    throw new Error("La liste des énigmes dans l’index Drive n’a pas un format valide.");
  }
  for (const [dayString, fileId] of Object.entries(manifestEnigmas)) {
    const day = Number(dayString);
    if (Number.isInteger(day) && day >= 1 && day <= 31 && typeof fileId === "string") {
      enigmas.set(day, publicImageUrl(fileId, revision));
    }
  }

  return {
    background: month.background ? publicImageUrl(month.background, revision) : null,
    cases,
    enigmas,
  };
}

async function findFile(name) {
  return (await listFiles({ name }))[0] ?? null;
}

async function uploadImage(name, file, requiredType) {
  requireDriveAccess();
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Choisis un fichier image.");
  }
  if (requiredType && file.type !== requiredType) {
    throw new Error("L’image d’une case doit être au format PNG.");
  }
  if (file.size > maximumImageSize) {
    throw new Error("L’image ne doit pas dépasser 10 Mo.");
  }

  const existingFile = await findFile(name);
  const savedFile = await uploadDriveFile(
    name,
    file.type,
    existingFile ? null : googleConfig.googleDriveFolderId,
    file,
    existingFile?.id,
  );
  const fileId = savedFile.id ?? existingFile?.id;
  if (!fileId) throw new Error("Google Drive n’a pas renvoyé l’identifiant du fichier.");
  return fileId;
}

async function deleteFileById(fileId) {
  requireDriveAccess();
  const response = await fetch(`${driveApi}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) await readResponse(response, true);
}

export async function uploadBackground(monthKey, file) {
  validateMonth(monthKey);
  const fileId = await uploadImage(`${monthKey}-fond`, file);
  await updateManifest(monthKey, (month) => {
    month.background = fileId;
  });
}

export async function deleteBackground(monthKey) {
  validateMonth(monthKey);
  const file = await findFile(`${monthKey}-fond`);
  if (!file) throw new Error(`Le fond de ${monthKey} n’existe pas.`);
  await updateManifest(monthKey, (month) => {
    delete month.background;
  });
  await deleteFileById(file.id);
}

export async function uploadCase(monthKey, day, file) {
  validateMonth(monthKey);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("Le numéro de la case doit être compris entre 1 et 31.");
  }
  const fileId = await uploadImage(`${monthKey}-case-${day}.png`, file, "image/png");
  await updateManifest(monthKey, (month) => {
    month.cases[String(day)] = fileId;
  });
}

export async function deleteCase(monthKey, day) {
  validateMonth(monthKey);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("Le numéro de la case doit être compris entre 1 et 31.");
  }
  const file = await findFile(`${monthKey}-case-${day}.png`);
  if (!file) throw new Error(`L’image de la case ${day} (${monthKey}) n’existe pas.`);
  await updateManifest(monthKey, (month) => {
    delete month.cases[String(day)];
  });
  await deleteFileById(file.id);
}

export async function uploadEnigma(day, file) {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("Le numéro de l’énigme doit être compris entre 1 et 31.");
  }
  if (!file || !["image/png", "image/jpeg"].includes(file.type)) {
    throw new Error("Choisis une image PNG ou JPEG pour l’énigme.");
  }

  const dayKey = String(day);
  const manifest = await readManifest();
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Le fichier d’index Drive n’a pas un format JSON valide.");
  }
  const previousEnigmas = manifest.enigmas ?? {};
  if (typeof previousEnigmas !== "object" || Array.isArray(previousEnigmas)) {
    throw new Error("La liste des énigmes dans l’index Drive n’a pas un format valide.");
  }

  const extension = file.type === "image/png" ? "png" : "jpg";
  const name = `enigme-${day}.${extension}`;
  const fileId = await uploadImage(name, file);
  const previousFileId = previousEnigmas[dayKey];
  await updateEnigmaManifest(dayKey, (enigmas) => {
    enigmas[dayKey] = fileId;
  });
  if (typeof previousFileId === "string" && previousFileId !== fileId) {
    await deleteFileById(previousFileId);
  }
}

export async function deleteEnigma(day) {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("Le numéro de l’énigme doit être compris entre 1 et 31.");
  }
  const dayKey = String(day);
  const manifest = await readManifest();
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Le fichier d’index Drive n’a pas un format JSON valide.");
  }
  const fileId = manifest.enigmas?.[dayKey];
  if (typeof fileId !== "string") {
    throw new Error(`L’image de l’énigme ${day} n’existe pas dans Drive.`);
  }
  await updateEnigmaManifest(dayKey, (enigmas) => {
    delete enigmas[dayKey];
  });
  await deleteFileById(fileId);
}
