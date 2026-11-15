import "./globals.css";

/** Shown for any address that does not exist. */
export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <main className="grid min-h-dvh place-items-center px-6 text-center">
          <div>
            <p className="text-5xl font-semibold text-forest-900">404</p>
            <a href="/" className="mt-4 inline-block text-forest-700 underline underline-offset-4">Repo</a>
          </div>
        </main>
      </body>
    </html>
  );
}
