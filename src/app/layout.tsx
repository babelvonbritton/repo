import type { ReactNode } from "react";

/** Pass-through root: each route group renders its own <html> so the language can be set per page. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
