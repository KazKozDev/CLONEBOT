import { useThemeStore } from '@/stores/theme-store';
import { useEffect } from 'react';

export function useTheme() {
  const { theme, set, toggle } = useThemeStore();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return { theme, setTheme: set, toggleTheme: toggle };
}
