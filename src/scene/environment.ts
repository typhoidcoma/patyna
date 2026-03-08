import * as THREE from 'three';
import { eventBus } from '@/core/event-bus.ts';

// ── Mood → sparkle color mapping (bold, vivid) ──
const MOOD_COLORS: Record<string, THREE.Color> = {
  joy:          new THREE.Color('#FFD000'),
  trust:        new THREE.Color('#4CAF50'),
  fear:         new THREE.Color('#AB47BC'),
  surprise:     new THREE.Color('#29B6F6'),
  sadness:      new THREE.Color('#5C6BC0'),
  disgust:      new THREE.Color('#66BB6A'),
  anger:        new THREE.Color('#FF5252'),
  anticipation: new THREE.Color('#FF9100'),
};
const DEFAULT_SPARKLE = new THREE.Color(1.0, 0.88, 0.55); // warm gold

// Smooth color transition state
let targetSparkleColor = DEFAULT_SPARKLE.clone();
let currentSparkleColor = DEFAULT_SPARKLE.clone();

/**
 * Creates an ambient environment background.
 * - Radial gradient: soft teal glow behind character, fading to dark edges
 * - Contour field: slow-moving topographic lines at low opacity
 * - Sparkle particles: floating luminous dots for ethereal feel
 * - Sparkle color responds to mood events
 */
export function createEnvironment(scene: THREE.Scene): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(12, 12);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uTeal: { value: new THREE.Color('#1C8E77') },
      uGlow: { value: new THREE.Color('#63E6C7') },
      uSparkleColor: { value: DEFAULT_SPARKLE.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTeal;
      uniform vec3 uGlow;
      uniform vec3 uSparkleColor;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 uv = vUv;
        vec2 center = uv - 0.5;
        float dist = length(center);

        // ── Vignette: subtle darkening at edges ──
        float vignette = 1.0 - smoothstep(0.20, 0.65, dist) * 0.55;

        // ── Radial gradient: layered teal glow ──
        float innerGlow = exp(-dist * dist * 5.0) * 0.18;     // tight center
        float outerGlow = exp(-dist * dist * 2.0) * 0.06;     // wide soft halo
        float glow = innerGlow + outerGlow;
        vec3 glowColor = uGlow * glow;

        // ── Contour field ──
        vec2 p = uv * 8.0;
        float field = sin(p.x * 3.0 + uTime * 0.12)
                    + sin(p.y * 2.5 - uTime * 0.08)
                    + sin((p.x + p.y) * 1.8 + uTime * 0.06);
        field *= 0.333;

        float contour = abs(fract(field * 3.0) - 0.5);
        contour = smoothstep(0.0, 0.05, contour);
        float line = 1.0 - contour;

        float contourFade = smoothstep(0.65, 0.1, dist);
        vec3 contourColor = uTeal * line * 0.07 * contourFade;

        // ── Sparkle particles (bright mint dots) ──
        float sparkle = 0.0;
        vec3 sparkleCol = vec3(0.0);

        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          float gridSize = 12.0 + fi * 4.5;
          vec2 grid = floor(uv * gridSize);
          float h = hash(grid + fi * 10.0);

          if (h > 0.72) {
            vec2 cellUv = fract(uv * gridSize);
            vec2 sparklePos = vec2(
              hash(grid + fi * 20.0 + 1.0),
              hash(grid + fi * 20.0 + 2.0)
            );
            sparklePos += vec2(
              sin(uTime * 0.18 + h * 6.28) * 0.12,
              cos(uTime * 0.14 + h * 3.14) * 0.12
            );
            float d = length(cellUv - sparklePos);

            // Twinkle
            float twinkle = sin(uTime * (1.0 + h * 3.0) + h * 6.28) * 0.5 + 0.5;
            twinkle *= twinkle;

            // Core dot (sharp bright point)
            float dot = smoothstep(0.06, 0.0, d) * twinkle;
            // Soft glow halo around each sparkle
            float halo = smoothstep(0.14, 0.02, d) * twinkle * 0.3;
            float combined = dot + halo;

            // Fade toward viewport edges
            combined *= smoothstep(0.68, 0.12, dist);
            float intensity = combined * (0.20 + fi * 0.04);
            sparkle += intensity;
            sparkleCol += uSparkleColor * intensity;
          }
        }

        // ── Star sparkles: rare, extra-bright points ──
        {
          vec2 starGrid = floor(uv * 9.0);
          float sh = hash(starGrid + 99.0);
          if (sh > 0.92) {
            vec2 starCellUv = fract(uv * 9.0);
            vec2 starPos = vec2(hash(starGrid + 101.0), hash(starGrid + 102.0));
            starPos += vec2(
              sin(uTime * 0.08 + sh * 6.28) * 0.06,
              cos(uTime * 0.06 + sh * 3.14) * 0.06
            );
            float sd = length(starCellUv - starPos);
            float starTwinkle = sin(uTime * (0.6 + sh * 1.5) + sh * 6.28) * 0.5 + 0.5;
            starTwinkle = starTwinkle * starTwinkle * starTwinkle;

            float starCore = smoothstep(0.04, 0.0, sd) * starTwinkle;
            float starHalo = smoothstep(0.18, 0.01, sd) * starTwinkle * 0.15;
            float starVal = (starCore + starHalo) * smoothstep(0.65, 0.15, dist);
            sparkle += starVal * 0.5;
            sparkleCol += mix(uSparkleColor, vec3(1.0), 0.3) * starVal * 0.5;
          }
        }

        // ── Combine ──
        vec3 color = (glowColor + contourColor + sparkleCol) * vignette;
        float alpha = (glow + line * 0.07 * contourFade + sparkle) * vignette;

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -3;
  scene.add(mesh);

  // Listen for mood changes → update sparkle target color
  eventBus.on('comm:mood', ({ emotion }) => {
    const c = MOOD_COLORS[emotion as string];
    if (c) {
      targetSparkleColor.copy(c);
    }
  });

  return mesh;
}

/** Update the environment shader — call from render loop */
export function updateEnvironment(mesh: THREE.Mesh, elapsed: number, delta: number): void {
  const mat = mesh.material as THREE.ShaderMaterial;
  mat.uniforms.uTime.value = elapsed;

  // Smooth-lerp sparkle color toward mood target
  currentSparkleColor.lerp(targetSparkleColor, Math.min(1, delta * 2.5));
  mat.uniforms.uSparkleColor.value.copy(currentSparkleColor);
}
