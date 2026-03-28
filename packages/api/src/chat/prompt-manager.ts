import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Prompt, AgentOutput } from "@avv/shared";

function generateId(): string {
  return crypto.randomUUID();
}

export function savePrompt(
  conversationId: string,
  title: string,
  content: string,
  agentsOutput: AgentOutput[],
): Prompt {
  const now = Date.now();
  const prompt: Prompt = {
    id: generateId(),
    conversationId,
    title,
    content,
    agentsOutput,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(schema.prompts)
    .values({
      id: prompt.id,
      conversationId: prompt.conversationId,
      title: prompt.title,
      content: prompt.content,
      agentsOutput: JSON.stringify(prompt.agentsOutput),
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
    })
    .run();

  return prompt;
}

export function getPrompt(id: string): Prompt | null {
  const row = db
    .select()
    .from(schema.prompts)
    .where(eq(schema.prompts.id, id))
    .get();

  if (!row) return null;

  return {
    id: row.id,
    conversationId: row.conversationId,
    title: row.title,
    content: row.content,
    agentsOutput: JSON.parse(row.agentsOutput),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function updatePromptContent(id: string, content: string): void {
  db.update(schema.prompts)
    .set({ content, updatedAt: Date.now() })
    .where(eq(schema.prompts.id, id))
    .run();
}

export function getPromptsForConversation(conversationId: string): Prompt[] {
  const rows = db
    .select()
    .from(schema.prompts)
    .where(eq(schema.prompts.conversationId, conversationId))
    .all();

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    title: r.title,
    content: r.content,
    agentsOutput: JSON.parse(r.agentsOutput),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
