//! 친구 공유용 P2P 계층을 프런트엔드(ShareEngine)에 노출한다.
//! 메시지 내용(공유 프로토콜)은 프런트엔드가 해석하고, 여기서는 전송·발견·서명만 한다.

mod node;

use std::str::FromStr;

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use iroh::{EndpointAddr, EndpointId, SecretKey};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::{mpsc, OnceCell};

use node::{Node, NodeEvent, NodeOptions};

/// 보안 저장소 항목 이름. 서비스 이름은 앱 identifier 를 써서, 테스트용 두 번째 인스턴스
/// (tauri.dev2.conf.json) 가 다른 기기 키를 갖게 한다.
const KEYRING_USER: &str = "p2p-device-key";

/// Hub 창의 ShareEngine 이 받는 이벤트
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

/// 기기 비밀키를 OS 보안 저장소(Windows 자격 증명 관리자 / macOS 키체인)에서 읽거나 처음이면 만든다.
fn device_key(service: &str) -> Result<SecretKey> {
    let entry = keyring::Entry::new(service, KEYRING_USER)?;
    match entry.get_password() {
        Ok(hex) => {
            let bytes: [u8; 32] = decode_hex(&hex)
                .and_then(|b| b.try_into().ok())
                .context("저장된 기기 키가 손상되었습니다")?;
            Ok(SecretKey::from_bytes(&bytes))
        }
        Err(keyring::Error::NoEntry) => {
            let key = SecretKey::generate();
            entry.set_password(&encode_hex(&key.to_bytes()))?;
            Ok(key)
        }
        Err(e) => Err(e).context("OS 보안 저장소에 접근하지 못했습니다"),
    }
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

/// P2P 를 시작하고 내 기기 ID 를 돌려준다. 여러 번 불러도 한 번만 시작한다.
#[tauri::command]
async fn p2p_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, P2pState>,
    contacts: Vec<String>,
) -> CmdResult<String> {
    let node = state
        .node
        .get_or_try_init(|| async {
            let (tx, rx) = mpsc::unbounded_channel();
            let service = app.config().identifier.clone();
            let node = Node::start(device_key(&service)?, NodeOptions::default(), tx).await?;
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
fn p2p_set_contacts(state: State<'_, P2pState>, contacts: Vec<String>) -> CmdResult<()> {
    let contacts = contacts.iter().map(|c| parse_id(c)).collect::<Result<Vec<_>>>().map_err(err)?;
    node(&state).map_err(err)?.set_contacts(contacts);
    Ok(())
}

/// 친구 추가 모드. `name` 이 있으면 켜고 표시 이름을 광고, 없으면 끈다.
#[tauri::command]
fn p2p_set_pairing(state: State<'_, P2pState>, name: Option<String>) -> CmdResult<()> {
    node(&state).map_err(err)?.set_pairing(name).map_err(err)
}

/// 기기 ID 로 연결 (mDNS 로 찾은 주소 사용)
#[tauri::command]
async fn p2p_connect(state: State<'_, P2pState>, peer: String) -> CmdResult<()> {
    let id = parse_id(&peer).map_err(err)?;
    node(&state).map_err(err)?.connect(id).await.map_err(err)
}

/// 연결 코드로 받은 주소(JSON)로 직접 연결하고 상대 기기 ID 를 돌려준다 (mDNS 가 막힌 네트워크용)
#[tauri::command]
async fn p2p_connect_addr(state: State<'_, P2pState>, addr: String) -> CmdResult<String> {
    let addr: EndpointAddr =
        serde_json::from_str(&addr).map_err(|e| format!("잘못된 연결 정보: {e}"))?;
    let id = addr.id;
    node(&state).map_err(err)?.connect(addr).await.map_err(err)?;
    Ok(id.to_string())
}

/// 기기 표시 이름 기본값 (PC 이름)
#[tauri::command]
fn p2p_default_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Urinote".to_string())
}

/// QR 로 보여 줄 내 연결 정보 (JSON)
#[tauri::command]
fn p2p_my_addr(state: State<'_, P2pState>) -> CmdResult<String> {
    serde_json::to_string(&node(&state).map_err(err)?.addr()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn p2p_send(state: State<'_, P2pState>, peer: String, data: String) -> CmdResult<()> {
    let id = parse_id(&peer).map_err(err)?;
    let bytes = B64.decode(data).map_err(|e| e.to_string())?;
    node(&state).map_err(err)?.send(id, bytes).await.map_err(err)
}

#[tauri::command]
async fn p2p_disconnect(state: State<'_, P2pState>, peer: String) -> CmdResult<()> {
    let id = parse_id(&peer).map_err(err)?;
    node(&state).map_err(err)?.disconnect(id).await;
    Ok(())
}

#[tauri::command]
async fn p2p_connected(state: State<'_, P2pState>) -> CmdResult<Vec<String>> {
    let ids = node(&state).map_err(err)?.connected().await;
    Ok(ids.iter().map(|id| id.to_string()).collect())
}

/// 내 기기 키로 서명 (멤버 목록 서명용). 입력·출력은 base64
#[tauri::command]
fn p2p_sign(state: State<'_, P2pState>, data: String) -> CmdResult<String> {
    let bytes = B64.decode(data).map_err(|e| e.to_string())?;
    Ok(B64.encode(node(&state).map_err(err)?.sign(&bytes)))
}

#[tauri::command]
fn p2p_verify(signer: String, data: String, signature: String) -> CmdResult<bool> {
    let id = parse_id(&signer).map_err(err)?;
    let (Ok(data), Ok(sig)) = (B64.decode(data), B64.decode(signature)) else {
        return Ok(false);
    };
    Ok(node::verify(&id, &data, &sig))
}

pub fn init<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.manage(P2pState::default())
}

pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        p2p_start,
        p2p_set_contacts,
        p2p_set_pairing,
        p2p_connect,
        p2p_connect_addr,
        p2p_default_name,
        p2p_my_addr,
        p2p_send,
        p2p_disconnect,
        p2p_connected,
        p2p_sign,
        p2p_verify,
    ]
}
