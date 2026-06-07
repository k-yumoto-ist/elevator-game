const floors = ["B1", ...Array.from({ length: 39 }, (_, index) => String(index + 1))];
const doorOpenMs = 1600;
const doorMoveMs = 320;

const state = {
  current: 1,
  target: null,
  requests: new Set(),
  direction: 0,
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

function hasRequests() {
  return state.requests.size > 0;
}

function sortedRequests() {
  return [...state.requests].sort((a, b) => a - b);
}

function pickNextTarget() {
  const requests = sortedRequests();
  if (requests.length === 0) return null;

  if (state.direction > 0) {
    const upward = requests.find((floor) => floor > state.current);
    if (upward !== undefined) return upward;
    state.direction = -1;
    return requests.filter((floor) => floor < state.current).pop() ?? requests[0];
  }

  if (state.direction < 0) {
    const downward = requests.filter((floor) => floor < state.current).pop();
    if (downward !== undefined) return downward;
    state.direction = 1;
    return requests.find((floor) => floor > state.current) ?? requests[requests.length - 1];
  }

  const nearest = requests.reduce((best, floor) => {
    const bestDistance = Math.abs(best - state.current);
    const floorDistance = Math.abs(floor - state.current);
    if (floorDistance !== bestDistance) return floorDistance < bestDistance ? floor : best;
    return floor > state.current ? floor : best;
  }, requests[0]);
  state.direction = Math.sign(nearest - state.current);
  return nearest;
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

  if (state.target === next || state.requests.has(next)) return;

  if (state.moving && state.target !== null) {
    if (next === state.current) {
      state.requests.add(state.target);
      state.target = next;
      render();
      return;
    }

    const isAheadOnUp = state.target > state.current && next > state.current && next < state.target;
    const isAheadOnDown = state.target < state.current && next < state.current && next > state.target;
    if (isAheadOnUp || isAheadOnDown) {
      state.requests.add(state.target);
      state.target = next;
      state.direction = Math.sign(state.target - state.current);
      render();
      return;
    }
  }

  state.requests.add(next);
  render();
  startNextTarget();
}

async function startNextTarget(runId = state.runId) {
  if (state.moving || state.target !== null || !hasRequests()) return;

  state.runId = runId === state.runId ? state.runId + 1 : state.runId;
  const activeRunId = state.runId;
  clearDoorTimer();

  if (state.doorsOpen) {
    closeDoors(false);
    await sleep(doorMoveMs);
    if (activeRunId !== state.runId) return;
  }

  state.target = pickNextTarget();
  if (state.target === null) {
    state.direction = 0;
    render();
    return;
  }

  state.requests.delete(state.target);
  state.direction = Math.sign(state.target - state.current) || state.direction;
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
  if (!hasRequests()) {
    state.direction = 0;
  }
  openDoors(true, hasRequests());
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
  state.requests.clear();
  state.direction = 0;
  state.doorsOpen = false;
  render();
}

function requestedFloors() {
  return new Set([state.target, ...state.requests].filter((floor) => floor !== null));
}

function renderFloors() {
  const requested = requestedFloors();
  elements.floorStack.innerHTML = floors
    .map(
      (label, index) => `
        <div class="floor-row ${index === state.current ? "is-current" : ""} ${requested.has(index) ? "is-target" : ""}">
          <span>${label}</span>
          <span class="floor-line"></span>
        </div>
      `,
    )
    .join("");
}

function renderButtons() {
  const requested = requestedFloors();
  elements.floorButtons.innerHTML = floors
    .slice()
    .reverse()
    .map((label) => {
      const index = floors.indexOf(label);
      return `<button class="floor-button ${requested.has(index) ? "is-active" : ""}" type="button" data-floor="${index}">${label}</button>`;
    })
    .join("");
}

function render() {
  const maxTravel = Math.max(0, elements.car.parentElement.clientHeight - elements.car.clientHeight - 10);
  const progress = state.current / (floors.length - 1);
  const moveDirection = state.target === null ? state.direction : Math.sign(state.target - state.current);
  const requestLabels = sortedRequests().map(floorLabel);

  elements.car.style.bottom = `${progress * maxTravel + 5}px`;
  elements.car.classList.toggle("doors-open", state.doorsOpen);

  elements.currentFloor.textContent = floorLabel(state.current);
  elements.screenFloor.textContent = floorLabel(state.current);
  elements.carDisplay.textContent = floorLabel(state.current);
  elements.targetFloor.textContent =
    state.target === null ? (requestLabels.length > 0 ? requestLabels.join(", ") : "なし") : floorLabel(state.target);
  elements.motionState.textContent = state.moving ? "移動中" : state.doorsOpen ? "ドア開" : "待機中";
  elements.direction.textContent = moveDirection > 0 ? "▲" : moveDirection < 0 ? "▼" : "・";
  elements.screenHint.textContent = state.moving
    ? `${floorLabel(state.target)}へ移動中`
    : state.doorsOpen
      ? hasRequests()
        ? "ドアが閉まると次へ向かいます"
        : "ドアが開いています"
      : hasRequests()
        ? `予約: ${requestLabels.join(", ")}`
        : "階数ボタンを押してください";

  elements.openDoor.disabled = state.moving || state.doorsOpen;
  elements.closeDoor.disabled = state.moving || !state.doorsOpen;
  elements.resetElevator.disabled = state.moving || (state.current === 1 && !hasRequests());

  renderFloors();
  renderButtons();
}

elements.floorButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-floor]");
  if (!button) return;
  addTarget(button.dataset.floor);
});

elements.openDoor.addEventListener("click", () => openDoors(true, hasRequests()));
elements.closeDoor.addEventListener("click", () => {
  const shouldContinue = hasRequests() && state.target === null;
  closeDoors();
  if (shouldContinue) {
    window.setTimeout(() => startNextTarget(), doorMoveMs);
  }
});
elements.resetElevator.addEventListener("click", resetElevator);
window.addEventListener("resize", render);

render();
