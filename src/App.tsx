import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, Lightbulb, LayoutGrid, Settings, TimerReset } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SchedulePage } from "./components/SchedulePage";
import { CalendarPage } from "./components/CalendarPage";
import { PomodoroPage } from "./components/PomodoroPage";
import { SettingsPage } from "./components/SettingsPage";
import { Widget } from "./components/Widget";
import { IdeasPage } from "./components/IdeasPage";
import { IdeaDraftWindow } from "./components/IdeaDraftWindow";
import { nextOccurrences } from "./domain/schedule";
import { isTauri, loadState, notify, playTone, saveState } from "./services/bridge";
import type { AppData, SoundSetting } from "./types";
import { APP_TAG } from "./version";
import "./App.css";

type Page = "schedule" | "calendar" | "pomodoro" | "ideas" | "settings";

function contrastColor(hex: string) {
  const weights = [0.2126, 0.7152, 0.0722];
  const luminance = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
    .reduce((sum, channel, index) => sum + Number.parseInt(channel, 16) * weights[index], 0);
  return luminance > 155 ? "#171519" : "#ffffff";
}

function lightenColor(hex: string, whiteRatio: number) {
  const channel = (offset: number) => Math.round(Number.parseInt(hex.slice(offset, offset + 2), 16) * (1 - whiteRatio) + 255 * whiteRatio);
  return `#${[channel(1), channel(3), channel(5)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [page, setPage] = useState<Page>("schedule");
  const [error, setError] = useState("");
  const skipNextSave = useRef(false);
  const view = new URLSearchParams(window.location.search).get("view");
  const isWidget = view === "widget";
  const isIdea = view === "idea";

  useEffect(() => {
    void loadState().then(setData).catch((reason) => setError(`读取数据失败：${String(reason)}`));
  }, []);

  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.style.setProperty("--key-color", data.settings.accentColor);
    document.documentElement.style.setProperty("--key-contrast", contrastColor(data.settings.accentColor));
    document.documentElement.style.setProperty("--key-contrast-dark", contrastColor(lightenColor(data.settings.accentColor, 0.38)));
    if (isTauri() && !isWidget) {
      const windowTheme = data.settings.theme === "system" ? null : data.settings.theme;
      void getCurrentWindow().setTheme(windowTheme).catch((reason) => setError(`窗口主题切换失败：${String(reason)}`));
    }
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void saveState(data).catch((reason) => setError(`保存失败：${String(reason)}`));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<AppData>("state-updated", ({ payload }) => {
      skipNextSave.current = true;
      setData(payload);
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isTauri() || isWidget || isIdea) return;
    let unlisten: (() => void) | undefined;
    void listen<{ setting: SoundSetting }>("play-sound", ({ payload }) => playTone(payload.setting)).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [isWidget, isIdea]);

  useEffect(() => {
    if (!data || isWidget || isIdea) return;
    const repository = import.meta.env.VITE_GITHUB_REPOSITORY as string | undefined;
    const lastCheck = data.settings.lastUpdateCheck ? new Date(data.settings.lastUpdateCheck).getTime() : 0;
    if (!repository || Date.now() - lastCheck < 86_400_000) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    void fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(String(response.status));
      const release = await response.json() as { tag_name?: string };
      setData((current) => current ? { ...current, settings: { ...current.settings, lastUpdateCheck: new Date().toISOString() } } : current);
      if (release.tag_name && release.tag_name !== APP_TAG) {
        await notify("HClock 有新版本", `${release.tag_name} 已发布，可在设置中查看。`);
      }
    }).catch(() => undefined).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [data?.settings.lastUpdateCheck, isWidget, isIdea]);

  if (!data) {
    return <div className="loading-screen"><div className="brand-mark">HC</div><span>{error || "正在读取课表…"}</span></div>;
  }

  if (isWidget) return <Widget data={data} onChange={setData} />;
  if (isIdea) return <IdeaDraftWindow data={data} onChange={setData} />;

  return (
    <div className="app-shell">
      <Sidebar data={data} page={page} onPage={setPage} />
      <main className="main-content">
        {error && <button className="app-error" onClick={() => setError("")}>{error}</button>}
        {page === "schedule" && <SchedulePage data={data} onChange={setData} />}
        {page === "calendar" && <CalendarPage data={data} onChange={setData} />}
        {page === "pomodoro" && <PomodoroPage data={data} onChange={setData} />}
        {page === "ideas" && <IdeasPage data={data} onChange={setData} />}
        {page === "settings" && <SettingsPage data={data} onChange={setData} />}
      </main>
    </div>
  );
}

function Sidebar({ data, page, onPage }: { data: AppData; page: Page; onPage: (page: Page) => void }) {
  const schedule = data.schedules.find((item) => item.id === data.activeScheduleId);
  const next = useMemo(() => schedule ? nextOccurrences(schedule, new Date(), 14)[0] : undefined, [schedule]);
  const nav: Array<{ id: Page; label: string; icon: typeof CalendarDays }> = [
    { id: "schedule", label: "课程表", icon: CalendarDays },
    { id: "calendar", label: "月历", icon: LayoutGrid },
    { id: "pomodoro", label: "番茄钟", icon: TimerReset },
    { id: "ideas", label: "想法草稿纸", icon: Lightbulb },
    { id: "settings", label: "设置", icon: Settings },
  ];
  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">HC</div><div><strong>HClock</strong><span>懂我心意</span></div></div>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => onPage(item.id)}><Icon size={19} /><span>{item.label}</span></button>; })}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-next">
        <span><Clock3 size={14} />下一节课</span>
        {next ? <><strong>{next.title}</strong><small>{next.date} · {next.start}</small><em>{next.location || "未设置地点"}</em></> : <small>近期没有课程</small>}
      </div>
      <div className="sidebar-footer">{APP_TAG}</div>
    </aside>
  );
}

export default App;
