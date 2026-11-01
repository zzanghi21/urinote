//! One-time migration from the old app identifier (`com.urinote.*` → `kr.urinote.*`).
//!
//! The identifier decides where the note DB lives and the name of the device key in the OS
//! secure store. Without this, the first run under the new identifier would start with an empty
//! DB and a new device ID (friends would have to pair again). Runs before the DB backup and before
//! the frontend opens the DB. Safe to remove once no installs of the old identifier remain.

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Result;
use tauri::{App, Manager, Runtime};

const DB_FILE: &str = "urinote.db";
/// Must match `KEYRING_USER` / `KEY_FILE` in p2p/mod.rs
const KEYRING_USER: &str = "p2p-device-key";
const KEY_FILE: &str = "p2p-device-key";

/// Old identifier for the current one, if this identifier was renamed
fn old_identifier(identifier: &str) -> Option<String> {
    identifier
        .strip_prefix("kr.urinote.")
        .map(|rest| format!("com.urinote.{rest}"))
}

pub fn run<R: Runtime>(app: &App<R>) {
    let identifier = app.config().identifier.clone();
    let Some(old) = old_identifier(&identifier) else {
        return;
    };
    if let Ok(dir) = app.path().app_config_dir() {
        match copy_data(&sibling(&dir, &old), &dir) {
            Ok(true) => log::info!("migrated notes from {old}"),
            Ok(false) => {}
            Err(e) => log::error!("note migration from {old} failed: {e:#}"),
        }
    }
    if let Ok(dir) = app.path().app_local_data_dir() {
        let (from, to) = (sibling(&dir, &old).join(KEY_FILE), dir.join(KEY_FILE));
        if from.exists() && !to.exists() {
            if let Err(e) = fs::create_dir_all(&dir).and_then(|_| fs::copy(&from, &to)) {
                log::error!("device key file migration failed: {e}");
            }
        }
    }
    #[cfg(desktop)]
    migrate_keyring(&old, &identifier);
}

fn sibling(dir: &Path, name: &str) -> PathBuf {
    dir.parent().map_or_else(|| PathBuf::from(name), |p| p.join(name))
}

/// Copies the DB (+ WAL/SHM) and backups if the new folder has no DB yet. Returns true if copied.
fn copy_data(from: &Path, to: &Path) -> Result<bool> {
    if to.join(DB_FILE).exists() || !from.join(DB_FILE).exists() {
        return Ok(false);
    }
    fs::create_dir_all(to)?;
    for suffix in ["", "-wal", "-shm"] {
        let file = format!("{DB_FILE}{suffix}");
        if from.join(&file).exists() {
            fs::copy(from.join(&file), to.join(&file))?;
        }
    }
    let backups = from.join("backups");
    if backups.is_dir() {
        copy_dir(&backups, &to.join("backups"))?;
    }
    Ok(true)
}

fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Copies the device key to the new keyring entry so the device ID (and friendships) stay the same
#[cfg(desktop)]
fn migrate_keyring(old: &str, new: &str) {
    let result = (|| -> keyring::Result<bool> {
        let target = keyring::Entry::new(new, KEYRING_USER)?;
        match target.get_password() {
            Ok(_) => return Ok(false),
            Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e),
        }
        match keyring::Entry::new(old, KEYRING_USER)?.get_password() {
            Ok(key) => target.set_password(&key).map(|_| true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(e),
        }
    })();
    match result {
        Ok(true) => log::info!("migrated device key from {old}"),
        Ok(false) => {}
        Err(e) => log::warn!("device key migration from {old} skipped: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_renamed_identifiers_only() {
        assert_eq!(old_identifier("kr.urinote.app").as_deref(), Some("com.urinote.app"));
        assert_eq!(old_identifier("kr.urinote.dev2").as_deref(), Some("com.urinote.dev2"));
        assert_eq!(old_identifier("com.example.other"), None);
    }

    #[test]
    fn copies_notes_once_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!("urinote-legacy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let (old, new) = (root.join("com.urinote.app"), root.join("kr.urinote.app"));
        fs::create_dir_all(old.join("backups/0.1.0-1")).unwrap();
        fs::write(old.join(DB_FILE), "notes").unwrap();
        fs::write(old.join("urinote.db-wal"), "wal").unwrap();
        fs::write(old.join("backups/0.1.0-1").join(DB_FILE), "backup").unwrap();

        assert_eq!(sibling(&new, "com.urinote.app"), old);
        assert!(copy_data(&old, &new).unwrap());
        assert_eq!(fs::read_to_string(new.join(DB_FILE)).unwrap(), "notes");
        assert_eq!(fs::read_to_string(new.join("urinote.db-wal")).unwrap(), "wal");
        assert_eq!(fs::read_to_string(new.join("backups/0.1.0-1").join(DB_FILE)).unwrap(), "backup");

        // the new DB is in use from now on: never overwritten by the old one
        fs::write(new.join(DB_FILE), "newer").unwrap();
        assert!(!copy_data(&old, &new).unwrap());
        assert_eq!(fs::read_to_string(new.join(DB_FILE)).unwrap(), "newer");
        fs::remove_dir_all(&root).unwrap();
    }
}
