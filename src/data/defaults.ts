import { addDays, startOfWeek, toDateKey } from "../domain/schedule";
import type { AppData, TimeSlot } from "../types";
import { createId } from "../types";

export function createDefaultData(): AppData {
  const start = startOfWeek(new Date());
  const scheduleId = createId();
  const definitions: Array<[string, string, string, number]> = [
    ["第 1 节", "08:00", "08:45", 10], ["第 2 节", "08:55", "09:40", 20],
    ["第 3 节", "10:00", "10:45", 10], ["第 4 节", "10:55", "11:40", 80],
    ["第 5 节", "13:00", "13:45", 10], ["第 6 节", "13:55", "14:40", 20],
    ["第 7 节", "15:00", "15:45", 10], ["第 8 节", "15:55", "16:40", 0],
  ];
  const timeSlots: TimeSlot[] = definitions.map(([name, slotStart, end, rest]) => ({ id: createId(), name, start: slotStart, end, breakAfterMinutes: rest }));
  return {
    schemaVersion: 13,
    activeScheduleId: scheduleId,
    schedules: [{ id: scheduleId, name: "我的课表", semesterStart: toDateKey(start), semesterEnd: toDateKey(addDays(start, 139)), timeSlots, courses: [], exceptions: [] }],
    calendarEvents: [],
    ideas: [],
    settings: {
      theme: "system", accentColor: "#76558f", startNotification: true, endNotification: true, startLeadMinutes: 5, autostart: false,
      widget: { layer: "top", positionLocked: false },
      ideaWidget: { layer: "normal", positionLocked: false },
      sounds: { classStart: { tone: "clear", volume: 0.65 }, classEnd: { tone: "soft", volume: 0.55 }, pomodoro: { tone: "bell", volume: 0.65 } },
    },
    pomodoroSettings: { focusMinutes: 25, focusSeconds: 0, shortBreakMinutes: 5, shortBreakSeconds: 0, longBreakMinutes: 15, longBreakSeconds: 0, breakSequence: ["short", "short", "short", "long"], autoStartBreaks: false, autoStartFocus: false },
    pomodoroSession: { phase: "focus", status: "idle", remainingSeconds: 1500, completedFocuses: 0 },
  };
}
