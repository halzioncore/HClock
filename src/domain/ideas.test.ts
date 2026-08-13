import { describe, expect, it } from "vitest";
import { createIdea, ideaPreview, IDEA_STATUS_OPTIONS, sortIdeas } from "./ideas";

describe("想法草稿纸领域逻辑", () => {
  it("按日期生成 Markdown 文件名，并为同日想法追加序号", () => {
    const first = createIdea([], new Date("2026-08-12T08:00:00.000Z"));
    const second = createIdea([first], new Date("2026-08-12T09:00:00.000Z"));
    expect(first.fileName).toBe("2026年8月12日的第1个想法.md");
    expect(second.fileName).toBe("2026年8月12日的第2个想法.md");
    expect(second.status).toBe("inProgress");
  });

  it("支持六种状态并按更新时间倒序展示", () => {
    expect(IDEA_STATUS_OPTIONS.map((option) => option.id)).toEqual(["inProgress", "toVerify", "implemented", "abandoned", "paused", "archived"]);
    const older = createIdea([], new Date("2026-08-10T08:00:00.000Z"));
    const newer = createIdea([], new Date("2026-08-11T08:00:00.000Z"));
    expect(sortIdeas([older, newer]).map((idea) => idea.id)).toEqual([newer.id, older.id]);
  });

  it("生成单行预览并限制长度", () => {
    expect(ideaPreview("  第一行\n第二行  ")).toBe("第一行 第二行");
    expect(ideaPreview("abcdefgh", 5)).toBe("abcde…");
  });
});
