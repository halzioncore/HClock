import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { AppData, CalendarEvent, Course, Idea, PomodoroBreak, PomodoroSettings, Schedule, SoundSetting, WidgetLayer } from "../types";
import { createDefaultData } from "../data/defaults";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

function breakSequenceFromCycles(value: unknown): PomodoroBreak[] {
  const cycles = typeof value === "number" && Number.isInteger(value) ? Math.max(1, Math.min(12, value)) : 4;
  return Array.from({ length: cycles }, (_, index) => index === cycles - 1 ? "long" : "short");
}

function normalizeAccentColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#76558f";
}

type LegacyCourse = Omit<Course, "weekdays"> & { weekday?: number; weekdays?: number[] };
type LegacySchedule = Omit<Schedule, "courses"> & { courses: LegacyCourse[] };
type LegacySettings = Omit<AppData["settings"], "widget" | "ideaWidget" | "accentColor"> & {
  accentColor?: string;
  widget: AppData["settings"]["widget"] & {
    theme?: "classic" | "day" | "night" | "paper" | "midnight" | "liquidGlass" | "lilac";
    alwaysOnTop?: boolean;
    opacity?: number;
  };
  ideaWidget?: Partial<AppData["settings"]["ideaWidget"]>;
};

export function normalizeAppData(value: unknown): AppData {
  const data = value as Omit<AppData, "schemaVersion" | "settings" | "schedules"> & {
    schemaVersion: number;
    schedules: LegacySchedule[];
    settings: LegacySettings;
  };
  if (data?.schemaVersion === 13) {
    const widget = data.settings.widget;
    return {
      ...data,
      ideas: Array.isArray((data as { ideas?: Idea[] }).ideas) ? (data as { ideas: Idea[] }).ideas : [],
      settings: {
        ...data.settings,
        accentColor: normalizeAccentColor(data.settings.accentColor),
        widget: {
          layer: widget.layer,
          positionLocked: widget.positionLocked,
        },
        ideaWidget: {
          layer: data.settings.ideaWidget?.layer ?? "normal",
          positionLocked: data.settings.ideaWidget?.positionLocked ?? false,
        },
      },
    } as AppData;
  }
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(data?.schemaVersion) || !data.settings?.widget || !data.pomodoroSettings || !Array.isArray(data.schedules)) throw new Error("不支持的数据版本");
  const oldPomodoroSettings = data.pomodoroSettings as unknown as Omit<PomodoroSettings, "focusSeconds" | "shortBreakSeconds" | "longBreakSeconds" | "breakSequence"> & { cycles?: number; breakSequence?: PomodoroBreak[] };
  const hadLegacyDefaultDurations = data.schemaVersion >= 6
    && data.pomodoroSettings.focusMinutes === 25
    && data.pomodoroSettings.focusSeconds === 1
    && data.pomodoroSettings.shortBreakMinutes === 5
    && data.pomodoroSettings.shortBreakSeconds === 1
    && data.pomodoroSettings.longBreakMinutes === 15
    && data.pomodoroSettings.longBreakSeconds === 1;
  const pomodoroSettings: PomodoroSettings = data.schemaVersion >= 6
    ? hadLegacyDefaultDurations
      ? { ...data.pomodoroSettings, focusSeconds: 0, shortBreakSeconds: 0, longBreakSeconds: 0 }
      : data.pomodoroSettings
    : {
        focusMinutes: oldPomodoroSettings.focusMinutes,
        focusSeconds: 0,
        shortBreakMinutes: oldPomodoroSettings.shortBreakMinutes,
        shortBreakSeconds: 0,
        longBreakMinutes: oldPomodoroSettings.longBreakMinutes,
        longBreakSeconds: 0,
        breakSequence: oldPomodoroSettings.breakSequence ?? breakSequenceFromCycles(oldPomodoroSettings.cycles),
        autoStartBreaks: oldPomodoroSettings.autoStartBreaks,
        autoStartFocus: oldPomodoroSettings.autoStartFocus,
      };
  const schedules: Schedule[] = data.schedules.map((schedule) => ({
    ...schedule,
    courses: schedule.courses.map((course) => {
      const { weekday, ...rest } = course;
      const sourceWeekdays = course.weekdays ?? (typeof weekday === "number" ? [weekday] : []);
      const weekdays = [...new Set(sourceWeekdays)];
      if (weekdays.length === 0 || weekdays.some((item) => !Number.isInteger(item) || item < 1 || item > 7)) {
        throw new Error("课程上课日无效");
      }
      return { ...rest, weekdays: weekdays.sort((a, b) => a - b) };
    }),
  }));
  return {
    ...data,
    schemaVersion: 13,
    schedules,
    calendarEvents: Array.isArray((data as { calendarEvents?: CalendarEvent[] }).calendarEvents)
      ? (data as { calendarEvents: CalendarEvent[] }).calendarEvents
      : [],
    ideas: Array.isArray((data as { ideas?: Idea[] }).ideas) ? (data as { ideas: Idea[] }).ideas : [],
    settings: {
      ...data.settings,
      accentColor: normalizeAccentColor(data.settings.accentColor),
      widget: {
        layer: data.schemaVersion === 1
          ? data.settings.widget.alwaysOnTop === false ? "normal" : "top"
          : data.settings.widget.layer,
        positionLocked: data.schemaVersion >= 3 ? data.settings.widget.positionLocked : false,
      },
      ideaWidget: {
        layer: data.settings.ideaWidget?.layer ?? "normal",
        positionLocked: data.settings.ideaWidget?.positionLocked ?? false,
      },
    },
    pomodoroSettings,
    pomodoroSession: hadLegacyDefaultDurations
      && data.pomodoroSession.status === "idle"
      && data.pomodoroSession.phase === "focus"
      && data.pomodoroSession.remainingSeconds === 1501
      ? { ...data.pomodoroSession, remainingSeconds: 1500 }
      : data.pomodoroSession,
  };
}

export async function loadState(): Promise<AppData> {
  if (isTauri()) return normalizeAppData(await invoke<unknown>("load_state"));
  const value = localStorage.getItem("hclock-preview-state");
  if (!value) return createDefaultData();
  return normalizeAppData(JSON.parse(value));
}

export async function saveState(data: AppData): Promise<void> {
  if (isTauri()) await invoke("save_state", { data });
  else localStorage.setItem("hclock-preview-state", JSON.stringify(data));
}

export async function showMain(): Promise<void> {
  if (isTauri()) await invoke("show_main");
}

export async function setWidgetVisible(visible: boolean): Promise<void> {
  if (isTauri()) await invoke("set_widget_visible", { visible });
}

export async function setWidgetLayer(layer: WidgetLayer): Promise<void> {
  if (isTauri()) await invoke("set_widget_layer", { layer });
}

export async function setIdeaLayer(layer: WidgetLayer): Promise<void> {
  if (isTauri()) await invoke("set_idea_layer", { layer });
}

export async function showIdea(ideaId?: string): Promise<void> {
  if (isTauri()) {
    await invoke("show_idea", { ideaId: ideaId ?? null });
  } else {
    const query = ideaId ? `?view=idea&ideaId=${encodeURIComponent(ideaId)}` : "?view=idea";
    window.open(query, "hclock-idea", "popup,width=720,height=680");
  }
}

export async function consumeIdeaOpenRequest(): Promise<string | null> {
  return isTauri() ? invoke<string | null>("consume_idea_open_request") : null;
}

export async function setIdeaVisible(visible: boolean): Promise<void> {
  if (isTauri()) await invoke("set_idea_visible", { visible });
}

export async function syncAutostart(value: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("set_autostart", { enabled: value });
}

export async function currentAutostart(): Promise<boolean> {
  return isTauri() ? invoke<boolean>("is_autostart_enabled") : false;
}

export async function ensureNotifications(): Promise<boolean> {
  if (!isTauri()) return true;
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

export async function notify(title: string, body: string): Promise<void> {
  if (isTauri() && (await ensureNotifications())) sendNotification({ title, body });
}

export async function exportBackup(): Promise<boolean> {
  if (!isTauri()) return false;
  const path = await save({
    title: "导出 HClock 备份",
    defaultPath: `HClock-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON 备份", extensions: ["json"] }],
  });
  if (!path) return false;
  await invoke("export_backup", { path });
  return true;
}

export async function importBackup(): Promise<AppData | null> {
  if (!isTauri()) return null;
  const path = await open({
    title: "导入 HClock 备份",
    multiple: false,
    filters: [{ name: "JSON 备份", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return null;
  return invoke<AppData>("import_backup", { path });
}

export function playTone(setting: SoundSetting): void {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = Math.max(0, Math.min(1, setting.volume));
  gain.connect(context.destination);
  const frequencies =
    setting.tone === "bell" ? [659, 880, 1047] : setting.tone === "soft" ? [440, 554] : [784, 1047];
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const noteGain = context.createGain();
    const start = context.currentTime + index * 0.16;
    oscillator.frequency.value = frequency;
    oscillator.type = setting.tone === "soft" ? "sine" : "triangle";
    noteGain.gain.setValueAtTime(0.0001, start);
    noteGain.gain.exponentialRampToValueAtTime(0.7, start + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    oscillator.connect(noteGain);
    noteGain.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + 0.36);
  });
  window.setTimeout(() => void context.close(), 1200);
}
