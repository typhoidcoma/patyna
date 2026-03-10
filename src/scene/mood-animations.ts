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
    bodyTiltXOffset: -0.01,
    verticalOffset: 0.0,
    jitterAmplitude: 0.0,
    jitterSpeed: 0.0,
  },

  // ── FEAR: jittery trembling, wings pulled in, dim, lowered ──
  fear: {
    bobSpeedMult: 1.8,
    bobAmplitudeMult: 0.5,
    swaySpeedMult: 2.2,
    swayAmplitudeMult: 0.4,
    wingFlutterSpeedMult: 2.0,
    wingFlutterAmplitudeMult: 0.4,
    wingSpreadOffset: -0.15,
    corePulseSpeedMult: 1.6,
    coreIntensityMult: 0.6,
    antennaSpeedMult: 2.5,
    antennaAmplitudeMult: 0.5,
    blinkCycleMult: 0.5,
    eyeScaleYMult: 1.2,
    bodyTiltXOffset: 0.03,
    verticalOffset: -0.02,
    jitterAmplitude: 0.003,
    jitterSpeed: 18.0,
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
    bodyTiltXOffset: 0.04,
    verticalOffset: 0.015,
    jitterAmplitude: 0.001,
    jitterSpeed: 12.0,
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
    bodyTiltXOffset: 0.035,
    verticalOffset: 0.0,
    jitterAmplitude: 0.0,
    jitterSpeed: 0.0,
  },

  // ── ANGER: intense, sharp, aggressive spread, bright ──
  anger: {
    bobSpeedMult: 1.4,
    bobAmplitudeMult: 0.7,
    swaySpeedMult: 1.6,
    swayAmplitudeMult: 0.8,
    wingFlutterSpeedMult: 1.8,
    wingFlutterAmplitudeMult: 1.5,
    wingSpreadOffset: 0.14,
    corePulseSpeedMult: 1.8,
    coreIntensityMult: 1.6,
    antennaSpeedMult: 2.0,
    antennaAmplitudeMult: 1.4,
    blinkCycleMult: 1.5,
    eyeScaleYMult: 0.8,
    bodyTiltXOffset: -0.03,
    verticalOffset: 0.005,
    jitterAmplitude: 0.002,
    jitterSpeed: 15.0,
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
