/**
 * Aelora REST API client — the single command layer for Patyna.
 *
 * Responsibilities:
 *   - All task/quest mutations (create, complete) — Aelora owns writes.
 *   - Memory, scoring, calendar, todos, mood, notes, and user profile reads.
 *
 * Patyna never writes to Supabase directly for task data; it reads via
 * the Supabase JS client (RLS-scoped) and subscribes to Realtime for
 * live sync. All mutations flow through this client to Aelora.
 *
 * Base URL is derived from the WebSocket URL:
 *   wss://host/ws  →  https://host
 *   ws://host/ws   →  http://host
 *
 * All methods return null on failure (non-blocking, logged).
 */

import { DEFAULT_QUEST_TYPE, type QuestRow } from '@/quests/quest-types.ts';

// ── Response types ──

export interface MemoryFact {
  fact: string;
  savedAt: string;
  category?: string;          // e.g. "preference", "habit", "goal", "identity"
  confidence?: string;        // "stated" | "inferred" | "observed"
  source?: string;            // e.g. "channel:123456"
  lastAccessedAt?: string;
  accessCount?: number;
}

export interface UserProfile {
  userId: string;
  username: string;
  firstSeen: string;
  lastSeen: string;
  messageCount: number;
  channels: string[];
  facts: MemoryFact[];
}

export interface SessionUser {
  username: string;
  messageCount: number;
  lastMessage: string;
}

export interface SessionDetail {
  channelId: string;
  channelName?: string;
  messageCount: number;
  firstMessage?: string;
  lastMessage?: string;
  users: Record<string, SessionUser>;
  memories: Record<string, MemoryFact[]>;
}

export interface MoodState {
  active: boolean;
  emotion: string;
  intensity: string;
  label: string;
  secondary?: string;
  note?: string;
  updatedAt: string;
}

export interface NoteData {
  content: string;
  createdAt: string;
  updatedAt: string;
}

// ── Dashboard types ──

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: string;
  dtend: string;
  url?: string;
}

interface CalendarResponse {
  events: CalendarEvent[];
  count: number;
  daysAhead: number;
  maxResults: number;
}

interface TodoResponse {
  todos: TodoItem[];
  count: number;
}

export interface TodoItem {
  uid: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  url?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  status: string;
  assignee?: { name: string; email: string };
  url?: string;
  dueDate?: string;
  labels?: string[];
}

// ── Scoring types ──

export interface ScoringStats {
  xp: number;
  streak: number;
  achievements: Record<string, unknown>;
}

export interface LeaderboardTask {
  id: string;
  title: string;
  score: number;
  category: string;
}

export interface ScoringEvent {
  timestamp: string;
  taskId: string;
  pointsAwarded: number;
  title: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface LifeEventCreate {
  discordUserId: string;
  title: string;
  description?: string;
  category?: 'tasks' | 'health' | 'finance' | 'social' | 'work';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  impactLevel?: 'trivial' | 'low' | 'moderate' | 'high' | 'critical';
  irreversible?: boolean;
  affectsOthers?: boolean;
  estimatedMinutes?: number;
  sizeLabel?: 'micro' | 'small' | 'medium' | 'large' | 'epic';
  tags?: string[];
}

export interface LifeEventResult {
  id: string;
  title: string;
  scoreBreakdown: Record<string, unknown>;
  totalScore: number;
}

// ── Client ──

export interface AeloraClientConfig {
  wsUrl: string;          // WebSocket URL — base URL derived from this
  baseUrl?: string;       // Optional explicit override
  apiKey?: string;        // Bearer token
  sessionId: string;
  userId?: string;
  username?: string;
  supabaseUserId?: string;
}

export class AeloraClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private _sessionId: string;
  private _userId?: string;
  private _username?: string;
  private _supabaseUserId?: string;

  get sessionId(): string { return this._sessionId; }
  get userId(): string | undefined { return this._userId; }
  get username(): string | undefined { return this._username; }
  get supabaseUserId(): string | undefined { return this._supabaseUserId; }

  constructor(config: AeloraClientConfig) {
    this.baseUrl = config.baseUrl ?? this.deriveBaseUrl(config.wsUrl);
    this._sessionId = config.sessionId;
    this._userId = config.userId;
    this._username = config.username;
    this._supabaseUserId = config.supabaseUserId;

    this.headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    console.log(`[AeloraClient] Base URL: ${this.baseUrl}`);
  }

  /** Update user identity (called after login, before connect). */
  updateUser(userId: string, username: string, supabaseUserId?: string): void {
    this._userId = userId;
    this._username = username;
    this._supabaseUserId = supabaseUserId;
  }

  /** Update session ID (called after login to scope session to the user). */
  updateSession(sessionId: string): void {
    this._sessionId = sessionId;
  }

  // ── Public API ──

  /** Get user profile with memory facts. */
  async getUser(userId?: string): Promise<UserProfile | null> {
    const id = userId ?? this.userId;
    if (!id) return null;
    return this.get<UserProfile>(`/api/users/${encodeURIComponent(id)}`);
  }

  /** Get session detail with per-user stats and memory facts. */
  async getSession(channelId?: string): Promise<SessionDetail | null> {
    const id = channelId ?? this.sessionId;
    return this.get<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`);
  }

  /** Get all memory facts grouped by scope. */
  async getMemory(): Promise<Record<string, MemoryFact[]> | null> {
    return this.get<Record<string, MemoryFact[]>>('/api/memory');
  }

  /** Get memory facts for a specific scope (e.g. "user:tyler"). */
  async getMemoryByScope(scope: string): Promise<MemoryFact[] | null> {
    const resp = await this.get<{ scope: string; facts: MemoryFact[] }>(
      `/api/memory/scope?name=${encodeURIComponent(scope)}`,
    );
    return resp?.facts ?? null;
  }

  /** Get current mood state. */
  async getMood(): Promise<MoodState | null> {
    return this.get<MoodState>('/api/mood');
  }

  /** Get a note by scope and title. */
  async getNote(scope: string, title: string): Promise<NoteData | null> {
    return this.get<NoteData>(
      `/api/notes/${encodeURIComponent(scope)}/${encodeURIComponent(title)}`,
    );
  }

  /** Create or update a note. Returns true on success. */
  async putNote(scope: string, title: string, content: string): Promise<boolean> {
    const result = await this.request<{ created: boolean }>(
      `/api/notes/${encodeURIComponent(scope)}/${encodeURIComponent(title)}`,
      { method: 'PUT', body: JSON.stringify({ content }) },
    );
    return result !== null;
  }

  /** Delete a note. Returns true on success. */
  async deleteNote(scope: string, title: string): Promise<boolean> {
    const result = await this.request<unknown>(
      `/api/notes/${encodeURIComponent(scope)}/${encodeURIComponent(title)}`,
      { method: 'DELETE' },
    );
    return result !== null;
  }

  /** Get API status. */
  async getStatus(): Promise<Record<string, unknown> | null> {
    return this.get<Record<string, unknown>>('/api/status');
  }

  // ── Scoring ──

  /** Get user XP, streak, and achievements. */
  async getScoringStats(userId?: string): Promise<ScoringStats | null> {
    const id = userId ?? this._userId;
    if (!id) return null;
    return this.get<ScoringStats>(`/api/scoring/stats?discordUserId=${encodeURIComponent(id)}`);
  }

  /** Get pending tasks sorted by computed score. */
  async getLeaderboard(userId?: string, limit = 20, category?: string): Promise<LeaderboardTask[] | null> {
    const id = userId ?? this._userId;
    if (!id) return null;
    const params = [`discordUserId=${encodeURIComponent(id)}`, `limit=${limit}`];
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    const resp = await this.get<{ tasks: LeaderboardTask[] }>(`/api/scoring/leaderboard?${params.join('&')}`);
    return resp?.tasks ?? null;
  }

  /** Get recent scoring history. */
  async getScoringHistory(userId?: string, limit = 20): Promise<ScoringEvent[] | null> {
    const id = userId ?? this._userId;
    if (!id) return null;
    const resp = await this.get<{ events: ScoringEvent[] }>(`/api/scoring/history?discordUserId=${encodeURIComponent(id)}&limit=${limit}`);
    return resp?.events ?? null;
  }

  /** Get all achievements with unlock status. */
  async getAchievements(userId?: string): Promise<Achievement[] | null> {
    const id = userId ?? this._userId;
    if (!id) return null;
    const resp = await this.get<{ achievements: Achievement[] }>(`/api/scoring/achievements?discordUserId=${encodeURIComponent(id)}`);
    return resp?.achievements ?? null;
  }

  /** Create a life event for scoring. */
  async createLifeEvent(data: LifeEventCreate): Promise<LifeEventResult | null> {
    return this.request<LifeEventResult>('/api/life-events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ── Todos (mutations) ──

  /** Create a new todo. */
  async createTodo(title: string, opts?: { description?: string; priority?: 'low' | 'medium' | 'high'; dueDate?: string }): Promise<TodoItem | null> {
    return this.request<TodoItem>('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ title, ...opts }),
    });
  }

  /** Update an existing todo. */
  async updateTodo(uid: string, fields: { title?: string; description?: string; priority?: string; dueDate?: string; completed?: boolean }): Promise<TodoItem | null> {
    return this.request<TodoItem>(`/api/todos/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  }

  /** Delete a todo. */
  async deleteTodo(uid: string): Promise<boolean> {
    const result = await this.request<unknown>(`/api/todos/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
    });
    return result !== null;
  }

  // ── Quests (Aelora-owned mutations — server writes to Supabase) ──

  /** List quests for a user via GET /api/quests. */
  async getQuests(opts?: {
    status?: 'active' | 'completed' | 'all';
    limit?: number;
    supabaseUserId?: string;
  }): Promise<QuestRow[] | null> {
    const uid = (opts?.supabaseUserId?.trim() || this._supabaseUserId)?.trim();
    if (!uid) return null;
    const params = [`supabaseUserId=${encodeURIComponent(uid)}`];
    if (opts?.status) params.push(`status=${encodeURIComponent(opts.status)}`);
    if (opts?.limit) params.push(`limit=${opts.limit}`);
    return this.get<QuestRow[]>(`/api/quests?${params.join('&')}`);
  }

  /** Create a quest via Aelora. Requires Supabase Auth `user.id` (pass `supabaseUserId` or set via `updateUser`). */
  async createQuest(input: {
    title: string;
    description?: string;
    category?: string;
    difficulty?: string;
    quest_type?: string;
    /** When set, sent as `supabaseUserId` in the JSON body (overrides cached client id). */
    supabaseUserId?: string;
  }): Promise<QuestRow | null> {
    const { supabaseUserId: explicitUid, ...fields } = input;
    const uid = (explicitUid?.trim() || this._supabaseUserId)?.trim();
    if (!uid) return null;
    return this.request<QuestRow>('/api/quests', {
      method: 'POST',
      body: JSON.stringify({
        supabaseUserId: uid,
        quest_type: DEFAULT_QUEST_TYPE,
        ...fields,
      }),
    });
  }

  /** Update a quest via PUT /api/quests/:id. Only provided fields are changed. */
  async updateQuest(
    questId: string,
    input: {
      title?: string;
      description?: string;
      category?: string;
      difficulty?: string;
      quest_type?: string;
      status?: string;
      suggested_by?: string;
      target_value?: number;
      current_value?: number;
      is_favorite?: boolean;
      supabaseUserId?: string;
    },
  ): Promise<QuestRow | null> {
    const { supabaseUserId: explicitUid, ...fields } = input;
    const uid = (explicitUid?.trim() || this._supabaseUserId)?.trim();
    if (!uid) return null;
    const result = await this.request<{ quest: QuestRow }>(
      `/api/quests/${encodeURIComponent(questId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ supabaseUserId: uid, ...fields }),
      },
    );
    return result?.quest ?? null;
  }

  /** Delete a quest via DELETE /api/quests/:id. */
  async deleteQuest(
    questId: string,
    supabaseUserId?: string,
  ): Promise<boolean> {
    const uid = (supabaseUserId?.trim() || this._supabaseUserId)?.trim();
    if (!uid) return false;
    const result = await this.request<{ ok: boolean }>(
      `/api/quests/${encodeURIComponent(questId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ supabaseUserId: uid }),
      },
    );
    return result?.ok ?? false;
  }

  /** Mark a quest completed via Aelora. Requires Supabase Auth user id (pass or set via `updateUser`). */
  async completeQuest(
    questId: string,
    opts?: { notes?: string; supabaseUserId?: string },
  ): Promise<{ success: boolean; quest?: QuestRow; logInserted?: boolean } | null> {
    const uid = (opts?.supabaseUserId?.trim() || this._supabaseUserId)?.trim();
    if (!uid) return null;
    const { notes } = opts ?? {};
    return this.request<{ success: boolean; quest?: QuestRow; logInserted?: boolean }>(
      `/api/quests/${encodeURIComponent(questId)}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ supabaseUserId: uid, notes }),
      },
    );
  }

  /**
   * Set quest favorite (TOP 3) via Aelora. POST /api/quests/:id/favorite
   * — same path Wendy/quests tool uses; triggers dataChanged + task:top3.
   */
  async setQuestFavorite(
    questId: string,
    isFavorite: boolean,
    supabaseUserId?: string,
  ): Promise<boolean> {
    const uid = (supabaseUserId?.trim() || this._supabaseUserId)?.trim();
    if (!uid) return false;
    const result = await this.request<{ quest: QuestRow }>(
      `/api/quests/${encodeURIComponent(questId)}/favorite`,
      {
        method: 'POST',
        body: JSON.stringify({
          supabaseUserId: uid,
          is_favorite: isFavorite,
        }),
      },
    );
    return result?.quest != null;
  }

  /** Get upcoming calendar events (unwraps {events: [...]}) */
  async getCalendarEvents(daysAhead = 7): Promise<CalendarEvent[] | null> {
    const resp = await this.get<CalendarResponse>(`/api/calendar/events?daysAhead=${daysAhead}`);
    return resp?.events ?? null;
  }

  /** Get todos (Google Tasks, unwraps {todos: [...]}) */
  async getTodos(status?: string, assignee?: string): Promise<TodoItem[] | null> {
    const params: string[] = [];
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (assignee) params.push(`assignee=${encodeURIComponent(assignee)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    const resp = await this.get<TodoResponse>(`/api/todos${qs}`);
    return resp?.todos ?? null;
  }

  /** Get Linear issues, optionally filtered by assignee. */
  async getLinearIssues(status?: string, assignee?: string): Promise<LinearIssue[] | null> {
    const params: string[] = [];
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (assignee) params.push(`assignee=${encodeURIComponent(assignee)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    return this.get<LinearIssue[]>(`/api/linear/issues${qs}`);
  }

  // ── Internal ──

  private async get<T>(path: string): Promise<T | null> {
    return this.request<T>(path);
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    try {
      const resp = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...options?.headers },
      });

      if (!resp.ok) {
        let detail = '';
        try {
          const ct = resp.headers.get('content-type') ?? '';
          if (ct.includes('application/json')) {
            const body = (await resp.clone().json()) as { error?: string; hint?: string };
            if (body?.error) detail = ` — ${body.error}${body.hint ? ` (${body.hint})` : ''}`;
          }
        } catch {
          /* ignore parse errors */
        }
        console.warn(
          `[AeloraClient] ${options?.method ?? 'GET'} ${path} → ${resp.status}${detail}`,
        );
        return null;
      }

      return (await resp.json()) as T;
    } catch (err) {
      console.warn(`[AeloraClient] ${options?.method ?? 'GET'} ${path} failed:`, err);
      return null;
    }
  }

  /**
   * Derive REST base URL from WebSocket URL.
   *   wss://host:port/ws  →  https://host:port
   *   ws://host:port/ws   →  http://host:port
   */
  private deriveBaseUrl(wsUrl: string): string {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.search = '';
    // Strip trailing /ws but keep any path prefix (e.g. /aelora/ws → /aelora)
    const path = url.pathname.replace(/\/ws\/?$/, '');
    return `${url.origin}${path}`;
  }
}
