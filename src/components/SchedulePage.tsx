import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import {
  addDays,
  findCourseConflicts,
  occurrencesForDate,
  parseWeekList,
  resolveCourseTime,
  startOfWeek,
  toDateKey,
  weekNumber,
} from "../domain/schedule";
import type { AppData, Course, CourseException, Schedule, TimeSlot } from "../types";
import { createId } from "../types";
import { Modal } from "./Modal";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const COLORS = ["#2f7d68", "#2d6ea3", "#8463a6", "#bd5d4c", "#a36c22", "#4f7485", "#65743e"];

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
}

function cloneSchedule(source: Schedule): Schedule {
  const slotIds = new Map<string, string>();
  const timeSlots = source.timeSlots.map((slot) => {
    const id = createId();
    slotIds.set(slot.id, id);
    return { ...slot, id };
  });
  const courseIds = new Map<string, string>();
  const courses = source.courses.map((course) => {
    const id = createId();
    courseIds.set(course.id, id);
    return {
      ...course,
      id,
      weekdays: [...course.weekdays],
      time:
        course.time.kind === "slot"
          ? { kind: "slot" as const, slotId: slotIds.get(course.time.slotId) ?? "" }
          : { ...course.time },
    };
  });
  return {
    ...source,
    id: createId(),
    name: `${source.name} 副本`,
    timeSlots,
    courses,
    exceptions: source.exceptions.map((exception) => ({
      ...exception,
      id: createId(),
      courseId: courseIds.get(exception.courseId) ?? exception.courseId,
    })),
  };
}

export function SchedulePage({ data, onChange }: Props) {
  const schedule = data.schedules.find((item) => item.id === data.activeScheduleId) ?? data.schedules[0];
  const [section, setSection] = useState<"week" | "slots" | "exceptions">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [courseEditor, setCourseEditor] = useState<Course | "new" | null>(null);
  const [slotEditor, setSlotEditor] = useState<TimeSlot | "new" | null>(null);
  const [exceptionEditor, setExceptionEditor] = useState<CourseException | "new" | null>(null);

  const updateSchedule = (next: Schedule) => {
    onChange({
      ...data,
      schedules: data.schedules.map((item) => (item.id === next.id ? next : item)),
    });
  };

  const addSchedule = () => {
    const base = schedule ?? {
      timeSlots: [],
      semesterStart: toDateKey(new Date()),
      semesterEnd: toDateKey(addDays(new Date(), 140)),
    };
    const next: Schedule = {
      id: createId(),
      name: `新课表 ${data.schedules.length + 1}`,
      semesterStart: base.semesterStart,
      semesterEnd: base.semesterEnd,
      timeSlots: base.timeSlots.map((slot) => ({ ...slot, id: createId() })),
      courses: [],
      exceptions: [],
    };
    onChange({ ...data, schedules: [...data.schedules, next], activeScheduleId: next.id });
  };

  if (!schedule) {
    return (
      <div className="empty-page">
        <CalendarDays size={32} />
        <h2>还没有课表</h2>
        <button className="primary-button" onClick={addSchedule}><Plus size={17} />创建课表</button>
      </div>
    );
  }

  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const currentWeek = weekNumber(schedule, toDateKey(weekStart));

  return (
    <div className="page schedule-page">
      <header className="page-header schedule-header">
        <div>
          <span className="eyebrow">当前课表</span>
          <div className="schedule-picker-row">
            <select
              className="schedule-picker"
              value={schedule.id}
              onChange={(event) => onChange({ ...data, activeScheduleId: event.target.value })}
              aria-label="当前课表"
            >
              {data.schedules.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="icon-button" title="新建课表" onClick={addSchedule}><Plus size={17} /></button>
            <button
              className="icon-button"
              title="复制课表"
              onClick={() => {
                const copy = cloneSchedule(schedule);
                onChange({ ...data, schedules: [...data.schedules, copy], activeScheduleId: copy.id });
              }}
            ><Copy size={16} /></button>
            <button
              className="icon-button danger-icon"
              title="删除课表"
              disabled={data.schedules.length === 1}
              onClick={() => {
                if (!confirm(`确定删除“${schedule.name}”及其所有课程吗？`)) return;
                const schedules = data.schedules.filter((item) => item.id !== schedule.id);
                onChange({ ...data, schedules, activeScheduleId: schedules[0]?.id ?? null });
              }}
            ><Trash2 size={16} /></button>
          </div>
        </div>
        <button className="primary-button" onClick={() => setCourseEditor("new")}>
          <Plus size={17} />添加课程
        </button>
      </header>

      <div className="schedule-meta-row">
        <label>
          <span>课表名称</span>
          <input value={schedule.name} maxLength={40} onChange={(e) => updateSchedule({ ...schedule, name: e.target.value })} />
        </label>
        <label>
          <span>学期开始</span>
          <input type="date" value={schedule.semesterStart} onChange={(e) => updateSchedule({ ...schedule, semesterStart: e.target.value })} />
        </label>
        <label>
          <span>学期结束</span>
          <input type="date" value={schedule.semesterEnd} onChange={(e) => updateSchedule({ ...schedule, semesterEnd: e.target.value })} />
        </label>
      </div>

      <div className="tabs" role="tablist">
        <button className={section === "week" ? "active" : ""} onClick={() => setSection("week")}>周课表</button>
        <button className={section === "slots" ? "active" : ""} onClick={() => setSection("slots")}>作息时间</button>
        <button className={section === "exceptions" ? "active" : ""} onClick={() => setSection("exceptions")}>临时调整</button>
      </div>

      {section === "week" && (
        <>
          <div className="week-toolbar">
            <button className="icon-button" title="上一周" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={18} /></button>
            <button className="text-button" onClick={() => setWeekStart(startOfWeek(new Date()))}>回到本周</button>
            <button className="icon-button" title="下一周" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={18} /></button>
            <span className="week-label">
              {weekDates[0].toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} - {weekDates[6].toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
              {currentWeek ? ` · 第 ${currentWeek} 周` : " · 学期外"}
            </span>
          </div>
          <div className="week-grid">
            {weekDates.map((date, index) => {
              const dateKey = toDateKey(date);
              const items = occurrencesForDate(schedule, dateKey);
              const today = dateKey === toDateKey(new Date());
              return (
                <section className={`day-column ${today ? "today" : ""}`} key={dateKey}>
                  <header>
                    <span>{WEEKDAYS[index]}</span>
                    <strong>{date.getDate()}</strong>
                  </header>
                  <div className="day-courses">
                    {items.length === 0 && <span className="day-empty">无课程</span>}
                    {items.map((item) => (
                      <button
                        className="course-block"
                        key={item.key}
                        style={{ "--course-color": item.color } as React.CSSProperties}
                        onClick={() => {
                          const course = schedule.courses.find((courseItem) => courseItem.id === item.courseId);
                          if (course) setCourseEditor(course);
                        }}
                      >
                        <span className="course-time">{item.start} - {item.end}</span>
                        <strong>{item.title}</strong>
                        <span>{item.location || "未设置地点"}</span>
                        {item.moved && <em>已改期</em>}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {section === "slots" && (
        <div className="section-content">
          <div className="section-heading">
            <div><h2>作息时间</h2><p>修改时间段后，使用该节次的课程会自动更新。</p></div>
            <button className="secondary-button" onClick={() => setSlotEditor("new")}><Plus size={16} />新增时间段</button>
          </div>
          <div className="data-list">
            {schedule.timeSlots.map((slot) => (
              <div className="data-row" key={slot.id}>
                <Clock3 size={18} />
                <strong>{slot.name}</strong>
                <span>{slot.start} - {slot.end}</span>
                <span>课后休息 {slot.breakAfterMinutes} 分钟</span>
                <div className="row-actions">
                  <button className="icon-button" title="编辑" onClick={() => setSlotEditor(slot)}><Pencil size={15} /></button>
                  <button
                    className="icon-button danger-icon"
                    title="删除"
                    onClick={() => {
                      if (schedule.courses.some((course) => course.time.kind === "slot" && course.time.slotId === slot.id)) {
                        alert("该时间段正在被课程使用，请先修改相关课程。");
                        return;
                      }
                      if (confirm(`删除“${slot.name}”？`)) updateSchedule({ ...schedule, timeSlots: schedule.timeSlots.filter((item) => item.id !== slot.id) });
                    }}
                  ><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "exceptions" && (
        <div className="section-content">
          <div className="section-heading">
            <div><h2>临时调整</h2><p>只影响指定日期的一次课程，不修改每周规则。</p></div>
            <button className="secondary-button" disabled={schedule.courses.length === 0} onClick={() => setExceptionEditor("new")}><Plus size={16} />新增调整</button>
          </div>
          <div className="data-list">
            {schedule.exceptions.length === 0 && <div className="empty-inline"><RefreshCcw size={22} />暂无临时调整</div>}
            {schedule.exceptions.map((exception) => {
              const course = schedule.courses.find((item) => item.id === exception.courseId);
              return (
                <div className="data-row" key={exception.id}>
                  <RefreshCcw size={18} />
                  <strong>{course?.title ?? "已删除课程"}</strong>
                  <span>{exception.originalDate}</span>
                  <span>{exception.action === "cancel" ? "停课" : `改至 ${exception.newDate} ${exception.newStart}-${exception.newEnd}`}</span>
                  <div className="row-actions">
                    <button className="icon-button" title="编辑" onClick={() => setExceptionEditor(exception)}><Pencil size={15} /></button>
                    <button className="icon-button danger-icon" title="删除" onClick={() => updateSchedule({ ...schedule, exceptions: schedule.exceptions.filter((item) => item.id !== exception.id) })}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {courseEditor && (
        <CourseForm
          schedule={schedule}
          initial={courseEditor === "new" ? null : courseEditor}
          onClose={() => setCourseEditor(null)}
          onSave={(course) => {
            const exists = schedule.courses.some((item) => item.id === course.id);
            updateSchedule({ ...schedule, courses: exists ? schedule.courses.map((item) => item.id === course.id ? course : item) : [...schedule.courses, course] });
            setCourseEditor(null);
          }}
          onDelete={courseEditor === "new" ? undefined : (id) => {
            if (!confirm("删除这门课及其临时调整？")) return;
            updateSchedule({ ...schedule, courses: schedule.courses.filter((item) => item.id !== id), exceptions: schedule.exceptions.filter((item) => item.courseId !== id) });
            setCourseEditor(null);
          }}
        />
      )}
      {slotEditor && <SlotForm initial={slotEditor === "new" ? null : slotEditor} onClose={() => setSlotEditor(null)} onSave={(slot) => {
        const exists = schedule.timeSlots.some((item) => item.id === slot.id);
        const timeSlots = (exists ? schedule.timeSlots.map((item) => item.id === slot.id ? slot : item) : [...schedule.timeSlots, slot]).sort((a, b) => a.start.localeCompare(b.start));
        updateSchedule({ ...schedule, timeSlots }); setSlotEditor(null);
      }} />}
      {exceptionEditor && <ExceptionForm schedule={schedule} initial={exceptionEditor === "new" ? null : exceptionEditor} onClose={() => setExceptionEditor(null)} onSave={(exception) => {
        const exists = schedule.exceptions.some((item) => item.id === exception.id);
        updateSchedule({ ...schedule, exceptions: exists ? schedule.exceptions.map((item) => item.id === exception.id ? exception : item) : [...schedule.exceptions, exception] }); setExceptionEditor(null);
      }} />}
    </div>
  );
}

function CourseForm({ schedule, initial, onClose, onSave, onDelete }: {
  schedule: Schedule;
  initial: Course | null;
  onClose: () => void;
  onSave: (course: Course) => void;
  onDelete?: (id: string) => void;
}) {
  const [course, setCourse] = useState<Course>(initial ?? {
    id: createId(), title: "", teacher: "", location: "", color: COLORS[0], notes: "", weekdays: [1],
    time: schedule.timeSlots[0] ? { kind: "slot", slotId: schedule.timeSlots[0].id } : { kind: "custom", start: "08:00", end: "08:45" },
    recurrence: { kind: "every", weeks: [] }, reminder: { mode: "inherit" },
  });
  const [weekText, setWeekText] = useState(course.recurrence.weeks.join(", "));
  const [error, setError] = useState("");
  const conflicts = useMemo(() => findCourseConflicts(schedule, course), [schedule, course]);
  const resolvedTime = resolveCourseTime(schedule, course.time);

  const submit = () => {
    if (!course.title.trim()) return setError("请填写课程名称。");
    if (course.weekdays.length === 0) return setError("请至少选择一个上课日。");
    if (!resolvedTime || resolvedTime.start >= resolvedTime.end) return setError("结束时间必须晚于开始时间。");
    const weeks = course.recurrence.kind === "custom" ? parseWeekList(weekText) : [];
    if (course.recurrence.kind === "custom" && weeks.length === 0) return setError("请填写有效周次，例如 1, 3, 6-10。");
    onSave({ ...course, title: course.title.trim(), recurrence: { ...course.recurrence, weeks } });
  };

  return (
    <Modal title={initial ? "编辑课程" : "添加课程"} onClose={onClose} wide>
      <div className="form-grid two-columns">
        <label><span>课程名称 *</span><input autoFocus maxLength={60} value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} /></label>
        <fieldset className="weekday-picker">
          <legend>上课日 *</legend>
          <div>
            {WEEKDAYS.map((day, index) => {
              const weekday = index + 1;
              const checked = course.weekdays.includes(weekday);
              return <label key={day}><input type="checkbox" checked={checked} onChange={() => setCourse({ ...course, weekdays: checked ? course.weekdays.filter((item) => item !== weekday) : [...course.weekdays, weekday].sort((a, b) => a - b) })} /><span>{day}</span></label>;
            })}
          </div>
        </fieldset>
        <label><span>教师</span><input maxLength={60} value={course.teacher} onChange={(e) => setCourse({ ...course, teacher: e.target.value })} /></label>
        <label><span>地点</span><input maxLength={80} value={course.location} onChange={(e) => setCourse({ ...course, location: e.target.value })} /></label>
        <label><span>时间类型</span><select value={course.time.kind} onChange={(e) => setCourse({ ...course, time: e.target.value === "slot" && schedule.timeSlots[0] ? { kind: "slot", slotId: schedule.timeSlots[0].id } : { kind: "custom", start: "08:00", end: "08:45" } })}><option value="slot">预设节次</option><option value="custom">自定义时间</option></select></label>
        {course.time.kind === "slot" ? (
          <label><span>节次</span><select value={course.time.slotId} onChange={(e) => setCourse({ ...course, time: { kind: "slot", slotId: e.target.value } })}>{schedule.timeSlots.map((slot) => <option value={slot.id} key={slot.id}>{slot.name} · {slot.start}-{slot.end}</option>)}</select></label>
        ) : (
          <div className="inline-fields"><label><span>开始</span><input type="time" value={course.time.start} onChange={(e) => setCourse({ ...course, time: { kind: "custom", start: e.target.value, end: course.time.kind === "custom" ? course.time.end : "08:45" } })} /></label><label><span>结束</span><input type="time" value={course.time.end} onChange={(e) => setCourse({ ...course, time: { kind: "custom", start: course.time.kind === "custom" ? course.time.start : "08:00", end: e.target.value } })} /></label></div>
        )}
        <label><span>重复规则</span><select value={course.recurrence.kind} onChange={(e) => setCourse({ ...course, recurrence: { ...course.recurrence, kind: e.target.value as Course["recurrence"]["kind"] } })}><option value="every">每周</option><option value="odd">单周</option><option value="even">双周</option><option value="custom">指定周</option></select></label>
        {course.recurrence.kind === "custom" && <label><span>指定周次</span><input placeholder="1, 3, 6-10" value={weekText} onChange={(e) => setWeekText(e.target.value)} /></label>}
        <label><span>提醒策略</span><select value={course.reminder.mode} onChange={(e) => setCourse({ ...course, reminder: { ...course.reminder, mode: e.target.value as Course["reminder"]["mode"] } })}><option value="inherit">跟随全局</option><option value="custom">单独设置</option><option value="off">关闭该课提醒</option></select></label>
        {course.reminder.mode === "custom" && <div className="inline-fields"><label><span>提前分钟</span><input type="number" min="0" max="180" value={course.reminder.leadMinutes ?? 5} onChange={(e) => setCourse({ ...course, reminder: { ...course.reminder, leadMinutes: Number(e.target.value) } })} /></label><label className="checkbox-label"><input type="checkbox" checked={course.reminder.endEnabled ?? true} onChange={(e) => setCourse({ ...course, reminder: { ...course.reminder, endEnabled: e.target.checked } })} /><span>下课提醒</span></label></div>}
        <label className="color-field"><span>颜色</span><div className="swatches">{COLORS.map((color) => <button key={color} type="button" title={color} className={course.color === color ? "selected" : ""} style={{ background: color }} onClick={() => setCourse({ ...course, color })} />)}</div></label>
        <label className="full-span"><span>备注</span><textarea maxLength={300} rows={3} value={course.notes} onChange={(e) => setCourse({ ...course, notes: e.target.value })} /></label>
      </div>
      {conflicts.length > 0 && <div className="warning-banner">该时间与 {conflicts.map((item) => item.title).join("、")} 重叠，仍可保存。</div>}
      {error && <div className="error-banner">{error}</div>}
      <div className="modal-actions">{onDelete && <button className="danger-button" onClick={() => onDelete(course.id)}><Trash2 size={16} />删除</button>}<span className="spacer" /><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={submit}>保存课程</button></div>
    </Modal>
  );
}

function SlotForm({ initial, onClose, onSave }: { initial: TimeSlot | null; onClose: () => void; onSave: (slot: TimeSlot) => void }) {
  const [slot, setSlot] = useState<TimeSlot>(initial ?? { id: createId(), name: "", start: "08:00", end: "08:45", breakAfterMinutes: 10 });
  const [error, setError] = useState("");
  return <Modal title={initial ? "编辑时间段" : "新增时间段"} onClose={onClose}><div className="form-grid"><label><span>名称 *</span><input autoFocus value={slot.name} maxLength={30} onChange={(e) => setSlot({ ...slot, name: e.target.value })} /></label><div className="inline-fields"><label><span>开始</span><input type="time" value={slot.start} onChange={(e) => setSlot({ ...slot, start: e.target.value })} /></label><label><span>结束</span><input type="time" value={slot.end} onChange={(e) => setSlot({ ...slot, end: e.target.value })} /></label></div><label><span>课后休息分钟</span><input type="number" min="0" max="240" value={slot.breakAfterMinutes} onChange={(e) => setSlot({ ...slot, breakAfterMinutes: Number(e.target.value) })} /></label></div>{error && <div className="error-banner">{error}</div>}<div className="modal-actions"><span className="spacer" /><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => { if (!slot.name.trim()) return setError("请填写名称。"); if (slot.start >= slot.end) return setError("结束时间必须晚于开始时间。"); onSave({ ...slot, name: slot.name.trim() }); }}>保存</button></div></Modal>;
}

function ExceptionForm({ schedule, initial, onClose, onSave }: { schedule: Schedule; initial: CourseException | null; onClose: () => void; onSave: (exception: CourseException) => void }) {
  const [item, setItem] = useState<CourseException>(initial ?? { id: createId(), courseId: schedule.courses[0]?.id ?? "", originalDate: toDateKey(new Date()), action: "cancel" });
  const [error, setError] = useState("");
  return <Modal title={initial ? "编辑临时调整" : "新增临时调整"} onClose={onClose}><div className="form-grid"><label><span>课程</span><select value={item.courseId} onChange={(e) => setItem({ ...item, courseId: e.target.value })}>{schedule.courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label><label><span>原上课日期</span><input type="date" value={item.originalDate} onChange={(e) => setItem({ ...item, originalDate: e.target.value })} /></label><label><span>调整方式</span><select value={item.action} onChange={(e) => setItem({ ...item, action: e.target.value as CourseException["action"] })}><option value="cancel">本次停课</option><option value="move">改期</option></select></label>{item.action === "move" && <><label><span>新日期</span><input type="date" value={item.newDate ?? ""} onChange={(e) => setItem({ ...item, newDate: e.target.value })} /></label><div className="inline-fields"><label><span>新开始时间</span><input type="time" value={item.newStart ?? ""} onChange={(e) => setItem({ ...item, newStart: e.target.value })} /></label><label><span>新结束时间</span><input type="time" value={item.newEnd ?? ""} onChange={(e) => setItem({ ...item, newEnd: e.target.value })} /></label></div></>}</div>{error && <div className="error-banner">{error}</div>}<div className="modal-actions"><span className="spacer" /><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => { if (!item.courseId || !item.originalDate) return setError("请选择课程和原日期。"); if (item.action === "move" && (!item.newDate || !item.newStart || !item.newEnd || item.newStart >= item.newEnd)) return setError("请填写有效的改期日期和时间。"); onSave(item); }}>保存调整</button></div></Modal>;
}
