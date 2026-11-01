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

/// 오류 기록: 앱 로그 폴더의 urinote.log (최대 1MB × 3개). 우리 코드와 화면(webview)은 정보 이상,
/// 라이브러리는 경고 이상만 남긴다. 메모 내용은 기록하지 않는다.
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

    // 단일 인스턴스 플러그인은 가장 먼저 등록해야 한다
    #[cfg(desktop)]
    let builder = desktop::plugins(builder);

    let builder = builder.plugin(log_plugin());

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
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .setup(|app| {
            // 프런트엔드가 DB 를 열어 마이그레이션하기 전에: 옛 앱 ID 데이터 이전 → 버전 변경 시 백업
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
            // Hub 창을 닫으면 종료하지 않고 트레이로 숨긴다
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
