/**
 * Mood-driven animation profiles for the Patyna avatar.
 *
 * Each Plutchik emotion maps to a {@link MoodAnimProfile} that modulates
 * the avatar's base animation via multipliers and offsets.  Intensity
 * (low / mid / high) scales the deviation from neutral.
 *
 * Usage:
 *   1. Create a {@link MoodAnimState} instance in Avatar.
 *   2. Call `setMood(emotion, intensity)` on `comm:mood` events.
 *   3. Call `resolve(delta)` each frame to get the current blended profile.
 *   4. Apply the profile's multipliers/offsets in each animation subsystem.
 */

import type { MoodData } from '@/types/messages.ts';

// ═══════════════════════════════════════════════
// PROFILE INTERFACE
// ═══════════════════════════════════════════════

/**
 * Animation modifier profile — multipliers (neutral = 1.0) and
 * offsets (neutral = 0.0) applied to the avatar's base parameters.
 */
export interface MoodAnimProfile {
  // ── Hover bob ──
  bobSpeedMult: number;
  bobAmplitudeMult: number;

  // ── Body sway ──
  swaySpeedMult: number;
  swayAmplitudeMult: number;

  // ── Wing flutter ──
  wingFlutterSpeedMult: number;
  wingFlutterAmplitudeMult: number;
  wingSpreadOffset: number;        // additive radians (+ = spread, − = pull in)

  // ── Core pulse ──
  corePulseSpeedMult: number;
  coreIntensityMult: number;

  // ── Antenna ──
  antennaSpeedMult: number;
  antennaAmplitudeMult: number;

  // ── Blink / eyes ──
  blinkCycleMult: number;          // >1 = less frequent
  eyeScaleYMult: number;           // >1 = wider eyes
  eyeScaleXMult: number;           // >1 = wider horizontally

  // ── Gaze (highlight movement) ──
  gazeOffsetX: number;             // horizontal gaze bias (+ = outward)
  gazeOffsetY: number;             // vertical gaze bias (+ = up)
  highlightSizeMult: number;       // sparkle dilation (>1 = bigger)
  saccadeSpeed: number;            // micro-saccade frequency (1.0 = normal)
  saccadeAmplitude: number;        // micro-saccade range (1.0 = normal)

  // ── Body tilt & position ──
  bodyTiltXOffset: number;         // radians (− = lean forward)
  verticalOffset: number;

  // ── Jitter (fear / anger trembling) ──
  jitterAmplitude: number;
  jitterSpeed: number;
}

// ═══════════════════════════════════════════════
// NEUTRAL PROFILE
// ═══════════════════════════════════════════════

export const NEUTRAL_PROFILE: Readonly<MoodAnimProfile> = {
  bobSpeedMult: 1.0,
  bobAmplitudeMult: 1.0,
  swaySpeedMult: 1.0,
  swayAmplitudeMult: 1.0,
  wingFlutterSpeedMult: 1.0,
  wingFlutterAmplitudeMult: 1.0,
  wingSpreadOffset: 0.0,
  corePulseSpeedMult: 1.0,
  coreIntensityMult: 1.0,
  antennaSpeedMult: 1.0,
  antennaAmplitudeMult: 1.0,
  blinkCycleMult: 1.0,
  eyeScaleYMult: 1.0,
  eyeScaleXMult: 1.0,
  gazeOffsetX: 0.0,
  gazeOffsetY: 0.0,
  highlightSizeMult: 1.0,
  saccadeSpeed: 1.0,
  saccadeAmplitude: 1.0,
  bodyTiltXOffset: 0.0,
  verticalOffset: 0.0,
  jitterAmplitude: 0.0,
  jitterSpeed: 0.0,
};

// ═══════════════════════════════════════════════
// EMOTION PROFILES (authored at "mid" intensity)
// ═══════════════════════════════════════════════

const MOOD_PROFILES: Record<MoodData['emotion'], MoodAnimProfile> = {

  // ── JOY: bouncy, bright, wings spread wide ──
  joy: {
    bobSpeedMult: 1.5,
    bobAmplitudeMult: 1.8,
    swaySpeedMult: 1.3,
    swayAmplitudeMult: 1.4,
    wingFlutterSpeedMult: 1.4,
    wingFlutterAmplitudeMult: 1.6,
    wingSpreadOffset: 0.12,
    corePulseSpeedMult: 1.3,
    coreIntensityMult: 1.4,
    antennaSpeedMult: 1.3,
    antennaAmplitudeMult: 1.3,
    blinkCycleMult: 0.8,
    eyeScaleYMult: 1.1,
    eyeScaleXMult: 1.05,
    gazeOffsetX: 0.0,
    gazeOffsetY: 0.002,
    highlightSizeMult: 1.3,
    saccadeSpeed: 1.0,
    saccadeAmplitude: 1.0,
    bodyTiltXOffset: 0.0,
    verticalOffset: 0.01,
    jitterAmplitude: 0.0,
    jitterSpeed: 0.0,
  },

  // ── TRUST: calm, steady, warm glow ──
  trust: {
    bobSpeedMult: 0.85,
    bobAmplitudeMult: 0.9,
    swaySpeedMult: 0.8,
    swayAmplitudeMult: 0.85,
    wingFlutterSpeedMult: 0.8,
    wingFlutterAmplitudeMult: 0.85,
    wingSpreadOffset: 0.04,
    corePulseSpeedMult: 0.85,
    coreIntensityMult: 1.15,
    antennaSpeedMult: 0.8,
    antennaAmplitudeMult: 0.85,
    blinkCycleMult: 1.1,
    eyeScaleYMult: 1.0,
    eyeScaleXMult: 1.0,
    gazeOffsetX: 0.0,
    gazeOffsetY: 0.0,
    highlightSizeMult: 1.1,
    saccadeSpeed: 0.6,
    saccadeAmplitude: 0.5,
    bodyTiltXOffset: -0.01,
    verticalOffset: 0.0,
    jitterAmplitude: 0.0,
    jitterSpeed: 0.0,
  },

  // ── FEAR: nervous trembling, wings pulled in, dim, lowered ──
  fear: {
    bobSpeedMult: 1.5,
    bobAmplitudeMult: 0.6,
    swaySpeedMult: 1.6,
    swayAmplitudeMult: 0.4,
    wingFlutterSpeedMult: 1.6,
    wingFlutterAmplitudeMult: 0.5,
    wingSpreadOffset: -0.12,
    corePulseSpeedMult: 1.4,
    coreIntensityMult: 0.65,
    antennaSpeedMult: 1.8,
    antennaAmplitudeMult: 0.5,
    blinkCycleMult: 0.6,
    eyeScaleYMult: 1.15,
    eyeScaleXMult: 1.08,
    gazeOffsetX: 0.0,
    gazeOffsetY: -0.004,
    highlightSizeMult: 1.15,
    saccadeSpeed: 2.0,
    saccadeAmplitude: 1.8,
    bodyTiltXOffset: 0.025,
    verticalOffset: -0.015,
    jitterAmplitude: 0.0012,
    jitterSpeed: 14.0,
  },

  // ── SURPRISE: wide eyes, wings flung open, antenna alert ──
  surprise: {
    bobSpeedMult: 1.3,
    bobAmplitudeMult: 1.4,
    swaySpeedMult: 0.6,
    swayAmplitudeMult: 0.3,
    wingFlutterSpeedMult: 1.8,
    wingFlutterAmplitudeMult: 1.8,
    wingSpreadOffset: 0.18,
    corePulseSpeedMult: 1.5,
    coreIntensityMult: 1.5,
    antennaSpeedMult: 1.8,
    antennaAmplitudeMult: 1.6,
    blinkCycleMult: 2.0,
    eyeScaleYMult: 1.35,
    eyeScaleXMult: 1.2,
    gazeOffsetX: 0.0,
    gazeOffsetY: 0.005,
    highlightSizeMult: 1.5,
    saccadeSpeed: 0.3,
    saccadeAmplitude: 0.3,
    bodyTiltXOffset: 0.04,
    verticalOffset: 0.015,
    jitterAmplitude: 0.0004,
    jitterSpeed: 10.0,
  },

  // ── SADNESS: slow, droopy, dim, lowered, half-closed eyes ──
  sadness: {
    bobSpeedMult: 0.5,
    bobAmplitudeMult: 0.6,
    swaySpeedMult: 0.4,
    swayAmplitudeMult: 0.7,
    wingFlutterSpeedMult: 0.4,
    wingFlutterAmplitudeMult: 0.5,
    wingSpreadOffset: -0.08,
    corePulseSpeedMult: 0.5,
    coreIntensityMult: 0.55,
    antennaSpeedMult: 0.4,
    antennaAmplitudeMult: 0.5,
    blinkCycleMult: 0.7,
    eyeScaleYMult: 0.7,
    eyeScaleXMult: 0.92,
    gazeOffsetX: 0.0,
    gazeOffsetY: -0.012,
    highlightSizeMult: 0.8,
    saccadeSpeed: 0.5,
    saccadeAmplitude: 0.7,
    bodyTiltXOffset: 0.02,
    verticalOffset: -0.025,
    jitterAmplitude: 0.0,
    jitterSpeed: 0.0,
  },

  // ── DISGUST: recoil, wings tight, slight turn away ──
  disgust: {
    bobSpeedMult: 0.7,
    bobAmplitudeMult: 0.6,
    swaySpeedMult: 0.6,
    swayAmplitudeMult: 0.5,
    wingFlutterSpeedMult: 0.7,
    wingFlutterAmplitudeMult: 0.5,
    wingSpreadOffset: -0.12,
    corePulseSpeedMult: 0.8,
    coreIntensityMult: 0.7,
    antennaSpeedMult: 0.6,
    antennaAmplitudeMult: 0.6,
    blinkCycleMult: 0.85,
    eyeScaleYMult: 0.75,
    eyeScaleXMult: 0.85,
    gazeOffsetX: 0.01,
    gazeOffsetY: -0.003,
    highlightSizeMult: 0.7,
    saccadeSpeed: 0.8,
    saccadeAmplitude: 0.6,
    bodyTiltXOffset: 0.035,
    verticalOffset: 0.0,
    jitterAmplitude: 0.0,
    jitterSpeed: 0.0,
  },

  // ── ANGER: intense, sharp, aggressive spread, bright ──
  anger: {
    bobSpeedMult: 1.3,
    bobAmplitudeMult: 0.8,
    swaySpeedMult: 1.4,
    swayAmplitudeMult: 0.8,
    wingFlutterSpeedMult: 1.6,
    wingFlutterAmplitudeMult: 1.4,
    wingSpreadOffset: 0.12,
    corePulseSpeedMult: 1.6,
    coreIntensityMult: 1.5,
    antennaSpeedMult: 1.6,
    antennaAmplitudeMult: 1.3,
    blinkCycleMult: 1.5,
    eyeScaleYMult: 0.85,
    eyeScaleXMult: 0.9,
    gazeOffsetX: 0.0,
    gazeOffsetY: -0.002,
    highlightSizeMult: 0.75,
    saccadeSpeed: 1.3,
    saccadeAmplitude: 0.8,
    bodyTiltXOffset: -0.025,
    verticalOffset: 0.005,
    jitterAmplitude: 0.0008,
    jitterSpeed: 12.0,
  },

  // ── ANTICIPATION: leaning in, alert, attentive ──
  anticipation: {
    bobSpeedMult: 1.2,
    bobAmplitudeMult: 1.1,
    swaySpeedMult: 1.1,
    swayAmplitudeMult: 0.9,
    wingFlutterSpeedMult: 1.2,
    wingFlutterAmplitudeMult: 1.1,
    wingSpreadOffset: 0.06,
    corePulseSpeedMult: 1.2,
    coreIntensityMult: 1.2,
    antennaSpeedMult: 1.4,
    antennaAmplitudeMult: 1.3,
    blinkCycleMult: 1.2,
    eyeScaleYMult: 1.1,
    eyeScaleXMult: 1.05,
    gazeOffsetX: 0.0,
    gazeOffsetY: 0.006,
    highlightSizeMult: 1.15,
    saccadeSpeed: 1.2,
    saccadeAmplitude: 0.8,
    bodyTiltXOffset: -0.035,
    verticalOffset: 0.005,
    jitterAmplitude: 0.0,
    jitterSpeed: 0.0,
  },
};

// ═══════════════════════════════════════════════
// INTENSITY SCALING
// ═══════════════════════════════════════════════

const INTENSITY_SCALE: Record<MoodData['intensity'], number> = {
  low: 0.4,
  mid: 1.0,
  high: 1.6,
};

/**
 * Scale a mood profile by intensity.
 *
 * Multiplier fields: `1.0 + (value − 1.0) × scale`
 * Offset fields:     `value × scale`
 */
function scaleProfileByIntensity(
  profile: MoodAnimProfile,
  intensity: MoodData['intensity'],
): MoodAnimProfile {
  const s = INTENSITY_SCALE[intensity];
  const mult = (v: number) => 1.0 + (v - 1.0) * s;
  const off = (v: number) => v * s;

  return {
    bobSpeedMult: mult(profile.bobSpeedMult),
    bobAmplitudeMult: mult(profile.bobAmplitudeMult),
    swaySpeedMult: mult(profile.swaySpeedMult),
    swayAmplitudeMult: mult(profile.swayAmplitudeMult),
    wingFlutterSpeedMult: mult(profile.wingFlutterSpeedMult),
    wingFlutterAmplitudeMult: mult(profile.wingFlutterAmplitudeMult),
    wingSpreadOffset: off(profile.wingSpreadOffset),
    corePulseSpeedMult: mult(profile.corePulseSpeedMult),
    coreIntensityMult: mult(profile.coreIntensityMult),
    antennaSpeedMult: mult(profile.antennaSpeedMult),
    antennaAmplitudeMult: mult(profile.antennaAmplitudeMult),
    blinkCycleMult: mult(profile.blinkCycleMult),
    eyeScaleYMult: mult(profile.eyeScaleYMult),
    eyeScaleXMult: mult(profile.eyeScaleXMult),
    gazeOffsetX: off(profile.gazeOffsetX),
    gazeOffsetY: off(profile.gazeOffsetY),
    highlightSizeMult: mult(profile.highlightSizeMult),
    saccadeSpeed: mult(profile.saccadeSpeed),
    saccadeAmplitude: mult(profile.saccadeAmplitude),
    bodyTiltXOffset: off(profile.bodyTiltXOffset),
    verticalOffset: off(profile.verticalOffset),
    jitterAmplitude: off(profile.jitterAmplitude),
    jitterSpeed: off(profile.jitterSpeed),
  };
}

// ═══════════════════════════════════════════════
// PROFILE LERP
// ═══════════════════════════════════════════════

/** Per-field linear interpolation between two profiles. */
function lerpProfile(
  a: MoodAnimProfile,
  b: MoodAnimProfile,
  t: number,
): MoodAnimProfile {
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    bobSpeedMult: l(a.bobSpeedMult, b.bobSpeedMult),
    bobAmplitudeMult: l(a.bobAmplitudeMult, b.bobAmplitudeMult),
    swaySpeedMult: l(a.swaySpeedMult, b.swaySpeedMult),
    swayAmplitudeMult: l(a.swayAmplitudeMult, b.swayAmplitudeMult),
    wingFlutterSpeedMult: l(a.wingFlutterSpeedMult, b.wingFlutterSpeedMult),
    wingFlutterAmplitudeMult: l(a.wingFlutterAmplitudeMult, b.wingFlutterAmplitudeMult),
    wingSpreadOffset: l(a.wingSpreadOffset, b.wingSpreadOffset),
    corePulseSpeedMult: l(a.corePulseSpeedMult, b.corePulseSpeedMult),
    coreIntensityMult: l(a.coreIntensityMult, b.coreIntensityMult),
    antennaSpeedMult: l(a.antennaSpeedMult, b.antennaSpeedMult),
    antennaAmplitudeMult: l(a.antennaAmplitudeMult, b.antennaAmplitudeMult),
    blinkCycleMult: l(a.blinkCycleMult, b.blinkCycleMult),
    eyeScaleYMult: l(a.eyeScaleYMult, b.eyeScaleYMult),
    eyeScaleXMult: l(a.eyeScaleXMult, b.eyeScaleXMult),
    gazeOffsetX: l(a.gazeOffsetX, b.gazeOffsetX),
    gazeOffsetY: l(a.gazeOffsetY, b.gazeOffsetY),
    highlightSizeMult: l(a.highlightSizeMult, b.highlightSizeMult),
    saccadeSpeed: l(a.saccadeSpeed, b.saccadeSpeed),
    saccadeAmplitude: l(a.saccadeAmplitude, b.saccadeAmplitude),
    bodyTiltXOffset: l(a.bodyTiltXOffset, b.bodyTiltXOffset),
    verticalOffset: l(a.verticalOffset, b.verticalOffset),
    jitterAmplitude: l(a.jitterAmplitude, b.jitterAmplitude),
    jitterSpeed: l(a.jitterSpeed, b.jitterSpeed),
  };
}

// ═══════════════════════════════════════════════
// TRANSITION MANAGER
// ═══════════════════════════════════════════════

/**
 * Manages smooth transitions between mood animation profiles.
 *
 * - Call {@link setMood} when a `comm:mood` event arrives.
 * - Call {@link clearMood} when mood becomes inactive.
 * - Call {@link resolve} each frame to get the current blended profile.
 */
export class MoodAnimState {
  private fromProfile: MoodAnimProfile = { ...NEUTRAL_PROFILE };
  private toProfile: MoodAnimProfile = { ...NEUTRAL_PROFILE };
  private blend = 1.0;
  private readonly transitionSpeed = 3.5; // ~95% in ~0.85s

  /** Current resolved profile — cached each frame. */
  private current: MoodAnimProfile = { ...NEUTRAL_PROFILE };

  /**
   * Set a new mood target. Snapshots current state as "from" and
   * begins lerping toward the scaled emotion profile.
   */
  setMood(emotion: MoodData['emotion'], intensity: MoodData['intensity']): void {
    this.fromProfile = { ...this.current };
    this.toProfile = scaleProfileByIntensity(MOOD_PROFILES[emotion], intensity);
    this.blend = 0;
  }

  /** Revert to neutral (mood became inactive). */
  clearMood(): void {
    this.fromProfile = { ...this.current };
    this.toProfile = { ...NEUTRAL_PROFILE };
    this.blend = 0;
  }

  /**
   * Advance the transition and return the current blended profile.
   * Uses exponential easing for frame-rate independent smoothing.
   */
  resolve(delta: number): MoodAnimProfile {
    if (this.blend < 1.0) {
      this.blend += (1.0 - this.blend) * (1 - Math.exp(-this.transitionSpeed * delta));
      if (this.blend > 0.998) this.blend = 1.0;
    }

    this.current = this.blend >= 1.0
      ? { ...this.toProfile }
      : lerpProfile(this.fromProfile, this.toProfile, this.blend);

    return this.current;
  }
}
