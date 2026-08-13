import type { Course, CourseTime, Occurrence, Schedule } from "../types";

const pad = (value: number) => String(value).padStart(2, "0");

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = result.getDay() || 7;
  result.setDate(result.getDate() - weekday + 1);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function weekNumber(schedule: Schedule, dateKey: string): number | null {
  const date = parseLocalDate(dateKey);
  const semesterStart = parseLocalDate(schedule.semesterStart);
  const semesterEnd = parseLocalDate(schedule.semesterEnd);
  if (date < semesterStart || date > semesterEnd) return null;
  const firstMonday = startOfWeek(semesterStart);
  return Math.floor((date.getTime() - firstMonday.getTime()) / 604_800_000) + 1;
}

export function recurrenceMatches(course: Course, week: number): boolean {
  if (course.recurrence.kind === "every") return true;
  if (course.recurrence.kind === "odd") return week % 2 === 1;
  if (course.recurrence.kind === "even") return week % 2 === 0;
  return course.recurrence.weeks.includes(week);
}

export function resolveCourseTime(schedule: Schedule, time: CourseTime) {
  if (time.kind === "custom") {
    return { start: time.start, end: time.end, breakAfterMinutes: 0 };
  }
  const slot = schedule.timeSlots.find((item) => item.id === time.slotId);
  return slot
    ? { start: slot.start, end: slot.end, breakAfterMinutes: slot.breakAfterMinutes }
    : null;
}

export function occurrencesForDate(schedule: Schedule, dateKey: string): Occurrence[] {
  const week = weekNumber(schedule, dateKey);
  const weekday = parseLocalDate(dateKey).getDay() || 7;
  const result: Occurrence[] = [];

  if (week !== null) {
    for (const course of schedule.courses) {
      if (!course.weekdays.includes(weekday) || !recurrenceMatches(course, week)) continue;
      const exception = schedule.exceptions.find(
        (item) => item.courseId === course.id && item.originalDate === dateKey,
      );
      if (exception) continue;
      const time = resolveCourseTime(schedule, course.time);
      if (!time) continue;
      result.push({
        key: `${dateKey}:${course.id}`,
        courseId: course.id,
        title: course.title,
        teacher: course.teacher,
        location: course.location,
        color: course.color,
        notes: course.notes,
        date: dateKey,
        ...time,
        moved: false,
      });
    }
  }

  for (const exception of schedule.exceptions) {
    if (exception.action !== "move" || exception.newDate !== dateKey) continue;
    const course = schedule.courses.find((item) => item.id === exception.courseId);
    if (!course || !exception.newStart || !exception.newEnd) continue;
    result.push({
      key: `${dateKey}:${course.id}:${exception.id}`,
      courseId: course.id,
      title: course.title,
      teacher: course.teacher,
      location: course.location,
      color: course.color,
      notes: course.notes,
      date: dateKey,
      start: exception.newStart,
      end: exception.newEnd,
      breakAfterMinutes: 0,
      moved: true,
    });
  }

  return result.sort((a, b) => a.start.localeCompare(b.start));
}

export function dateTime(dateKey: string, time: string): Date {
  const date = parseLocalDate(dateKey);
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function nextOccurrences(schedule: Schedule, from = new Date(), days = 14): Occurrence[] {
  const result: Occurrence[] = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDays(from, offset);
    for (const occurrence of occurrencesForDate(schedule, toDateKey(date))) {
      if (dateTime(occurrence.date, occurrence.end) >= from) result.push(occurrence);
    }
  }
  return result.sort(
    (a, b) => dateTime(a.date, a.start).getTime() - dateTime(b.date, b.start).getTime(),
  );
}

export function parseWeekList(value: string): number[] {
  const weeks = new Set<number>();
  for (const token of value.split(/[,，\s]+/).filter(Boolean)) {
    const match = token.match(/^(\d+)[-~](\d+)$/);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) {
        if (week > 0 && week <= 60) weeks.add(week);
      }
    } else {
      const week = Number(token);
      if (Number.isInteger(week) && week > 0 && week <= 60) weeks.add(week);
    }
  }
  return [...weeks].sort((a, b) => a - b);
}

export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

export function findCourseConflicts(schedule: Schedule, candidate: Course): Course[] {
  const candidateTime = resolveCourseTime(schedule, candidate.time);
  if (!candidateTime) return [];
  return schedule.courses.filter((course) => {
    if (course.id === candidate.id || !course.weekdays.some((weekday) => candidate.weekdays.includes(weekday))) return false;
    const time = resolveCourseTime(schedule, course.time);
    return Boolean(time && timeRangesOverlap(candidateTime.start, candidateTime.end, time.start, time.end));
  });
}
