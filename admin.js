/* 지역 온기 — 관리자 대시보드.
   권한은 DB가 지킵니다: ongi_requests·ongi_events는 public.ongi_is_admin() 인 계정(ongi_admins에 등록된 계정)만 전체를 읽을 수 있습니다. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Math.round(n).toLocaleString("ko-KR");
const won = (n) => `${num(n)}원`;
const man = (n) => (n >= 10000 ? `${(Math.round(n / 1000) / 10).toLocaleString("ko-KR")}만 원` : won(n));
const pct = (n) => (n == null || !isFinite(n) ? "–" : `${Math.round(n * 100)}%`);
const dur = (ms) => (!ms ? "–" : ms < 60000 ? `${Math.round(ms / 1000)}초` : `${Math.floor(ms / 60000)}분 ${Math.round((ms % 60000) / 1000)}초`);
const byId = (list, id) => list.find((x) => x.id === id);
const day = (iso) => iso.slice(0, 10);
const fmtDate = (iso) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
const sb = window.supabase.createClient(ONGI_CONFIG.supabaseUrl, ONGI_CONFIG.supabaseAnonKey);

const STATUS = { new: "접수", contact: "연락 중", plan: "기획 중", done: "완료", cancel: "취소" };
const STEP_LABEL = ["회사 기본 정보", "예산 범위", "봉사자·대상자 챙기기", "회사 이미지", "일정·참여 방식", "관심 분야·고민"];
const SECTION_LABEL = { hero: "첫 화면", who: "대상·이용 흐름", pain: "고민", how: "진행 방식", programs: "프로그램 예시", never: "약속", price: "비용", faq: "자주 묻는 질문", cta: "마지막 안내" };
const PERIODS = [{ d: 7, label: "7일" }, { d: 30, label: "30일" }, { d: 90, label: "90일" }, { d: 0, label: "전체" }];
// 응답 분포로 보여 줄 문항
const DIST = [
  ["budgetPreset", "1회 예산", (v) => byId(BUDGET_PRESETS, v)?.label],
  ["perHeadPreset", "1인당 예산", (v) => byId(PER_HEAD_PRESETS, v)?.label],
  ["images", "회사가 추구하는 이미지", (v) => byId(IMAGES, v)?.label],
  ["purpose", "활동 목적", (v) => byId(PURPOSES, v)?.label],
  ["fields", "관심 분야", (v) => (v === "any" ? "상관없음" : byId(FIELDS, v)?.label)],
  ["region", "지역"], ["industry", "업종"], ["employees", "임직원 수"],
  ["meal", "임직원 식사", (v) => ({ company: "회사가 식대 지원", self: "각자 해결" })[v]],
  ["transport", "임직원 이동", (v) => ({ bus: "단체 차량", fare: "교통비 지원", self: "각자 이동" })[v]],
  ["insurance", "상해보험", (v) => ({ us: "가입 대행", company: "회사 단체보험" })[v]],
  ["benSnack", "대상자 간식", (v) => ({ yes: "준비", no: "준비 안 함" })[v]],
  ["strategy", "예산 쓰는 방향", (v) => ({ save: "최대한 아끼기", balance: "균형", impact: "체감 효과 우선" })[v]],
  ["times", "연간 횟수", (v) => ({ 1: "1회 시범", 2: "연 2회", 4: "연 4회", 12: "매달" })[v]],
  ["skills", "임직원 전문성", (v) => byId(SKILLS, v)?.label],
  ["pain", "가장 번거로운 일"],
];

let period = 30, data = null, statusFilter = "all", query = "";
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3000); }

/* ---------- 로그인 · 권한 ---------- */
async function gate() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showGate("관리자 계정으로 로그인해 주세요.");
  const { data: ok } = await sb.rpc("ongi_is_admin");
  if (ok !== true) return showGate("이 계정은 관리자 권한이 없습니다. 관리자 계정으로 다시 로그인해 주세요.", true);
  $("#gate").hidden = true; $("#dash").hidden = false; $("#admAct").hidden = false;
  load();
}
function showGate(msg, signedIn = false) {
  $("#gate").hidden = false; $("#dash").hidden = true; $("#admAct").hidden = !signedIn;
  $("#gateMsg").textContent = msg;
}
$("#gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const btn = $('[type="submit"]', e.target);
  btn.disabled = true; btn.textContent = "로그인하는 중…"; $("#gateErr").textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email: String(f.email).trim().toLowerCase(), password: f.pw });
  btn.disabled = false; btn.textContent = "로그인";
  if (error) { $("#gateErr").textContent = error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 맞지 않습니다." : error.message; return; }
  gate();
});
$("#logoutBtn").addEventListener("click", async () => { await sb.auth.signOut(); showGate("로그아웃했습니다."); });
$("#refreshBtn").addEventListener("click", () => load());

/* ---------- 데이터 ---------- */
async function load() {
  $("#asOf").textContent = "불러오는 중…";
  const since = period ? new Date(Date.now() - period * 2 * 864e5).toISOString() : "2000-01-01";
  const q = (t, sel) => sb.from(t).select(sel).gte("created_at", since).order("created_at", { ascending: true }).limit(20000);
  const [ev, pl, rq] = await Promise.all([
    q("ongi_events", "session_id, type, name, value, created_at"),
    q("ongi_plans", "input, top, code, owner, created_at"),
    sb.from("ongi_requests").select("*").order("created_at", { ascending: false }).limit(2000),
  ]);
  const err = ev.error || pl.error || rq.error;
  if (err) { $("#asOf").textContent = `불러오지 못했습니다: ${err.message} (Supabase에 supabase/ongi.sql을 실행했는지 확인해 주세요)`; return; }
  data = { events: ev.data, plans: dedupe(pl.data), requests: rq.data };
  $("#asOf").textContent = `${new Date().toLocaleString("ko-KR")} 기준 · 의뢰 ${num(rq.data.length)}건 · 추천 ${num(data.plans.length)}건`;
  render();
}
// 로그인 전후로 같은 추천 코드가 두 번 남을 수 있어 코드 기준으로 하나만 셉니다.
function dedupe(plans) {
  const m = new Map();
  for (const p of plans) { const k = p.code || p.created_at; if (!m.has(k) || p.owner) m.set(k, p); }
  return [...m.values()];
}
function split(rows) {
  if (!period) return { cur: rows, prev: [] };
  const cut = Date.now() - period * 864e5;
  return { cur: rows.filter((r) => Date.parse(r.created_at) >= cut), prev: rows.filter((r) => Date.parse(r.created_at) < cut) };
}
const uniq = (evs, type, name) => new Set(evs.filter((e) => e.type === type && (name == null || e.name === name)).map((e) => e.session_id)).size;
function metrics(evs, reqs) {
  const visitors = uniq(evs, "visit"), starts = uniq(evs, "step", "1"), results = uniq(evs, "result");
  const stay = new Map();
  evs.filter((e) => e.type === "section").forEach((e) => stay.set(e.session_id, (stay.get(e.session_id) || 0) + Number(e.value || 0)));
  return {
    visitors, starts, results,
    complete: starts ? results / starts : null,
    requests: reqs.length,
    conv: results ? reqs.length / results : null,
    codes: evs.filter((e) => e.type === "code" && e.name !== "vote-share").length,
    voteShares: evs.filter((e) => e.type === "code" && e.name === "vote-share").length,
    votes: evs.filter((e) => e.type === "vote").length,
    refs: uniq(evs, "ref"),
    stay: stay.size ? [...stay.values()].reduce((a, b) => a + b, 0) / stay.size : 0,
  };
}
const count = (arr) => { const m = new Map(); arr.forEach((v) => v != null && v !== "" && m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

/* ---------- 그리기 ---------- */
function bars(rows, { fmt = num, gold = false, drop = null } = {}) {
  if (!rows.length) return `<p class="empty-s">아직 데이터가 없습니다.</p>`;
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return `<ul class="bars">${rows.map(([k, v], i) => `<li><span class="lb" title="${esc(k)}">${esc(k)}</span>
    <span class="tr"><span class="${gold ? "gold" : ""}" style="width:${(v / max) * 100}%"></span>${drop && drop[i] ? `<span class="drop" style="left:${((v - drop[i]) / max) * 100}%;width:${(drop[i] / max) * 100}%"></span>` : ""}</span>
    <span class="v">${fmt(v)}${drop && drop[i] ? ` <small class="note">−${num(drop[i])}</small>` : ""}</span></li>`).join("")}</ul>`;
}
function kpi(label, cur, prev, fmt, { rate = false, meter = null, hint = "" } = {}) {
  let delta = "";
  if (period && prev != null && cur != null) {
    const d = rate ? (cur - prev) * 100 : prev ? ((cur - prev) / prev) * 100 : null;
    if (d != null && isFinite(d)) delta = `<i class="${d > 0.5 ? "up" : d < -0.5 ? "down" : "flat"}">${d > 0.5 ? "▲" : d < -0.5 ? "▼" : "–"} ${Math.abs(Math.round(d))}${rate ? "%p" : "%"}</i>`;
  }
  return `<div class="kpi"><span>${label}</span><b>${fmt(cur)}</b>${delta}${meter != null ? `<div class="meter"><span style="width:${Math.min(100, (meter || 0) * 100)}%"></span></div>` : ""}${hint ? `<small>${hint}</small>` : ""}</div>`;
}
function dailyChart(evs, reqs) {
  const days = period || 30;
  const keys = Array.from({ length: days }, (_, i) => day(new Date(Date.now() - (days - 1 - i) * 864e5).toISOString()));
  const v = (type, name) => { const m = new Map(); keys.forEach((k) => m.set(k, new Set())); evs.filter((e) => e.type === type && (name == null || e.name === name)).forEach((e) => m.get(day(e.created_at))?.add(e.session_id)); return keys.map((k) => m.get(k).size); };
  const visits = v("visit"), starts = v("step", "1");
  const rq = keys.map((k) => reqs.filter((r) => day(r.created_at) === k).length);
  const max = Math.max(...visits, ...starts, 1), W = 640, H = 180, bw = W / days;
  const y = (n) => H - 20 - (n / max) * (H - 36);
  const line = starts.map((n, i) => `${i ? "L" : "M"}${(i + .5) * bw},${y(n)}`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="일별 방문과 추천 시작">
    ${visits.map((n, i) => `<rect x="${i * bw + bw * .15}" y="${y(n)}" width="${bw * .7}" height="${H - 20 - y(n)}" rx="2" fill="var(--line)"><title>${keys[i]} 방문 ${n}</title></rect>`).join("")}
    <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="2"/>
    ${rq.map((n, i) => (n ? `<circle cx="${(i + .5) * bw}" cy="${y(n)}" r="4" fill="var(--ember)"><title>${keys[i]} 의뢰 ${n}</title></circle>` : "")).join("")}
    <text class="ax" x="0" y="${H - 4}">${keys[0].slice(5)}</text><text class="ax" x="${W}" y="${H - 4}" text-anchor="end">${keys.at(-1).slice(5)}</text>
    <text class="ax" x="0" y="12">최대 ${max}</text>
  </svg><div class="legend"><span><i style="background:var(--line)"></i>방문 세션</span><span><i style="background:var(--ink)"></i>추천 시작</span><span><i style="background:var(--ember);border-radius:50%"></i>의뢰</span></div>`;
}

function render() {
  const E = split(data.events), P = split(data.plans), R = split(data.requests);
  const m = metrics(E.cur, R.cur), mp = metrics(E.prev, R.prev);
  $("#periodChips").innerHTML = PERIODS.map((p) => `<button class="chip ${p.d === period ? "on" : ""}" type="button" data-period="${p.d}">${p.label}</button>`).join("");
  $("#kpiNote").textContent = period ? `최근 ${period}일 · 직전 ${period}일과 비교` : "전체 기간 합계";

  $("#kpis").innerHTML = [
    kpi("방문 세션", m.visitors, mp.visitors, num),
    kpi("추천 시작", m.starts, mp.starts, num, { hint: `방문의 ${pct(m.visitors ? m.starts / m.visitors : null)}` }),
    kpi("추천 완료율", m.complete, mp.complete, pct, { rate: true, meter: m.complete, hint: `완료 ${num(m.results)}세션` }),
    kpi("의뢰 건수", m.requests, mp.requests, num, { hint: `연락 전 ${data.requests.filter((r) => r.status === "new").length}건 (전체 기간)` }),
    kpi("의뢰 전환율", m.conv, mp.conv, pct, { rate: true, meter: m.conv, hint: "추천 완료 대비 의뢰" }),
    kpi("할인 코드 복사·공유", m.codes, mp.codes, num),
    kpi("소개 링크 유입", m.refs, mp.refs, num, { hint: `코드 쓴 의뢰 ${R.cur.filter((r) => r.code || r.ref).length}건` }),
    kpi("팀 투표 링크 공유", m.voteShares, mp.voteShares, num),
    kpi("팀 투표 참여", m.votes, mp.votes, num, { hint: m.voteShares ? `링크 1개당 ${(m.votes / m.voteShares).toFixed(1)}표` : "" }),
    kpi("평균 체류", m.stay, mp.stay, dur),
  ].join("");

  // 단계별 이탈
  const stepN = STEP_LABEL.map((_, i) => uniq(E.cur, "step", String(i + 1)));
  const fRows = [...STEP_LABEL.map((l, i) => [`${i + 1}. ${l}`, stepN[i]]), ["추천 결과", m.results], ["의뢰", uniq(E.cur, "request")]];
  const drops = fRows.map((r, i) => (i < fRows.length - 1 ? Math.max(0, r[1] - fRows[i + 1][1]) : 0));
  $("#funnel").innerHTML = bars(fRows, { drop: drops });

  const secs = new Map();
  E.cur.filter((e) => e.type === "section").forEach((e) => { const s = secs.get(e.name) || [0, 0]; secs.set(e.name, [s[0] + Number(e.value || 0), s[1] + 1]); });
  $("#sections").innerHTML = bars([...secs.entries()].map(([k, [t, n]]) => [SECTION_LABEL[k] || k, t / n]).sort((a, b) => b[1] - a[1]), { fmt: dur, gold: true });
  $("#clicks").innerHTML = bars(count(E.cur.filter((e) => e.type === "click").map((e) => e.name)).slice(0, 10));
  $("#daily").innerHTML = dailyChart(E.cur, R.cur);
  $("#recTop").innerHTML = bars(count(P.cur.flatMap((p) => (p.top || []).slice(0, 3).map((t) => byId(PROGRAMS, t.id)?.name || t.id))).slice(0, 8), { gold: true });
  $("#reqTop").innerHTML = bars(count(R.cur.map((r) => byId(PROGRAMS, r.program)?.name || r.program)).slice(0, 8), { gold: true });

  // 응답 분포
  $("#respNote").textContent = `추천 응답 ${num(P.cur.length)}건 기준 · 개인정보 없음`;
  $("#dists").innerHTML = DIST.map(([key, title, label = (v) => v]) => {
    const vals = P.cur.flatMap((p) => { const v = p.input?.[key]; return Array.isArray(v) ? v : [v]; }).map((v) => label(v) || v);
    return `<div class="adm-card w4"><h3>${title}</h3><p class="take">${Array.isArray(P.cur[0]?.input?.[key]) ? "복수 선택 · " : ""}응답 ${num(P.cur.filter((p) => p.input?.[key] != null && p.input?.[key] !== "").length)}건</p>${bars(count(vals).slice(0, 7))}</div>`;
  }).join("") + `<div class="adm-card w4"><h3>참여 인원 · 1회 예산</h3><p class="take">응답의 중간값이에요.</p>${bars([["참여 인원(명)", median(P.cur.map((p) => p.input?.participants))], ["1회 예산(원)", median(P.cur.map((p) => p.input?.budget))]], { fmt: num })}</div>`;

  insights(m, mp, E, P, R, stepN, drops);
  renderRequests();
}
const median = (a) => { const s = a.filter((x) => typeof x === "number").sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/* ---------- 인사이트 (규칙) ---------- */
function insights(m, mp, E, P, R, stepN, drops) {
  const ins = [], sug = [];
  const top = (key, label) => { const c = count(P.cur.flatMap((p) => [].concat(p.input?.[key] ?? []))); return c[0] ? [label(c[0][0]) || c[0][0], c[0][1]] : null; };
  if (m.visitors < 10) ins.push(`이 기간 방문이 ${m.visitors}세션이라 숫자는 방향만 보는 참고용이에요.`);
  if (m.complete != null) ins.push(`추천을 시작한 세션의 ${pct(m.complete)}가 결과까지 봤어요${period && mp.complete != null ? ` (직전 기간 ${pct(mp.complete)})` : ""}.`);
  const worst = drops.slice(0, STEP_LABEL.length).reduce((b, d, i) => (d > b.d ? { d, i } : b), { d: 0, i: -1 });
  if (worst.i >= 0 && worst.d > 0) { ins.push(`가장 많이 그만둔 곳은 ${worst.i + 1}단계 ‘${STEP_LABEL[worst.i]}’ (${worst.d}세션)이에요.`); sug.push(`${worst.i + 1}단계 문항 수를 줄이거나 ‘모름’ 선택지를 더해 보세요.`); }
  if (m.conv != null) ins.push(`추천 결과를 본 세션 대비 의뢰는 ${pct(m.conv)}예요.`);
  if (m.results > 3 && (m.conv ?? 0) < .1) sug.push("결과 화면의 ‘이 안으로 의뢰하기’ 버튼 위에 할인 혜택 금액을 더 크게 보여 주세요.");
  const b = top("budgetPreset", (v) => byId(BUDGET_PRESETS, v)?.label); if (b) ins.push(`가장 많은 1회 예산은 ‘${b[0]}’(${b[1]}건)이에요.`);
  const im = top("images", (v) => byId(IMAGES, v)?.label); if (im) ins.push(`가장 많이 고른 회사 이미지는 ‘${im[0]}’예요.`);
  const fresh = data.requests.filter((r) => r.status === "new");
  if (fresh.length) sug.push(`연락 전 의뢰가 ${fresh.length}건 있어요. 가장 오래된 건은 ${fmtDate(fresh.at(-1).created_at)} 접수예요.`);
  if (m.votes) ins.push(`팀 투표에 ${m.votes}표가 들어왔어요. 사내 의견을 모으는 데 쓰이고 있어요.`); else if (m.voteShares) sug.push("투표 링크는 공유되지만 투표가 없어요. 링크 문구를 더 짧게 바꿔 보세요.");
  if (m.refs) ins.push(`소개 링크로 ${m.refs}세션이 들어왔어요.`); else if (m.codes) sug.push("코드는 복사되지만 소개 유입이 없어요. 소개 링크 문구를 결과 화면 위쪽으로 올려 보세요.");
  const mealYes = P.cur.filter((p) => p.input?.meal === "company").length;
  if (P.cur.length >= 5) ins.push(`응답의 ${pct(mealYes / P.cur.length)}가 식대를 회사가 지원한다고 했어요.`);
  if (!sug.length) sug.push("데이터가 더 쌓이면 개선 제안이 나타나요.");
  $("#insights").innerHTML = ins.map((t) => `<li>${esc(t)}</li>`).join("") || `<li>아직 데이터가 없습니다.</li>`;
  $("#suggest").innerHTML = sug.map((t) => `<li>${esc(t)}</li>`).join("");
  data.facts = [`기간: ${period ? `최근 ${period}일` : "전체"}`, `방문 세션 ${m.visitors}, 추천 시작 ${m.starts}, 추천 완료 ${m.results}, 의뢰 ${m.requests}, 할인 코드 복사·공유 ${m.codes}, 소개 유입 ${m.refs}, 팀 투표 링크 ${m.voteShares}, 팀 투표 ${m.votes}`,
    ...STEP_LABEL.map((l, i) => `${i + 1}단계 ${l}: ${stepN[i]}세션`), ...ins, ...DIST.slice(0, 8).map(([key, title, label = (v) => v]) => `${title}: ${count(P.cur.flatMap((p) => [].concat(p.input?.[key] ?? [])).map((v) => label(v) || v)).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(", ")}`)].join("\n");
}
$("#aiBtn").addEventListener("click", async () => {
  const out = $("#aiOut"), btn = $("#aiBtn");
  btn.disabled = true; out.textContent = "요약하는 중… (10초 안팎)";
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch("api/ai-summary", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ facts: data.facts }) }).catch(() => null);
  btn.disabled = false;
  if (!r || r.status === 404 || r.status === 405) { out.textContent = "AI 요약은 서버(api/)가 있는 배포 환경(Vercel 또는 node dev-server.mjs)에서 동작합니다. 위의 자동 인사이트를 참고해 주세요."; return; }
  const body = await r.json().catch(() => ({}));
  out.textContent = body.ai || ({ NO_AI_KEY: "서버에 GEMINI_API_KEY가 설정되지 않았습니다.", AI_ERROR: "AI가 지금 응답하지 않습니다. 잠시 후 다시 눌러 주세요." }[body.reason]) || body.message || "요약하지 못했습니다.";
});

/* ---------- 의뢰 관리 ---------- */
function renderRequests() {
  const all = data.requests;
  $("#pipe").innerHTML = Object.entries(STATUS).map(([k, v]) => `<div><b>${all.filter((r) => r.status === k).length}</b><span>${v}</span></div>`).join("");
  $("#statusChips").innerHTML = [["all", "전체"], ...Object.entries(STATUS)].map(([k, v]) => `<button class="chip ${k === statusFilter ? "on" : ""}" type="button" data-sf="${k}">${v}</button>`).join("");
  const ql = query.trim().toLowerCase();
  const list = all.filter((r) => (statusFilter === "all" || r.status === statusFilter) && (!ql || [r.id, r.contact?.company, r.contact?.name, r.contact?.email].some((v) => String(v || "").toLowerCase().includes(ql))));
  $("#reqList").innerHTML = list.length ? list.map((r) => {
    const c = r.contact || {}, p = byId(PROGRAMS, r.program), pl = r.plan || {};
    return `<article class="req-item">
      <div class="top"><h3>${esc(c.company)} · ${esc(p?.name || r.program)}</h3><span class="st st-${r.status}">${STATUS[r.status]}</span></div>
      <dl>
        <dt>접수</dt><dd>${esc(r.id)} · ${fmtDate(r.created_at)}${r.updated_at !== r.created_at ? ` · 변경 ${fmtDate(r.updated_at)}` : ""}</dd>
        <dt>담당자</dt><dd>${esc(c.name)} · ${esc(c.dept)}${c.bizNo ? ` · 사업자 ${esc(c.bizNo)}` : ""}</dd>
        <dt>연락처</dt><dd>${esc(c.phone)} · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · ${esc(c.contactBy)}, ${esc(c.contactTime)}</dd>
        <dt>소재지 · 시기</dt><dd>${esc(c.addr)} · ${esc(r.when_text)}</dd>
        ${pl.participants ? `<dt>조건</dt><dd>${pl.participants}명 · 1회 ${man(pl.budget)} · ${esc(byId(PER_HEAD_PRESETS, pl.perHeadPreset)?.label || "")} · ${esc((pl.images || []).map((i) => byId(IMAGES, i)?.label).join(", "))}</dd>
        <dt>챙길 것</dt><dd>식사 ${pl.meal === "company" ? "회사 지원" : "각자"} · 이동 ${({ bus: "단체 차량", fare: "교통비", self: "각자" })[pl.transport] || "–"} · 보험 ${pl.insurance === "us" ? "가입 대행" : "회사"} · 대상자 간식 ${pl.benSnack === "yes" ? "준비" : "없음"}</dd>` : ""}
        ${r.estimate ? `<dt>예상 비용</dt><dd>${won(r.estimate)} (추정)</dd>` : ""}
        ${r.code || r.ref ? `<dt>할인 코드</dt><dd>${esc(r.code || "")}${r.ref ? ` · 소개 ${esc(r.ref)}` : ""}</dd>` : ""}
        ${r.memo ? `<dt>요청 사항</dt><dd>${esc(r.memo)}</dd>` : ""}
      </dl>
      <div class="ctl">
        <div class="field" style="margin:0"><label for="st-${esc(r.id)}">진행 상태</label><select id="st-${esc(r.id)}" data-status="${esc(r.id)}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field" style="margin:0"><label for="nt-${esc(r.id)}">운영 메모 (의뢰인에게 보이지 않음)</label><textarea id="nt-${esc(r.id)}">${esc(r.admin_note || "")}</textarea></div>
        <button class="pill ghost sm" type="button" data-note="${esc(r.id)}">메모 저장</button>
      </div>
    </article>`;
  }).join("") : `<p class="empty-s">해당하는 의뢰가 없습니다.</p>`;
}
async function patch(id, values, msg) {
  const { error } = await sb.from("ongi_requests").update(values).eq("id", id);
  if (error) { toast("저장하지 못했습니다. 다시 시도해 주세요."); return; }
  Object.assign(data.requests.find((r) => r.id === id), values);
  toast(msg); renderRequests();
}
document.addEventListener("change", (e) => { const id = e.target.dataset.status; if (id) patch(id, { status: e.target.value }, `상태를 ‘${STATUS[e.target.value]}’(으)로 바꿨습니다.`); });
document.addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.period != null) { period = Number(t.dataset.period); load(); }
  if (t.dataset.sf) { statusFilter = t.dataset.sf; renderRequests(); }
  if (t.dataset.note) patch(t.dataset.note, { admin_note: $(`#nt-${CSS.escape(t.dataset.note)}`).value.trim() || null }, "메모를 저장했습니다.");
  if (t.dataset.csv) csv(t.dataset.csv);
});
$("#reqSearch").addEventListener("input", (e) => { query = e.target.value; renderRequests(); });

/* ---------- CSV ---------- */
function csv(kind) {
  const P = split(data.plans).cur, E = split(data.events).cur;
  const sets = {
    requests: [["접수번호", "접수일", "상태", "회사명", "사업자등록번호", "소재지", "담당자", "부서직함", "연락처", "이메일", "연락방법", "연락시간", "희망시기", "프로그램", "예상비용", "참여인원", "1회예산", "할인코드", "소개코드", "요청사항", "운영메모"],
      data.requests.map((r) => [r.id, fmtDate(r.created_at), STATUS[r.status], r.contact?.company, r.contact?.bizNo, r.contact?.addr, r.contact?.name, r.contact?.dept, r.contact?.phone, r.contact?.email, r.contact?.contactBy, r.contact?.contactTime, r.when_text, byId(PROGRAMS, r.program)?.name || r.program, r.estimate, r.plan?.participants, r.plan?.budget, r.code, r.ref, r.memo, r.admin_note])],
    plans: [["일시", "할인코드", ...DIST.map((d) => d[1]), "참여인원", "1회예산", "추천1", "추천2", "추천3"],
      P.map((p) => [p.created_at, p.code, ...DIST.map(([k, , label = (v) => v]) => [].concat(p.input?.[k] ?? []).map((v) => label(v) || v).join(" / ")), p.input?.participants, p.input?.budget, ...(p.top || []).slice(0, 3).map((t) => byId(PROGRAMS, t.id)?.name || t.id)])],
    events: [["일시", "세션", "종류", "이름", "값"], E.map((e) => [e.created_at, e.session_id, e.type, e.name, e.value])],
  };
  const [head, rows] = sets[kind];
  const text = "﻿" + [head, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = `지역온기_${{ requests: "의뢰", plans: "추천응답", events: "행동기록" }[kind]}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

gate();
