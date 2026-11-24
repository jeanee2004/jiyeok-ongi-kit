/* 지역 온기 — 화면 동작.
   저장소: 계정·의뢰·추천 결과는 Supabase(ongi_ 테이블)에, 입력 중인 답과 소개 코드만 브라우저에 둡니다.
   추천은 규칙 기반으로 브라우저 안에서만 계산하고, 입력값을 외부 AI로 보내지 않습니다. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const man = (n) => (n >= 10000 ? `${(Math.round(n / 1000) / 10).toLocaleString("ko-KR")}만 원` : won(n));
const byId = (list, id) => list.find((x) => x.id === id);

/* ---------- 저장소 ---------- */
const sb = window.supabase && window.ONGI_CONFIG ? window.supabase.createClient(ONGI_CONFIG.supabaseUrl, ONGI_CONFIG.supabaseAnonKey) : null;
// 브라우저에만 두는 편의 값 (입력 중인 답, 소개 코드)
const DB = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`onggi.${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`onggi.${key}`, JSON.stringify(value)); return true; } catch { return false; }
  },
};
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const rid = (p) => `${p}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const fromRow = (r) => ({ ...r, createdAt: r.created_at, when: r.when_text });

// 행동 기록: 가명 세션 ID만 남깁니다(대시보드용). 실패해도 화면에는 영향이 없습니다.
const SESSION = (() => { try { return sessionStorage.getItem("onggi.sid") || (sessionStorage.setItem("onggi.sid", crypto.randomUUID()), sessionStorage.getItem("onggi.sid")); } catch { return crypto.randomUUID(); } })();
function track(type, name = null, value = null) {
  sb?.from("ongi_events").insert({ session_id: SESSION, type, name: name && String(name).slice(0, 60), value }).then(() => {}, () => {});
}

/* ---------- 계정 ---------- */
const ERR = {
  "Invalid login credentials": "이메일 또는 비밀번호가 맞지 않습니다.",
  "Email not confirmed": "받은 편지함의 인증 메일을 먼저 눌러 주세요.",
  "User already registered": "이미 가입된 이메일입니다. 로그인해 주세요.",
};
const friendly = (m) => ERR[m] || (/rate limit/i.test(m) ? "잠시 후 다시 시도해 주세요." : m);
let me = null; // { id, email, company, name, role }
const Auth = {
  current() { return me; },
  async load() {
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; return null; }
    const u = session.user;
    const [{ data: acc }, { data: admin }] = await Promise.all([
      sb.from("ongi_accounts").select("company, name").eq("id", u.id).maybeSingle(),
      sb.rpc("ongi_is_admin"),
    ]);
    const meta = u.user_metadata || {};
    if (!acc && meta.company) await sb.from("ongi_accounts").upsert({ id: u.id, company: meta.company, name: meta.name || "" });
    me = { id: u.id, email: u.email, company: acc?.company || meta.company || "", name: acc?.name || meta.name || "", role: admin === true ? "admin" : "client" };
    return me;
  },
  async signUp({ email, pw, company, name }) {
    if (!sb) throw new Error("서버에 연결되어 있지 않습니다. 잠시 후 다시 시도해 주세요.");
    // 배포 서버(api/signup)가 있으면 인증 메일 없이 바로 가입하고, 없으면 Supabase 인증 메일로 가입합니다.
    const r = await fetch("api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw, company, name }) }).catch(() => null);
    if (r && r.ok) return this.signIn(email, pw);
    if (r && r.status !== 404 && r.status !== 405) throw new Error((await r.json().catch(() => ({}))).message || "가입하지 못했습니다.");
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { company, name }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw new Error(friendly(error.message));
    if (!data.session) return "confirm";
    await sb.from("ongi_accounts").upsert({ id: data.user.id, company, name });
    return this.load();
  },
  async signIn(email, pw) {
    if (!sb) throw new Error("서버에 연결되어 있지 않습니다.");
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(friendly(error.message));
    return this.load();
  },
  async signOut() { await sb?.auth.signOut(); me = null; },
  async update(patch) { if (me) { await sb.from("ongi_accounts").update(patch).eq("id", me.id); Object.assign(me, patch); } },
  async remove() {
    const { data: { session } } = await sb.auth.getSession();
    await Promise.all([sb.from("ongi_requests").delete().eq("owner", me.id), sb.from("ongi_plans").delete().eq("owner", me.id)]);
    await sb.from("ongi_accounts").delete().eq("id", me.id);
    // 로그인 계정 자체는 서버(api/delete-account)가 비밀 키로 지웁니다.
    const r = await fetch("api/delete-account", { method: "POST", headers: { authorization: `Bearer ${session?.access_token}` } }).catch(() => null);
    await this.signOut();
    return !!(r && r.ok);
  },
};

/* ---------- 공통 UI ---------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
let lastFocus = null;
function openOverlay(id) {
  $$(".overlay").forEach((o) => { if (o.id !== id) o.hidden = true; });
  lastFocus = lastFocus || document.activeElement;
  const o = $(`#${id}`); o.hidden = false; document.body.classList.add("lock");
  o.scrollTop = 0; $(".sheet, .modal", o).scrollTop = 0;
  setTimeout(() => $("input, button:not(.circle)", o)?.focus({ preventScroll: true }), 60);
}
function closeOverlay(id) {
  $(`#${id}`).hidden = true;
  if ($$(".overlay").every((o) => o.hidden)) { document.body.classList.remove("lock"); lastFocus?.focus?.({ preventScroll: true }); lastFocus = null; }
}
document.addEventListener("click", (e) => {
  const close = e.target.closest("[data-close]");
  if (close) closeOverlay(close.closest(".overlay").id);
  else if (e.target.classList.contains("overlay")) closeOverlay(e.target.id);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = $$(".overlay").filter((o) => !o.hidden).pop();
  if (open) closeOverlay(open.id);
});

function refreshNav() {
  const me = Auth.current();
  $("#authBtn").textContent = me ? (me.role === "admin" ? "관리자" : "내 의뢰") : "로그인";
  $("#adminLink").hidden = !(me && me.role === "admin");
}

/* ---------- 랜딩: 프로그램 카드 ---------- */
let fieldFilter = "all";
const PLACE = { indoor: "실내", outdoor: "야외", remote: "비대면·회사에서" };
// o: 맞춤 추천 응답(식대·교통·보험·대상자 간식·대행비 포함 여부). 비우면 재료와 소모품만 계산합니다.
function costForHeads(p, heads, o = {}) {
  const groups = Math.max(1, Math.ceil(heads / p.heads[1]));
  const ben = Math.round(heads * p.ben);
  const remote = p.place === "remote";
  const c = {
    groups, ben,
    fixed: p.cost.fixed * groups,
    perHead: p.cost.perHead * heads,
    vehicle: p.cost.vehicle * groups,
    meal: o.meal === "company" && !remote ? CARE.meal * heads : 0,
    transport: remote ? 0 : o.transport === "bus" ? CARE.bus * groups : o.transport === "fare" ? CARE.fare * heads : 0,
    insurance: o.insurance === "us" && !remote ? CARE.insurance * heads : 0,
    snack: o.benSnack === "yes" && !remote ? CARE.snack * ben : 0,
    fee: o.includeFee ? Math.round(SERVICE_FEE * (1 - DISCOUNT.rate)) : 0,
  };
  c.total = c.fixed + c.perHead + c.vehicle + c.meal + c.transport + c.insurance + c.snack + c.fee;
  return c;
}
function renderPrograms() {
  $("#fieldChips").innerHTML = [{ id: "all", label: "전체" }, ...FIELDS].map((f) =>
    `<button class="chip" type="button" role="tab" data-field="${f.id}" aria-selected="${f.id === fieldFilter}">${f.label}</button>`).join("");
  const list = PROGRAMS.filter((p) => fieldFilter === "all" || p.field === fieldFilter);
  $("#programGrid").innerHTML = list.map((p) => {
    const heads = Math.max(p.heads[0], Math.min(10, p.heads[1]));
    const c = costForHeads(p, heads);
    return `<article class="card prog">
      <div class="ph"><img src="${photo(p.id)}" alt="${esc(PHOTOS[p.id][1])}" loading="lazy" width="640" height="400"></div>
      <div class="body">
      <p class="org">${esc(p.org)}</p>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.summary)}</p>
      <div class="meta">
        <span class="badge">${byId(FIELDS, p.field).label}</span>
        <span class="badge">${PLACE[p.place]} · ${p.hours}시간</span>
        <span class="badge warm">2회차 이어짐 ${"●".repeat(p.repeat)}</span>
      </div>
      <p class="cost">임직원 ${heads}명 기준 1회 약 <b>${man(c.total)}</b> <span class="note">(추정)</span></p>
      </div>
    </article>`;
  }).join("");
}
$("#fieldChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-field]"); if (!b) return;
  fieldFilter = b.dataset.field; renderPrograms();
});
document.addEventListener("mousemove", (e) => {
  const card = e.target.closest?.(".card"); if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${e.clientX - r.left}px`);
  card.style.setProperty("--my", `${e.clientY - r.top}px`);
});
window.addEventListener("scroll", () => $(".nav").classList.toggle("scrolled", scrollY > 8), { passive: true });

/* ---------- 맞춤 추천: 단계형 질문 ---------- */
const DEFAULT_PLAN = {
  region: "", industry: "", employees: "", participants: 12,
  budgetPreset: "", budget: 1000000, includeFee: true, times: "", strategy: "balance", payType: "",
  perHeadPreset: "", meal: "", transport: "", insurance: "", benSnack: "",
  images: [], purpose: "", tone: "2", esg: "",
  time: "", place: "", skills: [], join: "",
  fields: [], pain: "", history: "",
};
let plan = { ...DEFAULT_PLAN, ...DB.get("draft", {}) };
let step = 0;

const radio = (name, items, opts = {}) => `<div class="opts${opts.col ? " col" : ""}">${items.map((it) => {
  const id = it.id ?? it, label = it.label ?? it;
  const checked = Array.isArray(plan[name]) ? plan[name].includes(id) : String(plan[name]) === String(id);
  return `<label class="opt"><input type="${opts.multi ? "checkbox" : "radio"}" name="${name}" value="${esc(id)}" ${checked ? "checked" : ""}><span>${esc(label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</span></label>`;
}).join("")}</div>`;
const q = (title, help, body, name) => `<fieldset class="q" data-q="${name || ""}"><legend>${title}</legend>${help ? `<p class="help">${help}</p>` : ""}${body}<p class="err" data-err="${name || ""}"></p></fieldset>`;

const STEPS = [
  {
    label: "회사 기본 정보", keys: ["region", "industry", "employees", "participants"],
    render: () => `<div class="step"><h2>회사에 대해 알려 주세요</h2><p class="sub">가까운 기관과 맞는 규모의 프로그램을 찾는 데 씁니다. 회사 이름은 묻지 않습니다.</p>
      ${q("회사가 있는 지역", "", radio("region", ["세종", "대전", "청주", "그 밖의 지역"]), "region")}
      ${q("업종", "임직원 전문성을 살린 프로그램을 고르는 데 씁니다.", radio("industry", ["제조", "IT·소프트웨어", "금융·보험", "유통·서비스", "건설·부동산", "공공·기타"]), "industry")}
      ${q("전체 임직원 수", "", radio("employees", ["50명 미만", "50~299명", "300~999명", "1,000명 이상"]), "employees")}
      ${q("이번 활동에 참여할 임직원 수", "대략이면 됩니다.", `<div class="range-box"><output id="headsOut">${plan.participants}명</output>
        <input type="range" name="participants" min="2" max="80" step="1" value="${plan.participants}" aria-label="참여 임직원 수"></div>`, "participants")}
    </div>`,
  },
  {
    label: "예산 범위", keys: ["budgetPreset", "budget", "times", "strategy", "payType"],
    render: () => `<div class="step"><h2>예산은 어느 정도 생각하세요?</h2><p class="sub">한 번 활동에 쓸 수 있는 금액을 기준으로 알려 주세요. 범위를 고른 뒤 막대로 더 정확히 맞출 수 있습니다.</p>
      ${q("1회 활동 예산 범위", "", radio("budgetPreset", BUDGET_PRESETS), "budgetPreset")}
      ${q("정확한 금액", "추천은 이 금액을 기준으로 예산 안에 드는지 계산합니다.", `<div class="range-box"><output id="budgetOut">${man(plan.budget)}</output>
        <input type="range" name="budget" min="100000" max="10000000" step="50000" value="${plan.budget}" aria-label="1회 예산">
        <label class="check" style="margin-top:12px"><input type="checkbox" name="includeFee" ${plan.includeFee ? "checked" : ""}><span>기획·운영 대행비(시범가 30만 원, 추천 할인 10% 적용)도 이 예산 안에 포함해서 계산</span></label></div>`, "budget")}
      ${q("1년에 몇 번 할 계획인가요?", "한 번으로 끝나지 않게 2회차 계획까지 함께 드립니다.", radio("times", [{ id: "1", label: "올해 1회 시범" }, { id: "2", label: "반기 1회 (연 2회)" }, { id: "4", label: "분기 1회 (연 4회)" }, { id: "12", label: "매달 (연 12회)" }]), "times")}
      ${q("예산을 쓰는 방향", "", radio("strategy", [{ id: "save", label: "최대한 아끼기", hint: "1인당 비용이 낮은 안 우선" }, { id: "balance", label: "균형 있게", hint: "비용과 체감을 함께" }, { id: "impact", label: "체감 효과 우선", hint: "기관이 크게 느끼는 안" }], { col: true }), "strategy")}
      ${q("비용 처리 방식", "", radio("payType", ["회사 운영비(복리후생·행사비)", "기부금(영수증 필요)", "아직 모름"]), "payType")}
    </div>`,
  },
  {
    label: "봉사자·대상자 챙기기", keys: ["perHeadPreset", "meal", "transport", "insurance", "benSnack"],
    render: () => `<div class="step"><h2>봉사자와 대상자를 어떻게 챙길까요?</h2><p class="sub">고르신 항목은 예상 비용에 따로 나눠 넣습니다. 금액은 모두 추정치입니다.</p>
      ${q("임직원 1인당 예산 상한", "전체 예산과 함께, 1인당 비용이 이 금액을 넘지 않는 안을 먼저 추천합니다.", radio("perHeadPreset", PER_HEAD_PRESETS), "perHeadPreset")}
      ${q("임직원 식사", "", radio("meal", [{ id: "company", label: "회사가 식대 지원", hint: `1인 약 ${won(CARE.meal)}` }, { id: "self", label: "각자 해결·식사 없는 시간대" }], { col: true }), "meal")}
      ${q("임직원 이동", "", radio("transport", [{ id: "bus", label: "단체 차량 대절", hint: `조당 약 ${man(CARE.bus)}` }, { id: "fare", label: "교통비 지원", hint: `1인 약 ${won(CARE.fare)}` }, { id: "self", label: "각자 이동·회사 차량 있음" }], { col: true }), "transport")}
      ${q("봉사자 상해보험", "봉사 중 다치는 경우를 대비합니다.", radio("insurance", [{ id: "us", label: "지역 온기가 가입 대행", hint: `1인 1일 약 ${won(CARE.insurance)}` }, { id: "company", label: "회사 단체보험으로 처리" }], { col: true }), "insurance")}
      ${q("봉사 대상자 간식·음료", "아동·어르신 등 함께하는 분들께 드릴 간식입니다. 기관이 원하지 않으면 빼고 진행합니다.", radio("benSnack", [{ id: "yes", label: "준비할게요", hint: `1명 약 ${won(CARE.snack)}` }, { id: "no", label: "준비하지 않음" }], { col: true }), "benSnack")}
    </div>`,
  },
  {
    label: "회사가 추구하는 이미지", keys: ["images", "purpose", "tone", "esg"],
    render: () => `<div class="step"><h2>이 활동으로 어떤 회사로 기억되고 싶으세요?</h2><p class="sub">회사가 추구하는 방향과 맞는 활동이어야 임직원도 기관도 오래 이어 갑니다.</p>
      ${q("가장 가까운 모습 (최대 2개)", "", radio("images", IMAGES, { multi: true, col: true }), "images")}
      ${q("이번 활동의 가장 큰 목적", "", radio("purpose", PURPOSES, { col: true }), "purpose")}
      ${q("활동을 알리는 방식", "어느 쪽이든, 기관과 대상자는 홍보 사진의 배경이 되지 않습니다.", `<div class="scale"><span>조용히 꾸준히</span>${radio("tone", ["1", "2", "3", "4", "5"])}<span>사내외에 적극 소개</span></div>`, "tone")}
      ${q("성과 보고는 어느 수준이 필요하세요?", "", radio("esg", [{ id: "kpi", label: "ESG 보고서용 정량 지표" }, { id: "inner", label: "사내 보고 한 장 정도" }, { id: "none", label: "따로 필요 없음" }]), "esg")}
    </div>`,
  },
  {
    label: "일정과 참여 방식", keys: ["time", "place", "skills", "join"],
    render: () => `<div class="step"><h2>언제, 어떤 방식으로 참여하나요?</h2><p class="sub">임직원 부담이 적은 형태로 맞춥니다.</p>
      ${q("가능한 시간", "", radio("time", ["평일 반나절(3시간 안팎)", "평일 하루", "주말 반나절", "아직 모름"]), "time")}
      ${q("활동 장소", "", radio("place", [{ id: "indoor", label: "실내 위주" }, { id: "outdoor", label: "야외도 좋음" }, { id: "any", label: "상관없음" }]), "place")}
      ${q("임직원이 가진 전문성 (여러 개 가능)", "직무 역량을 살리면 비용은 낮추고 기관 체감은 높일 수 있습니다.", radio("skills", SKILLS, { multi: true }), "skills")}
      ${q("참여 방식", "", radio("join", ["자원자 모집", "팀 단위로 함께", "전사 행사"]), "join")}
    </div>`,
  },
  {
    label: "관심 분야와 고민", keys: ["fields", "pain", "history"],
    render: () => `<div class="step"><h2>마지막으로, 관심 분야와 가장 번거로운 일을 알려 주세요</h2><p class="sub">분야를 정하지 않으셨다면 ‘상관없음’을 골라 주세요.</p>
      ${q("관심 있는 분야 (여러 개 가능)", "", radio("fields", [...FIELDS, { id: "any", label: "상관없음" }], { multi: true }), "fields")}
      ${q("지난 활동에서 가장 번거로웠던 일", "", radio("pain", ["기관 수요 파악", "기관 섭외·일정 조율", "프로그램 설계", "결과 정리·보고", "예산 맞추기"]), "pain")}
      ${q("지역 봉사 경험", "", radio("history", ["이번이 처음", "1~2번 해 봤음", "정기적으로 하고 있음"]), "history")}
    </div>`,
  },
];

function renderStep() {
  const s = STEPS[step];
  track("step", String(step + 1));
  $("#stepLabel").textContent = `${step + 1}/${STEPS.length} ${s.label}`;
  $("#progressBar").style.width = `${((step + 1) / (STEPS.length + 1)) * 100}%`;
  $("#plannerForm").hidden = false; $("#result").hidden = true;
  $("#plannerForm").innerHTML = s.render() + `<div class="nav-btns">
      <button class="pill ghost" type="button" id="prevBtn" ${step === 0 ? "disabled" : ""}>이전</button>
      <button class="pill ${step === STEPS.length - 1 ? "" : "indigo"}" type="submit">${step === STEPS.length - 1 ? "추천 결과 보기" : "다음"}</button>
    </div>`;
  $("#prevBtn").onclick = () => { readStep(); step--; renderStep(); $("#planner .sheet").scrollTop = 0; };
  limitImages();
}

function readStep() {
  const form = $("#plannerForm");
  for (const key of STEPS[step].keys) {
    const els = $$(`[name="${key}"]`, form);
    if (!els.length) continue;
    if (els[0].type === "checkbox" && els.length > 1 || Array.isArray(DEFAULT_PLAN[key])) plan[key] = els.filter((e) => e.checked).map((e) => e.value);
    else if (els[0].type === "radio") plan[key] = els.find((e) => e.checked)?.value ?? "";
    else if (els[0].type === "range") plan[key] = Number(els[0].value);
  }
  const fee = $('[name="includeFee"]', form);
  if (fee) plan.includeFee = fee.checked;
  DB.set("draft", plan);
}

const REQUIRED_MSG = {
  region: "지역을 골라 주세요.", industry: "업종을 골라 주세요.", employees: "임직원 수를 골라 주세요.",
  budgetPreset: "예산 범위를 골라 주세요.", times: "횟수를 골라 주세요.", payType: "비용 처리 방식을 골라 주세요.",
  images: "하나 이상 골라 주세요.", purpose: "목적을 골라 주세요.", esg: "보고 수준을 골라 주세요.",
  time: "가능한 시간을 골라 주세요.", place: "장소를 골라 주세요.", skills: "하나 이상 골라 주세요. 없으면 ‘특별히 없음’을 골라 주세요.", join: "참여 방식을 골라 주세요.",
  perHeadPreset: "1인당 예산을 골라 주세요. 정하지 않았다면 ‘따로 정하지 않음’을 골라 주세요.", meal: "식사 방식을 골라 주세요.", transport: "이동 방식을 골라 주세요.", insurance: "보험 처리 방식을 골라 주세요.", benSnack: "하나 골라 주세요.",
  fields: "하나 이상 골라 주세요.", pain: "하나 골라 주세요.", history: "하나 골라 주세요.",
};
function validateStep() {
  let firstBad = null;
  for (const key of STEPS[step].keys) {
    const errEl = $(`[data-err="${key}"]`);
    const bad = REQUIRED_MSG[key] && (Array.isArray(plan[key]) ? plan[key].length === 0 : !plan[key]);
    if (errEl) errEl.textContent = bad ? REQUIRED_MSG[key] : "";
    if (bad && !firstBad) firstBad = $(`[data-q="${key}"]`);
  }
  firstBad?.scrollIntoView({ behavior: "smooth", block: "center" });
  return !firstBad;
}

function limitImages() {
  const boxes = $$('[name="images"]');
  const n = boxes.filter((b) => b.checked).length;
  boxes.forEach((b) => { b.disabled = !b.checked && n >= 2; });
}

$("#plannerForm").addEventListener("input", (e) => {
  const t = e.target;
  if (t.name === "participants") $("#headsOut").textContent = `${t.value}명`;
  if (t.name === "budget") {
    $("#budgetOut").textContent = man(Number(t.value));
    const preset = BUDGET_PRESETS.find((b) => Number(t.value) > b.min && Number(t.value) <= b.max) || BUDGET_PRESETS[0];
    $$('[name="budgetPreset"]').forEach((r) => { r.checked = r.value === preset.id; });
  }
  if (t.name === "budgetPreset") {
    const b = byId(BUDGET_PRESETS, t.value), range = $('[name="budget"]');
    const mid = t.value === "b1" ? 400000 : t.value === "b5" ? 6000000 : Math.round((b.min + b.max) / 2 / 50000) * 50000;
    range.value = mid; $("#budgetOut").textContent = man(mid);
  }
  if (t.name === "images") limitImages();
  if (t.name === "fields" && t.value === "any" && t.checked) $$('[name="fields"]').forEach((x) => { if (x.value !== "any") x.checked = false; });
  if (t.name === "fields" && t.value !== "any" && t.checked) { const any = $('[name="fields"][value="any"]'); if (any) any.checked = false; }
  if (t.name === "skills" && t.value === "none" && t.checked) $$('[name="skills"]').forEach((x) => { if (x.value !== "none") x.checked = false; });
  if (t.name === "skills" && t.value !== "none" && t.checked) { const none = $('[name="skills"][value="none"]'); if (none) none.checked = false; }
  const key = t.name; const errEl = $(`[data-err="${key}"]`); if (errEl) errEl.textContent = "";
});
$("#plannerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  readStep();
  if (!validateStep()) return;
  if (step < STEPS.length - 1) { step++; renderStep(); $("#planner .sheet").scrollTop = 0; return; }
  showResult(recommend(plan));
});

function openPlanner(fresh = false) {
  if (fresh) { plan = { ...DEFAULT_PLAN }; DB.set("draft", plan); }
  step = 0; renderStep(); openOverlay("planner");
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-open-planner]")) openPlanner(); });

/* ---------- 추천 계산 (규칙 기반) ---------- */
function recommend(s) {
  const heads = s.participants, budget = s.budget;
  const skillSet = s.skills.filter((x) => x !== "none");
  const anyField = s.fields.includes("any");
  const quietness = (6 - Number(s.tone)) / 5; // 1 = 조용히 꾸준히

  const rows = PROGRAMS.map((p) => {
    const cost = costForHeads(p, heads, s);
    const why = [], warn = [];

    // 이미지
    let image = 0;
    s.images.forEach((id) => { const i = p.images.indexOf(id); if (i >= 0) image += [1, .8, .6][i]; });
    image = s.images.length ? image / s.images.length : .5;
    const hitImages = s.images.filter((id) => p.images.includes(id)).map((id) => byId(IMAGES, id).label);
    if (hitImages.length) why.push(`‘${hitImages.join("’, ‘")}’ 이미지와 잘 맞습니다`);

    // 목적
    const pi = p.purposes.indexOf(s.purpose);
    const purpose = pi === 0 ? 1 : pi > 0 ? .7 : .2;
    if (pi >= 0) why.push(`목적(${byId(PURPOSES, s.purpose).label})에 맞는 성과가 남습니다`);

    // 분야
    const field = anyField ? .6 : s.fields.includes(p.field) ? 1 : p.fieldAny ? .6 : 0;
    if (!anyField && s.fields.includes(p.field)) why.push(`관심 분야(${byId(FIELDS, p.field).label})입니다`);

    // 전문성
    const skillHit = skillSet.filter((x) => p.skills.includes(x));
    const skill = skillHit.length ? 1 : p.skills.includes("none") ? .6 : .2;
    if (skillHit.length) why.push(`임직원의 ${skillHit.map((x) => byId(SKILLS, x).label).join("·")} 역량을 살릴 수 있습니다`);
    if (!skillHit.length && !p.skills.includes("none")) warn.push("특정 전문성이 있으면 더 좋은 활동입니다");

    // 일정·장소
    let logistics = 1;
    if (s.place === "indoor" && p.place === "outdoor") { logistics -= .6; warn.push("야외 활동이라 날씨 대안이 필요합니다"); }
    if (p.hours > 4 && /반나절/.test(s.time)) { logistics -= .4; warn.push(`${p.hours}시간 활동이라 반나절보다 깁니다`); }
    if (p.place === "remote" && /팀|전사/.test(s.join)) { logistics -= .5; warn.push("각자 하는 비대면 활동이라 팀이 함께 모이는 경험은 적습니다"); }
    if (heads < p.heads[0]) { logistics -= .3; warn.push(`최소 ${p.heads[0]}명이 필요해 인원을 조금 늘리는 것이 좋습니다`); }
    if (cost.groups > 1) why.push(`인원이 많아 ${cost.groups}개 조(기관)로 나눠 진행합니다`);
    logistics = Math.max(0, logistics);

    // 알리는 방식: 조용히 → 오래 이어지는 활동, 적극 소개 → 팀이 함께 움직이는 활동
    const toneFit = quietness * (p.repeat / 5) + (1 - quietness) * (p.images.includes("team") || p.heads[1] >= 20 ? 1 : .6);

    // 예산
    const ratio = cost.total / budget;
    const headCap = byId(PER_HEAD_PRESETS, s.perHeadPreset)?.max ?? Infinity;
    const perHeadCost = (cost.total - cost.fee) / heads;
    let budgetFit = ratio <= .85 ? 1 : ratio <= 1 ? .85 : ratio <= 1.15 ? .35 : 0;
    if (perHeadCost > headCap) { budgetFit *= .4; warn.push(`1인당 약 ${won(perHeadCost)}로 1인당 예산을 넘습니다`); }
    else if (headCap < Infinity) why.push(`1인당 약 ${won(perHeadCost)}로 1인당 예산 안입니다`);
    if (ratio <= 1) why.push(`전체 예산의 ${Math.round(ratio * 100)}%로 진행할 수 있습니다`);
    else warn.push(`전체 예산보다 ${man(cost.total - budget)} 많습니다`);
    if (p.place === "remote") why.push("이동이 없어 식대·교통비가 들지 않습니다");

    // 가성비: 기관 체감·지속성 대비 1인당 비용
    const quality = (p.impact * .6 + p.repeat * .4) / 5;
    const perHead = cost.total / heads;
    const value = quality / (perHead / 30000);

    return { p, cost, ratio, perHead, quality, value, image, purpose, field, skill, logistics, toneFit, budgetFit, why, warn };
  });

  const maxValue = Math.max(...rows.map((r) => r.value));
  const W = {
    save:    { image: .22, purpose: .08, field: .16, skill: .06, value: .24, budget: .16, logistics: .05, tone: .03 },
    balance: { image: .26, purpose: .10, field: .18, skill: .08, value: .14, budget: .12, logistics: .08, tone: .04 },
    impact:  { image: .26, purpose: .10, field: .18, skill: .08, value: .06, budget: .10, logistics: .08, tone: .04, quality: .10 },
  }[s.strategy] || {};
  rows.forEach((r) => {
    r.valueN = r.value / maxValue;
    r.score = W.image * r.image + W.purpose * r.purpose + W.field * r.field + W.skill * r.skill + W.value * r.valueN
      + W.budget * r.budgetFit + W.logistics * r.logistics + W.tone * r.toneFit + (W.quality || 0) * r.quality;
    if (r.p.place === "remote" && /팀|전사/.test(s.join)) r.score *= .75; // 함께 모이길 원하면 비대면은 뒤로
    if (r.valueN > .7) r.why.push("1인당 비용 대비 기관 체감이 큰 편입니다");
    if (r.p.repeat >= 5) r.why.push("같은 사람들이 다시 만나는 2회차로 잇기 쉽습니다");
    // 예산을 넘으면 예산에 맞는 인원을 함께 제안
    if (r.ratio > 1) {
      const c1 = costForHeads(r.p, 1, s); // 1명일 때 비용에서 1인당 늘어나는 몫을 구합니다
      const unit = c1.perHead + c1.meal + c1.insurance + c1.snack + (s.transport === "fare" ? c1.transport : 0) || 1;
      const fit = Math.floor((budget - (c1.total - unit)) / unit);
      r.shrink = fit >= r.p.heads[0] ? Math.min(fit, r.p.heads[1]) : 0;
    }
  });

  let pool = rows.filter((r) => r.ratio <= 1.15 && r.field > 0);
  if (pool.length < 3) pool = rows.filter((r) => r.ratio <= 1.15);
  if (pool.length < 3) pool = rows;
  const top = pool.sort((a, b) => b.score - a.score).slice(0, 6);
  const best = top[0]?.score || 1;
  top.forEach((r, i) => { r.match = Math.round(Math.min(98, 58 + (r.score / best) * 38 - i * 2)); });
  return { at: new Date().toISOString(), input: { ...s }, top: top.map(slim), code: couponCode() };
}
// 할인 코드: 맞춤 추천마다 하나 발급하고, 의뢰에 함께 저장해 관리자가 확인합니다.
function couponCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `ONGI-${Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join("")}`;
}
const referral = (() => { const r = new URLSearchParams(location.search).get("ref"); return /^ONGI-[A-Z0-9]{6}$/.test(r || "") ? r : DB.get("ref", null); })();
if (referral) DB.set("ref", referral);
// 저장용으로 필요한 값만 남깁니다.
const slim = (r) => ({ id: r.p.id, match: r.match, cost: r.cost, ratio: r.ratio, perHead: r.perHead, why: r.why.slice(0, 4), warn: r.warn.slice(0, 2), shrink: r.shrink || 0 });

/* ---------- 추천 결과 ---------- */
let lastResult = null;
function profileChips(s) {
  return [s.region, s.industry, `${s.participants}명 참여`, `1회 ${man(s.budget)}`, ...s.images.map((id) => byId(IMAGES, id).label), byId(PURPOSES, s.purpose)?.label]
    .filter(Boolean).map((t) => `<span class="badge">${esc(t)}</span>`).join("");
}
// 추천 결과를 저장합니다. 로그인 전 결과는 주인 없이 남기고(통계용), 로그인하면 같은 코드로 내 것으로 다시 남깁니다.
async function savePlan(res) {
  if (!sb) return;
  const row = { owner: me?.id || null, session_id: SESSION, input: res.input, top: res.top, code: res.code };
  const { error } = await sb.from("ongi_plans").insert(row);
  if (!error && me) res.ownedBy = me.id;
}
function showResult(res, { saved = false } = {}) {
  lastResult = res;
  const s = res.input, times = Number(s.times) || 1;
  $("#plannerForm").hidden = true; $("#result").hidden = false;
  $("#stepLabel").textContent = "추천 결과";
  $("#progressBar").style.width = "100%";
  if (!saved) { savePlan(res); track("result", res.top[0]?.id); }

  const recs = res.top.map((r, i) => {
    const p = byId(PROGRAMS, r.id), c = r.cost;
    const pct = Math.min(100, r.ratio * 100);
    const cls = r.ratio > 1 ? "over" : r.ratio > .9 ? "tight" : "";
    return `<article class="rec ${i === 0 ? "top" : ""}" ${i >= 3 ? "data-more hidden" : ""}>
      <div class="rec-head">
        <div><span class="rank">No.${i + 1}${i === 0 ? " · 가장 잘 맞는 안" : ""}</span><h3>${esc(p.name)}</h3><p class="note">${esc(p.org)} · ${PLACE[p.place]} · ${p.hours}시간 · ${c.groups > 1 ? `${c.groups}개 조` : "1개 조"}${c.ben ? ` · ${esc(p.benLabel)} 약 ${c.ben}명` : ""}</p></div>
        <div class="score"><b>${r.match}%</b><span>조건 일치도</span></div>
      </div>
      ${i === 0 ? `<img class="ph" src="${photo(p.id, 1000)}" alt="${esc(PHOTOS[p.id][1])} (예시 사진)" loading="lazy">` : ""}
      <p class="detail">${esc(p.summary)}</p>
      <ul class="why">${r.why.map((w) => `<li>${esc(w)}</li>`).join("")}${r.warn.map((w) => `<li class="warn">${esc(w)}</li>`).join("")}</ul>
      <div class="costbox">
        <div class="costrow"><span>기관 지원 물품·재료 (${esc(p.costNote)})</span><b>${won(c.fixed)}</b></div>
        ${c.perHead ? `<div class="costrow"><span>임직원 소모품 ${s.participants}명분</span><b>${won(c.perHead)}</b></div>` : ""}
        ${c.meal ? `<div class="costrow"><span>임직원 식대 ${s.participants}명</span><b>${won(c.meal)}</b></div>` : ""}
        ${c.transport ? `<div class="costrow"><span>${s.transport === "bus" ? `단체 차량 ${c.groups}대` : `교통비 ${s.participants}명`}</span><b>${won(c.transport)}</b></div>` : ""}
        ${c.insurance ? `<div class="costrow"><span>봉사자 상해보험 ${s.participants}명</span><b>${won(c.insurance)}</b></div>` : ""}
        ${c.snack ? `<div class="costrow"><span>${esc(p.benLabel)} 간식·음료 약 ${c.ben}명</span><b>${won(c.snack)}</b></div>` : ""}
        ${c.vehicle ? `<div class="costrow"><span>대상자 이동·물품 운반 차량</span><b>${won(c.vehicle)}</b></div>` : ""}
        ${c.fee ? `<div class="costrow"><span>기획·운영 대행 (30만 원에서 추천 할인 10%)</span><b>${won(c.fee)}</b></div>` : ""}
        <div class="costrow total"><span>1회 예상 비용 · 1인당 ${won(r.perHead)}</span><b>${won(c.total)}</b></div>
        <div class="bar" role="img" aria-label="예산 사용률 ${Math.round(r.ratio * 100)}%"><span class="${cls}" style="width:${pct}%"></span></div>
        <div class="bar-cap"><span>예산 ${man(s.budget)} 중 ${Math.round(r.ratio * 100)}% 사용</span><span>${times > 1 ? `연 ${times}회면 약 ${man(c.total * times)}` : "올해 1회 시범"}</span></div>
        ${r.shrink ? `<p class="note">예산에 맞추려면 참여 인원을 ${r.shrink}명으로 줄이거나, 회차를 나눠 진행하는 방법이 있습니다.</p>` : ""}
      </div>
      <p class="next"><b>2회차 계획</b> · ${esc(p.next)}</p>
      <p class="note">성과 한 장에 들어갈 지표: ${esc(p.metric)}${s.esg === "kpi" ? " (ESG 보고용 정량 지표로 정리)" : ""}</p>
      <div class="rec-act"><button class="pill" type="button" data-request="${p.id}">이 안으로 의뢰하기 <span aria-hidden="true">↘</span></button></div>
    </article>`;
  }).join("");

  const compare = `<div class="table-scroll"><table class="compare"><thead><tr><th>추천안</th><th class="n">1회 예상</th><th class="n">1인당</th><th class="n">예산 사용</th><th class="n">연간</th></tr></thead><tbody>
    ${res.top.map((r, i) => `<tr><td>${i + 1}. ${esc(byId(PROGRAMS, r.id).name)}</td><td class="n">${man(r.cost.total)}</td><td class="n">${won(r.perHead)}</td><td class="n">${Math.round(r.ratio * 100)}%</td><td class="n">${man(r.cost.total * times)}</td></tr>`).join("")}
  </tbody></table></div>`;

  const payNote = s.payType.startsWith("기부금")
    ? "기부금 영수증이 필요하시면, 영수증을 발급할 수 있는 기관인지 기관 방문 때 함께 확인해 드립니다."
    : "";

  $("#result").innerHTML = `
    <div class="res-head"><div><p class="kicker">맞춤 추천 결과</p><h2>조건에 맞는 봉사 프로그램 ${res.top.length}가지</h2></div>
      <button class="pill ghost sm" type="button" id="againBtn">조건 바꿔 다시 받기</button></div>
    <div class="profile">${profileChips(s)}</div>
    ${res.code ? `<div class="coupon">
      <code>${esc(res.code)}</code>
      <div class="rec-act"><button class="pill ghost sm" type="button" id="copyCode">코드 복사</button><button class="pill ghost sm" type="button" id="shareRef">소개 링크 복사</button></div>
      <p>맞춤 추천 혜택 · 이 결과로 의뢰하면 기획·운영 대행비 ${DISCOUNT.rate * 100}% 할인 (발급 후 ${DISCOUNT.days}일 안). 의뢰 신청서에 자동으로 들어갑니다. 소개 링크로 들어온 다른 회사 담당자도 같은 혜택을 받습니다.</p>
    </div>` : ""}
    ${compare}
    ${recs}
    ${res.top.length > 3 ? `<button class="pill ghost more" type="button" id="moreBtn">추천 ${res.top.length - 3}개 더 보기</button>` : ""}
    <p class="disclaimer">예상 비용은 비슷한 지역 활동을 기준으로 잡은 기획용 추정치이며, 실제 금액은 기관 방문 뒤 ‘기관 수요 한 장’과 함께 다시 안내해 드립니다. 기관 정보는 예시이고, 실제 프로그램은 기관 담당자에게 직접 들은 필요로 만듭니다. ${payNote}</p>
    ${me || saved ? `<p class="note" style="margin-top:10px">이 결과는 ‘내 의뢰’의 저장한 추천에 남았습니다.</p>` : `<p class="note" style="margin-top:10px">로그인하면 이 결과가 저장되고, 의뢰 진행 상황도 확인할 수 있습니다.</p>`}`;
  $("#againBtn").onclick = () => { step = 0; renderStep(); };
  const more = $("#moreBtn");
  if (more) more.onclick = () => { $$("[data-more]").forEach((el) => { el.hidden = false; }); more.remove(); };
  const copy = (text, msg) => (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast(msg), () => window.prompt("아래 내용을 복사해 주세요.", text));
  $("#copyCode")?.addEventListener("click", () => { track("code", "copy"); copy(res.code, "할인 코드를 복사했습니다."); });
  $("#shareRef")?.addEventListener("click", () => track("code", "share") || copy(`지역 온기에서 우리 회사에 맞는 임직원 봉사를 추천받아 보세요. 이 링크로 들어오면 대행비 할인 혜택이 있습니다. ${location.origin}${location.pathname}?ref=${res.code}`, "소개 링크를 복사했습니다. 다른 회사 담당자에게 보내 주세요."));
  $("#planner .sheet").scrollTop = 0;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-request]"); if (!b) return;
  pendingProgram = b.dataset.request;
  if (!Auth.current()) { openAuth("up", "의뢰를 신청하려면 로그인이 필요합니다. 처음이시면 30초 만에 가입할 수 있습니다."); return; }
  openRequest();
});

/* ---------- 로그인 · 가입 ---------- */
let authMode = "in", pendingProgram = null;
function openAuth(mode = "in", reason = "") {
  authMode = mode; renderAuth(reason); openOverlay("auth");
}
function renderAuth(reason = $("#authReason").textContent) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === authMode));
  $("#authTitle").textContent = { in: "다시 오셨네요", up: "기업 담당자 가입", reset: "비밀번호 재설정", newpw: "새 비밀번호 정하기" }[authMode];
  $(".tabs").hidden = authMode === "reset" || authMode === "newpw";
  if (authMode === "reset" || authMode === "newpw") {
    $("#authReason").textContent = reason || (authMode === "reset" ? "가입한 이메일로 비밀번호를 바꿀 수 있는 링크를 보내 드립니다." : "앞으로 쓸 비밀번호를 정해 주세요.");
    $("#authForm").innerHTML = authMode === "reset" ? `
      <div class="field"><label for="aEmail">가입한 이메일</label><input type="email" id="aEmail" name="email" autocomplete="username" required></div>
      <p class="err" id="authErr"></p>
      <button class="pill" type="submit">재설정 메일 보내기</button>
      <button class="pill ghost" type="button" data-mode-go="in" style="margin-top:8px">로그인으로 돌아가기</button>` : `
      <div class="field"><label for="aPw">새 비밀번호</label><input type="password" id="aPw" name="pw" autocomplete="new-password" minlength="8" required placeholder="8자 이상"></div>
      <div class="field"><label for="aPw2">새 비밀번호 확인</label><input type="password" id="aPw2" name="pw2" autocomplete="new-password" required></div>
      <p class="err" id="authErr"></p>
      <button class="pill" type="submit">비밀번호 바꾸기</button>`;
    return;
  }
  $("#authReason").textContent = reason || (authMode === "in" ? "저장한 추천과 의뢰 진행 상황을 볼 수 있습니다." : "가입하면 추천 결과를 저장하고 의뢰를 신청할 수 있습니다.");
  $("#authForm").innerHTML = authMode === "in" ? `
    <div class="field"><label for="aEmail">이메일</label><input type="email" id="aEmail" name="email" autocomplete="username" required></div>
    <div class="field"><label for="aPw">비밀번호</label><input type="password" id="aPw" name="pw" autocomplete="current-password" required></div>
    <p class="err" id="authErr"></p>
    <button class="pill" type="submit">로그인</button>
    <button class="link-btn" type="button" data-mode-go="reset">비밀번호를 잊으셨나요?</button>` : `
    <div class="field"><label for="aEmail">업무용 이메일<span class="req">*</span></label><input type="email" id="aEmail" name="email" autocomplete="username" required></div>
    <div class="row2">
      <div class="field"><label for="aPw">비밀번호<span class="req">*</span></label><input type="password" id="aPw" name="pw" autocomplete="new-password" minlength="8" required placeholder="8자 이상"></div>
      <div class="field"><label for="aPw2">비밀번호 확인<span class="req">*</span></label><input type="password" id="aPw2" name="pw2" autocomplete="new-password" required></div>
    </div>
    <div class="row2">
      <div class="field"><label for="aCompany">회사명<span class="req">*</span></label><input type="text" id="aCompany" name="company" autocomplete="organization" required></div>
      <div class="field"><label for="aName">담당자 이름<span class="req">*</span></label><input type="text" id="aName" name="name" autocomplete="name" required></div>
    </div>
    <label class="check"><input type="checkbox" name="agree"><span>(필수) 계정 운영을 위한 개인정보(이메일·회사명·이름) 수집·이용에 동의합니다. <a href="privacy.html" target="_blank" rel="noopener">자세히</a></span></label>
    <p class="err" id="authErr"></p>
    <button class="pill" type="submit">가입하고 계속하기</button>`;
}
$("#authForm").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode-go]"); if (!b) return;
  const email = $("#aEmail")?.value;
  authMode = b.dataset.modeGo; renderAuth(""); if (email && $("#aEmail")) $("#aEmail").value = email;
});
$(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]"); if (!b) return;
  authMode = b.dataset.mode; renderAuth(""); $("#aEmail").focus();
});
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const err = $("#authErr");
  const email = (f.email || "").trim().toLowerCase();
  const btn = $('[type="submit"]', e.target), label = btn.textContent;
  btn.disabled = true; btn.textContent = "처리하는 중…"; err.textContent = "";
  try {
    if (authMode === "newpw") {
      if ((f.pw || "").length < 8) throw new Error("비밀번호는 8자 이상으로 정해 주세요.");
      if (f.pw !== f.pw2) throw new Error("비밀번호가 서로 다릅니다.");
      const { error } = await sb.auth.updateUser({ password: f.pw });
      if (error) throw new Error(friendly(error.message));
      history.replaceState(null, "", location.pathname);
      await Auth.load(); refreshNav(); closeOverlay("auth");
      if (me?.role === "admin") { location.href = "admin.html"; return; }
      toast("비밀번호를 바꿨습니다. 로그인되었습니다."); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("이메일 형식을 확인해 주세요.");
    if (authMode === "reset") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw new Error(friendly(error.message));
      authMode = "in"; renderAuth(`${email}로 재설정 메일을 보냈습니다. 메일의 링크를 누르면 이 사이트에서 새 비밀번호를 정할 수 있습니다. 메일이 없으면 스팸함도 확인해 주세요.`);
      $("#aEmail").value = email; return;
    }
    if (authMode === "in") {
      if (!f.pw) throw new Error("비밀번호를 입력해 주세요.");
      await Auth.signIn(email, f.pw);
      if (me.role === "admin") { location.href = "admin.html"; return; } // 관리자는 바로 대시보드로
      toast("로그인했습니다.");
    } else {
      if ((f.pw || "").length < 8) throw new Error("비밀번호는 8자 이상으로 정해 주세요.");
      if (f.pw !== f.pw2) throw new Error("비밀번호가 서로 다릅니다.");
      if (!f.company?.trim() || !f.name?.trim()) throw new Error("회사명과 담당자 이름을 적어 주세요.");
      if (!f.agree) throw new Error("필수 항목 수집·이용에 동의해 주세요.");
      const out = await Auth.signUp({ email, pw: f.pw, company: f.company.trim(), name: f.name.trim() });
      if (out === "confirm") {
        authMode = "in"; renderAuth(`${email}로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 여기서 로그인해 주세요. 메일이 오지 않으면 이미 가입된 이메일일 수 있으니 ‘비밀번호를 잊으셨나요?’로 비밀번호를 다시 정해 주세요.`);
        $("#aEmail").value = email; return;
      }
      toast("가입했습니다. 환영합니다!");
    }
    refreshNav();
    closeOverlay("auth");
    if (lastResult && lastResult.ownedBy !== me.id) savePlan(lastResult);
    if (pendingProgram) openRequest();
  } catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; btn.textContent = label; }
});
$("#authBtn").addEventListener("click", () => (Auth.current() ? openMyPage() : openAuth("in")));
$("#adminLink").addEventListener("click", (e) => { e.preventDefault(); location.href = "admin.html"; });

/* ---------- 의뢰 신청 ---------- */
function openRequest() {
  const me = Auth.current();
  const p = byId(PROGRAMS, pendingProgram);
  const rec = lastResult?.top.find((r) => r.id === pendingProgram);
  $("#reqSummary").innerHTML = `<div class="costbox" style="margin:18px 0 22px">
      <div class="costrow"><span>선택한 추천안</span><b>${esc(p.name)}</b></div>
      ${rec ? `<div class="costrow"><span>참여 ${lastResult.input.participants}명 · 1회 예상</span><b>${won(rec.cost.total)}</b></div>` : ""}
      ${lastResult?.code || referral ? `<div class="costrow"><span>적용할 할인 코드 (대행비 ${DISCOUNT.rate * 100}%)</span><b>${esc(lastResult?.code || referral)}</b></div>` : ""}
    </div>`;
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() + i + 1, 1); return `${d.getFullYear()}년 ${d.getMonth() + 1}월`; });
  $("#reqForm").innerHTML = `
    <div class="row2">
      <div class="field"><label for="rCompany">회사명<span class="req">*</span></label><input type="text" id="rCompany" name="company" value="${esc(me.company)}" autocomplete="organization" required></div>
      <div class="field"><label for="rBizNo">사업자등록번호<span class="opt-l">(선택)</span></label><input type="text" id="rBizNo" name="bizNo" inputmode="numeric" placeholder="000-00-00000" autocomplete="off"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="rName">담당자 이름<span class="req">*</span></label><input type="text" id="rName" name="name" value="${esc(me.name)}" autocomplete="name" required></div>
      <div class="field"><label for="rDept">부서 · 직함<span class="req">*</span></label><input type="text" id="rDept" name="dept" placeholder="예: 경영지원팀 대리" autocomplete="organization-title" required></div>
    </div>
    <div class="row2">
      <div class="field"><label for="rPhone">연락처<span class="req">*</span></label><input type="tel" id="rPhone" name="phone" placeholder="010-0000-0000 또는 회사 대표번호" autocomplete="tel" required></div>
      <div class="field"><label for="rEmail">이메일<span class="req">*</span></label><input type="email" id="rEmail" name="email" value="${esc(me.email)}" autocomplete="email" required></div>
    </div>
    <div class="row2">
      <div class="field"><label for="rAddr">회사 소재지 (시·구)<span class="req">*</span></label><input type="text" id="rAddr" name="addr" placeholder="예: 세종시 조치원읍" autocomplete="address-level2" required></div>
      <div class="field"><label for="rWhen">희망 활동 시기<span class="req">*</span></label><select id="rWhen" name="when" required><option value="">선택해 주세요</option>${months.map((m) => `<option>${m}</option>`).join("")}<option>아직 미정</option></select></div>
    </div>
    <fieldset class="q"><legend>편한 연락 방법</legend>
      <div class="opts">${["전화", "문자", "이메일"].map((m, i) => `<label class="opt"><input type="radio" name="contactBy" value="${m}" ${i === 0 ? "checked" : ""}><span>${m}</span></label>`).join("")}</div></fieldset>
    <fieldset class="q"><legend>연락 가능한 시간</legend>
      <div class="opts">${["오전 (9~12시)", "오후 (13~18시)", "언제든"].map((m, i) => `<label class="opt"><input type="radio" name="contactTime" value="${m}" ${i === 2 ? "checked" : ""}><span>${m}</span></label>`).join("")}</div></fieldset>
    <div class="field"><label for="rMemo">요청 사항<span class="opt-l">(선택)</span></label><textarea id="rMemo" name="memo" placeholder="염두에 둔 기관, 꼭 피하고 싶은 일정, 임직원 특성 등을 자유롭게 적어 주세요. 다른 사람의 개인정보는 적지 말아 주세요."></textarea></div>
    <div class="consent">
      <b>개인정보 수집·이용 동의 (필수)</b>
      <table><tbody>
        <tr><th>수집 항목</th><td>회사명, 담당자 이름, 부서·직함, 연락처, 이메일, 회사 소재지(시·구), 사업자등록번호(선택)</td></tr>
        <tr><th>이용 목적</th><td>의뢰 확인 연락, 상담, 프로그램 기획·운영 및 성과 리포트 전달</td></tr>
        <tr><th>보유 기간</th><td>상담 종료 또는 마지막 활동 후 1년. 의뢰를 철회하시면 지체 없이 파기</td></tr>
      </tbody></table>
      동의를 거부하실 수 있으며, 이 경우 의뢰 접수와 연락이 어렵습니다. 수집한 정보는 의뢰 목적 외에 쓰지 않고, 외부 AI 서비스에 입력하지 않습니다.
    </div>
    <label class="check"><input type="checkbox" name="agree"><span>(필수) 위 내용을 확인했고 개인정보 수집·이용에 동의합니다.</span></label>
    <p class="err" id="reqErr"></p>
    <div class="nav-btns"><button class="pill ghost" type="button" data-close>취소</button><button class="pill" type="submit">의뢰 신청하기</button></div>`;
  openOverlay("request");
}
$("#reqForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const err = $("#reqErr");
  const need = { company: "회사명", name: "담당자 이름", dept: "부서·직함", phone: "연락처", email: "이메일", addr: "회사 소재지", when: "희망 활동 시기" };
  $$("input, select", e.target).forEach((el) => el.removeAttribute("aria-invalid"));
  const miss = Object.keys(need).filter((k) => !String(f[k] || "").trim());
  if (miss.length) { err.textContent = `빈칸을 채워 주세요: ${miss.map((k) => need[k]).join(", ")}`; miss.forEach((k) => $(`[name="${k}"]`, e.target).setAttribute("aria-invalid", "true")); $(`[name="${miss[0]}"]`, e.target).focus(); return; }
  const phone = f.phone.replace(/[^0-9]/g, "");
  if (phone.length < 9 || phone.length > 11) { err.textContent = "연락처는 숫자 9~11자리로 적어 주세요."; $('[name="phone"]', e.target).setAttribute("aria-invalid", "true"); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { err.textContent = "이메일 형식을 확인해 주세요."; $('[name="email"]', e.target).setAttribute("aria-invalid", "true"); return; }
  if (f.bizNo && f.bizNo.replace(/[^0-9]/g, "").length !== 10) { err.textContent = "사업자등록번호는 숫자 10자리입니다. 모르시면 비워 두세요."; return; }
  if (!f.agree) { err.textContent = "개인정보 수집·이용에 동의해 주셔야 의뢰를 받을 수 있습니다."; return; }

  const rec = lastResult?.top.find((r) => r.id === pendingProgram) || null;
  const req = {
    id: rid("OG"), owner: me.id, program: pendingProgram, estimate: rec ? Math.round(rec.cost.total) : null,
    contact: { company: f.company.trim(), bizNo: f.bizNo?.trim() || "", name: f.name.trim(), dept: f.dept.trim(), phone: f.phone.trim(), email: f.email.trim(), addr: f.addr.trim(), contactBy: f.contactBy, contactTime: f.contactTime },
    when_text: f.when, memo: f.memo?.trim() || "", plan: lastResult?.input || null, consent_at: new Date().toISOString(),
    code: lastResult?.code || null, ref: referral || null,
  };
  const btn = $('[type="submit"]', e.target);
  btn.disabled = true; btn.textContent = "접수하는 중…";
  const { error } = await sb.from("ongi_requests").insert(req);
  btn.disabled = false; btn.textContent = "의뢰 신청하기";
  if (error) { err.textContent = "접수하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요. 입력하신 내용은 그대로 있습니다."; return; }
  track("request", pendingProgram);
  if (f.company.trim() !== me.company) Auth.update({ company: f.company.trim() });
  pendingProgram = null;
  closeOverlay("request"); closeOverlay("planner");
  toast(`의뢰를 접수했습니다 (${req.id}). 확인하는 대로 연락드리겠습니다.`);
  openMyPage();
});

/* ---------- 내 의뢰 ---------- */
const STATUS = { new: "접수", contact: "연락 중", plan: "기획 중", done: "완료", cancel: "취소" };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
let myPlans = [];

function reqCard(r) {
  const p = byId(PROGRAMS, r.program), c = r.contact;
  return `<article class="req-item">
    <div class="top"><h3>${esc(p?.name || "프로그램 미정")}</h3><span class="st st-${r.status}">${STATUS[r.status]}</span></div>
    <dl>
      <dt>접수번호</dt><dd>${esc(r.id)} · ${fmtDate(r.createdAt)}</dd>
      <dt>연락 받을 곳</dt><dd>${esc(c.contactBy)} · ${esc(c.contactBy === "이메일" ? c.email : c.phone)}</dd>
      <dt>희망 시기</dt><dd>${esc(r.when)}${r.plan ? ` · ${r.plan.participants}명 · 예산 ${man(r.plan.budget)}` : ""}</dd>
      ${r.estimate ? `<dt>예상 비용</dt><dd>${won(r.estimate)} (추정)</dd>` : ""}
      ${r.code ? `<dt>할인 코드</dt><dd>${esc(r.code)}</dd>` : ""}
      ${r.memo ? `<dt>요청 사항</dt><dd>${esc(r.memo)}</dd>` : ""}
    </dl>
    ${r.status === "new" ? `<div><button class="pill ghost sm" type="button" data-cancel="${esc(r.id)}">의뢰 철회</button></div>` : ""}
  </article>`;
}

async function openMyPage() {
  if (!me) { openAuth("in"); return; }
  if (me.role === "admin") { location.href = "admin.html"; return; }
  $("#myBody").innerHTML = `<p class="empty">불러오는 중…</p>`;
  openOverlay("mypage");
  try { await renderMyPage(); } catch { $("#myBody").innerHTML = `<p class="empty">불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>`; }
}
async function renderMyPage() {
  const [reqs, plans] = await Promise.all([
    sb.from("ongi_requests").select("*").eq("owner", me.id).order("created_at", { ascending: false }).then(must),
    sb.from("ongi_plans").select("input, top, code, created_at").eq("owner", me.id).order("created_at", { ascending: false }).limit(10).then(must),
  ]);
  const mine = reqs.map(fromRow);
  myPlans = plans.map((p) => ({ input: p.input, top: p.top, code: p.code, at: p.created_at }));
  $("#myEyebrow").textContent = "내 의뢰";
  $("#myBody").innerHTML = `
    <div class="res-head"><div><h2>${esc(me.company)} · ${esc(me.name)} 님</h2><p class="note">${esc(me.email)}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pill sm" type="button" id="newPlanBtn">새 추천 받기</button><button class="pill ghost sm" type="button" id="logoutBtn">로그아웃</button></div></div>
    <h3 style="margin-top:8px">의뢰 진행 상황</h3>
    <div class="req-list">${mine.length ? mine.map(reqCard).join("") : `<div class="empty">아직 신청한 의뢰가 없습니다.<br>맞춤 추천을 받고 마음에 드는 안으로 의뢰해 보세요.</div>`}</div>
    <h3 style="margin-top:28px">저장한 추천</h3>
    <div class="req-list">${myPlans.length ? myPlans.map((pl, i) => `<article class="req-item"><div class="top"><h3>${esc(byId(PROGRAMS, pl.top[0]?.id)?.name || "")} 외 ${pl.top.length - 1}개</h3><span class="note">${fmtDate(pl.at)}</span></div>
      <div class="profile" style="margin:0">${profileChips(pl.input)}</div><div><button class="pill ghost sm" type="button" data-plan="${i}">결과 다시 보기</button></div></article>`).join("") : `<p class="empty">저장한 추천이 없습니다.</p>`}</div>
    <p class="note" style="margin-top:28px">계정을 지우면 저장한 추천과 의뢰 기록이 모두 삭제됩니다. <button class="pill ghost sm" type="button" id="deleteMe" style="margin-left:6px">계정 삭제</button></p>`;
}
$("#myBody").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.id === "logoutBtn") { await Auth.signOut(); refreshNav(); closeOverlay("mypage"); toast("로그아웃했습니다."); }
  if (t.id === "newPlanBtn") { closeOverlay("mypage"); openPlanner(true); }
  if (t.id === "deleteMe" && confirm("계정과 저장한 추천, 의뢰 기록을 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?")) {
    const full = await Auth.remove(); refreshNav(); closeOverlay("mypage");
    toast(full ? "계정을 삭제했습니다." : "추천·의뢰 기록을 삭제했습니다. 로그인 정보까지 지우려면 문의해 주세요.");
  }
  if (t.dataset.cancel && confirm("이 의뢰를 철회할까요? 철회하면 연락처 정보도 함께 지웁니다.")) {
    const { error } = await sb.rpc("ongi_cancel_request", { rid: t.dataset.cancel });
    toast(error ? "철회하지 못했습니다. 잠시 후 다시 시도해 주세요." : "의뢰를 철회했습니다."); renderMyPage();
  }
  if (t.dataset.plan) {
    const pl = myPlans[Number(t.dataset.plan)];
    closeOverlay("mypage"); openOverlay("planner"); showResult(pl, { saved: true });
  }
});

/* ---------- 시작 ---------- */
renderPrograms();
refreshNav();
Auth.load().then(refreshNav, () => {});
sb?.auth.onAuthStateChange((ev) => {
  if (ev === "PASSWORD_RECOVERY") { openAuth("newpw"); return; }
  if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") Auth.load().then(refreshNav, () => {});
});
track("visit", document.referrer ? new URL(document.referrer).hostname : "direct");
if (new URLSearchParams(location.search).get("ref") && referral) { track("ref", referral); toast("소개 링크로 오셨네요. 의뢰하시면 대행비 10% 할인이 적용됩니다."); }

// 섹션별 체류 시간과 버튼 클릭 (대시보드용)
const seen = new Map();
const io = new IntersectionObserver((list) => list.forEach((en) => {
  const id = en.target.id || en.target.dataset.sec;
  if (en.isIntersecting) seen.set(id, performance.now());
  else if (seen.has(id)) { track("section", id, Math.round(performance.now() - seen.get(id))); seen.delete(id); }
}), { threshold: .4 });
$$("main > section").forEach((s) => io.observe(s));
document.addEventListener("visibilitychange", () => { if (document.hidden) { seen.forEach((t0, id) => track("section", id, Math.round(performance.now() - t0))); seen.clear(); } });
document.addEventListener("click", (e) => {
  const b = e.target.closest("button, a"); if (!b) return;
  const name = b.dataset.track || b.textContent.trim().replace(/\s+/g, " ").slice(0, 30);
  if (name) track("click", name);
});
