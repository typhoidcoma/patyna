import * as THREE from 'three';

/**
 * Plutchik wheel color palette — 8 emotions × 3 intensity levels.
 * Shared between environment shader and avatar materials.
 */
export const MOOD_COLORS: Record<string, Record<string, THREE.Color>> = {
  joy: {
    low:  new THREE.Color('#F6D96B'),  // serenity
    mid:  new THREE.Color('#FFC83D'),  // joy
    high: new THREE.Color('#FF9F1C'),  // ecstasy
  },
  trust: {
    low:  new THREE.Color('#8EDBC3'),  // acceptance
    mid:  new THREE.Color('#37C8AB'),  // trust
    high: new THREE.Color('#0E9F8A'),  // admiration
  },
  fear: {
    low:  new THREE.Color('#8B7BB8'),  // apprehension
    mid:  new THREE.Color('#5B4B8A'),  // fear
    high: new THREE.Color('#24153F'),  // terror
  },
  surprise: {
    low:  new THREE.Color('#B7E8FF'),  // distraction
    mid:  new THREE.Color('#63D5FF'),  // surprise
    high: new THREE.Color('#00A6E8'),  // amazement
  },
  sadness: {
    low:  new THREE.Color('#9EB7D9'),  // pensiveness
    mid:  new THREE.Color('#5E84C3'),  // sadness
    high: new THREE.Color('#253C78'),  // grief
  },
  disgust: {
    low:  new THREE.Color('#A7B56B'),  // boredom
    mid:  new THREE.Color('#6E8B3D'),  // disgust
    high: new THREE.Color('#33461D'),  // loathing
  },
  anger: {
    low:  new THREE.Color('#F28A7A'),  // annoyance
    mid:  new THREE.Color('#E3483A'),  // anger
    high: new THREE.Color('#8F1022'),  // rage
  },
  anticipation: {
    low:  new THREE.Color('#F3C77A'),  // interest
    mid:  new THREE.Color('#F59E0B'),  // anticipation
    high: new THREE.Color('#C96A04'),  // vigilance
  },
};

/** Look up the mood color for a given emotion + intensity, defaulting to mid. */
export function getMoodColor(emotion: string, intensity?: string): THREE.Color | null {
  const ladder = MOOD_COLORS[emotion];
  if (!ladder) return null;
  return ladder[intensity ?? 'mid'] ?? ladder.mid;
}
