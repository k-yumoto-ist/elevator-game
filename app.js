const floors = ["B1", ...Array.from({ length: 39 }, (_, index) => String(index + 1))];
const doorOpenMs = 3600;
const doorMoveMs = 520;
const doorClosingAnnounceLeadMs = 1400;

const state = {
  current: 1,
  target: null,
  requests: new Set(),
  direction: 0,
  moving: false,
  doorsOpen: false,
  soundEnabled: true,
  runId: 0,
  doorTimer: null,
  doorSpeechTimer: null,
  audioContext: null,
  speechVoice: null,
  speechQueue: [],
  speechSpeaking: false,
  speechRetryTimer: null,
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
  soundToggle: document.querySelector("#soundToggle"),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const floorLabel = (index) => floors[index];

function floorSpeechLabel(index) {
  return index === 0 ? "地下1階" : `${index}階`;
}

function canUseAudio() {
  return state.soundEnabled;
}

function ensureAudioContext() {
  if (!canUseAudio()) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (state.audioContext === null) {
    state.audioContext = new AudioContext();
  }
  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }
  return state.audioContext;
}

function chooseJapaneseVoice() {
  if (!("speechSynthesis" in window) || typeof window.speechSynthesis.getVoices !== "function") return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((voice) => voice.lang === "ja-JP") ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("ja")) ||
    voices.find((voice) => voice.name.toLowerCase().includes("japanese")) ||
    null
  );
}

function prepareSpeechSynthesis() {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  state.speechVoice = chooseJapaneseVoice();
  window.speechSynthesis.resume();
  return true;
}

function unlockSound() {
  ensureAudioContext();
  prepareSpeechSynthesis();
}

function playTone(frequency, duration, volume = 0.06, delay = 0) {
  const audioContext = ensureAudioContext();
  if (!audioContext) return;

  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playButtonSound() {
  playTone(880, 0.08, 0.045);
}

function playArrivalChime() {
  playTone(660, 0.16, 0.055);
  playTone(880, 0.2, 0.05, 0.14);
}

function speak(text) {
  if (!canUseAudio() || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  prepareSpeechSynthesis();
  state.speechQueue.push(text);
  flushSpeechQueue();
}

function flushSpeechQueue() {
  if (!canUseAudio() || state.speechSpeaking || state.speechQueue.length === 0) return;
  if (!prepareSpeechSynthesis()) return;

  if (state.speechRetryTimer !== null) {
    window.clearTimeout(state.speechRetryTimer);
    state.speechRetryTimer = null;
  }

  const text = state.speechQueue.shift();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  if (state.speechVoice !== null) {
    utterance.voice = state.speechVoice;
  }
  utterance.onend = () => {
    state.speechSpeaking = false;
    flushSpeechQueue();
  };
  utterance.onerror = () => {
    state.speechSpeaking = false;
    state.speechRetryTimer = window.setTimeout(flushSpeechQueue, 180);
  };
  state.speechSpeaking = true;
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(utterance);
  window.setTimeout(() => window.speechSynthesis.resume(), 80);
}

function announceTravelStart(direction) {
  if (direction > 0) {
    speak("上へまいります");
  } else if (direction < 0) {
    speak("下へまいります");
  }
}

function announceArrival(floor) {
  playArrivalChime();
  window.setTimeout(() => speak(`${floorSpeechLabel(floor)}です`), 350);
}

function announceDoorClosing() {
  speak("ドアが閉まります");
}

function clearDoorTimer() {
  if (state.doorTimer !== null) {
    window.clearTimeout(state.doorTimer);
    state.doorTimer = null;
  }
  if (state.doorSpeechTimer !== null) {
    window.clearTimeout(state.doorSpeechTimer);
    state.doorSpeechTimer = null;
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
  state.doorSpeechTimer = window.setTimeout(() => {
    if (runId !== state.runId || state.moving || !state.doorsOpen) return;
    announceDoorClosing();
  }, Math.max(0, doorOpenMs - doorClosingAnnounceLeadMs));
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
  unlockSound();
  playButtonSound();

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
    announceDoorClosing();
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
  announceTravelStart(state.direction);
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
  const arrivedFloor = state.current;
  state.target = null;
  if (!hasRequests()) {
    state.direction = 0;
  }
  announceArrival(arrivedFloor);
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
  if (cancelTimer) {
    announceDoorClosing();
    clearDoorTimer();
  }
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
  elements.soundToggle.textContent = state.soundEnabled ? "音声 ON" : "音声 OFF";
  elements.soundToggle.classList.toggle("is-on", state.soundEnabled);
  elements.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));

  renderFloors();
  renderButtons();
}

elements.floorButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-floor]");
  if (!button) return;
  addTarget(button.dataset.floor);
});

elements.openDoor.addEventListener("click", () => {
  unlockSound();
  openDoors(true, hasRequests());
});
elements.closeDoor.addEventListener("click", () => {
  unlockSound();
  const shouldContinue = hasRequests() && state.target === null;
  closeDoors();
  if (shouldContinue) {
    window.setTimeout(() => startNextTarget(), doorMoveMs);
  }
});
elements.resetElevator.addEventListener("click", () => {
  unlockSound();
  resetElevator();
});
elements.soundToggle.addEventListener("click", () => {
  state.soundEnabled = !state.soundEnabled;
  if (!state.soundEnabled && "speechSynthesis" in window) {
    state.speechQueue = [];
    state.speechSpeaking = false;
    window.speechSynthesis.cancel();
  } else {
    unlockSound();
    speak("音声をオンにしました");
  }
  render();
});
window.addEventListener("resize", render);

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    state.speechVoice = chooseJapaneseVoice();
    flushSpeechQueue();
  };
  prepareSpeechSynthesis();
}

render();
