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

import * as THREE from "three";
import { SceneManager } from "@/scene/scene-manager.ts";
import { Avatar } from "@/scene/avatar.ts";
import { AvatarController } from "@/scene/avatar-controller.ts";
import { updateEnvironment } from "@/scene/environment.ts";
import { StateMachine } from "@/core/state-machine.ts";
import { eventBus } from "@/core/event-bus.ts";
import { CommManager } from "@/comm/protocol.ts";
import { AudioManager } from "@/audio/audio-manager.ts";
import { TTSPlayer } from "@/audio/tts-player.ts";
import { ElevenLabsTTS } from "@/audio/elevenlabs-tts.ts";
import { AeloraClient } from "@/api/aelora-client.ts";
import { FeedbackClient } from "@/api/feedback-client.ts";
import { burstStars, flashGold, playCelebrateChime } from "@/fx/celebration.ts";
import { DEFAULT_CONFIG, type PatynaConfig } from "@/types/config.ts";
import type { MoodData } from "@/types/messages.ts";

import { authManager, type UserProfile } from "@/auth/auth-manager.ts";
import { fetchQuestsForUser } from "@/quests/fetch-quests.ts";
import { subscribeQuestsForUser } from "@/quests/subscribe-quests.ts";
import { parseAddTaskIntent } from "@/quests/parse-add-task-intent.ts";
import { parseMoveToTop3Intent } from "@/quests/parse-top3-favorite-intent.ts";
import {
  findTop3ActiveQuestTaskByTitleHint,
  findUncompletedQuestTaskByTitleHint,
} from "@/quests/match-quest-task-by-title-hint.ts";
import { resolveTop3TimerIntent } from "@/quests/parse-top3-timer-intent.ts";
import { luminoraDifficultyToSelect } from "@/quests/map-quest-to-task.ts";
import {
  defaultQuestCategory,
  normalizeQuestCategory,
} from "@/quests/quest-categories.ts";
import type { QuestDifficulty } from "@/quests/quest-types.ts";

import { Demo2State } from "./demo2-state.ts";
import { NavBar } from "./components/nav-bar.ts";
import { DailyBriefing } from "./components/daily-briefing.ts";
import { AvatarFrame } from "./components/avatar-frame.ts";
import { GoalsTasksPanel } from "./components/goals-tasks-panel.ts";
import { JournalBar } from "./components/journal-bar.ts";
import { ModalManager } from "./components/modal-manager.ts";
import { TaskCompleteModal } from "./components/task-complete-modal.ts";
import { VaultModal } from "./components/vault-modal.ts";
import { WeeklyRhythmModal } from "./components/weekly-rhythm-modal.ts";
import { FeedbackPanel } from "./components/feedback-panel.ts";
import { AddTaskPanel } from "./components/add-task-panel.ts";

/** Must match `MAX_TOP_FAVORITES` in goals-tasks-panel (star / TOP 3 slots). */
const TOP_FAVORITES_CAP = 3;

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
  private feedbackClient: FeedbackClient;
  private state: Demo2State;
  private config: PatynaConfig;

  // UI components
  private navBar: NavBar;
  private briefing: DailyBriefing;
  private avatarFrame: AvatarFrame;
  private goalsTasksPanel: GoalsTasksPanel;
  private journalHost!: HTMLDivElement;
  private chatHistoryPanel!: HTMLDivElement;
  private chatHistoryList!: HTMLDivElement;
  private chatHistoryInner!: HTMLDivElement;
  private journalBar: JournalBar;
  private chatHistoryOpen = false;
  private readonly chatEntries: { role: "user" | "assistant"; text: string }[] =
    [];
  private modalManager: ModalManager;
  private taskCompleteModal: TaskCompleteModal;
  private vaultModal: VaultModal;
  private weeklyRhythmModal: WeeklyRhythmModal;
  private feedbackPanel: FeedbackPanel;
  private addTaskPanel: AddTaskPanel;

  private loginOverlay: HTMLDivElement | null = null;
  /** Covers the app until session is known (avoids a flash of dashboard before welcome/login). */
  private authBootOverlay: HTMLDivElement | null = null;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private enteredUsername = "";
  private authProfile: UserProfile | null = null;
  private unsubAuth: (() => void) | null = null;
  private unsubQuests: (() => void) | null = null;
  /** True after first successful `onReady` (used to re-sync identity on auth refresh). */
  private sessionStarted = false;

  /** Supabase Auth `user.id` — source of truth for quest API scoping (kept in sync on `AeloraClient` via `refreshBackendIdentity`). */
  private get supabaseAuthUserId(): string | undefined {
    return this.authProfile?.userId;
  }
  private envMesh: THREE.Mesh | null = null;
  private cleanupFns: (() => void)[] = [];
  private vaultSyncTimer: ReturnType<typeof setInterval> | null = null;
  private refreshQuestTimer: ReturnType<typeof setTimeout> | null = null;
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

  // Panel-gated gaze
  private panelIdleTimer = 0;
  private pointerOnPanel = false;
  private panelGazeLocked = false;
  private readonly PANEL_IDLE_MS = 1500;
  private static readonly UI_PANEL_SELECTOR =
    ".lum-briefing, .lum-right, .lum-journal, .lum-chat-history, " +
    ".lum-speech-bubble, .lum-vault-btn, .lum-backdrop, " +
    ".lum-login-overlay, .lum-toast";

  constructor(container: HTMLElement, config: PatynaConfig = DEFAULT_CONFIG) {
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
      supabaseUserId: config.websocket.supabaseUserId,
    });
    this.feedbackClient = new FeedbackClient(config.api.feedbackUrl);

    // ── UI Layout ──

    // Nav
    this.navBar = new NavBar(this.state.username);
    container.appendChild(this.navBar.el);

    // Dashboard grid
    const dashboard = document.createElement("div");
    dashboard.className = "lum-dashboard";

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

    dashboard.append(
      this.briefing.el,
      this.avatarFrame.el,
      this.goalsTasksPanel.el,
    );
    container.appendChild(dashboard);

    this.toastEl = document.createElement("div");
    this.toastEl.className = "lum-toast";
    this.toastEl.setAttribute("role", "status");
    this.toastEl.setAttribute("aria-live", "polite");
    container.appendChild(this.toastEl);

    // Bottom: Chat history (collapsible) + Journal
    this.journalHost = document.createElement("div");
    this.journalHost.className = "lum-journal-host";

    this.chatHistoryPanel = document.createElement("div");
    this.chatHistoryPanel.className = "lum-chat-history";
    this.chatHistoryPanel.setAttribute("role", "region");
    this.chatHistoryPanel.setAttribute("aria-label", "Chat history");
    this.chatHistoryPanel.setAttribute("aria-hidden", "true");

    this.chatHistoryInner = document.createElement("div");
    this.chatHistoryInner.className = "lum-chat-history-inner";

    this.chatHistoryList = document.createElement("div");
    this.chatHistoryList.className = "lum-chat-history-list";

    this.chatHistoryInner.appendChild(this.chatHistoryList);
    this.chatHistoryPanel.appendChild(this.chatHistoryInner);

    this.journalBar = new JournalBar();
    this.journalHost.append(this.chatHistoryPanel, this.journalBar.el);
    container.appendChild(this.journalHost);

    this.renderChatHistory();

    // ── 3D Scene ──

    this.sceneManager = new SceneManager(
      this.avatarFrame.sceneContainer,
      config,
    );

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
    this.feedbackPanel = new FeedbackPanel(this.modalManager);
    this.addTaskPanel = new AddTaskPanel(this.modalManager);

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

    // ── Auth gate ──
    this.initAuth(container);
  }

  private ensureAuthGateCover(container: HTMLElement): void {
    if (this.authBootOverlay) return;
    const el = document.createElement("div");
    el.className = "lum-login-overlay lum-auth-boot";
    el.setAttribute("aria-busy", "true");
    el.setAttribute("aria-label", "Signing in");
    container.appendChild(el);
    this.authBootOverlay = el;
  }

  private dismissAuthGateCover(): void {
    if (!this.authBootOverlay) return;
    this.authBootOverlay.remove();
    this.authBootOverlay = null;
  }

  /** Check for existing session or show auth dialog. */
  private async initAuth(container: HTMLElement): Promise<void> {
    this.ensureAuthGateCover(container);

    // Listen for auth state changes (handles OAuth redirect callbacks too)
    this.unsubAuth = authManager.onAuthStateChange(
      (_event, _session, profile) => {
        if (profile) {
          const prevUserId = this.authProfile?.userId;
          this.applyAuthProfile(profile);
          this.dismissLogin();
          this.authProfile = profile;
          if (this.sessionStarted) {
            const userChanged =
              prevUserId != null && prevUserId !== profile.userId;
            this.refreshBackendIdentity(profile, { reconnectWs: userChanged });
          }
        }
      },
    );

    const session = await authManager.getSession();
    if (session?.user) {
      const profile = await authManager.getProfile();
      if (profile) {
        this.applyAuthProfile(profile);
        this.authProfile = profile;
        this.showWelcomeBack(container, profile);
        return;
      }
    }

    // No session — show auth dialog
    this.showLogin(container);
  }

  private showWelcomeBack(container: HTMLElement, profile: UserProfile): void {
    this.dismissAuthGateCover();
    const overlay = document.createElement("div");
    overlay.className = "lum-login-overlay";
    const form = document.createElement("div");
    form.className = "lum-login-form";
    const heading = document.createElement("div");
    heading.className = "lum-login-heading";
    heading.textContent = `Welcome ${profile.displayName}`;
    const btn = document.createElement("button");
    btn.className = "lum-auth-btn lum-auth-btn--google";
    btn.type = "button";
    btn.textContent = "Continue";
    btn.addEventListener(
      "click",
      () => {
        overlay.classList.add("lum-login-hiding");
        setTimeout(() => overlay.remove(), 400);
        this.onReady();
      },
      { once: true },
    );
    form.append(heading, btn);
    overlay.appendChild(form);
    container.appendChild(overlay);
  }

  private applyAuthProfile(profile: UserProfile): void {
    this.enteredUsername = profile.displayName;
    this.navBar.setProfile({
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });
  }

  private dismissLogin(): void {
    if (!this.loginOverlay) return;
    this.loginOverlay.classList.add("lum-login-hiding");
    setTimeout(() => {
      this.loginOverlay?.remove();
      this.loginOverlay = null;
    }, 400);
  }

  /** Show auth dialog with Google, Magic Link, and Guest options. */
  private showLogin(container: HTMLElement): void {
    this.dismissAuthGateCover();
    this.loginOverlay = document.createElement("div");
    this.loginOverlay.className = "lum-login-overlay";

    const form = document.createElement("div");
    form.className = "lum-login-form";

    const heading = document.createElement("div");
    heading.className = "lum-login-heading";
    heading.textContent = "Welcome";

    const subtitle = document.createElement("div");
    subtitle.className = "lum-login-subtitle";
    subtitle.textContent = "Sign in to save your conversations and preferences";

    // Google button
    const googleBtn = document.createElement("button");
    googleBtn.className = "lum-auth-btn lum-auth-btn--google";
    googleBtn.type = "button";
    googleBtn.innerHTML = `<span class="lum-auth-icon">G</span> Continue with Google`;
    googleBtn.addEventListener("click", async () => {
      googleBtn.disabled = true;
      try {
        await authManager.signInWithGoogle();
      } catch {
        googleBtn.disabled = false;
        this.showToast("Could not sign in with Google");
      }
    });

    // Divider
    const divider = document.createElement("div");
    divider.className = "lum-auth-divider";
    divider.innerHTML = "<span>or</span>";

    // Guest button
    const guestBtn = document.createElement("button");
    guestBtn.className = "lum-auth-btn lum-auth-btn--guest";
    guestBtn.type = "button";
    guestBtn.innerHTML = `Continue as Guest`;
    guestBtn.addEventListener("click", async () => {
      guestBtn.disabled = true;
      try {
        await authManager.signInAsGuest();
        const profile = await authManager.getProfile();
        if (profile) {
          this.authProfile = profile;
          this.applyAuthProfile(profile);
          this.dismissLogin();
          this.onReady();
        }
      } catch {
        guestBtn.disabled = false;
        this.showToast("Could not sign in as guest");
      }
    });

    form.append(heading, subtitle, googleBtn, divider, guestBtn);
    this.loginOverlay.appendChild(form);
    container.appendChild(this.loginOverlay);
  }

  private wireCallbacks(): void {
    this.journalBar.onHistoryToggle = () => this.toggleChatHistory();

    // Journal submit → send to LLM (quest create / TOP 3 favorite via REST when phrasing matches)
    this.journalBar.onSubmit = async (text) => {
      if (!this.comm.connected || this.isBusy()) return false;
      this.appendChatEntry("user", text);

      const quickTitle = parseAddTaskIntent(text);
      let questJustSaved: string | null = null;
      if (quickTitle) {
        if (!this.supabaseAuthUserId) {
          this.showToast("Sign in to add tasks from chat");
        } else {
          const row = await this.aeloraClient.createQuest({
            title: quickTitle,
            category: defaultQuestCategory(),
            difficulty: "medium",
          });
          if (row) {
            this.refreshQuestTasks();
            questJustSaved = quickTitle;
          } else {
            this.showToast("Could not add task");
          }
        }
      }

      const top3Hint = parseMoveToTop3Intent(text);
      let top3PatynaNote: string | null = null;
      if (top3Hint) {
        if (!this.supabaseAuthUserId) {
          this.showToast("Sign in to sync TOP 3 from chat");
        } else {
          const tasks = this.state.getTasks();
          const match = findUncompletedQuestTaskByTitleHint(
            tasks,
            top3Hint,
            (id) => !!this.state.getQuestId(id),
          );
          if (!match) {
            this.showToast("No matching task — use the exact title from ALL TASKS");
          } else {
            const questId = this.state.getQuestId(match.id) ?? match.id;
            const favCount = tasks.filter((t) => t.isTop3 && !t.completed).length;
            if (match.isTop3) {
              top3PatynaNote = `Task "${match.title}" is already in TOP 3 (favorite). Acknowledge briefly.`;
            } else if (favCount >= TOP_FAVORITES_CAP) {
              this.showToast("You already have 3 top tasks — un-star one first");
            } else {
              const ok = await this.aeloraClient.setQuestFavorite(
                questId,
                true,
              );
              if (ok) {
                this.refreshQuestTasks();
                top3PatynaNote = `Task "${match.title}" was set as a favorite (TOP 3) via the app API — it should appear in the TOP 3 column. Acknowledge briefly.`;
              } else {
                this.showToast("Could not update TOP 3");
              }
            }
          }
        }
      }

      const patynaNotes: string[] = [];
      if (questJustSaved !== null) {
        patynaNotes.push(
          `[Patyna: Quest "${questJustSaved}" was saved to this user's Supabase quest list. Acknowledge briefly — it appears in ALL TASKS. Do not say you cannot edit the list.]`,
        );
      }
      if (top3PatynaNote) {
        patynaNotes.push(`[Patyna: ${top3PatynaNote}]`);
      }

      const tasksNow = this.state.getTasks();
      const timerIntent = resolveTop3TimerIntent(text, tasksNow, (id) =>
        Boolean(this.state.getQuestId(id)),
      );
      if (timerIntent) {
        const timerMatch = findTop3ActiveQuestTaskByTitleHint(
          tasksNow,
          timerIntent.hint,
          (id) => !!this.state.getQuestId(id),
        );
        if (!timerMatch) {
          this.showToast("No matching TOP 3 task — star it first or check the title");
        } else if (timerIntent.action === "start") {
          const started =
            this.goalsTasksPanel.startTop3TimerForQuestId(timerMatch.id);
          if (started) {
            patynaNotes.push(
              `[Patyna: TOP 3 timer started in the app for "${timerMatch.title}" (same as Start). Acknowledge briefly.]`,
            );
          } else {
            this.showToast("Could not start timer for that task");
          }
        } else {
          this.goalsTasksPanel.stopTop3TimerIfForQuest(timerMatch.id);
          this.openTop3TaskCompleteModal(timerMatch.id);
          patynaNotes.push(
            `[Patyna: Timer stopped and the task completion dialog was opened for "${timerMatch.title}". Acknowledge briefly — the user confirms completion there.]`,
          );
        }
      }

      const forModel =
        patynaNotes.length > 0 ? `${text}\n\n${patynaNotes.join("\n")}` : text;
      const msg = this.state.wrapMessage(forModel);
      this.comm.sendMessage(msg);
      this.transitionToThinking();
      return true;
    };

    this.journalBar.onVoiceError = (message) => {
      this.showToast(message);
    };

    // Task Start (TOP 3)
    this.goalsTasksPanel.onTaskStart = (_taskId) => {
      if (this.isBusy()) return;
      // Timer is managed by the panel itself
    };

    this.goalsTasksPanel.onMaxFavoritesReached = () => {
      this.showToast("You already have max favorite tasks");
    };

    this.goalsTasksPanel.onSetTaskFavorite = async (taskId, favorite) => {
      const questId = this.state.getQuestId(taskId);
      if (!questId) {
        const t = this.state.getTasks().find((x) => x.id === taskId);
        if (t) t.isTop3 = favorite;
        this.goalsTasksPanel.setData(
          this.state.getGoals(),
          this.state.getTasks(),
          this.state.pointsToday,
          this.state.pointsYesterday,
        );
        return true;
      }
      if (!this.supabaseAuthUserId) {
        this.showToast("Sign in to sync favorites");
        return false;
      }
      const ok = await this.aeloraClient.setQuestFavorite(questId, favorite);
      if (!ok) {
        this.showToast("Could not update favorites");
        return false;
      }
      this.refreshQuestTasks();
      return true;
    };

    this.goalsTasksPanel.onAddTaskClick = () => {
      this.addTaskPanel.open();
    };

    this.goalsTasksPanel.onDeleteTaskClick = async (taskId) => {
      const questId = this.state.getQuestId(taskId);
      if (!questId) {
        this.showToast("Only quest-backed tasks can be deleted");
        return;
      }
      if (!this.supabaseAuthUserId) {
        this.showToast("Sign in to delete tasks");
        return;
      }
      const ok = await this.aeloraClient.deleteQuest(questId);
      if (!ok) {
        this.showToast("Could not delete task");
        return;
      }
      this.refreshQuestTasks();
    };

    this.goalsTasksPanel.onEditTaskClick = (taskId) => {
      const task = this.state.getTasks().find((t) => t.id === taskId);
      if (!task) return;
      const category = task.category ?? defaultQuestCategory();
      const difficulty = luminoraDifficultyToSelect(task.difficulty);
      this.addTaskPanel.openEdit({
        taskId,
        title: task.title,
        description: task.description?.trim() ?? "",
        category,
        difficulty,
      });
    };

    this.addTaskPanel.onSubmit = async (data) => {
      if (!this.supabaseAuthUserId) {
        this.showToast("Sign in to add tasks");
        return false;
      }
      const row = await this.aeloraClient.createQuest({
        title: data.title,
        description: data.description || undefined,
        category: data.category || undefined,
        difficulty: data.difficulty,
      });
      if (!row) {
        this.showToast("Could not create task");
        return false;
      }
      this.refreshQuestTasks();
      return true;
    };

    this.addTaskPanel.onEditSubmit = async (taskId, data) => {
      const category = normalizeQuestCategory(data.category);
      const difficulty = data.difficulty as QuestDifficulty;
      const questId = this.state.getQuestId(taskId);
      if (!questId) {
        const ok = this.state.updateTaskContent(taskId, {
          title: data.title,
          description: data.description,
          category,
          difficulty,
        });
        if (!ok) return false;
        this.goalsTasksPanel.setData(
          this.state.getGoals(),
          this.state.getTasks(),
          this.state.pointsToday,
          this.state.pointsYesterday,
        );
        return true;
      }
      if (!this.supabaseAuthUserId) {
        this.showToast("Sign in to edit tasks");
        return false;
      }
      const row = await this.aeloraClient.updateQuest(questId, {
        title: data.title,
        description: data.description || undefined,
        category: data.category || undefined,
        difficulty: data.difficulty || undefined,
      });
      if (!row) {
        this.showToast("Could not update task");
        return false;
      }
      this.refreshQuestTasks();
      return true;
    };

    // Task Finish (TOP 3) → open completion modal
    this.goalsTasksPanel.onTaskFinish = (taskId) => {
      if (this.isBusy()) return;
      this.openTop3TaskCompleteModal(taskId);
    };

    // Task complete modal done → complete task + send to LLM + API
    this.taskCompleteModal.onDone = (data) => {
      const task = this.state.getTasks().find((t) => t.id === data.taskId);
      const message = this.state.completeTask(data.taskId);
      this.goalsTasksPanel.markTaskComplete(data.taskId);
      this.reportTaskCompletion(data.taskId, {
        notes: data.reflection.trim() || undefined,
      });
      if (task) this.briefing.markDueTodayByTitle(task.title);
      if (message && this.comm.connected) {
        if (task) this.appendChatEntry("user", `Completed: "${task.title}"`);
        this.transitionToThinking();
        this.comm.sendMessage(message);
      }
    };

    // All task click (non-TOP3) → complete directly + API
    this.goalsTasksPanel.onAllTaskClick = (taskId) => {
      if (this.isBusy()) return;
      const task = this.state.getTasks().find((t) => t.id === taskId);
      const message = this.state.completeTask(taskId);
      this.goalsTasksPanel.markTaskComplete(taskId);
      this.reportTaskCompletion(taskId);
      if (task) this.briefing.markDueTodayByTitle(task.title);
      if (message && this.comm.connected) {
        if (task) this.appendChatEntry("user", `Completed: "${task.title}"`);
        this.transitionToThinking();
        this.comm.sendMessage(message);
      }
    };

    // Vault button — fetch user-scoped memory facts then open
    this.avatarFrame.onVaultClick = () => {
      const userId = this.aeloraClient.userId;
      const scope = userId ? `user:${userId}` : null;

      if (!scope) {
        console.warn("[LUMINORA] Vault: no userId, showing fixture data");
        this.vaultModal.open(this.state.getVaultFacts());
        return;
      }

      this.aeloraClient
        .getMemoryByScope(scope)
        .catch(() => null)
        .then((facts) => {
          if (facts?.length) {
            this.state.applyUserFacts(facts);
            console.log(
              `[LUMINORA] Vault: ${facts.length} facts from /api/memory/scope (${scope})`,
            );
          } else {
            console.warn(
              "[LUMINORA] Vault: no facts from user scope, showing fixture data",
            );
          }
        })
        .finally(() => {
          this.vaultModal.open(this.state.getVaultFacts());
        });
    };

    this.navBar.onFeedbackClick = () => {
      this.feedbackPanel.open();
    };

    this.navBar.onSignOut = async () => {
      try {
        await authManager.signOut();
        window.location.reload();
      } catch {
        this.showToast("Could not sign out");
      }
    };

    this.feedbackPanel.onSubmit = async (data) => {
      if (!this.feedbackClient.isConfigured()) {
        this.showToast("Feedback endpoint is not configured yet.");
        return false;
      }

      const result = await this.feedbackClient.submitFeedback({
        content: data.comment,
        source: "Patyna",
        category: data.tag,
        userId: this.aeloraClient.userId,
        displayName: this.enteredUsername || this.state.username,
      });

      if (result) {
        this.showToast("Feedback sent — thank you!");
        return true;
      }

      this.showToast("Could not send feedback. Please try again.");
      return false;
    };

    // Briefing due-today toggle
    this.briefing.onDueTodayToggle = (_itemId, _completed) => {
      // Due-today items are now fixture-only (todos deprecated)
    };

    const openWeeklyRhythm = () => {
      this.weeklyRhythmModal.open(this.state.getHabits());
    };
    this.briefing.onScheduleHeaderClick = openWeeklyRhythm;
    this.goalsTasksPanel.onWeeklyRhythmClick = openWeeklyRhythm;
  }

  private setupListeners(): void {
    // ── Connection lifecycle ──

    eventBus.on("comm:ready", ({ sessionId }) => {
      console.log(`[LUMINORA] Session bound: ${sessionId}`);

      this.aeloraClient.getMood().then((mood) => {
        if (mood) eventBus.emit("comm:mood", mood as MoodData);
      });

      // Send priming message
      const username = this.enteredUsername || this.state.username;
      const primingMessage = this.state.buildPrimingMessage(username);
      this.comm.sendMessage(primingMessage);
      this.transitionToThinking();
    });

    eventBus.on("comm:disconnected", () => {
      this.resetSpeakingState();
      this.stateMachine.reset();
    });

    const onHistoryEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !this.chatHistoryOpen) return;
      this.chatHistoryOpen = false;
      this.syncChatHistoryPanel();
    };
    document.addEventListener("keydown", onHistoryEscape);
    this.cleanupFns.push(() =>
      document.removeEventListener("keydown", onHistoryEscape),
    );

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      this.briefing.setData(this.state.getBriefing());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    this.cleanupFns.push(() =>
      document.removeEventListener("visibilitychange", onVisibilityChange),
    );

    eventBus.on("comm:error", ({ code, message }) => {
      console.error(`[LUMINORA] Server error (${code}): ${message}`);
      this.resetSpeakingState();
      this.stateMachine.reset();
    });

    // ── LLM response flow ──

    eventBus.on("comm:textDelta", () => {
      if (this.stateMachine.state === "thinking") {
        this.textStreamDone = false;
        this.audioPlaying = false;
      }
    });

    eventBus.on("comm:textDone", ({ text }) => {
      this.textStreamDone = true;
      this.appendChatEntry("assistant", text);
      this.tryFinishResponse();
      // Sync vault after each LLM response — backend may have stored new facts
      this.syncVault();
      // Wendy may create quests via tools during this turn; Realtime / WS hints can
      // miss (config, event shape). Re-fetch so ALL TASKS stays in sync.
      void this.refreshQuestTasks();
    });

    eventBus.on("audio:ttsStreamStart", () => {
      this.ttsStreamOpen = true;
    });

    eventBus.on("audio:ttsStreamDone", () => {
      this.ttsStreamOpen = false;
      this.tryFinishResponse();
    });

    eventBus.on("audio:playbackStart", () => {
      this.audioPlaying = true;
      if (this.finishTimer) {
        clearTimeout(this.finishTimer);
        this.finishTimer = null;
      }
      const s = this.stateMachine.state;
      if (s === "thinking" || s === "idle") {
        this.stateMachine.transition("speaking");
      }
    });

    eventBus.on("audio:playbackEnd", () => {
      this.audioPlaying = false;
      this.tryFinishResponse();
    });

    // ── Mood ──

    eventBus.on("comm:mood", (mood) => {
      console.log(
        `[LUMINORA] Mood: ${mood.label} (${mood.emotion}/${mood.intensity})`,
      );
    });

    // Fallback nudge — Supabase Realtime is the primary task-sync path;
    // this handles edge cases where the websocket hint arrives first or
    // the realtime subscription missed a change (e.g. reconnect race).
    eventBus.on("comm:dataChanged", ({ source, table, action }) => {
      console.log(
        `[LUMINORA] Data changed: ${source} ${table ?? ""} ${action ?? ""}`,
      );
      if (source === "supabase" || table === "quests") {
        this.refreshQuestTasks();
      }
    });

    // TOP 3 timer start — from Aelora `task:start` event
    eventBus.on("comm:taskStart", ({ questId }) => {
      const ok = this.goalsTasksPanel.startTop3TimerForQuestId(questId);
      if (!ok) {
        console.warn(
          "[LUMINORA] task:start: no matching TOP 3 task for questId",
          questId,
        );
      }
    });

    eventBus.on("comm:taskFinish", ({ questId, title }) => {
      const task = this.state
        .getTasks()
        .find((t) => t.id === questId && t.isTop3 && !t.completed);
      if (!task) {
        console.warn(
          "[LUMINORA] task:finish: no matching TOP 3 task for questId",
          questId,
        );
        return;
      }
      this.goalsTasksPanel.stopTop3TimerIfForQuest(questId);
      this.taskCompleteModal.open(questId, title ?? task.title);
    });

    // ── Celebrations ──

    eventBus.on("demo:taskComplete", ({ totalPoints, maxPoints }) => {
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
        console.warn("[LUMINORA] Celebration effect error:", e);
      }
    });
  }

  // ── Speaking state machine (identical to DemoApp) ──

  private transitionToThinking(): void {
    const s = this.stateMachine.state;
    this.goalsTasksPanel.setBusy(true);
    if (s === "listening") {
      this.stateMachine.transition("thinking");
    } else if (s === "idle") {
      this.stateMachine.transition("listening");
      this.stateMachine.transition("thinking");
    } else if (s === "speaking" || s === "thinking") {
      this.elevenLabs.close();
      this.ttsPlayer.flush();
      this.resetSpeakingState();
      this.goalsTasksPanel.setBusy(true);
      this.stateMachine.transition("idle");
      this.stateMachine.transition("listening");
      this.stateMachine.transition("thinking");
    }
  }

  private tryFinishResponse(): void {
    if (!this.textStreamDone) return;
    if (this.audioPlaying) return;
    if (this.ttsStreamOpen) return;

    if (this.finishTimer) return;
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      if (!this.textStreamDone || this.audioPlaying || this.ttsStreamOpen)
        return;
      const s = this.stateMachine.state;
      if (s === "speaking" || s === "thinking") {
        this.stateMachine.transition("idle");
      }
      this.goalsTasksPanel.setBusy(false);

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
    this.goalsTasksPanel.setBusy(false);
  }

  /** True when the avatar is thinking or speaking — blocks task interactions. */
  private isBusy(): boolean {
    const s = this.stateMachine.state;
    return s === "thinking" || s === "speaking";
  }

  private toggleChatHistory(): void {
    this.chatHistoryOpen = !this.chatHistoryOpen;
    this.syncChatHistoryPanel();
    if (this.chatHistoryOpen) {
      this.renderChatHistory();
      requestAnimationFrame(() => {
        this.chatHistoryInner.scrollTop = this.chatHistoryInner.scrollHeight;
      });
    }
  }

  private syncChatHistoryPanel(): void {
    this.chatHistoryPanel.classList.toggle(
      "lum-chat-history--open",
      this.chatHistoryOpen,
    );
    this.chatHistoryPanel.setAttribute(
      "aria-hidden",
      this.chatHistoryOpen ? "false" : "true",
    );
    this.journalBar.setHistoryOpen(this.chatHistoryOpen);
  }

  private renderChatHistory(): void {
    this.chatHistoryList.replaceChildren();
    if (this.chatEntries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "lum-chat-history-empty";
      empty.textContent = "No messages yet. Say hello to Wendy below.";
      this.chatHistoryList.appendChild(empty);
      return;
    }
    for (const e of this.chatEntries) {
      const row = document.createElement("div");
      row.className = `lum-chat-history-row lum-chat-history-row--${e.role}`;
      const bubble = document.createElement("div");
      bubble.className = `lum-chat-history-bubble lum-chat-history-bubble--${e.role}`;
      bubble.textContent = e.text;
      row.appendChild(bubble);
      this.chatHistoryList.appendChild(row);
    }
  }

  private appendChatEntry(role: "user" | "assistant", text: string): void {
    const t = text.trim();
    if (!t) return;
    this.chatEntries.push({ role, text: t });
    if (!this.chatHistoryOpen) return;
    this.renderChatHistory();
    requestAnimationFrame(() => {
      this.chatHistoryInner.scrollTop = this.chatHistoryInner.scrollHeight;
    });
  }

  /** TOP 3 "Finish" — opens the same reflection modal as clicking Finish on the card. */
  private openTop3TaskCompleteModal(taskId: string): void {
    const task = this.state.getTasks().find((t) => t.id === taskId);
    if (task) this.taskCompleteModal.open(taskId, task.title);
  }

  private showToast(message: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add("lum-toast--visible");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl?.classList.remove("lum-toast--visible");
      this.toastTimer = null;
    }, 3200);
  }

  // ── API: report task completion ──

  private reportTaskCompletion(
    taskId: string,
    opts?: { notes?: string },
  ): void {
    const task = this.state.getTasks().find((t) => t.id === taskId);
    if (!task) return;

    const questId = this.state.getQuestId(taskId);
    if (questId && this.supabaseAuthUserId) {
      this.aeloraClient
        .completeQuest(questId, { notes: opts?.notes })
        .catch(() => {});
    }



    // Create life event for scoring
    const userId = this.aeloraClient.userId;
    if (userId) {
      this.aeloraClient
        .createLifeEvent({
          discordUserId: userId,
          title: task.title,
          category: "tasks",
          priority:
            task.points >= 10 ? "high" : task.points >= 7 ? "medium" : "low",
          sizeLabel: task.points >= 10 ? "medium" : "small",
        })
        .then((result) => {
          if (result) {
            if (result.id) this.state.setLifeEventId(taskId, result.id);
            console.log(
              `[LUMINORA] Life event created: ${task.title} (score: ${result.totalScore ?? "n/a"})`,
            );
            // Sync vault — backend stores completion as a fact
            this.syncVault();
          }
        })
        .catch(() => {});
    }
  }

  // ── Init ──

  /**
   * Push Supabase Auth `user.id` (and session id) into config, REST client, WS `init`, and quest Realtime.
   */
  private refreshBackendIdentity(
    profile: UserProfile,
    options?: { reconnectWs?: boolean },
  ): void {
    const username =
      profile.displayName || this.enteredUsername || this.state.username;
    const userId = profile.userId || username;
    const supabaseUserId = profile.userId;
    const sessionId = `patyna-${userId}`;

    this.config.websocket.userId = userId;
    this.config.websocket.username = username;
    this.config.websocket.supabaseUserId = supabaseUserId;
    this.config.websocket.sessionId = sessionId;

    this.aeloraClient.updateUser(userId, username, supabaseUserId);
    this.aeloraClient.updateSession(sessionId);
    this.comm.updateIdentity(userId, username, supabaseUserId);

    this.unsubQuests?.();
    this.unsubQuests = subscribeQuestsForUser(supabaseUserId, () =>
      this.refreshQuestTasks(),
    );

    if (options?.reconnectWs && this.comm.connected) {
      this.comm.disconnect();
      this.comm.connect();
    }
  }

  private async onReady(): Promise<void> {
    console.log("[LUMINORA] Starting...");

    const profile = this.authProfile;
    if (!profile) {
      console.warn("[LUMINORA] onReady without auth profile — skipping connect");
      return;
    }

    this.refreshBackendIdentity(profile);

    await this.ttsPlayer.init();
    this.navBar.syncSpeakerMuteToAudio();

    // Enable ElevenLabs streaming — starts gated until this; nav speaker mute is separate (media:speakerMute)
    eventBus.emit("media:ttsToggle", { enabled: true });

    // Fetch live API data in parallel (non-blocking — falls back to fixture)
    this.fetchLiveData();

    // Periodically sync vault facts in background
    this.vaultSyncTimer = setInterval(
      () => this.syncVault(),
      this.VAULT_SYNC_INTERVAL_MS,
    );

    this.sessionStarted = true;
    this.comm.connect();
  }

  /** Background-sync user facts into the vault (non-blocking). */
  private syncVault(): void {
    const userId = this.aeloraClient.userId;
    if (!userId) return;
    const scope = `user:${userId}`;

    this.aeloraClient
      .getMemoryByScope(scope)
      .catch(() => null)
      .then((facts) => {
        if (facts?.length) {
          this.state.applyUserFacts(facts);
          console.log(
            `[LUMINORA] Vault synced: ${facts.length} facts from /api/memory/scope`,
          );
        }
      });
  }

  /** Reload quests from Supabase and refresh the goals/tasks panel (debounced 200ms). */
  private refreshQuestTasks(): void {
    if (this.refreshQuestTimer) return;
    this.refreshQuestTimer = setTimeout(async () => {
      this.refreshQuestTimer = null;
      const userId = this.supabaseAuthUserId;
      if (!userId) return;
      const rows = await fetchQuestsForUser(userId);
      if (rows === null) return;
      this.state.applyQuests(rows);
      this.goalsTasksPanel.setData(
        this.state.getGoals(),
        this.state.getTasks(),
        this.state.pointsToday,
        this.state.pointsYesterday,
      );
    }, 200);
  }

  /** Fetch calendar, todos, memory, scoring from Aelora APIs and overlay onto state. */
  private async fetchLiveData(): Promise<void> {
    const userId = this.aeloraClient.userId;
    const supabaseUid = this.supabaseAuthUserId;

    const scope = userId ? `user:${userId}` : null;

    const questsPromise = supabaseUid
      ? fetchQuestsForUser(supabaseUid)
      : Promise.resolve(null);

    const [
      calendar,
      questsRows,
      scopedFacts,
      scoring,
      leaderboard,
    ] = await Promise.all([
      this.aeloraClient.getCalendarEvents(3).catch(() => null),
      questsPromise,
      scope
        ? this.aeloraClient.getMemoryByScope(scope).catch(() => null)
        : null,
      userId
        ? this.aeloraClient.getScoringStats(userId).catch(() => null)
        : null,
      userId
        ? this.aeloraClient.getLeaderboard(userId, 3).catch(() => null)
        : null,
    ]);

    let updated = false;

    if (calendar && calendar.length > 0) {
      this.state.applyCalendarEvents(calendar);
      console.log(`[LUMINORA] Loaded ${calendar.length} calendar events`);
      updated = true;
    }

    if (questsRows !== null) {
      this.state.applyQuests(questsRows);
      console.log(
        `[LUMINORA] Loaded ${questsRows.length} quest(s) from Supabase`,
      );
      updated = true;
    }

    if (scopedFacts?.length) {
      this.state.applyUserFacts(scopedFacts);
      console.log(
        `[LUMINORA] Loaded ${scopedFacts.length} facts from /api/memory/scope (${scope})`,
      );
    }

    if (scoring) {
      this.state.applyScoringStats(scoring);
      console.log(
        `[LUMINORA] Scoring: ${scoring.xp} XP, ${scoring.streak} streak`,
      );
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

  private isPointerOnUiPanel(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.closest(Demo2App.UI_PANEL_SELECTOR) !== null;
  }

  private setupMouseTracking(): void {
    const sceneWrap = this.avatarFrame.sceneContainer;

    const emitMouseGaze = (e: MouseEvent) => {
      const rect = sceneWrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const x = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      const y = -Math.max(
        -1,
        Math.min(1, (e.clientY - cy) / (rect.height / 2)),
      );
      eventBus.emit("face:position", { x, y, z: 0 });
    };

    const returnToNeutral = () => {
      if (!this.cameraActive) {
        eventBus.emit("face:lost");
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      clearTimeout(this.mouseIdleTimer);
      clearTimeout(this.panelIdleTimer);

      const onPanel = this.isPointerOnUiPanel(e.target);

      if (!onPanel) {
        if (this.pointerOnPanel) {
          this.pointerOnPanel = false;
          this.panelGazeLocked = false;
          returnToNeutral();
        }
        return;
      }

      this.pointerOnPanel = true;

      if (this.panelGazeLocked) return;

      this.panelIdleTimer = window.setTimeout(() => {
        this.panelGazeLocked = true;
        returnToNeutral();
      }, this.PANEL_IDLE_MS);

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
      this.pointerOnPanel = false;
      this.panelGazeLocked = false;
      clearTimeout(this.mouseIdleTimer);
      clearTimeout(this.panelIdleTimer);
      returnToNeutral();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);

    this.cleanupFns.push(() => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      clearTimeout(this.panelIdleTimer);
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
    this.dismissAuthGateCover();
    this.unsubAuth?.();
    this.unsubAuth = null;
    this.unsubQuests?.();
    this.unsubQuests = null;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.vaultSyncTimer) {
      clearInterval(this.vaultSyncTimer);
      this.vaultSyncTimer = null;
    }
    if (this.refreshQuestTimer) {
      clearTimeout(this.refreshQuestTimer);
      this.refreshQuestTimer = null;
    }
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;

    this.journalBar.destroy();
    this.goalsTasksPanel.destroy();
    this.elevenLabs.destroy();
    this.ttsPlayer.destroy();
    this.audioManager.close();
    this.comm.disconnect();
    authManager.destroy();
    console.log("[LUMINORA] Destroyed");
  }
}
