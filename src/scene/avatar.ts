import * as THREE from 'three';
import { eventBus } from '@/core/event-bus.ts';
import type { AppState } from '@/types/config.ts';

/**
 * Patyna — Butterfly-core AI entity.
 * Floating mint-teal teardrop body with translucent shell, luminous inner core,
 * butterfly wings, antennae, and simplified dark-pool eyes.
 * Reacts visually to app state (idle/listening/thinking/speaking).
 */
export class Avatar {
  readonly group: THREE.Group;
  readonly headGroup: THREE.Group;

  // Animation sub-group (between headGroup and meshes)
  // Separates idle animation from face-tracking quaternion
  private bodyAnimGroup: THREE.Group;

  // Core meshes
  private bodyMesh: THREE.Mesh;
  private coreMesh: THREE.Mesh;
  private coreGlowMesh: THREE.Mesh;

  // Face
  private leftEyeGroup: THREE.Group;
  private rightEyeGroup: THREE.Group;
  private mouth: THREE.Mesh;

  // Wings
  private wingGroupLeft: THREE.Group;
  private wingGroupRight: THREE.Group;

  // Antennae
  private antennaLeft: THREE.Group;
  private antennaRight: THREE.Group;

  // Materials (updated per frame)
  private bodyMat: THREE.MeshPhysicalMaterial;
  private coreMat: THREE.MeshStandardMaterial;
  private coreGlowMat: THREE.MeshBasicMaterial;
  private wingMat: THREE.MeshBasicMaterial;
  private antennaTipMat: THREE.MeshBasicMaterial;
  private mouthMat!: THREE.MeshBasicMaterial;

  // State
  private currentState: AppState = 'idle';
  private stateBlend = 0;
  private audioAmplitude = 0;

  // Mouth color targets for speaking
  private readonly mouthIdleColor = new THREE.Color('#1C8E77');
  private readonly mouthSpeakColor = new THREE.Color('#4AEDC4');

  // Stored base positions for reset each frame
  private eyeBaseY = 0;

  constructor() {
    this.group = new THREE.Group();
    this.headGroup = new THREE.Group();
    this.bodyAnimGroup = new THREE.Group();
    this.leftEyeGroup = new THREE.Group();
    this.rightEyeGroup = new THREE.Group();
    this.wingGroupLeft = new THREE.Group();
    this.wingGroupRight = new THREE.Group();
    this.antennaLeft = new THREE.Group();
    this.antennaRight = new THREE.Group();

    // ── Materials ──
    this.bodyMat = this.createBodyMaterial();
    this.coreMat = this.createCoreMaterial();
    this.coreGlowMat = this.createCoreGlowMaterial();
    this.wingMat = this.createWingMaterial();
    this.antennaTipMat = new THREE.MeshBasicMaterial({
      color: '#D0FFF4',
      transparent: true,
      opacity: 0.95,
    });

    // ── Build geometry ──
    this.bodyMesh = this.buildBody();
    this.coreMesh = this.buildCore();
    this.coreGlowMesh = this.buildCoreGlow();
    this.buildEyes();
    this.mouth = this.buildMouth();
    this.buildWings();
    this.buildAntennae();

    // ── Assemble hierarchy ──
    // group > headGroup (face-tracked) > bodyAnimGroup (animation) > [all meshes]
    this.bodyAnimGroup.add(
      this.bodyMesh,
      this.coreMesh,
      this.coreGlowMesh,
      this.leftEyeGroup,
      this.rightEyeGroup,
      this.mouth,
      this.wingGroupLeft,
      this.wingGroupRight,
      this.antennaLeft,
      this.antennaRight,
    );
    this.headGroup.add(this.bodyAnimGroup);
    this.group.add(this.headGroup);

    // Listen for state changes
    eventBus.on('state:change', ({ to }) => {
      this.currentState = to;
      this.stateBlend = 0;
    });

  }

  /** Set audio amplitude directly from render loop (avoids event bus at 60fps) */
  setAmplitude(value: number): void {
    // Smooth toward target (prevents jitter, gives natural feel)
    this.audioAmplitude += (value - this.audioAmplitude) * 0.35;
  }

  // ══════════════════════════════════════
  // MATERIALS
  // ══════════════════════════════════════

  /** Soft ceramic body — gentle sheen, no harsh clearcoat reflections */
  private createBodyMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: '#63E6C7',
      roughness: 0.42,
      metalness: 0.0,
      sheen: 0.5,
      sheenRoughness: 0.4,
      sheenColor: new THREE.Color('#B8FFF0'),
      emissive: '#63E6C7',
      emissiveIntensity: 0.15,
    });
  }

  /** Subtle inner luminescence — blends into body, not a distinct sphere */
  private createCoreMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: '#B8FFF0',
      emissive: '#B8FFF0',
      emissiveIntensity: 0.6,
      roughness: 0.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.35,
    });
  }

  /** Soft additive glow halo around core area */
  private createCoreGlowMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: '#C8FFF4',
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
  }

  /** Wing material — translucent saturated mint for ethereal butterfly feel.
   *  Lower opacity keeps them delicate; deeper color avoids white-out on dark bg */
  private createWingMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: '#6EECC0',
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  // ══════════════════════════════════════
  // GEOMETRY BUILDERS
  // ══════════════════════════════════════

  /** Pear-shaped body via deformed SphereGeometry — seamless, no lathe crease */
  private buildBody(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.44, 64, 48);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // Normalised height: -1 (bottom) to +1 (top)
      const ny = y / 0.44;

      // Radius multiplier — wide at equator/lower, tapers gently at top
      let rScale: number;
      if (ny < -0.2) {
        // Bottom hemisphere: slightly narrower toward pole
        rScale = 0.92 + 0.08 * (1 - ((-0.2 - ny) / 0.8) ** 2);
      } else if (ny < 0.3) {
        // Widest band (lower-mid)
        rScale = 1.0;
      } else {
        // Upper: gentle taper to ~60% radius at top
        const t = (ny - 0.3) / 0.7;
        rScale = 1.0 - 0.40 * (t * t);
      }

      // Vertically stretch: taller top half, compact bottom
      const yStretch = ny < 0 ? 0.86 : 1.14;

      pos.setXYZ(i, x * rScale, y * yStretch, z * rScale);
    }

    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.bodyMat);
    mesh.position.y = 0.02;
    mesh.scale.setScalar(0.92);
    return mesh;
  }

  /** Inner glowing core sphere */
  private buildCore(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.14, 32, 24);
    const mesh = new THREE.Mesh(geo, this.coreMat);
    mesh.position.set(0, 0.06, 0);
    return mesh;
  }

  /** Additive glow halo around core */
  private buildCoreGlow(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.22, 32, 24);
    const mesh = new THREE.Mesh(geo, this.coreGlowMat);
    mesh.position.set(0, 0.06, 0);
    return mesh;
  }

  /** Large dark-pool eyes with sparkle highlights — cute and expressive */
  private buildEyes(): void {
    const eyeOffsetX = 0.13;
    const eyeY = 0.10;
    const eyeZ = 0.38;
    this.eyeBaseY = eyeY;

    const eyeMat = new THREE.MeshBasicMaterial({
      color: '#0A0A12',
    });
    const hlMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });

    for (const side of [-1, 1]) {
      const eyeGroup = side === -1 ? this.leftEyeGroup : this.rightEyeGroup;
      eyeGroup.position.set(side * eyeOffsetX, eyeY, eyeZ);

      // Large dark oval eye
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 24, 18),
        eyeMat,
      );
      eye.scale.set(0.78, 1.0, 0.4);
      eyeGroup.add(eye);

      // Primary sparkle — larger, more visible
      const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), hlMat);
      hl1.position.set(side * 0.018, 0.032, 0.042);
      eyeGroup.add(hl1);

      // Secondary smaller sparkle
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), hlMat);
      hl2.position.set(side * -0.014, -0.018, 0.042);
      eyeGroup.add(hl2);
    }
  }

  /** Smile arc — positioned just on body surface, larger for visible animation */
  private buildMouth(): THREE.Mesh {
    this.mouthMat = new THREE.MeshBasicMaterial({ color: '#1C8E77' });
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.038, 0.008, 8, 14, Math.PI),
      this.mouthMat,
    );
    mouth.position.set(0, 0.01, 0.42);
    mouth.rotation.z = Math.PI;
    return mouth;
  }

  /** Creates a butterfly upper-wing Shape — organic curved silhouette */
  private createUpperWingShape(): THREE.Shape {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    // Sweep up from body attachment
    s.bezierCurveTo(0.02, 0.10, 0.10, 0.26, 0.24, 0.32);
    // Round over the top
    s.bezierCurveTo(0.32, 0.34, 0.40, 0.28, 0.42, 0.18);
    // Down the outer edge
    s.bezierCurveTo(0.43, 0.08, 0.36, -0.02, 0.22, -0.04);
    // Back to body
    s.bezierCurveTo(0.10, -0.05, 0.02, -0.02, 0, 0);
    return s;
  }

  /** Creates a butterfly lower-wing Shape — smaller, rounder */
  private createLowerWingShape(): THREE.Shape {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    // Sweep down from body
    s.bezierCurveTo(0.04, -0.04, 0.14, -0.16, 0.26, -0.18);
    // Round the bottom
    s.bezierCurveTo(0.32, -0.18, 0.34, -0.12, 0.32, -0.04);
    // Back up toward body
    s.bezierCurveTo(0.28, 0.02, 0.14, 0.04, 0, 0);
    return s;
  }

  /** Butterfly wings — proper organic shape via ExtrudeGeometry */
  private buildWings(): void {
    const upperShape = this.createUpperWingShape();
    const lowerShape = this.createLowerWingShape();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.008,        // paper-thin
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 3,
    };

    const upperGeo = new THREE.ExtrudeGeometry(upperShape, extrudeSettings);
    const lowerGeo = new THREE.ExtrudeGeometry(lowerShape, extrudeSettings);

    const wingScale = 1.5;

    for (const side of [-1, 1]) {
      const wingGroup = side === -1 ? this.wingGroupLeft : this.wingGroupRight;
      wingGroup.position.set(0, 0.0, -0.06);

      // Upper wing
      const upper = new THREE.Mesh(upperGeo, this.wingMat);
      upper.scale.set(side * wingScale, wingScale, 1.0);
      upper.position.set(side * 0.16, 0.06, 0);
      upper.rotation.y = side * 0.25;
      wingGroup.add(upper);

      // Lower wing
      const lower = new THREE.Mesh(lowerGeo, this.wingMat);
      lower.scale.set(side * wingScale, wingScale, 1.0);
      lower.position.set(side * 0.16, 0.06, 0);
      lower.rotation.y = side * 0.25;
      wingGroup.add(lower);
    }
  }

  /** Curved antennae with glowing tips */
  private buildAntennae(): void {
    const stalkMat = new THREE.MeshStandardMaterial({
      color: '#63E6C7',
      roughness: 0.3,
      metalness: 0.0,
      emissive: '#1C8E77',
      emissiveIntensity: 0.1,
    });

    for (const side of [-1, 1]) {
      const antennaGroup = side === -1 ? this.antennaLeft : this.antennaRight;
      // Base starts inside the body where it has width, so stalk emerges from surface
      antennaGroup.position.set(side * 0.03, 0.38, 0.06);

      // Curved stalk via CubicBezierCurve3 — starts inside body, emerges, then curves outward
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, 0, 0),                           // inside body
        new THREE.Vector3(side * 0.01, 0.10, 0.02),           // emerges upward
        new THREE.Vector3(side * 0.06, 0.22, 0.02),           // curves outward
        new THREE.Vector3(side * 0.10, 0.30, 0.0),            // tip — higher and wider
      );
      const stalkGeo = new THREE.TubeGeometry(curve, 16, 0.005, 6, false);
      const stalk = new THREE.Mesh(stalkGeo, stalkMat);
      antennaGroup.add(stalk);

      // Glowing tip — slightly larger for visibility
      const tipGeo = new THREE.SphereGeometry(0.018, 12, 8);
      const tip = new THREE.Mesh(tipGeo, this.antennaTipMat);
      const tipPos = curve.getPoint(1);
      tip.position.copy(tipPos);
      antennaGroup.add(tip);
    }
  }

  // ══════════════════════════════════════
  // ANIMATION
  // ══════════════════════════════════════

  /** Per-frame update — idle animation + state-driven reactions */
  update(_delta: number, elapsed: number): void {
    // Ease state blend toward 1 (faster for speaking so it kicks in immediately)
    const blendSpeed = this.currentState === 'speaking' ? 5.0 : 3.0;
    this.stateBlend = Math.min(1, this.stateBlend + _delta * blendSpeed);

    // Gentle decay when no amplitude events arrive (e.g. audio ended)
    this.audioAmplitude *= Math.max(0, 1 - _delta * 6.0);

    // Reset animated properties to base values
    this.bodyAnimGroup.position.set(0, 0, 0);
    this.bodyAnimGroup.rotation.set(0, 0, 0);
    this.leftEyeGroup.position.y = this.eyeBaseY;
    this.rightEyeGroup.position.y = this.eyeBaseY;
    this.mouth.scale.set(1, 1, 1);

    const idleMix = this.currentState === 'speaking' ? 0.15 : 1.0;

    // ── Core pulse (always active, speed varies by state) ──
    this.updateCorePulse(elapsed);

    // ── Hover bob (~3.5s cycle) ──
    const bobT = Math.sin(elapsed * 0.285 * Math.PI * 2);
    this.bodyAnimGroup.position.y = bobT * 0.015 * idleMix;

    // ── Micro-rotation sway ──
    this.bodyAnimGroup.rotation.z = Math.sin(elapsed * 0.9) * 0.012 * idleMix;

    // ── Wing shimmer (continuous) ──
    this.updateWingShimmer(elapsed, idleMix);

    // ── Blink ──
    this.updateBlink(elapsed);

    // ── Antenna sway ──
    this.updateAntennae(elapsed);

    // ── State-specific reactions ──
    switch (this.currentState) {
      case 'listening':
        this.updateListening(elapsed);
        break;
      case 'thinking':
        this.updateThinking(elapsed);
        break;
      case 'speaking':
        this.updateSpeaking(elapsed);
        break;
    }
  }

  /** Soft body + core glow pulse — the whole body breathes light */
  private updateCorePulse(elapsed: number): void {
    let speed: number;
    let bodyMin: number;
    let bodyMax: number;
    let coreMin: number;
    let coreMax: number;
    let glowMin: number;
    let glowMax: number;

    switch (this.currentState) {
      case 'idle':
        speed = 1.0;
        bodyMin = 0.12; bodyMax = 0.20;
        coreMin = 0.3; coreMax = 0.6;
        glowMin = 0.06; glowMax = 0.15;
        break;
      case 'listening':
        speed = 1.3;
        bodyMin = 0.15; bodyMax = 0.25;
        coreMin = 0.4; coreMax = 0.7;
        glowMin = 0.08; glowMax = 0.18;
        break;
      case 'thinking':
        // Same as idle — avatar stays calm while waiting for audio
        speed = 1.0;
        bodyMin = 0.12; bodyMax = 0.20;
        coreMin = 0.3; coreMax = 0.6;
        glowMin = 0.06; glowMax = 0.15;
        break;
      case 'speaking':
        speed = 0.8;
        bodyMin = 0.20; bodyMax = 0.30;
        coreMin = 0.5; coreMax = 0.8;
        glowMin = 0.10; glowMax = 0.20;
        break;
    }

    const t = Math.sin(elapsed * speed * Math.PI * 2) * 0.5 + 0.5;
    this.bodyMat.emissiveIntensity = bodyMin + (bodyMax - bodyMin) * t;
    this.coreMat.emissiveIntensity = coreMin + (coreMax - coreMin) * t;
    this.coreGlowMat.opacity = glowMin + (glowMax - glowMin) * t;
  }

  /** Continuous wing flutter + shimmer */
  private updateWingShimmer(elapsed: number, idleMix: number): void {
    const flutter1 = Math.sin(elapsed * 3.2) * 0.05;
    const flutter2 = Math.sin(elapsed * 3.8 + 0.5) * 0.03;

    this.wingGroupLeft.rotation.y = flutter1 * idleMix;
    this.wingGroupRight.rotation.y = -flutter1 * idleMix;
    this.wingGroupLeft.rotation.z = flutter2 * idleMix;
    this.wingGroupRight.rotation.z = -flutter2 * idleMix;

    // Soft opacity breathing — translucent shimmer
    const shimmer = Math.sin(elapsed * 1.8) * 0.5 + 0.5;
    this.wingMat.opacity = 0.42 + shimmer * 0.14;
  }

  /** Deterministic blink — ~4s cycle, 0.15s duration */
  private updateBlink(elapsed: number): void {
    const blinkCycle = 4.0;
    const blinkDuration = 0.15;
    const phase = elapsed % blinkCycle;

    let eyeScaleY = 1.0;
    if (phase < blinkDuration) {
      const t = phase / blinkDuration;
      eyeScaleY = 1.0 - Math.sin(t * Math.PI);
      eyeScaleY = Math.max(0.05, eyeScaleY);
    }
    this.leftEyeGroup.scale.y = eyeScaleY;
    this.rightEyeGroup.scale.y = eyeScaleY;
  }

  /** Gentle antenna sway + tip glow pulse */
  private updateAntennae(elapsed: number): void {
    this.antennaLeft.rotation.z = Math.sin(elapsed * 1.2) * 0.08;
    this.antennaLeft.rotation.x = Math.sin(elapsed * 0.9 + 0.5) * 0.04;
    this.antennaRight.rotation.z = Math.sin(elapsed * 1.2 + 1.0) * 0.08;
    this.antennaRight.rotation.x = Math.sin(elapsed * 0.9 + 1.5) * 0.04;

    // Tip glow pulse (offset from core) — bright pulsing beacons
    const tipGlow = Math.sin(elapsed * 1.8 + 0.3) * 0.5 + 0.5;
    this.antennaTipMat.opacity = 0.6 + tipGlow * 0.4;
  }

  // ── State-specific overrides ──

  /** Listening — forward lean, wings forward, brighter core */
  private updateListening(_elapsed: number): void {
    this.bodyAnimGroup.rotation.x = -0.04 * this.stateBlend;

    // Wings angle slightly forward
    this.wingGroupLeft.rotation.y += -0.06 * this.stateBlend;
    this.wingGroupRight.rotation.y += 0.06 * this.stateBlend;

    // Slightly open mouth
    this.mouth.scale.y = 1.0 + 0.3 * this.stateBlend;
  }

  /** Thinking — stay calm, just subtle eye glance upward.
   *  No bouncing or head tilting — avatar waits quietly for audio. */
  private updateThinking(_elapsed: number): void {
    // Very subtle eyes-up hint (barely noticeable)
    const eyeShift = 0.005 * this.stateBlend;
    this.leftEyeGroup.position.y += eyeShift;
    this.rightEyeGroup.position.y += eyeShift;
  }

  /** Speaking — voice-reactive animation: mouth, core, body, wings, antennae */
  private updateSpeaking(elapsed: number): void {
    const blend = this.stateBlend;
    const amp = this.audioAmplitude;

    // ── Mouth: amplitude-driven when audio is flowing, sine fallback otherwise ──
    const sineOpen = (Math.sin(elapsed * 10.0) * 0.5 + 0.5)
                   * (Math.sin(elapsed * 6.5) * 0.3 + 0.7);
    const mouthOpen = amp > 0.01 ? amp : sineOpen * 0.4;
    this.mouth.scale.y = 1.0 + mouthOpen * 2.5 * blend;
    this.mouth.scale.x = 1.0 + mouthOpen * 0.35 * blend;

    // Mouth color: brighten toward mint during speaking
    this.mouthMat.color.copy(this.mouthIdleColor).lerp(this.mouthSpeakColor, blend * (0.5 + amp * 0.5));

    // ── Core glow reacts to voice ──
    this.coreMat.emissiveIntensity += amp * 0.4 * blend;
    this.coreGlowMat.opacity += amp * 0.12 * blend;

    // ── Body: gentle rhythmic sway (NOT amplitude-driven — avoids jitter) ──
    this.bodyMat.emissiveIntensity += amp * 0.12 * blend;
    this.bodyAnimGroup.position.y += Math.sin(elapsed * 2.5) * 0.010 * blend;

    // ── Wings flutter scales with voice ──
    const wingAmp = (1.0 + amp * 2.0) * blend;
    this.wingGroupLeft.rotation.y += Math.sin(elapsed * 5.0) * 0.10 * wingAmp;
    this.wingGroupRight.rotation.y -= Math.sin(elapsed * 5.0) * 0.10 * wingAmp;

    // ── Antenna excitement — faster, larger sway ──
    this.antennaLeft.rotation.z += (Math.sin(elapsed * 4.5) * 0.18 - Math.sin(elapsed * 1.2) * 0.08) * blend;
    this.antennaLeft.rotation.x += (Math.sin(elapsed * 3.0 + 0.5) * 0.10 - Math.sin(elapsed * 0.9 + 0.5) * 0.04) * blend;
    this.antennaRight.rotation.z += (Math.sin(elapsed * 4.5 + 1.0) * 0.18 - Math.sin(elapsed * 1.2 + 1.0) * 0.08) * blend;
    this.antennaRight.rotation.x += (Math.sin(elapsed * 3.0 + 1.5) * 0.10 - Math.sin(elapsed * 0.9 + 1.5) * 0.04) * blend;

    // ── Antenna tips: glow intensity tracks voice amplitude ──
    this.antennaTipMat.opacity = 0.2 + amp * 0.8;
    this.antennaTipMat.color.setRGB(
      0.816 + amp * 0.184,   // R: push toward white at loud
      1.0,                    // G: always full
      0.957 + amp * 0.043,   // B: push toward white at loud
    );
  }
}
