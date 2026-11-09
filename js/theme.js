// 다크/라이트 모드 전환
// 저장값이 없으면 시스템 설정을 따르고, 버튼을 누르면 선택을 localStorage에 기억한다.

const STORAGE_KEY = 'theme';
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

const currentTheme = () => root.dataset.theme || (media.matches ? 'dark' : 'light');

function save(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서도 전환은 동작한다
  }
}

function syncButton(button) {
  const mode = currentTheme();
  button.dataset.mode = mode;
  button.setAttribute('aria-label', mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
  button.title = button.getAttribute('aria-label');
}

export function initThemeToggle(button) {
  if (!button) return;
  syncButton(button);

  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    save(next);
    syncButton(button);
  });

  // 사용자가 직접 고르지 않았다면 시스템 설정 변경을 따라간다
  media.addEventListener('change', () => syncButton(button));
}
