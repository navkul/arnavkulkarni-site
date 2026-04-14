import type { Metadata } from "next";
import { format } from "date-fns";
import { IBM_Plex_Mono } from "next/font/google";
import { getSiteLastUpdated } from "@/lib/last-updated";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Arnav Kulkarni",
  description: "Personal website and portfolio",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteLastUpdated = await getSiteLastUpdated();

  return (
    <html lang="en">
      <body
        className={`${ibmPlexMono.variable} antialiased`}
      >
        {children}
        {siteLastUpdated ? (
          <footer className="border-t border-gray-200 bg-background">
            <div className="mx-auto max-w-5xl px-6 py-4">
              <p className="text-xs text-gray-500">
                Site last updated {format(new Date(siteLastUpdated), "MMMM d, yyyy")}
              </p>
            </div>
          </footer>
        ) : null}
      </body>
    </html>
  );
}
