import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

// Edict's mark (assets/brand/mark.svg), in the text color.
function Mark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M5 2h7a1 1 0 0 1 0 2H5v8h7a1 1 0 0 1 0 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path
        fill="currentColor"
        d="M8.1 6h1.8A1.1 1.1 0 0 1 11 7.1v1.8A1.1 1.1 0 0 1 9.9 10H8.1A1.1 1.1 0 0 1 7 8.9V7.1A1.1 1.1 0 0 1 8.1 6Z"
      />
    </svg>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Mark />
          {appName}
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
