import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultData } from "../data/defaults";
import { PomodoroPage } from "./PomodoroPage";

describe("番茄钟休息计划", () => {
  it("支持设置 0 到 59 秒并同步空闲专注时长", () => {
    const defaults = createDefaultData();
    const data = {
      ...defaults,
      pomodoroSettings: { ...defaults.pomodoroSettings, focusSeconds: 1 },
      pomodoroSession: { ...defaults.pomodoroSession, remainingSeconds: 1501 },
    };
    const onChange = vi.fn();
    const { rerender } = render(<PomodoroPage data={data} onChange={onChange} />);

    fireEvent.change(screen.getByRole("spinbutton", { name: "专注分钟" }), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      pomodoroSettings: expect.objectContaining({ focusMinutes: 0 }),
      pomodoroSession: expect.objectContaining({ remainingSeconds: data.pomodoroSettings.focusSeconds }),
    }));

    const secondsOnly = {
      ...data,
      pomodoroSettings: { ...data.pomodoroSettings, focusMinutes: 0 },
      pomodoroSession: { ...data.pomodoroSession, remainingSeconds: data.pomodoroSettings.focusSeconds },
    };
    rerender(<PomodoroPage data={secondsOnly} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "专注秒钟" }), { target: { value: "59" } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      pomodoroSettings: expect.objectContaining({ focusSeconds: 59 }),
      pomodoroSession: expect.objectContaining({ remainingSeconds: 59 }),
    }));

    const minutesOnly = {
      ...data,
      pomodoroSettings: { ...data.pomodoroSettings, focusSeconds: 0 },
      pomodoroSession: { ...data.pomodoroSession, remainingSeconds: data.pomodoroSettings.focusMinutes * 60 },
    };
    rerender(<PomodoroPage data={minutesOnly} onChange={onChange} />);
    expect(screen.getByRole("spinbutton", { name: "专注秒钟" })).toHaveAttribute("min", "0");
    fireEvent.change(screen.getByRole("spinbutton", { name: "专注分钟" }), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      pomodoroSettings: expect.objectContaining({ focusMinutes: 1, focusSeconds: 0 }),
    }));

    const secondsOnlyAtZero = {
      ...data,
      pomodoroSettings: { ...data.pomodoroSettings, focusMinutes: 0, focusSeconds: 1 },
      pomodoroSession: { ...data.pomodoroSession, remainingSeconds: 1 },
    };
    rerender(<PomodoroPage data={secondsOnlyAtZero} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "专注秒钟" }), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      pomodoroSettings: expect.objectContaining({ focusMinutes: 0, focusSeconds: 1 }),
    }));
  });

  it("可以单独定义每次专注后的休息类型", () => {
    const data = createDefaultData();
    const onChange = vi.fn();
    const { container } = render(<PomodoroPage data={data} onChange={onChange} />);

    const secondRound = within(container).getByLabelText("第 2 次专注后的休息");
    fireEvent.click(within(secondRound).getByRole("button", { name: "长休息" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      pomodoroSettings: expect.objectContaining({
        breakSequence: ["short", "long", "short", "long"],
      }),
    }));
  });
});
