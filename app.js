const buildingModes = {
  normal: {
    label: "39階モード",
    minFloor: "B1",
    maxFloor: 39,
  },
  high50: {
    label: "50階モード",
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
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
};

const timing = {
  floorTravel: 820,
  doorMotion: 1250,
  dwell: 2600,
  closeWarningLead: 1200,
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
  return floor === "B1" ? "地下1階" : `${floor}階`;
}

function floorFromValue(value) {
  return value === 0 ? "B1" : value;
}

function getAudioContext() {
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

function pickJapaneseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((voice) => voice.lang === "ja-JP") ||
    voices.find((voice) => voice.lang?.startsWith("ja")) ||
    null
  );
}

function speak(text, estimatedDuration = 1000) {
  if (!elevator.soundEnabled || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return;
  }

  speechQueue.push({ text, estimatedDuration });
  runSpeechQueue();
}

function runSpeechQueue() {
  if (speaking || speechQueue.length === 0) return;

  const item = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(item.text);
  const voice = pickJapaneseVoice();
  let finished = false;

  speaking = true;
  utterance.lang = "ja-JP";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  if (voice) {
    utterance.voice = voice;
  }

  const finish = () => {
    if (finished) return;
    finished = true;
    speaking = false;
    window.setTimeout(runSpeechQueue, 90);
  };

  utterance.onend = finish;
  utterance.onerror = finish;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  window.setTimeout(finish, item.estimatedDuration + 900);
}

function clearSpeech() {
  speechQueue = [];
  speaking = false;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function modeCanChange() {
  return !elevator.moving && !elevator.doorsOpen && !elevator.doorMoving;
}

function renderFloors() {
  elements.floorButtons.innerHTML = "";
  [...floors].reverse().forEach((floor) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "floor-button";
    button.textContent = floorLabel(floor);
    button.dataset.floor = String(floor);
    button.disabled = elevator.currentFloor === floor && elevator.doorsOpen;
    button.addEventListener("click", () => addRequest(floor));
    elements.floorButtons.appendChild(button);
  });

  elements.floorStack.innerHTML = "";
  [...floors].reverse().forEach((floor) => {
    const tick = document.createElement("span");
    tick.className = floor === elevator.currentFloor ? "floor-tick is-current" : "floor-tick";
    tick.textContent = floorLabel(floor);
    elements.floorStack.appendChild(tick);
  });
}

function render() {
  const currentLabel = floorLabel(elevator.currentFloor);
  const targetLabel = elevator.targetFloor === null ? "なし" : floorLabel(elevator.targetFloor);
  const status = getStatusLabel();
  const modeChangeable = modeCanChange();

  elements.currentFloor.textContent = currentLabel;
  elements.currentFloorHero.textContent = currentLabel;
  elements.targetFloor.textContent = targetLabel;
  elements.motionState.textContent = status;
  elements.carDisplay.textContent = currentLabel;
  elements.screenFloor.textContent = currentLabel;
  elements.screenHint.textContent = status;
  elements.direction.textContent = elevator.direction > 0 ? "▲" : elevator.direction < 0 ? "▼" : "■";

  elements.car.classList.toggle("is-open", elevator.doorsOpen);
  elements.car.classList.toggle("is-moving", elevator.moving);

  const maxValue = floorValue(floors[floors.length - 1]);
  const currentValue = floorValue(elevator.currentFloor);
  const position = maxValue === 0 ? 0 : (currentValue / maxValue) * 100;
  elements.car.style.bottom = `calc(${position}% - 36px)`;

  elements.floorButtons.querySelectorAll(".floor-button").forEach((button) => {
    const floor = button.dataset.floor === "B1" ? "B1" : Number(button.dataset.floor);
    button.classList.toggle("is-requested", elevator.requests.includes(floor));
    button.classList.toggle("is-current", elevator.currentFloor === floor);
    button.disabled = elevator.currentFloor === floor && elevator.doorsOpen;
  });

  elements.floorStack.querySelectorAll(".floor-tick").forEach((tick) => {
    tick.classList.toggle("is-current", tick.textContent === currentLabel);
  });

  elements.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === elevator.mode);
    button.disabled = !modeChangeable || button.dataset.mode === elevator.mode;
  });

  elements.openDoor.disabled = elevator.moving || elevator.doorsOpen || elevator.doorMoving;
  elements.closeDoor.disabled = elevator.moving || !elevator.doorsOpen || elevator.doorMoving;
  elements.resetElevator.disabled = elevator.moving || elevator.doorsOpen || elevator.doorMoving;
  elements.soundToggle.textContent = elevator.soundEnabled ? "音声ON" : "音声OFF";
  elements.soundToggle.setAttribute("aria-pressed", String(elevator.soundEnabled));
}

function getStatusLabel() {
  if (elevator.moving) return elevator.direction > 0 ? "上昇中" : "下降中";
  if (elevator.doorMoving) return "ドア動作中";
  if (elevator.doorsOpen) return "ドア開";
  if (elevator.requests.length > 0) return "予約あり";
  return "待機中";
}

function addRequest(floor) {
  if (elevator.currentFloor === floor && !elevator.moving) {
    playButtonSound();
    openDoors();
    return;
  }

  if (!elevator.requests.includes(floor)) {
    elevator.requests.push(floor);
  }

  playButtonSound();
  chooseNextTarget();
  render();

  if (!elevator.moving && !elevator.doorsOpen) {
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
  const ordered = [...elevator.requests].sort((a, b) => floorValue(a) - floorValue(b));

  if (elevator.direction > 0) {
    const upward = ordered.find((floor) => floorValue(floor) > currentValue);
    elevator.targetFloor = upward ?? ordered[ordered.length - 1];
    elevator.direction = upward ? 1 : -1;
    return;
  }

  if (elevator.direction < 0) {
    const downward = [...ordered].reverse().find((floor) => floorValue(floor) < currentValue);
    elevator.targetFloor = downward ?? ordered[0];
    elevator.direction = downward ? -1 : 1;
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

  speak(elevator.direction > 0 ? "上へまいります" : "下へまいります", speechTimings.depart);
  render();
  moveOneFloor(elevator.runId);
}

function moveOneFloor(runId) {
  if (runId !== elevator.runId || !elevator.moving) return;

  window.setTimeout(() => {
    if (runId !== elevator.runId || !elevator.moving) return;

    const nextValue = floorValue(elevator.currentFloor) + elevator.direction;
    elevator.currentFloor = floorFromValue(nextValue);

    if (elevator.requests.includes(elevator.currentFloor)) {
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
  speak(`${floorSpeechLabel(elevator.currentFloor)}です`, speechTimings.arrival);
  openDoors({ afterArrival: true });
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
    speak("ドアが閉まります", speechTimings.closing);
  }, Math.max(0, timing.dwell - timing.closeWarningLead));

  closeTimer = window.setTimeout(() => {
    closeDoors({ auto: true });
  }, timing.dwell);
}

function closeDoors({ auto = false } = {}) {
  if (elevator.moving || !elevator.doorsOpen || elevator.doorMoving) return;

  clearDoorTimers();

  if (!auto) {
    speak("ドアが閉まります", speechTimings.closing);
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
  if (elevator.moving || elevator.doorsOpen) return;

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
    getAudioContext();
  }
  render();
}

function bindEvents() {
  elements.openDoor.addEventListener("click", () => {
    playButtonSound();
    openDoors();
  });

  elements.closeDoor.addEventListener("click", () => {
    playButtonSound();
    closeDoors();
  });

  elements.resetElevator.addEventListener("click", () => {
    playButtonSound();
    resetElevator();
  });

  elements.soundToggle.addEventListener("click", () => {
    playButtonSound();
    toggleSound();
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      playButtonSound();
      switchMode(button.dataset.mode);
    });
  });

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => pickJapaneseVoice();
  }
}

bindEvents();
renderFloors();
render();
