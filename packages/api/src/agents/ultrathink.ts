import { query } from "@anthropic-ai/claude-agent-sdk";
import { connectionStore } from "../store";
import { loadPrompt } from "./prompt-loader";

export interface UltraThinkQuestion {
  id: string;
  question: string;
  options?: string[];
}

/**
 * Generates clarifying questions based on the user's prompt.
 */
export async function generateQuestions(userPrompt: string): Promise<UltraThinkQuestion[]> {
  const systemPrompt = loadPrompt("ultrathink");
  let resultText = "";

  try {
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
  } catch (err) {
    console.error("[UltraThink] Failed to generate questions:", err);
  }

  try {
    const match = resultText.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed: unknown[] = JSON.parse(match[0]);
      const validated = parsed
        .filter((item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null &&
          typeof (item as Record<string, unknown>).id === "string" &&
          typeof (item as Record<string, unknown>).question === "string"
        )
        .map((item) => ({
          id: item.id as string,
          question: item.question as string,
          options: Array.isArray(item.options) && item.options.every((o: unknown) => typeof o === "string")
            ? (item.options as string[])
            : undefined,
        }));
      if (validated.length > 0) {
        return validated;
      }
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

  try {
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
  } catch (err) {
    console.error("[UltraThink] Failed to generate spec:", err);
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
