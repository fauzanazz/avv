/**
 * Smart Router — classifies user messages to determine routing.
 *
 * "build" → prompt builder agent team (design/create requests)
 * "chat"  → direct Claude Agent SDK (questions, debugging, code changes)
 */

export type Route = "build" | "chat";

// Keywords that strongly suggest a build/design request
const BUILD_KEYWORDS = [
  "build me",
  "create a",
  "design a",
  "make a",
  "generate a",
  "build a",
  "create me",
  "make me",
  "landing page",
  "website",
  "web app",
  "dashboard",
  "portfolio",
  "homepage",
  "saas",
  "hero section",
  "component",
  "ui for",
  "interface for",
  "layout for",
  "page for",
  "screen for",
];

// Keywords that strongly suggest a chat/code request
const CHAT_KEYWORDS = [
  "fix",
  "debug",
  "error",
  "bug",
  "why is",
  "how do",
  "what is",
  "explain",
  "refactor",
  "change the",
  "update the",
  "modify",
  "help me",
  "question",
  "can you",
  "show me",
];

/**
 * Classify a user message as "build" or "chat" using keyword heuristics.
 * Falls back to "chat" if uncertain — safer to chat than to trigger
 * the full prompt builder team unnecessarily.
 */
export function classifyMessage(message: string): Route {
  const lower = message.toLowerCase().trim();

  // Score-based: count keyword matches
  let buildScore = 0;
  let chatScore = 0;

  for (const kw of BUILD_KEYWORDS) {
    if (lower.includes(kw)) buildScore++;
  }
  for (const kw of CHAT_KEYWORDS) {
    if (lower.includes(kw)) chatScore++;
  }

  // Strong signal: if the message starts with a build-like intent
  if (/^(build|create|design|make|generate)\b/i.test(lower)) {
    buildScore += 3;
  }

  // Strong signal: if asking a question
  if (lower.endsWith("?")) {
    chatScore += 2;
  }

  if (buildScore > chatScore) return "build";
  return "chat";
}
