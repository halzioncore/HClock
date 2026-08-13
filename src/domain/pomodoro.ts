import type { PomodoroBreak, PomodoroPhase, PomodoroSettings } from "../types";

export function pomodoroPhaseSeconds(settings: PomodoroSettings, phase: PomodoroPhase) {
  if (phase === "focus") return settings.focusMinutes * 60 + settings.focusSeconds;
  if (phase === "shortBreak") return settings.shortBreakMinutes * 60 + settings.shortBreakSeconds;
  return settings.longBreakMinutes * 60 + settings.longBreakSeconds;
}

export function nextPomodoroPhase(
  current: PomodoroPhase,
  completedFocuses: number,
  breakSequence: PomodoroBreak[],
): { phase: PomodoroPhase; completedFocuses: number } {
  const completed = completedFocuses + (current === "focus" ? 1 : 0);
  if (current !== "focus") return { phase: "focus", completedFocuses: completed };
  const breakType = breakSequence[(completed - 1) % breakSequence.length] ?? "short";
  return {
    phase: breakType === "long" ? "longBreak" : "shortBreak",
    completedFocuses: completed,
  };
}
