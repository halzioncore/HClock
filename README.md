# HClock - 懂我心意

HClock 是一个面向 Windows 10/11 的轻量课程表、日程与番茄钟。它使用 Tauri、React 与 Rust 构建，课表、日程和设置只保存在本机，无账号、无广告、无遥测。

## 已有功能

- 多课表创建、复制、重命名与切换
- 学期范围、单门课程多上课日、每周/单双周/指定周课程
- 预设节次、自定义起止时间和每节课后休息
- 单次停课和改期
- 独立月历日程，点击日期即可添加，并在日期侧栏查看、编辑和删除日程
- 想法草稿纸：独立编辑窗口、Markdown 编辑/分栏/实时预览、状态标记及主界面集中查看
- Windows 上课前、下课通知与可调音量的内置声音
- 支持位置记忆、位置锁定和三档窗口层级的今日课程桌面课表
- 主界面、桌面课表和草稿纸统一跟随系统/亮色/暗色外观，并可从丁香紫等推荐色中选择或自定义关键色
- 系统托盘、无需管理员权限的登录启动及高于正常的进程优先级；首次打开显示主界面，之后随 Windows 登录启动时只显示桌面课表和想法草稿纸
- 可自定义专注、短休息、长休息时长与逐轮休息安排的番茄钟
- 番茄钟默认使用 25、5、15 整分钟；秒数仍支持 0 到 59，且每个阶段的分钟和秒数不能同时为 0
- JSON 备份导入导出与 GitHub 新版本检查

## 使用说明

从 GitHub Releases 下载最新的 x64 NSIS 安装包并安装。当前开源版本没有商业代码签名证书，因此 Windows SmartScreen 可能显示“未知发布者”；请只从项目 Release 页面下载，并核对随 Release 提供的 SHA-256。

在主界面的“设置”中打开“想法草稿纸”即可显示独立窗口。窗口打开后直接输入内容，首次输入时会自动创建当天的第一个想法；同一天继续新建会依次命名为“某年某月某日的第 2 个想法”等。正文可在编辑、分栏和预览三种视图间切换，Markdown 效果会随输入更新。为兼容中文输入法，内容只在输入结束并静置 5 秒后保存；新建或关闭窗口时会提交已完成的输入。标题栏还可以调整窗口层级和锁定位置，鼠标移到图标按钮上会显示用途。窗口支持缩小至 `320 × 260`，大小与位置会自动记忆。主界面的“想法草稿纸”页面可以查看全部记录、修改状态、继续编辑或删除记录。

## 开发环境

1. 安装 Node.js 24、[Git](https://git-scm.com/)和稳定版 [Rust](https://www.rust-lang.org/tools/install)。
2. 安装 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾选“使用 C++ 的桌面开发”和 Windows SDK。
3. Windows 10 如果没有 WebView2，安装程序会在首次安装时下载。

```powershell
npm install
npm run tauri dev
```

## 质量检查

```powershell
npm run typecheck
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

开发和提交前请先阅读 [开发守则.md](./%E5%BC%80%E5%8F%91%E5%AE%88%E5%88%99.md)。

## 构建安装包

```powershell
npm run tauri build
```

NSIS 安装包位于 `src-tauri/target/release/bundle/nsis/`。安装和卸载界面固定使用简体中文，并支持选择 C 盘、D 盘等自定义安装目录。首版不使用付费代码签名证书，Windows SmartScreen 可能显示“未知发布者”；可以对照 GitHub Release 中的 SHA-256 文件校验安装包。

## 发布

1. 在 GitHub 创建名为 `HClock` 的公开仓库并推送代码。
2. 同步修改 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的语义化版本号；本次正式版为 `1.0.0`。
3. 更新 `CHANGELOG.md`，创建并推送 `v1.0.0` 标签。
4. GitHub Actions 会构建 x64 NSIS 安装包、生成 SHA-256 并创建 Release。

## 参与贡献

欢迎通过 Issue 报告可复现的问题或提出经过说明的功能建议。提交代码前请：

1. 阅读 [开发守则.md](./%E5%BC%80%E5%8F%91%E5%AE%88%E5%88%99.md)，不要提交真实课表、密钥、构建产物或本机路径。
2. 从 `main` 创建主题分支，提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。
3. 保持改动范围清晰，并为课程计算、提醒、数据迁移或番茄钟状态变化补充测试。
4. 在 Pull Request 前运行“质量检查”中的全部命令，并说明手工验证过的 Windows 版本。

## 数据、安全与隐私

运行数据保存在 `%APPDATA%\app.hclock.desktop`，想法 Markdown 位于其中的 `ideas` 子目录。此目录与用户选择的程序安装目录相互独立，因此把程序安装到 D 盘不会影响课表读取。导入备份前会自动保留当前数据。除检查 GitHub Release 外，HClock 不发送网络请求，也不收集遥测。

安全问题请优先使用 GitHub 的 Private vulnerability reporting，不要在公开 Issue 中披露可被利用的细节。

## 许可证

[MIT](./LICENSE) © 2026 HClock Contributors
