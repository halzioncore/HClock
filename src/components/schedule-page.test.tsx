import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultData } from "../data/defaults";
import { SchedulePage } from "./SchedulePage";

afterEach(cleanup);

describe("课程编辑器", () => {
  it("可以为一门课程选择多个上课日", () => {
    const data = createDefaultData();
    const onChange = vi.fn();
    render(<SchedulePage data={data} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "添加课程" }));
    fireEvent.change(screen.getByRole("textbox", { name: "课程名称 *" }), { target: { value: "多日课程" } });
    expect(screen.getByRole("checkbox", { name: "周一" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "周三" }));
    fireEvent.click(screen.getByRole("button", { name: "保存课程" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      schedules: [expect.objectContaining({
        courses: [expect.objectContaining({ title: "多日课程", weekdays: [1, 3] })],
      })],
    }));
  });

  it("不允许清空全部上课日", () => {
    const data = createDefaultData();
    render(<SchedulePage data={data} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "添加课程" }));
    fireEvent.change(screen.getByRole("textbox", { name: "课程名称 *" }), { target: { value: "测试课程" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "周一" }));
    fireEvent.click(screen.getByRole("button", { name: "保存课程" }));

    expect(screen.getByText("请至少选择一个上课日。")).toBeInTheDocument();
  });
});
