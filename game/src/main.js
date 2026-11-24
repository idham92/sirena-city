// SIRENA CITY — boot and the one game loop. Input is sampled every frame,
// the world advances in fixed 1/60 s steps, and the renderer paints the
// result. Screens: title, play, paused, and the busted / wasted cards that
// hold while the simulation puts the player back on the street.
//
// ?seed=N fixes the city's random stream. ?shot=drive|mission|chase|title
// (with &seed=N) poses that scene instead of running the loop, paints it
// twice and sets window.__shotReady for the screenshot runner.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createGame, hasSave, stepAmbient, stepWorld } from './game.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_WASTED,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
/** How long the busted / wasted card stays up. */
const CARD_SECONDS = 2.4;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function announce(message) {
  if (status) status.textContent = message;
}

function freshWorld(continueSave) {
  const rng = createRandom(Math.floor(Math.random() * 4294967296));
  return createGame(rng, rng, continueSave);
}

function runShot(name) {
  const rng = createRandom(seed);
  const world = createGame(rng, rng, false);
  const settle = stageShot(world, name);
  const input = createInput(canvas);
  const screen = name === 'title' ? SCREEN_TITLE : SCREEN_PLAY;
  for (let i = 0; i < settle; i += 1) {
    if (name === 'title') stepAmbient(world, STEP);
    else stepWorld(world, STEP, input, 0);
  }
  let painted = 0;
  function paint() {
    renderer.draw(world, screen, { hasSave: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let world = freshWorld(false);
  let screen = SCREEN_TITLE;
  let cardT = 0;
  let accumulator = 0;
  let last = performance.now();

  function startRun(continueSave) {
    world = freshWorld(continueSave);
    if (!continueSave) world.markDirty(); // a new game replaces the old save
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce('Jugando. Ve al Café Litoral y habla con Marina.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;

    if (screen === SCREEN_TITLE) {
      if (input.down('KeyN')) {
        input.takeActions();
        startRun(false);
      } else {
        const actions = input.takeActions();
        if (actions & ACTION_CONFIRM) startRun(hasSave());
        else {
          while (accumulator >= STEP) {
            stepAmbient(world, STEP);
            accumulator -= STEP;
          }
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      const actions = input.takeActions();
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Jugando.');
      }
      accumulator = 0;
    } else {
      // Play, and the busted / wasted cards (the world keeps moving under them).
      let actions = input.takeActions();
      if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
        screen = SCREEN_PAUSED;
        announce('Pausa.');
        accumulator = 0;
      } else {
        while (accumulator >= STEP) {
          stepWorld(world, STEP, input, actions);
          actions = 0;
          accumulator -= STEP;
          if (world.justBusted) {
            world.justBusted = false;
            screen = SCREEN_BUSTED;
            cardT = CARD_SECONDS;
            announce('Detenido. Multa pagada.');
          } else if (world.justWasted) {
            world.justWasted = false;
            screen = SCREEN_WASTED;
            cardT = CARD_SECONDS;
            announce('Hecho polvo. Despiertas en el hospital.');
          }
          if (screen !== SCREEN_PLAY) {
            accumulator = 0;
            break;
          }
        }
        if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
          cardT -= dt;
          if (cardT <= 0) {
            screen = SCREEN_PLAY;
            announce('De vuelta en la calle.');
          }
        }
      }
    }
    renderer.draw(world, screen, { hasSave: hasSave() });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Pausa.');
    }
  });

  announce('Sirena City. Pulsa Enter para empezar.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
