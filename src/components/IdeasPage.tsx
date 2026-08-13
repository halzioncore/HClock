import { useMemo, useState } from "react";
import { CircleDashed, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { ideaPreview, IDEA_STATUS_OPTIONS, sortIdeas } from "../domain/ideas";
import { showIdea } from "../services/bridge";
import type { AppData, Idea, IdeaStatus } from "../types";

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
}

type Filter = "all" | IdeaStatus;

function formatIdeaDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export function IdeasPage({ data, onChange }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const ideas = useMemo(() => sortIdeas(data.ideas).filter((idea) => filter === "all" || idea.status === filter), [data.ideas, filter]);
  const activeCount = data.ideas.filter((idea) => idea.status === "inProgress" || idea.status === "toVerify").length;

  const openNew = () => void showIdea();

  const openExisting = (idea: Idea) => void showIdea(idea.id);

  const updateStatus = (idea: Idea, status: IdeaStatus) => {
    onChange({ ...data, ideas: data.ideas.map((item) => item.id === idea.id ? { ...item, status, updatedAt: new Date().toISOString() } : item) });
  };

  const removeIdea = (idea: Idea) => {
    if (!confirm(`确定删除“${idea.title}”吗？对应的 Markdown 文件也会删除。`)) return;
    onChange({ ...data, ideas: data.ideas.filter((item) => item.id !== idea.id) });
  };

  return (
    <div className="page ideas-page">
      <header className="page-header ideas-header">
        <div><span className="eyebrow">想法草稿纸</span><h1>先记下来，再决定要不要实现</h1><p>每个有内容的想法都会自动保存为本机 Markdown 文件。</p></div>
        <button className="primary-button" onClick={openNew}><Plus size={17} />写一个想法</button>
      </header>

      <div className="ideas-summary" aria-label="想法统计">
        <div><span>全部想法</span><strong>{data.ideas.length}</strong></div>
        <div><span>正在推进</span><strong>{activeCount}</strong></div>
        <div><span>已实现</span><strong>{data.ideas.filter((idea) => idea.status === "implemented").length}</strong></div>
      </div>

      <div className="ideas-toolbar">
        <div><Lightbulb size={16} /><strong>我的想法</strong><span>{ideas.length} 条记录</span></div>
        <label className="ideas-filter"><span>筛选</span><select aria-label="筛选想法状态" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">全部状态</option>{IDEA_STATUS_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
      </div>

      <div className="ideas-list">
        {ideas.length === 0 ? <div className="ideas-empty"><CircleDashed size={28} /><strong>{data.ideas.length === 0 ? "还没有想法记录" : "没有符合条件的想法"}</strong><span>{data.ideas.length === 0 ? "把脑海中的念头写下来，稍后再整理。" : "换一个状态筛选试试。"}</span>{data.ideas.length === 0 && <button className="secondary-button" onClick={openNew}><Pencil size={15} />开始记录</button>}</div> : ideas.map((idea) => <IdeaRow key={idea.id} idea={idea} onOpen={openExisting} onStatusChange={updateStatus} onDelete={removeIdea} />)}
      </div>
    </div>
  );
}

function IdeaRow({ idea, onOpen, onStatusChange, onDelete }: { idea: Idea; onOpen: (idea: Idea) => void; onStatusChange: (idea: Idea, status: IdeaStatus) => void; onDelete: (idea: Idea) => void }) {
  return (
    <article className={`idea-row idea-status-${idea.status}`}>
      <div className="idea-row-mark" aria-hidden="true"><span /></div>
      <button className="idea-row-main" onClick={() => onOpen(idea)}>
        <div><strong>{idea.title}</strong><span>{formatIdeaDate(idea.updatedAt)} · {idea.fileName}</span></div>
        <p>{ideaPreview(idea.content) || "还没有写入内容，打开草稿纸继续记录。"}</p>
      </button>
      <div className="idea-row-actions">
        <select aria-label={`标记想法：${idea.title}`} value={idea.status} onChange={(event) => onStatusChange(idea, event.target.value as IdeaStatus)}>{IDEA_STATUS_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select>
        <button className="icon-button" title="打开想法草稿纸" aria-label={`打开想法草稿纸：${idea.title}`} onClick={() => onOpen(idea)}><Pencil size={15} /></button>
        <button className="icon-button danger-icon" title="删除想法" aria-label={`删除想法：${idea.title}`} onClick={() => onDelete(idea)}><Trash2 size={15} /></button>
      </div>
    </article>
  );
}
