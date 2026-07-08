// English resource. Missing keys fall back to 'ko' via fallbackLng (pipe open — shell seeded, rest incremental).
export const en: Record<string, string> = {
  // common actions
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.retry': 'Retry',
  'common.loading': 'Loading…',
  'common.back': 'Back',
  'common.delete': 'Delete',
  // landing
  // login
  'login.title': 'Log in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submitting': 'Logging in…',
  'login.submit': 'Log in',
  'login.noAccount': "Don't have an account?",
  'login.signupLink': 'Sign up',
  'login.or': 'or',
  'login.withGoogle': 'Continue with Google',
  'login.withKakao': 'Continue with Kakao',
  // register
  'register.title': 'Sign up',
  'register.email': 'Email',
  'register.password': 'Password',
  'register.passwordConfirm': 'Confirm password',
  'register.passwordHint': 'At least 8 characters, incl. 1 uppercase and 1 number',
  'register.submitting': 'Signing up…',
  'register.submit': 'Sign up',
  'register.hasAccount': 'Already have an account?',
  'register.loginLink': 'Log in',
  // settings
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.avatar': 'Avatar',
  'settings.home': '← Home',
  // lobby
  'lobby.title': 'Lobby',
  'lobby.logout': 'Log out',
}
