const cases = [
  { number: 1, x: 293, y: 121, width: 97, height: 99 },
  { number: 2, x: 409, y: 121, width: 99, height: 99 },
  { number: 5, x: 528, y: 121, width: 98, height: 99 },
  { number: 6, x: 646, y: 121, width: 94, height: 99 },
  { number: 2, x: 293, y: 245, width: 97, height: 100 },
  { number: 10, x: 409, y: 245, width: 99, height: 100 },
  { number: 7, x: 528, y: 245, width: 98, height: 100 },
  { number: 5, x: 646, y: 245, width: 94, height: 100 },
  { number: 2, x: 293, y: 366, width: 97, height: 99 },
  { number: 1, x: 409, y: 366, width: 99, height: 99 },
  { number: 11, x: 528, y: 366, width: 98, height: 99 },
  { number: 8, x: 646, y: 366, width: 94, height: 99 },
  { number: 15, x: 293, y: 484, width: 97, height: 99 },
  { number: 14, x: 409, y: 484, width: 99, height: 99 },
  { number: 12, x: 528, y: 484, width: 98, height: 99 },
  { number: 10, x: 646, y: 484, width: 94, height: 99 },
  { number: 0, x: 293, y: 603, width: 97, height: 98 },
  { number: 103, x: 409, y: 603, width: 99, height: 98 },
  { number: 17, x: 528, y: 603, width: 98, height: 98 },
  { number: 9, x: 646, y: 603, width: 94, height: 98 },
  { number: 3, x: 293, y: 721, width: 97, height: 99 },
  { number: 10, x: 409, y: 721, width: 99, height: 99 },
  { number: 10, x: 528, y: 721, width: 98, height: 99 },
  { number: 20, x: 646, y: 721, width: 94, height: 99 },
  { number: 4, x: 293, y: 841, width: 97, height: 98 },
  { number: 10, x: 409, y: 841, width: 99, height: 98 },
  { number: 5, x: 528, y: 841, width: 98, height: 98 },
  { number: 25, x: 646, y: 841, width: 94, height: 98 },
];

const board = document.querySelector("#board");
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modal-title");
const modalImage = document.querySelector("#enigma-image");
const modalMessage = document.querySelector("#modal-message");
const closeButton = document.querySelector("#close-button");
let lastFocusedElement = null;
const imageByNumber = new Map();
const boardBounds = board.getBoundingClientRect();
const visibleImageWidth = 1024 * (boardBounds.width / boardBounds.height);
const imageCropX = (1024 - visibleImageWidth) / 2;

for (const item of cases) {
  findEnigmaImage(item.number).then((extension) => {
    if (!extension) return;

    const button = document.createElement("button");
    button.className = "case-button";
    button.type = "button";
    button.setAttribute("aria-label", `Ouvrir l’énigme ${item.number}`);
    button.title = `Ouvrir l’énigme ${item.number}`;
    button.style.left = `${((item.x - imageCropX) / visibleImageWidth) * 100}%`;
    button.style.top = `${(item.y / 1024) * 100}%`;
    button.style.width = `${(item.width / visibleImageWidth) * 100}%`;
    button.style.height = `${(item.height / 1024) * 100}%`;
    button.addEventListener("click", () => openEnigma(item.number, extension, button));
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
