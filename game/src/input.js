// SIRENA CITY — keyboard and mouse input.
// Held keys are polled every step; one-shot presses (interact, pause, confirm,
// reload, mute) queue as flags and are taken exactly once, so a press between
// frames is never lost and never counted twice.

export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_RELOAD = 8;
export const ACTION_MUTE = 16;

const ONESHOT = new Map([
  ['KeyE', ACTION_INTERACT],
  ['KeyP', ACTION_PAUSE],
  ['Escape', ACTION_PAUSE],
  ['Enter', ACTION_CONFIRM],
  ['KeyR', ACTION_RELOAD],
  ['KeyM', ACTION_MUTE],
]);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    held.add(event.code);
    const flag = ONESHOT.get(event.code);
    if (flag && !event.repeat) actions |= flag;
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.down = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    down(code) {
      return held.has(code);
    },
    /** Movement axes from WASD or the arrow keys: x right, y down, each -1..1. */
    moveAxis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    throttle() {
      return (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
    },
    steer() {
      return (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
    },
    handbrake() {
      return held.has('Space');
    },
    running() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    mouse,
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
