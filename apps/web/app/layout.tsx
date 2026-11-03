import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Prospecta", template: "%s · Prospecta" },
  description: "Captación y seguimiento de clientes",
  applicationName: "Prospecta",
  appleWebApp: { capable: true, title: "Prospecta", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/192" },
};

export const viewport: Viewport = {
  themeColor: "#0f1b2d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
