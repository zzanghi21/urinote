//! 메모 알림 (N-01, 데스크톱).
//!
//! Hub 창이 예약된 알림 목록 전체를 넘기면(`reminders_set`), 가장 가까운 알림 시각까지 기다렸다가
//! OS 알림을 띄우고 Hub 에 `reminder://due` 를 보낸다. Hub 는 그 메모를 스티키 창으로 열고 알림을 지운다.
//! 앱이 꺼져 있던 동안 지난 알림은 Hub 가 시작할 때 "놓친 알림"으로 따로 보여 준다.

use std::{
    collections::HashSet,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use tauri::{AppHandle, Builder, Emitter, Manager, Runtime, State};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::watch;

const EVENT_DUE: &str = "reminder://due";
/// 절전 후 깨어났을 때 늦지 않게, 한 번에 길게 자지 않고 시계를 다시 본다
const MAX_SLEEP: Duration = Duration::from_secs(30);
const MAX_REMINDERS: usize = 10_000;
const MAX_TEXT: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub note_id: String,
    /// Unix 밀리초
    pub at: i64,
    pub title: String,
    pub body: String,
}

pub struct RemindersState {
    tx: watch::Sender<Vec<Reminder>>,
}

pub fn init<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder
        .plugin(tauri_plugin_notification::init())
        .manage(RemindersState { tx: watch::channel(Vec::new()).0 })
}

/// 앱 시작 시 한 번: 알림 감시 작업을 띄운다
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let rx = app.state::<RemindersState>().tx.subscribe();
    tauri::async_runtime::spawn(run(app.clone(), rx));
}

#[tauri::command]
pub(crate) fn reminders_set(state: State<'_, RemindersState>, mut reminders: Vec<Reminder>) {
    reminders.truncate(MAX_REMINDERS);
    for r in &mut reminders {
        r.title = truncate(&r.title);
        r.body = truncate(&r.body);
    }
    state.tx.send_replace(reminders);
}

async fn run<R: Runtime>(app: AppHandle<R>, mut rx: watch::Receiver<Vec<Reminder>>) {
    let mut fired = HashSet::new();
    loop {
        let list = rx.borrow_and_update().clone();
        let (due, next) = plan(&list, &mut fired, now_ms());
        for reminder in due {
            notify(&app, &reminder);
        }
        match next {
            Some(at) => {
                let wait = Duration::from_millis((at - now_ms()).max(0) as u64).min(MAX_SLEEP);
                tokio::select! {
                    _ = tokio::time::sleep(wait) => {}
                    changed = rx.changed() => if changed.is_err() { return },
                }
            }
            None => {
                if rx.changed().await.is_err() {
                    return;
                }
            }
        }
    }
}

/// 지금 알릴 것과 다음에 깰 시각. 이미 알린 것은 목록에서 빠질 때까지 다시 알리지 않는다
/// (Hub 가 알림을 지운 목록을 다시 보내기 전에 깨어나도 두 번 울리지 않게).
fn plan(list: &[Reminder], fired: &mut HashSet<Reminder>, now: i64) -> (Vec<Reminder>, Option<i64>) {
    fired.retain(|r| list.contains(r));
    let mut due = Vec::new();
    let mut next = None;
    for r in list.iter().filter(|r| !fired.contains(*r)) {
        if r.at <= now {
            due.push(r.clone());
        } else {
            next = Some(next.map_or(r.at, |n: i64| n.min(r.at)));
        }
    }
    fired.extend(due.iter().cloned());
    (due, next)
}

fn notify<R: Runtime>(app: &AppHandle<R>, reminder: &Reminder) {
    let shown = app
        .notification()
        .builder()
        .title(&reminder.title)
        .body(&reminder.body)
        .show();
    if let Err(err) = shown {
        eprintln!("reminder notification failed: {err}");
    }
    let _ = app.emit_to("main", EVENT_DUE, &reminder.note_id);
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

fn truncate(text: &str) -> String {
    text.chars().take(MAX_TEXT).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(id: &str, at: i64) -> Reminder {
        Reminder { note_id: id.into(), at, title: String::new(), body: String::new() }
    }

    #[test]
    fn fires_due_once_and_reports_next() {
        let mut fired = HashSet::new();
        let list = vec![r("a", 100), r("b", 300), r("c", 200)];

        let (due, next) = plan(&list, &mut fired, 150);
        assert_eq!(due, vec![r("a", 100)]);
        assert_eq!(next, Some(200));

        // Hub 가 아직 "a" 를 지우지 않은 목록으로 다시 깨도 두 번 알리지 않는다
        let (due, _) = plan(&list, &mut fired, 160);
        assert!(due.is_empty());

        // 같은 메모에 새 시각으로 다시 예약하면 다시 알린다
        let list = vec![r("a", 400), r("b", 300), r("c", 200)];
        let (due, next) = plan(&list, &mut fired, 450);
        assert_eq!(due.len(), 3);
        assert_eq!(next, None);
    }
}
