import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { ServerMessage, PromptBuilderAgent } from "@avv/shared";
import { loadPrompt, loadSpecialist, loadSkills } from "../agents/prompt-loader";

export interface PromptBuilderResult {
  mergedPrompt: string;
  agentsOutput: Record<string, string>;
}

export interface RunPromptBuilderOptions {
  conversationId: string;
  userRequest: string;
  onMessage: (msg: ServerMessage) => void;
}

const activeAborts = new Map<string, AbortController>();

interface SpecialistConfig {
  name: PromptBuilderAgent;
  label: string;
  systemPrompt: string;
  taskPrompt: (userRequest: string) => string;
}

function getSpecialists(): SpecialistConfig[] {
  return [
    {
      name: "design-engineer",
      label: "Design Engineer",
      systemPrompt: loadSpecialist("design-engineer") + "\n\n## Reference Skills\n\n" + loadSkills("design-intent", "color-and-type", "quality-baseline"),
      taskPrompt: (req) =>
        `Analyze this project request and produce a detailed design system specification:\n\n"${req}"\n\nOutput ONLY the design system spec — colors, typography, spacing, shadows, visual identity. Be specific with hex values, font names, and sizes.`,
    },
    {
      name: "ux-engineer",
      label: "UX Engineer",
      systemPrompt: loadSpecialist("ux-engineer") + "\n\n## Reference Skills\n\n" + loadSkills("design-intent", "quality-baseline"),
      taskPrompt: (req) =>
        `Analyze this project request and produce a detailed layout specification:\n\n"${req}"\n\nOutput ONLY the layout spec — page sections, component hierarchy, responsive breakpoints, navigation structure. Be specific about HTML structure.`,
    },
    {
      name: "animation-engineer",
      label: "Animation Engineer",
      systemPrompt: loadSpecialist("animation-engineer") + "\n\n## Reference Skills\n\n" + loadSkills("animation-craft", "quality-baseline"),
      taskPrompt: (req) =>
        `Analyze this project request and produce animation specifications for a React + Framer Motion project:\n\n"${req}"\n\nOutput ONLY animation specs — scroll animations, hover effects, transitions, entrance/exit animations. Reference Framer Motion components, props, and hooks.`,
    },
    {
      name: "artist-engineer",
      label: "Artist Engineer",
      systemPrompt: loadSpecialist("artist-engineer") + "\n\n## Reference Skills\n\n" + loadSkills("design-intent", "color-and-type", "quality-baseline"),
      taskPrompt: (req) =>
        `Analyze this project request and produce visual asset specifications:\n\n"${req}"\n\nOutput ONLY asset specs. Include ALL of the following:\n- Hero images/backgrounds (CSS textures, SVG noise, or image generation prompts)\n- Icons and iconography (style, stroke weight, per-icon descriptions, anti-patterns)\n- Section illustrations or photography (with generation prompts, style direction, negative prompts)\n- Open Graph / social share image (1200×630 spec)\n- Favicon / touch icons (SVG, 180×180, 32×32 specs)\n- Any intentionally omitted assets with reasoning\n\nProvide detailed, implementation-ready specifications.`,
    },
    {
      name: "typewriter",
      label: "Typewriter",
      systemPrompt: loadSpecialist("typewriter") + "\n\n## Reference Skills\n\n" + loadSkills("design-intent"),
      taskPrompt: (req) =>
        `Analyze this project request and produce all text content:\n\n"${req}"\n\nOutput ONLY the copy — headlines, subheadings, body text, CTAs, navigation labels, footer text. Match the brand tone.`,
    },
  ];
}

/**
 * Run each specialist in parallel as a direct query() call,
 * then merge outputs with an orchestrator call.
 */
export async function runPromptBuilder({
  conversationId,
  userRequest,
  onMessage,
}: RunPromptBuilderOptions): Promise<PromptBuilderResult> {
  const abort = new AbortController();
  activeAborts.set(conversationId, abort);

  const specialists = getSpecialists();
  const agentsOutput: Record<string, string> = {};

  try {
    // Run all specialists in parallel
    onMessage({
      type: "agent:activity",
      agent: "orchestrator",
      status: `Delegating to ${specialists.length} specialists in parallel`,
    });

    const results = await Promise.allSettled(
      specialists.map((spec) =>
        runSpecialist(spec, userRequest, abort.signal, (agent, status) => {
          onMessage({ type: "agent:activity", agent, status });
        }),
      ),
    );

    // Collect outputs
    for (let i = 0; i < specialists.length; i++) {
      const result = results[i];
      const spec = specialists[i];
      if (result.status === "fulfilled" && result.value) {
        agentsOutput[spec.name] = result.value;
        onMessage({
          type: "prompt:building",
          agent: spec.name,
          output: result.value,
        });
        onMessage({
          type: "agent:activity",
          agent: spec.name,
          status: "done",
        });
      } else {
        onMessage({
          type: "agent:activity",
          agent: spec.name,
          status: result.status === "rejected" ? `failed: ${result.reason}` : "no output",
        });
      }
    }

    if (abort.signal.aborted) {
      return { mergedPrompt: "", agentsOutput };
    }

    // Merge with orchestrator
    onMessage({
      type: "agent:activity",
      agent: "orchestrator",
      status: "Merging specialist outputs into comprehensive prompt",
    });

    const mergedPrompt = await runMerger(userRequest, agentsOutput, abort.signal, (text) => {
      onMessage({
        type: "chat:text",
        conversationId,
        content: text,
        streaming: true,
      });
    });

    onMessage({ type: "chat:done", conversationId, messageId: "" });

    return { mergedPrompt, agentsOutput };
  } catch (err: unknown) {
    if (!abort.signal.aborted) {
      onMessage({
        type: "chat:error",
        conversationId,
        error: err instanceof Error ? err.message : "Prompt builder failed",
      });
    }
    return { mergedPrompt: "", agentsOutput };
  } finally {
    activeAborts.delete(conversationId);
  }
}

export function cancelPromptBuilder(conversationId: string): void {
  const abort = activeAborts.get(conversationId);
  if (abort) {
    abort.abort();
    activeAborts.delete(conversationId);
  }
}

export function isPromptBuilderRunning(conversationId: string): boolean {
  return activeAborts.has(conversationId);
}

// ── Specialist Runner ────────────────────────────────────────

async function runSpecialist(
  spec: SpecialistConfig,
  userRequest: string,
  signal: AbortSignal,
  onStatus: (agent: PromptBuilderAgent, status: string) => void,
): Promise<string> {
  onStatus(spec.name, "working");

  const abort = new AbortController();
  signal.addEventListener("abort", () => abort.abort());

  const options: Options = {
    abortController: abort,
    persistSession: false,
    systemPrompt: spec.systemPrompt,
    tools: [], // Specialists generate text only — no tools needed
  };

  const q = query({ prompt: spec.taskPrompt(userRequest), options });
  let output = "";

  for await (const msg of q) {
    if (signal.aborted) { q.close(); break; }

    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") output += block.text;
      }
    }
    if (msg.type === "result" && msg.subtype === "success") {
      if (msg.result) output = msg.result;
    }
  }

  return output;
}

// ── Merger / Orchestrator ────────────────────────────────────

async function runMerger(
  userRequest: string,
  agentsOutput: Record<string, string>,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<string> {
  const abort = new AbortController();
  signal.addEventListener("abort", () => abort.abort());

  const orchestratorPrompt = loadPrompt("prompt-orchestrator");

  const sections = Object.entries(agentsOutput)
    .map(([agent, output]) => `## ${agent}\n\n${output}`)
    .join("\n\n---\n\n");

  const prompt = `User request: "${userRequest}"

The following specialist agents have produced their outputs. Merge them into a single, comprehensive code generation prompt that a frontend engineer can implement directly.

${sections}

---

Produce the FINAL merged prompt now. It should be complete and ready for implementation.`;

  const options: Options = {
    abortController: abort,
    includePartialMessages: true,
    persistSession: false,
    systemPrompt: orchestratorPrompt,
    tools: [], // Merger only generates text
  };

  const q = query({ prompt, options });
  let merged = "";

  for await (const msg of q) {
    if (signal.aborted) { q.close(); break; }

    if (msg.type === "stream_event") {
      const event = msg.event;
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        merged += event.delta.text;
        onText(event.delta.text);
      }
    }
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && !merged) merged = block.text;
      }
    }
    if (msg.type === "result" && msg.subtype === "success") {
      if (msg.result && !merged) merged = msg.result;
    }
  }

  return merged;
}
