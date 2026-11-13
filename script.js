const cases = [
  { x: 293, y: 121, width: 97, height: 99 },
  { x: 409, y: 121, width: 99, height: 99 },
  { x: 528, y: 121, width: 98, height: 99 },
  { x: 646, y: 121, width: 94, height: 99 },
  { x: 293, y: 245, width: 97, height: 100 },
  { x: 409, y: 245, width: 99, height: 100 },
  { x: 528, y: 245, width: 98, height: 100 },
  { x: 646, y: 245, width: 94, height: 100 },
  { x: 293, y: 366, width: 97, height: 99 },
  { x: 409, y: 366, width: 99, height: 99 },
  { x: 528, y: 366, width: 98, height: 99 },
  { x: 646, y: 366, width: 94, height: 99 },
  { x: 293, y: 484, width: 97, height: 99 },
  { x: 409, y: 484, width: 99, height: 99 },
  { x: 528, y: 484, width: 98, height: 99 },
  { x: 646, y: 484, width: 94, height: 99 },
  { x: 293, y: 603, width: 97, height: 98 },
  { x: 409, y: 603, width: 99, height: 98 },
  { x: 528, y: 603, width: 98, height: 98 },
  { x: 646, y: 603, width: 94, height: 98 },
  { x: 293, y: 721, width: 97, height: 99 },
  { x: 409, y: 721, width: 99, height: 99 },
  { x: 528, y: 721, width: 98, height: 99 },
  { x: 646, y: 721, width: 94, height: 99 },
].map((item, index) => ({ ...item, number: index + 1 }));

const board = document.querySelector("#board");
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modal-title");
const modalImage = document.querySelector("#enigma-image");
const modalMessage = document.querySelector("#modal-message");
const closeButton = document.querySelector("#close-button");
let lastFocusedElement = null;
const imageByNumber = new Map();
const boardCrop = { x: 260, y: 56, width: 514, height: 764 };

for (const item of cases) {
  findEnigmaImage(item.number).then((extension) => {
    const button = document.createElement("button");
    button.className = "case-button";
    button.type = "button";
    button.setAttribute(
      "aria-label",
      extension ? `Ouvrir l’énigme ${item.number}` : `Case ${item.number}, énigme indisponible`,
    );
    button.title = extension
      ? `Ouvrir l’énigme ${item.number}`
      : `L’énigme ${item.number} n’est pas encore disponible`;
    button.disabled = !extension;
    button.style.left = `${((item.x - boardCrop.x) / boardCrop.width) * 100}%`;
    button.style.top = `${((item.y - boardCrop.y) / boardCrop.height) * 100}%`;
    button.style.width = `${(item.width / boardCrop.width) * 100}%`;
    button.style.height = `${(item.height / boardCrop.height) * 100}%`;

    const dayNumber = document.createElement("span");
    dayNumber.className = "day-number";
    dayNumber.setAttribute("aria-hidden", "true");
    dayNumber.textContent = item.number;
    button.append(dayNumber);

    if (extension) {
      button.addEventListener("click", () => openEnigma(item.number, extension, button));
    }

    board.append(button);
  });
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
    trigger.remove();
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
