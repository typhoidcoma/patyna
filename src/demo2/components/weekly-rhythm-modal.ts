/**
 * WeeklyRhythmModal — habit tracker grid overlay.
 */

import type { Habit, HabitBlockStatus } from '../demo2-types.ts';
import { ModalManager } from './modal-manager.ts';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export class WeeklyRhythmModal {
  private modal: ModalManager;

  constructor(modal: ModalManager) {
    this.modal = modal;
  }

  open(habits: Habit[]): void {
    const el = document.createElement('div');
    el.className = 'lum-rhythm';

    // Header
    const header = document.createElement('div');
    header.className = 'lum-rhythm-header';

    const icon = document.createElement('span');
    icon.className = 'lum-rhythm-icon';
    icon.textContent = '📅';

    const title = document.createElement('span');
    title.className = 'lum-rhythm-title';
    title.textContent = 'Weekly Rhythm';

    const subtitle = document.createElement('span');
    subtitle.className = 'lum-rhythm-subtitle';
    subtitle.textContent = 'Each block = 30 min · tied to your goals';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lum-rhythm-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.modal.close());

    header.append(icon, title, subtitle, closeBtn);
    el.appendChild(header);

    // Table
    const table = document.createElement('table');
    table.className = 'lum-rhythm-table';

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const habitTh = document.createElement('th');
    habitTh.textContent = 'HABIT';
    headerRow.appendChild(habitTh);

    for (const day of DAYS) {
      const th = document.createElement('th');
      th.textContent = day;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body rows
    const tbody = document.createElement('tbody');

    for (const habit of habits) {
      const tr = document.createElement('tr');

      // Habit info cell
      const infoTd = document.createElement('td');
      const info = document.createElement('div');
      info.className = 'lum-habit-info';

      const name = document.createElement('div');
      name.className = 'lum-habit-name';
      name.innerHTML = `<span>${habit.emoji}</span> ${habit.name}`;

      info.appendChild(name);

      if (habit.linkedGoal) {
        const goal = document.createElement('div');
        goal.className = 'lum-habit-goal';
        goal.textContent = `→ ${habit.linkedGoal}`;
        info.appendChild(goal);
      }

      const stats = document.createElement('div');
      stats.className = 'lum-habit-stats';
      stats.textContent = `${habit.blocksTarget} blk · ${habit.hoursPerWeek} hrs/wk`;
      info.appendChild(stats);

      infoTd.appendChild(info);
      tr.appendChild(infoTd);

      // Day cells
      for (let d = 0; d < 7; d++) {
        const td = document.createElement('td');
        const cell = document.createElement('div');
        cell.className = 'lum-habit-cell';

        const dayData = habit.week[d];
        if (dayData && dayData.blocks.length > 0) {
          for (const status of dayData.blocks) {
            const dot = this.createDot(status);
            cell.appendChild(dot);
          }
        }

        // Always add an "add" button
        const addDot = this.createDot('empty');
        addDot.classList.add('lum-habit-dot--add');
        addDot.textContent = '+';
        cell.appendChild(addDot);

        td.appendChild(cell);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    // Footer row — blocks per day
    const footerTr = document.createElement('tr');
    footerTr.className = 'lum-rhythm-footer';

    const footerLabel = document.createElement('td');
    footerLabel.textContent = 'Blocks / day';
    footerTr.appendChild(footerLabel);

    for (let d = 0; d < 7; d++) {
      const td = document.createElement('td');
      let totalBlocks = 0;
      for (const habit of habits) {
        const dayData = habit.week[d];
        if (dayData) {
          totalBlocks += dayData.blocks.filter(b => b !== 'empty').length;
        }
      }
      const hours = (totalBlocks * 0.5).toFixed(1);
      td.textContent = `${totalBlocks} blk · ${hours}h`;
      footerTr.appendChild(td);
    }

    tbody.appendChild(footerTr);
    table.appendChild(tbody);
    el.appendChild(table);

    // Add Habit button
    const addHabit = document.createElement('div');
    addHabit.className = 'lum-rhythm-add';
    addHabit.textContent = '+ Add Habit';
    el.appendChild(addHabit);

    this.modal.open(el);
  }

  private createDot(status: HabitBlockStatus): HTMLDivElement {
    const dot = document.createElement('div');
    dot.className = `lum-habit-dot lum-habit-dot--${status}`;
    return dot;
  }
}
