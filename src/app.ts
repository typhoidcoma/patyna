import * as THREE from 'three';
import { SceneManager } from '@/scene/scene-manager.ts';
import { Avatar } from '@/scene/avatar.ts';
import { AvatarController } from '@/scene/avatar-controller.ts';
import { updateEnvironment } from '@/scene/environment.ts';
import { StateMachine } from '@/core/state-machine.ts';
import { eventBus } from '@/core/event-bus.ts';
import { CommManager } from '@/comm/protocol.ts';
import { AudioManager } from '@/audio/audio-manager.ts';
import { TTSPlayer } from '@/audio/tts-player.ts';
import { ElevenLabsTTS } from '@/audio/elevenlabs-tts.ts';
import { SpeakingState } from '@/core/speaking-state.ts';
import { VoiceManager } from '@/voice/voice-manager.ts';
import { Webcam } from '@/tracking/webcam.ts';
import { FaceTracker } from '@/tracking/face-tracker.ts';
import { PresenceManager } from '@/tracking/presence-manager.ts';
import { AeloraClient } from '@/api/aelora-client.ts';
import { HUD } from '@/ui/hud.ts';
import { Sidebar } from '@/ui/sidebar.ts';
import { DEFAULT_CONFIG, type PatynaConfig } from '@/types/config.ts';
import type { MoodData } from '@/types/messages.ts';

export class App {
  private sceneManager: SceneManager;
  private avatar: Avatar;
  private avatarController: AvatarController;
  readonly stateMachine: StateMachine;
  private comm: CommManager;
  private audioManager: AudioManager;
  private ttsPlayer: TTSPlayer;
  private elevenLabs: ElevenLabsTTS;
  private voiceManager: VoiceManager;
  private webcam: Webcam;
  private faceTracker: FaceTracker;
  private presenceManager: PresenceManager;
  private aeloraClient: AeloraClient;
  private hud: HUD;
  private sidebar: Sidebar;
  private config: PatynaConfig;
  private envMesh: THREE.Mesh | null = null;
  private dashboardTimer = 0;
  private speaking: SpeakingState;

  // Lazy init flags for mic/camera
  private micInitialized = false;
  private cameraInitialized = false;

  constructor(
    container: HTMLElement,
    config: PatynaConfig = DEFAULT_CONFIG,
  ) {
    this.config = config;

    // State machine
    this.stateMachine = new StateMachine();

    // Communication (Aelora backend)
    this.comm = new CommManager(config);

    // Audio (TTS playback via AudioWorklet)
    this.audioManager = new AudioManager(config);
    this.ttsPlayer = new TTSPlayer(this.audioManager);
    this.elevenLabs = new ElevenLabsTTS(config);
    this.voiceManager = new VoiceManager();
    this.webcam = new Webcam();
    this.faceTracker = new FaceTracker(this.webcam);

    // Speaking state (shared logic for text/TTS/audio completion tracking)
    this.speaking = new SpeakingState({
      stateMachine: this.stateMachine,
      elevenLabs: this.elevenLabs,
      ttsPlayer: this.ttsPlayer,
    });

    // Presence detection (consumes face tracker events)
    this.presenceManager = new PresenceManager(config.presence);

    // Aelora REST API client
    this.aeloraClient = new AeloraClient({
      wsUrl: config.websocket.url,
      baseUrl: config.api.baseUrl,
      apiKey: config.websocket.apiKey,
      sessionId: config.websocket.sessionId,
      userId: config.websocket.userId,
      username: config.websocket.username,
    });

    // ── Layout: nav bar on top, then app-body row (scene + sidebar) ──
    const appBody = document.createElement('div');
    appBody.className = 'app-body';

    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';
    appBody.appendChild(mainContent);

    const sceneWrap = document.createElement('div');
    sceneWrap.className = 'scene-wrap';
    mainContent.appendChild(sceneWrap);

    // Attach appBody to DOM early so sceneWrap has layout dimensions for WebGL
    container.appendChild(appBody);

    // 3D Scene — renders into the scene wrapper so it never overlaps the panel
    this.sceneManager = new SceneManager(sceneWrap, config);

    // Find the environment mesh (contour plane has uTime uniform)
    this.sceneManager.scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.ShaderMaterial &&
        child.material.uniforms?.uTime
      ) {
        this.envMesh = child;
      }
    });

    // Avatar
    this.avatar = new Avatar();
    this.sceneManager.scene.add(this.avatar.group);

    // Avatar gaze controller
    this.avatarController = new AvatarController(this.avatar, config);

    // HUD — nav bar prepended to container (#app, before appBody), overlay into sceneWrap, panel into mainContent
    this.hud = new HUD(sceneWrap, mainContent, container);

    // Sidebar — inside app-body so scrim covers body area, not nav bar
    this.sidebar = new Sidebar(appBody);

    // Register frame updates
    this.sceneManager.onFrame((delta, elapsed) => {
      // Pass audio amplitude directly — avoids event bus overhead at 60fps
      this.avatar.setAmplitude(this.ttsPlayer.getAmplitude());
      this.avatar.update(delta, elapsed);
      this.avatarController.update(delta);
      if (this.envMesh) {
        updateEnvironment(this.envMesh, elapsed, delta);
      }
    });

    // Wire events
    this.setupListeners();

    // Wait for user login to unlock audio/permissions
    this.hud.ready.then(() => {
      // Patch config with the name entered on the login screen
      const name = this.hud.enteredUsername;
      if (name) {
        this.config.websocket.username = name;
        this.config.websocket.userId = name;

        // Scope session to this user — keeps conversations separate per user
        const userSessionId = `patyna-${name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
        this.config.websocket.sessionId = userSessionId;

        this.aeloraClient.updateUser(name, name);
        this.aeloraClient.updateSession(userSessionId);
        this.comm.updateIdentity(name, name);
      }
      this.onReady();
    });
  }

  private setupListeners(): void {
    // ── Connection lifecycle ──

    eventBus.on('comm:ready', ({ sessionId }) => {
      console.log(`[Patyna] Session bound: ${sessionId}`);
      if (this.config.api.fetchMemoryOnConnect) {
        this.fetchInitialMemory();
      }
      this.fetchDashboardData();
      this.startDashboardRefresh();

      // Auto-start camera only if permission already granted (avoids prompt stalling UI)
      this.tryAutoStartCamera();
    });

    eventBus.on('comm:disconnected', () => {
      this.speaking.reset();
      this.stateMachine.reset();
    });

    eventBus.on('comm:error', ({ code, message }) => {
      console.error(`[Patyna] Server error (${code}): ${message}`);
      this.speaking.reset();
      this.stateMachine.reset();
    });

    // ── LLM response flow (text + audio) ──

    eventBus.on('comm:textDelta', () => {
      if (this.stateMachine.state === 'thinking') {
        this.speaking.textStreamDone = false;
        this.speaking.audioPlaying = false;
      }
    });

    eventBus.on('comm:textDone', () => {
      this.speaking.textStreamDone = true;
      this.speaking.tryFinishResponse();
    });

    // ── TTS stream lifecycle ──

    eventBus.on('audio:ttsStreamStart', () => {
      this.speaking.ttsStreamOpen = true;
    });

    eventBus.on('audio:ttsStreamDone', () => {
      this.speaking.ttsStreamOpen = false;
      this.speaking.tryFinishResponse();
    });

    // ── Audio worklet playback state ──

    eventBus.on('audio:playbackStart', () => {
      this.speaking.audioPlaying = true;
      if (this.speaking.finishTimer) {
        clearTimeout(this.speaking.finishTimer);
        this.speaking.finishTimer = null;
      }
      const s = this.stateMachine.state;
      if (s === 'thinking' || s === 'idle') {
        this.stateMachine.transition('speaking');
      }
    });

    eventBus.on('audio:playbackEnd', () => {
      this.speaking.audioPlaying = false;
      this.speaking.tryFinishResponse();
    });

    // ── Voice input ──

    eventBus.on('voice:speechStart', () => {
      this.interruptAndListen();
    });

    eventBus.on('voice:transcript', ({ text, isFinal }) => {
      if (isFinal && this.comm.connected) {
        this.comm.sendMessage(text);
        this.speaking.transitionToThinking();
      }
    });

    // ── Mood events ──

    eventBus.on('comm:mood', (mood) => {
      console.log(`[Patyna] Mood: ${mood.label} (${mood.emotion}/${mood.intensity})`);
    });

    // ── Media toggles ──

    eventBus.on('media:micToggle', ({ enabled }) => {
      if (enabled) {
        this.initMic();
      } else {
        this.voiceManager.pause();
      }
    });

    eventBus.on('media:cameraToggle', ({ enabled }) => {
      if (enabled) {
        this.initCamera();
      } else {
        this.faceTracker.stop();
        this.presenceManager.pause();
      }
    });

    // ── Presence ──

    eventBus.on('presence:change', ({ from, to }) => {
      console.log(`[Patyna] Presence: ${from} → ${to}`);
      if (this.config.presence.notifyBackend && this.comm.connected) {
        this.comm.sendPresence(to);
      }
    });
  }

  /**
   * Interrupt current activity (flush TTS, stop speaking) and go to listening.
   */
  private interruptAndListen(): void {
    this.speaking.interruptAndReset();

    const s = this.stateMachine.state;
    if (s === 'speaking' || s === 'thinking') {
      this.stateMachine.transition('idle');
      this.stateMachine.transition('listening');
    } else if (s === 'idle') {
      this.stateMachine.transition('listening');
    }
  }

  /** Fetch user profile, session data, and current mood from Aelora REST API (non-blocking). */
  private async fetchInitialMemory(): Promise<void> {
    const { userId, sessionId } = this.config.websocket;

    const promises: Promise<void>[] = [];

    if (userId) {
      promises.push(
        this.aeloraClient.getUser(userId).then((profile) => {
          if (profile) {
            console.log(`[Patyna] User profile loaded: ${profile.username} (${profile.messageCount} messages)`);
            eventBus.emit('api:userProfile', { profile });
          }
        }),
      );
    }

    promises.push(
      this.aeloraClient.getSession(sessionId).then((session) => {
        if (session) {
          console.log(`[Patyna] Session data loaded: ${session.channelId}`);
          eventBus.emit('api:sessionDetail', { session });
        }
      }),
    );

    // Fetch current mood so avatar/environment start in the right state
    promises.push(
      this.aeloraClient.getMood().then((mood) => {
        if (mood) {
          console.log(`[Patyna] Initial mood: ${mood.active ? `${mood.label} (${mood.emotion}/${mood.intensity})` : 'inactive'}`);
          eventBus.emit('comm:mood', mood as MoodData);
        }
      }),
    );

    await Promise.allSettled(promises);
  }

  /** Fetch dashboard data (calendar, tasks, linear) from Aelora REST API. */
  private async fetchDashboardData(): Promise<void> {
    const user = this.aeloraClient.userId;
    const [events, todos, issues] = await Promise.allSettled([
      this.aeloraClient.getCalendarEvents(7),
      this.aeloraClient.getTodos(undefined, user),
      this.aeloraClient.getLinearIssues(undefined, user),
    ]);

    const calEvents = (events.status === 'fulfilled' && events.value) ? events.value : [];
    console.log(`[Patyna] Calendar: ${calEvents.length} events`);
    eventBus.emit('api:calendarEvents', { events: calEvents });

    const todoItems = (todos.status === 'fulfilled' && todos.value) ? todos.value : [];
    console.log(`[Patyna] Tasks: ${todoItems.length} items`);
    eventBus.emit('api:todos', { todos: todoItems });

    const linearItems = (issues.status === 'fulfilled' && issues.value) ? issues.value : [];
    console.log(`[Patyna] Linear: ${linearItems.length} issues`);
    eventBus.emit('api:linearIssues', { issues: linearItems });
  }

  /** Refresh dashboard data every 5 minutes. */
  private startDashboardRefresh(): void {
    if (this.dashboardTimer) clearInterval(this.dashboardTimer);
    this.dashboardTimer = window.setInterval(() => {
      this.fetchDashboardData();
    }, 5 * 60 * 1000);
  }

  private async onReady(): Promise<void> {
    console.log('[Patyna] Session started');

    // Initialize audio output (must happen after user gesture)
    eventBus.emit('init:progress', { pct: 20, label: 'Preparing audio\u2026' });
    await this.ttsPlayer.init();

    // Connect to Aelora backend (mic/camera init lazily on toggle)
    eventBus.emit('init:progress', { pct: 60, label: 'Connecting\u2026' });
    this.comm.connect();
  }

  /** Lazy-init microphone + VAD on first mic toggle. */
  private async initMic(): Promise<void> {
    if (!this.micInitialized) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[Patyna] Mic access granted');
        await this.voiceManager.init(stream);
        this.micInitialized = true;
        eventBus.emit('media:status', { mic: true, camera: this.cameraInitialized });
      } catch (err) {
        console.warn('[Patyna] Mic unavailable:', err);
        eventBus.emit('media:status', { mic: false, camera: this.cameraInitialized });
        return;
      }
    }
    await this.voiceManager.resume();
  }

  /** Lazy-init camera + face tracking on first camera toggle. */
  private async initCamera(): Promise<void> {
    if (!this.cameraInitialized) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        });
        console.log('[Patyna] Camera access granted');
        const camOk = await this.webcam.startWithStream(stream);
        if (camOk) {
          await this.faceTracker.init();
          this.cameraInitialized = true;
          eventBus.emit('media:status', { mic: this.micInitialized, camera: true });
        }
      } catch (err) {
        console.warn('[Patyna] Camera unavailable:', err);
        eventBus.emit('media:status', { mic: this.micInitialized, camera: false });
        return;
      }
    }
    this.faceTracker.start();
    this.presenceManager.start();
  }

  /** Auto-start camera if permission was previously granted (no prompt). */
  private async tryAutoStartCamera(): Promise<void> {
    try {
      const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (status.state === 'granted') {
        console.log('[Patyna] Camera permission already granted, auto-starting');
        eventBus.emit('media:cameraToggle', { enabled: true });
      } else {
        console.log(`[Patyna] Camera permission: ${status.state}, skipping auto-start`);
      }
    } catch {
      // permissions.query not supported for camera in this browser
      console.log('[Patyna] Cannot query camera permission, skipping auto-start');
    }
  }

  /** Tear down all resources. */
  async destroy(): Promise<void> {
    if (this.dashboardTimer) clearInterval(this.dashboardTimer);
    this.presenceManager.destroy();
    this.faceTracker.destroy();
    this.webcam.destroy();
    await this.voiceManager.destroy();
    this.elevenLabs.destroy();
    this.ttsPlayer.destroy();
    this.audioManager.close();
    this.comm.disconnect();
    this.sidebar.destroy();
    this.hud.destroy();
    console.log('[Patyna] Destroyed');
  }
}
