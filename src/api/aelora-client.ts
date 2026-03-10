/**
 * Aelora REST API client — stateless HTTP calls for memory,
 * user profiles, sessions, notes, and mood.
 *
 * Base URL is derived from the WebSocket URL:
 *   wss://host/ws  →  https://host
 *   ws://host/ws   →  http://host
 *
 * All methods return null on failure (non-blocking, logged).
 */

// ── Response types ──

export interface MemoryFact {
  fact: string;
  savedAt: string;
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

interface LinearResponse {
  issues: LinearIssue[];
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

// ── Client ──

export interface AeloraClientConfig {
  wsUrl: string;          // WebSocket URL — base URL derived from this
  baseUrl?: string;       // Optional explicit override
  apiKey?: string;        // Bearer token
  sessionId: string;
  userId?: string;
  username?: string;
}

export class AeloraClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private _sessionId: string;
  private _userId?: string;
  private _username?: string;

  get sessionId(): string { return this._sessionId; }
  get userId(): string | undefined { return this._userId; }
  get username(): string | undefined { return this._username; }

  constructor(config: AeloraClientConfig) {
    this.baseUrl = config.baseUrl ?? this.deriveBaseUrl(config.wsUrl);
    this._sessionId = config.sessionId;
    this._userId = config.userId;
    this._username = config.username;

    this.headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    console.log(`[AeloraClient] Base URL: ${this.baseUrl}`);
  }

  /** Update user identity (called after login, before connect). */
  updateUser(username: string): void {
    this._userId = username;
    this._username = username;
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

  /** Get upcoming calendar events (unwraps {events: [...]}) */
  async getCalendarEvents(days = 7): Promise<CalendarEvent[] | null> {
    const resp = await this.get<CalendarResponse>(`/api/calendar/events?days=${days}`);
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
        console.warn(`[AeloraClient] ${options?.method ?? 'GET'} ${path} → ${resp.status}`);
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
