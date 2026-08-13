import { describe, expect, it } from "vitest";
import { createDefaultData } from "../data/defaults";
import { normalizeAppData } from "./bridge";

describe("应用数据升级", () => {
  it("保留版本 13 的关键色、窗口设置、独立日程和想法", () => {
    const data = createDefaultData();
    data.settings.accentColor = "#2474a6";
    data.settings.widget = { layer: "bottom", positionLocked: true };
    data.settings.ideaWidget = { layer: "top", positionLocked: true };
    data.calendarEvents = [{ id: "event", title: "日程", date: "2026-08-11", start: "09:00", end: "10:00", location: "", color: "#2f7d68", notes: "" }];
    data.ideas = [{ id: "idea", title: "一个想法", createdAt: "2026-08-11T09:00:00.000Z", updatedAt: "2026-08-11T09:05:00.000Z", status: "inProgress", content: "记录一下", fileName: "2026-08-11的想法.md" }];
    expect(normalizeAppData(data).settings.widget).toEqual(data.settings.widget);
    expect(normalizeAppData(data).settings.ideaWidget).toEqual(data.settings.ideaWidget);
    expect(normalizeAppData(data).calendarEvents).toEqual(data.calendarEvents);
    expect(normalizeAppData(data).ideas).toEqual(data.ideas);
  });

  it("为版本 8 增加独立日程和想法列表并升级到版本 12", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 8;
    delete legacy.calendarEvents;

    const migrated = normalizeAppData(legacy);

    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.calendarEvents).toEqual([]);
    expect(migrated.ideas).toEqual([]);
    expect(migrated.settings.ideaWidget).toEqual({ layer: "normal", positionLocked: false });
  });

  it("将版本 10 的想法窗口设置升级到版本 12", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 10;
    const settings = legacy.settings as { ideaWidget?: unknown };
    delete settings.ideaWidget;

    const migrated = normalizeAppData(legacy);

    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.settings.ideaWidget).toEqual({ layer: "normal", positionLocked: false });
    expect(migrated.ideas).toEqual([]);
  });

  it("将版本 11 的桌面主题迁移为全局丁香紫关键色", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 11;
    const settings = legacy.settings as Record<string, unknown> & { widget: Record<string, unknown> };
    delete settings.accentColor;
    settings.widget.theme = "night";

    const migrated = normalizeAppData(legacy);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.settings.accentColor).toBe("#76558f");
    expect(migrated.settings.widget).not.toHaveProperty("theme");
  });

  it("版本 13 的非法关键色回退为丁香紫", () => {
    const data = createDefaultData();
    data.settings.accentColor = "not-a-color";
    expect(normalizeAppData(data).settings.accentColor).toBe("#76558f");
  });

  it("将版本 12 的旧出厂番茄钟时长迁移为整分钟", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 12;
    legacy.pomodoroSettings = {
      ...(legacy.pomodoroSettings as Record<string, unknown>),
      focusSeconds: 1,
      shortBreakSeconds: 1,
      longBreakSeconds: 1,
    };
    legacy.pomodoroSession = {
      ...(legacy.pomodoroSession as Record<string, unknown>),
      remainingSeconds: 1501,
    };

    const migrated = normalizeAppData(legacy);

    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.pomodoroSettings).toEqual(expect.objectContaining({
      focusSeconds: 0,
      shortBreakSeconds: 0,
      longBreakSeconds: 0,
    }));
    expect(migrated.pomodoroSession.remainingSeconds).toBe(1500);
  });

  it("迁移版本 12 时保留用户自定义的秒数", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 12;
    legacy.pomodoroSettings = {
      ...(legacy.pomodoroSettings as Record<string, unknown>),
      focusSeconds: 1,
      shortBreakSeconds: 2,
      longBreakSeconds: 3,
    };

    const migrated = normalizeAppData(legacy);

    expect(migrated.pomodoroSettings).toEqual(expect.objectContaining({
      focusSeconds: 1,
      shortBreakSeconds: 2,
      longBreakSeconds: 3,
    }));
  });

  it("兼容版本 6 的旧丁香紫和 Liquid Glass 设置", () => {
    for (const theme of ["lilac", "liquidGlass"]) {
      const legacy = createDefaultData() as unknown as Record<string, unknown>;
      legacy.schemaVersion = 6;
      const settings = legacy.settings as { widget: Record<string, unknown> };
      settings.widget.theme = theme;

      const migrated = normalizeAppData(legacy);
      expect(migrated.schemaVersion).toBe(13);
      expect(migrated.settings.accentColor).toBe("#76558f");
      expect(migrated.settings.widget).not.toHaveProperty("theme");
    }
  });

  it("为版本 2 增加位置锁定设置", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    const settings = legacy.settings as { widget: Record<string, unknown> };
    settings.widget = { layer: "bottom", theme: "paper" };
    const pomodoro = legacy.pomodoroSettings as Record<string, unknown>;
    delete pomodoro.breakSequence;
    pomodoro.cycles = 3;

    const migrated = normalizeAppData(legacy);
    expect(migrated.settings.widget).toEqual({
      layer: "bottom",
      positionLocked: false,
    });
    expect(migrated.pomodoroSettings.breakSequence).toEqual(["short", "short", "long"]);
  });

  it("将旧版置顶开关迁移为三档层级", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    const settings = legacy.settings as { widget: Record<string, unknown> };
    settings.widget = { alwaysOnTop: false };
    const pomodoro = legacy.pomodoroSettings as Record<string, unknown>;
    delete pomodoro.breakSequence;
    pomodoro.cycles = 4;

    expect(normalizeAppData(legacy).settings.widget).toEqual({
      layer: "normal",
      positionLocked: false,
    });
  });

  it("将版本 3 的长休息间隔迁移为逐轮计划", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 3;
    const pomodoro = legacy.pomodoroSettings as Record<string, unknown>;
    delete pomodoro.breakSequence;
    pomodoro.cycles = 2;

    const migrated = normalizeAppData(legacy);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.pomodoroSettings.breakSequence).toEqual(["short", "long"]);
    expect(migrated.settings.widget.positionLocked).toBe(false);
  });

  it("版本 4 升级时保留自定义休息计划", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 4;
    const pomodoro = legacy.pomodoroSettings as Record<string, unknown>;
    pomodoro.breakSequence = ["long", "short", "long"];

    const migrated = normalizeAppData(legacy);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.pomodoroSettings.breakSequence).toEqual(["long", "short", "long"]);
    expect(migrated.pomodoroSettings).toEqual(expect.objectContaining({ focusSeconds: 0, shortBreakSeconds: 0, longBreakSeconds: 0 }));
  });

  it("版本 5 升级时删除透明度并增加秒数", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 5;
    const settings = legacy.settings as { widget: Record<string, unknown> };
    settings.widget.opacity = 0.35;
    const pomodoro = legacy.pomodoroSettings as Record<string, unknown>;
    delete pomodoro.focusSeconds;
    delete pomodoro.shortBreakSeconds;
    delete pomodoro.longBreakSeconds;

    const migrated = normalizeAppData(legacy);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.settings.widget).not.toHaveProperty("opacity");
    expect(migrated.pomodoroSettings).toEqual(expect.objectContaining({ focusSeconds: 0, shortBreakSeconds: 0, longBreakSeconds: 0 }));
  });

  it("将版本 7 的单个上课日迁移为数组", () => {
    const legacy = createDefaultData() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 7;
    const schedules = legacy.schedules as Array<{ courses: Array<Record<string, unknown>>; timeSlots: Array<{ id: string }> }>;
    schedules[0].courses = [{
      id: "course",
      title: "数学",
      teacher: "",
      location: "A101",
      color: "#28745f",
      notes: "",
      weekday: 3,
      time: { kind: "slot", slotId: schedules[0].timeSlots[0].id },
      recurrence: { kind: "every", weeks: [] },
      reminder: { mode: "inherit" },
    }];

    const migrated = normalizeAppData(legacy);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.schedules[0].courses[0].weekdays).toEqual([3]);
    expect(migrated.schedules[0].courses[0]).not.toHaveProperty("weekday");
  });
});
