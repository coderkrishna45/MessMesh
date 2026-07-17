import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "MessMesh - Smart Mess Management",
  description: "AI-powered hostel mess voting, waste forecasting, and leaderboard application",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full bg-slate-950">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full text-slate-100`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
