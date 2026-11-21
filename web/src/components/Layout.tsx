import { Suspense, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAlerts } from "@/components/AlertsProvider";
import { cn } from "@/lib/utils";

const links = [
  { to: "/findings", label: "Findingi" },
  { to: "/trends", label: "Trendy" },
  { to: "/calibration", label: "Kalibracja" },
  { to: "/sources", label: "Źródła" },
];

export default function Layout() {
  const { newCount, resetCount, simulateAlert, mockMode } = useAlerts();
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname.startsWith("/findings")) resetCount();
  }, [pathname, newCount, resetCount]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-[3px] border-alert bg-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3">
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          <div>
            <p className="text-lg font-semibold leading-tight">InvestWatch</p>
            <p className="text-xs text-white/70">System monitoringu treści o instrumentach i usługach finansowych</p>
          </div>
          {mockMode && (
            <button
              type="button"
              onClick={simulateAlert}
              className="ml-auto rounded-md border border-white/40 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            >
              Symuluj alert
            </button>
          )}
        </div>
      </header>
      <nav className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-7xl gap-1 px-6">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 border-b-[3px] px-3.5 py-2.5 text-sm",
                  isActive ? "border-brand font-semibold text-navy" : "border-transparent text-slate-600 hover:text-navy",
                )
              }
            >
              {link.label}
              {link.to === "/findings" && newCount > 0 && (
                <span className="rounded-full bg-alert px-1.5 text-xs text-white">{newCount}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Suspense fallback={<p className="text-sm text-slate-500">Ładowanie…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-line bg-head px-6 py-3 text-center text-xs text-slate-600">
        InvestWatch · monitoring rynku finansowego
      </footer>
    </div>
  );
}
