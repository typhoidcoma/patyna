/**
 * DailyBriefing — left column card showing day info, schedule, and due items.
 */

import type { DailyBriefing as BriefingData } from '../demo2-types.ts';

export class DailyBriefing {
  readonly el: HTMLDivElement;
  private dueItems: Map<string, HTMLDivElement> = new Map();
  onDueTodayToggle?: (itemId: string, completed: boolean) => void;
  onScheduleHeaderClick?: () => void;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'lum-briefing';
  }

  setData(data: BriefingData): void {
    this.el.innerHTML = '';
    this.dueItems.clear();

    // Day/week pill
    const pill = document.createElement('div');
    pill.className = 'lum-briefing-pill';
    pill.textContent = `${data.dayLabel} · ${data.weekLabel}`;
    this.el.appendChild(pill);

    // Headline
    const headline = document.createElement('div');
    headline.className = 'lum-briefing-headline';
    headline.innerHTML = data.headline;
    this.el.appendChild(headline);

    // Sleep summary
    const sleep = document.createElement('div');
    sleep.className = 'lum-briefing-sleep';
    sleep.innerHTML = `You slept <b>${data.sleepHours} hrs.</b> ${data.sleepNote}`;
    this.el.appendChild(sleep);

    // Note
    const note = document.createElement('div');
    note.className = 'lum-briefing-note';
    note.textContent = '…one paragraph before lecture.';
    this.el.appendChild(note);

    // Schedule
    const schedHeader = document.createElement('div');
    schedHeader.className = 'lum-schedule-header';

    const schedLabel = document.createElement('span');
    schedLabel.textContent = 'SCHEDULE';
    schedHeader.style.cursor = 'pointer';
    schedHeader.addEventListener('click', () => this.onScheduleHeaderClick?.());

    const schedAvatar = document.createElement('div');
    schedAvatar.className = 'lum-schedule-avatar';
    schedAvatar.textContent = '🦋';

    schedHeader.append(schedLabel, schedAvatar);
    this.el.appendChild(schedHeader);

    const schedList = document.createElement('div');
    schedList.className = 'lum-schedule-list';

    for (const item of data.schedule) {
      const row = document.createElement('div');
      row.className = 'lum-schedule-item';

      const time = document.createElement('span');
      time.className = 'lum-schedule-time';
      time.textContent = item.time;

      const title = document.createElement('span');
      title.className = 'lum-schedule-title';
      title.textContent = item.title;

      row.append(time, title);
      schedList.appendChild(row);
    }
    this.el.appendChild(schedList);

    // Due Today
    const dueHeader = document.createElement('div');
    dueHeader.className = 'lum-due-header';
    dueHeader.textContent = 'DUE TODAY';
    this.el.appendChild(dueHeader);

    const dueList = document.createElement('div');
    dueList.className = 'lum-due-list';

    for (const item of data.dueToday) {
      const row = document.createElement('div');
      row.className = 'lum-due-item';
      if (item.completed) row.classList.add('completed');

      const check = document.createElement('button');
      check.className = 'lum-due-check';
      if (item.completed) {
        check.classList.add('checked');
        check.textContent = '✓';
      }

      const label = document.createElement('span');
      label.textContent = item.title;

      check.addEventListener('click', () => {
        if (item.completed) return;
        item.completed = true;
        check.classList.add('checked');
        check.textContent = '✓';
        row.classList.add('completed');
        this.onDueTodayToggle?.(item.id, true);
      });

      row.append(check, label);
      dueList.appendChild(row);
      this.dueItems.set(item.id, row);
    }
    this.el.appendChild(dueList);
  }

  /** Mark a due-today item as completed by title match (for cross-panel sync). */
  markDueTodayByTitle(title: string): void {
    for (const [, row] of this.dueItems) {
      const label = row.querySelector('span');
      if (!label || row.classList.contains('completed')) continue;
      if (label.textContent === title) {
        row.classList.add('completed');
        const check = row.querySelector('.lum-due-check');
        if (check) {
          check.classList.add('checked');
          check.textContent = '✓';
        }
        break;
      }
    }
  }
}
