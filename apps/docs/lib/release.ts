import pkg from '../package.json';

// The version this site was built at. Every package carries the release's
// version (docs/releasing.md), so the download links follow each release.
export const version = pkg.version;

export const repo = 'https://github.com/edicthq/edict';
export const releasesUrl = `${repo}/releases`;
const asset = (file: string) => `${repo}/releases/download/v${version}/${file}`;

export type Platform = 'macos' | 'windows' | 'linux';

export interface Download {
  platform: Platform;
  name: string;
  // The file most people on the system want.
  primary: { label: string; href: string; detail: string };
  others: { label: string; href: string }[];
}

export const downloads: Download[] = [
  {
    platform: 'macos',
    name: 'macOS',
    primary: { label: 'Download for macOS', href: asset(`Edict_${version}_universal.dmg`), detail: 'Apple silicon and Intel · .dmg' },
    others: [],
  },
  {
    platform: 'windows',
    name: 'Windows',
    primary: { label: 'Download for Windows', href: asset(`Edict_${version}_x64-setup.exe`), detail: '64-bit installer · .exe' },
    others: [{ label: '.msi', href: asset(`Edict_${version}_x64_en-US.msi`) }],
  },
  {
    platform: 'linux',
    name: 'Linux',
    primary: { label: 'Download for Linux', href: asset(`Edict_${version}_amd64.AppImage`), detail: 'x86-64 · .AppImage' },
    others: [
      { label: '.deb', href: asset(`Edict_${version}_amd64.deb`) },
      { label: '.rpm', href: asset(`Edict-${version}-1.x86_64.rpm`) },
    ],
  },
];

export const composeCommands = [
  'curl -fsSLO https://github.com/edicthq/edict/releases/latest/download/compose.yml',
  'curl -fsSLO https://github.com/edicthq/edict/releases/latest/download/postgres-init.sh',
  'EDICT_VERSION=latest docker compose up -d',
].join('\n');
