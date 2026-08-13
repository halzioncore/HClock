import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultData } from "../data/defaults";
import { IdeaDraftWindow } from "./IdeaDraftWindow";

describe("想法草稿纸窗口", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("停止输入五秒后才创建并保存想法", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<IdeaDraftWindow data={createDefaultData()} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "想法内容" }), { target: { value: "记录一个新念头" } });
    act(() => vi.advanceTimersByTime(4_999));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      ideas: [expect.objectContaining({ content: "记录一个新念头", fileName: expect.stringMatching(/的第1个想法\.md$/) })],
    }));
  });

  it("中文输入法合成期间不保存，结束后重新等待五秒", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<IdeaDraftWindow data={createDefaultData()} onChange={onChange} />);
    const editor = screen.getByRole("textbox", { name: "想法内容" });

    fireEvent.compositionStart(editor);
    fireEvent.change(editor, { target: { value: "xiangfa" } });
    act(() => vi.advanceTimersByTime(10_000));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(editor, { target: { value: "想法" } });
    fireEvent.compositionEnd(editor, { data: "想法" });
    act(() => vi.advanceTimersByTime(5_000));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      ideas: [expect.objectContaining({ content: "想法" })],
    }));
  });

  it("实时渲染 Markdown 并清理危险 HTML", () => {
    render(<IdeaDraftWindow data={createDefaultData()} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "想法内容" }), { target: { value: "# 标题\n\n- 项目\n\n<script>alert(1)</script>" } });

    const preview = screen.getByRole("article", { name: "Markdown 实时预览" });
    expect(preview.querySelector("h1")).toHaveTextContent("标题");
    expect(preview.querySelector("li")).toHaveTextContent("项目");
    expect(preview.querySelector("script")).toBeNull();
  });
});
