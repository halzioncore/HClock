import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultData } from "../data/defaults";
import { startOfWeek, toDateKey } from "../domain/schedule";
import type { AppData } from "../types";
import { CalendarPage } from "./CalendarPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("日程月历", () => {
  it("不展示课程，并可点击日期新增独立日程", () => {
    const data = createDefaultData();
    const today = new Date();
    const schedule = data.schedules[0];
    const weekday = today.getDay() || 7;
    schedule.semesterStart = toDateKey(startOfWeek(today));
    schedule.courses = [{
      id: "calendar-course",
      title: "不会显示的课程",
      teacher: "林老师",
      location: "A101",
      color: "#28745f",
      notes: "",
      weekdays: [weekday],
      time: { kind: "slot", slotId: schedule.timeSlots[0].id },
      recurrence: { kind: "every", weeks: [] },
      reminder: { mode: "inherit" },
    }];

    let current = data;
    let view: ReturnType<typeof render> | undefined;
    const onChange = (next: AppData) => {
      current = next;
      view?.rerender(<CalendarPage data={current} onChange={onChange} />);
    };
    view = render(<CalendarPage data={current} onChange={onChange} />);

    expect(screen.queryByText("不会显示的课程")).not.toBeInTheDocument();
    const dateButton = screen.getByRole("button", {
      name: `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日，0个日程`,
    });
    fireEvent.click(dateButton);
    fireEvent.change(screen.getByLabelText("标题 *"), { target: { value: "提交报告" } });
    fireEvent.change(screen.getByLabelText("地点"), { target: { value: "会议室" } });
    fireEvent.click(screen.getByRole("button", { name: "保存日程" }));

    expect(current.calendarEvents).toHaveLength(1);
    expect(current.calendarEvents[0]).toEqual(expect.objectContaining({ title: "提交报告", date: toDateKey(today), location: "会议室" }));
    expect(screen.getByText("提交报告")).toBeInTheDocument();
  });

  it("支持切换月份和返回今天", () => {
    const data = createDefaultData();
    const today = new Date();

    render(<CalendarPage data={data} onChange={() => undefined} />);

    expect(screen.getByRole("button", { name: "今天" })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("下个月"));
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    expect(screen.getByRole("heading", { name: `${nextMonth.getFullYear()}年 ${nextMonth.getMonth() + 1}月` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "今天" }));
    expect(screen.getByRole("heading", { name: `${today.getFullYear()}年 ${today.getMonth() + 1}月` })).toBeInTheDocument();
  });

  it("支持编辑和删除独立日程", () => {
    const data = createDefaultData();
    const todayKey = toDateKey(new Date());
    data.calendarEvents = [{ id: "event", title: "原日程", date: todayKey, start: "09:00", end: "10:00", location: "", color: "#2f7d68", notes: "" }];
    let current = data;
    let view: ReturnType<typeof render> | undefined;
    const onChange = (next: AppData) => {
      current = next;
      view?.rerender(<CalendarPage data={current} onChange={onChange} />);
    };
    view = render(<CalendarPage data={current} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑日程：原日程" }));
    fireEvent.change(screen.getByLabelText("标题 *"), { target: { value: "已编辑日程" } });
    fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
    expect(current.calendarEvents[0].title).toBe("已编辑日程");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "删除日程：已编辑日程" }));
    expect(current.calendarEvents).toEqual([]);
  });
});
