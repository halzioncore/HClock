import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultData } from "../data/defaults";
import * as bridge from "../services/bridge";
import { IdeasPage } from "./IdeasPage";

describe("想法草稿纸列表", () => {
  it("可以从主界面直接修改想法标记", () => {
    const data = createDefaultData();
    data.ideas = [{
      id: "idea",
      title: "做一个小工具",
      createdAt: "2026-08-12T08:00:00.000Z",
      updatedAt: "2026-08-12T08:05:00.000Z",
      status: "inProgress",
      content: "先做一个可以验证的原型。",
      fileName: "2026-08-12的想法.md",
    }];
    const onChange = vi.fn();
    render(<IdeasPage data={data} onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: "标记想法：做一个小工具" }), { target: { value: "toVerify" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      ideas: [expect.objectContaining({ id: "idea", status: "toVerify" })],
    }));
  });

  it("新建想法时只打开窗口，不提前保存空记录", () => {
    const data = createDefaultData();
    const onChange = vi.fn();
    const showIdea = vi.spyOn(bridge, "showIdea").mockResolvedValue();

    const { container } = render(<IdeasPage data={data} onChange={onChange} />);
    fireEvent.click(within(container).getByRole("button", { name: "写一个想法" }));

    expect(showIdea).toHaveBeenCalledWith();
    expect(onChange).not.toHaveBeenCalled();
    showIdea.mockRestore();
  });
});
