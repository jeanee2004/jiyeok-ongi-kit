// POST /api/delete-account — 본인 토큰을 확인한 뒤 로그인 계정을 지웁니다. 연결된 ongi_ 기록은 DB가 함께 지웁니다.
import { json, env, admin, asUser, bearer } from "./_lib.js";

export async function POST(request) {
  const e = env();
  const token = bearer(request);
  if (!e) return json({ message: "서버 설정이 끝나지 않았습니다." }, 500);
  if (!token) return json({ message: "로그인이 필요합니다" }, 401);
  const u = await asUser(e, token, "/auth/v1/user");
  if (!u.ok) return json({ message: "로그인이 필요합니다" }, 401);
  const { id } = await u.json();
  const r = await admin(e, `/auth/v1/admin/users/${id}`, { method: "DELETE" });
  return r.ok ? json({ ok: true }) : json({ message: "삭제하지 못했습니다" }, 500);
}
