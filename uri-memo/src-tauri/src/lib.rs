#[cfg(mobile)]
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(desktop)]
mod backup;
#[cfg(desktop)]
mod desktop;
#[cfg(desktop)]
mod p2p;
#[cfg(desktop)]
mod reminders;

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
        Migration {
            version: 3,
            description: "contacts",
            sql: include_str!("../migrations/0003_contacts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "shares",
            sql: include_str!("../migrations/0004_shares.sql"),
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

    // 친구 공유 (같은 Wi-Fi P2P), 메모 알림
    #[cfg(desktop)]
    let builder = backup::init(reminders::init(p2p::init(builder))).invoke_handler(tauri::generate_handler![
        p2p::p2p_start,
        p2p::p2p_set_contacts,
        p2p::p2p_set_pairing,
        p2p::p2p_connect,
        p2p::p2p_connect_addr,
        p2p::p2p_default_name,
        p2p::p2p_my_addr,
        p2p::p2p_send,
        p2p::p2p_disconnect,
        p2p::p2p_connected,
        p2p::p2p_sign,
        p2p::p2p_verify,
        reminders::reminders_set,
        backup::backup_save,
        backup::backup_open,
        desktop::tray_set_labels,
    ]);

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
            #[cfg(desktop)]
            reminders::start(app.handle());

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
