// 日本語リソース. ここに無いキーは fallbackLng='ko' で韓国語にフォールバック(파이프 개통 — 셸부터 시드, 나머지는 점진).
export const ja: Record<string, string> = {
  // 공용 액션
  'common.cancel': 'キャンセル',
  'common.confirm': '確認',
  'common.close': '閉じる',
  'common.save': '保存',
  'common.retry': '再試行',
  'common.loading': '読み込み中…',
  'common.back': '戻る',
  'common.delete': '削除',
  // 진입(landing)
  // 로그인
  'login.title': 'ログイン',
  'login.email': 'メールアドレス',
  'login.password': 'パスワード',
  'login.submitting': 'ログイン中…',
  'login.submit': 'ログイン',
  'login.noAccount': 'アカウントをお持ちでないですか？',
  'login.signupLink': '新規登録',
  'login.or': 'または',
  'login.withGoogle': 'Googleで続行',
  'login.withKakao': 'カカオで続行',
  // 회원가입
  'register.title': '新規登録',
  'register.email': 'メールアドレス',
  'register.password': 'パスワード',
  'register.passwordConfirm': 'パスワード（確認）',
  'register.passwordHint': '8文字以上、大文字・数字を各1つ以上',
  'register.submitting': '登録中…',
  'register.submit': '新規登録',
  'register.hasAccount': 'すでにアカウントをお持ちですか？',
  'register.loginLink': 'ログイン',
  // 설정
  'settings.title': '設定',
  'settings.language': '言語',
  'settings.avatar': 'アバター',
  'settings.home': '← ホーム',
  // 로비
  'lobby.title': 'ロビー',
  'lobby.logout': 'ログアウト',
}
