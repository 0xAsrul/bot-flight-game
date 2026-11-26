// Keyboard + mouse input. Keys are the primary controls; moving the mouse steers
// while it is held over the canvas. Also tracks the "any key" edges menus use.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since the last poll, for menus
  let mouseX = 0.5; // 0..1 across the canvas
  let mouseY = 0.5; // 0..1 down the canvas
  let mouseActive = false;
  let mouseSeenAt = -1e9;

  const onKeyDown = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onMouseMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) / Math.max(1, r.width);
    mouseY = (e.clientY - r.top) / Math.max(1, r.height);
    mouseActive = true;
    mouseSeenAt = performance.now() / 1000;
  };
  const onBlur = () => keys.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);

  return {
    /** True while the key is held. Accepts e.code values. */
    down(code) {
      return keys.has(code);
    },
    /** True once for the frame the key went down. */
    wasPressed(code) {
      return pressed.has(code);
    },
    /** True if any menu key was pressed since the last poll. */
    anyPressed() {
      return pressed.size > 0;
    },
    /** Steering intent from keys: -1..1 roll, -1..1 pitch (positive = climb). */
    steer() {
      let roll = 0;
      let pitch = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
      // Mouse steering: pointer left/right of centre banks, above/below pitches.
      if (mouseActive) {
        const mx = (mouseX - 0.5) * 2;
        const my = (mouseY - 0.5) * 2;
        if (Math.abs(mx) > 0.12) roll += Math.max(-1, Math.min(1, mx * 1.4));
        if (Math.abs(my) > 0.12) pitch += Math.max(-1, Math.min(1, -my * 1.2));
      }
      return { roll: Math.max(-1, Math.min(1, roll)), pitch: Math.max(-1, Math.min(1, pitch)) };
    },
    /** Throttle intent: +1 up, -1 down, 0 hold. Shift = up, Control = down, +/- also work. */
    throttle() {
      let t = 0;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal') || keys.has('NumpadAdd')) t += 1;
      if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus') || keys.has('NumpadSubtract')) t -= 1;
      return t;
    },
    get mouseIdleSeconds() {
      return performance.now() / 1000 - mouseSeenAt;
    },
    /** Call at the end of each frame: clears the per-frame pressed set. */
    endFrame() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
