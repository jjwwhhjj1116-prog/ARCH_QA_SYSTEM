'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type Locale = 'ko' | 'vi';
export const SIDEBAR_DEFAULT = 248;
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 380;
export function clampSidebar(value: number) {
  return Number.isFinite(value)
    ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)))
    : SIDEBAR_DEFAULT;
}
const Preferences = createContext({
  locale: 'ko' as Locale,
  setLocale: (_value: Locale) => {},
  sidebarWidth: SIDEBAR_DEFAULT,
  setSidebarWidth: (_value: number) => {},
});

export function WorkspacePreferences({ children }: { children: ReactNode }) {
  const { locale, sidebarWidth } = useSyncExternalStore(
    subscribe,
    readPreferences,
    () => defaults,
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function save(nextLocale: Locale, nextWidth: number) {
    cached = { locale: nextLocale, sidebarWidth: nextWidth };
    cachedRaw = JSON.stringify(cached);
    try {
      localStorage.setItem('qc-workspace-preferences', cachedRaw);
    } catch {
      /* Preferences still work for this open page. */
    }
    window.dispatchEvent(new Event('qc-preferences-change'));
  }
  function setLocale(value: Locale) {
    save(value, sidebarWidth);
  }
  function setSidebarWidth(value: number) {
    const width = clampSidebar(value);
    save(locale, width);
  }
  return (
    <Preferences.Provider
      value={{ locale, setLocale, sidebarWidth, setSidebarWidth }}
    >
      {children}
    </Preferences.Provider>
  );
}

const defaults = { locale: 'ko' as Locale, sidebarWidth: SIDEBAR_DEFAULT };
let cached = defaults;
let cachedRaw: string | null | undefined;
function readPreferences() {
  try {
    const raw = localStorage.getItem('qc-workspace-preferences');
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    const value = raw
      ? (JSON.parse(raw) as { locale?: unknown; sidebarWidth?: unknown })
      : {};
    cached = {
      locale: value.locale === 'vi' ? 'vi' : 'ko',
      sidebarWidth:
        typeof value.sidebarWidth === 'number'
          ? clampSidebar(value.sidebarWidth)
          : SIDEBAR_DEFAULT,
    };
  } catch {
    /* Storage unavailability preserves preferences for this session. */
  }
  return cached;
}
function subscribe(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener('qc-preferences-change', notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener('qc-preferences-change', notify);
  };
}

export const useWorkspacePreferences = () => useContext(Preferences);
export function LanguageSwitch() {
  const { locale, setLocale } = useWorkspacePreferences();
  return (
    <label className="language-switch">
      <span className="sr-only">Language / 언어 / Ngôn ngữ</span>
      <select
        aria-label="Language / 언어 / Ngôn ngữ"
        value={locale}
        onChange={(event) =>
          setLocale(event.target.value === 'vi' ? 'vi' : 'ko')
        }
      >
        <option value="ko">한국어</option>
        <option value="vi">Tiếng Việt</option>
      </select>
    </label>
  );
}

// A focusable ARIA window splitter is interactive; a native hr is not.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
export function SidebarResizer() {
  const { sidebarWidth, setSidebarWidth, locale } = useWorkspacePreferences();
  return (
    <div
      className="sidebar-resizer"
      role="separator"
      tabIndex={0}
      aria-label={
        locale === 'vi' ? 'Điều chỉnh độ rộng menu' : '좌측 메뉴 폭 조절'
      }
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={sidebarWidth}
      onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
      onKeyDown={(event) => {
        const values: Record<string, number> = {
          ArrowLeft: sidebarWidth - 10,
          ArrowRight: sidebarWidth + 10,
          Home: SIDEBAR_MIN,
          End: SIDEBAR_MAX,
        };
        if (event.key in values) {
          event.preventDefault();
          setSidebarWidth(values[event.key]);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          setSidebarWidth(event.clientX);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */

export function PersonalPreferences() {
  const { locale, sidebarWidth, setSidebarWidth } = useWorkspacePreferences();
  const vi = locale === 'vi';
  return (
    <section
      className="settings-card preferences-card"
      aria-labelledby="personal-preferences-title"
    >
      <h2 id="personal-preferences-title">
        {vi ? 'Cài đặt cá nhân' : '개인 설정'}
      </h2>
      <p>
        {vi
          ? 'Ngôn ngữ và kích thước menu chỉ áp dụng trên thiết bị này.'
          : '언어와 메뉴 크기는 이 기기에만 저장됩니다. 원본 자료는 바뀌지 않습니다.'}
      </p>
      <div className="preferences-grid">
        <div>
          <label>{vi ? 'Ngôn ngữ giao diện' : '화면 언어'}</label>
          <LanguageSwitch />
        </div>
        <div>
          <label htmlFor="sidebar-width">
            {vi ? 'Độ rộng menu' : '좌측 메뉴 폭'}{' '}
            <output>{sidebarWidth}px</output>
          </label>
          <input
            id="sidebar-width"
            type="range"
            min={SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            value={sidebarWidth}
            onChange={(event) => setSidebarWidth(Number(event.target.value))}
          />
          <button
            type="button"
            className="secondary-action"
            onClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
          >
            {vi ? 'Khôi phục mặc định' : '기본 너비로 복원'}
          </button>
        </div>
      </div>
    </section>
  );
}
