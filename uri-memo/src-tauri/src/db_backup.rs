//! 업데이트 직전 DB 백업.
//!
//! 앱 버전이 바뀐 첫 실행에서, 프런트엔드가 DB 를 열어 마이그레이션을 돌리기 전에
//! `urinote.db`(+ WAL·SHM)를 `backups/<이전 버전>-<시각>/` 에 복사해 둔다.
//! 새 버전에서 문제가 생겨도 이전 상태로 되돌릴 수 있다. 최근 백업 몇 개만 남긴다.

use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result};
use tauri::{App, Manager, Runtime};

/// tauri-plugin-sql 이 `app_config_dir` 에 만드는 파일 (lib.rs 의 DB_URL 과 같아야 한다)
const DB_FILE: &str = "urinote.db";
const VERSION_FILE: &str = "last-run-version";
const BACKUP_DIR: &str = "backups";
const KEEP: usize = 5;

pub fn run<R: Runtime>(app: &App<R>) {
    let version = app.package_info().version.to_string();
    let result = app
        .path()
        .app_config_dir()
        .map_err(anyhow::Error::from)
        .and_then(|dir| backup_on_version_change(&dir, &version, now_secs()));
    match result {
        Ok(Some(path)) => log::info!("DB 백업: {}", path.display()),
        Ok(None) => {}
        // 백업에 실패해도 앱은 실행한다 (DB 는 건드리지 않았으므로)
        Err(e) => log::error!("DB 백업 실패: {e:#}"),
    }
}

/// 버전이 바뀌었고 DB 가 있으면 백업하고 그 폴더를 돌려준다
fn backup_on_version_change(dir: &Path, version: &str, now: u64) -> Result<Option<PathBuf>> {
    let marker = dir.join(VERSION_FILE);
    let previous = fs::read_to_string(&marker).ok().map(|v| v.trim().to_string());
    if previous.as_deref() == Some(version) {
        return Ok(None);
    }
    let mut backed_up = None;
    if dir.join(DB_FILE).exists() {
        let label = previous.unwrap_or_else(|| "unknown".into());
        let target = dir.join(BACKUP_DIR).join(format!("{label}-{now}"));
        fs::create_dir_all(&target)?;
        for suffix in ["", "-wal", "-shm"] {
            let file = format!("{DB_FILE}{suffix}");
            let source = dir.join(&file);
            if source.exists() {
                fs::copy(&source, target.join(&file)).with_context(|| format!("{file} 복사"))?;
            }
        }
        prune(&dir.join(BACKUP_DIR))?;
        backed_up = Some(target);
    }
    // 백업이 끝난 뒤에만 기록한다 → 실패하면 다음 실행에서 다시 시도
    fs::create_dir_all(dir)?;
    fs::write(&marker, version)?;
    Ok(backed_up)
}

/// 오래된 백업부터 지워 KEEP 개만 남긴다
fn prune(backups: &Path) -> Result<()> {
    // 폴더 이름 끝의 시각(<버전>-<초>)으로 정렬한다
    let mut dirs: Vec<_> = fs::read_dir(backups)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let time = name.rsplit('-').next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            (time, e.path())
        })
        .collect();
    dirs.sort();
    let excess = dirs.len().saturating_sub(KEEP);
    for (_, path) in dirs.into_iter().take(excess) {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("urinote-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn backs_up_once_per_version_change_and_keeps_the_latest() {
        let dir = temp_dir("backup");
        // 첫 설치: DB 가 없으면 버전만 기록
        assert_eq!(backup_on_version_change(&dir, "0.1.0", 1).unwrap(), None);

        fs::write(dir.join(DB_FILE), "v1").unwrap();
        fs::write(dir.join("urinote.db-wal"), "wal").unwrap();
        // 같은 버전으로 다시 실행하면 백업하지 않는다
        assert_eq!(backup_on_version_change(&dir, "0.1.0", 2).unwrap(), None);

        // 업데이트: 이전 버전 이름으로 DB·WAL 을 복사
        let backup = backup_on_version_change(&dir, "0.2.0", 3).unwrap().unwrap();
        assert!(backup.ends_with("0.1.0-3"));
        assert_eq!(fs::read_to_string(backup.join(DB_FILE)).unwrap(), "v1");
        assert_eq!(fs::read_to_string(backup.join("urinote.db-wal")).unwrap(), "wal");
        assert_eq!(backup_on_version_change(&dir, "0.2.0", 4).unwrap(), None);

        for i in 0..7 {
            backup_on_version_change(&dir, &format!("1.{i}.0"), 10 + i).unwrap();
        }
        assert_eq!(fs::read_dir(dir.join(BACKUP_DIR)).unwrap().count(), KEEP);
        fs::remove_dir_all(&dir).unwrap();
    }
}
