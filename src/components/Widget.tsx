import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ExternalLink, Layers2, LockKeyhole, MapPin, Pin, UnlockKeyhole, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { dateTime, nextOccurrences, occurrencesForDate, toDateKey } from "../domain/schedule";
import { setWidgetLayer, setWidgetVisible, showMain } from "../services/bridge";
import type { AppData, WidgetLayer } from "../types";

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
}

function relativeTime(target: Date, now: Date) {
  const minutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分后` : `${hours} 小时后`;
}

export function Widget({ data, onChange }: Props) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const schedule = data.schedules.find((item) => item.id === data.activeScheduleId);
  const today = toDateKey(now);
  const courses = useMemo(() => schedule ? occurrencesForDate(schedule, today) : [], [schedule, today]);
  const current = courses.find((course) => dateTime(course.date, course.start) <= now && dateTime(course.date, course.end) > now);
  const next = schedule ? nextOccurrences(schedule, now, 14).find((course) => dateTime(course.date, course.start) > now) : undefined;
  const primary = current ?? next;
  const layer = data.settings.widget.layer;
  const positionLocked = data.settings.widget.positionLocked;

  useEffect(() => {
    void setWidgetLayer(layer);
  }, [layer]);

  const cycleLayer = async () => {
    const layers: WidgetLayer[] = ["top", "normal", "bottom"];
    const nextLayer = layers[(layers.indexOf(layer) + 1) % layers.length];
    onChange({ ...data, settings: { ...data.settings, widget: { ...data.settings.widget, layer: nextLayer } } });
    await setWidgetLayer(nextLayer);
  };

  const layerTitle = layer === "top" ? "当前置顶，点击切换为普通层级" : layer === "normal" ? "当前为普通层级，点击贴近桌面" : "当前贴近桌面，点击切换为置顶";
  const LayerIcon = layer === "top" ? Pin : layer === "bottom" ? ArrowDownToLine : Layers2;
  const togglePositionLock = () => {
    onChange({ ...data, settings: { ...data.settings, widget: { ...data.settings.widget, positionLocked: !positionLocked } } });
  };

  return (
    <div className="widget-shell">
      <header className={`widget-titlebar${positionLocked ? " position-locked" : ""}`} onMouseDown={(event) => { if (event.button === 0 && !positionLocked) void getCurrentWindow().startDragging(); }}>
        <div><span>HC</span><strong>{schedule?.name ?? "HClock"}</strong></div>
        <div className="widget-actions" onMouseDown={(event) => event.stopPropagation()}>
          <button data-tooltip={positionLocked ? "解锁位置，恢复窗口拖动" : "锁定位置，避免误拖窗口"} aria-label={positionLocked ? "解锁桌面课表位置" : "锁定桌面课表位置"} aria-pressed={positionLocked} onClick={togglePositionLock}>{positionLocked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button>
          <button data-tooltip={layerTitle} aria-label={layerTitle} onClick={() => void cycleLayer()}><LayerIcon size={15} /></button>
          <button data-tooltip="打开 HClock 主界面" aria-label="打开 HClock 主界面" onClick={() => void showMain()}><ExternalLink size={15} /></button>
          <button data-tooltip="关闭桌面课表" aria-label="关闭桌面课表" onClick={() => void setWidgetVisible(false)}><X size={16} /></button>
        </div>
      </header>

      <main className="widget-content">
        <div className="widget-date">
          <div><strong>{now.getDate()}</strong><span>{now.toLocaleDateString("zh-CN", { month: "long", weekday: "long" })}</span></div>
          <time>{now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
        </div>

        {primary ? (
          <section className="widget-primary">
            <span className="widget-status">{current ? "正在上课" : primary.date === today ? "下一节课" : "近期课程"}</span>
            <h1>{primary.title}</h1>
            <div className="widget-course-meta"><strong>{primary.start} - {primary.end}</strong>{primary.location && <span><MapPin size={13} />{primary.location}</span>}</div>
            <div className="widget-countdown">
              {current
                ? `距下课 ${relativeTime(dateTime(primary.date, primary.end), now)}`
                : `${primary.date === today ? "" : `${primary.date} · `}${relativeTime(dateTime(primary.date, primary.start), now)}`}
            </div>
          </section>
        ) : (
          <section className="widget-free"><strong>暂无课程</strong><span>可以安排一段自主学习时间</span></section>
        )}

        <section className="widget-list">
          <header><strong>今日课程</strong><span>{courses.length} 节</span></header>
          <div>
            {courses.length === 0 && <span className="widget-empty">今天没有安排课程</span>}
            {courses.map((course) => (
              <div className={current?.key === course.key ? "active" : ""} key={course.key}>
                <i style={{ background: course.color }} />
                <time>{course.start}</time>
                <strong>{course.title}</strong>
                <span>{course.location}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
