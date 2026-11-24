// POST /api/ai-summary — 관리자만. 대시보드가 보낸 집계 숫자(개인정보 없음)를 Gemini가 한국어로 요약합니다.
// 연락처·회사명·요청 사항 원문은 보내지 않습니다(개인정보처리방침 3항).
import { json, env, bearer, isAdmin } from "./_lib.js";

const MODELS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash"];

export async function POST(request) {
  const e = env();
  const token = bearer(request);
  if (!e) return json({ message: "서버 설정이 끝나지 않았습니다." }, 500);
  if (!token || !(await isAdmin(e, token))) return json({ message: "관리자만 볼 수 있습니다" }, 403);
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return json({ ai: null, reason: "NO_AI_KEY" });

  const { facts } = await request.json().catch(() => ({}));
  if (typeof facts !== "string" || !facts.trim()) return json({ ai: null, reason: "EMPTY" });
  const prompt = `지역 중소·중견기업 담당자에게 임직원 봉사 프로그램을 추천하고 의뢰를 받는 사이트의 운영 지표야.\n\n${facts.slice(0, 6000)}\n\n운영팀이 읽을 요약을 한국어로 써 줘. 형식: 1) 지금 상황 2~3문장, 2) 눈에 띄는 점 2~3개, 3) 다음에 해 볼 일 2~3개(각 한 줄). 숫자는 위 자료 안에서만 쓰고 짐작한 숫자를 만들지 마. 의뢰나 응답이 10건 미만이면 "표본이 적어 참고용"이라고 덧붙여. 기관을 홍보 배경으로 쓰거나 일회성 행사를 늘리자는 제안은 하지 마.`;

  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } } }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const body = await r.json();
      const text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
      if (text) return json({ ai: text, reason: "OK" });
    } catch { /* 다음 모델로 */ }
  }
  return json({ ai: null, reason: "AI_ERROR" });
}
