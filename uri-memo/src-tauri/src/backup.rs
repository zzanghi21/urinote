//! Files for JSON export / import (E-02, desktop).
//!
//! The user picks the location in a save/open dialog. The dialog is shown from Rust, so the
//! webview cannot read or write arbitrary paths.

use tauri::{AppHandle, Builder, Runtime};
use tauri_plugin_dialog::DialogExt;

/// Larger files are not read (plenty for 100,000 notes)
const MAX_BACKUP_BYTES: u64 = 200 * 1024 * 1024;

pub fn init<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.plugin(tauri_plugin_dialog::init())
}

/// Shows a save dialog and writes the file. false if the user cancels
#[tauri::command]
pub(crate) async fn backup_save<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
    filter_name: String,
    contents: String,
) -> Result<bool, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter(&filter_name, &["json"])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    tokio::fs::write(&path, contents).await.map_err(|e| e.to_string())?;
    Ok(true)
}

/// Shows an open dialog and reads the file. None if the user cancels
#[tauri::command]
pub(crate) async fn backup_open<R: Runtime>(
    app: AppHandle<R>,
    filter_name: String,
) -> Result<Option<String>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .add_filter(&filter_name, &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let size = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?.len();
    if size > MAX_BACKUP_BYTES {
        return Err(format!("file too large ({size} bytes)"));
    }
    let contents = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Some(contents))
}
