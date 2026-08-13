import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Survivor Pool Strategizer",
    description: "A transparent shared decision board for two partners managing a survivor pool portfolio.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Pick together. Keep one alive.",
      description: "Transparent weekly strategy for two partners.",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Survivor Pool Strategizer" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Pick together. Keep one alive.",
      description: "Transparent weekly strategy for two partners.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
