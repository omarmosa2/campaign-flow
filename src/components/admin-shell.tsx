"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ShoppingBag,
  LogOut,
  Menu,
  ArrowUpLeft,
  X,
} from "lucide-react";
import { Brand } from "./common";
import { ThemeToggle } from "./providers";
import { Button } from "./ui/button";
import { toast } from "sonner";
const links = [
  { href: "/admin/dashboard", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/admin/orders", label: "الطلبات", icon: ShoppingBag },
];
export function AdminShell({
  children,
  name,
  role,
  platform,
  logo,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  platform?: string;
  logo?: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="row between">
          <Brand name={platform} logo={logo} />
          <Button
            className="mobile-menu"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <X size={18} />
          </Button>
        </div>
        <p className="nav-label">مساحة العمل</p>
        <nav>
          {links
            .filter((l) => l.href !== "/admin/team" || role === "super_admin")
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`nav-link ${path.startsWith(l.href) ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <l.icon size={19} />
                {l.label}
              </Link>
            ))}
        </nav>
        <div className="side-bottom">
          <div className="row">
            <span className="avatar">{name.slice(0, 1)}</span>
            <span>
              <b className="small">{name}</b>
              <span
                className="muted"
                style={{ display: "block", fontSize: 10 }}
              >
                {role === "super_admin" ? "مدير النظام" : "مدير"}
              </span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="تسجيل الخروج"
              onClick={async () => {
                const r = await fetch("/api/auth", { method: "DELETE" });
                if (r.ok) {
                  router.push("/admin/login");
                } else toast.error("تعذر تسجيل الخروج");
              }}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="row">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              onClick={() => setOpen(true)}
              aria-label="فتح القائمة"
            >
              <Menu size={20} />
            </Button>
            <span className="muted small">
              مساحة العمل <span style={{ margin: "0 12px" }}>/</span>{" "}
              <b style={{ color: "var(--text)" }}>
                {links.find((l) => path.startsWith(l.href))?.label ??
                  "لوحة الإدارة"}
              </b>
            </span>
          </div>
          <div className="row">
            <Link href="/" className="small muted hide-mobile">
              زيارة المنصة{" "}
              <ArrowUpLeft size={13} style={{ display: "inline" }} />
            </Link>
            <ThemeToggle />
            <span
              className="avatar"
              style={{ width: 32, height: 32, fontSize: 12 }}
            >
              {name.slice(0, 1)}
            </span>
          </div>
        </header>
        <main id="main" className="content">
          {children}
        </main>
      </div>
    </div>
  );
}
