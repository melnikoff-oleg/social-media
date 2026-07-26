import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/auth-context";
import { RouteGuard } from "@/components/route-guard";
import { ThemeProvider } from "@/context/theme-context";
import { Toaster } from "sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Hook Lab | Precision Content Strategy for Influencers & Brands",
  description: "Unlock your viral potential with The Hook Lab. Our AI analyzes winning content patterns to build the perfect strategy for your brand, website, and social media presence.",
  metadataBase: new URL("https://thehooklab.ai"), // Placeholder, update to actual domain
  openGraph: {
    title: "The Hook Lab - Data-Driven Content Strategy",
    description: "Stop guessing; start winning. Use AI to find the content strategy that crushes your niche.",
    url: "https://thehooklab.ai",
    siteName: "The Hook Lab",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "The Hook Lab - Strategy Lab",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Hook Lab | Content Strategy Engine",
    description: "AI-powered strategic analyzer for viral content.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/5.png",
    apple: "/5.png",
  },
};

// Blocking script: runs synchronously before paint to avoid theme flash
const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = (saved === 'dark' || saved === 'light') ? saved : (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
  } catch(e) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script to apply theme before first paint — prevents flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>
              <RouteGuard>
                {children}
              </RouteGuard>
              <Toaster closeButton position="top-right" expand={false} richColors duration={3000} />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
