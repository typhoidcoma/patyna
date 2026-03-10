import { eventBus } from '@/core/event-bus.ts';
import type { CalendarEvent, TodoItem, LinearIssue } from '@/api/aelora-client.ts';
import './sidebar.css';

/**
 * Dashboard sidebar with three widget sections:
 * Calendar, Tasks, and Linear issues.
 *
 * Listens to event bus for data updates and renders widget cards.
 */
export class Sidebar {
  private el: HTMLDivElement;
  private scrim: HTMLDivElement;
  private calendarWidget: WidgetSection;
  private tasksWidget: WidgetSection;
  private linearWidget: WidgetSection;
  private visible = true;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'sidebar';

    // Scrim — translucent backdrop for mobile overlay; tap to dismiss
    this.scrim = document.createElement('div');
    this.scrim.className = 'sidebar-scrim';
    this.scrim.addEventListener('click', () => {
      this.hide();
      eventBus.emit('sidebar:closed');
    });
    container.appendChild(this.scrim);

    this.calendarWidget = new WidgetSection('Calendar');
    this.tasksWidget = new WidgetSection('Tasks');
    this.linearWidget = new WidgetSection('Linear');

    this.el.append(
      this.calendarWidget.el,
      this.tasksWidget.el,
      this.linearWidget.el,
    );

    container.appendChild(this.el);

    // Show loading state initially
    this.calendarWidget.setLoading();
    this.tasksWidget.setLoading();
    this.linearWidget.setLoading();

    // Listen for data updates
    eventBus.on('api:calendarEvents', ({ events }) => {
      this.renderCalendar(events);
    });

    eventBus.on('api:todos', ({ todos }) => {
      this.renderTasks(todos);
    });

    eventBus.on('api:linearIssues', ({ issues }) => {
      this.renderLinear(issues);
    });

    eventBus.on('sidebar:toggle', () => {
      this.toggle();
    });
  }

  // ── Render methods ──

  private renderCalendar(events: CalendarEvent[]): void {
    if (events.length === 0) {
      this.calendarWidget.setEmpty('No upcoming events');
      return;
    }

    this.calendarWidget.setCount(events.length);
    this.calendarWidget.clearItems();

    for (const ev of events.slice(0, 15)) {
      const start = new Date(ev.dtstart);
      const meta = formatEventTime(start, ev.dtend ? new Date(ev.dtend) : null);
      this.calendarWidget.addItem({
        title: ev.summary || '(untitled)',
        meta,
        dotClass: 'calendar',
        onClick: () => sendToChat(`In one sentence, what's "${ev.summary}" on ${meta}?`),
      });
    }
  }

  private renderTasks(todos: TodoItem[]): void {
    if (todos.length === 0) {
      this.tasksWidget.setEmpty('No tasks');
      return;
    }

    this.tasksWidget.setCount(todos.length);
    this.tasksWidget.clearItems();

    for (const todo of todos.slice(0, 15)) {
      const dotClass = todo.completed
        ? 'task-done'
        : `task-${todo.priority || 'low'}`;
      const meta = todo.dueDate ? `Due ${formatRelativeDate(new Date(todo.dueDate))}` : '';
      this.tasksWidget.addItem({
        title: todo.title,
        meta,
        dotClass,
        onClick: () => sendToChat(
          todo.completed
            ? `One sentence: what was "${todo.title}"?`
            : `One sentence: what should I do for "${todo.title}"?`,
        ),
      });
    }
  }

  private renderLinear(issues: LinearIssue[]): void {
    if (issues.length === 0) {
      this.linearWidget.setEmpty('No issues');
      return;
    }

    this.linearWidget.setCount(issues.length);
    this.linearWidget.clearItems();

    for (const issue of issues.slice(0, 15)) {
      const dotClass = linearPriorityClass(issue.priority);
      this.linearWidget.addItem({
        title: `${issue.identifier} ${issue.title}`,
        meta: issue.assignee?.name ?? '',
        dotClass,
        statusBadge: issue.status,
        onClick: () => sendToChat(
          `One sentence summary of ${issue.identifier}: "${issue.title}" (${issue.status})`,
        ),
      });
    }
  }

  // ── Visibility ──

  toggle(): void {
    this.visible = !this.visible;

    if (window.innerWidth < 1024) {
      // Mobile / tablet: slide overlay + scrim
      this.el.classList.toggle('force-show', this.visible);
      this.scrim.classList.toggle('visible', this.visible);
    } else {
      // Desktop: inline collapse
      this.el.classList.toggle('collapsed', !this.visible);
    }
  }

  show(): void {
    this.visible = true;
    if (window.innerWidth < 1024) {
      this.el.classList.add('force-show');
      this.scrim.classList.add('visible');
    } else {
      this.el.classList.remove('collapsed');
    }
  }

  hide(): void {
    this.visible = false;
    this.el.classList.remove('force-show');
    this.scrim.classList.remove('visible');
    if (window.innerWidth >= 1024) {
      this.el.classList.add('collapsed');
    }
  }

  destroy(): void {
    this.scrim.remove();
    this.el.remove();
  }
}

// ── Widget section helper ──

interface ItemOptions {
  title: string;
  meta: string;
  dotClass: string;
  statusBadge?: string;
  onClick?: () => void;
}

class WidgetSection {
  readonly el: HTMLDivElement;
  private header: HTMLDivElement;
  private titleEl: HTMLSpanElement;
  private countEl: HTMLSpanElement;
  private body: HTMLDivElement;

  constructor(title: string) {
    this.el = document.createElement('div');
    this.el.className = 'sidebar-widget';

    this.header = document.createElement('div');
    this.header.className = 'sidebar-widget-header';

    this.titleEl = document.createElement('span');
    this.titleEl.className = 'sidebar-widget-title';
    this.titleEl.textContent = title;

    this.countEl = document.createElement('span');
    this.countEl.className = 'sidebar-widget-count';

    this.header.append(this.titleEl, this.countEl);

    this.body = document.createElement('div');
    this.body.className = 'sidebar-widget-body';

    this.el.append(this.header, this.body);
  }

  setLoading(): void {
    this.body.innerHTML = '';
    const skeleton = document.createElement('div');
    skeleton.className = 'sidebar-skeleton';

    const widths = ['w-wide', 'w-med', 'w-narrow'];
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div');
      row.className = 'sidebar-skeleton-row';
      const dot = document.createElement('div');
      dot.className = 'sidebar-skeleton-dot';
      const bar = document.createElement('div');
      bar.className = `sidebar-skeleton-bar ${widths[i]}`;
      row.append(dot, bar);
      skeleton.appendChild(row);
    }

    this.body.appendChild(skeleton);
    this.countEl.textContent = '';
  }

  setEmpty(message: string): void {
    this.body.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent = message;
    this.body.appendChild(empty);
    this.countEl.textContent = '0';
  }

  setCount(n: number): void {
    this.countEl.textContent = String(n);
  }

  clearItems(): void {
    this.body.innerHTML = '';
  }

  addItem(opts: ItemOptions): void {
    const item = document.createElement('div');
    item.className = 'sidebar-item';

    const dot = document.createElement('div');
    dot.className = `sidebar-item-dot ${opts.dotClass}`;

    const content = document.createElement('div');
    content.className = 'sidebar-item-content';

    const title = document.createElement('div');
    title.className = 'sidebar-item-title';
    title.textContent = opts.title;

    content.appendChild(title);

    if (opts.meta) {
      const meta = document.createElement('div');
      meta.className = 'sidebar-item-meta';
      meta.textContent = opts.meta;
      content.appendChild(meta);
    }

    item.append(dot, content);

    if (opts.statusBadge) {
      const badge = document.createElement('span');
      badge.className = 'sidebar-item-status';
      badge.textContent = opts.statusBadge;
      item.appendChild(badge);
    }

    if (opts.onClick) {
      item.addEventListener('click', opts.onClick);
    }

    this.body.appendChild(item);
  }
}

// ── Chat integration ──

function sendToChat(text: string): void {
  eventBus.emit('voice:transcript', { text, isFinal: true });
}

// ── Formatting helpers ──

function formatEventTime(start: Date, end: Date | null): string {
  const now = new Date();
  const dayLabel = formatRelativeDate(start);
  const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (end) {
    const endTime = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    // Same day
    if (start.toDateString() === now.toDateString()) {
      return `Today ${time} - ${endTime}`;
    }
    return `${dayLabel} ${time} - ${endTime}`;
  }

  if (start.toDateString() === now.toDateString()) {
    return `Today ${time}`;
  }
  return `${dayLabel} ${time}`;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff <= 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function linearPriorityClass(priority: number): string {
  switch (priority) {
    case 1: return 'linear-urgent';
    case 2: return 'linear-high';
    case 3: return 'linear-medium';
    case 4: return 'linear-low';
    default: return 'linear-none';
  }
}
