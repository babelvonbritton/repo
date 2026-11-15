"use client";

import { MotionConfig } from "motion/react";
import { Workspace } from "./board/Workspace";
import { ErrorBoundary } from "./ErrorBoundary";
import { GlobalErrorHandlers } from "./GlobalErrorHandlers";
import { Toaster } from "./Toaster";
import { TrashFxProvider } from "./trash/TrashFx";

/** Client root: error handling and trash effects around the workspace (language comes from the route). */
export function BoardApp() {
  return (
    // "user" turns off movement animations for people whose system asks for reduced motion.
    <MotionConfig reducedMotion="user">
      <GlobalErrorHandlers />
      <ErrorBoundary>
        <TrashFxProvider>
          <Workspace />
        </TrashFxProvider>
      </ErrorBoundary>
      <Toaster />
    </MotionConfig>
  );
}
