import { Html, Head, Main, NextScript } from 'next/document';
import { DEFAULT_THEME_VARS } from '@/lib/themeVars';

// plausible domain from environment (set at build time)
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

// generate critical css for theme vars - injected inline in <head> to ensure
// variables exist on :root at first paint, before external css loads
const criticalThemeCSS = `:root { ${Object.entries(DEFAULT_THEME_VARS)
  .map(([key, value]) => `${key}: ${value}`)
  .join('; ')}; }`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        {/* critical: inject theme vars as inline style before any other styles */}
        <style dangerouslySetInnerHTML={{ __html: criticalThemeCSS }} />
        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* google fonts - press start 2p (pixelated/retro font) */}
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
        {/* plausible analytics - privacy-respecting, no cookies */}
        {plausibleDomain && (
          <script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
          />
        )}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

