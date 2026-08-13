use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, mpsc},
    thread,
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, State,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartExt};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

struct AppStore {
    path: PathBuf,
    ideas_dir: PathBuf,
    pending_idea: Mutex<Option<String>>,
    widget_position_path: PathBuf,
    widget_position_sender: mpsc::Sender<WidgetPosition>,
    idea_position_path: PathBuf,
    idea_position_sender: mpsc::Sender<WidgetPosition>,
    idea_size_path: PathBuf,
    idea_size_sender: mpsc::Sender<WindowSize>,
    state: Mutex<Value>,
    sent_path: PathBuf,
    sent: Mutex<HashSet<String>>,
    first_launch: bool,
}

const APP_IDENTIFIER: &str = "app.hclock.desktop";
#[derive(Clone, Copy, Deserialize, Serialize)]
struct WidgetPosition {
    x: i32,
    y: i32,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct WindowSize {
    width: u32,
    height: u32,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReminderData {
    active_schedule_id: Option<String>,
    schedules: Vec<Schedule>,
    calendar_events: Vec<CalendarEvent>,
    settings: ReminderSettings,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Schedule {
    id: String,
    semester_start: String,
    semester_end: String,
    time_slots: Vec<TimeSlot>,
    courses: Vec<Course>,
    exceptions: Vec<CourseException>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEvent {
    id: String,
    title: String,
    date: String,
    start: String,
    end: String,
    location: String,
    color: String,
    notes: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdeaData {
    id: String,
    title: String,
    created_at: String,
    updated_at: String,
    status: String,
    content: String,
    file_name: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimeSlot {
    id: String,
    start: String,
    end: String,
    break_after_minutes: i64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Course {
    id: String,
    title: String,
    location: String,
    weekdays: Vec<u32>,
    time: CourseTime,
    recurrence: Recurrence,
    reminder: Option<CourseReminder>,
}

#[derive(Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum CourseTime {
    Slot { slot_id: String },
    Custom { start: String, end: String },
}

#[derive(Clone, Deserialize)]
struct Recurrence {
    kind: String,
    #[serde(default)]
    weeks: Vec<i64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CourseReminder {
    mode: String,
    lead_minutes: Option<i64>,
    end_enabled: Option<bool>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CourseException {
    id: String,
    course_id: String,
    original_date: String,
    action: String,
    new_date: Option<String>,
    new_start: Option<String>,
    new_end: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReminderSettings {
    start_notification: bool,
    end_notification: bool,
    start_lead_minutes: i64,
    sounds: ReminderSounds,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReminderSounds {
    class_start: SoundSetting,
    class_end: SoundSetting,
}

#[derive(Clone, Deserialize, Serialize)]
struct SoundSetting {
    tone: String,
    volume: f64,
}

#[derive(Clone)]
struct ReminderOccurrence {
    key: String,
    course: Course,
    date: NaiveDate,
    start: String,
    end: String,
    break_after_minutes: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SoundEvent {
    setting: SoundSetting,
}

fn default_state() -> Value {
    let today = Local::now().date_naive();
    let monday = today - ChronoDuration::days(today.weekday().num_days_from_monday().into());
    let semester_end = monday + ChronoDuration::weeks(20) - ChronoDuration::days(1);
    let schedule_id = Uuid::new_v4().to_string();
    let slots = [
        ("第 1 节", "08:00", "08:45", 10),
        ("第 2 节", "08:55", "09:40", 20),
        ("第 3 节", "10:00", "10:45", 10),
        ("第 4 节", "10:55", "11:40", 80),
        ("第 5 节", "13:00", "13:45", 10),
        ("第 6 节", "13:55", "14:40", 20),
        ("第 7 节", "15:00", "15:45", 10),
        ("第 8 节", "15:55", "16:40", 0),
    ]
    .into_iter()
    .map(|(name, start, end, rest)| {
        json!({
            "id": Uuid::new_v4().to_string(), "name": name,
            "start": start, "end": end, "breakAfterMinutes": rest
        })
    })
    .collect::<Vec<_>>();

    json!({
        "schemaVersion": 13,
        "activeScheduleId": schedule_id,
        "schedules": [{
            "id": schedule_id,
            "name": "我的课表",
            "semesterStart": monday.format("%Y-%m-%d").to_string(),
            "semesterEnd": semester_end.format("%Y-%m-%d").to_string(),
            "timeSlots": slots,
            "courses": [],
            "exceptions": []
        }],
        "calendarEvents": [],
        "ideas": [],
        "settings": {
            "theme": "system",
            "accentColor": "#76558f",
            "startNotification": true,
            "endNotification": true,
            "startLeadMinutes": 5,
            "autostart": false,
            "widget": { "layer": "top", "positionLocked": false },
            "ideaWidget": { "layer": "normal", "positionLocked": false },
            "sounds": {
                "classStart": { "tone": "clear", "volume": 0.65 },
                "classEnd": { "tone": "soft", "volume": 0.55 },
                "pomodoro": { "tone": "bell", "volume": 0.65 }
            }
        },
        "pomodoroSettings": {
            "focusMinutes": 25, "focusSeconds": 0,
            "shortBreakMinutes": 5, "shortBreakSeconds": 0,
            "longBreakMinutes": 15, "longBreakSeconds": 0,
            "breakSequence": ["short", "short", "short", "long"],
            "autoStartBreaks": false, "autoStartFocus": false
        },
        "pomodoroSession": {
            "phase": "focus", "status": "idle", "remainingSeconds": 1500,
            "completedFocuses": 0
        }
    })
}

fn validate_state(value: &Value) -> Result<(), String> {
    let object = value.as_object().ok_or("根数据必须是对象")?;
    if object.get("schemaVersion").and_then(Value::as_u64) != Some(13) {
        return Err("不支持的数据版本".into());
    }
    if !object.get("schedules").is_some_and(Value::is_array) {
        return Err("课表数据缺失".into());
    }
    let reminder_data = serde_json::from_value::<ReminderData>(value.clone())
        .map_err(|error| format!("课表或提醒设置无效: {error}"))?;
    for schedule in &reminder_data.schedules {
        for course in &schedule.courses {
            let unique_weekdays = course.weekdays.iter().collect::<HashSet<_>>();
            if course.weekdays.is_empty()
                || unique_weekdays.len() != course.weekdays.len()
                || course
                    .weekdays
                    .iter()
                    .any(|weekday| !(1..=7).contains(weekday))
            {
                return Err("课程上课日无效".into());
            }
        }
    }
    for event in &reminder_data.calendar_events {
        let Some(start) = NaiveTime::parse_from_str(&event.start, "%H:%M").ok() else {
            return Err("日程开始时间无效".into());
        };
        let Some(end) = NaiveTime::parse_from_str(&event.end, "%H:%M").ok() else {
            return Err("日程结束时间无效".into());
        };
        if event.id.trim().is_empty()
            || event.title.trim().is_empty()
            || event.title.chars().count() > 120
            || event.location.chars().count() > 120
            || event.color.trim().is_empty()
            || event.color.chars().count() > 20
            || event.notes.chars().count() > 500
            || event.date.len() != 10
            || parse_date(&event.date).is_none()
            || start >= end
        {
            return Err("日程数据无效".into());
        }
    }

    let ideas = object
        .get("ideas")
        .and_then(Value::as_array)
        .ok_or("想法数据缺失")?;
    let mut idea_ids = HashSet::new();
    let mut idea_files = HashSet::new();
    for idea in ideas {
        let idea = serde_json::from_value::<IdeaData>(idea.clone())
            .map_err(|error| format!("想法数据无效: {error}"))?;
        if idea.id.trim().is_empty()
            || idea.id.chars().count() > 100
            || idea.id.chars().any(|character| character.is_control())
            || !idea_ids.insert(idea.id.clone())
            || idea.title.trim().is_empty()
            || idea.title.chars().count() > 120
            || idea.title.chars().any(|character| character.is_control())
            || idea.content.chars().count() > 200_000
            || idea.content.chars().any(|character| character == '\0')
            || idea.created_at.chars().count() > 64
            || idea.updated_at.chars().count() > 64
            || idea
                .created_at
                .chars()
                .any(|character| character.is_control())
            || idea
                .updated_at
                .chars()
                .any(|character| character.is_control())
            || !matches!(
                idea.status.as_str(),
                "inProgress" | "toVerify" | "implemented" | "abandoned" | "paused" | "archived"
            )
            || idea.file_name.trim().is_empty()
            || idea.file_name.chars().count() > 120
            || !idea.file_name.ends_with(".md")
            || idea.file_name.contains('/')
            || idea.file_name.contains('\\')
            || idea.file_name.contains("..")
            || idea
                .file_name
                .chars()
                .any(|character| character.is_control())
            || !idea_files.insert(idea.file_name)
        {
            return Err("想法数据无效".into());
        }
    }

    let widget = object
        .get("settings")
        .and_then(|settings| settings.get("widget"))
        .and_then(Value::as_object)
        .ok_or("桌面课表设置缺失")?;
    if !matches!(
        widget.get("layer").and_then(Value::as_str),
        Some("top" | "normal" | "bottom")
    ) {
        return Err("桌面课表层级无效".into());
    }
    if !widget.get("positionLocked").is_some_and(Value::is_boolean) {
        return Err("桌面课表固定位置设置无效".into());
    }
    let accent_color = object
        .get("settings")
        .and_then(|settings| settings.get("accentColor"))
        .and_then(Value::as_str)
        .ok_or("关键色缺失")?;
    if accent_color.len() != 7
        || !accent_color.starts_with('#')
        || !accent_color[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("关键色无效".into());
    }
    let idea_widget = object
        .get("settings")
        .and_then(|settings| settings.get("ideaWidget"))
        .and_then(Value::as_object)
        .ok_or("想法草稿纸设置缺失")?;
    if !matches!(
        idea_widget.get("layer").and_then(Value::as_str),
        Some("top" | "normal" | "bottom")
    ) {
        return Err("想法草稿纸层级无效".into());
    }
    if !idea_widget
        .get("positionLocked")
        .is_some_and(Value::is_boolean)
    {
        return Err("想法草稿纸固定位置设置无效".into());
    }
    let pomodoro_settings = object
        .get("pomodoroSettings")
        .and_then(Value::as_object)
        .ok_or("番茄钟设置缺失")?;
    for (minutes_key, seconds_key, max_minutes) in [
        ("focusMinutes", "focusSeconds", 180),
        ("shortBreakMinutes", "shortBreakSeconds", 60),
        ("longBreakMinutes", "longBreakSeconds", 120),
    ] {
        let minutes = pomodoro_settings
            .get(minutes_key)
            .and_then(Value::as_u64)
            .ok_or("番茄钟分钟数无效")?;
        let seconds = pomodoro_settings
            .get(seconds_key)
            .and_then(Value::as_u64)
            .ok_or("番茄钟秒数无效")?;
        if minutes > max_minutes || seconds > 59 {
            return Err("番茄钟时长超出范围".into());
        }
        if minutes == 0 && seconds == 0 {
            return Err("番茄钟分钟和秒数不能同时为 0".into());
        }
    }
    let break_sequence = object
        .get("pomodoroSettings")
        .and_then(|settings| settings.get("breakSequence"))
        .and_then(Value::as_array)
        .ok_or("番茄钟休息计划缺失")?;
    if !(1..=12).contains(&break_sequence.len())
        || !break_sequence
            .iter()
            .all(|item| matches!(item.as_str(), Some("short" | "long")))
    {
        return Err("番茄钟休息计划无效".into());
    }
    Ok(())
}

fn migrate_state(mut value: Value) -> Result<(Value, bool), String> {
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or("数据版本缺失")?;
    if version == 13 {
        return Ok((value, false));
    }
    if !matches!(version, 1..=12) {
        return Err("不支持的数据版本".into());
    }

    let root = value.as_object_mut().ok_or("根数据必须是对象")?;
    let widget = root
        .get_mut("settings")
        .and_then(Value::as_object_mut)
        .and_then(|settings| settings.get_mut("widget"))
        .and_then(Value::as_object_mut)
        .ok_or("桌面课表设置缺失")?;
    if version == 1 {
        let layer = if widget
            .remove("alwaysOnTop")
            .and_then(|value| value.as_bool())
            .unwrap_or(true)
        {
            "top"
        } else {
            "normal"
        };
        widget.insert("layer".into(), json!(layer));
        widget.insert("theme".into(), json!("classic"));
    }
    if version < 3 {
        widget.insert("positionLocked".into(), json!(false));
    }
    widget.remove("opacity");

    if matches!(
        widget.get("theme").and_then(Value::as_str),
        Some("liquidGlass" | "lilac")
    ) {
        widget.insert("theme".into(), json!("day"));
    }
    widget.remove("theme");

    if version <= 5 {
        let pomodoro_settings = root
            .get_mut("pomodoroSettings")
            .and_then(Value::as_object_mut)
            .ok_or("番茄钟设置缺失")?;
        let cycles = pomodoro_settings
            .remove("cycles")
            .and_then(|value| value.as_u64())
            .unwrap_or(4)
            .clamp(1, 12) as usize;
        if !pomodoro_settings.contains_key("breakSequence") {
            let sequence = (0..cycles)
                .map(|index| if index + 1 == cycles { "long" } else { "short" })
                .collect::<Vec<_>>();
            pomodoro_settings.insert("breakSequence".into(), json!(sequence));
        }
        pomodoro_settings.insert("focusSeconds".into(), json!(0));
        pomodoro_settings.insert("shortBreakSeconds".into(), json!(0));
        pomodoro_settings.insert("longBreakSeconds".into(), json!(0));
    }

    let pomodoro_settings = root
        .get_mut("pomodoroSettings")
        .and_then(Value::as_object_mut)
        .ok_or("番茄钟设置缺失")?;
    let had_legacy_default_durations = version >= 6
        && pomodoro_settings
            .get("focusMinutes")
            .and_then(Value::as_u64)
            == Some(25)
        && pomodoro_settings
            .get("focusSeconds")
            .and_then(Value::as_u64)
            == Some(1)
        && pomodoro_settings
            .get("shortBreakMinutes")
            .and_then(Value::as_u64)
            == Some(5)
        && pomodoro_settings
            .get("shortBreakSeconds")
            .and_then(Value::as_u64)
            == Some(1)
        && pomodoro_settings
            .get("longBreakMinutes")
            .and_then(Value::as_u64)
            == Some(15)
        && pomodoro_settings
            .get("longBreakSeconds")
            .and_then(Value::as_u64)
            == Some(1);
    if had_legacy_default_durations {
        pomodoro_settings.insert("focusSeconds".into(), json!(0));
        pomodoro_settings.insert("shortBreakSeconds".into(), json!(0));
        pomodoro_settings.insert("longBreakSeconds".into(), json!(0));
        if root
            .get("pomodoroSession")
            .and_then(Value::as_object)
            .is_some_and(|session| {
                session.get("phase").and_then(Value::as_str) == Some("focus")
                    && session.get("status").and_then(Value::as_str) == Some("idle")
                    && session.get("remainingSeconds").and_then(Value::as_u64) == Some(1501)
            })
        {
            root["pomodoroSession"]["remainingSeconds"] = json!(1500);
        }
    }

    let schedules = root
        .get_mut("schedules")
        .and_then(Value::as_array_mut)
        .ok_or("课表数据缺失")?;
    for schedule in schedules {
        let courses = schedule
            .get_mut("courses")
            .and_then(Value::as_array_mut)
            .ok_or("课程数据缺失")?;
        for course in courses {
            let course = course.as_object_mut().ok_or("课程数据无效")?;
            if !course.contains_key("weekdays") {
                let weekday = course
                    .remove("weekday")
                    .and_then(|value| value.as_u64())
                    .filter(|weekday| (1..=7).contains(weekday))
                    .ok_or("课程上课日无效")?;
                course.insert("weekdays".into(), json!([weekday]));
            } else {
                course.remove("weekday");
            }
        }
    }
    if !root.contains_key("calendarEvents") {
        root.insert("calendarEvents".into(), json!([]));
    }
    if !root.contains_key("ideas") {
        root.insert("ideas".into(), json!([]));
    }
    let settings = root
        .get_mut("settings")
        .and_then(Value::as_object_mut)
        .ok_or("设置缺失")?;
    if !settings.contains_key("ideaWidget") {
        settings.insert(
            "ideaWidget".into(),
            json!({ "layer": "normal", "positionLocked": false }),
        );
    }
    if !settings.contains_key("accentColor") {
        settings.insert("accentColor".into(), json!("#76558f"));
    }
    root.insert("schemaVersion".into(), json!(13));
    Ok((value, true))
}

fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp = path.with_extension("tmp");
    let backup = path.with_extension("bak");
    fs::write(&temp, bytes).map_err(|error| error.to_string())?;
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(&temp, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        return Err(error.to_string());
    }
    Ok(())
}

fn atomic_write(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    atomic_write_bytes(path, &bytes)
}

fn idea_file_path(ideas_dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    if file_name.trim().is_empty()
        || !file_name.ends_with(".md")
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
        || file_name.chars().any(|character| character.is_control())
    {
        return Err("想法文件名无效".into());
    }
    Ok(ideas_dir.join(file_name))
}

fn markdown_for_idea(idea: &IdeaData) -> String {
    let title = idea
        .title
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ");
    format!(
        "---\nid: {}\ntitle: \"{}\"\nstatus: {}\ncreatedAt: {}\nupdatedAt: {}\n---\n\n# {}\n\n{}\n",
        idea.id,
        title,
        idea.status,
        idea.created_at,
        idea.updated_at,
        title,
        idea.content.trim_end()
    )
}

fn sync_idea_files(old: &Value, next: &Value, ideas_dir: &Path) -> Result<(), String> {
    let old_ideas = old
        .get("ideas")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let next_ideas = next
        .get("ideas")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let next_ids = next_ideas
        .iter()
        .filter_map(|value| value.get("id").and_then(Value::as_str))
        .collect::<HashSet<_>>();

    for value in &old_ideas {
        let Some(id) = value.get("id").and_then(Value::as_str) else {
            continue;
        };
        let Some(file_name) = value.get("fileName").and_then(Value::as_str) else {
            continue;
        };
        let next_idea = next_ideas
            .iter()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(id));
        let next_file_name =
            next_idea.and_then(|item| item.get("fileName").and_then(Value::as_str));
        let next_has_content = next_idea
            .and_then(|item| item.get("content").and_then(Value::as_str))
            .is_some_and(|content| content.trim() != "");
        if !next_ids.contains(id) || !next_has_content || next_file_name != Some(file_name) {
            let path = idea_file_path(ideas_dir, file_name)?;
            if path.exists() {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
    }

    fs::create_dir_all(ideas_dir).map_err(|error| error.to_string())?;
    for value in &next_ideas {
        let idea = serde_json::from_value::<IdeaData>(value.clone())
            .map_err(|error| format!("想法数据无效: {error}"))?;
        let path = idea_file_path(ideas_dir, &idea.file_name)?;
        if idea.content.trim().is_empty() {
            continue;
        }
        atomic_write_bytes(&path, markdown_for_idea(&idea).as_bytes())?;
    }
    Ok(())
}

fn load_or_create(path: &Path) -> Result<Value, String> {
    if path.exists() {
        let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
        if let Ok((value, migrated)) = serde_json::from_str::<Value>(&raw)
            .map_err(|error| error.to_string())
            .and_then(migrate_state)
            && validate_state(&value).is_ok()
        {
            if migrated {
                atomic_write(path, &value)?;
            }
            return Ok(value);
        }
        let corrupt = path.with_extension(format!(
            "corrupt-{}.json",
            Local::now().format("%Y%m%d%H%M%S")
        ));
        fs::rename(path, corrupt).map_err(|error| error.to_string())?;
    }
    let value = default_state();
    atomic_write(path, &value)?;
    Ok(value)
}

fn initialize_store() -> Result<AppStore, String> {
    let roaming_dir = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or("无法定位 Windows 应用数据目录")?;
    let data_dir = roaming_dir.join(APP_IDENTIFIER);
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;

    let path = data_dir.join("state.json");
    let ideas_dir = data_dir.join("ideas");
    fs::create_dir_all(&ideas_dir).map_err(|error| error.to_string())?;
    let widget_position_path = data_dir.join("widget-position.json");
    let widget_position_sender = start_widget_position_writer(widget_position_path.clone());
    let idea_position_path = data_dir.join("idea-position.json");
    let idea_position_sender = start_idea_position_writer(idea_position_path.clone());
    let idea_size_path = data_dir.join("idea-size.json");
    let idea_size_sender = start_idea_size_writer(idea_size_path.clone());
    let first_launch = !path.exists();
    let sent_path = data_dir.join("sent-reminders.json");
    let state = load_or_create(&path)?;
    let sent = fs::read_to_string(&sent_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<HashSet<String>>(&raw).ok())
        .unwrap_or_default();

    Ok(AppStore {
        path,
        ideas_dir,
        pending_idea: Mutex::new(None),
        widget_position_path,
        widget_position_sender,
        idea_position_path,
        idea_position_sender,
        idea_size_path,
        idea_size_sender,
        state: Mutex::new(state),
        sent_path,
        sent: Mutex::new(sent),
        first_launch,
    })
}

#[tauri::command]
async fn set_autostart(enabled: bool, app: AppHandle) -> Result<bool, String> {
    if enabled {
        app.autolaunch()
            .enable()
            .map_err(|error| error.to_string())?;
    } else {
        app.autolaunch()
            .disable()
            .map_err(|error| error.to_string())?;
    }
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn raise_process_priority() -> Result<(), String> {
    use windows_sys::Win32::System::Threading::{
        ABOVE_NORMAL_PRIORITY_CLASS, GetCurrentProcess, SetPriorityClass,
    };
    let succeeded = unsafe { SetPriorityClass(GetCurrentProcess(), ABOVE_NORMAL_PRIORITY_CLASS) };
    (succeeded != 0)
        .then_some(())
        .ok_or("无法提高 HClock 进程优先级".into())
}

#[cfg(not(windows))]
fn raise_process_priority() -> Result<(), String> {
    Ok(())
}

fn is_autostart_launch(args: &[String]) -> bool {
    args.iter().any(|argument| argument == "--minimized")
}

#[cfg(windows)]
fn apply_idea_window_rounding(
    window: &tauri::WebviewWindow,
    size: PhysicalSize<u32>,
) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};

    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let diameter = (16.0 * scale_factor).round().max(2.0) as i32;
    let width = i32::try_from(size.width).map_err(|_| "想法草稿纸窗口宽度无效")?;
    let height = i32::try_from(size.height).map_err(|_| "想法草稿纸窗口高度无效")?;
    let region = unsafe { CreateRoundRectRgn(0, 0, width + 1, height + 1, diameter, diameter) };
    if region.is_null() {
        return Err("无法创建想法草稿纸圆角区域".into());
    }
    if unsafe { SetWindowRgn(hwnd, region, 1) } == 0 {
        unsafe { DeleteObject(region) };
        return Err("无法应用想法草稿纸圆角区域".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply_idea_window_rounding(
    _window: &tauri::WebviewWindow,
    _size: PhysicalSize<u32>,
) -> Result<(), String> {
    Ok(())
}

fn load_widget_position(path: &Path) -> Option<WidgetPosition> {
    let position = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<WidgetPosition>(&raw).ok())?;
    (position.x.unsigned_abs() <= 100_000 && position.y.unsigned_abs() <= 100_000)
        .then_some(position)
}

fn load_window_size(path: &Path) -> Option<WindowSize> {
    let size = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<WindowSize>(&raw).ok())?;
    (size.width >= 200 && size.height >= 200 && size.width <= 10_000 && size.height <= 10_000)
        .then_some(size)
}

fn has_visible_grab_area(window: (i32, i32, u32, u32), area: (i32, i32, u32, u32)) -> bool {
    let (window_x, window_y, window_width, window_height) = window;
    let (area_x, area_y, area_width, area_height) = area;
    let window_right = i64::from(window_x) + i64::from(window_width);
    let window_bottom = i64::from(window_y) + i64::from(window_height);
    let area_right = i64::from(area_x) + i64::from(area_width);
    let area_bottom = i64::from(area_y) + i64::from(area_height);
    let overlap_width = window_right.min(area_right) - i64::from(window_x).max(i64::from(area_x));
    let overlap_height =
        window_bottom.min(area_bottom) - i64::from(window_y).max(i64::from(area_y));
    overlap_width >= 64 && overlap_height >= 48
}

fn restore_widget_position(app: &AppHandle) -> Result<(), String> {
    let store = app.state::<AppStore>();
    let Some(position) = load_widget_position(&store.widget_position_path) else {
        return Ok(());
    };
    let window = app.get_webview_window("widget").ok_or("悬浮窗不存在")?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let visible = window
        .available_monitors()
        .map_err(|error| error.to_string())?
        .iter()
        .any(|monitor| {
            let area = monitor.work_area();
            has_visible_grab_area(
                (position.x, position.y, size.width, size.height),
                (
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                ),
            )
        });
    if visible {
        window
            .set_position(Position::Physical(PhysicalPosition::new(
                position.x, position.y,
            )))
            .map_err(|error| error.to_string())?;
    } else {
        window.center().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn restore_idea_window(app: &AppHandle) -> Result<(), String> {
    let store = app.state::<AppStore>();
    let window = app
        .get_webview_window("idea")
        .ok_or("想法草稿纸窗口不存在")?;

    if let Some(size) = load_window_size(&store.idea_size_path) {
        window
            .set_size(Size::Physical(PhysicalSize::new(size.width, size.height)))
            .map_err(|error| error.to_string())?;
    }

    let Some(position) = load_widget_position(&store.idea_position_path) else {
        return Ok(());
    };
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let visible = window
        .available_monitors()
        .map_err(|error| error.to_string())?
        .iter()
        .any(|monitor| {
            let area = monitor.work_area();
            has_visible_grab_area(
                (position.x, position.y, size.width, size.height),
                (
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                ),
            )
        });
    if visible {
        window
            .set_position(Position::Physical(PhysicalPosition::new(
                position.x, position.y,
            )))
            .map_err(|error| error.to_string())?;
    } else {
        window.center().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn queue_widget_position_save(store: &AppStore, position: WidgetPosition) {
    let _ = store.widget_position_sender.send(position);
}

fn queue_idea_position_save(store: &AppStore, position: WidgetPosition) {
    let _ = store.idea_position_sender.send(position);
}

fn queue_idea_size_save(store: &AppStore, size: WindowSize) {
    let _ = store.idea_size_sender.send(size);
}

fn start_widget_position_writer(path: PathBuf) -> mpsc::Sender<WidgetPosition> {
    start_window_value_writer(path)
}

fn start_idea_position_writer(path: PathBuf) -> mpsc::Sender<WidgetPosition> {
    start_window_value_writer(path)
}

fn start_idea_size_writer(path: PathBuf) -> mpsc::Sender<WindowSize> {
    start_window_value_writer(path)
}

fn start_window_value_writer<T>(path: PathBuf) -> mpsc::Sender<T>
where
    T: Serialize + Send + 'static,
{
    let (sender, receiver) = mpsc::channel::<T>();
    thread::spawn(move || {
        while let Ok(mut value) = receiver.recv() {
            while let Ok(next) = receiver.recv_timeout(Duration::from_millis(300)) {
                value = next;
            }
            let _ = atomic_write(&path, &json!(value));
        }
    });
    sender
}

#[tauri::command]
fn load_state(store: State<'_, AppStore>) -> Result<Value, String> {
    store
        .state
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "无法读取应用数据".into())
}

#[tauri::command]
fn save_state(data: Value, store: State<'_, AppStore>, app: AppHandle) -> Result<(), String> {
    validate_state(&data)?;
    let old = store.state.lock().map_err(|_| "无法读取应用数据")?.clone();
    sync_idea_files(&old, &data, &store.ideas_dir)?;
    atomic_write(&store.path, &data)?;
    *store.state.lock().map_err(|_| "无法更新应用数据")? = data.clone();
    app.emit("state-updated", data)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_backup(path: String, store: State<'_, AppStore>) -> Result<(), String> {
    let mut data = store.state.lock().map_err(|_| "无法读取应用数据")?.clone();
    if let Some(object) = data.as_object_mut() {
        object.insert(
            "pomodoroSession".into(),
            json!({ "phase": "focus", "status": "idle", "remainingSeconds": 1500, "completedFocuses": 0 }),
        );
    }
    let envelope = json!({
        "schemaVersion": 1,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "exportedAt": Local::now().to_rfc3339(),
        "data": data
    });
    fs::write(
        path,
        serde_json::to_vec_pretty(&envelope).map_err(|e| e.to_string())?,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_backup(
    path: String,
    store: State<'_, AppStore>,
    app: AppHandle,
) -> Result<Value, String> {
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let envelope: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if envelope.get("schemaVersion").and_then(Value::as_u64) != Some(1) {
        return Err("备份版本不受支持".into());
    }
    let data = envelope.get("data").cloned().ok_or("备份中没有应用数据")?;
    let (data, _) = migrate_state(data)?;
    validate_state(&data)?;
    let pre_import = store.path.with_extension(format!(
        "pre-import-{}.json",
        Local::now().format("%Y%m%d%H%M%S")
    ));
    if store.path.exists() {
        fs::copy(&store.path, pre_import).map_err(|error| error.to_string())?;
    }
    let old = store.state.lock().map_err(|_| "无法读取应用数据")?.clone();
    sync_idea_files(&old, &data, &store.ideas_dir)?;
    atomic_write(&store.path, &data)?;
    *store.state.lock().map_err(|_| "无法更新应用数据")? = data.clone();
    app.emit("state-updated", data.clone())
        .map_err(|error| error.to_string())?;
    Ok(data)
}

#[tauri::command]
fn show_main(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("主窗口不存在")?;
    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn set_widget_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    set_widget_visibility(&app, visible, true)
}

fn set_widget_visibility(app: &AppHandle, visible: bool, focus: bool) -> Result<(), String> {
    let window = app.get_webview_window("widget").ok_or("悬浮窗不存在")?;
    if visible {
        window.show().map_err(|error| error.to_string())?;
        restore_widget_position(app)?;
        if focus {
            window.set_focus().map_err(|error| error.to_string())?;
        }
        Ok(())
    } else {
        window.hide().map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn show_idea(idea_id: Option<String>, app: AppHandle) -> Result<(), String> {
    show_idea_window(&app, idea_id, true)
}

fn show_idea_window(app: &AppHandle, idea_id: Option<String>, focus: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("idea")
        .ok_or("想法草稿纸窗口不存在")?;
    let store = app.state::<AppStore>();
    *store.pending_idea.lock().map_err(|_| "无法准备想法窗口")? =
        Some(idea_id.clone().unwrap_or_default());
    app.emit("idea-opened", idea_id)
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    restore_idea_window(app)?;
    apply_idea_window_rounding(
        &window,
        window.outer_size().map_err(|error| error.to_string())?,
    )?;
    if focus {
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn consume_idea_open_request(store: State<'_, AppStore>) -> Result<Option<String>, String> {
    store
        .pending_idea
        .lock()
        .map(|mut value| value.take())
        .map_err(|_| "无法读取想法窗口请求".into())
}

#[tauri::command]
fn set_idea_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("idea")
        .ok_or("想法草稿纸窗口不存在")?;
    if visible {
        window.show().map_err(|error| error.to_string())?;
        restore_idea_window(&app)?;
        window.set_focus().map_err(|error| error.to_string())
    } else {
        window.hide().map_err(|error| error.to_string())
    }
}

fn show_desktop_windows(app: AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        main.hide().map_err(|error| error.to_string())?;
    }
    set_widget_visibility(&app, true, false)?;
    show_idea_window(&app, None, false)
}

#[tauri::command]
fn set_widget_layer(app: AppHandle, layer: String) -> Result<(), String> {
    let window = app.get_webview_window("widget").ok_or("悬浮窗不存在")?;
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_bottom(false)
        .map_err(|error| error.to_string())?;
    match layer.as_str() {
        "top" => window.set_always_on_top(true),
        "normal" => Ok(()),
        "bottom" => window.set_always_on_bottom(true),
        _ => return Err("桌面课表层级无效".into()),
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_idea_layer(app: AppHandle, layer: String) -> Result<(), String> {
    let window = app
        .get_webview_window("idea")
        .ok_or("想法草稿纸窗口不存在")?;
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_bottom(false)
        .map_err(|error| error.to_string())?;
    match layer.as_str() {
        "top" => window.set_always_on_top(true),
        "normal" => Ok(()),
        "bottom" => window.set_always_on_bottom(true),
        _ => return Err("想法草稿纸层级无效".into()),
    }
    .map_err(|error| error.to_string())
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

fn course_time(schedule: &Schedule, course: &Course) -> Option<(String, String, i64)> {
    match &course.time {
        CourseTime::Custom { start, end } => Some((start.clone(), end.clone(), 0)),
        CourseTime::Slot { slot_id } => schedule
            .time_slots
            .iter()
            .find(|slot| &slot.id == slot_id)
            .map(|slot| {
                (
                    slot.start.clone(),
                    slot.end.clone(),
                    slot.break_after_minutes,
                )
            }),
    }
}

fn recurrence_matches(course: &Course, week: i64) -> bool {
    match course.recurrence.kind.as_str() {
        "every" => true,
        "odd" => week % 2 == 1,
        "even" => week % 2 == 0,
        "custom" => course.recurrence.weeks.contains(&week),
        _ => false,
    }
}

fn occurrences_for_date(data: &ReminderData, date: NaiveDate) -> Vec<ReminderOccurrence> {
    let Some(active_id) = &data.active_schedule_id else {
        return Vec::new();
    };
    let Some(schedule) = data.schedules.iter().find(|item| &item.id == active_id) else {
        return Vec::new();
    };
    let mut result = Vec::new();
    if let (Some(start), Some(end)) = (
        parse_date(&schedule.semester_start),
        parse_date(&schedule.semester_end),
    ) && date >= start
        && date <= end
    {
        let first_monday =
            start - ChronoDuration::days(start.weekday().num_days_from_monday().into());
        let week = (date - first_monday).num_days() / 7 + 1;
        for course in &schedule.courses {
            if !course
                .weekdays
                .contains(&date.weekday().number_from_monday())
                || !recurrence_matches(course, week)
            {
                continue;
            }
            let has_exception = schedule.exceptions.iter().any(|exception| {
                exception.course_id == course.id
                    && parse_date(&exception.original_date) == Some(date)
            });
            if has_exception {
                continue;
            }
            if let Some((start, end, rest)) = course_time(schedule, course) {
                result.push(ReminderOccurrence {
                    key: format!("{}:{}", date, course.id),
                    course: course.clone(),
                    date,
                    start,
                    end,
                    break_after_minutes: rest,
                });
            }
        }
    }
    for exception in &schedule.exceptions {
        if exception.action != "move"
            || exception.new_date.as_deref().and_then(parse_date) != Some(date)
        {
            continue;
        }
        let Some(course) = schedule
            .courses
            .iter()
            .find(|course| course.id == exception.course_id)
        else {
            continue;
        };
        if let (Some(start), Some(end)) = (&exception.new_start, &exception.new_end) {
            result.push(ReminderOccurrence {
                key: format!("{}:{}:{}", date, course.id, exception.id),
                course: course.clone(),
                date,
                start: start.clone(),
                end: end.clone(),
                break_after_minutes: 0,
            });
        }
    }
    result
}

fn should_fire(now: chrono::DateTime<Local>, target: chrono::DateTime<Local>) -> bool {
    let elapsed = now.signed_duration_since(target).num_seconds();
    (0..=300).contains(&elapsed)
}

fn mark_sent(store: &AppStore, key: &str) -> bool {
    let Ok(mut sent) = store.sent.lock() else {
        return false;
    };
    if sent.contains(key) {
        return false;
    }
    if sent.len() > 1500 {
        sent.clear();
    }
    sent.insert(key.to_string());
    let entries = sent.iter().collect::<Vec<_>>();
    if let Ok(bytes) = serde_json::to_vec(&entries) {
        let _ = fs::write(&store.sent_path, bytes);
    }
    true
}

fn emit_reminder(
    app: &AppHandle,
    store: &AppStore,
    key: String,
    title: &str,
    body: String,
    sound: SoundSetting,
) {
    if !mark_sent(store, &key) {
        return;
    }
    let _ = app.notification().builder().title(title).body(body).show();
    let _ = app.emit("play-sound", SoundEvent { setting: sound });
}

fn check_reminders(app: &AppHandle) {
    let store = app.state::<AppStore>();
    let Ok(value) = store.state.lock().map(|state| state.clone()) else {
        return;
    };
    let Ok(data) = serde_json::from_value::<ReminderData>(value) else {
        return;
    };
    let now = Local::now();
    for occurrence in occurrences_for_date(&data, now.date_naive()) {
        let reminder = occurrence.course.reminder.clone();
        if reminder
            .as_ref()
            .is_some_and(|setting| setting.mode == "off")
        {
            continue;
        }
        let lead = reminder
            .as_ref()
            .filter(|setting| setting.mode == "custom")
            .and_then(|setting| setting.lead_minutes)
            .unwrap_or(data.settings.start_lead_minutes)
            .clamp(0, 180);
        let start_enabled = data.settings.start_notification;
        let end_enabled = reminder
            .as_ref()
            .filter(|setting| setting.mode == "custom")
            .and_then(|setting| setting.end_enabled)
            .unwrap_or(data.settings.end_notification);
        let Some(start_time) = NaiveTime::parse_from_str(&occurrence.start, "%H:%M").ok() else {
            continue;
        };
        let Some(end_time) = NaiveTime::parse_from_str(&occurrence.end, "%H:%M").ok() else {
            continue;
        };
        let Some(start_at) = occurrence
            .date
            .and_time(start_time)
            .and_local_timezone(Local)
            .single()
        else {
            continue;
        };
        let Some(end_at) = occurrence
            .date
            .and_time(end_time)
            .and_local_timezone(Local)
            .single()
        else {
            continue;
        };
        if start_enabled && should_fire(now, start_at - ChronoDuration::minutes(lead)) {
            let location = if occurrence.course.location.is_empty() {
                String::new()
            } else {
                format!(" · {}", occurrence.course.location)
            };
            emit_reminder(
                app,
                &store,
                format!("{}:start", occurrence.key),
                "即将上课",
                format!(
                    "{} 将在 {} 开始{}",
                    occurrence.course.title, occurrence.start, location
                ),
                data.settings.sounds.class_start.clone(),
            );
        }
        if end_enabled && should_fire(now, end_at) {
            let rest = if occurrence.break_after_minutes > 0 {
                format!("，休息 {} 分钟", occurrence.break_after_minutes)
            } else {
                String::new()
            };
            emit_reminder(
                app,
                &store,
                format!("{}:end", occurrence.key),
                "下课提醒",
                format!("{} 已结束{}", occurrence.course.title, rest),
                data.settings.sounds.class_end.clone(),
            );
        }
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开 HClock", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "显示桌面课表", true, None::<&str>)?;
    let idea = MenuItem::with_id(app, "idea", "打开想法草稿纸", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &widget, &idea, &separator, &quit])?;
    TrayIconBuilder::new()
        .icon(app.default_window_icon().expect("缺少应用图标").clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = show_main(app.clone());
            }
            "widget" => {
                if let Some(window) = app.get_webview_window("widget") {
                    let visible = window.is_visible().unwrap_or(false);
                    if visible {
                        let _ = window.hide();
                    } else {
                        let _ = set_widget_visible(app.clone(), true);
                    }
                }
            }
            "idea" => {
                let _ = show_idea(None, app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main(tray.app_handle().clone());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Register persistent state before Tauri creates a webview that can invoke commands.
    let store = initialize_store().expect("无法初始化 HClock 应用数据");
    tauri::Builder::default()
        .manage(store)
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if is_autostart_launch(&args) {
                let _ = show_desktop_windows(app.clone());
            } else {
                let _ = show_main(app.clone());
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            build_tray(app).map_err(|error| format!("无法创建 HClock 托盘：{error}"))?;
            let _ = raise_process_priority();

            let launch_args = std::env::args().collect::<Vec<_>>();
            if app.state::<AppStore>().first_launch || !is_autostart_launch(&launch_args) {
                show_main(app.handle().clone())
                    .map_err(|error| format!("无法显示 HClock 主窗口：{error}"))?;
            } else {
                show_desktop_windows(app.handle().clone())
                    .map_err(|error| format!("无法显示 HClock 桌面窗口：{error}"))?;
            }

            let handle = app.handle().clone();
            thread::spawn(move || {
                loop {
                    check_reminders(&handle);
                    thread::sleep(Duration::from_secs(15));
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "widget"
                && let tauri::WindowEvent::Moved(position) = event
            {
                queue_widget_position_save(
                    &window.state::<AppStore>(),
                    WidgetPosition {
                        x: position.x,
                        y: position.y,
                    },
                );
            }
            if window.label() == "idea" {
                match event {
                    tauri::WindowEvent::Moved(position) => queue_idea_position_save(
                        &window.state::<AppStore>(),
                        WidgetPosition {
                            x: position.x,
                            y: position.y,
                        },
                    ),
                    tauri::WindowEvent::Resized(size) => {
                        if let Some(idea_window) = window.app_handle().get_webview_window("idea") {
                            let _ = apply_idea_window_rounding(&idea_window, *size);
                        }
                        queue_idea_size_save(
                            &window.state::<AppStore>(),
                            WindowSize {
                                width: size.width,
                                height: size.height,
                            },
                        );
                    }
                    _ => {}
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && (window.label() == "main"
                    || window.label() == "widget"
                    || window.label() == "idea")
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            export_backup,
            import_backup,
            show_main,
            set_widget_visible,
            set_widget_layer,
            show_idea,
            consume_idea_open_request,
            set_idea_visible,
            set_idea_layer,
            set_autostart,
            is_autostart_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running HClock");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn course(kind: &str, weeks: Vec<i64>) -> Course {
        Course {
            id: "course".into(),
            title: "测试课程".into(),
            location: String::new(),
            weekdays: vec![1],
            time: CourseTime::Custom {
                start: "08:00".into(),
                end: "08:45".into(),
            },
            recurrence: Recurrence {
                kind: kind.into(),
                weeks,
            },
            reminder: None,
        }
    }

    fn use_legacy_pomodoro_cycles(value: &mut Value, cycles: u64) {
        let settings = value["pomodoroSettings"]
            .as_object_mut()
            .expect("default pomodoro settings must be an object");
        settings.remove("breakSequence");
        settings.insert("cycles".into(), json!(cycles));
    }

    #[test]
    fn default_data_is_valid() {
        assert!(validate_state(&default_state()).is_ok());
    }

    fn idea_value(id: &str, title: &str, file_name: &str, content: &str) -> Value {
        json!({
            "id": id,
            "title": title,
            "createdAt": "2026-08-12T08:00:00.000Z",
            "updatedAt": "2026-08-12T08:05:00.000Z",
            "status": "inProgress",
            "content": content,
            "fileName": file_name
        })
    }

    #[test]
    fn ideas_are_validated_and_restricted_to_safe_markdown_names() {
        let mut value = default_state();
        value["ideas"] = json!([idea_value(
            "idea",
            "测试想法",
            "2026-08-12的想法.md",
            "记录内容"
        )]);
        assert!(validate_state(&value).is_ok());

        value["ideas"][0]["status"] = json!("unknown");
        assert!(validate_state(&value).is_err());
        value["ideas"][0]["status"] = json!("inProgress");
        value["ideas"][0]["fileName"] = json!("../outside.md");
        assert!(validate_state(&value).is_err());
    }

    #[test]
    fn idea_markdown_is_written_and_old_file_is_removed_when_renamed() {
        let dir = std::env::temp_dir().join(format!("hclock-ideas-{}", Uuid::new_v4()));
        let old_file = "2026-08-12的想法.md";
        let new_file = "2026-08-12-2的想法.md";
        let mut old = default_state();
        old["ideas"] = json!([idea_value("idea", "原始想法", old_file, "第一版")]);
        let mut next = old.clone();
        next["ideas"][0]["title"] = json!("更新后的想法");
        next["ideas"][0]["fileName"] = json!(new_file);
        next["ideas"][0]["content"] = json!("第二版");

        sync_idea_files(&old, &next, &dir).expect("idea markdown should be written");
        assert!(!dir.join(old_file).exists());
        let markdown =
            fs::read_to_string(dir.join(new_file)).expect("new idea markdown should exist");
        assert!(markdown.contains("# 更新后的想法"));
        assert!(markdown.contains("第二版"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn version_nine_adds_ideas() {
        let mut value = default_state();
        value["schemaVersion"] = json!(9);
        value.as_object_mut().unwrap().remove("ideas");

        let (migrated, changed) = migrate_state(value).expect("version nine must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(migrated["ideas"], json!([]));
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn version_ten_adds_idea_window_settings() {
        let mut value = default_state();
        value["schemaVersion"] = json!(10);
        value["settings"]
            .as_object_mut()
            .expect("default settings must be an object")
            .remove("ideaWidget");

        let (migrated, changed) = migrate_state(value).expect("version ten must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(
            migrated["settings"]["ideaWidget"],
            json!({ "layer": "normal", "positionLocked": false })
        );
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn version_one_widget_settings_are_migrated() {
        let mut value = default_state();
        value["schemaVersion"] = json!(1);
        let widget = value["settings"]["widget"]
            .as_object_mut()
            .expect("default widget settings must be an object");
        widget.remove("layer");
        widget.remove("theme");
        widget.remove("positionLocked");
        widget.insert("alwaysOnTop".into(), json!(false));
        use_legacy_pomodoro_cycles(&mut value, 4);

        let (migrated, changed) = migrate_state(value).expect("version one must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(migrated["settings"]["widget"]["layer"], "normal");
        assert!(migrated["settings"]["widget"].get("theme").is_none());
        assert_eq!(migrated["settings"]["accentColor"], "#76558f");
        assert_eq!(migrated["settings"]["widget"]["positionLocked"], false);
        assert_eq!(
            migrated["pomodoroSettings"]["breakSequence"],
            json!(["short", "short", "short", "long"])
        );
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn version_two_widget_settings_gain_position_lock() {
        let mut value = default_state();
        value["schemaVersion"] = json!(2);
        value["settings"]["widget"]
            .as_object_mut()
            .expect("default widget settings must be an object")
            .remove("positionLocked");
        use_legacy_pomodoro_cycles(&mut value, 2);

        let (migrated, changed) = migrate_state(value).expect("version two must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(migrated["settings"]["widget"]["positionLocked"], false);
        assert_eq!(
            migrated["pomodoroSettings"]["breakSequence"],
            json!(["short", "long"])
        );
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn version_three_preserves_lock_and_migrates_break_plan() {
        let mut value = default_state();
        value["schemaVersion"] = json!(3);
        value["settings"]["widget"]["positionLocked"] = json!(true);
        use_legacy_pomodoro_cycles(&mut value, 3);

        let (migrated, changed) = migrate_state(value).expect("version three must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(migrated["settings"]["widget"]["positionLocked"], true);
        assert_eq!(
            migrated["pomodoroSettings"]["breakSequence"],
            json!(["short", "short", "long"])
        );
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn version_four_preserves_custom_break_plan() {
        let mut value = default_state();
        value["schemaVersion"] = json!(4);
        value["pomodoroSettings"]["breakSequence"] = json!(["long", "short", "long"]);

        let (migrated, changed) = migrate_state(value).expect("version four must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(
            migrated["pomodoroSettings"]["breakSequence"],
            json!(["long", "short", "long"])
        );
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn break_plan_must_have_one_to_twelve_valid_entries() {
        let mut value = default_state();
        value["pomodoroSettings"]["breakSequence"] = json!([]);
        assert!(validate_state(&value).is_err());
        value["pomodoroSettings"]["breakSequence"] = json!(["short", "custom"]);
        assert!(validate_state(&value).is_err());
        value["pomodoroSettings"]["breakSequence"] = json!(["long"]);
        assert!(validate_state(&value).is_ok());
    }

    #[test]
    fn accent_color_must_be_a_six_digit_hex_color() {
        let mut value = default_state();
        value["settings"]["accentColor"] = json!("#2474a6");
        assert!(validate_state(&value).is_ok());
        value["settings"]["accentColor"] = json!("2474a6");
        assert!(validate_state(&value).is_err());
        value["settings"]["accentColor"] = json!("#12zz56");
        assert!(validate_state(&value).is_err());
    }

    #[test]
    fn legacy_widget_themes_are_removed_for_the_key_color_system() {
        for theme in ["liquidGlass", "lilac"] {
            let mut value = default_state();
            value["schemaVersion"] = json!(6);
            value["settings"]["widget"]["theme"] = json!(theme);

            let (migrated, changed) = migrate_state(value).expect("version six must migrate");
            assert!(changed);
            assert_eq!(migrated["schemaVersion"], 13);
            assert!(migrated["settings"]["widget"].get("theme").is_none());
            assert_eq!(migrated["settings"]["accentColor"], "#76558f");
            assert!(validate_state(&migrated).is_ok());
        }
    }

    #[test]
    fn version_eleven_adds_the_key_color_and_removes_widget_theme() {
        let mut value = default_state();
        value["schemaVersion"] = json!(11);
        value["settings"]
            .as_object_mut()
            .unwrap()
            .remove("accentColor");
        value["settings"]["widget"]["theme"] = json!("night");

        let (migrated, changed) = migrate_state(value).expect("version eleven must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(migrated["settings"]["accentColor"], "#76558f");
        assert!(migrated["settings"]["widget"].get("theme").is_none());
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn version_seven_single_weekday_migrates_to_array() {
        let mut value = default_state();
        value["schemaVersion"] = json!(7);
        value["schedules"][0]["courses"] = json!([{
            "id": "course", "title": "数学", "teacher": "", "location": "A101",
            "color": "#28745f", "notes": "", "weekday": 3,
            "time": { "kind": "custom", "start": "08:00", "end": "08:45" },
            "recurrence": { "kind": "every", "weeks": [] },
            "reminder": { "mode": "inherit" }
        }]);

        let (migrated, changed) = migrate_state(value).expect("version seven must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(
            migrated["schedules"][0]["courses"][0]["weekdays"],
            json!([3])
        );
        assert!(
            migrated["schedules"][0]["courses"][0]
                .get("weekday")
                .is_none()
        );
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn version_eight_adds_calendar_events() {
        let mut value = default_state();
        value["schemaVersion"] = json!(8);
        value.as_object_mut().unwrap().remove("calendarEvents");

        let (migrated, changed) = migrate_state(value).expect("version eight must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(migrated["calendarEvents"], json!([]));
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn calendar_event_time_and_title_are_validated() {
        let mut value = default_state();
        value["calendarEvents"] = json!([{
            "id": "event",
            "title": "提交报告",
            "date": "2026-08-11",
            "start": "09:00",
            "end": "10:00",
            "location": "会议室",
            "color": "#2f7d68",
            "notes": ""
        }]);
        assert!(validate_state(&value).is_ok());

        value["calendarEvents"][0]["end"] = json!("08:00");
        assert!(validate_state(&value).is_err());
        value["calendarEvents"][0]["end"] = json!("10:00");
        value["calendarEvents"][0]["title"] = json!("");
        assert!(validate_state(&value).is_err());
    }

    #[test]
    fn course_weekdays_must_be_unique_and_in_range() {
        let mut value = default_state();
        value["schedules"][0]["courses"] = json!([{
            "id": "course", "title": "数学", "teacher": "", "location": "A101",
            "color": "#28745f", "notes": "", "weekdays": [],
            "time": { "kind": "custom", "start": "08:00", "end": "08:45" },
            "recurrence": { "kind": "every", "weeks": [] },
            "reminder": { "mode": "inherit" }
        }]);
        assert!(validate_state(&value).is_err());
        value["schedules"][0]["courses"][0]["weekdays"] = json!([1, 1]);
        assert!(validate_state(&value).is_err());
        value["schedules"][0]["courses"][0]["weekdays"] = json!([1, 8]);
        assert!(validate_state(&value).is_err());
        value["schedules"][0]["courses"][0]["weekdays"] = json!([1, 3]);
        assert!(validate_state(&value).is_ok());
    }

    #[test]
    fn reminder_occurrences_support_multiple_weekdays() {
        let mut value = default_state();
        value["schedules"][0]["courses"] = json!([{
            "id": "course", "title": "数学", "teacher": "", "location": "A101",
            "color": "#28745f", "notes": "", "weekdays": [1, 3],
            "time": { "kind": "custom", "start": "08:00", "end": "08:45" },
            "recurrence": { "kind": "every", "weeks": [] },
            "reminder": { "mode": "inherit" }
        }]);
        let data = serde_json::from_value::<ReminderData>(value).unwrap();
        let monday = parse_date(&data.schedules[0].semester_start).unwrap();

        assert_eq!(occurrences_for_date(&data, monday).len(), 1);
        assert!(occurrences_for_date(&data, monday + ChronoDuration::days(1)).is_empty());
        assert_eq!(
            occurrences_for_date(&data, monday + ChronoDuration::days(2)).len(),
            1
        );
    }

    #[test]
    fn widget_position_must_keep_a_grab_area_on_screen() {
        assert!(has_visible_grab_area(
            (-320, 80, 348, 480),
            (-1920, 0, 1920, 1040)
        ));
        assert!(has_visible_grab_area(
            (1800, 700, 348, 480),
            (0, 0, 1920, 1040)
        ));
        assert!(!has_visible_grab_area(
            (2400, 1200, 348, 480),
            (0, 0, 1920, 1040)
        ));
        assert!(!has_visible_grab_area(
            (1900, 100, 348, 480),
            (0, 0, 1920, 1040)
        ));
    }

    #[test]
    fn widget_position_writer_keeps_the_latest_move() {
        let path = std::env::temp_dir().join(format!("hclock-position-{}.json", Uuid::new_v4()));
        let sender = start_widget_position_writer(path.clone());
        sender.send(WidgetPosition { x: 120, y: 160 }).unwrap();
        sender.send(WidgetPosition { x: 640, y: 360 }).unwrap();
        thread::sleep(Duration::from_millis(450));

        let position = load_widget_position(&path).expect("latest position should be persisted");
        assert_eq!((position.x, position.y), (640, 360));

        drop(sender);
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(path.with_extension("bak"));
    }

    #[test]
    fn pomodoro_seconds_allow_zero_but_duration_must_be_positive() {
        let mut value = default_state();
        value["pomodoroSettings"]["focusSeconds"] = json!(0);
        assert!(validate_state(&value).is_ok());
        value["pomodoroSettings"]["focusMinutes"] = json!(0);
        assert!(validate_state(&value).is_err());
        value["pomodoroSettings"]["focusMinutes"] = json!(25);
        value["pomodoroSettings"]["focusSeconds"] = json!(59);
        assert!(validate_state(&value).is_ok());
        value["pomodoroSettings"]["focusSeconds"] = json!(60);
        assert!(validate_state(&value).is_err());
    }

    #[test]
    fn version_twelve_default_pomodoro_durations_become_whole_minutes() {
        let mut value = default_state();
        value["schemaVersion"] = json!(12);
        value["pomodoroSettings"]["focusSeconds"] = json!(1);
        value["pomodoroSettings"]["shortBreakSeconds"] = json!(1);
        value["pomodoroSettings"]["longBreakSeconds"] = json!(1);
        value["pomodoroSession"]["remainingSeconds"] = json!(1501);

        let (migrated, changed) = migrate_state(value).expect("version twelve must migrate");

        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert_eq!(migrated["pomodoroSettings"]["focusSeconds"], 0);
        assert_eq!(migrated["pomodoroSettings"]["shortBreakSeconds"], 0);
        assert_eq!(migrated["pomodoroSettings"]["longBreakSeconds"], 0);
        assert_eq!(migrated["pomodoroSession"]["remainingSeconds"], 1500);
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn startup_argument_only_marks_registered_autostart_launches() {
        assert!(is_autostart_launch(&[
            "hclock.exe".into(),
            "--minimized".into()
        ]));
        assert!(!is_autostart_launch(&["hclock.exe".into()]));
        assert!(!is_autostart_launch(&[
            "hclock.exe".into(),
            "--minimized-other".into()
        ]));
    }

    #[test]
    fn version_five_removes_opacity_and_adds_seconds() {
        let mut value = default_state();
        value["schemaVersion"] = json!(5);
        value["settings"]["widget"]["opacity"] = json!(0.35);
        let pomodoro = value["pomodoroSettings"]
            .as_object_mut()
            .expect("default pomodoro settings must be an object");
        pomodoro.remove("focusSeconds");
        pomodoro.remove("shortBreakSeconds");
        pomodoro.remove("longBreakSeconds");

        let (migrated, changed) = migrate_state(value).expect("version five must migrate");
        assert!(changed);
        assert_eq!(migrated["schemaVersion"], 13);
        assert!(migrated["settings"]["widget"].get("opacity").is_none());
        assert_eq!(migrated["pomodoroSettings"]["focusSeconds"], 0);
        assert_eq!(migrated["pomodoroSettings"]["shortBreakSeconds"], 0);
        assert_eq!(migrated["pomodoroSettings"]["longBreakSeconds"], 0);
        assert!(validate_state(&migrated).is_ok());
    }

    #[test]
    fn frontend_slot_time_shape_is_accepted() {
        let mut value = default_state();
        let schedule = value["schedules"][0]
            .as_object_mut()
            .expect("default schedule must be an object");
        let slot_id = schedule["timeSlots"][0]["id"]
            .as_str()
            .expect("default slot must have an id")
            .to_string();
        schedule["courses"] = json!([{
            "id": Uuid::new_v4().to_string(),
            "title": "数学", "teacher": "", "location": "A101", "color": "#28745f", "notes": "",
            "weekdays": [1],
            "time": { "kind": "slot", "slotId": slot_id },
            "recurrence": { "kind": "every", "weeks": [] },
            "reminder": { "mode": "inherit" }
        }]);
        assert!(validate_state(&value).is_ok());
    }

    #[test]
    fn recurrence_supports_odd_even_and_custom_weeks() {
        assert!(recurrence_matches(&course("odd", vec![]), 3));
        assert!(!recurrence_matches(&course("odd", vec![]), 4));
        assert!(recurrence_matches(&course("even", vec![]), 4));
        assert!(recurrence_matches(&course("custom", vec![1, 3, 8]), 8));
        assert!(!recurrence_matches(&course("custom", vec![1, 3, 8]), 7));
    }
}
