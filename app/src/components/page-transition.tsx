"use client";

import { usePathname } from "next/navigation";

/**
 * PageTransition — Forces page content to re-animate on every route change.
 *
 * Next.js App Router preserves layouts and only swaps page content,
 * which means CSS animations (animate-in, fade-in, etc.) only play once.
 * By using `key={pathname}`, React unmounts and remounts the wrapper div
 * on every navigation, which replays the entrance animation.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out fill-mode-both"
    >
      {children}
    </div>
  );
}
