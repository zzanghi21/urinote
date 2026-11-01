//! 같은 Wi-Fi 안의 Urinote 기기끼리 직접 연결하는 P2P 노드 (DESIGN.md 4.9).
//!
//! - iroh Endpoint: 릴레이·외부 DNS 없이 로컬 네트워크만 사용 (`presets::Minimal` + `RelayMode::Disabled`)
//! - mDNS(`_urinote._udp.local`)로 기기 발견
//! - 연결 상대의 기기 ID 는 TLS 로 확인된 값이다
//! - 메시지 내용은 해석하지 않는다. 길이 접두(4바이트 BE) 프레임으로 주고받기만 한다.
//!
//! Tauri 와 무관하게 동작하므로 `cargo test` 로 검증한다.

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};

use anyhow::{bail, Context, Result};
use iroh::{
    address_lookup::UserData,
    endpoint::{presets, Connection, RecvStream, SendStream},
    Endpoint, EndpointAddr, EndpointId, RelayMode, SecretKey, Signature,
};
use iroh_mdns_address_lookup::{DiscoveryEvent, MdnsAddressLookup};
use n0_future::StreamExt;
use tokio::sync::{mpsc, Mutex};

pub const ALPN: &[u8] = b"urinote/share/1";
pub const MDNS_SERVICE: &str = "urinote";
pub const MAX_FRAME: usize = 4 * 1024 * 1024;

/// mDNS 광고에 붙이는 표시. 친구 추가 모드일 때만 `urinote:<표시 이름>` 으로 이름을 드러낸다.
const USER_DATA_TAG: &str = "urinote";
/// 상대가 1초에 보낼 수 있는 최대 메시지 수. 넘으면 연결을 끊는다.
const RATE_LIMIT_PER_SEC: u32 = 200;
const SEND_QUEUE: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NodeEvent {
    /// 같은 네트워크에서 Urinote 기기를 찾았다. `name` 은 상대가 친구 추가 모드일 때만 있다.
    Discovered { id: EndpointId, name: Option<String> },
    Expired { id: EndpointId },
    Connected { id: EndpointId },
    Disconnected { id: EndpointId },
    Message { from: EndpointId, data: Vec<u8> },
}

/// 어떤 기기와 연결을 허용할지. 친구(contacts)는 항상, 그 밖의 기기는 친구 추가 모드일 때만.
#[derive(Debug, Default)]
struct Policy {
    contacts: HashSet<EndpointId>,
    pairing: bool,
}

struct Peer {
    conn: Connection,
    /// 이 연결을 먼저 건 쪽. 양쪽이 동시에 걸었을 때 같은 연결을 남기기 위해 쓴다.
    dialer: EndpointId,
    tx: mpsc::Sender<Vec<u8>>,
}

struct Shared {
    me: EndpointId,
    policy: RwLock<Policy>,
    peers: Mutex<HashMap<EndpointId, Peer>>,
    events: mpsc::UnboundedSender<NodeEvent>,
}

impl Shared {
    fn allowed(&self, id: &EndpointId) -> bool {
        let policy = self.policy.read().expect("policy lock poisoned");
        policy.pairing || policy.contacts.contains(id)
    }

    fn emit(&self, event: NodeEvent) {
        let _ = self.events.send(event);
    }
}

pub struct Node {
    endpoint: Endpoint,
    mdns: Option<MdnsAddressLookup>,
    shared: Arc<Shared>,
}

pub struct NodeOptions {
    /// 테스트에서는 mDNS 없이 주소로 직접 연결한다
    pub mdns: bool,
}

impl Default for NodeOptions {
    fn default() -> Self {
        Self { mdns: true }
    }
}

impl Node {
    pub async fn start(
        secret: SecretKey,
        options: NodeOptions,
        events: mpsc::UnboundedSender<NodeEvent>,
    ) -> Result<Self> {
        let endpoint = Endpoint::builder(presets::Minimal)
            .secret_key(secret)
            .relay_mode(RelayMode::Disabled)
            .alpns(vec![ALPN.to_vec()])
            .bind()
            .await
            .context("P2P 소켓을 열지 못했습니다")?;

        let shared = Arc::new(Shared {
            me: endpoint.id(),
            policy: RwLock::new(Policy::default()),
            peers: Mutex::new(HashMap::new()),
            events,
        });

        let mdns = if options.mdns {
            let mdns = MdnsAddressLookup::builder()
                .service_name(MDNS_SERVICE)
                .build(endpoint.id())
                .context("mDNS 를 시작하지 못했습니다")?;
            endpoint.address_lookup()?.add(mdns.clone());
            endpoint.set_user_data_for_address_lookup(Some(user_data(None)?));
            tokio::spawn(discovery_loop(mdns.clone(), endpoint.clone(), shared.clone()));
            Some(mdns)
        } else {
            None
        };

        tokio::spawn(accept_loop(endpoint.clone(), shared.clone()));
        Ok(Self { endpoint, mdns, shared })
    }

    pub fn id(&self) -> EndpointId {
        self.endpoint.id()
    }

    /// 수동 연결(QR)용 주소: 기기 ID + 로컬 IP 주소들
    pub fn addr(&self) -> EndpointAddr {
        self.endpoint.addr()
    }

    pub fn set_contacts(&self, contacts: impl IntoIterator<Item = EndpointId>) {
        let mut policy = self.shared.policy.write().expect("policy lock poisoned");
        policy.contacts = contacts.into_iter().collect();
    }

    /// 친구 추가 모드. `Some(이름)` 이면 켜고 mDNS 에 이름을 광고한다.
    pub fn set_pairing(&self, name: Option<String>) -> Result<()> {
        self.shared.policy.write().expect("policy lock poisoned").pairing = name.is_some();
        if self.mdns.is_some() {
            self.endpoint
                .set_user_data_for_address_lookup(Some(user_data(name.as_deref())?));
        }
        Ok(())
    }

    pub async fn connect(&self, addr: impl Into<EndpointAddr>) -> Result<()> {
        connect(&self.endpoint, &self.shared, addr.into()).await
    }

    pub async fn send(&self, to: EndpointId, data: Vec<u8>) -> Result<()> {
        if data.len() > MAX_FRAME {
            bail!("메시지가 너무 큽니다 ({} bytes)", data.len());
        }
        let tx = {
            let peers = self.shared.peers.lock().await;
            peers.get(&to).map(|p| p.tx.clone())
        };
        let Some(tx) = tx else { bail!("연결되지 않은 기기입니다") };
        tx.send(data).await.context("연결이 끊겼습니다")
    }

    pub async fn disconnect(&self, id: EndpointId) {
        if let Some(peer) = self.shared.peers.lock().await.remove(&id) {
            peer.conn.close(0u32.into(), b"bye");
            self.shared.emit(NodeEvent::Disconnected { id });
        }
    }

    pub async fn connected(&self) -> Vec<EndpointId> {
        self.shared.peers.lock().await.keys().copied().collect()
    }

    pub fn sign(&self, data: &[u8]) -> [u8; 64] {
        self.endpoint.secret_key().sign(data).to_bytes()
    }
}

pub fn verify(signer: &EndpointId, data: &[u8], signature: &[u8]) -> bool {
    let Ok(bytes) = <[u8; 64]>::try_from(signature) else { return false };
    signer.verify(data, &Signature::from_bytes(&bytes)).is_ok()
}

fn user_data(name: Option<&str>) -> Result<UserData> {
    let text = match name {
        Some(name) => {
            // UTF-8 경계를 지키며 최대 길이에 맞춘다
            let mut text = format!("{USER_DATA_TAG}:{name}");
            while text.len() > UserData::MAX_LENGTH {
                text.pop();
            }
            text
        }
        None => USER_DATA_TAG.to_string(),
    };
    UserData::try_from(text).context("잘못된 표시 이름")
}

/// mDNS 광고에서 Urinote 기기인지와 표시 이름을 읽는다
fn parse_user_data(data: Option<&UserData>) -> Option<Option<String>> {
    let text = data?.as_ref();
    if text == USER_DATA_TAG {
        return Some(None);
    }
    let name = text.strip_prefix(USER_DATA_TAG)?.strip_prefix(':')?;
    Some(Some(name.to_string()))
}

async fn discovery_loop(mdns: MdnsAddressLookup, endpoint: Endpoint, shared: Arc<Shared>) {
    let mut events = mdns.subscribe().await;
    while let Some(event) = events.next().await {
        match event {
            DiscoveryEvent::Discovered { endpoint_info, .. } => {
                let id = endpoint_info.endpoint_id;
                let Some(name) = parse_user_data(endpoint_info.data.user_data()) else {
                    continue; // Urinote 가 아닌 iroh 기기
                };
                shared.emit(NodeEvent::Discovered { id, name });
                // 친구 기기는 자동으로 연결한다. 양쪽이 동시에 걸지 않도록 ID 가 작은 쪽만 건다.
                let is_contact = shared
                    .policy
                    .read()
                    .expect("policy lock poisoned")
                    .contacts
                    .contains(&id);
                let connected = shared.peers.lock().await.contains_key(&id);
                if is_contact && !connected && shared.me < id {
                    let (endpoint, shared) = (endpoint.clone(), shared.clone());
                    tokio::spawn(async move {
                        if let Err(err) = connect(&endpoint, &shared, id.into()).await {
                            log::info!("p2p auto-connect {} failed: {err:#}", id.fmt_short());
                        }
                    });
                }
            }
            DiscoveryEvent::Expired { endpoint_id } => {
                shared.emit(NodeEvent::Expired { id: endpoint_id });
            }
            _ => {}
        }
    }
}

async fn accept_loop(endpoint: Endpoint, shared: Arc<Shared>) {
    while let Some(incoming) = endpoint.accept().await {
        let shared = shared.clone();
        tokio::spawn(async move {
            let result: Result<()> = async {
                let conn = incoming.accept()?.await?;
                let id = conn.remote_id();
                if !shared.allowed(&id) {
                    conn.close(1u32.into(), b"not a contact");
                    bail!("친구가 아닌 기기의 연결을 거부했습니다: {}", id.fmt_short());
                }
                let (send, recv) = conn.accept_bi().await?;
                register(shared, conn, id, send, recv).await;
                Ok(())
            }
            .await;
            if let Err(err) = result {
                log::info!("p2p incoming: {err:#}");
            }
        });
    }
}

async fn connect(endpoint: &Endpoint, shared: &Arc<Shared>, addr: EndpointAddr) -> Result<()> {
    let id = addr.id;
    if !shared.allowed(&id) {
        bail!("친구가 아니거나 친구 추가 모드가 아닙니다");
    }
    if shared.peers.lock().await.contains_key(&id) {
        return Ok(());
    }
    let conn = endpoint.connect(addr, ALPN).await.context("연결하지 못했습니다")?;
    let (mut send, recv) = conn.open_bi().await?;
    // QUIC 스트림은 첫 데이터가 가야 상대가 accept_bi 로 받는다 → 빈 프레임을 보낸다
    write_frame(&mut send, &[]).await?;
    register(shared.clone(), conn, shared.me, send, recv).await;
    Ok(())
}

/// 연결을 등록하고 송수신 작업을 시작한다.
/// 같은 기기와 연결이 이미 있으면 ID 가 작은 쪽이 건 연결을 남긴다 (양쪽이 같은 결론을 낸다).
async fn register(
    shared: Arc<Shared>,
    conn: Connection,
    dialer: EndpointId,
    send: SendStream,
    recv: RecvStream,
) {
    let id = conn.remote_id();
    let (tx, rx) = mpsc::channel(SEND_QUEUE);
    {
        let mut peers = shared.peers.lock().await;
        if let Some(existing) = peers.get(&id) {
            if existing.dialer < dialer {
                conn.close(2u32.into(), b"duplicate");
                return;
            }
            existing.conn.close(2u32.into(), b"duplicate");
        }
        peers.insert(id, Peer { conn: conn.clone(), dialer, tx });
    }
    shared.emit(NodeEvent::Connected { id });

    tokio::spawn(write_loop(send, rx));
    tokio::spawn(async move {
        if let Err(err) = read_loop(&shared, id, recv).await {
            log::info!("p2p {}: {err:#}", id.fmt_short());
        }
        conn.close(0u32.into(), b"closed");
        let mut peers = shared.peers.lock().await;
        // 중복 연결 정리로 이미 다른 연결로 바뀌었다면 그 연결은 건드리지 않는다
        if peers.get(&id).is_some_and(|p| p.conn.stable_id() == conn.stable_id()) {
            peers.remove(&id);
            drop(peers);
            shared.emit(NodeEvent::Disconnected { id });
        }
    });
}

async fn write_loop(mut send: SendStream, mut rx: mpsc::Receiver<Vec<u8>>) {
    while let Some(data) = rx.recv().await {
        if write_frame(&mut send, &data).await.is_err() {
            break;
        }
    }
    let _ = send.finish();
}

async fn read_loop(shared: &Shared, from: EndpointId, mut recv: RecvStream) -> Result<()> {
    let mut window = Instant::now();
    let mut count = 0u32;
    loop {
        let Some(data) = read_frame(&mut recv).await? else { return Ok(()) };
        if window.elapsed() >= Duration::from_secs(1) {
            window = Instant::now();
            count = 0;
        }
        count += 1;
        if count > RATE_LIMIT_PER_SEC {
            bail!("메시지가 너무 많아 연결을 끊습니다");
        }
        if !data.is_empty() {
            shared.emit(NodeEvent::Message { from, data });
        }
    }
}

async fn write_frame(send: &mut SendStream, data: &[u8]) -> Result<()> {
    send.write_all(&(data.len() as u32).to_be_bytes()).await?;
    send.write_all(data).await?;
    Ok(())
}

/// 상대가 스트림을 정상 종료하면 `None`
async fn read_frame(recv: &mut RecvStream) -> Result<Option<Vec<u8>>> {
    let mut len = [0u8; 4];
    match recv.read_exact(&mut len).await {
        Ok(()) => {}
        Err(iroh::endpoint::ReadExactError::FinishedEarly(0)) => return Ok(None),
        Err(err) => return Err(err.into()),
    }
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_FRAME {
        bail!("너무 큰 메시지 ({len} bytes)");
    }
    let mut data = vec![0u8; len];
    recv.read_exact(&mut data).await?;
    Ok(Some(data))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn node() -> (Node, mpsc::UnboundedReceiver<NodeEvent>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let node = Node::start(SecretKey::generate(), NodeOptions { mdns: false }, tx)
            .await
            .unwrap();
        (node, rx)
    }

    async fn next_message(rx: &mut mpsc::UnboundedReceiver<NodeEvent>) -> (EndpointId, Vec<u8>) {
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                if let Some(NodeEvent::Message { from, data }) = rx.recv().await {
                    return (from, data);
                }
            }
        })
        .await
        .expect("message timeout")
    }

    #[tokio::test]
    async fn contacts_exchange_messages_with_authenticated_ids() {
        let (a, mut a_rx) = node().await;
        let (b, mut b_rx) = node().await;
        a.set_contacts([b.id()]);
        b.set_contacts([a.id()]);

        a.connect(b.addr()).await.unwrap();
        a.send(b.id(), b"hello from a".to_vec()).await.unwrap();
        assert_eq!(next_message(&mut b_rx).await, (a.id(), b"hello from a".to_vec()));

        // 받은 쪽에서도 같은 연결로 답할 수 있다
        tokio::time::sleep(Duration::from_millis(100)).await;
        b.send(a.id(), b"hi".to_vec()).await.unwrap();
        assert_eq!(next_message(&mut a_rx).await, (b.id(), b"hi".to_vec()));
    }

    #[tokio::test]
    async fn rejects_devices_that_are_not_contacts() {
        let (a, _a_rx) = node().await;
        let (b, _b_rx) = node().await;
        a.set_pairing(Some("A".into())).unwrap(); // A 는 걸 수 있지만 B 가 친구로 등록하지 않았다

        let _ = a.connect(b.addr()).await;
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert!(b.connected().await.is_empty());
        assert!(a.send(b.id(), b"x".to_vec()).await.is_err() || b.connected().await.is_empty());
    }

    #[tokio::test]
    async fn pairing_mode_allows_strangers_on_both_sides() {
        let (a, _a_rx) = node().await;
        let (b, mut b_rx) = node().await;
        a.set_pairing(Some("민지 PC".into())).unwrap();
        b.set_pairing(Some("준호 노트북".into())).unwrap();

        a.connect(b.addr()).await.unwrap();
        a.send(b.id(), b"pair?".to_vec()).await.unwrap();
        assert_eq!(next_message(&mut b_rx).await.1, b"pair?".to_vec());
    }

    #[tokio::test]
    async fn signatures_verify_only_for_the_signer() {
        let (a, _) = node().await;
        let (b, _) = node().await;
        let sig = a.sign(b"members v2");
        assert!(verify(&a.id(), b"members v2", &sig));
        assert!(!verify(&b.id(), b"members v2", &sig));
        assert!(!verify(&a.id(), b"members v3", &sig));
        assert!(!verify(&a.id(), b"members v2", &sig[..10]));
    }

    /// 실제 mDNS 멀티캐스트로 서로 찾고, 친구끼리는 자동으로 연결되는지 (같은 PC 안의 두 노드)
    #[tokio::test]
    async fn discovers_and_auto_connects_contacts_over_mdns() {
        // CI 러너는 멀티캐스트를 막는 경우가 많다
        if std::env::var_os("CI").is_some() {
            eprintln!("skipped on CI: needs multicast");
            return;
        }
        let (a_tx, mut a_rx) = mpsc::unbounded_channel();
        let (b_tx, mut b_rx) = mpsc::unbounded_channel();
        let a = Node::start(SecretKey::generate(), NodeOptions::default(), a_tx).await.unwrap();
        let b = Node::start(SecretKey::generate(), NodeOptions::default(), b_tx).await.unwrap();
        a.set_contacts([b.id()]);
        b.set_contacts([a.id()]);
        b.set_pairing(Some("B 노트북".into())).unwrap();

        let (a_id, b_id) = (a.id(), b.id());
        let (a_saw, _) = tokio::time::timeout(Duration::from_secs(20), async {
            tokio::join!(
                wait_discovered_and_connected(&mut a_rx, b_id),
                wait_discovered_and_connected(&mut b_rx, a_id)
            )
        })
        .await
        .expect("mDNS discovery/auto-connect timed out");
        assert_eq!(a_saw.as_deref(), Some("B 노트북"));
    }

    /// 상대를 mDNS 로 발견하고 연결될 때까지 기다린다. 발견 중 받은 표시 이름을 돌려준다.
    async fn wait_discovered_and_connected(
        rx: &mut mpsc::UnboundedReceiver<NodeEvent>,
        peer: EndpointId,
    ) -> Option<String> {
        let mut found_name = None;
        let mut discovered = false;
        loop {
            match rx.recv().await.unwrap() {
                NodeEvent::Discovered { id, name } if id == peer => {
                    discovered = true;
                    found_name = name.or(found_name);
                }
                NodeEvent::Connected { id } if id == peer && discovered => return found_name,
                _ => {}
            }
        }
    }

    #[test]
    fn user_data_round_trip() {
        assert_eq!(parse_user_data(Some(&user_data(None).unwrap())), Some(None));
        assert_eq!(
            parse_user_data(Some(&user_data(Some("민지 PC")).unwrap())),
            Some(Some("민지 PC".to_string()))
        );
        assert_eq!(parse_user_data(Some(&UserData::try_from("other-app".to_string()).unwrap())), None);
        assert_eq!(parse_user_data(None), None);
        let long = "가".repeat(200);
        assert!(user_data(Some(&long)).unwrap().as_ref().len() <= UserData::MAX_LENGTH);
    }
}
