import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { PatynaConfig } from '@/types/config.ts';
import { createEnvironment, updateEnvironment } from './environment.ts';

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private clock = new THREE.Clock();
  private frameCallbacks: Array<(delta: number, elapsed: number) => void> = [];
  private envMesh: THREE.Mesh | null = null;
  private composer: EffectComposer;

  constructor(container: HTMLElement, config: PatynaConfig) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: config.scene.antialias,
      alpha: false,
    });
    this.renderer.setPixelRatio(config.scene.pixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    container.appendChild(this.renderer.domElement);

    // Scene — gradient background (dark teal → purple → rose, mirrors pastel UI)
    this.scene = new THREE.Scene();
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 2;
    bgCanvas.height = 512;
    const bgCtx = bgCanvas.getContext('2d')!;
    const grad = bgCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#1a2a2e');   // dark teal (top)
    grad.addColorStop(0.45, '#2a2438'); // deep purple (center)
    grad.addColorStop(1, '#35232e');   // dark rose (bottom)
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, 2, 512);
    const bgTex = new THREE.CanvasTexture(bgCanvas);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = bgTex;

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100);
    this.camera.position.set(0, 0.10, 2.8);
    this.camera.lookAt(0, 0.06, 0);

    // Lighting
    this.setupLighting();

    // Environment (contour background + sparkles)
    this.envMesh = createEnvironment(this.scene);

    // Post-processing — bloom makes emissive elements glow naturally
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.35,   // strength — gentle, not blinding
      0.5,    // radius — medium spread
      0.82,   // threshold — only bright emissive parts bloom, not background
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    // Resize handling — observe the container so sidebar toggle is caught.
    // Debounce + threshold to avoid canvas-clear flash from tiny text reflows.
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    let resizeRaf = 0;
    const applyResize = () => {
      resizeRaf = 0;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      // Only resize for meaningful changes (>4px) to ignore text reflows
      if (Math.abs(w - lastW) < 5 && Math.abs(h - lastH) < 5) return;
      lastW = w;
      lastH = h;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    };
    const onResize = () => {
      if (!resizeRaf) resizeRaf = requestAnimationFrame(applyResize);
    };
    window.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(container);

    // Start render loop
    this.animate();
  }

  private setupLighting(): void {
    // Warm ambient — creates pleasing warm/cool contrast with teal character
    const ambient = new THREE.AmbientLight(0xFFF0E8, 0.5);
    this.scene.add(ambient);

    // Key light — clean white, from upper front-right
    const key = new THREE.DirectionalLight(0xFFF5EE, 1.0);
    key.position.set(1.5, 2.5, 3);
    this.scene.add(key);

    // Fill light — soft mint tint, from left
    const fill = new THREE.DirectionalLight(0xD0FFE8, 0.4);
    fill.position.set(-2, 1, 1.5);
    this.scene.add(fill);

    // Top light — cool mint glow from above (highlights wings/antennae)
    const top = new THREE.DirectionalLight(0xE0FFF0, 0.3);
    top.position.set(0, 4, 0.5);
    this.scene.add(top);

    // Rim light — cool backlight for depth separation + wing edge glow
    const rim = new THREE.DirectionalLight(0xD0FFE8, 0.35);
    rim.position.set(0, 0.5, -2);
    this.scene.add(rim);

    // Under-glow — warm lift from below to soften chin shadow
    const under = new THREE.DirectionalLight(0xE8FFF4, 0.15);
    under.position.set(0, -2, 1);
    this.scene.add(under);
  }

  /** Register a callback to run each frame */
  onFrame(callback: (delta: number, elapsed: number) => void): void {
    this.frameCallbacks.push(callback);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Update environment shader (contour animation + sparkle twinkle + mood color)
    if (this.envMesh) updateEnvironment(this.envMesh, elapsed, delta);

    for (const cb of this.frameCallbacks) {
      cb(delta, elapsed);
    }

    this.composer.render();
  };
}
