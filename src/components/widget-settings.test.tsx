import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultData } from "../data/defaults";
import { SettingsPage } from "./SettingsPage";
import { Widget } from "./Widget";

describe("桌面课表与关键色设置", () => {
  it("可从桌面课表标题栏固定当前位置", () => {
    const data = createDefaultData();
    const onChange = vi.fn();
    render(<Widget data={data} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "锁定桌面课表位置" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        widget: expect.objectContaining({ positionLocked: true }),
      }),
    }));
  });

  it("可以选择推荐关键色并自定义关键色", () => {
    const data = createDefaultData();
    const onChange = vi.fn();
    const { container } = render(<SettingsPage data={data} onChange={onChange} />);

    fireEvent.click(within(container).getByRole("button", { name: "松石绿 #28745f" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ accentColor: "#28745f" }),
    }));

    fireEvent.change(within(container).getByLabelText("自定义关键色"), { target: { value: "#123456" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ accentColor: "#123456" }),
    }));
  });
});
