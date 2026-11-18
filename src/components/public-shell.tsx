import Link from "next/link";
import { Brand } from "./common";
import { ThemeToggle } from "./providers";
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="public-header">
        <Brand />
        <div className="row">
          <ThemeToggle />
          <Link href="/admin/login" className="btn btn-outline btn-sm">
            دخول الإدارة
          </Link>
        </div>
      </header>
      <main id="main" className="public-main">
        {children}
      </main>
      <footer className="footer">
        مدار · بداية أبسط لحملتك <span aria-hidden="true"> · </span>
        <Link href="/privacy">الخصوصية</Link>
      </footer>
    </>
  );
}
