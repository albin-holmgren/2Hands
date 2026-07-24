"use client";

import React from "react";
import { motion } from "framer-motion";

const T = "#D97757";  // terracotta
const SW = 1.5;       // default stroke width

/** Stroke draw: pathLength 0 → 1 */
const draw = (delay = 0, duration = 0.8, ease: string = "easeInOut") => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: {
    pathLength: { delay, duration, ease: ease as never },
    opacity: { delay, duration: 0.01 },
  },
});

/** Spring pop-in for circles/nodes */
const pop = (delay = 0) => ({
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { delay, type: "spring" as const, stiffness: 220, damping: 14 },
});

/** Simple fade */
const fade = (delay = 0, duration = 0.3) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { delay, duration },
});

// ─── Panel 1: Browser / Autonomous Research ──────────────────────────────────
export const BrowserAutomationPanel = () => (
  <div className="absolute inset-0 flex items-center justify-center p-6">
    <svg viewBox="0 0 500 280" className="w-full h-full" fill="none">

      {/* — Chrome — */}
      <motion.rect x="30" y="16" width="440" height="248" rx="12"
        stroke={T} strokeWidth={SW} {...draw(0, 0.9, "easeOut")} />
      <motion.line x1="30" y1="56" x2="470" y2="56"
        stroke={T} strokeWidth={SW} {...draw(0.35, 0.45)} />
      {[60, 85, 110].map((cx, i) => (
        <motion.circle key={cx} cx={cx} cy="36" r="7"
          stroke={T} strokeWidth={SW} {...pop(0.6 + i * 0.08)} />
      ))}
      <motion.rect x="140" y="27" width="280" height="20" rx="10"
        stroke={T} strokeWidth={SW} {...draw(0.65, 0.4)} />

      {/* — Page content lines — */}
      {[
        [60, 85,  190],
        [60, 110, 440],
        [60, 130, 370],
        [60, 165, 440],
        [60, 185, 300],
        [60, 215, 440],
        [60, 235, 255],
      ].map(([x1, y, x2], i) => (
        <motion.line key={y} x1={x1} y1={y} x2={x2} y2={y}
          stroke={T} strokeWidth={SW} strokeLinecap="round"
          {...draw(1.0 + i * 0.08, 0.3, "easeOut")} />
      ))}

      {/* — Agent scan path (the hero of this panel) — */}
      <motion.path
        d="M 140 110 C 310 110 410 128 385 165 C 360 188 175 183 155 215 C 135 240 325 238 385 238"
        stroke={T} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="4 6"
        {...draw(1.65, 1.8, "easeInOut")} />

      {/* — Endpoint dot with pulse ring — */}
      <motion.circle cx="385" cy="238" r="5" fill={T}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 3.55, type: "spring", stiffness: 260, damping: 12 }} />
      <motion.circle cx="385" cy="238" r="5"
        stroke={T} strokeWidth={1} fill="none"
        initial={{ scale: 1, opacity: 0.9 }}
        animate={{ scale: 3.2, opacity: 0 }}
        transition={{ delay: 4.0, duration: 1.1, repeat: Infinity, repeatDelay: 0.6, ease: "easeOut" }} />

    </svg>
  </div>
);

// ─── Panel 2: Deploy Agents / CRM Automation ─────────────────────────────────
export const DeployAgentsPanel = () => (
  <div className="absolute inset-0 flex items-center justify-center p-6">
    <svg viewBox="0 0 500 280" className="w-full h-full" fill="none">

      {/* — Source node — */}
      <motion.circle cx="70" cy="140" r="20"
        stroke={T} strokeWidth={SW} {...pop(0)} />

      {/* — Trunk line — */}
      <motion.line x1="90" y1="140" x2="170" y2="140"
        stroke={T} strokeWidth={SW} strokeLinecap="round"
        {...draw(0.35, 0.28)} />

      {/* — Fork branches (spread simultaneously) — */}
      <motion.path d="M 170 140 L 215 65"
        stroke={T} strokeWidth={SW} strokeLinecap="round" {...draw(0.62, 0.28)} />
      <motion.path d="M 170 140 L 215 140"
        stroke={T} strokeWidth={SW} strokeLinecap="round" {...draw(0.62, 0.22)} />
      <motion.path d="M 170 140 L 215 215"
        stroke={T} strokeWidth={SW} strokeLinecap="round" {...draw(0.62, 0.28)} />

      {/* — Agent circles (spring pop) — */}
      <motion.circle cx="232" cy="65"  r="17" stroke={T} strokeWidth={SW} {...pop(0.88)} />
      <motion.circle cx="232" cy="140" r="17" stroke={T} strokeWidth={SW} {...pop(0.96)} />
      <motion.circle cx="232" cy="215" r="17" stroke={T} strokeWidth={SW} {...pop(0.88)} />

      {/* — Output lines — */}
      <motion.line x1="249" y1="65"  x2="390" y2="65"
        stroke={T} strokeWidth={SW} strokeLinecap="round" {...draw(1.3, 0.35)} />
      <motion.line x1="249" y1="140" x2="390" y2="140"
        stroke={T} strokeWidth={SW} strokeLinecap="round" {...draw(1.38, 0.35)} />
      <motion.line x1="249" y1="215" x2="390" y2="215"
        stroke={T} strokeWidth={SW} strokeLinecap="round" {...draw(1.3, 0.35)} />

      {/* — Checkmarks (spring pop + draw) — */}
      {[
        { d: "M 373 54 L 381 65  L 400 48",  delay: 1.68 },
        { d: "M 373 129 L 381 140 L 400 123", delay: 1.76 },
        { d: "M 373 204 L 381 215 L 400 198", delay: 1.68 },
      ].map(({ d, delay }, i) => (
        <motion.path key={i} d={d}
          stroke={T} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { delay, duration: 0.32, ease: "easeOut" },
            opacity: { delay, duration: 0.01 },
          }} />
      ))}

    </svg>
  </div>
);

// ─── Panel 3: Orchestrate / Always-on Monitoring ─────────────────────────────
export const OrchestratePanel = () => {
  const nodeXs = [75, 195, 315, 435];
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <svg viewBox="0 0 500 280" className="w-full h-full" fill="none">

        {/* — Timeline — */}
        <motion.line x1="50" y1="140" x2="460" y2="140"
          stroke={T} strokeWidth={SW} strokeLinecap="round"
          {...draw(0, 0.85, "easeOut")} />
        <motion.path d="M 450 131 L 462 140 L 450 149"
          stroke={T} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
          {...draw(0.75, 0.2)} />

        {/* — Nodes + ticks + labels — */}
        {nodeXs.map((cx, i) => (
          <React.Fragment key={cx}>
            <motion.circle cx={cx} cy="140" r="11"
              stroke={T} strokeWidth={SW} {...pop(0.5 + i * 0.16)} />
            <motion.line x1={cx} y1="128" x2={cx} y2="74"
              stroke={T} strokeWidth={0.8} strokeLinecap="round"
              strokeDasharray="2.5 4"
              {...draw(0.7 + i * 0.16, 0.26)} />
            <motion.line
              x1={cx - 30} y1="68" x2={cx + 30} y2="68"
              stroke={T} strokeWidth={SW} strokeLinecap="round"
              {...draw(0.9 + i * 0.16, 0.26)} />
          </React.Fragment>
        ))}

        {/* — Recurring cycle arc (main story element) — */}
        <motion.path
          d="M 435 160 C 445 208 308 228 250 228 C 192 228 55 208 65 160"
          stroke={T} strokeWidth={SW} strokeLinecap="round"
          strokeDasharray="5 5"
          {...draw(2.1, 1.3, "easeInOut")} />

        {/* — Return arrow — */}
        <motion.path d="M 73 168 L 65 160 L 72 152"
          stroke={T} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
          {...draw(3.45, 0.22)} />

      </svg>
    </div>
  );
};

// ─── Panel 4: Integrate / Multi-agent Teams ───────────────────────────────────
const DEG = [0, 60, 120, 180, 240, 300];
const HUB = { cx: 250, cy: 140 };
const R_HUB = 24;
const R_SPOKE = 92;
const R_NODE = 13;

const spoke = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return {
    sx: Math.round(HUB.cx + R_HUB  * Math.cos(rad)),
    sy: Math.round(HUB.cy + R_HUB  * Math.sin(rad)),
    nx: Math.round(HUB.cx + R_SPOKE * Math.cos(rad)),
    ny: Math.round(HUB.cy + R_SPOKE * Math.sin(rad)),
  };
};

export const IntegratePanel = () => (
  <div className="absolute inset-0 flex items-center justify-center p-6">
    <svg viewBox="0 0 500 280" className="w-full h-full" fill="none">

      {/* — Hub ring — */}
      <motion.circle cx={HUB.cx} cy={HUB.cy} r={R_HUB}
        stroke={T} strokeWidth={SW} {...draw(0, 0.55)} />

      {/* — Hub center dot — */}
      <motion.circle cx={HUB.cx} cy={HUB.cy} r={6} fill={T} {...pop(0.6)} />

      {/* — Spokes + outer nodes — */}
      {DEG.map((deg, i) => {
        const { sx, sy, nx, ny } = spoke(deg);
        return (
          <React.Fragment key={deg}>
            <motion.line x1={sx} y1={sy} x2={nx} y2={ny}
              stroke={T} strokeWidth={SW} strokeLinecap="round"
              {...draw(0.5 + i * 0.1, 0.32)} />
            <motion.circle cx={nx} cy={ny} r={R_NODE}
              stroke={T} strokeWidth={SW} {...pop(0.72 + i * 0.1)} />
          </React.Fragment>
        );
      })}

      {/* — Pulse rings on alternating nodes — */}
      {[0, 120, 240].map((deg, i) => {
        const { nx, ny } = spoke(deg);
        return (
          <motion.circle key={deg} cx={nx} cy={ny} r={R_NODE}
            stroke={T} strokeWidth={1} fill="none"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{
              delay: 1.8 + i * 0.3,
              duration: 1.0,
              repeat: Infinity,
              repeatDelay: 1.5,
              ease: "easeOut",
            }} />
        );
      })}

    </svg>
  </div>
);
