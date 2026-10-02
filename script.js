"use strict";

// Liste des vidéos
const videos = [
  "videos/video1.mp4",
  "videos/video2.mp4",
  "videos/video3.mp4",
  "videos/video4.mp4",
  "videos/video5.mp4"
];

// Durée du brouillage entre deux vidéos
const STATIC_MIN_DURATION = 500;
const STATIC_MAX_DURATION = 1500;

// Durée des animations CRT
const BOOT_DURATION = 700;
const SHUTDOWN_DURATION = 430;

// Délai avant allumage automatique
const AUTO_POWER_MIN_DELAY = 5000;
const AUTO_POWER_MAX_DELAY = 10000;

// Réglages du bruit TV
const STATIC_FPS = 30;
const STATIC_FRAME_INTERVAL = 1000 / STATIC_FPS;
const STATIC_WIDTH = 240;
const STATIC_HEIGHT = 180;

// Éléments HTML
const tv = document.getElementById("tv");
const video = document.getElementById("tvVideo");
const staticCanvas = document.getElementById("staticCanvas");
const powerButton = document.getElementById("powerButton");

const staticContext = staticCanvas.getContext("2d", {
  alpha: false
});

// État de la télévision
let isTvOn = false;
let currentVideoIndex = -1;

// Animations et timers
let staticAnimationFrameId = null;
let staticTransitionTimeoutId = null;
let powerTransitionTimeoutId = null;
let autoPowerOnTimeoutId = null;

let lastStaticFrameTime = 0;

// Permet d'annuler proprement les anciennes actions asynchrones
let tvSessionId = 0;

// Initialisation
function initializeTv() {
  staticCanvas.width = STATIC_WIDTH;
  staticCanvas.height = STATIC_HEIGHT;

  staticContext.imageSmoothingEnabled = false;

  // La télévision est toujours muette
  video.muted = true;

  powerButton.addEventListener("click", handlePowerButtonClick);

  video.addEventListener("ended", handleVideoEnded);
  video.addEventListener("error", handleVideoError);

  // Allumage automatique après 5 à 10 secondes
  scheduleAutomaticPowerOn();
}

// Clic sur le bouton ON / OFF
function handlePowerButtonClick() {
  // Si l'utilisateur intervient, l'allumage automatique est annulé
  cancelAutomaticPowerOn();

  animatePhysicalButton();

  if (isTvOn) {
    turnTvOff();
  } else {
    turnTvOn();
  }
}

// Animation du bouton physique
function animatePhysicalButton() {
  powerButton.classList.add("is-pressed");

  window.setTimeout(() => {
    powerButton.classList.remove("is-pressed");
  }, 110);
}

// Programme l'allumage automatique
function scheduleAutomaticPowerOn() {
  const delay = randomInteger(
    AUTO_POWER_MIN_DELAY,
    AUTO_POWER_MAX_DELAY
  );

  autoPowerOnTimeoutId = window.setTimeout(() => {
    autoPowerOnTimeoutId = null;

    if (!isTvOn) {
      turnTvOn();
    }
  }, delay);
}

// Annule l'allumage automatique
function cancelAutomaticPowerOn() {
  if (autoPowerOnTimeoutId !== null) {
    window.clearTimeout(autoPowerOnTimeoutId);
    autoPowerOnTimeoutId = null;
  }
}

// Allume la télévision
function turnTvOn() {
  if (isTvOn || videos.length === 0) {
    return;
  }

  cancelAutomaticPowerOn();

  isTvOn = true;

  const sessionId = ++tvSessionId;

  clearAllTimers();
  stopStaticNoise();

  tv.classList.remove(
    "is-off",
    "is-on",
    "is-shutting-down"
  );

  // Force le navigateur à rejouer l'animation CSS
  void tv.offsetWidth;

  tv.classList.add("is-booting");

  powerButton.setAttribute("aria-pressed", "true");
  powerButton.setAttribute(
    "aria-label",
    "Éteindre la télévision"
  );

  // Affiche du bruit pendant l'allumage
  startStaticNoise();

  // Lance une vidéo aléatoire
  playRandomVideo().catch((error) => {
    console.warn(
      "La lecture initiale de la vidéo a échoué :",
      error
    );
  });

  powerTransitionTimeoutId = window.setTimeout(() => {
    if (!isTvOn || sessionId !== tvSessionId) {
      return;
    }

    tv.classList.remove("is-booting");
    tv.classList.add("is-on");

    stopStaticNoise();
  }, BOOT_DURATION);
}

// Éteint la télévision
function turnTvOff() {
  if (!isTvOn) {
    return;
  }

  isTvOn = false;

  ++tvSessionId;

  clearAllTimers();
  stopStaticNoise();

  video.pause();

  tv.classList.remove(
    "is-on",
    "is-booting",
    "is-off"
  );

  // Force le navigateur à rejouer l'animation CSS
  void tv.offsetWidth;

  tv.classList.add("is-shutting-down");

  powerButton.setAttribute("aria-pressed", "false");
  powerButton.setAttribute(
    "aria-label",
    "Allumer la télévision"
  );

  const sessionId = tvSessionId;

  powerTransitionTimeoutId = window.setTimeout(() => {
    if (isTvOn || sessionId !== tvSessionId) {
      return;
    }

    tv.classList.remove("is-shutting-down");
    tv.classList.add("is-off");

    // Supprime la vidéo chargée lorsque la TV est éteinte
    video.removeAttribute("src");
    video.load();
  }, SHUTDOWN_DURATION);
}

// Lance une vidéo aléatoire
async function playRandomVideo() {
  if (!isTvOn || videos.length === 0) {
    return false;
  }

  const nextIndex = getRandomVideoIndex();

  currentVideoIndex = nextIndex;

  video.src = videos[nextIndex];

  // Garantit que la vidéo reste muette
  video.muted = true;

  video.load();

  try {
    await video.play();

    return true;
  } catch (error) {
    console.warn(
      `Impossible de lire "${videos[nextIndex]}".`,
      error
    );

    return false;
  }
}

// Sélectionne une vidéo en évitant la précédente
function getRandomVideoIndex() {
  if (videos.length === 1) {
    return 0;
  }

  let nextIndex;

  do {
    nextIndex = Math.floor(
      Math.random() * videos.length
    );
  } while (nextIndex === currentVideoIndex);

  return nextIndex;
}

// Quand une vidéo se termine
function handleVideoEnded() {
  if (!isTvOn) {
    return;
  }

  showStaticTransition();
}

// Gestion d'une erreur vidéo
function handleVideoError() {
  if (!isTvOn) {
    return;
  }

  const source =
    videos[currentVideoIndex] ||
    video.currentSrc ||
    "source inconnue";

  console.warn(
    `Erreur lors du chargement de la vidéo : ${source}`
  );
}

// Lance la transition de neige TV
function showStaticTransition() {
  if (!isTvOn) {
    return;
  }

  clearStaticTransitionTimer();

  startStaticNoise();

  const sessionId = tvSessionId;

  const duration = randomInteger(
    STATIC_MIN_DURATION,
    STATIC_MAX_DURATION
  );

  staticTransitionTimeoutId = window.setTimeout(
    async () => {
      if (!isTvOn || sessionId !== tvSessionId) {
        return;
      }

      const playbackStarted =
        await playRandomVideo();

      if (!isTvOn || sessionId !== tvSessionId) {
        return;
      }

      if (playbackStarted) {
        // Laisse un très court instant au navigateur
        // pour afficher la première image de la vidéo
        window.setTimeout(() => {
          if (
            isTvOn &&
            sessionId === tvSessionId
          ) {
            stopStaticNoise();
          }
        }, 90);
      } else {
        stopStaticNoise();
      }
    },
    duration
  );
}

// Démarre le bruit analogique
function startStaticNoise() {
  if (staticAnimationFrameId !== null) {
    return;
  }

  staticCanvas.classList.add("is-visible");

  lastStaticFrameTime = 0;

  staticAnimationFrameId =
    window.requestAnimationFrame(renderStaticNoise);
}

// Arrête complètement le bruit analogique
function stopStaticNoise() {
  if (staticAnimationFrameId !== null) {
    window.cancelAnimationFrame(
      staticAnimationFrameId
    );

    staticAnimationFrameId = null;
  }

  staticCanvas.classList.remove("is-visible");

  lastStaticFrameTime = 0;

  staticContext.fillStyle = "#000";

  staticContext.fillRect(
    0,
    0,
    staticCanvas.width,
    staticCanvas.height
  );
}

// Boucle d'animation du bruit
function renderStaticNoise(timestamp) {
  if (staticAnimationFrameId === null) {
    return;
  }

  if (
    timestamp - lastStaticFrameTime >=
    STATIC_FRAME_INTERVAL
  ) {
    drawNoiseFrame();

    lastStaticFrameTime = timestamp;
  }

  staticAnimationFrameId =
    window.requestAnimationFrame(renderStaticNoise);
}

// Génère une image de neige TV
function drawNoiseFrame() {
  const width = staticCanvas.width;
  const height = staticCanvas.height;

  const imageData =
    staticContext.createImageData(
      width,
      height
    );

  const pixels = imageData.data;

  for (
    let index = 0;
    index < pixels.length;
    index += 4
  ) {
    const randomValue = Math.random();

    let shade;

    if (randomValue < 0.37) {
      shade = Math.floor(
        Math.random() * 55
      );
    } else if (randomValue > 0.63) {
      shade =
        190 +
        Math.floor(
          Math.random() * 66
        );
    } else {
      shade =
        65 +
        Math.floor(
          Math.random() * 125
        );
    }

    pixels[index] = shade;
    pixels[index + 1] = shade;
    pixels[index + 2] = shade;
    pixels[index + 3] = 255;
  }

  staticContext.putImageData(
    imageData,
    0,
    0
  );

  drawHorizontalInterference(
    width,
    height
  );

  drawStaticFlicker(
    width,
    height
  );
}

// Ajoute des lignes horizontales instables
function drawHorizontalInterference(
  width,
  height
) {
  const bandCount = randomInteger(2, 7);

  for (
    let i = 0;
    i < bandCount;
    i++
  ) {
    const y = randomInteger(
      0,
      height - 1
    );

    const bandHeight =
      randomInteger(1, 6);

    const shade =
      Math.random() > 0.5
        ? randomInteger(180, 255)
        : randomInteger(0, 60);

    staticContext.globalAlpha =
      Math.random() * 0.32 + 0.06;

    staticContext.fillStyle =
      `rgb(${shade}, ${shade}, ${shade})`;

    staticContext.fillRect(
      0,
      y,
      width,
      bandHeight
    );
  }

  // Ligne lumineuse occasionnelle
  if (Math.random() > 0.55) {
    const y = randomInteger(
      0,
      height - 1
    );

    staticContext.globalAlpha =
      Math.random() * 0.34 + 0.12;

    staticContext.fillStyle = "#fff";

    staticContext.fillRect(
      0,
      y,
      width,
      Math.random() > 0.75
        ? 2
        : 1
    );
  }

  staticContext.globalAlpha = 1;
}

// Ajoute un flash aléatoire léger
function drawStaticFlicker(
  width,
  height
) {
  if (Math.random() < 0.16) {
    staticContext.globalAlpha =
      Math.random() * 0.12;

    staticContext.fillStyle =
      Math.random() > 0.5
        ? "#fff"
        : "#000";

    staticContext.fillRect(
      0,
      0,
      width,
      height
    );

    staticContext.globalAlpha = 1;
  }
}

// Annule le timer de transition entre vidéos
function clearStaticTransitionTimer() {
  if (staticTransitionTimeoutId !== null) {
    window.clearTimeout(
      staticTransitionTimeoutId
    );

    staticTransitionTimeoutId = null;
  }
}

// Annule le timer d'allumage ou d'extinction
function clearPowerTransitionTimer() {
  if (powerTransitionTimeoutId !== null) {
    window.clearTimeout(
      powerTransitionTimeoutId
    );

    powerTransitionTimeoutId = null;
  }
}

// Annule les timers principaux
function clearAllTimers() {
  clearStaticTransitionTimer();
  clearPowerTransitionTimer();
}

// Retourne un nombre entier aléatoire
function randomInteger(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

// Démarrage
initializeTv();
