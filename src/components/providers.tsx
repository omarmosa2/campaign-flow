"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <>
        {children}
        <Toaster richColors position="top-center" dir="rtl" />
      </>
    </ThemeProvider>
  );
}
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="تبديل المظهر"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun size={18} className="dark-hidden" />
      <Moon size={18} className="light-hidden" />
    </Button>
  );
}
