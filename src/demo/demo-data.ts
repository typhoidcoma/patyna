/**
 * Synthetic fixture data for the P0 demo.
 * getFixture() returns a deep clone so state can be reset trivially.
 */

import type { DemoFixture } from './demo-types.ts';

const FIXTURE: DemoFixture = {
  goals: [
    { id: 'goal-1', title: 'Ship v1.0 landing page', starred: true },
    { id: 'goal-2', title: 'Complete onboarding flow', starred: true },
    { id: 'goal-3', title: 'Launch email campaign', starred: true },
  ],

  tasks: [
    { id: 'task-1', goalId: 'goal-1', title: 'Write hero copy', points: 10, completed: false },
    { id: 'task-2', goalId: 'goal-1', title: 'Design CTA button', points: 5, completed: false },
    { id: 'task-3', goalId: 'goal-2', title: 'Build signup form', points: 15, completed: false },
    { id: 'task-4', goalId: 'goal-2', title: 'Add welcome email', points: 10, completed: false },
    { id: 'task-5', goalId: 'goal-3', title: 'Draft subject lines', points: 5, completed: false },
    { id: 'task-6', goalId: 'goal-3', title: 'Set up A/B test', points: 10, completed: false },
    { id: 'task-7', goalId: 'goal-1', title: 'Review analytics dashboard', points: 10, completed: false },
    { id: 'task-8', goalId: 'goal-1', title: 'Write FAQ section', points: 5, completed: false },
  ],

  schedule: [
    { id: 'sched-1', time: '9:00 AM', title: 'Team standup', type: 'meeting' },
    { id: 'sched-2', time: '10:00 AM', title: 'Deep work block', type: 'focus' },
    { id: 'sched-3', time: '12:00 PM', title: 'Lunch break', type: 'break' },
    { id: 'sched-4', time: '2:00 PM', title: 'Design review', type: 'meeting' },
    { id: 'sched-5', time: '4:00 PM', title: 'Wrap-up & planning', type: 'focus' },
  ],
};

/** Returns a fresh deep clone of the fixture data. */
export function getFixture(): DemoFixture {
  return structuredClone(FIXTURE);
}
