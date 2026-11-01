//! DB backup before updates.
//!
//! On the first run after the app version changes, before the frontend opens the DB and runs
//! migrations, copies `urinote.db` (+ WAL/SHM) to `backups/<previous version>-<time>/`.
//! If the new version has problems, the previous state can be restored. Only the latest few are kept.

use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result};
use tauri::{App, Manager, Runtime};

/// File tauri-plugin-sql creates in `app_config_dir` (must match DB_URL in lib.rs)
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
        // the app still starts if the backup fails (the DB was not touched)
        Err(e) => log::error!("DB 백업 실패: {e:#}"),
    }
}

/// Backs up the DB if the version changed and a DB exists, returning the backup folder
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
    // record only after the backup finished → retried on the next run if it failed
    fs::create_dir_all(dir)?;
    fs::write(&marker, version)?;
    Ok(backed_up)
}

/// Deletes the oldest backups, keeping KEEP
fn prune(backups: &Path) -> Result<()> {
    // sort by the time at the end of the folder name (<version>-<seconds>)
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
        // first install: without a DB, only the version is recorded
        assert_eq!(backup_on_version_change(&dir, "0.1.0", 1).unwrap(), None);

        fs::write(dir.join(DB_FILE), "v1").unwrap();
        fs::write(dir.join("urinote.db-wal"), "wal").unwrap();
        // running the same version again makes no backup
        assert_eq!(backup_on_version_change(&dir, "0.1.0", 2).unwrap(), None);

        // update: DB and WAL copied under the previous version's name
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
