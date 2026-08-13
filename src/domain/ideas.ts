import { createId } from "../types";
import type { Idea, IdeaStatus } from "../types";

export const IDEA_STATUS_OPTIONS: Array<{ id: IdeaStatus; label: string; description: string }> = [
  { id: "inProgress", label: "进行中", description: "正在思考或推进" },
  { id: "toVerify", label: "待验证", description: "需要测试或确认" },
  { id: "implemented", label: "已实现", description: "已经落地完成" },
  { id: "abandoned", label: "已放弃", description: "决定不再继续" },
  { id: "paused", label: "已搁置", description: "以后可能继续" },
  { id: "archived", label: "已归档", description: "保留记录，不再处理" },
];

const ideaStatusLabels = Object.fromEntries(IDEA_STATUS_OPTIONS.map((option) => [option.id, option.label])) as Record<IdeaStatus, string>;

export function ideaStatusLabel(status: IdeaStatus): string {
  return ideaStatusLabels[status];
}

export function createIdea(existing: Idea[], now = new Date()): Idea {
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  const countForDate = existing.filter((idea) => {
    const createdAt = new Date(idea.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    const ideaDateKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;
    return ideaDateKey === dateKey;
  }).length;
  const base = `${date}的第${countForDate + 1}个想法`;
  const used = new Set(existing.map((idea) => idea.fileName));
  let fileName = `${base}.md`;
  let sequence = countForDate + 1;
  while (used.has(fileName)) {
    sequence += 1;
    fileName = `${date}的第${sequence}个想法.md`;
  }
  const timestamp = now.toISOString();
  return {
    id: createId(),
    title: base,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "inProgress",
    content: "",
    fileName,
  };
}

export function sortIdeas(ideas: Idea[]): Idea[] {
  return [...ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
}

export function ideaPreview(content: string, maxLength = 150): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
}
