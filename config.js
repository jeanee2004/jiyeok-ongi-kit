// 공개 설정: Supabase 주소와 공개(anon) 키는 원래 브라우저에 노출되는 값입니다. 권한은 DB의 RLS가 지킵니다.
// 비밀 키(SUPABASE_SECRET_KEY)와 GEMINI_API_KEY는 여기 두지 않고 .env.local / 배포 환경변수에서 api/만 읽습니다.
window.ONGI_CONFIG = {
  supabaseUrl: "https://dojnxdldodhvclusfsrn.supabase.co",
  supabaseAnonKey: "sb_publishable_UQkfFZ40XVQXgi1ZFPekkQ_Vn8gMA-F",
};
