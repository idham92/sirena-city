// main.js — boots Sirena City and runs its loop.
// Owns the canvas size, the frame clock, the mouse-to-world conversion and
// the screen flow (title, pause, incident screens). The Game decides what
// happens; the Renderer paints it; this file only keeps time and routes
// keys between screens. With ?shot=<name>&seed=<n> it stages one of the
// screenshot scenes instead, driving the player's car for it.

import { Game } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { setupShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? 7) || 7;

const audio = new AudioEngine();
const game = new Game(seed, audio);
const renderer = new Renderer(canvas);
const view = { w: 1280, h: 720, mouseWorld: { x: 0, y: 0 } };

function resize() {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  view.w = canvas.width;
  view.h = canvas.height;
}
window.addEventListener('resize', resize);
resize();

let input;
if (shotName) {
  // The staged scenes drive themselves: throttle held for the road shots.
  const throttle = shotName === 'drive' || shotName === 'chase';
  input = {
    down: (...codes) => throttle && codes.includes('KeyW'),
    hit: () => false,
    pressed: new Set(),
    keys: new Set(),
    mouseX: view.w * 0.62,
    mouseY: view.h * 0.4,
    mouseDown: false,
    mouseClicked: false,
    enabled: false,
    endFrame() {},
  };
  setupShot(game, shotName);
} else {
  input = new Input(canvas);
}

const wakeAudio = () => audio.wake();
window.addEventListener('keydown', wakeAudio, { once: false });
window.addEventListener('mousedown', wakeAudio, { once: false });

let last = performance.now();
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (dt <= 0) dt = 0.016;

  view.mouseWorld.x = input.mouseX + (renderer.camX ?? game.camera.x - view.w / 2);
  view.mouseWorld.y = input.mouseY + (renderer.camY ?? game.camera.y - view.h / 2);

  if (game.mode === 'title') {
    game.updateAmbient(dt);
    if (!shotName && input.hit('Enter')) {
      audio.wake();
      game.newGame();
    } else if (!shotName && input.hit('KeyC') && game.hasSave()) {
      audio.wake();
      game.continueGame();
    }
  } else if (game.mode === 'play') {
    game.update(dt, input, view);
    if (!shotName && input.hit('KeyP', 'Escape')) {
      game.mode = 'pause';
      game.save();
      audio.setSiren(false);
      audio.stopEngine();
    }
  } else if (game.mode === 'pause') {
    if (!shotName && input.hit('KeyP', 'Escape', 'Enter')) {
      game.mode = 'play';
    }
  } else if (game.mode === 'over') {
    game.overT += dt;
    game.updateFx(dt);
    if (!shotName && game.overT > 0.8 && input.hit('Enter')) {
      game.respawn();
    }
  }

  renderer.draw(game, view);
  if (status) {
    status.textContent = game.mode === 'play'
      ? `Sirena City. Dinero $${game.cash}. Estrellas de búsqueda: ${game.wanted}.`
      : `Sirena City. Pantalla: ${game.mode}.`;
  }
  input.endFrame();
  frames++;
  if (shotName && frames === 40) window.__shotReady = true;
}

requestAnimationFrame(frame);
