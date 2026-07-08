"use client";

import { motion, useInView, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Animate when scrolled into view instead of on mount */
  inView?: boolean;
  /** Initial vertical offset in px */
  y?: number;
};

/** Fade + rise entrance. Use `inView` for below-the-fold sections. */
export function FadeUp({ children, className, delay = 0, inView = false, y = 24 }: RevealProps) {
  const viewportProps = inView
    ? { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" as const } }
    : { animate: { opacity: 1, y: 0 } };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      {...viewportProps}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: React.ReactNode;
  className?: string;
  /** Delay between each child in seconds */
  gap?: number;
  delay?: number;
  inView?: boolean;
};

/** Container that staggers its StaggerItem children. */
export function Stagger({ children, className, gap = 0.08, delay = 0, inView = true }: StaggerProps) {
  const viewportProps = inView
    ? { whileInView: "visible" as const, viewport: { once: true, margin: "-60px" as const } }
    : { animate: "visible" as const };

  return (
    <motion.div
      className={className}
      initial="hidden"
      {...viewportProps}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: gap, delayChildren: delay } }
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] } }
      }}
    >
      {children}
    </motion.div>
  );
}

/** Animated music equalizer bars — the "alive" signal for playing bots. */
export function Equalizer({ className, barClassName }: { className?: string; barClassName?: string }) {
  const reduced = useReducedMotion();
  const bars = [
    { scales: [0.4, 1, 0.5, 0.85, 0.4], duration: 1.0 },
    { scales: [0.9, 0.4, 1, 0.55, 0.9], duration: 1.3 },
    { scales: [0.5, 0.95, 0.45, 1, 0.5], duration: 1.1 },
    { scales: [1, 0.5, 0.8, 0.4, 1], duration: 1.4 }
  ];

  return (
    <span className={`flex items-end gap-0.5 ${className ?? "h-4"}`} aria-hidden>
      {bars.map((bar, index) => (
        <motion.span
          key={index}
          className={`w-1 origin-bottom rounded-full ${barClassName ?? "bg-emerald-400"}`}
          style={{ height: "100%" }}
          animate={reduced ? { scaleY: 0.6 } : { scaleY: bar.scales }}
          transition={reduced ? undefined : { duration: bar.duration, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/** Number that springs up from 0 when scrolled into view. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const spring = useSpring(0, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, (latest) => Math.round(latest).toString());

  useEffect(() => {
    if (isInView) {
      if (reduced) {
        spring.jump(value);
      } else {
        spring.set(value);
      }
    }
  }, [isInView, value, spring, reduced]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
