/**
 * makeDraggable — attach pointer-based drag behavior to an element.
 *
 * Moves the element by updating CSS `left`/`top`. Uses PointerEvents
 * with setPointerCapture for smooth tracking even outside the element.
 *
 * @returns Cleanup function to remove all listeners
 */

/* ── Scroll-by-drag — click-drag to scroll a container ── */

export interface ScrollDragOptions {
  /** Scrollable container element */
  el: HTMLElement;
  /** Pixels of movement before drag activates (prevents jitter on click) */
  deadzone?: number;
}

/**
 * makeScrollDraggable — click-drag to scroll a container's content.
 *
 * Adds grab cursor and pointer-based scroll. A small deadzone prevents
 * accidental scrolls when clicking checkboxes or buttons inside.
 *
 * @returns Cleanup function to remove all listeners
 */
export function makeScrollDraggable(opts: ScrollDragOptions): () => void {
  const { el, deadzone = 4 } = opts;
  let active = false;
  let startY = 0;
  let scrollStart = 0;
  let activated = false; // past deadzone

  function onDown(e: PointerEvent) {
    // Only primary button, skip if target is a button/input
    if (e.button !== 0) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'BUTTON' || tag === 'INPUT') return;

    active = true;
    activated = false;
    startY = e.clientY;
    scrollStart = el.scrollTop;
    el.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!active) return;
    const dy = e.clientY - startY;

    if (!activated) {
      if (Math.abs(dy) < deadzone) return;
      activated = true;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    }

    el.scrollTop = scrollStart - dy;
  }

  function onUp(e: PointerEvent) {
    if (!active) return;
    active = false;
    el.releasePointerCapture(e.pointerId);
    if (activated) {
      el.style.cursor = '';
      el.style.userSelect = '';
    }
    activated = false;
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}

/* ── Position drag — move an element by dragging ── */

export interface DragOptions {
  /** Element to drag */
  el: HTMLElement;
  /** Optional handle element — only drags start from this child */
  handle?: HTMLElement;
  /** Constrain to parent bounds? Default: true */
  constrain?: boolean;
  /** Called when drag starts */
  onDragStart?: () => void;
  /** Called when drag ends with final position */
  onDragEnd?: (x: number, y: number) => void;
}

export function makeDraggable(opts: DragOptions): () => void {
  const { el, handle = el, constrain = true, onDragStart, onDragEnd } = opts;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;

    e.preventDefault();
    dragging = true;

    handle.setPointerCapture(e.pointerId);

    startX = e.clientX;
    startY = e.clientY;

    // Fire callback first so callers can convert positioning
    // (e.g. right-anchored → left-anchored) before we read coords
    el.classList.add('is-dragging');
    onDragStart?.();

    const style = getComputedStyle(el);
    origLeft = parseFloat(style.left) || 0;
    origTop = parseFloat(style.top) || 0;
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = origLeft + dx;
    let newTop = origTop + dy;

    if (constrain && el.parentElement) {
      const parent = el.parentElement.getBoundingClientRect();
      const elW = el.offsetWidth;
      const elH = el.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, parent.width - elW));
      newTop = Math.max(0, Math.min(newTop, parent.height - elH));
    }

    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.transform = 'none';
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;

    handle.releasePointerCapture(e.pointerId);
    el.classList.remove('is-dragging');

    onDragEnd?.(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0);
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);

  handle.style.cursor = 'grab';

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.style.cursor = '';
  };
}
