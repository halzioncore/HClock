import { describe, expect, it } from "vitest";
import type { PomodoroSettings } from "../types";
import { nextPomodoroPhase, pomodoroPhaseSeconds } from "./pomodoro";

const settings: PomodoroSettings = {
  focusMinutes: 25,
  focusSeconds: 5,
  shortBreakMinutes: 5,
  shortBreakSeconds: 10,
  longBreakMinutes: 15,
  longBreakSeconds: 30,
  breakSequence: ["short", "short", "long", "short"],
  autoStartBreaks: false,
  autoStartFocus: false,
};

describe("番茄钟阶段", () => {
  it("专注后进入短休息", () => {
    expect(nextPomodoroPhase("focus", 0, ["short", "long"])).toEqual({ phase: "shortBreak", completedFocuses: 1 });
  });

  it("按自定义顺序选择每次专注后的休息", () => {
    const sequence = ["short", "long", "short"] as const;
    expect(nextPomodoroPhase("focus", 1, [...sequence])).toEqual({ phase: "longBreak", completedFocuses: 2 });
    expect(nextPomodoroPhase("focus", 2, [...sequence])).toEqual({ phase: "shortBreak", completedFocuses: 3 });
    expect(nextPomodoroPhase("focus", 4, [...sequence])).toEqual({ phase: "longBreak", completedFocuses: 5 });
  });

  it("休息后回到专注并保留轮数", () => {
    expect(nextPomodoroPhase("shortBreak", 2, ["long"])).toEqual({ phase: "focus", completedFocuses: 2 });
    expect(pomodoroPhaseSeconds(settings, "longBreak")).toBe(930);
  });

  it("将分钟和秒钟合并为阶段时长", () => {
    expect(pomodoroPhaseSeconds(settings, "focus")).toBe(1505);
    expect(pomodoroPhaseSeconds(settings, "shortBreak")).toBe(310);
  });
});
