# AVV UltraThink Mode — Interactive Questionnaire

## Context

UltraThink mode is the thorough alternative to Simple mode. Instead of auto-enriching, it asks the user 3-5 targeted questions via a chat panel, builds a design spec from their answers, and then triggers generation. This produces higher-quality results because the user's intent is clarified before any generation begins.

## Requirements

- Chat panel UI that appears when UltraThink mode is selected
- Backend generates clarifying questions based on the prompt
- User answers questions in the chat panel
- After answers are collected, a design spec is generated
- The spec is used as the enriched prompt for the orchestrator
- New WebSocket message types for the questionnaire flow

## Implementation

### New WebSocket message types

File: `packages/shared/src/types/ws.ts` — add to existing unions:

Add to `ServerMessage`:
```typescript
  | { type: "ultrathink:question"; questionId: string; question: string; options?: string[] }
  | { type: "ultrathink:spec"; spec: string }
  | { type: "ultrathink:ready"; enrichedPrompt: string }
```

Add to `ClientMessage`:
```typescript
  | { type: "ultrathink:answer"; questionId: string; answer: string }
  | { type: "ultrathink:confirm" }
```

### UltraThink questionnaire agent

File: `packages/api/src/agents/ultrathink.ts`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { connectionStore } from "../store";

function loadSystemPrompt(name: string): string {
  const promptPath = join(import.meta.dir, "..", "..", "prompts", `${name}.md`);
  return readFileSync(promptPath, "utf-8");
}

export interface UltraThinkQuestion {
  id: string;
  question: string;
  options?: string[];
}

/**
 * Generates clarifying questions based on the user's prompt.
 */
export async function generateQuestions(userPrompt: string): Promise<UltraThinkQuestion[]> {
  const systemPrompt = loadSystemPrompt("ultrathink");
  let resultText = "";

  for await (const message of query({
    prompt: `${systemPrompt}

## User's prompt:
"${userPrompt}"

Generate 3-5 clarifying questions as a JSON array:
[
  { "id": "q1", "question": "Question text?", "options": ["Option A", "Option B"] }
]

options is optional — only include for multiple-choice questions.
Output ONLY the JSON array.`,
    options: {
      allowedTools: [],
      maxTurns: 1,
      model: "haiku",
    },
  })) {
    if ("result" in message) {
      resultText = message.result;
    }
  }

  try {
    const match = resultText.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]) as UltraThinkQuestion[];
    }
  } catch {
    // Fallback questions
  }

  return [
    { id: "q1", question: "What is the primary purpose of this page?", options: ["Marketing/Landing", "Dashboard/App", "Documentation", "E-commerce"] },
    { id: "q2", question: "What visual style do you prefer?", options: ["Clean & Minimal", "Bold & Colorful", "Dark & Moody", "Warm & Friendly"] },
    { id: "q3", question: "Who is the target audience?" },
  ];
}

/**
 * Generates a design spec from the prompt + user answers.
 */
export async function generateSpec(
  userPrompt: string,
  answers: Map<string, string>
): Promise<string> {
  const answersText = Array.from(answers.entries())
    .map(([qId, answer]) => `- ${qId}: ${answer}`)
    .join("\n");

  let specText = "";

  for await (const message of query({
    prompt: `You are a UI/UX design specialist. Based on the user's request and their answers to clarifying questions, write a detailed design specification.

## User's request:
"${userPrompt}"

## User's answers:
${answersText}

Write a comprehensive design spec (300-500 words) covering:
- Page structure and sections
- Visual style, colors, typography
- Layout patterns
- Content tone and key messaging
- Component hierarchy

Output ONLY the spec text — no JSON, no markdown headers.`,
    options: {
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    if ("result" in message) {
      specText = message.result;
    }
  }

  return specText || userPrompt;
}

/**
 * Runs the full UltraThink flow for a session.
 */
export async function runUltraThinkFlow(
  sessionId: string,
  userPrompt: string,
  answerCallback: () => Promise<Map<string, string>>
): Promise<string> {
  // Step 1: Generate and send questions
  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "ultrathink",
    message: "Analyzing your request and preparing questions...",
  });

  const questions = await generateQuestions(userPrompt);

  for (const q of questions) {
    connectionStore.broadcast(sessionId, {
      type: "ultrathink:question",
      questionId: q.id,
      question: q.question,
      options: q.options,
    });
  }

  // Step 2: Wait for answers (the caller provides them via callback)
  const answers = await answerCallback();

  // Step 3: Generate spec
  connectionStore.broadcast(sessionId, {
    type: "agent:log",
    agentId: "ultrathink",
    message: "Generating design specification from your answers...",
  });

  const spec = await generateSpec(userPrompt, answers);

  connectionStore.broadcast(sessionId, {
    type: "ultrathink:spec",
    spec,
  });

  connectionStore.broadcast(sessionId, {
    type: "ultrathink:ready",
    enrichedPrompt: spec,
  });

  return spec;
}
```

### UltraThink system prompt

File: `packages/api/prompts/ultrathink.md`

```markdown
# AVV UltraThink Questionnaire Agent

You generate clarifying questions to help understand what the user wants to build. Your questions should fill the biggest knowledge gaps for generating a great UI.

## Question categories (pick 3-5 most relevant):

1. **Purpose**: What is the page for? (marketing, app, docs, portfolio)
2. **Audience**: Who will use it? (developers, consumers, enterprise)
3. **Style**: Visual preferences (minimal, bold, dark, playful)
4. **Content**: What key sections or information must be included?
5. **Reference**: Any sites or apps they want it to feel like?
6. **Branding**: Colors, logo style, brand personality
7. **Functionality**: Any interactive elements needed?

## Rules:
- Ask 3-5 questions maximum
- Make questions specific to the user's prompt, not generic
- Include multiple-choice options when the answer space is bounded
- Leave questions open-ended when creativity is needed
- Order from most impactful to least impactful
```

### Answer collector in WebSocket handler

File: `packages/api/src/ws.ts` — add UltraThink answer collection:

Add a per-session answer accumulator:

```typescript
import { runUltraThinkFlow } from "./agents/ultrathink";

/** Pending answer resolvers per session */
const pendingAnswers = new Map<string, {
  answers: Map<string, string>;
  resolve: (answers: Map<string, string>) => void;
  expectedCount: number;
}>();

// In handleClientMessage, add case for ultrathink:answer:
case "ultrathink:answer": {
  const pending = pendingAnswers.get(ws.data.sessionId ?? "");
  if (pending) {
    pending.answers.set(msg.questionId, msg.answer);
  }
  break;
}

case "ultrathink:confirm": {
  const pending = pendingAnswers.get(ws.data.sessionId ?? "");
  if (pending) {
    pending.resolve(pending.answers);
    pendingAnswers.delete(ws.data.sessionId ?? "");
  }
  break;
}
```

In the `generate` case, when mode is ultrathink:

```typescript
case "generate": {
  const session = sessionStore.create(msg.prompt, msg.mode);
  connectionStore.add(session.id, ws);
  ws.data.sessionId = session.id;

  connectionStore.send(ws, { type: "session:started", sessionId: session.id });

  if (msg.mode === "ultrathink") {
    // Create answer callback
    const answerPromise = new Promise<Map<string, string>>((resolve) => {
      pendingAnswers.set(session.id, {
        answers: new Map(),
        resolve,
        expectedCount: 5,
      });
    });

    runUltraThinkFlow(session.id, msg.prompt, () => answerPromise)
      .then((enrichedPrompt) => {
        return orchestrate({ prompt: enrichedPrompt, mode: "ultrathink", sessionId: session.id });
      })
      .catch((err) => {
        console.error("[UltraThink] Failed:", err);
        connectionStore.send(ws, { type: "error", message: "UltraThink flow failed" });
      });
  } else {
    orchestrate({ prompt: msg.prompt, mode: msg.mode, sessionId: session.id })
      .catch((err) => {
        console.error("[Orchestrate] Fatal:", err);
        connectionStore.send(ws, { type: "error", message: "Generation failed" });
      });
  }
  break;
}
```

### Chat panel UI

File: `packages/web/src/components/ChatPanel.tsx`

```typescript
import { useState, useEffect } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";

interface Question {
  questionId: string;
  question: string;
  options?: string[];
}

interface ChatPanelProps {
  isOpen: boolean;
  questions: Question[];
  spec: string | null;
  onAnswer: (questionId: string, answer: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function ChatPanel({ isOpen, questions, spec, onAnswer, onConfirm, onClose }: ChatPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.questionId]);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-white border-l border-slate-200 flex flex-col z-50 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">UltraThink Mode</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {questions.map((q) => (
          <div key={q.questionId} className="space-y-2">
            <p className="text-sm font-medium text-slate-700">{q.question}</p>

            {q.options ? (
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setAnswers((prev) => ({ ...prev, [q.questionId]: opt }));
                      onAnswer(q.questionId, opt);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      answers[q.questionId] === opt
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                placeholder="Your answer..."
                value={answers[q.questionId] || ""}
                onChange={(e) => {
                  setAnswers((prev) => ({ ...prev, [q.questionId]: e.target.value }));
                  onAnswer(q.questionId, e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        ))}

        {spec && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-medium text-slate-500 mb-1">Generated Spec:</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{spec}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {allAnswered && !spec && (
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={onConfirm}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Generate Design
          </button>
        </div>
      )}
    </div>
  );
}
```

### Wire ChatPanel into App.tsx

Add to App.tsx state and message handling:

```typescript
// Add state
const [chatOpen, setChatOpen] = useState(false);
const [questions, setQuestions] = useState<Question[]>([]);
const [spec, setSpec] = useState<string | null>(null);

// Add to onMessage callback:
if (msg.type === "ultrathink:question") {
  setChatOpen(true);
  setQuestions((prev) => [...prev, { questionId: msg.questionId, question: msg.question, options: msg.options }]);
}
if (msg.type === "ultrathink:spec") {
  setSpec(msg.spec);
}

// Add handlers
const handleAnswer = (questionId: string, answer: string) => {
  send({ type: "ultrathink:answer", questionId, answer });
};
const handleConfirm = () => {
  send({ type: "ultrathink:confirm" });
};

// Add ChatPanel to JSX (inside the canvas area div, after <Tldraw>):
<ChatPanel
  isOpen={chatOpen}
  questions={questions}
  spec={spec}
  onAnswer={handleAnswer}
  onConfirm={handleConfirm}
  onClose={() => setChatOpen(false)}
/>
```

## Testing Strategy

```bash
# Start both servers
pnpm dev

# 1. Open http://localhost:5173
# 2. Type "dashboard for analytics" in prompt bar
# 3. Select "UltraThink" mode
# 4. Click Generate
# 5. Chat panel should slide in from the right with 3-5 questions
# 6. Answer each question (click options or type)
# 7. Click "Generate Design"
# 8. Status bar shows spec generation
# 9. Components appear on canvas with higher quality than Simple mode
```

## Out of Scope

- Saving/loading UltraThink specs
- Editing the spec before generation
- Multi-round questionnaire (follow-up questions)
