"use client";

import { MotionConfig, motion } from "motion/react";

/**
 * Re-mounts on every route change, giving each page a soft fade-rise entrance.
 * MotionConfig honors the user's reduced-motion preference for all animations.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
