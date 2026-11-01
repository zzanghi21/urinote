//! 데스크톱 전용: 트레이, 전역 단축키, 자동 실행, 단일 인스턴스

use std::{collections::HashMap, time::Duration};

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Builder, Emitter, Manager, Runtime, State, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

/// 자동 실행 시 Hub 창을 띄우지 않고 트레이와 스티키 메모만 복원한다
const HIDDEN_ARG: &str = "--hidden";

/// 프런트엔드(Hub 창)가 처리하는 이벤트
const EVENT_NEW_STICKY: &str = "app://new-sticky";
/// 종료 직전 모든 창이 저장 대기 중인 입력을 저장하도록 알린다
const EVENT_FLUSH: &str = "app://flush";

fn shortcut_new() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN)
}

fn shortcut_toggle() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyH)
}

pub fn plugins(builder: Builder<Wry>) -> Builder<Wry> {
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_hub(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &shortcut_new() {
                        new_sticky(app);
                    } else if shortcut == &shortcut_toggle() {
                        toggle_stickies(app);
                    }
                })
                .build(),
        )
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    build_tray(app)?;

    // 다른 프로그램이 이미 쓰는 단축키면 등록에 실패할 수 있다. 앱 실행은 계속한다.
    for shortcut in [shortcut_new(), shortcut_toggle()] {
        if let Err(err) = app.global_shortcut().register(shortcut) {
            eprintln!("global shortcut {shortcut:?} not registered: {err}");
        }
    }

    if !std::env::args().any(|arg| arg == HIDDEN_ARG) {
        show_hub(app.handle());
    }
    Ok(())
}

fn build_tray(app: &App) -> tauri::Result<()> {
    let new = MenuItem::with_id(app, "new", "새 메모\tCtrl+Alt+N", true, None::<&str>)?;
    let show_all = MenuItem::with_id(app, "show_all", "모든 메모 보이기", true, None::<&str>)?;
    let hide_all = MenuItem::with_id(app, "hide_all", "모든 메모 숨기기", true, None::<&str>)?;
    let hub = MenuItem::with_id(app, "hub", "메모 목록 열기", true, None::<&str>)?;
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "시작 시 자동 실행",
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &new,
            &PredefinedMenuItem::separator(app)?,
            &show_all,
            &hide_all,
            &hub,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    app.manage(TrayMenu(menu.clone()));

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Urinote")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "new" => new_sticky(app),
            "show_all" => set_stickies_visible(app, true),
            "hide_all" => set_stickies_visible(app, false),
            "hub" => show_hub(app),
            "autostart" => {
                let launcher = app.autolaunch();
                let enable = !launcher.is_enabled().unwrap_or(false);
                let result = if enable { launcher.enable() } else { launcher.disable() };
                if let Err(err) = result {
                    eprintln!("autostart toggle failed: {err}");
                }
                let _ = autostart.set_checked(launcher.is_enabled().unwrap_or(false));
            }
            "quit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_hub(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// 트레이 메뉴. 앱 언어를 바꾸면 Hub 가 `tray_set_labels` 로 문구를 바꾼다
pub struct TrayMenu(Menu<Wry>);

/// 메뉴 ID(new, show_all, hide_all, hub, autostart, quit) → 표시 문구
#[tauri::command]
pub(crate) fn tray_set_labels(menu: State<'_, TrayMenu>, labels: HashMap<String, String>) {
    for (id, text) in labels {
        let result = match menu.0.get(id.as_str()) {
            Some(MenuItemKind::MenuItem(item)) => item.set_text(text),
            Some(MenuItemKind::Check(item)) => item.set_text(text),
            _ => Ok(()),
        };
        if let Err(err) = result {
            eprintln!("tray label {id} not set: {err}");
        }
    }
}

pub fn show_hub<R: Runtime>(app: &AppHandle<R>) {
    if let Some(hub) = app.get_webview_window("main") {
        let _ = hub.unminimize();
        let _ = hub.show();
        let _ = hub.set_focus();
    }
}

fn new_sticky<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit_to("main", EVENT_NEW_STICKY, ());
}

fn sticky_windows<R: Runtime>(app: &AppHandle<R>) -> Vec<tauri::WebviewWindow<R>> {
    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with("sticky-"))
        .map(|(_, window)| window)
        .collect()
}

fn set_stickies_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    for window in sticky_windows(app) {
        let _ = if visible { window.show() } else { window.hide() };
    }
}

/// 보이는 스티키가 하나라도 있으면 모두 숨기고, 아니면 모두 보인다
fn toggle_stickies<R: Runtime>(app: &AppHandle<R>) {
    let any_visible = sticky_windows(app)
        .iter()
        .any(|w| w.is_visible().unwrap_or(false));
    set_stickies_visible(app, !any_visible);
}

fn quit_app<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(EVENT_FLUSH, ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        app.exit(0);
    });
}
