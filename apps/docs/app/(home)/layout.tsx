// The landing page carries its own look (global.css, .landing), not the docs
// theme's layout.
export default function Layout({ children }: LayoutProps<'/'>) {
  return <div className="landing flex min-h-screen flex-col">{children}</div>;
}
