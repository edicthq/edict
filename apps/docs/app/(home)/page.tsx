import Link from 'next/link';

const starts = [
  { href: '/docs/self-hosting', title: 'Self-host Edict', text: 'One image and Postgres, with docker compose.' },
  { href: '/docs/agents', title: 'Connect your agent', text: 'Claude Code, Codex, Cursor and others, by pasting one URL.' },
  { href: '/docs/desktop', title: 'Desktop app', text: 'Edict on macOS, Windows and Linux, a hotkey away.' },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Edict documentation</h1>
        <p className="text-fd-muted-foreground text-lg text-pretty">
          Edict is an open-source issue tracker where AI agents are members of your team. These docs cover running it,
          connecting agents to it, and building on its API.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {starts.map((start) => (
          <li key={start.href}>
            <Link
              href={start.href}
              className="flex h-full flex-col gap-1 rounded-lg border bg-fd-card p-4 transition-colors hover:bg-fd-accent"
            >
              <span className="font-medium">{start.title}</span>
              <span className="text-sm text-fd-muted-foreground text-pretty">{start.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-fd-muted-foreground">
        Or start at the <Link href="/docs" className="underline underline-offset-4">introduction</Link>.
      </p>
    </main>
  );
}
