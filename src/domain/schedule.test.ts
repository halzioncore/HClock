import { describe, expect, it } from "vitest";
import type { Schedule } from "../types";
import { findCourseConflicts, occurrencesForDate, parseWeekList } from "./schedule";

const schedule: Schedule = {
  id: "s1",
  name: "测试课表",
  semesterStart: "2026-08-31",
  semesterEnd: "2027-01-10",
  timeSlots: [{ id: "t1", name: "第 1 节", start: "08:00", end: "08:45", breakAfterMinutes: 10 }],
  courses: [{
    id: "c1", title: "数学", teacher: "", location: "A101", color: "#2f7d68", notes: "",
    weekdays: [1, 3], time: { kind: "slot", slotId: "t1" },
    recurrence: { kind: "odd", weeks: [] }, reminder: { mode: "inherit" },
  }],
  exceptions: [],
};

describe("课程发生规则", () => {
  it("匹配单周并跳过双周", () => {
    expect(occurrencesForDate(schedule, "2026-08-31")).toHaveLength(1);
    expect(occurrencesForDate(schedule, "2026-09-02")).toHaveLength(1);
    expect(occurrencesForDate(schedule, "2026-09-07")).toHaveLength(0);
  });

  it("处理单次停课与改期", () => {
    const changed: Schedule = {
      ...schedule,
      exceptions: [{
        id: "e1", courseId: "c1", originalDate: "2026-08-31", action: "move",
        newDate: "2026-09-01", newStart: "10:00", newEnd: "10:45",
      }],
    };
    expect(occurrencesForDate(changed, "2026-08-31")).toHaveLength(0);
    expect(occurrencesForDate(changed, "2026-09-01")[0]?.start).toBe("10:00");
  });

  it("解析指定周与范围", () => {
    expect(parseWeekList("1, 3, 6-8")).toEqual([1, 3, 6, 7, 8]);
  });

  it("只在课程共享上课日且时间重叠时报告冲突", () => {
    const candidate = {
      ...schedule.courses[0],
      id: "c2",
      title: "物理",
      weekdays: [2, 3],
      time: { kind: "custom" as const, start: "08:30", end: "09:15" },
    };
    expect(findCourseConflicts(schedule, candidate).map((course) => course.id)).toEqual(["c1"]);
    expect(findCourseConflicts(schedule, { ...candidate, weekdays: [2] })).toEqual([]);
  });
});
