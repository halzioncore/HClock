export type Theme = "system" | "light" | "dark";
export type WidgetLayer = "top" | "normal" | "bottom";
export type IdeaStatus = "inProgress" | "toVerify" | "implemented" | "abandoned" | "paused" | "archived";
export type RecurrenceKind = "every" | "odd" | "even" | "custom";
export type CourseTime =
  | { kind: "slot"; slotId: string }
  | { kind: "custom"; start: string; end: string };

export interface TimeSlot {
  id: string;
  name: string;
  start: string;
  end: string;
  breakAfterMinutes: number;
}

export interface CourseReminder {
  mode: "inherit" | "custom" | "off";
  leadMinutes?: number;
  endEnabled?: boolean;
}

export interface Course {
  id: string;
  title: string;
  teacher: string;
  location: string;
  color: string;
  notes: string;
  weekdays: number[];
  time: CourseTime;
  recurrence: { kind: RecurrenceKind; weeks: number[] };
  reminder: CourseReminder;
}

export interface CourseException {
  id: string;
  courseId: string;
  originalDate: string;
  action: "cancel" | "move";
  newDate?: string;
  newStart?: string;
  newEnd?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  color: string;
  notes: string;
}

export interface Idea {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: IdeaStatus;
  content: string;
  fileName: string;
}

export interface Schedule {
  id: string;
  name: string;
  semesterStart: string;
  semesterEnd: string;
  timeSlots: TimeSlot[];
  courses: Course[];
  exceptions: CourseException[];
}

export interface SoundSetting {
  tone: "clear" | "soft" | "bell";
  volume: number;
}

export interface AppSettings {
  theme: Theme;
  accentColor: string;
  startNotification: boolean;
  endNotification: boolean;
  startLeadMinutes: number;
  autostart: boolean;
  widget: { layer: WidgetLayer; positionLocked: boolean };
  ideaWidget: { layer: WidgetLayer; positionLocked: boolean };
  sounds: {
    classStart: SoundSetting;
    classEnd: SoundSetting;
    pomodoro: SoundSetting;
  };
  lastUpdateCheck?: string;
}

export type PomodoroPhase = "focus" | "shortBreak" | "longBreak";
export type PomodoroBreak = "short" | "long";
export interface PomodoroSettings {
  focusMinutes: number;
  focusSeconds: number;
  shortBreakMinutes: number;
  shortBreakSeconds: number;
  longBreakMinutes: number;
  longBreakSeconds: number;
  breakSequence: PomodoroBreak[];
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export interface PomodoroSession {
  phase: PomodoroPhase;
  status: "idle" | "running" | "paused";
  endsAt?: string;
  remainingSeconds: number;
  completedFocuses: number;
}

export interface AppData {
  schemaVersion: 13;
  activeScheduleId: string | null;
  schedules: Schedule[];
  calendarEvents: CalendarEvent[];
  ideas: Idea[];
  settings: AppSettings;
  pomodoroSettings: PomodoroSettings;
  pomodoroSession: PomodoroSession;
}

export interface Occurrence {
  key: string;
  courseId: string;
  title: string;
  teacher: string;
  location: string;
  color: string;
  notes: string;
  date: string;
  start: string;
  end: string;
  breakAfterMinutes: number;
  moved: boolean;
}

export const createId = () => crypto.randomUUID();

export function createDefaultPomodoroSession(settings: PomodoroSettings): PomodoroSession {
  return {
    phase: "focus",
    status: "idle",
    remainingSeconds: settings.focusMinutes * 60 + settings.focusSeconds,
    completedFocuses: 0,
  };
}
