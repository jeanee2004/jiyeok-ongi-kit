# 지역 온기 사이트

빌드 도구 없는 정적 사이트입니다. `index.html`을 열거나 아래로 띄웁니다.

```bash
python3 -m http.server 8080
```

| 파일 | 역할 |
| --- | --- |
| `index.html` | 랜딩 + 맞춤 추천·로그인·의뢰·내 의뢰 창 |
| `styles.css` | 디자인 토큰(블랙앤화이트 + 골드)과 전체 스타일 |
| `data.js` | 문항, 프로그램 카탈로그(비용은 추정치), 예시 사진 |
| `app.js` | 저장소(`DB`)·계정(`Auth`)·추천 계산·의뢰·관리자 화면 |
| `privacy.html` | 개인정보처리방침 |

## 지금 상태 (시범)
- 계정·의뢰는 브라우저 localStorage에만 저장됩니다. 다른 기기에서는 보이지 않습니다.
- 관리자 화면: `app.js`의 `ADMIN_EMAILS`에 있는 이메일로 가입하면 ‘관리자’ 버튼이 생깁니다. 기본값은 `admin@onggi.test`(테스트용)입니다.
- 추천은 `recommend()`에서 규칙 기반으로 계산하며 외부 API를 부르지 않습니다.

## 다음 연결 자리
- **Supabase**: `app.js`의 `DB`와 `Auth` 객체만 바꾸면 됩니다. 테이블은 `profiles(email, company, name, role)`, `requests(id, owner, status, contact jsonb, program, estimate, plan jsonb, when, memo, consent_at)`, `plans(owner, result jsonb)`가 맞습니다. 의뢰는 본인만 읽고, 관리자만 전체를 읽도록 RLS를 겁니다.
- **관리자 대시보드**: 지금의 `renderMyPage()` 관리자 분기(통계·상태 변경·CSV)를 CJSJ처럼 별도 페이지로 옮깁니다.
- **Gemini 등 AI**: 추천 이유 문장을 다듬는 용도로만 쓰고, 연락처 같은 개인정보는 넣지 않습니다.

## 사진
모두 [Unsplash License](https://unsplash.com/license) 이미지를 링크로 불러옵니다. 실제 활동 사진이 생기면 `data.js`의 `PHOTOS`와 `index.html` 히어로 이미지를 바꿉니다.
