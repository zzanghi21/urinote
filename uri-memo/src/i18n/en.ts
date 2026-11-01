import type { Translation, Vars } from "./index";

/** 1개면 단수, 아니면 복수 */
const plural = (key: string, one: string, many: string) => (v: Vars) =>
  (v[key] === 1 ? one : many).replace(`{${key}}`, String(v[key]));

/**
 * 영어 번역. 키는 소스에 쓴 한국어 문구 그대로.
 * 빠진 문구·자리 표시({name}) 불일치는 i18n.test.ts 가 찾아낸다.
 */
export const en: Record<string, Translation> = {
  // 앱 공통
  "저장소를 열지 못했습니다.": "Could not open the note storage.",
  "불러오는 중…": "Loading…",
  설정: "Settings",
  "설정@set": "Set",
  닫기: "Close",
  열기: "Open",
  확인: "OK",
  취소: "Cancel",
  저장: "Save",
  삭제: "Delete",
  만들기: "Create",
  "오류: {message}": "Error: {message}",

  // 메모 색상
  "메모 색상": "Note color",
  노랑: "Yellow",
  초록: "Green",
  분홍: "Pink",
  보라: "Purple",
  파랑: "Blue",
  회색: "Gray",
  차콜: "Charcoal",

  // 목록·사이드바
  "새 메모": "New note",
  "새 메모 (Ctrl+N)": "New note (Ctrl+N)",
  "메모 검색 (Ctrl+F)": "Search notes (Ctrl+F)",
  "메모 검색": "Search notes",
  보기: "View",
  전체: "All",
  고정: "Pin",
  "고정@tab": "Pinned",
  휴지통: "Trash",
  "메모 목록": "Notes",
  '"{query}"에 대한 검색 결과가 없습니다.': 'No results for "{query}".',
  "휴지통이 비어 있습니다.": "Trash is empty.",
  "고정한 메모가 없습니다.": "No pinned notes.",
  "이 폴더에 메모가 없습니다.\n+ 버튼을 누르면 이 폴더에 만듭니다.":
    "No notes in this folder.\nPress + to create one here.",
  "메모가 없습니다.\n+ 버튼으로 새 메모를 만드세요.": "No notes yet.\nPress + to create one.",
  "더블클릭: 바탕화면에 붙이기": "Double-click: pin to desktop",
  "친구와 공유 중": "Shared with friends",
  고정됨: "Pinned",
  어제: "Yesterday",

  // 폴더
  폴더: "Folder",
  "폴더 없음": "No folder",
  "폴더 이름": "Folder name",
  "모든 폴더": "All folders",
  "'{name}' 폴더 관리": "Manage folder '{name}'",
  "폴더 관리": "Manage folder",
  "이름 바꾸기": "Rename",
  "'{name}' 폴더를 삭제할까요?\n안의 메모는 지워지지 않고 \"폴더 없음\"으로 옮겨집니다.":
    "Delete folder '{name}'?\nIts notes are kept and moved to \"No folder\".",
  "폴더 삭제": "Delete folder",
  "새 폴더": "New folder",
  "+ 폴더": "+ Folder",

  // 편집기
  "메모를 선택하거나 새로 만드세요.": "Select a note or create a new one.",
  "메모 편집": "Edit note",
  목록으로: "Back to list",
  "공유 메모입니다. 영구 삭제하면 공유에서 나갑니다 (소유자는 공유 종료).":
    "This is a shared note. Deleting it forever leaves the share (ends it if you are the owner).",
  "휴지통의 메모는 30일 후 영구 삭제됩니다.": "Notes in the trash are deleted after 30 days.",
  복원: "Restore",
  "이 메모를 영구 삭제할까요? 되돌릴 수 없습니다.":
    "Delete this note forever? This cannot be undone.",
  "영구 삭제": "Delete forever",
  "보기 전용": "View only",
  "{time} 수정": "Edited {time}",
  "고정 해제": "Unpin",
  "휴지통으로 이동": "Move to trash",
  "휴지통으로 이동 (나에게서만 숨김)": "Move to trash (hidden only for me)",
  "바탕화면에 붙이기": "Pin to desktop",
  "굵게 (Ctrl+B)": "Bold (Ctrl+B)",
  "기울임 (Ctrl+I)": "Italic (Ctrl+I)",
  "밑줄 (Ctrl+U)": "Underline (Ctrl+U)",
  취소선: "Strikethrough",
  "글머리 기호": "Bulleted list",
  체크리스트: "Checklist",
  서식: "Formatting",

  // 스티키 창
  메뉴: "Menu",
  "닫기 (메모는 목록에 남습니다)": "Close (the note stays in the list)",
  "항상 위": "Always on top",
  투명도: "Opacity",
  펼치기: "Expand",
  접기: "Collapse",
  "메모 목록 열기": "Open note list",
  "Urinote 메모": "Urinote note",

  // 알림
  알림: "Reminder",
  "알림: {time}": "Reminder: {time}",
  "알림 설정": "Set reminder",
  "알림 해제": "Remove reminder",
  "알림 날짜와 시각": "Reminder date and time",
  "날짜와 시각을 입력하세요": "Enter a date and time",
  "지난 시각입니다": "That time has passed",
  "놓친 알림": "Missed reminder",
  "메모 알림": "Note reminder",
  "Urinote 메모 알림": "Urinote reminder",
  "1시간 뒤": "In 1 hour",
  "오늘 저녁 6시": "This evening, 6 PM",
  "내일 오전 9시": "Tomorrow, 9 AM",
  "다음 주 월요일 오전 9시": "Next Monday, 9 AM",
  "오늘 {time}": "Today {time}",
  "내일 {time}": "Tomorrow {time}",
  "어제 {time}": "Yesterday {time}",
  "{month} {day}일 ({weekday}) {time}": "{weekday}, {month} {day} {time}",
  "{year}년 {month} {day}일 ({weekday}) {time}": "{weekday}, {month} {day}, {year} {time}",

  // 설정·백업
  언어: "Language",
  "시스템 설정": "System",
  한국어: "한국어",
  테마: "Theme",
  밝게: "Light",
  어둡게: "Dark",
  "메모 글자 크기": "Note text size",
  작게: "Small",
  보통: "Medium",
  크게: "Large",
  "아주 크게": "Extra large",
  "새 메모 색상": "New note color",
  "스티키 창의 +는 그 메모와 같은 색으로 만듭니다.":
    "The + on a sticky note creates a note in the same color.",
  백업: "Backup",
  "JSON으로 내보내기": "Export as JSON",
  가져오기: "Import",
  "메모 {count}개를 저장했습니다.": plural("count", "Saved 1 note.", "Saved {count} notes."),
  "메모 {notes}개, 폴더 {folders}개를 가져옵니다.\n지금 있는 메모는 지워지지 않고, 같은 메모는 내용이 합쳐집니다.\n설정은 파일의 설정으로 바뀝니다.":
    "Import {notes} notes and {folders} folders?\nExisting notes are kept, and the same notes are merged.\nSettings will be replaced by the file's settings.",
  "새 메모 {created}개, 합친 메모 {merged}개를 가져왔습니다.":
    "Imported {created} new and {merged} merged notes.",
  "메모·폴더·설정을 담습니다. 친구 목록과 공유 정보는 담지 않으며, 공유 메모는 개인 메모로 들어옵니다.":
    "Includes notes, folders and settings. Friends and sharing info are not included; shared notes are imported as personal notes.",
  "Urinote 백업 (JSON)": "Urinote backup (JSON)",
  "JSON 파일이 아닙니다": "This is not a JSON file",
  "Urinote 백업 파일이 아닙니다": "This is not an Urinote backup file",
  "이 버전의 Urinote 에서 읽을 수 없는 백업 형식입니다":
    "This backup format cannot be read by this version of Urinote",
  "백업 파일이 손상되었습니다 ({where})": "The backup file is damaged ({where})",

  // 트레이
  "모든 메모 보이기": "Show all notes",
  "모든 메모 숨기기": "Hide all notes",
  "시작 시 자동 실행": "Start at login",
  종료: "Quit",

  // 친구
  친구: "Friends",
  "친구 (같은 Wi-Fi 공유)": "Friends (share on the same Wi-Fi)",
  "친구 {count}명 중 {online}명 연결됨": "{online} of {count} friends connected",
  "친구 {count}명 · 지금 같은 Wi-Fi 에 없음": (v) =>
    `${v.count} ${v.count === 1 ? "friend" : "friends"} · none on this Wi-Fi now`,
  "친구 목록": "Your friends",
  "아직 등록한 친구가 없습니다.": "You haven't added any friends yet.",
  "친구 추가": "Add a friend",
  "같은 Wi-Fi에 있는 친구도 이 화면을 열면 아래에 나타납니다. 친구를 고르고 두 화면의 확인 코드가 같은지 확인하세요.":
    "Friends on the same Wi-Fi appear below when they open this screen too. Pick a friend and check that both screens show the same code.",
  "근처의 Urinote를 찾는 중…": "Looking for Urinote nearby…",
  "친구 요청": "Add friend",
  "내 기기": "This device",
  "이름 바꾸기 (친구에게 보이는 이름)": "Rename (the name your friends see)",
  연결됨: "Connected",
  "떨어져 있음": "Away",
  "친구 이름": "Friend's name",
  "이름 변경": "Rename",
  "'{name}'을(를) 친구 목록에서 삭제할까요?": "Remove '{name}' from your friends?",
  "목록에 친구가 안 보이나요? 연결 코드로 연결하기": "Can't see your friend? Connect with a code",
  "복사됨 ✓": "Copied ✓",
  "내 연결 코드 복사": "Copy my connection code",
  "친구의 연결 코드 붙여넣기": "Paste your friend's code",
  연결: "Connect",
  "같은 Wi-Fi여야 하며, 친구도 이 화면을 열어 두어야 합니다.":
    "You must be on the same Wi-Fi, and your friend must have this screen open.",
  "{name}에게 친구 요청을 보냈습니다.": "Friend request sent to {name}.",
  "상대 화면에서 수락하기를 기다리는 중…": "Waiting for them to accept…",
  "{name} 님의 친구 요청": "Friend request from {name}",
  "기기 {id}": "Device {id}",
  거절: "Decline",
  수락: "Accept",
  "확인 코드를 만드는 중…": "Creating the confirmation code…",
  "확인 코드": "Confirmation code",
  "{name}의 화면에 보이는 코드와 같나요?": "Does it match the code on {name}'s screen?",
  아니요: "No",
  "예, 같습니다": "Yes, it matches",
  "상대가 확인하기를 기다리는 중…": "Waiting for them to confirm…",
  "{name}을(를) 친구로 등록했습니다.": "{name} is now your friend.",
  "친구 등록을 하지 못했습니다.": "Could not add the friend.",
  "상대 기기": "Other device",
  // 친구 등록 실패 이유 (상대 기기가 보낸 이유도 이 키로 번역된다)
  "시간이 초과되었습니다": "Timed out",
  "확인 코드가 서로 다릅니다": "The codes do not match",
  "상대가 보낸 값이 약속과 다릅니다 (연결이 조작되었을 수 있음)":
    "The other device sent an unexpected value (the connection may have been tampered with)",
  "상대가 취소했습니다": "The other side cancelled",
  "메시지를 보내지 못했습니다: {error}": "Could not send the message: {error}",
  "예상하지 못한 메시지를 받았습니다": "Received an unexpected message",
  "연결이 끊어졌습니다": "The connection was lost",
  "상대가 친구 추가 화면을 닫았습니다": "The other side closed the Add a friend screen",
  "상대가 다른 기기와 친구 등록 중입니다": "The other side is pairing with another device",
  "Urinote 연결 코드가 아닙니다": "This is not an Urinote connection code",
  "연결 코드가 손상되었습니다": "The connection code is damaged",

  // 공유
  "친구와 공유": "Share with friends",
  "친구와 공유 (같은 Wi-Fi)": "Share with friends (same Wi-Fi)",
  "공유 중 · {count}명 (지금 연결 {online}명)": "Shared · {count} members ({online} connected now)",
  "소유자가 공유를 종료했습니다. 이 메모는 내 개인 메모로 남았습니다.":
    "The owner ended sharing. This note stays as your personal note.",
  "공유에서 빠졌습니다. 이 메모는 내 개인 메모로 남았습니다.":
    "You were removed from the share. This note stays as your personal note.",
  "연결된 멤버가 없습니다. 다시 만나면 편집이 합쳐집니다":
    "No members connected. Edits will merge when you meet again",
  "혼자 편집 중": "Editing alone",
  "지금 연결된 멤버 {count}명": plural("count", "1 member connected", "{count} members connected"),
  "{name} · 연결됨": "{name} · connected",
  소유자: "Owner",
  "편집 가능": "Can edit",
  "메모 공유": "Share note",
  "'{title}' 공유": "Share '{title}'",
  "같은 Wi-Fi에 있는 친구와 함께 편집합니다. 떨어져 있는 동안의 편집은 다시 만나면 합쳐집니다.":
    "Edit together with friends on the same Wi-Fi. Edits made while apart merge when you meet again.",
  "멤버 {count}명": plural("count", "1 member", "{count} members"),
  "지금 함께 편집 중": "Editing together now",
  "떨어져 있음 (만나면 합쳐짐)": "Away (merges when you meet)",
  나: "me",
  "{name} 권한": "{name}'s permission",
  "{name}을(를) 공유에서 내보낼까요?\n이미 받아 간 내용은 회수할 수 없습니다.":
    "Remove {name} from this share?\nContent they already received cannot be taken back.",
  내보내기: "Remove",
  "권한 변경·내보내기는 그 기기를 다음에 만날 때 적용됩니다. 그 전까지는 이전 권한으로 동기화될 수 있습니다.":
    "Permission changes and removals apply the next time you meet that device. Until then it may sync with its old permission.",
  "공유하려면 먼저 같은 Wi-Fi에 있는 친구를 등록하세요.":
    "To share, first add a friend on the same Wi-Fi.",
  "친구 초대": "Invite friends",
  "함께 편집할 친구": "Friends to edit with",
  초대: "Invite",
  공유: "Share",
  "친구가 같은 Wi-Fi에 없으면 다음에 만날 때 공유 제안이 전달됩니다.":
    "If a friend isn't on this Wi-Fi, the invitation is delivered the next time you meet.",
  "내 권한: {role}": "Your permission: {role}",
  "공유를 종료할까요?\n친구들의 메모는 각자의 개인 메모로 남습니다.":
    "End sharing?\nYour friends keep the note as their own personal note.",
  "공유에서 나갈까요?\n이 메모는 내 개인 메모로 남고, 이후 변경은 받지 않습니다.":
    "Leave this share?\nThe note stays as your personal note and won't receive further changes.",
  "공유 종료": "End sharing",
  "공유 나가기": "Leave share",
  "{name}님이 '{title}'을(를) 공유했습니다": "{name} shared '{title}' with you",
  "공유 인원은 최대 {max}대입니다": "A note can be shared with up to {max} devices",
  "소유자는 나갈 수 없습니다. 공유를 종료하세요": "The owner can't leave. End sharing instead",
  "공유 중인 메모가 아닙니다": "This note is not shared",
  "소유자만 멤버를 바꿀 수 있습니다": "Only the owner can change members",
};
