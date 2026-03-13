/**
 * Celebration effects — triggered on task completion.
 *
 * - burstStars:       2D canvas particle burst from center of a container
 * - flashGold:        CSS gold glow pulse on widget elements
 * - sparkleBar:       CSS shimmer sweep across the points bar
 * - playCelebrateChime: Synthesized sparkle chime via Web Audio API
 */

// ── Star colors ──
const COLORS = ['#FFD700', '#F94D8A', '#FEDBB0', '#FFE680', '#FF8CBF'];

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  decay: number;
  color: string;
}

// Shared fullscreen canvas — reused across bursts
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let stars: Star[] = [];
let rafId = 0;

function ensureCanvas(): void {
  if (canvas) {
    // Resize if viewport changed
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    return;
  }

  canvas = document.createElement('canvas');
  canvas.className = 'celebration-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
}

function drawStar(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rotation: number,
): void {
  const spikes = 4;
  const outerR = size;
  const innerR = size * 0.4;

  c.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotation + (i * Math.PI) / spikes;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

function tick(): void {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let alive = false;

  for (const s of stars) {
    if (s.opacity <= 0) continue;
    alive = true;

    // Physics
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.15; // gravity
    s.vx *= 0.98; // drag
    s.vy *= 0.98;
    s.rotation += s.rotationSpeed;
    s.opacity -= s.decay;

    if (s.opacity <= 0) continue;

    // Draw
    ctx.save();
    ctx.globalAlpha = Math.max(0, s.opacity);
    ctx.fillStyle = s.color;
    drawStar(ctx, s.x, s.y, s.size, s.rotation);
    ctx.fill();
    ctx.restore();
  }

  if (alive) {
    rafId = requestAnimationFrame(tick);
  } else {
    // Cleanup
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.length = 0;
    rafId = 0;
  }
}

/**
 * Burst star particles from the center of a container (avatar origin)
 * across the full viewport.
 * @param origin   Element whose center is the burst origin (typically scene-wrap)
 * @param allDone  True for a bigger finale burst
 */
export function burstStars(origin: HTMLElement, allDone = false): void {
  ensureCanvas();
  if (!ctx || !canvas) return;

  // Origin = center of the scene-wrap (where the avatar is)
  const rect = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = allDone ? 120 : 50;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * (allDone ? 12 : 7);

    stars.push({
      x: cx + (Math.random() - 0.5) * 30,
      y: cy + (Math.random() - 0.5) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2, // bias upward
      size: 4 + Math.random() * (allDone ? 10 : 6),
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      opacity: 0.85 + Math.random() * 0.15,
      decay: 0.006 + Math.random() * 0.006,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }

  // Start animation if not already running
  if (!rafId) {
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * Small sparkle burst from an element — used for the task checkbox click.
 */
export function miniSparkle(origin: HTMLElement): void {
  ensureCanvas();
  if (!ctx || !canvas) return;

  const rect = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;

    stars.push({
      x: cx + (Math.random() - 0.5) * 8,
      y: cy + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      size: 2 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      opacity: 0.9,
      decay: 0.012 + Math.random() * 0.008,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }

  if (!rafId) {
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * Flash a gold glow on one or more elements.
 */
export function flashGold(elements: HTMLElement[]): void {
  for (const el of elements) {
    // Remove first to allow re-triggering
    el.classList.remove('celebrate-flash');
    // Force reflow so re-adding triggers the animation
    void el.offsetWidth;
    el.classList.add('celebrate-flash');

    const onEnd = () => {
      el.classList.remove('celebrate-flash');
      el.removeEventListener('animationend', onEnd);
    };
    el.addEventListener('animationend', onEnd);
  }
}

/**
 * Shimmer highlight sweeps across the points bar fill.
 */
export function sparkleBar(barEl: HTMLElement): void {
  barEl.classList.remove('celebrate-sparkle');
  void barEl.offsetWidth;
  barEl.classList.add('celebrate-sparkle');

  const onEnd = () => {
    barEl.classList.remove('celebrate-sparkle');
    barEl.removeEventListener('animationend', onEnd);
  };
  barEl.addEventListener('animationend', onEnd);
}

// ── Synthesized sparkle chime ──

/** Pentatonic note frequencies for the ascending arpeggio (C5–E6). */
const CHIME_NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5];
const CHIME_NOTES_FINALE = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093.0];

/**
 * Play a short sparkly ascending chime — synthesized on the fly.
 * @param ctx    AudioContext to use (reuses the app's existing context)
 * @param allDone  True for a bigger, richer finale chime
 */
export function playCelebrateChime(ctx: AudioContext, allDone = false): void {
  const notes = allDone ? CHIME_NOTES_FINALE : CHIME_NOTES;
  const now = ctx.currentTime;
  const stagger = allDone ? 0.07 : 0.08; // time between notes
  const sustain = allDone ? 0.9 : 0.6;   // note duration

  for (let i = 0; i < notes.length; i++) {
    const t = now + i * stagger;

    // Main tone — sine for a clean bell-like quality
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i];

    // Shimmer overtone — a quiet triangle one octave up
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = notes[i] * 2;

    // Gain envelope — fast attack, exponential decay
    const gain = ctx.createGain();
    const volume = allDone ? 0.12 : 0.10;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + sustain);

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0, t);
    shimmerGain.gain.linearRampToValueAtTime(volume * 0.3, t + 0.015);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + sustain * 0.7);

    osc.connect(gain).connect(ctx.destination);
    shimmer.connect(shimmerGain).connect(ctx.destination);

    osc.start(t);
    osc.stop(t + sustain + 0.05);
    shimmer.start(t);
    shimmer.stop(t + sustain + 0.05);
  }
}
