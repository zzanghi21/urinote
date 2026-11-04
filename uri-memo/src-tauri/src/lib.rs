#[cfg(mobile)]
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(desktop)]
mod backup;
mod db_backup;
mod legacy;
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

/// Error log: urinote.log in the app log folder (up to 1 MB × 3). Info and above for our code and the
/// webview, warnings and above for libraries. Note contents are never logged.
fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir { file_name: Some("urinote".into()) }),
        ])
        .level(log::LevelFilter::Warn)
        .level_for("urinote_lib", log::LevelFilter::Info)
        .level_for("webview", log::LevelFilter::Info)
        .max_file_size(1_000_000)
        .rotation_strategy(RotationStrategy::KeepSome(3))
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // the single-instance plugin must be registered first
    #[cfg(desktop)]
    let builder = desktop::plugins(builder);

    let builder = builder.plugin(log_plugin());

    // friend sharing (same-Wi-Fi P2P), reminders, backup files
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

    // mobile: reminders are scheduled OS notifications (the OS shows them even if the app is closed)
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_notification::init());

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .setup(|app| {
            // before the frontend opens the DB and migrates: move data from the old app ID → back up on version change
            legacy::run(app);
            db_backup::run(app);

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
            // closing the hub window hides it to the tray instead of quitting
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            #[cfg(desktop)]
            desktop::on_run_event(_app, &_event);
        });
}
