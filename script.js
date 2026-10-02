"use strict";

/*
  Ajoute simplement tes fichiers MP4 ici.
  Les chemins sont relatifs à index.html.
*/
const videos = [
  "videos/video1.mp4",
  "videos/video2.mp4",
  "videos/video3.mp4",
  "videos/video4.mp4",
  "videos/video5.mp4"
];

/* ---------------------------------------------------------
   Configuration
--------------------------------------------------------- */

const STATIC_MIN_DURATION = 500;
const STATIC_MAX_DURATION = 1500;

const BOOT_DURATION = 700;
const SHUTDOWN_DURATION = 430;

const STATIC_FPS = 30;
const STATIC_FRAME_INTERVAL = 1000 / STATIC_FPS;

/*
  Résolution volontairement faible :
  le canvas est agrandi en CSS pour obtenir de gros grains analogiques
  tout en restant peu coûteux à animer.
*/
const STATIC_WIDTH = 240;
const STATIC_HEIGHT = 180;

/* ---------------------------------------------------------
   DOM
--------------------------------------------------------- */

const tv = document.getElementById("tv");
const video = document.getElementById("tvVideo");

const staticCanvas = document.getElementById("staticCanvas");
const staticContext = staticCanvas.getContext("2d", {
  alpha: false
});

const powerButton = document.getElementById("powerButton");

/* ---------------------------------------------------------
   State
--------------------------------------------------------- */

let isTvOn = false;

let currentVideoIndex = -1;

let staticAnimationFrameId = null;
let staticTransitionTimeoutId = null;
let powerTransitionTimeoutId = null;

let lastStaticFrameTime = 0;

/*
  Chaque changement ON/OFF incrémente cette valeur.
  Les callbacks asynchrones peuvent ainsi vérifier qu'ils appartiennent
  toujours au cycle actuel de la télévision.
*/
let tvSessionId = 0;

/* ---------------------------------------------------------
   Initialisation
--------------------------------------------------------- */

function initializeTv() {
  staticCanvas.width = STATIC_WIDTH;
  staticCanvas.height = STATIC_HEIGHT;

  staticContext.imageSmoothingEnabled = false;

  video.volume = 1;

  powerButton.addEventListener("click", handlePowerButtonClick);
  video.addEventListener("ended", handleVideoEnded);
  video.addEventListener("error", handleVideoError);
}

function handlePowerButtonClick() {
  animatePhysicalButton();

  if (isTvOn) {
    turnTvOff();
  } else {
    turnTvOn();
  }
}

function animatePhysicalButton() {
  powerButton.classList.add("is-pressed");

  window.setTimeout(() => {
    powerButton.classList.remove("is-pressed");
  }, 110);
}

/* ---------------------------------------------------------
   Power
--------------------------------------------------------- */

function turnTvOn() {
  if (isTvOn || videos.length === 0) {
    return;
  }

  isTvOn = true;

  const sessionId = ++tvSessionId;

  clearAllTimers();
  stopStaticNoise();

  tv.classList.remove(
    "is-off",
    "is-on",
    "is-shutting-down"
  );

  /*
    Forcer un reflow permet de rejouer proprement
    l'animation CSS même après plusieurs cycles ON/OFF.
  */
  void tv.offsetWidth;

  tv.classList.add("is-booting");

  powerButton.setAttribute("aria-pressed", "true");
  powerButton.setAttribute(
    "aria-label",
    "Éteindre la télévision"
  );

  /*
    La lecture est demandée immédiatement dans la pile d'exécution
    du clic utilisateur.

    Le volume est momentanément à zéro pendant l'animation CRT.
    On évite ainsi que le son précède visuellement l'allumage.
  */
  video.volume = 0;

  startStaticNoise();

  const initialPlayback = playRandomVideo();

  initialPlayback.catch((error) => {
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

    /*
      La balise vidéo est déjà en lecture grâce au clic utilisateur.
      On rétablit maintenant le son.
    */
    video.volume = 1;
  }, BOOT_DURATION);
}

function turnTvOff() {
  if (!isTvOn) {
    return;
  }

  isTvOn = false;
  ++tvSessionId;

  clearAllTimers();
  stopStaticNoise();

  /*
    On coupe immédiatement le son et on fige la dernière image.
    Cette image sert ensuite à l'animation d'extinction CRT.
  */
  video.volume = 0;
  video.pause();

  tv.classList.remove(
    "is-on",
    "is-booting",
    "is-off"
  );

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

    /*
      Libère la ressource vidéo lorsque la TV reste éteinte.
    */
    video.removeAttribute("src");
    video.load();

    video.volume = 1;
  }, SHUTDOWN_DURATION);
}

/* ---------------------------------------------------------
   Video selection / playback
--------------------------------------------------------- */

async function playRandomVideo() {
  if (!isTvOn || videos.length === 0) {
    return false;
  }

  const nextIndex = getRandomVideoIndex();

  currentVideoIndex = nextIndex;

  video.src = videos[nextIndex];
  video.load();

  try {
    await video.play();
    return true;
  } catch (error) {
    /*
      Une erreur NotAllowedError peut arriver sur certains navigateurs
      particulièrement stricts concernant l'autoplay.

      Le premier lancement est demandé directement depuis le clic ON,
      ce qui permet normalement une lecture avec son.
    */
    console.warn(
      `Impossible de lire "${videos[nextIndex]}".`,
      error
    );

    return false;
  }
}

function getRandomVideoIndex() {
  if (videos.length === 1) {
    return 0;
  }

  let nextIndex;

  do {
    nextIndex = Math.floor(Math.random() * videos.length);
  } while (nextIndex === currentVideoIndex);

  return nextIndex;
}

function handleVideoEnded() {
  if (!isTvOn) {
    return;
  }

  showStaticTransition();
}

function handleVideoError() {
  if (!isTvOn) {
    return;
  }

  const source =
    videos[currentVideoIndex] ??
    video.currentSrc ??
    "source inconnue";

  console.warn(
    `Erreur lors du chargement de la vidéo : ${source}`
  );
}

/* ---------------------------------------------------------
   Static transition
--------------------------------------------------------- */

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

      const playbackStarted = await playRandomVideo();

      if (!isTvOn || sessionId !== tvSessionId) {
        return;
      }

      if (playbackStarted) {
        /*
          Quelques millisecondes supplémentaires évitent qu'une frame
          noire apparaisse entre la neige et la nouvelle vidéo.
        */
        window.setTimeout(() => {
          if (
            isTvOn &&
            sessionId === tvSessionId
          ) {
            stopStaticNoise();
          }
        }, 90);
      } else {
        /*
          En cas d'échec, on évite de laisser une animation canvas
          tourner indéfiniment.
        */
        stopStaticNoise();
      }
    },
    duration
  );
}

/* ---------------------------------------------------------
   Canvas static noise
--------------------------------------------------------- */

function startStaticNoise() {
  if (staticAnimationFrameId !== null) {
    return;
  }

  staticCanvas.classList.add("is-visible");

  lastStaticFrameTime = 0;

  staticAnimationFrameId =
    window.requestAnimationFrame(renderStaticNoise);
}

function stopStaticNoise() {
  if (staticAnimationFrameId !== null) {
    window.cancelAnimationFrame(staticAnimationFrameId);
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

function drawNoiseFrame() {
  const width = staticCanvas.width;
  const height = staticCanvas.height;

  const imageData =
    staticContext.createImageData(width, height);

  const pixels = imageData.data;

  /*
    Une distribution majoritairement noire/blanche avec
    quelques gris donne un aspect plus "signal analogique"
    qu'un simple random uniforme.
  */
  for (let index = 0; index < pixels.length; index += 4) {
    const randomValue = Math.random();

    let shade;

    if (randomValue < 0.37) {
      shade = Math.floor(Math.random() * 55);
    } else if (randomValue > 0.63) {
      shade = 190 + Math.floor(Math.random() * 66);
    } else {
      shade = 65 + Math.floor(Math.random() * 125);
    }

    pixels[index] = shade;
    pixels[index + 1] = shade;
    pixels[index + 2] = shade;
    pixels[index + 3] = 255;
  }

  staticContext.putImageData(imageData, 0, 0);

  drawHorizontalInterference(width, height);
  drawStaticFlicker(width, height);
}

function drawHorizontalInterference(width, height) {
  const bandCount = randomInteger(2, 7);

  for (let i = 0; i < bandCount; i++) {
    const y = randomInteger(0, height - 1);
    const bandHeight = randomInteger(1, 6);

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

  /*
    Une ligne plus brillante et instable rappelle le balayage
    vertical d'un signal analogique mal synchronisé.
  */
  if (Math.random() > 0.55) {
    const y = randomInteger(0, height - 1);

    staticContext.globalAlpha =
      Math.random() * 0.34 + 0.12;

    staticContext.fillStyle = "#fff";

    staticContext.fillRect(
      0,
      y,
      width,
      Math.random() > 0.75 ? 2 : 1
    );
  }

  staticContext.globalAlpha = 1;
}

function drawStaticFlicker(width, height) {
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

/* ---------------------------------------------------------
   Timers
--------------------------------------------------------- */

function clearStaticTransitionTimer() {
  if (staticTransitionTimeoutId !== null) {
    window.clearTimeout(staticTransitionTimeoutId);
    staticTransitionTimeoutId = null;
  }
}

function clearPowerTransitionTimer() {
  if (powerTransitionTimeoutId !== null) {
    window.clearTimeout(powerTransitionTimeoutId);
    powerTransitionTimeoutId = null;
  }
}

function clearAllTimers() {
  clearStaticTransitionTimer();
  clearPowerTransitionTimer();
}

/* ---------------------------------------------------------
   Utilities
--------------------------------------------------------- */

function randomInteger(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

/* ---------------------------------------------------------
   Start
--------------------------------------------------------- */

initializeTv();
