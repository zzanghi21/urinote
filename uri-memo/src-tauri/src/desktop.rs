//! Desktop only: tray, global shortcuts, autostart, single instance

use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Builder, Emitter, Manager, RunEvent, Runtime, State, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

/// When autostarted, don't show the hub window; restore only the tray and sticky notes
const HIDDEN_ARG: &str = "--hidden";

/// Events handled by the frontend (hub window)
const EVENT_NEW_STICKY: &str = "app://new-sticky";
/// Tells every window to save pending input right before quitting
const EVENT_FLUSH: &str = "app://flush";

/// Global shortcut modifiers: ⌘⌥ on macOS, Ctrl+Alt elsewhere (must match frontend platform/shortcuts.ts)
fn global_mods() -> Modifiers {
    if cfg!(target_os = "macos") {
        Modifiers::SUPER | Modifiers::ALT
    } else {
        Modifiers::CONTROL | Modifiers::ALT
    }
}

fn shortcut_new() -> Shortcut {
    Shortcut::new(Some(global_mods()), Code::KeyN)
}

fn shortcut_toggle() -> Shortcut {
    Shortcut::new(Some(global_mods()), Code::KeyH)
}

/// Only actually quit after telling windows to save pending input
static FLUSHED: AtomicBool = AtomicBool::new(false);

/// App-wide events: quit requests (tray "Quit", ⌘Q on macOS, logout) save input before quitting, and
/// clicking the Dock icon on macOS shows the hub window again
pub fn on_run_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    match event {
        RunEvent::ExitRequested { api, .. } if !FLUSHED.load(Ordering::SeqCst) => {
            api.prevent_exit();
            quit_app(app);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_hub(app),
        _ => {}
    }
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
        // auto-update (checked and installed by the hub window) + relaunch after installing
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    build_tray(app)?;

    // registration fails if another program already uses the shortcut; the app keeps running
    for shortcut in [shortcut_new(), shortcut_toggle()] {
        if let Err(err) = app.global_shortcut().register(shortcut) {
            log::warn!("global shortcut {shortcut:?} not registered: {err}");
        }
    }

    if !std::env::args().any(|arg| arg == HIDDEN_ARG) {
        show_hub(app.handle());
    }
    Ok(())
}

fn build_tray(app: &App) -> tauri::Result<()> {
    // the hub sets labels for the app language and OS via tray_set_labels (no shortcut text on Linux)
    let new = MenuItem::with_id(app, "new", "새 메모", true, None::<&str>)?;
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
                    log::warn!("autostart toggle failed: {err}");
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

/// Tray menu. When the app language changes, the hub updates the labels via `tray_set_labels`
pub struct TrayMenu(Menu<Wry>);

/// Menu ID (new, show_all, hide_all, hub, autostart, quit) → label
#[tauri::command]
pub(crate) fn tray_set_labels(menu: State<'_, TrayMenu>, labels: HashMap<String, String>) {
    for (id, text) in labels {
        let result = match menu.0.get(id.as_str()) {
            Some(MenuItemKind::MenuItem(item)) => item.set_text(text),
            Some(MenuItemKind::Check(item)) => item.set_text(text),
            _ => Ok(()),
        };
        if let Err(err) = result {
            log::warn!("tray label {id} not set: {err}");
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

/// Hides all stickies if any is visible, otherwise shows them all
fn toggle_stickies<R: Runtime>(app: &AppHandle<R>) {
    let any_visible = sticky_windows(app)
        .iter()
        .any(|w| w.is_visible().unwrap_or(false));
    set_stickies_visible(app, !any_visible);
}

fn quit_app<R: Runtime>(app: &AppHandle<R>) {
    if FLUSHED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit(EVENT_FLUSH, ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        app.exit(0);
    });
}
