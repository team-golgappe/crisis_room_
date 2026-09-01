import "./globals.css";
import Splash from "../components/Splash";

export const metadata = {
  title: "Crisis Room — Multi-Agent Incident Command",
  description: "Four coordinated AI agents triage, investigate, decide, and fix production incidents automatically.",
};

const BG_VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=DotGothic16&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="bg" aria-hidden="true">
          <video className="bg-video" autoPlay muted loop playsInline preload="auto">
            <source src={BG_VIDEO_SRC} type="video/mp4" />
          </video>
          <div className="bg-scrim" />
        </div>
        <Splash />
        {children}
      </body>
    </html>
  );
}
