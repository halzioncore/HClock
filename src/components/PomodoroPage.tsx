import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { dateTime, nextOccurrences } from "../domain/schedule";
import { nextPomodoroPhase, pomodoroPhaseSeconds } from "../domain/pomodoro";
import { notify, playTone } from "../services/bridge";
import type { AppData, PomodoroBreak, PomodoroPhase, PomodoroSession } from "../types";

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
}

const PHASE_NAMES: Record<PomodoroPhase, string> = {
  focus: "专注",
  shortBreak: "短休息",
  longBreak: "长休息",
};

export function PomodoroPage({ data, onChange }: Props) {
  const [now, setNow] = useState(Date.now());
  const session = data.pomodoroSession;
  const settings = data.pomodoroSettings;
  const remaining = session.status === "running" && session.endsAt
    ? Math.min(session.remainingSeconds, Math.max(0, Math.ceil((new Date(session.endsAt).getTime() - now) / 1000)))
    : session.remainingSeconds;

  const updateSession = (next: PomodoroSession) => onChange({ ...data, pomodoroSession: next });

  const advancePhase = () => {
    const transition = nextPomodoroPhase(session.phase, session.completedFocuses, settings.breakSequence);
    const nextPhase = transition.phase;
    const autoStart = nextPhase === "focus" ? settings.autoStartFocus : settings.autoStartBreaks;
    const duration = pomodoroPhaseSeconds(settings, nextPhase);
    const next: PomodoroSession = {
      phase: nextPhase,
      status: autoStart ? "running" : "paused",
      endsAt: autoStart ? new Date(Date.now() + duration * 1000).toISOString() : undefined,
      remainingSeconds: duration,
      completedFocuses: transition.completedFocuses,
    };
    updateSession(next);
    void notify("番茄钟阶段完成", `下一阶段：${PHASE_NAMES[nextPhase]}`);
    playTone(data.settings.sounds.pomodoro);
  };

  useEffect(() => {
    if (session.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [session.status]);

  useEffect(() => {
    if (session.status === "running" && session.endsAt && new Date(session.endsAt).getTime() <= now) {
      advancePhase();
    }
  // advancePhase intentionally uses the latest persisted session when the timestamp expires.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, session.endsAt, session.status]);

  const total = pomodoroPhaseSeconds(settings, session.phase);
  const progress = Math.max(0, Math.min(1, 1 - remaining / total));
  const display = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const activeSchedule = data.schedules.find((item) => item.id === data.activeScheduleId);
  const upcoming = useMemo(() => activeSchedule ? nextOccurrences(activeSchedule, new Date(), 2)[0] : undefined, [activeSchedule, now]);

  const start = () => {
    if (session.phase === "focus" && upcoming) {
      const courseStarts = dateTime(upcoming.date, upcoming.start).getTime();
      const timerEnds = Date.now() + remaining * 1000;
      if (courseStarts > Date.now() && courseStarts < timerEnds) {
        const proceed = confirm(`本轮专注预计在 ${new Date(timerEnds).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 结束，但“${upcoming.title}”将在 ${upcoming.start} 开始。\n\n仍要开始吗？`);
        if (!proceed) return;
      }
    }
    updateSession({ ...session, status: "running", endsAt: new Date(Date.now() + remaining * 1000).toISOString() });
  };

  const pause = () => updateSession({ ...session, status: "paused", endsAt: undefined, remainingSeconds: remaining });
  const reset = () => updateSession({ phase: "focus", status: "idle", remainingSeconds: pomodoroPhaseSeconds(settings, "focus"), completedFocuses: 0 });

  const updateFocusDuration = (minutes: number, seconds: number) => {
    const pomodoroSettings = { ...settings, focusMinutes: minutes, focusSeconds: seconds };
    onChange({
      ...data,
      pomodoroSettings,
      pomodoroSession: session.status === "idle"
        ? { ...session, remainingSeconds: pomodoroPhaseSeconds(pomodoroSettings, "focus") }
        : session,
    });
  };

  return (
    <div className="page pomodoro-page">
      <header className="page-header"><div><span className="eyebrow">番茄钟</span><h1>把注意力留给当下</h1></div></header>
      <div className="pomodoro-layout">
        <section className="timer-stage">
          <div className="timer-ring" style={{ "--timer-progress": `${progress * 360}deg` } as React.CSSProperties}>
            <div className="timer-ring-inner">
              <span>{PHASE_NAMES[session.phase]}</span>
              <strong>{display}</strong>
              <small>已完成 {session.completedFocuses} 次专注</small>
            </div>
          </div>
          <div className="timer-controls">
            <button className="icon-button large" title="重置" onClick={reset}><RotateCcw size={20} /></button>
            {session.status === "running" ? (
              <button className="timer-primary" title="暂停" onClick={pause}><Pause size={26} /></button>
            ) : (
              <button className="timer-primary" title="开始" onClick={start}><Play size={26} fill="currentColor" /></button>
            )}
            <button className="icon-button large" title="跳到下一阶段" onClick={advancePhase}><SkipForward size={20} /></button>
          </div>
        </section>

        <section className="timer-settings">
          <h2>计时设置</h2>
          <div className="setting-list compact">
            <DurationSetting label="专注" minutes={settings.focusMinutes} seconds={settings.focusSeconds} maxMinutes={180} onChange={updateFocusDuration} />
            <DurationSetting label="短休息" minutes={settings.shortBreakMinutes} seconds={settings.shortBreakSeconds} maxMinutes={60} onChange={(minutes, seconds) => onChange({ ...data, pomodoroSettings: { ...settings, shortBreakMinutes: minutes, shortBreakSeconds: seconds } })} />
            <DurationSetting label="长休息" minutes={settings.longBreakMinutes} seconds={settings.longBreakSeconds} maxMinutes={120} onChange={(minutes, seconds) => onChange({ ...data, pomodoroSettings: { ...settings, longBreakMinutes: minutes, longBreakSeconds: seconds } })} />
          </div>
          <div className="break-plan">
            <div className="break-plan-heading"><div><strong>专注后的休息</strong><small>完成全部轮次后循环</small></div><button className="icon-button" title="增加一轮" disabled={settings.breakSequence.length >= 12} onClick={() => onChange({ ...data, pomodoroSettings: { ...settings, breakSequence: [...settings.breakSequence, "short"] } })}><Plus size={16} /></button></div>
            <div className="break-plan-list">
              {settings.breakSequence.map((breakType, index) => <BreakPlanRow key={index} index={index} value={breakType} canDelete={settings.breakSequence.length > 1} onChange={(value) => onChange({ ...data, pomodoroSettings: { ...settings, breakSequence: settings.breakSequence.map((item, itemIndex) => itemIndex === index ? value : item) } })} onDelete={() => onChange({ ...data, pomodoroSettings: { ...settings, breakSequence: settings.breakSequence.filter((_, itemIndex) => itemIndex !== index) } })} />)}
            </div>
          </div>
          <label className="toggle-row"><span><strong>自动开始休息</strong><small>专注结束后直接计时</small></span><input type="checkbox" checked={settings.autoStartBreaks} onChange={(e) => onChange({ ...data, pomodoroSettings: { ...settings, autoStartBreaks: e.target.checked } })} /></label>
          <label className="toggle-row"><span><strong>自动开始专注</strong><small>休息结束后直接计时</small></span><input type="checkbox" checked={settings.autoStartFocus} onChange={(e) => onChange({ ...data, pomodoroSettings: { ...settings, autoStartFocus: e.target.checked } })} /></label>
          {upcoming && <div className="next-course-note"><span>下一节课</span><strong>{upcoming.title}</strong><small>{upcoming.date} {upcoming.start}</small></div>}
        </section>
      </div>
    </div>
  );
}

function DurationSetting({ label, minutes, seconds, maxMinutes, onChange }: { label: string; minutes: number; seconds: number; maxMinutes: number; onChange: (minutes: number, seconds: number) => void }) {
  const changeMinutes = (value: number) => {
    const nextMinutes = Math.max(0, Math.min(maxMinutes, value));
    onChange(nextMinutes === 0 && seconds === 0 ? 1 : nextMinutes, seconds);
  };
  const changeSeconds = (value: number) => {
    const nextSeconds = Math.max(0, Math.min(59, value));
    onChange(minutes, minutes === 0 && nextSeconds === 0 ? 1 : nextSeconds);
  };
  return <div className="number-setting duration-setting"><span>{label}</span><span className="duration-fields"><label><input aria-label={`${label}分钟`} type="number" value={minutes} min="0" max={maxMinutes} onChange={(e) => changeMinutes(Number(e.target.value))} /><span>分钟</span></label><label><input aria-label={`${label}秒钟`} type="number" value={seconds} min="0" max="59" onChange={(e) => changeSeconds(Number(e.target.value))} /><span>秒</span></label></span></div>;
}

function BreakPlanRow({ index, value, canDelete, onChange, onDelete }: { index: number; value: PomodoroBreak; canDelete: boolean; onChange: (value: PomodoroBreak) => void; onDelete: () => void }) {
  return <div className="break-plan-row"><span>第 {index + 1} 次专注后</span><div className="segmented-control break-type-control" aria-label={`第 ${index + 1} 次专注后的休息`}><button className={value === "short" ? "active" : ""} onClick={() => onChange("short")}>短休息</button><button className={value === "long" ? "active" : ""} onClick={() => onChange("long")}>长休息</button></div><button className="icon-button" title={`删除第 ${index + 1} 轮`} disabled={!canDelete} onClick={onDelete}><Trash2 size={15} /></button></div>;
}
