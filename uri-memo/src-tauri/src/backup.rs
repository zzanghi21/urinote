//! JSON 내보내기·가져오기 파일 (E-02, 데스크톱).
//!
//! 파일 위치는 사용자가 저장·열기 대화상자에서 고른다. 대화상자를 Rust 에서 띄우므로
//! 웹뷰 쪽은 임의 경로의 파일을 읽거나 쓸 수 없다.

use tauri::{AppHandle, Builder, Runtime};
use tauri_plugin_dialog::DialogExt;

/// 이보다 큰 파일은 읽지 않는다 (메모 10만 개도 충분한 크기)
const MAX_BACKUP_BYTES: u64 = 200 * 1024 * 1024;

pub fn init<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.plugin(tauri_plugin_dialog::init())
}

/// 저장 대화상자를 띄워 저장한다. 사용자가 취소하면 false
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

/// 열기 대화상자를 띄워 파일 내용을 읽는다. 사용자가 취소하면 None
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
