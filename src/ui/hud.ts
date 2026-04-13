import { eventBus } from '@/core/event-bus.ts';
import { BaseHUD } from './base-hud.ts';

/**
 * Heads-Up Display — production variant.
 *
 * Nav center: mic, camera, TTS toggles.
 * Nav right: sidebar hamburger.
 */
export class HUD extends BaseHUD {
  private micBtn!: HTMLButtonElement;
  private camBtn!: HTMLButtonElement;
  private ttsBtn!: HTMLButtonElement;
  private dashBtn!: HTMLButtonElement;
  private micEnabled = false;
  private camEnabled = false;
  private ttsEnabled = false;

  constructor(sceneWrap: HTMLElement, panelContainer: HTMLElement, navContainer: HTMLElement) {
    super(sceneWrap, panelContainer, navContainer);

    // Toggle handlers
    this.micBtn.addEventListener('click', () => {
      this.micEnabled = !this.micEnabled;
      this.micBtn.dataset.active = this.micEnabled ? 'on' : 'off';
      eventBus.emit('media:micToggle', { enabled: this.micEnabled });
    });
    this.camBtn.addEventListener('click', () => {
      this.camEnabled = !this.camEnabled;
      this.camBtn.dataset.active = this.camEnabled ? 'on' : 'off';
      eventBus.emit('media:cameraToggle', { enabled: this.camEnabled });
    });
    this.ttsBtn.addEventListener('click', () => {
      this.ttsEnabled = !this.ttsEnabled;
      this.ttsBtn.dataset.active = this.ttsEnabled ? 'on' : 'off';
      eventBus.emit('media:ttsToggle', { enabled: this.ttsEnabled });
    });
    this.dashBtn.addEventListener('click', () => {
      eventBus.emit('sidebar:toggle');
    });

    // Media status (mic/camera indicators)
    eventBus.on('media:status', ({ mic, camera }) => {
      this.micEnabled = mic;
      this.camEnabled = camera;
      this.micBtn.dataset.active = mic ? 'on' : 'off';
      this.camBtn.dataset.active = camera ? 'on' : 'off';
    });

    // Sidebar state → sync dash button
    eventBus.on('sidebar:stateChange', ({ visible }) => {
      this.dashBtn.dataset.active = visible ? 'on' : 'off';
    });
  }

  protected buildNavCenter(container: HTMLDivElement): void {
    this.micBtn = document.createElement('button');
    this.micBtn.className = 'hud-toggle-btn';
    this.micBtn.dataset.kind = 'mic';
    this.micBtn.dataset.active = 'off';
    this.micBtn.textContent = '\u{1F3A4}';
    this.micBtn.title = 'Toggle microphone';

    this.camBtn = document.createElement('button');
    this.camBtn.className = 'hud-toggle-btn';
    this.camBtn.dataset.kind = 'cam';
    this.camBtn.dataset.active = 'off';
    this.camBtn.textContent = '\u{1F4F7}';
    this.camBtn.title = 'Toggle camera';

    this.ttsBtn = document.createElement('button');
    this.ttsBtn.className = 'hud-toggle-btn';
    this.ttsBtn.dataset.kind = 'tts';
    this.ttsBtn.dataset.active = 'off';
    this.ttsBtn.textContent = '\u{1F50A}';
    this.ttsBtn.title = 'Toggle voice (ElevenLabs TTS)';

    container.append(this.micBtn, this.camBtn, this.ttsBtn);
  }

  protected buildNavRight(container: HTMLDivElement): void {
    this.dashBtn = document.createElement('button');
    this.dashBtn.className = 'hud-toggle-btn';
    this.dashBtn.dataset.kind = 'dash';
    this.dashBtn.dataset.active = 'off';
    this.dashBtn.textContent = '\u2630';
    this.dashBtn.title = 'Toggle dashboard sidebar';

    container.append(this.dashBtn);
  }
}
