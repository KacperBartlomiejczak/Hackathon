import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/findings", label: "Findingi" },
  { to: "/trends", label: "Trendy" },
  { to: "/calibration", label: "Kalibracja" },
  { to: "/sources", label: "Źródła" },
];

export default function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
          <span className="text-lg font-semibold">InvestWatch</span>
          <nav className="flex gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium",
                    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
