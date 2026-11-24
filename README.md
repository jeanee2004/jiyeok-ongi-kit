# 지역 온기 사이트

기업 사회공헌·총무 담당자를 위한 임직원 봉사 맞춤 추천·의뢰 사이트입니다. 빌드 도구 없는 정적 사이트 + 서버 함수(`api/`)입니다.

```bash
node dev-server.mjs
```
→ http://localhost:8080 (정적 파일과 `api/`를 함께 띄웁니다. `.env.local`을 읽습니다.)

| 파일 | 역할 |
| --- | --- |
| `index.html` · `styles.css` · `app.js` | 랜딩, 맞춤 추천(6단계), 로그인·가입, 의뢰 신청, 내 의뢰 |
| `data.js` | 문항, 프로그램 26개(비용은 추정치), 할인율, 예시 사진 |
| `admin.html` · `admin.css` · `admin.js` | 관리자 대시보드 (CJSJ 대시보드 구조를 이 사이트에 맞춤) |
| `config.js` | Supabase 주소와 공개(anon) 키 — 브라우저에 원래 노출되는 값 |
| `api/` | 서버 함수: `signup`(인증 메일 없이 가입), `delete-account`, `ai-summary`(Gemini) |
| `supabase/ongi.sql` | 테이블·권한(RLS). Supabase SQL Editor에서 한 번 실행 |
| `privacy.html` | 개인정보처리방침 |

## 키와 보안
- `.env.local`(깃에 올리지 않음): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`. 비밀 키와 Gemini 키는 `api/`에서만 읽습니다.
- Supabase는 CJSJ와 같은 프로젝트를 씁니다. 테이블은 모두 `ongi_`로 시작하고, 관리자 판정은 CJSJ의 `public.is_admin()`(profiles.role = admin)을 그대로 씁니다. 로그인 계정(auth.users)은 두 서비스가 함께 씁니다.
- 연락처는 `ongi_requests`에만 있고 본인과 관리자만 읽습니다. AI 요약에는 집계 숫자만 보냅니다.

## 배포
- GitHub Pages: 화면·로그인·의뢰·대시보드는 동작합니다. `api/`가 없어서 가입은 Supabase 인증 메일 방식으로 바뀌고, AI 요약·로그인 계정 삭제는 동작하지 않습니다.
- Vercel(CJSJ와 같은 방식): 환경변수 4개를 넣으면 `api/`까지 모두 동작합니다.

## 대시보드 항목
기간(7·30·90일·전체)별 핵심 지표와 직전 기간 대비 증감, 자동 인사이트·개선 제안, AI 요약, 일별 추이, 섹션별 체류, 추천 단계별 이탈, 버튼 클릭 순위, 많이 추천된·의뢰된 프로그램, 응답 분포(예산·1인당 예산·이미지·식대·교통·보험·대상자 간식 등), 의뢰 관리(상태·운영 메모·검색), CSV 3종, 인쇄.

## 사진
모두 [Unsplash License](https://unsplash.com/license) 이미지를 링크로 불러옵니다. 실제 활동 사진이 생기면 `data.js`의 `PHOTOS`와 `index.html` 히어로 이미지를 바꿉니다.
