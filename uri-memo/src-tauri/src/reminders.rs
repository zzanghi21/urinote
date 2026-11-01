//! Note reminders (N-01, desktop).
//!
//! The hub window passes the whole list of scheduled reminders (`reminders_set`); this waits until
//! the nearest one, shows an OS notification and sends `reminder://due` to the hub, which opens the note as a sticky window and clears the reminder.
//! Reminders that passed while the app was closed are shown by the hub at startup as "missed".

use std::{
    collections::HashSet,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use tauri::{AppHandle, Builder, Emitter, Manager, Runtime, State};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::watch;

const EVENT_DUE: &str = "reminder://due";
/// Never sleep long at once and re-check the clock, so reminders aren't late after waking from sleep
const MAX_SLEEP: Duration = Duration::from_secs(30);
const MAX_REMINDERS: usize = 10_000;
const MAX_TEXT: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub note_id: String,
    /// Unix milliseconds
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

/// Once at app startup: spawns the reminder task
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

/// What to fire now and when to wake next. Fired reminders don't fire again until they leave the list
/// (so nothing fires twice if this wakes before the hub sends the cleared list).
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
        log::error!("reminder notification failed: {err}");
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

        // waking again with a list where the hub hasn't removed "a" yet doesn't fire twice
        let (due, _) = plan(&list, &mut fired, 160);
        assert!(due.is_empty());

        // rescheduling the same note with a new time fires again
        let list = vec![r("a", 400), r("b", 300), r("c", 200)];
        let (due, next) = plan(&list, &mut fired, 450);
        assert_eq!(due.len(), 3);
        assert_eq!(next, None);
    }
}
