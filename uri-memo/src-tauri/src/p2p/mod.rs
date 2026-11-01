//! Exposes the P2P layer for friend sharing to the frontend (ShareEngine).
//! The frontend interprets messages (the sharing protocol); this only handles transport, discovery and signing.

mod node;

use std::{path::Path, str::FromStr};

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use iroh::{EndpointAddr, EndpointId, SecretKey};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::{mpsc, OnceCell};

use node::{Node, NodeEvent, NodeOptions};

/// Secure-store entry name. The service name is the app identifier, so the second test instance
/// (tauri.dev2.conf.json) gets a different device key.
const KEYRING_USER: &str = "p2p-device-key";
/// File holding the device key when no secure store is available (app local data folder)
const KEY_FILE: &str = "p2p-device-key";

/// Events received by the hub window's ShareEngine
const EVENT_DISCOVERED: &str = "p2p://discovered";
const EVENT_EXPIRED: &str = "p2p://expired";
const EVENT_CONNECTED: &str = "p2p://connected";
const EVENT_DISCONNECTED: &str = "p2p://disconnected";
const EVENT_MESSAGE: &str = "p2p://message";

#[derive(Default)]
pub struct P2pState {
    node: OnceCell<Node>,
}

#[derive(Clone, Serialize)]
struct PeerPayload {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Clone, Serialize)]
struct MessagePayload {
    from: String,
    /// base64
    data: String,
}

type CmdResult<T> = std::result::Result<T, String>;

fn err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

fn parse_id(id: &str) -> Result<EndpointId> {
    EndpointId::from_str(id).map_err(|e| anyhow!("잘못된 기기 ID: {e}"))
}

fn node<'a>(state: &'a State<'_, P2pState>) -> Result<&'a Node> {
    state.node.get().context("P2P 가 시작되지 않았습니다")
}

/// Reads the device secret key, creating it the first time.
///
/// Kept in the OS secure store (Windows Credential Manager / macOS Keychain / Linux Secret Service).
/// Without a secure store (e.g. Linux without a keyring daemon) it goes into a file in the app data
/// folder (0600 on Unix, readable only by the user), and that file is used from then on.
fn device_key(service: &str, fallback: &Path) -> Result<SecretKey> {
    if fallback.exists() {
        return read_key_file(fallback);
    }
    match keyring_key(service) {
        Ok(key) => Ok(key),
        Err(e) => {
            log::warn!("OS 보안 저장소를 쓸 수 없어 기기 키를 파일에 둡니다: {e:#}");
            let key = SecretKey::generate();
            write_key_file(fallback, &key)?;
            Ok(key)
        }
    }
}

fn keyring_key(service: &str) -> Result<SecretKey> {
    let entry = keyring::Entry::new(service, KEYRING_USER)?;
    match entry.get_password() {
        Ok(hex) => parse_key(&hex),
        Err(keyring::Error::NoEntry) => {
            let key = SecretKey::generate();
            entry.set_password(&encode_hex(&key.to_bytes()))?;
            // catch stores that accept the write but don't actually persist it
            let stored = entry.get_password().context("저장한 기기 키를 다시 읽지 못했습니다")?;
            anyhow::ensure!(stored == encode_hex(&key.to_bytes()), "기기 키가 저장되지 않았습니다");
            Ok(key)
        }
        Err(e) => Err(e).context("OS 보안 저장소에 접근하지 못했습니다"),
    }
}

fn parse_key(hex: &str) -> Result<SecretKey> {
    let bytes: [u8; 32] = decode_hex(hex.trim())
        .and_then(|b| b.try_into().ok())
        .context("저장된 기기 키가 손상되었습니다")?;
    Ok(SecretKey::from_bytes(&bytes))
}

fn read_key_file(path: &Path) -> Result<SecretKey> {
    parse_key(&std::fs::read_to_string(path).context("기기 키 파일을 읽지 못했습니다")?)
}

fn write_key_file(path: &Path, key: &SecretKey) -> Result<()> {
    use std::io::Write;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).context("기기 키 파일을 만들지 못했습니다")?;
    file.write_all(encode_hex(&key.to_bytes()).as_bytes())?;
    Ok(())
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_hex(hex: &str) -> Option<Vec<u8>> {
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(hex.get(i..i + 2)?, 16).ok())
        .collect()
}

fn forward_events<R: Runtime>(app: AppHandle<R>, mut rx: mpsc::UnboundedReceiver<NodeEvent>) {
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            let _ = match event {
                NodeEvent::Discovered { id, name } => app.emit_to(
                    "main",
                    EVENT_DISCOVERED,
                    PeerPayload { id: id.to_string(), name },
                ),
                NodeEvent::Expired { id } => {
                    app.emit_to("main", EVENT_EXPIRED, PeerPayload { id: id.to_string(), name: None })
                }
                NodeEvent::Connected { id } => app.emit_to(
                    "main",
                    EVENT_CONNECTED,
                    PeerPayload { id: id.to_string(), name: None },
                ),
                NodeEvent::Disconnected { id } => app.emit_to(
                    "main",
                    EVENT_DISCONNECTED,
                    PeerPayload { id: id.to_string(), name: None },
                ),
                NodeEvent::Message { from, data } => app.emit_to(
                    "main",
                    EVENT_MESSAGE,
                    MessagePayload { from: from.to_string(), data: B64.encode(data) },
                ),
            };
        }
    });
}

/// Starts P2P and returns my device ID. Starts only once even if called repeatedly.
#[tauri::command]
pub(crate) async fn p2p_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, P2pState>,
    contacts: Vec<String>,
) -> CmdResult<String> {
    let node = state
        .node
        .get_or_try_init(|| async {
            let (tx, rx) = mpsc::unbounded_channel();
            let service = app.config().identifier.clone();
            let fallback = app.path().app_local_data_dir()?.join(KEY_FILE);
            // secure-store calls may block (Linux D-Bus etc.), so run them off the async runtime
            let key = tauri::async_runtime::spawn_blocking(move || device_key(&service, &fallback))
                .await??;
            let node = Node::start(key, NodeOptions::default(), tx).await?;
            forward_events(app.clone(), rx);
            anyhow::Ok(node)
        })
        .await
        .map_err(err)?;
    let contacts = contacts.iter().map(|c| parse_id(c)).collect::<Result<Vec<_>>>().map_err(err)?;
    node.set_contacts(contacts);
    Ok(node.id().to_string())
}

#[tauri::command]
pub(crate) fn p2p_set_contacts(state: State<'_, P2pState>, contacts: Vec<String>) -> CmdResult<()> {
    let contacts = contacts.iter().map(|c| parse_id(c)).collect::<Result<Vec<_>>>().map_err(err)?;
    node(&state).map_err(err)?.set_contacts(contacts);
    Ok(())
}

/// Add-a-friend mode. With `name` it turns on and advertises the display name; without, it turns off.
#[tauri::command]
pub(crate) fn p2p_set_pairing(state: State<'_, P2pState>, name: Option<String>) -> CmdResult<()> {
    node(&state).map_err(err)?.set_pairing(name).map_err(err)
}

/// Connects by device ID (using the address found via mDNS)
#[tauri::command]
pub(crate) async fn p2p_connect(state: State<'_, P2pState>, peer: String) -> CmdResult<()> {
    let id = parse_id(&peer).map_err(err)?;
    node(&state).map_err(err)?.connect(id).await.map_err(err)
}

/// Connects directly to an address (JSON) from a connection code and returns the peer's device ID (for networks blocking mDNS)
#[tauri::command]
pub(crate) async fn p2p_connect_addr(state: State<'_, P2pState>, addr: String) -> CmdResult<String> {
    let addr: EndpointAddr =
        serde_json::from_str(&addr).map_err(|e| format!("잘못된 연결 정보: {e}"))?;
    let id = addr.id;
    node(&state).map_err(err)?.connect(addr).await.map_err(err)?;
    Ok(id.to_string())
}

/// Default device display name (the PC name). Strips ".local" from macOS names like "MacBook-Pro.local"
#[tauri::command]
pub(crate) fn p2p_default_name() -> String {
    device_name(&gethostname::gethostname().to_string_lossy())
}

fn device_name(host: &str) -> String {
    let name = host.trim().trim_end_matches(".local").trim_end_matches(".lan");
    if name.is_empty() { "Urinote".to_string() } else { name.chars().take(64).collect() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_name_from_host() {
        assert_eq!(device_name("MacBook-Pro.local"), "MacBook-Pro");
        assert_eq!(device_name("DESKTOP-1234"), "DESKTOP-1234");
        assert_eq!(device_name(""), "Urinote");
    }

    #[test]
    fn falls_back_to_a_private_key_file_and_keeps_using_it() {
        let dir = std::env::temp_dir().join(format!("urinote-key-test-{}", std::process::id()));
        let path = dir.join(KEY_FILE);
        let _ = std::fs::remove_dir_all(&dir);

        let key = SecretKey::generate();
        write_key_file(&path, &key).unwrap();
        // with a file present, its key is used without looking at the secure store
        assert_eq!(device_key("unused", &path).unwrap().to_bytes(), key.to_bytes());
        // an existing file is never overwritten
        assert!(write_key_file(&path, &SecretKey::generate()).is_err());

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

/// My connection info to show as a QR code (JSON)
#[tauri::command]
pub(crate) fn p2p_my_addr(state: State<'_, P2pState>) -> CmdResult<String> {
    serde_json::to_string(&node(&state).map_err(err)?.addr()).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn p2p_send(state: State<'_, P2pState>, peer: String, data: String) -> CmdResult<()> {
    let id = parse_id(&peer).map_err(err)?;
    let bytes = B64.decode(data).map_err(|e| e.to_string())?;
    node(&state).map_err(err)?.send(id, bytes).await.map_err(err)
}

#[tauri::command]
pub(crate) async fn p2p_disconnect(state: State<'_, P2pState>, peer: String) -> CmdResult<()> {
    let id = parse_id(&peer).map_err(err)?;
    node(&state).map_err(err)?.disconnect(id).await;
    Ok(())
}

#[tauri::command]
pub(crate) async fn p2p_connected(state: State<'_, P2pState>) -> CmdResult<Vec<String>> {
    let ids = node(&state).map_err(err)?.connected().await;
    Ok(ids.iter().map(|id| id.to_string()).collect())
}

/// Signs with my device key (for member lists). Input and output are base64
#[tauri::command]
pub(crate) fn p2p_sign(state: State<'_, P2pState>, data: String) -> CmdResult<String> {
    let bytes = B64.decode(data).map_err(|e| e.to_string())?;
    Ok(B64.encode(node(&state).map_err(err)?.sign(&bytes)))
}

#[tauri::command]
pub(crate) fn p2p_verify(signer: String, data: String, signature: String) -> CmdResult<bool> {
    let id = parse_id(&signer).map_err(err)?;
    let (Ok(data), Ok(sig)) = (B64.decode(data), B64.decode(signature)) else {
        return Ok(false);
    };
    Ok(node::verify(&id, &data, &sig))
}

/// Commands are registered together in lib.rs's invoke_handler (Tauri accepts only one handler)
pub fn init<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.manage(P2pState::default())
}
