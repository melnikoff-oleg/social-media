"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import {
  Drama,
  Megaphone,
  Microscope,
  Clapperboard,
  FlaskConical,
  Network,
  KeyRound,
  Gem,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Sun,
  Moon,
  Component
} from "lucide-react";

export const navItems = [
  { title: "Creators", href: "/creators", icon: <Drama /> },
  { title: "Ads Library", href: "/ads-library", icon: <Megaphone /> },
  { title: "Deep Analyzer", href: "/analyze", icon: <Microscope /> },
  { title: "Videos", href: "/videos", icon: <Clapperboard /> },
  { title: "Content Mix", href: "/content-mix", icon: <FlaskConical /> },
  { title: "Templates", href: "/templates", icon: <Network /> },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isMobileMenuOpen]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-40 w-full font-sans transition-all duration-300 ${scrolled ? "bg-background/80 backdrop-blur-md border-b border-border/50 shadow-sm" : "bg-background border-b border-border/10"}`}>
        <div className="mx-auto px-4 max-w-[1920px] sm:px-6">
          <div className="flex h-16 sm:h-20 items-center justify-between relative">

            {/* Left: Brand Logo */}
            <Link href="/" className="flex items-center group z-50 relative border-0 outline-none">
              <div className="flex flex-col">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground leading-tight">
                  The<span className="text-orange-500">Hook</span>Lab
                </h1>
                <span className="hidden sm:inline text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                  AI Intelligence
                </span>
              </div>
            </Link>

            {/* Center: Desktop Dock (Apple Style) */}
            <div className="hidden xl:flex absolute left-1/2 transform -translate-x-1/2 bottom-0 justify-center items-end h-full pb-3 z-50">
              <Dock>
                {navItems.map((link) => (
                  <DockIcon
                    key={link.href}
                    link={link}
                    active={isActive(link.href)}
                  />
                ))}
              </Dock>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 sm:gap-4 z-50 relative">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="hidden lg:flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer border-0 outline-none"
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* Billing */}
              <Link
                href="/pricing"
                className="hidden lg:flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 transition-all cursor-pointer border-0 outline-none"
                title="Plan & Billing"
              >
                <Gem className="h-5 w-5" />
              </Link>

              {/* Settings */}
              <Link
                href="/settings"
                className="hidden lg:flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-all group cursor-pointer border-0 outline-none"
                title="Settings & API Keys"
              >
                <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.3 }}>
                  <KeyRound className="h-5 w-5" />
                </motion.div>
              </Link>

              {/* User Avatar & Logout */}
              {user && (
                <div className="hidden lg:flex items-center gap-3 bg-muted/30 pl-2 pr-3 py-1.5 rounded-full border border-border/50 mx-2">
                  <Link href="/profile" className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 text-orange-500 text-xs font-black shadow-sm shrink-0 hover:scale-105 transition-transform cursor-pointer border-0 outline-none">
                    {user.fullName?.charAt(0).toUpperCase()}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex justify-center items-center text-muted-foreground hover:text-red-500 transition-colors cursor-pointer border-0 outline-none"
                    title="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="xl:hidden p-2 text-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer border-0 outline-none"
                aria-label="Menu"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer so content isn't hidden under the fixed nav */}
      <div className="h-16 sm:h-20 w-full shrink-0 block" />

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm xl:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute right-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-background shadow-2xl flex flex-col pt-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col h-full">
                {/* Mobile Header */}
                <div className="px-6 py-6 bg-muted/20 border-b border-border/50">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500 border border-orange-500/20">
                        <span className="font-black text-xl">{user?.fullName?.charAt(0).toUpperCase() || "H"}</span>
                      </div>
                      <div>
                        <h3 className="font-extrabold text-foreground text-lg leading-tight truncate max-w-[140px]">
                          {user?.fullName || "TheHookLab"}
                        </h3>
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">AI Studio</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="p-2 bg-muted/50 text-muted-foreground rounded-full hover:bg-muted transition cursor-pointer border-0 outline-none"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href="/settings"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 outline-none"
                    >
                      <KeyRound className="h-4 w-4" /> Preferences
                    </Link>
                    <button onClick={toggleTheme} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground cursor-pointer border-0 outline-none">
                      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Mobile Links */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
                  {navItems.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-all border-0 outline-none ${isActive(link.href)
                          ? "bg-orange-500 text-white shadow-md shadow-orange-500/20 font-bold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`flex [&>svg]:h-5 [&>svg]:w-5 ${isActive(link.href) ? "opacity-100" : "opacity-70"}`}>
                          {link.icon}
                        </span>
                        <span className="text-sm sm:text-base tracking-wide">{link.title}</span>
                      </div>
                      {isActive(link.href) && <ChevronRight className="h-4 w-4 opacity-80" />}
                    </Link>
                  ))}

                  <Link
                    href="/pricing"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-all mt-4 border-0 outline-none ${isActive("/pricing") ? "bg-orange-500 text-white shadow-md shadow-orange-500/20 font-bold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex [&>svg]:h-5 [&>svg]:w-5 opacity-70`}>
                        <Gem />
                      </span>
                      <span className="text-sm sm:text-base tracking-wide">Billing & Plans</span>
                    </div>
                  </Link>
                </div>

                {/* Mobile Footer */}
                <div className="border-t border-border/50 pb-safe">
                  <div className="p-4 flex items-center justify-between">
                    <Link
                      href="/profile"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest hover:text-orange-500 transition-colors cursor-pointer border-0 outline-none"
                    >
                      View Profile
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-400 transition cursor-pointer border-0 outline-none"
                    >
                      <LogOut className="h-4 w-4" /> Logout
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ----------------- Apple Dock Animation Components -----------------

const Dock = ({ children }: { children: React.ReactNode }) => {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className="flex items-center h-[70px] gap-2 px-3 mx-auto"
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as any, { mouseX }) : child
      )}
    </motion.div>
  );
};

const DockIcon = ({ mouseX, link, active }: { mouseX?: any; link: any; active: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Create a fallback motion value if mouseX is missing
  const mouseXValue = mouseX || { get: () => Infinity, onChange: () => () => { } };

  // Calculate distance from mouse
  const distance = useTransform(mouseXValue, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // Smooth width/height transformation (Subtler scale: 40 -> 70)
  const widthSync = useTransform(distance, [-150, 0, 150], [40, 70, 40]);
  const width = useSpring(widthSync, { mass: 0.1, stiffness: 150, damping: 12 });

  // Icon size roughly proportional to container
  const iconSize = useTransform(width, [40, 70], [20, 32]);

  // Tooltip visibility
  const [hovered, setHovered] = useState(false);

  // Add translateY to move icon down on hover
  const yOffset = useTransform(distance, [-150, 0, 150], [0, 8, 0]);
  const y = useSpring(yOffset, { mass: 0.1, stiffness: 150, damping: 12 });

  const content = (
    <div className="flex flex-col items-center gap-1.5 group">
      <motion.div
        ref={ref}
        style={{
          width,
          height: width,
          y,
          transformOrigin: 'top center'
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`relative flex items-center justify-center rounded-2xl shadow-sm transition-colors duration-200 border cursor-pointer ${active
          ? "bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/20"
          : "bg-muted/80 backdrop-blur-md border-border/40 text-muted-foreground hover:bg-muted hover:border-border hover:shadow-md"
          }`}
      >

        <motion.div style={{ fontSize: iconSize }} className="flex items-center justify-center [&>svg]:w-[1em] [&>svg]:h-[1em]">
          {link.icon}
        </motion.div>
      </motion.div>

      {/* Always visible label - scales on hover */}
      <span className={`font-semibold transition-all whitespace-nowrap ${hovered ? "text-[11px] font-bold" : "text-[9px]"
        } ${active ? "text-orange-500" : "text-muted-foreground group-hover:text-foreground"
        }`}>
        {link.title}
      </span>
    </div>
  );

  return (
    <Link href={link.href} className="flex flex-col items-center group border-0 outline-none">
      {content}
    </Link>
  );
};
