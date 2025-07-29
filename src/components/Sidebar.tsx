"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { name: "Home", href: "/" },
  { name: "Quotes", href: "/quotes" },
  { name: "Create Quote", href: "/create-quote" },
  { name: "Insights", href: "/insights" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#091625] text-white">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4">
        <Image src="/canyonlogo.png" alt="Canyon" width={28} height={28} />
        <span className="text-lg font-semibold">Canyon</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-2 py-3 text-sm font-medium transition hover:bg-white/10 ${
              isActive(item.href) ? "bg-white/20" : ""
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-xs font-bold uppercase">
              {item.name[0]}
            </span>
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}