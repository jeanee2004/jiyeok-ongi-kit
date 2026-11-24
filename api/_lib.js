// 서버 함수 공통. 키는 process.env 에서만 읽고 응답·로그에 넣지 않습니다.
export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export function env() {
  const url = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  return url && anon && secret ? { url, anon, secret } : null;
}

// 비밀 키로 Supabase 관리 API를 부릅니다.
export const admin = (e, path, init = {}) => fetch(`${e.url}${path}`, {
  ...init, headers: { apikey: e.secret, "content-type": "application/json", ...(init.headers || {}) },
});

// 로그인한 사람의 토큰으로 부릅니다(RLS가 그대로 적용됨).
export const asUser = (e, token, path, init = {}) => fetch(`${e.url}${path}`, {
  ...init, headers: { apikey: e.anon, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
});

export const bearer = (request) => /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1]?.trim();

export async function isAdmin(e, token) {
  const r = await asUser(e, token, "/rest/v1/rpc/ongi_is_admin", { method: "POST", body: "{}" });
  return r.ok && (await r.json()) === true;
}
