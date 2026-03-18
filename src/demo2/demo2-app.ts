/**
 * Demo2App — orchestrator for the LUMINORA demo.
 *
 * Mirrors DemoApp but with the LUMINORA 3-column layout:
 *   - Left:   DailyBriefing card
 *   - Center: AvatarFrame (circular 3D scene)
 *   - Right:  GoalsTasksPanel
 *   - Bottom: JournalBar
 *   - Modals: TaskComplete, Vault, WeeklyRhythm
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
import { burstStars, flashGold, playCelebrateChime } from '@/fx/celebration.ts';
import { DEFAULT_CONFIG, type PatynaConfig } from '@/types/config.ts';
import type { MoodData } from '@/types/messages.ts';

import { Demo2State } from './demo2-state.ts';
import { NavBar } from './components/nav-bar.ts';
import { DailyBriefing } from './components/daily-briefing.ts';
import { AvatarFrame } from './components/avatar-frame.ts';
import { GoalsTasksPanel } from './components/goals-tasks-panel.ts';
import { JournalBar } from './components/journal-bar.ts';
import { ModalManager } from './components/modal-manager.ts';
import { TaskCompleteModal } from './components/task-complete-modal.ts';
import { VaultModal } from './components/vault-modal.ts';
import { WeeklyRhythmModal } from './components/weekly-rhythm-modal.ts';

export class Demo2App {
  private sceneManager: SceneManager;
  private avatar: Avatar;
  private avatarController: AvatarController;
  private stateMachine: StateMachine;
  private comm: CommManager;
  private audioManager: AudioManager;
  private ttsPlayer: TTSPlayer;
  private elevenLabs: ElevenLabsTTS;
  private aeloraClient: AeloraClient;
  private state: Demo2State;
  private config: PatynaConfig;

  // UI components
  private navBar: NavBar;
  private briefing: DailyBriefing;
  private avatarFrame: AvatarFrame;
  private goalsTasksPanel: GoalsTasksPanel;
  private journalBar: JournalBar;
  private modalManager: ModalManager;
  private taskCompleteModal: TaskCompleteModal;
  private vaultModal: VaultModal;
  private weeklyRhythmModal: WeeklyRhythmModal;

  private loginOverlay: HTMLDivElement | null = null;
  private enteredUsername = '';
  private envMesh: THREE.Mesh | null = null;
  private cleanupFns: (() => void)[] = [];
  private vaultSyncTimer: ReturnType<typeof setInterval> | null = null;
  private readonly VAULT_SYNC_INTERVAL_MS = 30_000; // sync every 30s

  // Speaking-state tracking (same as DemoApp)
  private textStreamDone = false;
  private audioPlaying = false;
  private ttsStreamOpen = false;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTaskMessage: string | null = null;

  // Mouse gaze
  private cameraActive = false;
  private mouseOverride = false;
  private mouseMoveStart = 0;
  private mouseIdleTimer = 0;
  private readonly MOUSE_TAKEOVER_MS = 400;
  private readonly MOUSE_RELEASE_MS = 800;

  constructor(
    container: HTMLElement,
    config: PatynaConfig = DEFAULT_CONFIG,
  ) {
    this.config = config;
    this.state = new Demo2State();

    // Core systems
    this.stateMachine = new StateMachine();
    this.comm = new CommManager(config);
    this.audioManager = new AudioManager(config);
    this.ttsPlayer = new TTSPlayer(this.audioManager);
    this.elevenLabs = new ElevenLabsTTS(config);

    this.aeloraClient = new AeloraClient({
      wsUrl: config.websocket.url,
      baseUrl: config.api.baseUrl,
      apiKey: config.websocket.apiKey,
      sessionId: config.websocket.sessionId,
      userId: config.websocket.userId,
      username: config.websocket.username,
    });

    // ── UI Layout ──

    // Nav
    this.navBar = new NavBar(this.state.username);
    container.appendChild(this.navBar.el);

    // Dashboard grid
    const dashboard = document.createElement('div');
    dashboard.className = 'lum-dashboard';

    // Left: Briefing
    this.briefing = new DailyBriefing();
    this.briefing.setData(this.state.getBriefing());

    // Center: Avatar
    this.avatarFrame = new AvatarFrame();

    // Right: Goals + Tasks
    this.goalsTasksPanel = new GoalsTasksPanel();
    this.goalsTasksPanel.setData(
      this.state.getGoals(),
      this.state.getTasks(),
      this.state.pointsToday,
      this.state.pointsYesterday,
    );

    dashboard.append(this.briefing.el, this.avatarFrame.el, this.goalsTasksPanel.el);
    container.appendChild(dashboard);

    // Bottom: Journal
    this.journalBar = new JournalBar();
    container.appendChild(this.journalBar.el);

    // ── 3D Scene ──

    this.sceneManager = new SceneManager(this.avatarFrame.sceneContainer, config);

    // Find environment mesh
    this.sceneManager.scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.ShaderMaterial &&
        child.material.uniforms?.uTime
      ) {
        this.envMesh = child;
      }
    });

    this.avatar = new Avatar();
    this.sceneManager.scene.add(this.avatar.group);
    this.avatarController = new AvatarController(this.avatar, config);

    // ── Modals ──

    this.modalManager = new ModalManager();
    this.taskCompleteModal = new TaskCompleteModal(this.modalManager);
    this.vaultModal = new VaultModal(this.modalManager);
    this.weeklyRhythmModal = new WeeklyRhythmModal(this.modalManager);

    // ── Wire callbacks ──

    this.wireCallbacks();
    this.setupListeners();
    this.setupMouseTracking();

    // Frame loop
    this.sceneManager.onFrame((delta, elapsed) => {
      this.avatar.setAmplitude(this.ttsPlayer.getAmplitude());
      this.avatar.update(delta, elapsed);
      this.avatarController.update(delta);
      if (this.envMesh) {
        updateEnvironment(this.envMesh, elapsed, delta);
      }
    });

    // ── Login gate ──
    this.showLogin(container).then(() => this.onReady());
  }

  /** Show login overlay, resolve when user submits a name. */
  private showLogin(container: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      this.loginOverlay = document.createElement('div');
      this.loginOverlay.className = 'lum-login-overlay';

      const form = document.createElement('div');
      form.className = 'lum-login-form';

      const heading = document.createElement('div');
      heading.className = 'lum-login-heading';
      heading.textContent = 'Welcome to LUMINORA';

      const input = document.createElement('input');
      input.className = 'lum-login-input';
      input.type = 'text';
      input.placeholder = 'Your name…';
      input.autocomplete = 'name';
      input.maxLength = 40;
      input.value = localStorage.getItem('patyna:username') ?? '';

      const btn = document.createElement('button');
      btn.className = 'lum-login-btn';
      btn.textContent = 'Begin';

      form.append(heading, input, btn);
      this.loginOverlay.appendChild(form);
      container.appendChild(this.loginOverlay);

      // Auto-focus
      requestAnimationFrame(() => input.focus());

      const submit = () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }

        this.enteredUsername = name;
        localStorage.setItem('patyna:username', name);

        // Fade out overlay
        this.loginOverlay!.classList.add('lum-login-hiding');
        setTimeout(() => {
          this.loginOverlay?.remove();
          this.loginOverlay = null;
        }, 400);

        // Update nav bar with real username
        this.navBar.setUsername(name);

        resolve();
      };

      btn.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });
  }

  private wireCallbacks(): void {
    // Journal submit → send to LLM
    this.journalBar.onSubmit = (text) => {
      if (!this.comm.connected) return;
      const msg = this.state.wrapMessage(text);
      this.comm.sendMessage(msg);
      this.transitionToThinking();
    };

    // Task Start (TOP 3)
    this.goalsTasksPanel.onTaskStart = (_taskId) => {
      // Timer is managed by the panel itself
    };

    // Task Finish (TOP 3) → open completion modal
    this.goalsTasksPanel.onTaskFinish = (taskId) => {
      const task = this.state.getTasks().find(t => t.id === taskId);
      if (task) {
        this.taskCompleteModal.open(taskId, task.title);
      }
    };

    // Task complete modal done → complete task + send to LLM + API
    this.taskCompleteModal.onDone = (data) => {
      const task = this.state.getTasks().find(t => t.id === data.taskId);
      const message = this.state.completeTask(data.taskId);
      this.goalsTasksPanel.markTaskComplete(data.taskId);
      this.reportTaskCompletion(data.taskId);
      if (task) this.briefing.markDueTodayByTitle(task.title);
      if (message && this.comm.connected) {
        const s = this.stateMachine.state;
        if (s === 'speaking' || s === 'thinking') {
          this.pendingTaskMessage = message;
        } else {
          this.transitionToThinking();
          this.comm.sendMessage(message);
        }
      }
    };

    // All task click (non-TOP3) → complete directly + API
    this.goalsTasksPanel.onAllTaskClick = (taskId) => {
      const task = this.state.getTasks().find(t => t.id === taskId);
      const message = this.state.completeTask(taskId);
      this.goalsTasksPanel.markTaskComplete(taskId);
      this.reportTaskCompletion(taskId);
      if (task) this.briefing.markDueTodayByTitle(task.title);
      if (message && this.comm.connected) {
        const s = this.stateMachine.state;
        if (s === 'speaking' || s === 'thinking') {
          this.pendingTaskMessage = message;
        } else {
          this.transitionToThinking();
          this.comm.sendMessage(message);
        }
      }
    };

    // Vault button — fetch user-scoped memory facts then open
    this.avatarFrame.onVaultClick = () => {
      const userId = this.aeloraClient.userId;
      const scope = userId ? `user:${userId}` : null;

      Promise.all([
        scope ? this.aeloraClient.getMemoryByScope(scope).catch(() => null) : null,
        this.aeloraClient.getMemory().catch(() => null),
        this.aeloraClient.getSession().catch(() => null),
      ]).then(([scopedFacts, memory, session]) => {
        // Prefer user-scoped facts from new endpoint
        if (scopedFacts?.length) {
          this.state.applyUserFacts(scopedFacts);
          console.log(`[LUMINORA] Vault: ${scopedFacts.length} facts from /api/memory/scope (${scope})`);
        // Fallback to all-scope memory
        } else if (memory && Object.keys(memory).length > 0) {
          this.state.applyMemoryFacts(memory);
          console.log(`[LUMINORA] Vault: ${Object.values(memory).flat().length} facts from /api/memory`);
        // Then session memories
        } else if (session?.memories && Object.keys(session.memories).length > 0) {
          this.state.applyMemoryFacts(session.memories);
          console.log(`[LUMINORA] Vault: ${Object.values(session.memories).flat().length} facts from session`);
        } else {
          console.warn('[LUMINORA] Vault: no facts from any API, showing fixture data');
        }
      }).finally(() => {
        this.vaultModal.open(this.state.getVaultFacts());
      });
    };

    // Briefing due-today toggle → update todo via API
    this.briefing.onDueTodayToggle = (itemId, completed) => {
      // itemId format: "todo-{uid}" from applyTodos, or "due-{n}" from fixture
      const uid = itemId.startsWith('todo-') ? itemId.slice(5) : null;
      if (uid) {
        this.aeloraClient.updateTodo(uid, { completed }).catch(() => {});
      }
    };

    // Schedule header → open Weekly Rhythm modal
    this.briefing.onScheduleHeaderClick = () => {
      this.weeklyRhythmModal.open(this.state.getHabits());
    };
  }

  private setupListeners(): void {
    // ── Connection lifecycle ──

    eventBus.on('comm:ready', ({ sessionId }) => {
      console.log(`[LUMINORA] Session bound: ${sessionId}`);

      this.aeloraClient.getMood().then((mood) => {
        if (mood) eventBus.emit('comm:mood', mood as MoodData);
      });

      // Send priming message
      const username = this.enteredUsername || this.state.username;
      const primingMessage = this.state.buildPrimingMessage(username);
      this.comm.sendMessage(primingMessage);
      this.transitionToThinking();
    });

    eventBus.on('comm:disconnected', () => {
      this.resetSpeakingState();
      this.stateMachine.reset();
    });

    eventBus.on('comm:error', ({ code, message }) => {
      console.error(`[LUMINORA] Server error (${code}): ${message}`);
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
      // Sync vault after each LLM response — backend may have stored new facts
      this.syncVault();
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

    // ── Mood ──

    eventBus.on('comm:mood', (mood) => {
      console.log(`[LUMINORA] Mood: ${mood.label} (${mood.emotion}/${mood.intensity})`);
    });

    // ── Celebrations ──

    eventBus.on('demo:taskComplete', ({ totalPoints, maxPoints }) => {
      // Always update points first
      this.goalsTasksPanel.updatePoints(totalPoints);

      // Celebration effects (non-blocking)
      try {
        const allDone = totalPoints === maxPoints;
        burstStars(this.avatarFrame.ring, allDone);
        flashGold([this.briefing.el, this.goalsTasksPanel.el]);
        if (this.audioManager.context) {
          playCelebrateChime(this.audioManager.context, allDone);
        }
        this.spinAvatar();
      } catch (e) {
        console.warn('[LUMINORA] Celebration effect error:', e);
      }
    });
  }

  // ── Speaking state machine (identical to DemoApp) ──

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

    if (this.finishTimer) return;
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      if (!this.textStreamDone || this.audioPlaying || this.ttsStreamOpen) return;
      const s = this.stateMachine.state;
      if (s === 'speaking' || s === 'thinking') {
        this.stateMachine.transition('idle');
      }

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

  // ── API: report task completion ──

  private reportTaskCompletion(taskId: string): void {
    const task = this.state.getTasks().find(t => t.id === taskId);
    if (!task) return;

    // Mark todo as completed in Google Tasks
    const todoUid = this.state.getTodoUid(taskId);
    if (todoUid) {
      this.aeloraClient.updateTodo(todoUid, { completed: true }).catch(() => {});
    }

    // Create life event for scoring
    const userId = this.aeloraClient.userId;
    if (userId) {
      this.aeloraClient.createLifeEvent({
        discordUserId: userId,
        title: task.title,
        category: 'tasks',
        priority: task.points >= 10 ? 'high' : task.points >= 7 ? 'medium' : 'low',
        sizeLabel: task.points >= 10 ? 'medium' : 'small',
      }).then((result) => {
        if (result) {
          if (result.id) this.state.setLifeEventId(taskId, result.id);
          console.log(`[LUMINORA] Life event created: ${task.title} (score: ${result.totalScore ?? 'n/a'})`);
          // Sync vault — backend stores completion as a fact
          this.syncVault();
        }
      }).catch(() => {});
    }
  }

  // ── Init ──

  private async onReady(): Promise<void> {
    console.log('[LUMINORA] Starting...');

    // Set session info — use entered username, fall back to fixture
    const username = this.enteredUsername || this.state.username;
    this.config.websocket.username = username;
    this.config.websocket.userId = username;
    const sessionId = `patyna-luminora-${username.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
    this.config.websocket.sessionId = sessionId;
    this.aeloraClient.updateUser(username);
    this.aeloraClient.updateSession(sessionId);
    this.comm.updateUsername(username);

    await this.ttsPlayer.init();

    // Unmute TTS — ElevenLabsTTS starts muted, sync with NavBar's default (enabled)
    eventBus.emit('media:ttsToggle', { enabled: true });

    // Fetch live API data in parallel (non-blocking — falls back to fixture)
    this.fetchLiveData();

    // Periodically sync vault facts in background
    this.vaultSyncTimer = setInterval(() => this.syncVault(), this.VAULT_SYNC_INTERVAL_MS);

    this.comm.connect();
  }

  /** Background-sync user facts into the vault (non-blocking). */
  private syncVault(): void {
    const userId = this.aeloraClient.userId;
    const scope = userId ? `user:${userId}` : null;

    Promise.all([
      scope ? this.aeloraClient.getMemoryByScope(scope).catch(() => null) : null,
      this.aeloraClient.getMemory().catch(() => null),
      this.aeloraClient.getSession().catch(() => null),
    ]).then(([scopedFacts, memory, session]) => {
      if (scopedFacts?.length) {
        this.state.applyUserFacts(scopedFacts);
        console.log(`[LUMINORA] Vault synced: ${scopedFacts.length} facts from /api/memory/scope`);
      } else if (memory && Object.keys(memory).length > 0) {
        this.state.applyMemoryFacts(memory);
        console.log(`[LUMINORA] Vault synced: ${Object.values(memory).flat().length} facts from /api/memory`);
      } else if (session?.memories && Object.keys(session.memories).length > 0) {
        this.state.applyMemoryFacts(session.memories);
        console.log(`[LUMINORA] Vault synced: ${Object.values(session.memories).flat().length} facts from session`);
      }
    });
  }

  /** Fetch calendar, todos, memory, scoring from Aelora APIs and overlay onto state. */
  private async fetchLiveData(): Promise<void> {
    const userId = this.aeloraClient.userId;

    const scope = userId ? `user:${userId}` : null;

    const [calendar, todos, scopedFacts, memory, session, scoring, leaderboard] = await Promise.all([
      this.aeloraClient.getCalendarEvents(3).catch(() => null),
      this.aeloraClient.getTodos('pending').catch(() => null),
      scope ? this.aeloraClient.getMemoryByScope(scope).catch(() => null) : null,
      this.aeloraClient.getMemory().catch(() => null),
      this.aeloraClient.getSession().catch(() => null),
      userId ? this.aeloraClient.getScoringStats(userId).catch(() => null) : null,
      userId ? this.aeloraClient.getLeaderboard(userId, 3).catch(() => null) : null,
    ]);

    let updated = false;

    if (calendar && calendar.length > 0) {
      this.state.applyCalendarEvents(calendar);
      console.log(`[LUMINORA] Loaded ${calendar.length} calendar events`);
      updated = true;
    }

    if (todos && todos.length > 0) {
      this.state.applyTodos(todos);
      console.log(`[LUMINORA] Loaded ${todos.length} todos`);
      updated = true;
    }

    // Prefer scoped user facts → all-scope memory → session memories
    if (scopedFacts?.length) {
      this.state.applyUserFacts(scopedFacts);
      console.log(`[LUMINORA] Loaded ${scopedFacts.length} facts from /api/memory/scope (${scope})`);
    } else if (memory && Object.keys(memory).length > 0) {
      this.state.applyMemoryFacts(memory);
      console.log(`[LUMINORA] Loaded ${Object.values(memory).flat().length} memory facts from /api/memory`);
    } else if (session?.memories && Object.keys(session.memories).length > 0) {
      this.state.applyMemoryFacts(session.memories);
      console.log(`[LUMINORA] Loaded ${Object.values(session.memories).flat().length} memory facts from session`);
    }

    if (scoring) {
      this.state.applyScoringStats(scoring);
      console.log(`[LUMINORA] Scoring: ${scoring.xp} XP, ${scoring.streak} streak`);
      updated = true;
    }

    if (leaderboard && leaderboard.length > 0) {
      this.state.applyLeaderboard(leaderboard);
      console.log(`[LUMINORA] Loaded ${leaderboard.length} leaderboard tasks`);
      updated = true;
    }

    // Re-render UI components with live data
    if (updated) {
      this.briefing.setData(this.state.getBriefing());
      this.goalsTasksPanel.setData(
        this.state.getGoals(),
        this.state.getTasks(),
        this.state.pointsToday,
        this.state.pointsYesterday,
      );
    }
  }

  // ── Mouse tracking ──

  private setupMouseTracking(): void {
    const sceneWrap = this.avatarFrame.sceneContainer;

    const emitMouseGaze = (e: MouseEvent) => {
      const rect = sceneWrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const x = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      const y = -Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
      eventBus.emit('face:position', { x, y, z: 0 });
    };

    const onMouseMove = (e: MouseEvent) => {
      clearTimeout(this.mouseIdleTimer);

      if (!this.cameraActive) {
        emitMouseGaze(e);
        return;
      }

      const now = performance.now();
      if (!this.mouseOverride) {
        if (this.mouseMoveStart === 0) this.mouseMoveStart = now;
        if (now - this.mouseMoveStart >= this.MOUSE_TAKEOVER_MS) {
          this.mouseOverride = true;
        } else {
          return;
        }
      }

      emitMouseGaze(e);

      this.mouseIdleTimer = window.setTimeout(() => {
        this.mouseOverride = false;
        this.mouseMoveStart = 0;
      }, this.MOUSE_RELEASE_MS);
    };

    const onMouseLeave = () => {
      this.mouseOverride = false;
      this.mouseMoveStart = 0;
      clearTimeout(this.mouseIdleTimer);
      if (!this.cameraActive) {
        eventBus.emit('face:lost');
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    this.cleanupFns.push(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
    });
  }

  // ── Avatar spin celebration ──

  private spinAvatar(): void {
    const group = this.avatar.group;
    const startY = group.rotation.y;
    const targetY = startY + Math.PI * 2;
    const duration = 800;
    const start = performance.now();

    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      group.rotation.y = startY + (targetY - startY) * ease;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        group.rotation.y = startY;
      }
    };

    requestAnimationFrame(animate);
  }

  // ── Cleanup ──

  async destroy(): Promise<void> {
    if (this.vaultSyncTimer) {
      clearInterval(this.vaultSyncTimer);
      this.vaultSyncTimer = null;
    }
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;

    this.goalsTasksPanel.destroy();
    this.elevenLabs.destroy();
    this.ttsPlayer.destroy();
    this.audioManager.close();
    this.comm.disconnect();
    console.log('[LUMINORA] Destroyed');
  }
}
