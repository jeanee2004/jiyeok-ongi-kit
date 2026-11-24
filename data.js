/* 지역 온기 — 문항과 프로그램 카탈로그.
   비용 숫자는 모두 기획용 추정치(가설)입니다. 실제 견적은 기관 담당자에게 직접 듣고 확정합니다. */

// 기업이 추구하는 이미지 (최대 2개 선택)
const IMAGES = [
  { id: "local",   label: "지역과 함께 자라는 이웃 기업", hint: "가까운 동네와 오래 관계 맺기" },
  { id: "future",  label: "미래세대를 키우는 기업",       hint: "아동·청소년 학습과 진로" },
  { id: "green",   label: "환경을 생각하는 기업",         hint: "하천·공원·자원순환" },
  { id: "expert",  label: "전문성으로 기여하는 기업",     hint: "임직원의 직무 역량 나눔" },
  { id: "inclusive", label: "누구도 소외되지 않게 하는 기업", hint: "어르신·장애·다문화 포용" },
  { id: "team",    label: "임직원이 함께 움직이는 따뜻한 조직", hint: "팀이 같이 땀 흘리는 경험" },
];

// 이번 활동의 주된 목적 (1개)
const PURPOSES = [
  { id: "esg",      label: "ESG·지속가능경영 보고에 쓸 성과" },
  { id: "relation", label: "지역 기관·주민과의 관계" },
  { id: "pride",    label: "임직원 결속과 자긍심" },
  { id: "hiring",   label: "채용·조직문화 브랜딩" },
  { id: "trust",    label: "고객·거래처의 신뢰" },
];

const SKILLS = [
  { id: "teach",  label: "교육·강의" },
  { id: "digital", label: "IT·디지털" },
  { id: "finance", label: "회계·재무·금융" },
  { id: "design", label: "디자인·마케팅" },
  { id: "build",  label: "기술·시공·정비" },
  { id: "none",   label: "특별히 없음" },
];

const FIELDS = [
  { id: "child",  label: "아동·청소년" },
  { id: "senior", label: "어르신" },
  { id: "green",  label: "환경·마을" },
  { id: "multi",  label: "다문화·이주민" },
  { id: "disab",  label: "장애인" },
  { id: "house",  label: "주거취약가구" },
];

const BUDGET_PRESETS = [
  { id: "b1", label: "50만 원 이하",   min: 0,       max: 500000 },
  { id: "b2", label: "50~100만 원",    min: 500000,  max: 1000000 },
  { id: "b3", label: "100~200만 원",   min: 1000000, max: 2000000 },
  { id: "b4", label: "200~500만 원",   min: 2000000, max: 5000000 },
  { id: "b5", label: "500만 원 이상",  min: 5000000, max: 10000000 },
];

// 기획·운영 패키지 시범가 (린캔버스 ⑥ 수익원 가설과 같은 숫자)
const SERVICE_FEE = 300000;

/* 프로그램 카탈로그
   cost.fixed   : 회당 고정비 (기관 지원 물품·재료·강사료 등)
   cost.perHead : 임직원 1인당 비용 (식비·보험·소모품)
   cost.vehicle : 차량이 필요하면 회당 비용
   impact       : 기관 체감도 1~5 (기획자 추정)
   repeat       : 2회차로 이어 가기 쉬운 정도 1~5 */
const PROGRAMS = [
  {
    id: "book", name: "책 읽고 이야기 나누기 교실", field: "child", org: "지역아동센터",
    images: ["future", "local", "team"], skills: ["teach"], purposes: ["relation", "pride", "esg"],
    heads: [4, 16], hours: 3, place: "indoor", impact: 4, repeat: 5,
    cost: { fixed: 150000, perHead: 18000, vehicle: 0 },
    costNote: "아동용 도서·활동지 15만 원, 1인 간식·보험 1.8만 원",
    summary: "임직원 2명이 아동 4~5명과 한 모둠이 되어 같은 책을 읽고 이야기합니다. 2회차에도 같은 모둠이 다시 만납니다.",
    next: "2회차: 같은 모둠이 다음 책으로 이어 가고, 학기 말에 아이들이 고른 책을 센터에 남깁니다.",
    metric: "참여 아동 수 · 모둠 유지율 · 센터 담당자 의견",
  },
  {
    id: "career", name: "우리 회사 직업 체험의 날", field: "child", org: "지역아동센터 · 청소년수련관",
    images: ["future", "expert", "local"], skills: ["teach", "digital", "design", "build", "finance"], purposes: ["hiring", "pride", "esg"],
    heads: [5, 20], hours: 3, place: "indoor", impact: 4, repeat: 4,
    cost: { fixed: 200000, perHead: 15000, vehicle: 0 },
    costNote: "체험 재료·활동지 20만 원, 1인 식비·보험 1.5만 원",
    summary: "임직원이 자기 직무를 청소년 눈높이로 소개하고 직접 해 보는 체험 부스를 운영합니다.",
    next: "2회차: 관심을 보인 청소년과 소그룹 멘토링으로 이어 갑니다.",
    metric: "참여 청소년 수 · 체험 후 진로 관심 응답 · 멘토링 연결 수",
  },
  {
    id: "phone", name: "어르신 스마트폰 짝꿍 교실", field: "senior", org: "노인복지관 · 경로당",
    images: ["inclusive", "local", "expert"], skills: ["digital", "teach"], purposes: ["relation", "trust", "esg"],
    heads: [4, 15], hours: 2, place: "indoor", impact: 5, repeat: 5,
    cost: { fixed: 80000, perHead: 12000, vehicle: 0 },
    costNote: "교재 인쇄·간식 8만 원, 1인 식비·보험 1.2만 원",
    summary: "임직원 1명이 어르신 2명을 맡아 메시지·사진·병원 예약·키오스크를 함께 연습합니다.",
    next: "2회차: 같은 짝꿍이 다시 만나 지난번 배운 것을 확인하고 다음 기능을 배웁니다.",
    metric: "참여 어르신 수 · 혼자 할 수 있게 된 기능 수 · 재참여율",
  },
  {
    id: "walk", name: "어르신 동네 나들이 동행", field: "senior", org: "노인복지관 · 재가복지센터",
    images: ["inclusive", "team", "local"], skills: ["none"], purposes: ["pride", "relation"],
    heads: [6, 20], hours: 4, place: "outdoor", impact: 4, repeat: 3,
    cost: { fixed: 150000, perHead: 20000, vehicle: 250000 },
    costNote: "입장료·간식 15만 원, 1인 식비·보험 2만 원, 차량 25만 원",
    summary: "거동이 불편해 바깥나들이가 어려운 어르신과 가까운 공원·시장을 함께 걷습니다.",
    next: "2회차: 계절이 바뀔 때 같은 어르신과 다시 나들이를 갑니다.",
    metric: "동행 어르신 수 · 기관이 말한 변화 · 계절별 재참여",
  },
  {
    id: "river", name: "우리 동네 하천 지킴이", field: "green", org: "주민자치회 · 마을 공동체",
    images: ["green", "local", "team"], skills: ["none"], purposes: ["esg", "pride", "relation"],
    heads: [8, 40], hours: 3, place: "outdoor", impact: 3, repeat: 5,
    cost: { fixed: 50000, perHead: 10000, vehicle: 0 },
    costNote: "집게·마대 5만 원, 1인 장갑·물·보험 1만 원",
    summary: "구역을 나눠 하천을 정화하고 수거량을 기록합니다. 주민과 함께 다음 달 점검 일정을 정합니다.",
    next: "2회차: 같은 구역을 다시 점검해 수거량 변화를 기록합니다.",
    metric: "정화 구간 · 수거량(kg) · 월별 변화",
  },
  {
    id: "garden", name: "마을 텃밭 한 철 가꾸기", field: "green", org: "마을 공동체 · 지역아동센터",
    images: ["green", "local", "future"], skills: ["none", "build"], purposes: ["relation", "pride"],
    heads: [6, 20], hours: 3, place: "outdoor", impact: 4, repeat: 5,
    cost: { fixed: 250000, perHead: 12000, vehicle: 0 },
    costNote: "모종·흙·도구 25만 원, 1인 식비·보험 1.2만 원",
    summary: "기관 마당이나 마을 텃밭에 아이·주민과 함께 심고, 한 철 동안 돌아가며 가꿉니다.",
    next: "2회차: 수확하는 날 다시 모여 함께 거두고 나눕니다.",
    metric: "참여 주민·아동 수 · 수확량 · 텃밭 유지 기간",
  },
  {
    id: "mentor", name: "다문화 가정 자녀 학습 멘토링", field: "multi", org: "가족센터 · 다문화 지원 기관",
    images: ["inclusive", "future", "expert"], skills: ["teach"], purposes: ["esg", "relation", "pride"],
    heads: [4, 12], hours: 2, place: "indoor", impact: 5, repeat: 5,
    cost: { fixed: 100000, perHead: 15000, vehicle: 0 },
    costNote: "교재·활동지 10만 원, 1인 식비·보험 1.5만 원",
    summary: "임직원과 자녀를 1:1 또는 1:2로 묶어 학교 공부와 한국어 읽기를 돕습니다.",
    next: "2회차: 같은 짝이 이어서 만나고, 학기 말에 보호자와 함께 성장을 돌아봅니다.",
    metric: "멘토링 짝 수 · 짝 유지율 · 보호자·기관 의견",
  },
  {
    id: "lifeinfo", name: "이주민 가족 생활 금융 교실", field: "multi", org: "가족센터 · 외국인주민지원센터",
    images: ["expert", "inclusive", "local"], skills: ["finance", "digital"], purposes: ["trust", "esg", "relation"],
    heads: [3, 10], hours: 2, place: "indoor", impact: 4, repeat: 4,
    cost: { fixed: 60000, perHead: 12000, vehicle: 0 },
    costNote: "자료 인쇄·통역 지원 6만 원, 1인 식비·보험 1.2만 원",
    summary: "통장·공과금·보험·사기 예방처럼 한국 생활에 꼭 필요한 금융 정보를 쉬운 말로 안내합니다.",
    next: "2회차: 참가자가 물어본 주제로 다음 교실을 엽니다.",
    metric: "참여 가족 수 · 해결한 질문 수 · 다음 주제 요청",
  },
  {
    id: "repair", name: "주거취약가구 집 고치는 날", field: "house", org: "주거복지센터 · 행정복지센터",
    images: ["local", "team", "inclusive"], skills: ["build", "none"], purposes: ["pride", "relation", "esg"],
    heads: [6, 20], hours: 5, place: "outdoor", impact: 5, repeat: 3,
    cost: { fixed: 900000, perHead: 20000, vehicle: 100000 },
    costNote: "도배·방충망·전등 자재 90만 원(2~3가구), 1인 식비·보험 2만 원, 운반 10만 원",
    summary: "기관이 추천한 2~3가구에서 도배·방충망·전등 교체처럼 생활에 바로 닿는 수리를 합니다.",
    next: "2회차: 반년 뒤 같은 가구를 다시 찾아 상태를 확인하고 다음 가구로 넓힙니다.",
    metric: "수리 가구 수 · 수리 항목 · 6개월 뒤 상태",
  },
  {
    id: "kit", name: "기관이 요청한 생활 물품 꾸러미", field: "senior", org: "복지관 · 지역아동센터",
    images: ["team", "local", "inclusive"], skills: ["none"], purposes: ["pride", "relation"],
    heads: [10, 60], hours: 2, place: "indoor", impact: 3, repeat: 4,
    cost: { fixed: 400000, perHead: 8000, vehicle: 50000 },
    costNote: "기관 요청 품목 40만 원(약 40꾸러미), 1인 간식·보험 0.8만 원, 전달 5만 원",
    summary: "기관이 지금 필요하다고 말한 품목만으로 꾸러미를 만들어 전달합니다. 날씨와 상관없이 많은 인원이 함께할 수 있습니다.",
    next: "2회차: 기관이 다음 분기에 필요한 품목을 다시 묻고, 계절마다 이어 갑니다.",
    metric: "전달 꾸러미 수 · 기관 요청 품목 충족률 · 분기별 지속",
  },
  {
    id: "disab", name: "장애인 복지관 여가 활동 짝꿍", field: "disab", org: "장애인복지관 · 주간보호센터",
    images: ["inclusive", "team", "local"], skills: ["none", "teach", "design"], purposes: ["pride", "esg", "relation"],
    heads: [4, 12], hours: 3, place: "indoor", impact: 5, repeat: 5,
    cost: { fixed: 120000, perHead: 15000, vehicle: 0 },
    costNote: "만들기·운동 재료 12만 원, 1인 식비·보험 1.5만 원",
    summary: "복지관 여가 프로그램(만들기·체육·음악)에 짝꿍으로 함께 참여합니다. 사전 교육 30분을 포함합니다.",
    next: "2회차: 같은 짝꿍이 다시 만나 다음 프로그램을 함께합니다.",
    metric: "짝꿍 수 · 이용인 참여 시간 · 복지관 의견",
  },
  {
    id: "probono", name: "지역 기관 재능 컨설팅(프로보노)", field: "green", fieldAny: true, org: "지역아동센터 · 복지관 · 마을 공동체",
    images: ["expert", "local"], skills: ["finance", "digital", "design"], purposes: ["trust", "esg", "hiring"],
    heads: [2, 6], hours: 3, place: "indoor", impact: 4, repeat: 5,
    cost: { fixed: 30000, perHead: 10000, vehicle: 0 },
    costNote: "자료 인쇄 3만 원, 1인 식비 1만 원",
    summary: "기관이 막혀 있는 일(회계 정리, 홍보물, 홈페이지·엑셀 자동화)을 임직원 전문성으로 함께 풉니다.",
    next: "2회차: 한 달 뒤 기관이 직접 써 보고 남은 문제를 다시 함께 봅니다.",
    metric: "해결한 과제 수 · 기관이 아낀 시간 · 후속 요청",
  },
];

// 예시 사진 (Unsplash License · 무료, 상업적 이용 가능). 실제 활동 사진이 생기면 바꿉니다.
const PHOTOS = {
  book: ["1759977064094-840dfc694bee", "바닥에 모여 앉아 함께 책을 읽는 아이들"],
  career: ["1771765812031-22653b4c70a6", "교실에서 무언가를 만들며 배우는 아이들"],
  phone: ["1758686253992-62c9c69dfe61", "소파에 나란히 앉아 스마트폰을 함께 보는 노부부"],
  walk: ["1718010588689-9806ce642d39", "벤치에 나란히 앉아 쉬는 두 사람"],
  river: ["1758599668429-121d54188b9c", "파란 봉투를 들고 공원을 정화하는 자원봉사자들"],
  garden: ["1524247108137-732e0f642303", "함께 꽃을 심는 세 사람"],
  mentor: ["1583468982228-19f19164aee2", "도서관에서 함께 책을 읽는 어른과 아이"],
  lifeinfo: ["1454165804606-c3d57bc86b40", "노트북 옆에서 연필을 들고 자료를 정리하는 사람"],
  repair: ["1560220604-1985ebfe28b1", "자원봉사 티셔츠를 입고 함께 서 있는 사람들"],
  kit: ["1628717341663-0007b0ee2597", "천막 아래에서 종이봉투에 물품을 담는 자원봉사자들"],
  disab: ["1761864293839-95dcd7d2a6b3", "자와 종이로 만들기 활동을 하는 손"],
  probono: ["1517245386807-bb43f82c33c4", "노트북을 보며 회의하는 사람들"],
};
const photo = (id, w = 640) => `https://images.unsplash.com/photo-${PHOTOS[id][0]}?w=${w}&q=75&auto=format&fit=crop`;
