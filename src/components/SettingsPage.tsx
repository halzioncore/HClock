import { useEffect, useState } from "react";
import { ArrowDownToLine, BellRing, Check, Download, ExternalLink, Eye, FileText, Import, Layers2, Lightbulb, Pin, Upload } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  currentAutostart,
  ensureNotifications,
  exportBackup,
  importBackup,
  notify,
  playTone,
  setIdeaLayer,
  setWidgetLayer,
  setWidgetVisible,
  showIdea,
  syncAutostart,
} from "../services/bridge";
import type { AppData, SoundSetting, Theme, WidgetLayer } from "../types";
import { APP_TAG, APP_VERSION } from "../version";

interface Props {
  data: AppData;
  onChange: (data: AppData) => void;
}

const toneNames: Record<SoundSetting["tone"], string> = { clear: "清脆", soft: "柔和", bell: "铃音" };
const accentColors = [
  { color: "#76558f", label: "丁香紫" },
  { color: "#2474a6", label: "晴空蓝" },
  { color: "#28745f", label: "松石绿" },
  { color: "#b55245", label: "珊瑚红" },
  { color: "#8a651a", label: "琥珀金" },
];
const widgetLayers: Array<{ id: WidgetLayer; label: string; icon: typeof Pin }> = [
  { id: "top", label: "置顶", icon: Pin },
  { id: "normal", label: "普通", icon: Layers2 },
  { id: "bottom", label: "贴近桌面", icon: ArrowDownToLine },
];

export function SettingsPage({ data, onChange }: Props) {
  const settings = data.settings;
  const [message, setMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");

  useEffect(() => {
    void currentAutostart().then((enabled) => {
      if (enabled !== settings.autostart) onChange({ ...data, settings: { ...settings, autostart: enabled } });
    }).catch((error) => setMessage(`读取开机启动状态失败：${String(error)}`));
  // Read native state once when the page opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = (next: AppData["settings"]) => onChange({ ...data, settings: next });
  const updateSound = (kind: keyof AppData["settings"]["sounds"], next: SoundSetting) => updateSettings({ ...settings, sounds: { ...settings.sounds, [kind]: next } });

  const checkUpdate = async () => {
    const repository = import.meta.env.VITE_GITHUB_REPOSITORY as string | undefined;
    if (!repository) {
      setUpdateStatus("尚未连接 GitHub 仓库，发布构建时会自动配置。");
      return;
    }
    setUpdateStatus("正在检查…");
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json() as { tag_name?: string; html_url?: string };
      if (release.tag_name && release.tag_name !== APP_TAG && release.html_url) {
        setUpdateStatus(`发现新版本 ${release.tag_name}`);
        if (confirm(`发现新版本 ${release.tag_name}，打开 GitHub 下载页吗？`)) await openUrl(release.html_url);
      } else setUpdateStatus("当前已是最新版本。");
      updateSettings({ ...settings, lastUpdateCheck: new Date().toISOString() });
    } catch (error) {
      setUpdateStatus(`检查失败：${String(error)}`);
    }
  };

  return (
    <div className="page settings-page">
      <header className="page-header"><div><span className="eyebrow">设置</span><h1>按你的习惯调整 HClock</h1></div></header>
      {message && <div className="success-banner">{message}</div>}
      <section className="settings-section">
        <div className="settings-section-title"><h2>外观与关键色</h2><p>主界面、桌面课表和草稿纸使用同一套明暗外观与关键色。</p></div>
        <div className="segmented-control" aria-label="主题">
          {(["system", "light", "dark"] as Theme[]).map((theme) => <button key={theme} className={settings.theme === theme ? "active" : ""} onClick={() => updateSettings({ ...settings, theme })}>{theme === "system" ? "跟随系统" : theme === "light" ? "亮色" : "暗色"}</button>)}
        </div>
        <div className="accent-color-setting">
          <div><strong>关键色</strong><small>用于选中项、按钮、焦点和其他强调位置</small></div>
          <div className="accent-color-picker" aria-label="推荐关键色">
            {accentColors.map(({ color, label }) => <button key={color} aria-label={`${label} ${color}`} className={settings.accentColor.toLowerCase() === color ? "active" : ""} onClick={() => updateSettings({ ...settings, accentColor: color })}><i style={{ background: color }} /><span>{label}</span>{settings.accentColor.toLowerCase() === color && <Check size={14} />}</button>)}
            <label className="custom-accent-color"><input aria-label="自定义关键色" type="color" value={settings.accentColor} onChange={(event) => updateSettings({ ...settings, accentColor: event.target.value })} /><span>自定义</span></label>
          </div>
        </div>
        <label className="toggle-row widget-position-lock"><span><strong>固定桌面课表位置</strong><small>开启后无法拖动，避免误触改变位置</small></span><input type="checkbox" checked={settings.widget.positionLocked} onChange={(e) => updateSettings({ ...settings, widget: { ...settings.widget, positionLocked: e.target.checked } })} /></label>
        <div className="widget-layer-setting">
          <strong>桌面层级</strong>
          <div className="segmented-control widget-layer-control" aria-label="桌面课表层级">
            {widgetLayers.map(({ id, label, icon: Icon }) => <button key={id} className={settings.widget.layer === id ? "active" : ""} onClick={() => { updateSettings({ ...settings, widget: { ...settings.widget, layer: id } }); void setWidgetLayer(id); }}><Icon size={14} />{label}</button>)}
          </div>
        </div>
        <button className="secondary-button" onClick={() => void setWidgetVisible(true)}><Eye size={16} />显示桌面课表</button>
      </section>

      <section className="settings-section">
        <div className="settings-section-title"><h2>想法草稿纸</h2><p>像桌面课表一样显示在桌面，停止输入 5 秒后保存为 Markdown。</p></div>
        <label className="toggle-row widget-position-lock"><span><strong>固定想法草稿纸位置</strong><small>开启后无法拖动窗口，调整大小仍然可用</small></span><input type="checkbox" checked={settings.ideaWidget.positionLocked} onChange={(e) => updateSettings({ ...settings, ideaWidget: { ...settings.ideaWidget, positionLocked: e.target.checked } })} /></label>
        <div className="widget-layer-setting">
          <strong>想法窗口层级</strong>
          <div className="segmented-control widget-layer-control" aria-label="想法草稿纸层级">
            {widgetLayers.map(({ id, label, icon: Icon }) => <button key={id} className={settings.ideaWidget.layer === id ? "active" : ""} onClick={() => { updateSettings({ ...settings, ideaWidget: { ...settings.ideaWidget, layer: id } }); void setIdeaLayer(id); }}><Icon size={14} />{label}</button>)}
          </div>
        </div>
        <button className="secondary-button" onClick={() => void showIdea()}><Lightbulb size={16} />打开想法草稿纸</button>
        <div className="settings-inline-note"><FileText size={14} /><span>窗口可以直接拖动边缘调整大小，大小和位置会自动记住。</span></div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title"><h2>课程提醒</h2><p>单门课程可以在课程编辑器中覆盖这些默认值。</p></div>
        <label className="toggle-row"><span><strong>上课前提醒</strong><small>显示 Windows 通知并播放提示音</small></span><input type="checkbox" checked={settings.startNotification} onChange={(e) => updateSettings({ ...settings, startNotification: e.target.checked })} /></label>
        <label className="number-setting wide"><span>默认提前时间</span><span><input type="number" min="0" max="180" value={settings.startLeadMinutes} onChange={(e) => updateSettings({ ...settings, startLeadMinutes: Math.max(0, Math.min(180, Number(e.target.value))) })} />分钟</span></label>
        <label className="toggle-row"><span><strong>下课提醒</strong><small>显示本节课结束及课后休息时间</small></span><input type="checkbox" checked={settings.endNotification} onChange={(e) => updateSettings({ ...settings, endNotification: e.target.checked })} /></label>
        <div className="sound-grid">
          <SoundPicker label="上课" value={settings.sounds.classStart} onChange={(value) => updateSound("classStart", value)} />
          <SoundPicker label="下课" value={settings.sounds.classEnd} onChange={(value) => updateSound("classEnd", value)} />
          <SoundPicker label="番茄钟" value={settings.sounds.pomodoro} onChange={(value) => updateSound("pomodoro", value)} />
        </div>
        <button className="secondary-button" onClick={async () => { const granted = await ensureNotifications(); if (granted) { await notify("HClock 测试提醒", "系统通知已正常工作。"); playTone(settings.sounds.classStart); } else setMessage("通知权限未授予，请在 Windows 设置中允许 HClock 通知。"); }}><BellRing size={16} />测试通知与声音</button>
      </section>

      <section className="settings-section">
        <div className="settings-section-title"><h2>启动与数据</h2><p>课表只保存在本机，可以导出 JSON 备份。</p></div>
        <label className="toggle-row"><span><strong>登录 Windows 后自动启动</strong><small>静默启动主程序，同时显示桌面课表和想法草稿纸</small></span><input type="checkbox" checked={settings.autostart} onChange={async (e) => { try { const autostart = await syncAutostart(e.target.checked); updateSettings({ ...settings, autostart }); } catch (error) { setMessage(`开机启动设置失败：${String(error)}`); } }} /></label>
        <div className="button-row">
          <button className="secondary-button" onClick={async () => { try { if (await exportBackup()) setMessage("备份已导出。"); } catch (error) { setMessage(`导出失败：${String(error)}`); } }}><Upload size={16} />导出备份</button>
          <button className="secondary-button" onClick={async () => { if (!confirm("导入将替换当前全部课表和设置，继续吗？")) return; try { const imported = await importBackup(); if (imported) { onChange(imported); setMessage("备份已导入，原数据已自动备份。"); } } catch (error) { setMessage(`导入失败：${String(error)}`); } }}><Import size={16} />导入备份</button>
        </div>
      </section>

      <section className="settings-section about-section">
        <div><h2>HClock {APP_VERSION}</h2><p>懂我心意 · MIT License · 不收集使用数据</p>{updateStatus && <small className="update-status">{updateStatus}</small>}</div>
        <button className="secondary-button" onClick={() => void checkUpdate()}><Download size={16} />检查更新<ExternalLink size={14} /></button>
      </section>
    </div>
  );
}

function SoundPicker({ label, value, onChange }: { label: string; value: SoundSetting; onChange: (value: SoundSetting) => void }) {
  return <div className="sound-picker"><strong>{label}</strong><select value={value.tone} onChange={(e) => onChange({ ...value, tone: e.target.value as SoundSetting["tone"] })}>{Object.entries(toneNames).map(([tone, name]) => <option value={tone} key={tone}>{name}</option>)}</select><label><span>音量 {Math.round(value.volume * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={value.volume} onChange={(e) => onChange({ ...value, volume: Number(e.target.value) })} /></label><button className="text-button" onClick={() => playTone(value)}>试听</button></div>;
}
