#[cfg(mobile)]
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(desktop)]
mod desktop;

pub const DB_URL: &str = "sqlite:urinote.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "yjs documents",
            sql: include_str!("../migrations/0002_yjs.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 단일 인스턴스 플러그인은 가장 먼저 등록해야 한다
    #[cfg(desktop)]
    let builder = desktop::plugins(builder);

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .setup(|app| {
            #[cfg(desktop)]
            desktop::setup(app)?;

            #[cfg(mobile)]
            if let Some(hub) = app.get_webview_window("main") {
                hub.show()?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hub 창을 닫으면 종료하지 않고 트레이로 숨긴다
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
