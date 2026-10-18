import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { createServer, type Plugin, type ResolvedConfig } from 'vite';
import { contentSecurityPolicy } from '../server/security/contentSecurityPolicy.js';

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** A separate root document keeps institutional content out of tenant/auth HTML. */
export function landingPrerender(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'pode-vir-landing-prerender',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    async closeBundle() {
      if (config.build.ssr) return;
      const server = await createServer({ configFile: false, root: config.root, mode: config.mode, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true }, appType: 'custom' });
      try {
        const { renderLanding } = await server.ssrLoadModule('/src/components/landing/prerender.tsx');
        const landing = renderLanding() as { html: string; title: string; description: string; origin: string | null };
        const spa = await readFile(resolve(config.root, config.build.outDir, 'index.html'), 'utf8');
        const imageUrl = `${landing.origin || ''}/brand/pode-vir-social.png`;
        const metadata = [
          `<meta name="description" content="${escapeAttribute(landing.description)}" />`,
          `<meta property="og:title" content="${escapeAttribute(landing.title)}" />`,
          `<meta property="og:description" content="${escapeAttribute(landing.description)}" />`,
          '<meta property="og:site_name" content="Pode Vir" />',
          '<meta property="og:type" content="website" />',
          '<meta property="og:locale" content="pt_BR" />',
          `<meta property="og:image" content="${escapeAttribute(imageUrl)}" />`,
          '<meta property="og:image:width" content="1200" />',
          '<meta property="og:image:height" content="630" />',
          '<meta property="og:image:alt" content="Pode Vir: seu cardápio online, sua operação no controle." />',
          '<meta name="twitter:card" content="summary_large_image" />',
          `<meta name="twitter:title" content="${escapeAttribute(landing.title)}" />`,
          `<meta name="twitter:description" content="${escapeAttribute(landing.description)}" />`,
          `<meta name="twitter:image" content="${escapeAttribute(imageUrl)}" />`,
        ];
        if (landing.origin) {
          metadata.push(`<link rel="canonical" href="${escapeAttribute(landing.origin)}/" />`, `<meta property="og:url" content="${escapeAttribute(landing.origin)}/" />`);
        }
        if (!spa.includes('<!--app-html-->') || !spa.includes('<!--/app-html-->')) throw new Error('Landing HTML markers are missing.');
        const document = spa
          .replace(/<title>.*?<\/title>/, `<title>${escapeAttribute(landing.title)}</title>`)
          .replace(/<meta name="description"[^>]*>/, metadata.join('\n  '))
          .replace('<div id="root">', '<div id="root" data-landing-prerender="true">')
          .replace(/<!--app-html-->[\s\S]*?<!--\/app-html-->/, landing.html);
        await writeFile(resolve(config.root, config.build.outDir, 'landing.html'), document);
      } finally {
        await server.close();
      }
    },
  };
}

export function landingPreview(): Plugin {
  return {
    name: 'pode-vir-landing-preview',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        response.setHeader('Content-Security-Policy', contentSecurityPolicy);
        if (request.url && new URL(request.url, 'http://localhost').pathname === '/') request.url = `/landing.html${request.url.slice(1)}`;
        next();
      });
    },
  };
}
