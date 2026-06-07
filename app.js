const floors = ["B1", ...Array.from({ length: 39 }, (_, index) => String(index + 1))];

const state = {
  current: 1,
  target: null,
  moving: false,
  doorsOpen: false,
  runId: 0,
};

const elements = {
  currentFloor: document.querySelector("#currentFloor"),
  targetFloor: document.querySelector("#targetFloor"),
  motionState: document.querySelector("#motionState"),
  car: document.querySelector("#car"),
  carDisplay: document.querySelector("#carDisplay"),
  floorStack: document.querySelector("#floorStack"),
  floorButtons: document.querySelector("#floorButtons"),
  direction: document.querySelector("#direction"),
  screenFloor: document.querySelector("#screenFloor"),
  screenHint: document.querySelector("#screenHint"),
  openDoor: document.querySelector("#openDoor"),
  closeDoor: document.querySelector("#closeDoor"),
  resetElevator: document.querySelector("#resetElevator"),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const floorLabel = (index) => floors[index];

function setTarget(floor) {
  const next = Number(floor);
  if (Number.isNaN(next) || state.moving) return;

  state.runId += 1;
  state.target = next;
  state.doorsOpen = false;
  render();
  moveToTarget(state.runId);
}

async function moveToTarget(runId) {
  if (state.target === null || state.target === state.current) {
    state.target = null;
    render();
    return;
  }

  state.moving = true;
  while (state.current !== state.target) {
    if (runId !== state.runId) return;
    state.current += state.target > state.current ? 1 : -1;
    render();
    await sleep(260);
  }

  state.moving = false;
  state.target = null;
  render();
}

function openDoors() {
  if (state.moving) return;
  state.doorsOpen = true;
  render();
}

function closeDoors() {
  state.doorsOpen = false;
  render();
}

function resetElevator() {
  if (state.moving) return;
  state.runId += 1;
  state.current = 1;
  state.target = null;
  state.doorsOpen = false;
  render();
}

function renderFloors() {
  elements.floorStack.innerHTML = floors
    .map(
      (label, index) => `
        <div class="floor-row ${index === state.current ? "is-current" : ""} ${index === state.target ? "is-target" : ""}">
          <span>${label}</span>
          <span class="floor-line"></span>
        </div>
      `,
    )
    .join("");
}

function renderButtons() {
  elements.floorButtons.innerHTML = floors
    .slice()
    .reverse()
    .map((label) => {
      const index = floors.indexOf(label);
      return `<button class="floor-button ${index === state.target ? "is-active" : ""}" type="button" data-floor="${index}">${label}</button>`;
    })
    .join("");
}

function render() {
  const maxTravel = Math.max(0, elements.car.parentElement.clientHeight - elements.car.clientHeight - 10);
  const progress = state.current / (floors.length - 1);
  const direction = state.target === null ? 0 : Math.sign(state.target - state.current);

  elements.car.style.bottom = `${progress * maxTravel + 5}px`;
  elements.car.classList.toggle("doors-open", state.doorsOpen);

  elements.currentFloor.textContent = floorLabel(state.current);
  elements.screenFloor.textContent = floorLabel(state.current);
  elements.carDisplay.textContent = floorLabel(state.current);
  elements.targetFloor.textContent = state.target === null ? "なし" : floorLabel(state.target);
  elements.motionState.textContent = state.moving ? "移動中" : state.doorsOpen ? "ドア開" : "待機中";
  elements.direction.textContent = direction > 0 ? "▲" : direction < 0 ? "▼" : "・";
  elements.screenHint.textContent = state.moving
    ? `${floorLabel(state.target)}へ移動中`
    : state.doorsOpen
      ? "ドアが開いています"
      : "階数ボタンを押してください";

  elements.openDoor.disabled = state.moving || state.doorsOpen;
  elements.closeDoor.disabled = state.moving || !state.doorsOpen;
  elements.resetElevator.disabled = state.moving || state.current === 1;

  renderFloors();
  renderButtons();
}

elements.floorButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-floor]");
  if (!button) return;
  setTarget(button.dataset.floor);
});

elements.openDoor.addEventListener("click", openDoors);
elements.closeDoor.addEventListener("click", closeDoors);
elements.resetElevator.addEventListener("click", resetElevator);
window.addEventListener("resize", render);

render();
