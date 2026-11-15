import { LocaleRedirect } from "@/components/LocaleRedirect";
import "./globals.css";

/** Entry point "/": sends the visitor to the language they used last, or the one their browser prefers. */
export default function RootPage() {
  return (
    <html lang="en">
      <head>
        <title>Repo</title>
        <noscript>
          <meta httpEquiv="refresh" content="0; url=/en/" />
        </noscript>
      </head>
      <body>
        <LocaleRedirect />
      </body>
    </html>
  );
}
