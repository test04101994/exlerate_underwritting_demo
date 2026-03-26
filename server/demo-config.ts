/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO / PRESENTATION CONFIG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Change these values to control how the demo runs.
 * No restart required if using ts-node watch / nodemon.
 *
 * AGENT_SPEED_MULTIPLIER
 *   Controls how fast agent steps execute across BOTH workflows.
 *   Applies to every step delay in jira-agent-steps.ts,
 *   insurance-agent-steps.ts, and the hardcoded progress delays in routes.ts.
 *
 *   0.25  →  Very fast  (great for internal testing, ~¼ speed)
 *   0.5   →  Fast       (quick walkthrough, ~½ speed)
 *   1.0   →  Normal     (standard pace, ~2–4 s per step)
 *   1.5   →  Slow       (comfortable for live demo, ~3–6 s per step)
 *   2.0   →  Very slow  (dramatic presentation, ~5–10 s per step)
 *
 * SANCTIONS_STEP_DELAY_MS
 *   Base delay (ms) between each sanctions-check progress step.
 *   Also multiplied by AGENT_SPEED_MULTIPLIER.
 *
 * DATA_VALIDATION_STEP_DELAY_MS
 *   Base delays (ms) array for the 6 data-validation progress steps.
 *   Also multiplied by AGENT_SPEED_MULTIPLIER.
 *
 * GENERIC_AGENT_STEP_DELAY_MS
 *   Base delays (ms) array for all other agent progress steps.
 *   Also multiplied by AGENT_SPEED_MULTIPLIER.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── PRIMARY KNOB — change this one value to speed up / slow down everything ──
export const AGENT_SPEED_MULTIPLIER = 3.0;

// ── Per-agent base delays (ms) — scaled by AGENT_SPEED_MULTIPLIER at runtime ─

/** Sanctions Check Agent: delays between each of the 6 progress steps */
export const SANCTIONS_STEP_DELAYS_MS = [1800, 2400, 2100, 2700, 1900, 1500];

/** Data Validation Agent: delays between each of the 6 progress steps */
export const DATA_VALIDATION_STEP_DELAYS_MS = [2200, 2800, 2400, 3100, 2000, 2600];

/** All other generic agents: delays between each of the 6 progress steps */
export const GENERIC_AGENT_STEP_DELAYS_MS = [2800, 3200, 2900, 3400, 2500, 3100];

// ── Chat / Communication Channel typewriter speed ─────────────────────────────
/**
 * CHAT_TYPEWRITER_TARGET_MS
 *   How long (ms) the typewriter effect should take to finish typing ONE message.
 *   The per-character delay is computed as: targetMs / message.length
 *   (clamped between MIN and MAX below).
 *
 *   1200   →  Fast    — default "auto" feel (~1.2 s per message)
 *   3000   →  Medium  — comfortable for live demo (~3 s per message)
 *   6000   →  Slow    — dramatic, every word visible (~6 s per message)
 *   10000  →  Very slow — great for presentations (~10 s per message)
 */
export const CHAT_TYPEWRITER_TARGET_MS = 8000;

/** Minimum ms per character (cap on how fast it can go) */
export const CHAT_TYPEWRITER_MIN_MS = 18;

/** Maximum ms per character (cap on how slow it can go) */
export const CHAT_TYPEWRITER_MAX_MS = 160;

// ── Server-side reading buffer ────────────────────────────────────────────────
/**
 * CHAT_READING_BUFFER_PER_CHAR_MS
 *   After each step message is sent, the server adds an extra delay of
 *   (message.length × this value) ms on top of the base delayMs.
 *   This prevents the next message from arriving before the user has finished
 *   reading the current one (typewriter + reading time).
 *
 *   0    →  Off — next message arrives at base delayMs only (messages overlap)
 *   8    →  Light — small buffer, messages still arrive quickly
 *   14   →  Medium — comfortable for live demo (default)
 *   22   →  Slow — dramatic, each message fully read before next appears
 */
export const CHAT_READING_BUFFER_PER_CHAR_MS = 28;
