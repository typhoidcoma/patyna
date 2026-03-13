/**
 * DemoApp — orchestrator for the P0 demo.
 *
 * Mirrors the main App class but focused on demo functionality:
 *   - Reuses: SceneManager, Avatar, AvatarController, Environment,
 *             CommManager, AudioManager, TTSPlayer, ElevenLabsTTS,
 *             AeloraClient, StateMachine, event bus
 *   - Drops:  VoiceManager, Webcam, FaceTracker, PresenceManager
 *   - Adds:   DemoHUD, TodayCard, DemoSidebar (data only), DemoState
 *
 * The key difference from App is context injection — every message sent
 * to the LLM is wrapped with the current dashboard state so the avatar
 * can answer questions about schedule, tasks, goals, and progress.
 */

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
import { AeloraClient } from '@/api/aelora-client.ts';
import { DemoHUD } from '@/ui/demo-hud.ts';
import { TodayCard } from '@/ui/today-card.ts';
import { DemoSidebar } from '@/ui/demo-sidebar.ts';
import { DemoState } from './demo-state.ts';
import { makeDraggable, makeScrollDraggable } from '@/ui/draggable.ts';
import { burstStars, miniSparkle, flashGold, sparkleBar, playCelebrateChime } from '@/fx/celebration.ts';
import { DEFAULT_CONFIG, type PatynaConfig } from '@/types/config.ts';
import type { MoodData } from '@/types/messages.ts';

export class DemoApp {
  private sceneManager: SceneManager;
  private avatar: Avatar;
  private avatarController: AvatarController;
  private stateMachine: StateMachine;
  private comm: CommManager;
  private audioManager: AudioManager;
  private ttsPlayer: TTSPlayer;
  private elevenLabs: ElevenLabsTTS;
  private aeloraClient: AeloraClient;
  private hud: DemoHUD;
  private todayCard: TodayCard;
  private demoSidebar: DemoSidebar;
  private demoState: DemoState;
  private config: PatynaConfig;
  private envMesh: THREE.Mesh | null = null;

  // Layout refs for drag/detach
  private appBody!: HTMLDivElement;
  private sceneWrap!: HTMLDivElement;
  private todayWrap!: HTMLDivElement;

  // Cleanup functions
  private cleanupFns: (() => void)[] = [];
  // Re-layout function for floating widgets (set by setupFloatingWidgets)
  private stackWidgets: (() => void) | null = null;

  // Speaking-state completion tracking
  private textStreamDone = false;
  private audioPlaying = false;
  private ttsStreamOpen = false;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTaskMessage: string | null = null;

  constructor(
    container: HTMLElement,
    config: PatynaConfig = DEFAULT_CONFIG,
  ) {
    this.config = config;

    // Core systems
    this.stateMachine = new StateMachine();
    this.comm = new CommManager(config);
    this.audioManager = new AudioManager(config);
    this.ttsPlayer = new TTSPlayer(this.audioManager);
    this.elevenLabs = new ElevenLabsTTS(config);
    this.demoState = new DemoState();

    // Aelora REST API client
    this.aeloraClient = new AeloraClient({
      wsUrl: config.websocket.url,
      baseUrl: config.api.baseUrl,
      apiKey: config.websocket.apiKey,
      sessionId: config.websocket.sessionId,
      userId: config.websocket.userId,
      username: config.websocket.username,
    });

    // ── Layout ──
    this.appBody = document.createElement('div');
    this.appBody.className = 'app-body';

    // Today card wrapper (absolute left)
    this.todayWrap = document.createElement('div');
    this.todayWrap.className = 'today-card-wrap';

    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';
    mainContent.style.flex = '1'; // fill entire width — no sidebar

    this.sceneWrap = document.createElement('div');
    this.sceneWrap.className = 'scene-wrap';
    mainContent.appendChild(this.sceneWrap);

    this.appBody.append(this.todayWrap, mainContent);
    container.appendChild(this.appBody);

    // 3D Scene
    this.sceneManager = new SceneManager(this.sceneWrap, config);

    // Environment mesh (for animation)
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
    this.avatarController = new AvatarController(this.avatar, config);

    // ── UI Components ──

    // DemoHUD — nav bar, login overlay, text input panel
    this.hud = new DemoHUD(this.sceneWrap, mainContent, container);

    // TodayCard — left floating widget
    this.todayCard = new TodayCard();
    this.todayWrap.appendChild(this.todayCard.el);

    // DemoSidebar — manages goals/tasks data + rendering (not in DOM as a sidebar)
    this.demoSidebar = new DemoSidebar();

    // ── Populate UI with demo data ──
    this.todayCard.setData(this.demoState.getSchedule(), this.demoState.getTasks());
    this.demoSidebar.setData(this.demoState.getGoals(), this.demoState.getTasks());

    // ── Wire callbacks ──

    // Task completion → send enriched message to LLM
    // If the bot is currently speaking, queue the message and send after it finishes.
    this.demoSidebar.onTaskComplete = (taskId, checkboxEl) => {
      miniSparkle(checkboxEl);
      const message = this.demoState.completeTask(taskId);
      if (!message || !this.comm.connected) return;

      const s = this.stateMachine.state;
      if (s === 'speaking' || s === 'thinking') {
        // Don't interrupt — wait for current response to finish, then send
        this.pendingTaskMessage = message;
      } else {
        this.transitionToThinking();
        this.comm.sendMessage(message);
      }
    };

    // Reset → reload data + send reset message
    this.hud.onReset = () => {
      // Interrupt any current response
      this.elevenLabs.close();
      this.ttsPlayer.flush();
      this.resetSpeakingState();
      this.stateMachine.reset();

      const message = this.demoState.reset();

      // Update UI with fresh data
      this.todayCard.updateTasks(this.demoState.getTasks());
      this.demoSidebar.updateData(this.demoState.getGoals(), this.demoState.getTasks());

      // Clear conversation history and start fresh
      if (this.comm.connected) {
        this.comm.clearHistory();
        // Brief delay so clear is processed before new message
        setTimeout(() => {
          this.comm.sendMessage(message);
          this.transitionToThinking();
        }, 200);
      }
    };

    // Frame loop
    this.sceneManager.onFrame((delta, elapsed) => {
      this.avatar.setAmplitude(this.ttsPlayer.getAmplitude());
      this.avatar.update(delta, elapsed);
      this.avatarController.update(delta);
      if (this.envMesh) {
        updateEnvironment(this.envMesh, elapsed, delta);
      }
    });

    // Wire event listeners
    this.setupListeners();

    // ── Interactive features ──
    this.setupMouseTracking();
    this.setupTodayCardDrag();
    this.setupFloatingWidgets();
    this.setupCelebrations();

    // Hide floating UI until after login — the hud-start overlay has
    // backdrop-filter: blur(12px) which blurs everything behind it.
    this.todayWrap.style.display = 'none';
    for (const w of this.appBody.querySelectorAll<HTMLElement>('.widget-detached')) {
      w.style.display = 'none';
    }

    // Wait for login
    this.hud.ready.then(() => {
      const name = this.hud.enteredUsername;
      if (name) {
        this.config.websocket.username = name;
        this.config.websocket.userId = name;

        const userSessionId = `patyna-demo-${name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
        this.config.websocket.sessionId = userSessionId;

        this.aeloraClient.updateUser(name);
        this.aeloraClient.updateSession(userSessionId);
        this.comm.updateUsername(name);
      }
      this.onReady();
    });
  }

  private setupListeners(): void {
    // ── Connection lifecycle ──

    eventBus.on('comm:ready', ({ sessionId }) => {
      console.log(`[Demo] Session bound: ${sessionId}`);

      // Fetch initial mood from backend
      this.aeloraClient.getMood().then((mood) => {
        if (mood) {
          eventBus.emit('comm:mood', mood as MoodData);
        }
      });

      // Reveal widgets after the login blur overlay is removed (400ms delay
      // matches the setTimeout in DemoHud that adds .hidden to hud-start).
      setTimeout(() => this.revealWidgets(), 420);

      // Send priming message with full dashboard context
      const username = this.hud.enteredUsername || 'there';
      const primingMessage = this.demoState.buildPrimingMessage(username);
      this.comm.sendMessage(primingMessage);
      this.transitionToThinking();
    });

    eventBus.on('comm:disconnected', () => {
      this.resetSpeakingState();
      this.stateMachine.reset();
    });

    eventBus.on('comm:error', ({ code, message }) => {
      console.error(`[Demo] Server error (${code}): ${message}`);
      this.resetSpeakingState();
      this.stateMachine.reset();
    });

    // ── LLM response flow ──

    eventBus.on('comm:textDelta', () => {
      if (this.stateMachine.state === 'thinking') {
        this.textStreamDone = false;
        this.audioPlaying = false;
      }
    });

    eventBus.on('comm:textDone', () => {
      this.textStreamDone = true;
      this.tryFinishResponse();
    });

    eventBus.on('audio:ttsStreamStart', () => {
      this.ttsStreamOpen = true;
    });

    eventBus.on('audio:ttsStreamDone', () => {
      this.ttsStreamOpen = false;
      this.tryFinishResponse();
    });

    eventBus.on('audio:playbackStart', () => {
      this.audioPlaying = true;
      // Cancel any pending finish — audio resumed
      if (this.finishTimer) {
        clearTimeout(this.finishTimer);
        this.finishTimer = null;
      }
      const s = this.stateMachine.state;
      if (s === 'thinking' || s === 'idle') {
        this.stateMachine.transition('speaking');
      }
    });

    eventBus.on('audio:playbackEnd', () => {
      this.audioPlaying = false;
      this.tryFinishResponse();
    });

    // ── Text input — intercept and wrap with context ──

    eventBus.on('voice:transcript', ({ text, isFinal }) => {
      if (isFinal && this.comm.connected) {
        // Wrap user message with dashboard context before sending
        const enrichedMessage = this.demoState.wrapMessage(text);
        this.comm.sendMessage(enrichedMessage);
        this.transitionToThinking();
      }
    });

    // ── Mood ──

    eventBus.on('comm:mood', (mood) => {
      console.log(`[Demo] Mood: ${mood.label} (${mood.emotion}/${mood.intensity})`);
    });
  }

  private transitionToThinking(): void {
    const s = this.stateMachine.state;
    if (s === 'listening') {
      this.stateMachine.transition('thinking');
    } else if (s === 'idle') {
      this.stateMachine.transition('listening');
      this.stateMachine.transition('thinking');
    } else if (s === 'speaking' || s === 'thinking') {
      this.elevenLabs.close();
      this.ttsPlayer.flush();
      this.resetSpeakingState();
      this.stateMachine.transition('idle');
      this.stateMachine.transition('listening');
      this.stateMachine.transition('thinking');
    }
  }

  private tryFinishResponse(): void {
    if (!this.textStreamDone) return;
    if (this.audioPlaying) return;
    if (this.ttsStreamOpen) return;

    // Debounce: wait 400ms and re-check before transitioning.
    // This prevents a brief worklet buffer gap from prematurely ending
    // the response — if new audio arrives the flags will flip back.
    if (this.finishTimer) return; // already scheduled
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      // Re-check all conditions after the delay
      if (!this.textStreamDone || this.audioPlaying || this.ttsStreamOpen) return;
      const s = this.stateMachine.state;
      if (s === 'speaking' || s === 'thinking') {
        this.stateMachine.transition('idle');
      }

      // If a task was completed while the bot was speaking, send it now
      if (this.pendingTaskMessage && this.comm.connected) {
        const msg = this.pendingTaskMessage;
        this.pendingTaskMessage = null;
        this.transitionToThinking();
        this.comm.sendMessage(msg);
      }
    }, 400);
  }

  private resetSpeakingState(): void {
    this.textStreamDone = false;
    this.audioPlaying = false;
    this.ttsStreamOpen = false;
    this.pendingTaskMessage = null;
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
  }

  private async onReady(): Promise<void> {
    console.log('[Demo] Session started');

    // Widgets stay hidden until the blur overlay is removed (see revealWidgets).
    eventBus.emit('init:progress', { pct: 20, label: 'Preparing audio\u2026' });
    await this.ttsPlayer.init();

    eventBus.emit('init:progress', { pct: 60, label: 'Connecting\u2026' });
    this.comm.connect();
  }

  /** Show floating UI after the login blur overlay has been removed. */
  private revealWidgets(): void {
    this.todayWrap.style.display = '';
    for (const w of this.appBody.querySelectorAll<HTMLElement>('.widget-detached')) {
      w.style.display = '';
    }
    requestAnimationFrame(() => this.stackWidgets?.());
  }

  // ── Mouse → Avatar gaze tracking ──

  private setupMouseTracking(): void {
    // Track across the entire viewport so the avatar follows
    // the cursor even when it's over UI elements (sidebar, today card, etc.)
    const onMouseMove = (e: MouseEvent) => {
      const rect = this.sceneWrap.getBoundingClientRect();
      // Normalize relative to scene-wrap center so the avatar
      // looks toward the cursor wherever it is on screen
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const x = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      const y = -Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2))); // invert Y
      eventBus.emit('face:position', { x, y, z: 0 });
    };

    const onMouseLeave = () => {
      eventBus.emit('face:lost');
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    this.cleanupFns.push(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
    });
  }

  // ── TodayCard drag ──

  private setupTodayCardDrag(): void {
    this.cleanupFns.push(makeDraggable({
      el: this.todayWrap,
      handle: this.todayCard.el,
      constrain: true,
    }));
  }

  // ── Floating widgets (goals + tasks) ──

  private setupFloatingWidgets(): void {
    const goalsWidget = this.demoSidebar.goalsWidget;
    const tasksWidget = this.demoSidebar.tasksWidget;

    // Pull widgets out of the sidebar container and into appBody
    goalsWidget.remove();
    tasksWidget.remove();
    this.appBody.append(goalsWidget, tasksWidget);

    // Style as floating panels — CSS handles auto-sizing via min/max-width.
    // Use right/top for auto-layout, convert to left only when dragging starts.
    const gutter = 24; // matches --demo-gutter
    const gap = 12;

    for (const w of [goalsWidget, tasksWidget]) {
      w.classList.add('widget-detached');
    }
    goalsWidget.classList.add('widget-goals');
    tasksWidget.classList.add('widget-tasks');

    // Stack goals top-right, tasks below — aligned with today card gutter
    const stackWidgets = (this.stackWidgets = () => {
      // Only re-stack if both widgets are still right-anchored (not dragged)
      if (goalsWidget.style.left && !goalsWidget.style.right) return;

      const appRect = this.appBody.getBoundingClientRect();
      const sceneRect = this.sceneWrap.getBoundingClientRect();

      // Scene offsets from app-body (scene-margin)
      const sceneTop = sceneRect.top - appRect.top;
      const sceneRight = appRect.right - sceneRect.right;

      // Inset from scene edge by gutter
      const rightOffset = sceneRight + gutter;
      const topOffset = sceneTop + gutter;

      for (const w of [goalsWidget, tasksWidget]) {
        w.style.right = `${rightOffset}px`;
      }

      goalsWidget.style.top = `${topOffset}px`;
      const goalsBottom = topOffset + goalsWidget.offsetHeight;
      tasksWidget.style.top = `${goalsBottom + gap}px`;

      // Cap tasks widget so it doesn't overflow into the input panel.
      const tasksTop = goalsBottom + gap + appRect.top;
      const availableH = sceneRect.bottom - tasksTop - gutter;
      const tasksBody = tasksWidget.querySelector('.sidebar-widget-body') as HTMLElement;
      if (tasksBody && availableH > 0) {
        const headerH = (tasksWidget.querySelector('.sidebar-widget-header') as HTMLElement)?.offsetHeight ?? 0;
        const barH = (tasksWidget.querySelector('.demo-points-bar-wrap') as HTMLElement)?.offsetHeight ?? 0;
        const maxBodyH = availableH - headerH - barH;
        tasksBody.style.maxHeight = `${Math.max(80, maxBodyH)}px`;
        tasksBody.style.overflowY = 'auto';
      }
    });

    // Make both draggable by their headers — on drag start,
    // convert from right-anchored to left-anchored positioning
    const convertToLeft = (w: HTMLDivElement) => {
      if (w.style.right) {
        const rect = w.getBoundingClientRect();
        const parentRect = this.appBody.getBoundingClientRect();
        w.style.left = `${rect.left - parentRect.left}px`;
        w.style.right = '';
      }
    };

    const goalsHeader = goalsWidget.querySelector('.sidebar-widget-header') as HTMLElement;
    const tasksHeader = tasksWidget.querySelector('.sidebar-widget-header') as HTMLElement;

    if (goalsHeader) {
      this.cleanupFns.push(makeDraggable({
        el: goalsWidget,
        handle: goalsHeader,
        constrain: true,
        onDragStart: () => convertToLeft(goalsWidget),
      }));
    }

    if (tasksHeader) {
      this.cleanupFns.push(makeDraggable({
        el: tasksWidget,
        handle: tasksHeader,
        constrain: true,
        onDragStart: () => convertToLeft(tasksWidget),
      }));
    }

    // ── Click-drag scrolling on widget bodies ──
    for (const w of [goalsWidget, tasksWidget]) {
      const body = w.querySelector('.sidebar-widget-body') as HTMLElement;
      if (body) this.cleanupFns.push(makeScrollDraggable({ el: body }));
    }

    // ── Resize handler — re-clamp widgets when viewport changes ──
    this.setupResizeHandler([goalsWidget, tasksWidget], stackWidgets);
  }

  // ── Celebration effects on task complete ──

  private setupCelebrations(): void {
    const goalsWidget = this.demoSidebar.goalsWidget;
    const tasksWidget = this.demoSidebar.tasksWidget;
    const pointsBar = this.demoSidebar.pointsBarEl;

    eventBus.on('demo:taskComplete', ({ totalPoints, maxPoints }) => {
      const allDone = totalPoints === maxPoints;
      burstStars(this.sceneWrap, allDone);
      flashGold([goalsWidget, tasksWidget, this.todayWrap]);
      sparkleBar(pointsBar);
      playCelebrateChime(this.audioManager.context, allDone);
      this.spinAvatar();
    });
  }

  /** Spin the avatar once on the Y axis with a joyful ease-out. */
  private spinAvatar(): void {
    const group = this.avatar.group;
    const startY = group.rotation.y;
    const targetY = startY + Math.PI * 2;
    const duration = 800; // ms
    const start = performance.now();

    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic — fast start, gentle landing
      const ease = 1 - Math.pow(1 - t, 3);
      group.rotation.y = startY + (targetY - startY) * ease;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Reset to original to avoid accumulating rotation
        group.rotation.y = startY;
      }
    };

    requestAnimationFrame(animate);
  }

  // ── Viewport resize → re-clamp floating widgets ──

  private setupResizeHandler(
    widgets: HTMLDivElement[],
    stackWidgets: () => void,
  ): void {
    let resizeRaf = 0;
    let lastW = this.appBody.clientWidth;
    let lastH = this.appBody.clientHeight;

    const applyResize = () => {
      resizeRaf = 0;
      const w = this.appBody.clientWidth;
      const h = this.appBody.clientHeight;

      // Ignore tiny changes (< 5px) to avoid reflow loops
      if (Math.abs(w - lastW) < 5 && Math.abs(h - lastH) < 5) return;
      lastW = w;
      lastH = h;

      // Re-stack right-anchored widgets
      stackWidgets();

      // Clamp any left-anchored (dragged) widgets inside new bounds
      for (const el of widgets) {
        if (el.style.left && !el.style.right) {
          const left = parseFloat(el.style.left) || 0;
          const top = parseFloat(el.style.top) || 0;
          const elW = el.offsetWidth;
          const elH = el.offsetHeight;
          el.style.left = `${Math.max(0, Math.min(left, w - elW))}px`;
          el.style.top = `${Math.max(0, Math.min(top, h - elH))}px`;
        }
      }

      // Clamp today card if it's been dragged (has inline left/top)
      if (this.todayWrap.style.left) {
        const left = parseFloat(this.todayWrap.style.left) || 0;
        const top = parseFloat(this.todayWrap.style.top) || 0;
        const elW = this.todayWrap.offsetWidth;
        const elH = this.todayWrap.offsetHeight;
        this.todayWrap.style.left = `${Math.max(0, Math.min(left, w - elW))}px`;
        this.todayWrap.style.top = `${Math.max(0, Math.min(top, h - elH))}px`;
      }
    };

    const onResize = () => {
      if (!resizeRaf) resizeRaf = requestAnimationFrame(applyResize);
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(this.appBody);

    this.cleanupFns.push(() => ro.disconnect());
  }

  async destroy(): Promise<void> {
    // Clean up interactive features
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;

    this.elevenLabs.destroy();
    this.ttsPlayer.destroy();
    this.audioManager.close();
    this.comm.disconnect();
    this.todayCard.destroy();
    this.demoSidebar.destroy();
    this.hud.destroy();
    console.log('[Demo] Destroyed');
  }
}
