import { useLayoutEffect } from 'react';
import type { AppProps } from 'next/app';
import { DEFAULT_THEME_VARS, applyCssVars } from '@/lib/themeVars';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  // apply theme vars synchronously on client mount via useLayoutEffect
  // this runs before paint, ensuring vars exist even if ssr injection fails
  useLayoutEffect(() => {
    applyCssVars(document.documentElement, DEFAULT_THEME_VARS);
  }, []);
  
  return <Component {...pageProps} />;
}
