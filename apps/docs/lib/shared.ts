import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Edict';

// Where the site is served, for canonical links, Open Graph and the sitemap.
// Set SITE_URL at build time when it runs anywhere else.
export const siteUrl = (process.env.SITE_URL ?? 'https://edict.dev').replace(/\/$/, '');

// The share card (app/og.png). Pages list it themselves: a page's openGraph
// replaces the layout's whole.
export const ogImage = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Edict, the issue tracker your agents work in',
};

export const docsRoute = '/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'edicthq',
  repo: 'edict',
  branch: 'main',
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

