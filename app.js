const floors = ["B1", ...Array.from({ length: 39 }, (_, index) => String(index + 1))];
const doorOpenMs = 1600;
const doorMoveMs = 320;

const state = {
  current: 1,
  target: null,
  queue: [],
  moving: false,
  doorsOpen: false,
  runId: 0,
  doorTimer: null,
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

function clearDoorTimer() {
  if (state.doorTimer !== null) {
    window.clearTimeout(state.doorTimer);
    state.doorTimer = null;
  }
}

function scheduleAutoClose(runId, continueAfterClose = false) {
  clearDoorTimer();
  state.doorTimer = window.setTimeout(() => {
    if (runId !== state.runId || state.moving) return;
    closeDoors(false);
    if (continueAfterClose) {
      window.setTimeout(() => startNextTarget(runId), doorMoveMs);
    }
  }, doorOpenMs);
}

function addTarget(floor) {
  const next = Number(floor);
  if (Number.isNaN(next)) return;

  if (next === state.current && !state.moving) {
    state.runId += 1;
    clearDoorTimer();
    state.target = null;
    openDoors(true);
    return;
  }

  if (state.target === next || state.queue.includes(next)) {
    return;
  }

  state.queue.push(next);
  render();
  startNextTarget();
}

async function startNextTarget(runId = state.runId) {
  if (state.moving || state.target !== null || state.queue.length === 0) return;

  state.runId = runId === state.runId ? state.runId + 1 : state.runId;
  const activeRunId = state.runId;
  clearDoorTimer();

  if (state.doorsOpen) {
    closeDoors(false);
    await sleep(doorMoveMs);
    if (activeRunId !== state.runId) return;
  }

  state.target = state.queue.shift();
  render();
  moveToTarget(activeRunId);
}

async function moveToTarget(runId) {
  if (state.target === null || state.target === state.current) return;

  state.moving = true;
  while (state.current !== state.target) {
    if (runId !== state.runId) return;
    state.current += state.target > state.current ? 1 : -1;
    render();
    await sleep(260);
  }

  state.moving = false;
  state.target = null;
  openDoors(true, state.queue.length > 0);
}

function openDoors(autoClose = true, continueAfterClose = false) {
  if (state.moving) return;
  state.doorsOpen = true;
  render();
  if (autoClose) {
    scheduleAutoClose(state.runId, continueAfterClose);
  }
}

function closeDoors(cancelTimer = true) {
  if (cancelTimer) clearDoorTimer();
  state.doorsOpen = false;
  render();
}

function resetElevator() {
  if (state.moving) return;
  state.runId += 1;
  clearDoorTimer();
  state.current = 1;
  state.target = null;
  state.queue = [];
  state.doorsOpen = false;
  render();
}

function queuedFloors() {
  return new Set([state.target, ...state.queue].filter((floor) => floor !== null));
}

function renderFloors() {
  const queued = queuedFloors();
  elements.floorStack.innerHTML = floors
    .map(
      (label, index) => `
        <div class="floor-row ${index === state.current ? "is-current" : ""} ${queued.has(index) ? "is-target" : ""}">
          <span>${label}</span>
          <span class="floor-line"></span>
        </div>
      `,
    )
    .join("");
}

function renderButtons() {
  const queued = queuedFloors();
  elements.floorButtons.innerHTML = floors
    .slice()
    .reverse()
    .map((label) => {
      const index = floors.indexOf(label);
      return `<button class="floor-button ${queued.has(index) ? "is-active" : ""}" type="button" data-floor="${index}">${label}</button>`;
    })
    .join("");
}

function render() {
  const maxTravel = Math.max(0, elements.car.parentElement.clientHeight - elements.car.clientHeight - 10);
  const progress = state.current / (floors.length - 1);
  const direction = state.target === null ? 0 : Math.sign(state.target - state.current);
  const queuedLabels = state.queue.map(floorLabel);

  elements.car.style.bottom = `${progress * maxTravel + 5}px`;
  elements.car.classList.toggle("doors-open", state.doorsOpen);

  elements.currentFloor.textContent = floorLabel(state.current);
  elements.screenFloor.textContent = floorLabel(state.current);
  elements.carDisplay.textContent = floorLabel(state.current);
  elements.targetFloor.textContent =
    state.target === null ? (queuedLabels.length > 0 ? queuedLabels.join(", ") : "なし") : floorLabel(state.target);
  elements.motionState.textContent = state.moving ? "移動中" : state.doorsOpen ? "ドア開" : "待機中";
  elements.direction.textContent = direction > 0 ? "▲" : direction < 0 ? "▼" : "・";
  elements.screenHint.textContent = state.moving
    ? `${floorLabel(state.target)}へ移動中`
    : state.doorsOpen
      ? state.queue.length > 0
        ? "ドアが閉まると次へ向かいます"
        : "ドアが開いています"
      : state.queue.length > 0
        ? `次: ${floorLabel(state.queue[0])}`
        : "階数ボタンを押してください";

  elements.openDoor.disabled = state.moving || state.doorsOpen;
  elements.closeDoor.disabled = state.moving || !state.doorsOpen;
  elements.resetElevator.disabled = state.moving || (state.current === 1 && state.queue.length === 0);

  renderFloors();
  renderButtons();
}

elements.floorButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-floor]");
  if (!button) return;
  addTarget(button.dataset.floor);
});

elements.openDoor.addEventListener("click", () => openDoors(true, state.queue.length > 0));
elements.closeDoor.addEventListener("click", () => {
  const shouldContinue = state.queue.length > 0 && state.target === null;
  closeDoors();
  if (shouldContinue) {
    window.setTimeout(() => startNextTarget(), doorMoveMs);
  }
});
elements.resetElevator.addEventListener("click", resetElevator);
window.addEventListener("resize", render);

render();
