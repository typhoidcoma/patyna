/**
 * Synthetic fixture data for the LUMINORA demo2.
 * getFixture2() returns a deep clone so state can be reset trivially.
 */

import type { LuminoraFixture } from './demo2-types.ts';

const FIXTURE: LuminoraFixture = {
  username: 'JToeps',

  briefing: {
    dayLabel: 'TUESDAY',
    weekLabel: 'MARCH 30, 2026',
    headline: 'Thesis draft is <em>closer</em> than it feels.',
    sleepHours: 6,
    sleepNote:
      'Two assignments due this week. Office Hours at 3 — go. Prof Kim responds fast.',
    schedule: [
      { id: 'sched-1', time: '10:00', title: 'HIST 340 lecture' },
      { id: 'sched-2', time: '3:00', title: 'Prof Kim office hrs' },
      { id: 'sched-3', time: '7:00', title: 'Intramural soccer' },
    ],
    dueToday: [
      { id: 'due-1', title: 'ECON 210 problem set', completed: false },
      { id: 'due-2', title: 'Read chapters 7-9', completed: false },
      { id: 'due-3', title: 'Email thesis advisor', completed: false },
    ],
  },

  goals: [
    { id: 'goal-1', title: 'Finish & defend my thesis' },
    { id: 'goal-2', title: 'Land a job before May' },
    { id: 'goal-3', title: 'Run a half marathon' },
  ],

  tasks: [],

  habits: [
    {
      id: 'habit-1', emoji: '🏃', name: 'Run',
      linkedGoal: 'Run a half marathon',
      blocksTarget: 6, hoursPerWeek: 3,
      week: [
        { blocks: ['completed'] },                          // MON
        { blocks: ['completed', 'completed'] },             // TUE
        { blocks: ['completed', 'completed', 'completed'] },// WED
        { blocks: ['completed'] },                          // THU
        { blocks: ['completed', 'scheduled'] },             // FRI
        { blocks: ['scheduled', 'scheduled'] },             // SAT
        { blocks: ['future'] },                             // SUN
      ],
    },
    {
      id: 'habit-2', emoji: '✍️', name: 'Thesis writing',
      linkedGoal: 'Finish & defend my the…',
      blocksTarget: 14, hoursPerWeek: 7,
      week: [
        { blocks: ['scheduled', 'scheduled'] },
        { blocks: ['scheduled', 'scheduled', 'scheduled', 'scheduled'] },
        { blocks: ['scheduled', 'scheduled'] },
        { blocks: ['scheduled', 'scheduled', 'scheduled'] },
        { blocks: ['scheduled', 'scheduled'] },
        { blocks: ['future'] },
        { blocks: ['empty'] },
      ],
    },
    {
      id: 'habit-3', emoji: '💼', name: 'Interview prep',
      linkedGoal: 'Land a job before May',
      blocksTarget: 4, hoursPerWeek: 2,
      week: [
        { blocks: ['scheduled', 'scheduled'] },
        { blocks: ['empty'] },
        { blocks: ['completed', 'completed'] },
        { blocks: ['empty'] },
        { blocks: ['empty'] },
        { blocks: ['empty'] },
        { blocks: ['empty'] },
      ],
    },
    {
      id: 'habit-4', emoji: '🎸', name: 'Guitar',
      linkedGoal: '',
      blocksTarget: 4, hoursPerWeek: 2,
      week: [
        { blocks: ['empty'] },
        { blocks: ['completed'] },
        { blocks: ['scheduled'] },
        { blocks: ['empty'] },
        { blocks: ['empty'] },
        { blocks: ['empty'] },
        { blocks: ['empty'] },
      ],
    },
    {
      id: 'habit-5', emoji: '📖', name: 'Reading',
      linkedGoal: '',
      blocksTarget: 7, hoursPerWeek: 3.5,
      week: [
        { blocks: ['scheduled'] },
        { blocks: ['completed'] },
        { blocks: ['scheduled', 'scheduled'] },
        { blocks: ['scheduled'] },
        { blocks: ['scheduled'] },
        { blocks: ['empty'] },
        { blocks: ['empty'] },
      ],
    },
  ],

  vaultFacts: [
    { id: 'fact-1', emoji: '🎸', text: 'Plays <b>guitar</b> in free time' },
    { id: 'fact-2', emoji: '😴', text: 'Usually sleeps around <b>6 hours</b>' },
    { id: 'fact-3', emoji: '🏃', text: 'Training toward a <b>half marathon</b>' },
    { id: 'fact-4', emoji: '📚', text: 'Thesis is on <b>20th century labor movements</b>' },
    { id: 'fact-5', emoji: '🌅', text: "Doesn't start the day before <b>9am</b>" },
    { id: 'fact-6', emoji: '🎵', text: 'Likes the band <b>Radiohead</b>' },
  ],

  pointsToday: 20,
  pointsYesterday: 50,
};

/** Returns a fresh deep clone of the fixture data. */
export function getFixture2(): LuminoraFixture {
  return structuredClone(FIXTURE);
}
