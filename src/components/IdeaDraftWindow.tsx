import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { ArrowDownToLine, Columns2, ExternalLink, Eye, FilePenLine, FileText, Layers2, LockKeyhole, Pin, Plus, UnlockKeyhole, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createIdea, ideaStatusLabel, IDEA_STATUS_OPTIONS } from "../domain/ideas";
import { consumeIdeaOpenRequest, isTauri, saveState, setIdeaLayer, setIdeaVisible, showMain } from "../services/bridge";
import type { AppData, Idea, IdeaStatus, WidgetLayer } from "../types";

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
}

type EditorMode = "edit" | "split" | "preview";
const IDEA_SAVE_DELAY = 5_000;

export function IdeaDraftWindow({ data, onChange }: Props) {
  const queryIdeaId = new URLSearchParams(window.location.search).get("ideaId");
  const [selectedId, setSelectedId] = useState<string | null>(queryIdeaId);
  const [draftIdea, setDraftIdea] = useState<Idea>(() => data.ideas.find((idea) => idea.id === queryIdeaId) ?? createIdea(data.ideas));
  const [saveLabel, setSaveLabel] = useState("等待输入");
  const [editorMode, setEditorMode] = useState<EditorMode>("split");
  const dataRef = useRef(data);
  const draftRef = useRef(draftIdea);
  const saveTimer = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);
  const composingRef = useRef(false);
  dataRef.current = data;
  draftRef.current = draftIdea;

  const settings = data.settings.ideaWidget;

  useEffect(() => {
    if (!selectedId || dirtyRef.current) return;
    const stored = data.ideas.find((idea) => idea.id === selectedId);
    if (stored && stored.updatedAt !== draftRef.current.updatedAt) setDraftIdea(stored);
  }, [data.ideas, selectedId]);

  useEffect(() => {
    if (!queryIdeaId) return;
    const stored = data.ideas.find((idea) => idea.id === queryIdeaId);
    if (stored) {
      setSelectedId(queryIdeaId);
      setDraftIdea(stored);
      draftRef.current = stored;
    }
  }, [data.ideas, queryIdeaId]);

  useEffect(() => {
    if (!isTauri()) return;
    void setIdeaLayer(settings.layer);
  }, [settings.layer]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  const commitDraft = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (!dirtyRef.current || composingRef.current) return dataRef.current;

    const nextIdea = draftRef.current;
    const current = dataRef.current;
    const exists = current.ideas.some((idea) => idea.id === nextIdea.id);
    if (!exists && !nextIdea.content.trim()) {
      dirtyRef.current = false;
      setSaveLabel("等待输入");
      return current;
    }

    const nextData = {
      ...current,
      ideas: exists
        ? current.ideas.map((idea) => idea.id === nextIdea.id ? nextIdea : idea)
        : [...current.ideas, nextIdea],
    };
    dirtyRef.current = false;
    dataRef.current = nextData;
    setSelectedId(nextIdea.id);
    setSaveLabel("已自动保存");
    onChange(nextData);
    return nextData;
  };

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(() => {
      void saveState(commitDraft());
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  // The callback reads current data through refs, so the native listener only needs one registration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleSave = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (composingRef.current) {
      setSaveLabel("正在输入…");
      return;
    }
    setSaveLabel("将在停止输入 5 秒后保存");
    saveTimer.current = window.setTimeout(commitDraft, IDEA_SAVE_DELAY);
  };

  const createAndSelect = () => {
    commitDraft();
    const idea = createIdea(dataRef.current.ideas);
    setDraftIdea(idea);
    draftRef.current = idea;
    setSelectedId(null);
    dirtyRef.current = false;
    setSaveLabel("等待输入");
  };

  const handlePendingRequest = async () => {
    const request = await consumeIdeaOpenRequest();
    if (request === "") {
      createAndSelect();
    } else if (request) {
      const stored = dataRef.current.ideas.find((idea) => idea.id === request);
      if (!stored) return;
      commitDraft();
      setSelectedId(request);
      setDraftIdea(stored);
      draftRef.current = stored;
      dirtyRef.current = false;
      setSaveLabel("已加载");
    } else if (request !== null) {
      setSelectedId(null);
      setSaveLabel("等待输入");
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen("idea-opened", () => { void handlePendingRequest(); }).then((dispose) => { unlisten = dispose; });
    void handlePendingRequest();
    return () => unlisten?.();
  // This listener intentionally lives for the lifetime of the draft window.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateIdea = (patch: Partial<Idea>) => {
    const nextIdea = { ...draftRef.current, ...patch, updatedAt: new Date().toISOString() };
    draftRef.current = nextIdea;
    setDraftIdea(nextIdea);
    dirtyRef.current = true;
    scheduleSave();
  };

  const updateSettings = (patch: Partial<AppData["settings"]["ideaWidget"]>) => {
    const nextData = { ...dataRef.current, settings: { ...dataRef.current.settings, ideaWidget: { ...dataRef.current.settings.ideaWidget, ...patch } } };
    dataRef.current = nextData;
    onChange(nextData);
  };

  const cycleLayer = async () => {
    const layers: WidgetLayer[] = ["top", "normal", "bottom"];
    const nextLayer = layers[(layers.indexOf(settings.layer) + 1) % layers.length];
    updateSettings({ layer: nextLayer });
    await setIdeaLayer(nextLayer);
  };

  const close = async () => {
    const nextData = commitDraft();
    if (!isTauri()) {
      window.close();
      return;
    }
    try {
      await saveState(nextData);
    } finally {
      await setIdeaVisible(false);
    }
  };

  const layerTitle = settings.layer === "top" ? "当前置顶，点击切换为普通" : settings.layer === "normal" ? "当前普通，点击切换为贴近桌面" : "当前贴近桌面，点击切换为置顶";
  const LayerIcon = settings.layer === "top" ? Pin : settings.layer === "bottom" ? ArrowDownToLine : Layers2;

  return (
    <div className="idea-window-shell">
      <header className={`idea-window-titlebar${settings.positionLocked ? " position-locked" : ""}`} onMouseDown={(event) => { if (event.button === 0 && isTauri() && !settings.positionLocked) void getCurrentWindow().startDragging(); }}>
        <div className="idea-window-heading"><span><FileText size={15} /></span><div><strong>想法草稿纸</strong><small>{draftIdea.title}</small></div></div>
        <div className="widget-actions" onMouseDown={(event) => event.stopPropagation()}>
          <button data-tooltip={settings.positionLocked ? "解锁位置，恢复窗口拖动" : "锁定位置，避免误拖窗口"} aria-label={settings.positionLocked ? "解锁想法草稿纸位置" : "锁定想法草稿纸位置"} aria-pressed={settings.positionLocked} onClick={() => updateSettings({ positionLocked: !settings.positionLocked })}>{settings.positionLocked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button>
          <button data-tooltip={layerTitle} aria-label={layerTitle} onClick={() => void cycleLayer()}><LayerIcon size={15} /></button>
          <button data-tooltip="新建想法" aria-label="新建想法" onClick={createAndSelect}><Plus size={15} /></button>
          <button data-tooltip="打开 HClock 主界面" aria-label="打开 HClock 主界面" onClick={() => void showMain()}><ExternalLink size={15} /></button>
          <button data-tooltip="关闭想法草稿纸" aria-label="关闭想法草稿纸" onClick={() => void close()}><X size={16} /></button>
        </div>
      </header>

      <IdeaEditor
        idea={draftIdea}
        saveLabel={saveLabel}
        mode={editorMode}
        onMode={setEditorMode}
        onChange={updateIdea}
        onCompositionStart={() => {
          composingRef.current = true;
          if (saveTimer.current) window.clearTimeout(saveTimer.current);
          setSaveLabel("正在输入…");
        }}
        onCompositionEnd={(content) => {
          composingRef.current = false;
          updateIdea({ content });
        }}
      />
    </div>
  );
}

function IdeaEditor({ idea, saveLabel, mode, onMode, onChange, onCompositionStart, onCompositionEnd }: {
  idea: Idea;
  saveLabel: string;
  mode: EditorMode;
  onMode: (mode: EditorMode) => void;
  onChange: (patch: Partial<Idea>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (content: string) => void;
}) {
  const markdown = useMemo(() => DOMPurify.sanitize(marked.parse(idea.content) as string), [idea.content]);

  return (
    <main className="idea-editor">
      <div className="idea-editor-meta">
        <label><span>自动名称</span><input readOnly value={idea.title} /></label>
        <label><span>标记</span><select value={idea.status} onChange={(event) => onChange({ status: event.target.value as IdeaStatus })}>{IDEA_STATUS_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
        <div className="idea-save-state"><span className={`idea-save-dot${idea.content.trim() ? " has-content" : ""}`} />{idea.content.trim() ? saveLabel : "输入内容后保存为 Markdown"}</div>
        <div className="idea-view-switch" aria-label="Markdown 显示方式">
          <button aria-label="仅编辑" data-tooltip="仅显示 Markdown 编辑器" className={mode === "edit" ? "active" : ""} onClick={() => onMode("edit")}><FilePenLine size={14} /></button>
          <button aria-label="分栏预览" data-tooltip="编辑与预览同步显示" className={mode === "split" ? "active" : ""} onClick={() => onMode("split")}><Columns2 size={14} /></button>
          <button aria-label="仅预览" data-tooltip="仅显示 Markdown 效果" className={mode === "preview" ? "active" : ""} onClick={() => onMode("preview")}><Eye size={14} /></button>
        </div>
      </div>
      <div className={`idea-editor-workspace mode-${mode}`}>
        {mode !== "preview" && <textarea className="idea-editor-content" aria-label="想法内容" autoFocus placeholder="想到什么就写什么……支持 Markdown 语法。" value={idea.content} onChange={(event) => onChange({ content: event.target.value })} onCompositionStart={onCompositionStart} onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)} />}
        {mode !== "edit" && (
          <article
            className="idea-markdown-preview"
            aria-label="Markdown 实时预览"
            onClick={(event) => {
              const link = (event.target as HTMLElement).closest("a");
              const href = link?.getAttribute("href");
              if (!href || !/^https?:\/\//i.test(href)) return;
              event.preventDefault();
              if (isTauri()) void openUrl(href);
              else window.open(href, "_blank", "noopener,noreferrer");
            }}
            dangerouslySetInnerHTML={{ __html: markdown || '<p class="idea-preview-empty">Markdown 预览会显示在这里</p>' }}
          />
        )}
      </div>
      <footer className="idea-editor-footer"><span>创建于 {new Date(idea.createdAt).toLocaleString("zh-CN")}</span><span>{ideaStatusLabel(idea.status)} · {idea.content.length} 字</span></footer>
    </main>
  );
}
