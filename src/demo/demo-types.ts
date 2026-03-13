/**
 * Data types for the P0 demo dashboard.
 */

export interface DemoGoal {
  id: string;
  title: string;
  starred: boolean;
}

export interface DemoTask {
  id: string;
  goalId: string;
  title: string;
  points: number;
  completed: boolean;
}

export interface ScheduleItem {
  id: string;
  time: string;       // e.g. "9:00 AM"
  title: string;
  type: 'meeting' | 'focus' | 'break';
}

export interface DemoFixture {
  goals: DemoGoal[];
  tasks: DemoTask[];
  schedule: ScheduleItem[];
}
