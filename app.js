const text = {
  mode39: "\u0033\u0039\u968e\u30e2\u30fc\u30c9",
  mode50: "\u0035\u0030\u968e\u30e2\u30fc\u30c9",
  none: "\u306a\u3057",
  idle: "\u5f85\u6a5f\u4e2d",
  up: "\u4e0a\u6607\u4e2d",
  down: "\u4e0b\u964d\u4e2d",
  doorMoving: "\u30c9\u30a2\u52d5\u4f5c\u4e2d",
  doorOpen: "\u30c9\u30a2\u958b",
  reserved: "\u4e88\u7d04\u3042\u308a",
  soundOn: "\u97f3\u58f0ON",
  soundOff: "\u97f3\u58f0OFF",
  basementOne: "\u5730\u4e0b1\u968e",
  floorSuffix: "\u968e",
  arrivalSuffix: "\u3067\u3059",
  goingUp: "\u4e0a\u3078\u307e\u3044\u308a\u307e\u3059",
  goingDown: "\u4e0b\u3078\u307e\u3044\u308a\u307e\u3059",
  doorClosing: "\u30c9\u30a2\u304c\u9589\u307e\u308a\u307e\u3059",
};

const buildingModes = {
  normal: {
    label: text.mode39,
    minFloor: "B1",
    maxFloor: 39,
  },
  high50: {
    label: text.mode50,
    minFloor: "B1",
    maxFloor: 50,
  },
};

const elements = {
  currentFloor: document.getElementById("currentFloor"),
  currentFloorHero: document.getElementById("currentFloorHero"),
  targetFloor: document.getElementById("targetFloor"),
  motionState: document.getElementById("motionState"),
  floorButtons: document.getElementById("floorButtons"),
  floorStack: document.getElementById("floorStack"),
  car: document.getElementById("car"),
  carDisplay: document.getElementById("carDisplay"),
  direction: document.getElementById("direction"),
  screenFloor: document.getElementById("screenFloor"),
  screenHint: document.getElementById("screenHint"),
  openDoor: document.getElementById("openDoor"),
  closeDoor: document.getElementById("closeDoor"),
  resetElevator: document.getElementById("resetElevator"),
  soundToggle: document.getElementById("soundToggle"),
  modeButtons: Array.prototype.slice.call(document.querySelectorAll("[data-mode]")),
};

const timing = {
  floorTravel: 820,
  doorMotion: 1250,
  dwell: 3000,
  closeWarningLead: 1400,
};

const speechTimings = {
  depart: 1300,
  arrival: 1200,
  closing: 1200,
};

const elevator = {
  mode: "normal",
  currentFloor: 1,
  targetFloor: null,
  direction: 0,
  requests: [],
  moving: false,
  doorsOpen: false,
  doorMoving: false,
  soundEnabled: true,
  runId: 0,
};

let floors = createFloorsForMode(elevator.mode);
let audioContext = null;
let closeTimer = null;
let closeWarningTimer = null;
let speechQueue = [];
let speaking = false;
let speechVoice = null;
let speechRetryTimer = null;

function createFloorsForMode(modeKey) {
  const mode = buildingModes[modeKey] || buildingModes.normal;
  const list = [mode.minFloor];

  for (let floor = 1; floor <= mode.maxFloor; floor += 1) {
    list.push(floor);
  }

  return list;
}

function floorValue(floor) {
  return floor === "B1" ? 0 : Number(floor);
}

function floorLabel(floor) {
  return floor === "B1" ? "B1" : `${floor}F`;
}

function floorSpeechLabel(floor) {
  return floor === "B1" ? text.basementOne : `${floor}${text.floorSuffix}`;
}

function floorFromValue(value) {
  return value === 0 ? "B1" : value;
}

function getSpeechCtor() {
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  return window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance || root.SpeechSynthesisUtterance || null;
}

function hasSpeech() {
  return "speechSynthesis" in window && getSpeechCtor() !== null;
}

function getVoices() {
  if (!("speechSynthesis" in window) || typeof window.speechSynthesis.getVoices !== "function") {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

function pickJapaneseVoice() {
  const voices = getVoices();

  for (let index = 0; index < voices.length; index += 1) {
    if (voices[index].lang === "ja-JP") return voices[index];
  }

  for (let index = 0; index < voices.length; index += 1) {
    if (voices[index].lang && voices[index].lang.toLowerCase().indexOf("ja") === 0) return voices[index];
  }

  for (let index = 0; index < voices.length; index += 1) {
    if (voices[index].name && voices[index].name.toLowerCase().indexOf("japanese") !== -1) return voices[index];
  }

  return null;
}

function prepareSpeech() {
  if (!hasSpeech()) return false;
  speechVoice = pickJapaneseVoice();

  try {
    window.speechSynthesis.resume();
  } catch (error) {
    // Some WebKit builds throw before a voice is selected. The next user tap will retry.
  }

  return true;
}

function unlockSound() {
  getAudioContext();
  prepareSpeech();
}

function getAudioContext() {
  if (!elevator.soundEnabled) return null;

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone(frequency, duration, type = "sine", gainValue = 0.12, delay = 0) {
  if (!elevator.soundEnabled) return;

  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime + delay;
  const endAt = startAt + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

function playButtonSound() {
  playTone(920, 0.08, "triangle", 0.11);
}

function playChime() {
  playTone(880, 0.16, "sine", 0.12);
  playTone(1320, 0.18, "sine", 0.1, 0.14);
}

function speak(message, estimatedDuration = 1000) {
  if (!elevator.soundEnabled || !prepareSpeech()) return;

  speechQueue.push({ message, estimatedDuration });
  runSpeechQueue();
}

function finishSpeech() {
  speaking = false;
  window.setTimeout(runSpeechQueue, 120);
}

function runSpeechQueue() {
  if (speaking || speechQueue.length === 0 || !hasSpeech()) return;

  const SpeechCtor = getSpeechCtor();
  const item = speechQueue.shift();
  const utterance = new SpeechCtor(item.message);

  speaking = true;
  utterance.lang = "ja-JP";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  if (speechVoice) {
    utterance.voice = speechVoice;
  }

  utterance.onend = finishSpeech;
  utterance.onerror = finishSpeech;

  try {
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => window.speechSynthesis.resume(), 100);
    window.setTimeout(() => window.speechSynthesis.resume(), 350);
    window.setTimeout(finishSpeech, item.estimatedDuration + 1300);
  } catch (error) {
    finishSpeech();
  }
}

function clearSpeech() {
  speechQueue = [];
  speaking = false;

  if (speechRetryTimer !== null) {
    window.clearTimeout(speechRetryTimer);
    speechRetryTimer = null;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function modeCanChange() {
  return !elevator.moving && !elevator.doorsOpen && !elevator.doorMoving;
}

function renderFloors() {
  elements.floorButtons.innerHTML = "";

  floors
    .slice()
    .reverse()
    .forEach((floor) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "floor-button";
      button.textContent = floorLabel(floor);
      button.setAttribute("data-floor", String(floor));
      button.disabled = elevator.currentFloor === floor && elevator.doorsOpen;
      button.addEventListener("click", () => addRequest(floor));
      elements.floorButtons.appendChild(button);
    });

  elements.floorStack.innerHTML = "";

  floors
    .slice()
    .reverse()
    .forEach((floor) => {
      const tick = document.createElement("span");
      tick.className = floor === elevator.currentFloor ? "floor-tick is-current" : "floor-tick";
      tick.textContent = floorLabel(floor);
      elements.floorStack.appendChild(tick);
    });
}

function render() {
  const currentLabel = floorLabel(elevator.currentFloor);
  const targetLabel = elevator.targetFloor === null ? text.none : floorLabel(elevator.targetFloor);
  const status = getStatusLabel();
  const modeChangeable = modeCanChange();

  elements.currentFloor.textContent = currentLabel;
  elements.currentFloorHero.textContent = currentLabel;
  elements.targetFloor.textContent = targetLabel;
  elements.motionState.textContent = status;
  elements.carDisplay.textContent = currentLabel;
  elements.screenFloor.textContent = currentLabel;
  elements.screenHint.textContent = status;
  elements.direction.textContent = elevator.direction > 0 ? "\u25b2" : elevator.direction < 0 ? "\u25bc" : "\u25a0";

  elements.car.classList.toggle("is-open", elevator.doorsOpen);
  elements.car.classList.toggle("is-moving", elevator.moving);

  const maxValue = floorValue(floors[floors.length - 1]);
  const currentValue = floorValue(elevator.currentFloor);
  const position = maxValue === 0 ? 0 : (currentValue / maxValue) * 100;
  elements.car.style.bottom = `calc(${position}% - 36px)`;

  elements.floorButtons.querySelectorAll(".floor-button").forEach((button) => {
    const buttonFloor = button.getAttribute("data-floor");
    const floor = buttonFloor === "B1" ? "B1" : Number(buttonFloor);
    button.classList.toggle("is-requested", elevator.requests.indexOf(floor) !== -1);
    button.classList.toggle("is-current", elevator.currentFloor === floor);
    button.disabled = elevator.currentFloor === floor && elevator.doorsOpen;
  });

  elements.floorStack.querySelectorAll(".floor-tick").forEach((tick) => {
    tick.classList.toggle("is-current", tick.textContent === currentLabel);
  });

  elements.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-mode") === elevator.mode);
    button.disabled = !modeChangeable || button.getAttribute("data-mode") === elevator.mode;
  });

  elements.openDoor.disabled = elevator.moving || elevator.doorsOpen || elevator.doorMoving;
  elements.closeDoor.disabled = elevator.moving || !elevator.doorsOpen || elevator.doorMoving;
  elements.resetElevator.disabled = elevator.moving || elevator.doorsOpen || elevator.doorMoving;
  elements.soundToggle.textContent = elevator.soundEnabled ? text.soundOn : text.soundOff;
  elements.soundToggle.setAttribute("aria-pressed", String(elevator.soundEnabled));
}

function getStatusLabel() {
  if (elevator.moving) return elevator.direction > 0 ? text.up : text.down;
  if (elevator.doorMoving) return text.doorMoving;
  if (elevator.doorsOpen) return text.doorOpen;
  if (elevator.requests.length > 0) return text.reserved;
  return text.idle;
}

function addRequest(floor) {
  unlockSound();

  if (elevator.currentFloor === floor && !elevator.moving) {
    playButtonSound();
    openDoors();
    return;
  }

  if (elevator.requests.indexOf(floor) === -1) {
    elevator.requests.push(floor);
  }

  playButtonSound();
  chooseNextTarget();
  render();

  if (!elevator.moving && !elevator.doorsOpen && !elevator.doorMoving) {
    startMoving();
  }
}

function chooseNextTarget() {
  if (elevator.requests.length === 0) {
    elevator.targetFloor = null;
    elevator.direction = 0;
    return;
  }

  const currentValue = floorValue(elevator.currentFloor);
  const ordered = elevator.requests.slice().sort((a, b) => floorValue(a) - floorValue(b));

  if (elevator.direction > 0) {
    const upward = ordered.find((floor) => floorValue(floor) > currentValue);
    elevator.targetFloor = upward !== undefined ? upward : ordered[ordered.length - 1];
    elevator.direction = upward !== undefined ? 1 : -1;
    return;
  }

  if (elevator.direction < 0) {
    const downward = ordered
      .slice()
      .reverse()
      .find((floor) => floorValue(floor) < currentValue);
    elevator.targetFloor = downward !== undefined ? downward : ordered[0];
    elevator.direction = downward !== undefined ? -1 : 1;
    return;
  }

  elevator.targetFloor = ordered.reduce((nearest, floor) => {
    const distance = Math.abs(floorValue(floor) - currentValue);
    const nearestDistance = Math.abs(floorValue(nearest) - currentValue);
    return distance < nearestDistance ? floor : nearest;
  }, ordered[0]);

  elevator.direction = Math.sign(floorValue(elevator.targetFloor) - currentValue);
}

function startMoving() {
  if (elevator.targetFloor === null || elevator.moving) return;

  const nextDirection = Math.sign(floorValue(elevator.targetFloor) - floorValue(elevator.currentFloor));

  if (nextDirection === 0) {
    arriveAtFloor();
    return;
  }

  elevator.direction = nextDirection;
  elevator.moving = true;
  elevator.runId += 1;

  speak(elevator.direction > 0 ? text.goingUp : text.goingDown, speechTimings.depart);
  render();
  moveOneFloor(elevator.runId);
}

function moveOneFloor(runId) {
  if (runId !== elevator.runId || !elevator.moving) return;

  window.setTimeout(() => {
    if (runId !== elevator.runId || !elevator.moving) return;

    const nextValue = floorValue(elevator.currentFloor) + elevator.direction;
    elevator.currentFloor = floorFromValue(nextValue);

    if (elevator.requests.indexOf(elevator.currentFloor) !== -1) {
      arriveAtFloor();
      return;
    }

    chooseNextTarget();

    if (elevator.targetFloor === null) {
      elevator.moving = false;
      elevator.direction = 0;
      render();
      return;
    }

    render();
    moveOneFloor(runId);
  }, timing.floorTravel);
}

function arriveAtFloor() {
  elevator.moving = false;
  elevator.requests = elevator.requests.filter((floor) => floor !== elevator.currentFloor);
  elevator.targetFloor = null;

  playChime();
  speak(`${floorSpeechLabel(elevator.currentFloor)}${text.arrivalSuffix}`, speechTimings.arrival);
  openDoors();
}

function openDoors() {
  if (elevator.moving || elevator.doorMoving) return;

  clearDoorTimers();
  elevator.doorsOpen = true;
  elevator.doorMoving = true;
  elevator.direction = 0;
  render();

  window.setTimeout(() => {
    elevator.doorMoving = false;
    render();
  }, timing.doorMotion);

  closeWarningTimer = window.setTimeout(() => {
    speak(text.doorClosing, speechTimings.closing);
  }, Math.max(0, timing.dwell - timing.closeWarningLead));

  closeTimer = window.setTimeout(() => {
    closeDoors({ auto: true });
  }, timing.dwell);
}

function closeDoors({ auto = false } = {}) {
  if (elevator.moving || !elevator.doorsOpen || elevator.doorMoving) return;

  clearDoorTimers();

  if (!auto) {
    speak(text.doorClosing, speechTimings.closing);
  }

  elevator.doorMoving = true;
  render();

  const closeStartDelay = auto ? 0 : 600;

  window.setTimeout(() => {
    elevator.doorsOpen = false;
    render();

    window.setTimeout(() => {
      elevator.doorMoving = false;
      chooseNextTarget();
      render();

      if (elevator.targetFloor !== null) {
        startMoving();
      }
    }, timing.doorMotion);
  }, closeStartDelay);
}

function clearDoorTimers() {
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  if (closeWarningTimer) {
    window.clearTimeout(closeWarningTimer);
    closeWarningTimer = null;
  }
}

function resetElevator() {
  if (elevator.moving || elevator.doorsOpen || elevator.doorMoving) return;

  clearDoorTimers();
  clearSpeech();
  elevator.currentFloor = 1;
  elevator.targetFloor = null;
  elevator.direction = 0;
  elevator.requests = [];
  elevator.moving = false;
  elevator.doorsOpen = false;
  elevator.doorMoving = false;
  elevator.runId += 1;
  render();
}

function switchMode(modeKey) {
  if (!buildingModes[modeKey] || modeKey === elevator.mode || !modeCanChange()) return;

  clearDoorTimers();
  clearSpeech();
  elevator.mode = modeKey;
  floors = createFloorsForMode(modeKey);
  elevator.currentFloor = 1;
  elevator.targetFloor = null;
  elevator.direction = 0;
  elevator.requests = [];
  elevator.moving = false;
  elevator.doorsOpen = false;
  elevator.doorMoving = false;
  elevator.runId += 1;

  renderFloors();
  render();
}

function toggleSound() {
  elevator.soundEnabled = !elevator.soundEnabled;
  if (!elevator.soundEnabled) {
    clearSpeech();
  } else {
    unlockSound();
  }
  render();
}

function bindEvents() {
  elements.openDoor.addEventListener("click", () => {
    unlockSound();
    playButtonSound();
    openDoors();
  });

  elements.closeDoor.addEventListener("click", () => {
    unlockSound();
    playButtonSound();
    closeDoors();
  });

  elements.resetElevator.addEventListener("click", () => {
    unlockSound();
    playButtonSound();
    resetElevator();
  });

  elements.soundToggle.addEventListener("click", () => {
    playButtonSound();
    toggleSound();
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      unlockSound();
      playButtonSound();
      switchMode(button.getAttribute("data-mode"));
    });
  });

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      speechVoice = pickJapaneseVoice();
      if (speechRetryTimer !== null) {
        window.clearTimeout(speechRetryTimer);
      }
      speechRetryTimer = window.setTimeout(runSpeechQueue, 120);
    };
  }
}

bindEvents();
renderFloors();
render();
