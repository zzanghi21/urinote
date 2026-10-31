/**
 * 공유 멤버 목록 (DESIGN.md 4.9.6). 소유자 기기 키로 서명하므로 다른 멤버를 거쳐 전달돼도 위조할 수 없다.
 */

export type ShareRole = "owner" | "editor" | "viewer";
export const MAX_MEMBERS = 10;

export interface Member {
  id: string;
  name: string;
  role: ShareRole;
}

export interface Membership {
  noteId: string;
  version: number;
  owner: string;
  status: "active" | "ended";
  members: Member[];
  issuedAt: number;
}

export interface SignedMembership {
  membership: Membership;
  /** base64 */
  signature: string;
}

/** 서명 대상 바이트. 키 순서에 흔들리지 않도록 배열 형태로 고정한다. */
export function membershipBytes(m: Membership): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      "urinote-membership-v1",
      m.noteId,
      m.version,
      m.owner,
      m.status,
      m.members.map((x) => [x.id, x.name, x.role]),
      m.issuedAt,
    ]),
  );
}

export const roleOf = (m: Membership, deviceId: string): ShareRole | null =>
  m.members.find((x) => x.id === deviceId)?.role ?? null;

export const canEdit = (m: Membership, deviceId: string) => {
  const role = roleOf(m, deviceId);
  return m.status === "active" && (role === "owner" || role === "editor");
};

const isRole = (v: unknown): v is ShareRole => v === "owner" || v === "editor" || v === "viewer";
const isStr = (v: unknown, max = 128): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

/** 상대가 보낸 멤버 목록의 형식 검사 (서명 검사는 따로) */
export function parseMembership(raw: unknown): Membership | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (
    !isStr(m.noteId) ||
    !isStr(m.owner) ||
    !Number.isSafeInteger(m.version) ||
    (m.version as number) < 1 ||
    (m.status !== "active" && m.status !== "ended") ||
    !Number.isSafeInteger(m.issuedAt) ||
    !Array.isArray(m.members) ||
    m.members.length === 0 ||
    m.members.length > MAX_MEMBERS
  ) {
    return null;
  }
  const members: Member[] = [];
  for (const x of m.members as unknown[]) {
    if (typeof x !== "object" || x === null) return null;
    const { id, name, role } = x as Record<string, unknown>;
    if (!isStr(id) || !isStr(name, 64) || !isRole(role)) return null;
    members.push({ id, name, role });
  }
  const owners = members.filter((x) => x.role === "owner");
  if (owners.length !== 1 || owners[0].id !== m.owner) return null;
  if (new Set(members.map((x) => x.id)).size !== members.length) return null;
  return {
    noteId: m.noteId,
    version: m.version as number,
    owner: m.owner,
    status: m.status,
    members,
    issuedAt: m.issuedAt as number,
  };
}
