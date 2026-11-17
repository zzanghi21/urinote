//! Mobile device services for friend sharing (Android: `DevicePlugin.kt` in gen/android).
//! Called from Rust only, so the plugin needs no webview permissions.

use serde::Deserialize;
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[cfg(target_os = "android")]
struct Handle<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("device")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(Handle(_api.register_android_plugin("kr.urinote.app", "DevicePlugin")?));
            Ok(())
        })
        .build()
}

/// The phone's name as the user sees it ("Galaxy S24"), for the friend list
pub fn name<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    #[derive(Deserialize)]
    struct Name {
        name: Option<String>,
    }
    #[cfg(target_os = "android")]
    if let Some(h) = app.try_state::<Handle<R>>() {
        return match h.0.run_mobile_plugin::<Name>("deviceName", ()) {
            Ok(n) => n.name,
            Err(e) => {
                log::warn!("device name: {e}");
                None
            }
        };
    }
    let _ = app;
    None
}

/// Lets mDNS packets through while sharing runs (Android filters multicast otherwise)
pub fn hold_multicast<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "android")]
    if let Some(h) = app.try_state::<Handle<R>>() {
        if let Err(e) = h.0.run_mobile_plugin::<serde_json::Value>("holdMulticast", ()) {
            log::warn!("multicast lock: {e}");
        }
    }
    let _ = app;
}
