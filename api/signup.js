// POST /api/signup — 인증 메일 없이 기업 담당자 계정을 만듭니다(비밀 키 사용).
import { json, env, admin } from "./_lib.js";

export async function POST(request) {
  const e = env();
  if (!e) return json({ message: "서버 설정이 끝나지 않았습니다." }, 500);
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const company = String(b.company || "").trim().slice(0, 100);
  const name = String(b.name || "").trim().slice(0, 50);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ message: "이메일 형식을 확인해 주세요" }, 400);
  if (password.length < 8) return json({ message: "비밀번호는 8자 이상으로 정해 주세요" }, 400);
  if (!company || !name) return json({ message: "회사명과 담당자 이름을 적어 주세요" }, 400);

  const r = await admin(e, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { company, name, service: "ongi", consent_at: new Date().toISOString() } }),
  });
  const user = await r.json().catch(() => ({}));
  if (!r.ok) {
    const dup = r.status === 422 || /already/i.test(user.msg || user.message || "");
    return json({ message: dup ? "이미 가입된 이메일입니다. 로그인해 주세요" : "가입하지 못했습니다. 잠시 후 다시 시도해 주세요" }, dup ? 409 : 500);
  }
  await admin(e, "/rest/v1/ongi_accounts", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: user.id, company, name }) });
  return json({ ok: true });
}
