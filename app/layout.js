import "./globals.css";
import { PROPERTY } from "@/lib/config";

export const metadata = {
  title: `${PROPERTY.name} · Checkout Billing`,
  description: "On-site extras billing for villa guests",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sadhrana Bill",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#2f5d3a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
