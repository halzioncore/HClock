import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { addDays, startOfWeek, toDateKey } from "../domain/schedule";
import { createId } from "../types";
import type { AppData, CalendarEvent } from "../types";
import { Modal } from "./Modal";

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const EVENT_COLORS = ["#2f7d68", "#2d6ea3", "#8463a6", "#bd5d4c", "#a36c22", "#4f7485", "#65743e"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthDates(month: Date) {
  const first = startOfWeek(startOfMonth(month));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

function selectedDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

export function CalendarPage({ data, onChange }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [eventEditor, setEventEditor] = useState<CalendarEvent | "new" | null>(null);
  const dates = useMemo(() => monthDates(month), [month]);
  const eventsByDate = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    for (const event of data.calendarEvents) {
      const events = result.get(event.date) ?? [];
      events.push(event);
      result.set(event.date, events);
    }
    for (const [dateKey, events] of result) result.set(dateKey, sortEvents(events));
    return result;
  }, [data.calendarEvents]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(toDateKey(next));
  };

  const selectDate = (date: Date) => {
    const dateKey = toDateKey(date);
    setSelectedDate(dateKey);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(startOfMonth(date));
    }
    setEventEditor("new");
  };

  const returnToday = () => {
    setMonth(startOfMonth(today));
    setSelectedDate(todayKey);
  };

  const openNewEvent = () => setEventEditor("new");

  const saveEvent = (event: CalendarEvent) => {
    const exists = data.calendarEvents.some((item) => item.id === event.id);
    const calendarEvents = exists
      ? data.calendarEvents.map((item) => item.id === event.id ? event : item)
      : [...data.calendarEvents, event];
    onChange({ ...data, calendarEvents });
    setSelectedDate(event.date);
    setMonth(startOfMonth(new Date(`${event.date}T00:00:00`)));
    setEventEditor(null);
  };

  const deleteEvent = (id: string) => {
    if (!confirm("确定删除这个日程吗？")) return;
    onChange({ ...data, calendarEvents: data.calendarEvents.filter((event) => event.id !== id) });
    setEventEditor(null);
  };

  return (
    <div className="page calendar-page">
      <header className="page-header calendar-header">
        <div><span className="eyebrow">月历</span><h1>{month.getFullYear()}年 {month.getMonth() + 1}月</h1></div>
        <div className="calendar-toolbar">
          <button className="secondary-button" onClick={returnToday}>今天</button>
          <button className="icon-button" title="上个月" aria-label="上个月" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
          <button className="icon-button" title="下个月" aria-label="下个月" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
        </div>
      </header>

      <div className="calendar-layout">
        <section className="month-calendar" aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月日程月历`}>
          <div className="calendar-weekdays">{WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
          <div className="calendar-grid">
            {dates.map((date) => {
              const dateKey = toDateKey(date);
              const dayEvents = eventsByDate.get(dateKey) ?? [];
              const isCurrentMonth = date.getMonth() === month.getMonth();
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDate;
              return (
                <button
                  className={`calendar-day${isCurrentMonth ? "" : " outside-month"}${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
                  key={dateKey}
                  aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日，${dayEvents.length}个日程`}
                  aria-pressed={isSelected}
                  onClick={() => selectDate(date)}
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  <span className="calendar-event-marks" aria-hidden="true">
                    {dayEvents.slice(0, 3).map((event) => <i key={event.id} style={{ background: event.color }} />)}
                    {dayEvents.length > 3 && <em>+{dayEvents.length - 3}</em>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="calendar-agenda" aria-label="所选日期日程">
          <header>
            <div><span>{selectedDateLabel(selectedDate)}</span><strong>{selectedEvents.length} 个日程</strong></div>
            <button className="secondary-button" onClick={openNewEvent}><Plus size={15} />添加日程</button>
          </header>
          <div className="calendar-agenda-list">
            {selectedEvents.length === 0 && <div className="calendar-agenda-empty"><CalendarDays size={25} /><span>当天没有日程</span><small>点击月历中的日期即可添加</small></div>}
            {selectedEvents.map((event) => (
              <AgendaItem
                key={event.id}
                event={event}
                onEdit={() => setEventEditor(event)}
                onDelete={() => deleteEvent(event.id)}
              />
            ))}
          </div>
        </aside>
      </div>

      {eventEditor && (
        <CalendarEventForm
          key={eventEditor === "new" ? "new" : eventEditor.id}
          date={selectedDate}
          initial={eventEditor === "new" ? null : eventEditor}
          onClose={() => setEventEditor(null)}
          onSave={saveEvent}
          onDelete={eventEditor === "new" ? undefined : deleteEvent}
        />
      )}
    </div>
  );
}

function AgendaItem({ event, onEdit, onDelete }: { event: CalendarEvent; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="calendar-agenda-item" style={{ "--event-color": event.color } as CSSProperties}>
      <time>{event.start}<span>{event.end}</span></time>
      <div>
        <strong>{event.title}</strong>
        {event.location && <span><MapPin size={12} />{event.location}</span>}
        {event.notes && <small>{event.notes}</small>}
      </div>
      <div className="calendar-agenda-actions">
        <button className="icon-button" title="编辑日程" aria-label={`编辑日程：${event.title}`} onClick={onEdit}><Pencil size={14} /></button>
        <button className="icon-button danger-icon" title="删除日程" aria-label={`删除日程：${event.title}`} onClick={onDelete}><Trash2 size={14} /></button>
      </div>
    </article>
  );
}

function CalendarEventForm({ date, initial, onClose, onSave, onDelete }: {
  date: string;
  initial: CalendarEvent | null;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete?: (id: string) => void;
}) {
  const [event, setEvent] = useState<CalendarEvent>(() => initial ?? {
    id: createId(),
    title: "",
    date,
    start: "09:00",
    end: "10:00",
    location: "",
    color: EVENT_COLORS[0],
    notes: "",
  });
  const [error, setError] = useState("");

  const submit = () => {
    if (!event.title.trim()) return setError("请填写日程标题。");
    if (!event.date) return setError("请选择日期。");
    if (!event.start || !event.end || event.start >= event.end) return setError("请填写有效的开始和结束时间。");
    onSave({ ...event, title: event.title.trim(), location: event.location.trim(), notes: event.notes.trim() });
  };

  return (
    <Modal title={initial ? "编辑日程" : "添加日程"} onClose={onClose}>
      <div className="form-grid">
        <label><span>标题 *</span><input autoFocus maxLength={120} value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} /></label>
        <label><span>日期 *</span><input type="date" value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} /></label>
        <div className="inline-fields">
          <label><span>开始</span><input type="time" value={event.start} onChange={(e) => setEvent({ ...event, start: e.target.value })} /></label>
          <label><span>结束</span><input type="time" value={event.end} onChange={(e) => setEvent({ ...event, end: e.target.value })} /></label>
        </div>
        <label><span>地点</span><input maxLength={120} value={event.location} onChange={(e) => setEvent({ ...event, location: e.target.value })} /></label>
        <label className="color-field"><span>颜色</span><div className="swatches">{EVENT_COLORS.map((color) => <button key={color} type="button" title={color} aria-label={`选择颜色 ${color}`} className={event.color === color ? "selected" : ""} style={{ background: color }} onClick={() => setEvent({ ...event, color })} />)}</div></label>
        <label><span>备注</span><textarea maxLength={500} rows={3} value={event.notes} onChange={(e) => setEvent({ ...event, notes: e.target.value })} /></label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="modal-actions">
        {onDelete && <button className="danger-button" onClick={() => onDelete(event.id)}><Trash2 size={16} />删除日程</button>}
        <span className="spacer" />
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button className="primary-button" onClick={submit}>保存日程</button>
      </div>
    </Modal>
  );
}
