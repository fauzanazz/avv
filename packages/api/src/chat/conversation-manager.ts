import { eq, desc } from "drizzle-orm";
import { db, schema } from "../db";
import type {
  Conversation,
  ConversationSummary,
  Message,
  MessageRole,
  MessageMetadata,
} from "@avv/shared";

function generateId(): string {
  return crypto.randomUUID();
}

// ── Conversations ────────────────────────────────────────────

export function createConversation(title = "New conversation"): Conversation {
  const now = Date.now();
  const convo: Conversation = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.conversations).values(convo).run();
  return convo;
}

export function getConversation(id: string): Conversation | null {
  const row = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  return row ?? null;
}

export function listConversations(): ConversationSummary[] {
  const rows = db
    .select()
    .from(schema.conversations)
    .orderBy(desc(schema.conversations.updatedAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt,
  }));
}

export function renameConversation(id: string, title: string): void {
  db.update(schema.conversations)
    .set({ title, updatedAt: Date.now() })
    .where(eq(schema.conversations.id, id))
    .run();
}

export function deleteConversation(id: string): void {
  db.delete(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .run();
}

// ── Messages ─────────────────────────────────────────────────

export function appendMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  metadata?: MessageMetadata,
): Message {
  const msg: Message = {
    id: generateId(),
    conversationId,
    role,
    content,
    metadata,
    createdAt: Date.now(),
  };
  db.insert(schema.messages)
    .values({
      id: msg.id,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: msg.createdAt,
    })
    .run();

  // Touch conversation
  db.update(schema.conversations)
    .set({ updatedAt: Date.now() })
    .where(eq(schema.conversations.id, conversationId))
    .run();

  return msg;
}

export function getMessages(conversationId: string): Message[] {
  const rows = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt)
    .all();

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    role: r.role as MessageRole,
    content: r.content,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    createdAt: r.createdAt,
  }));
}

export function updateMessageContent(id: string, content: string): void {
  db.update(schema.messages)
    .set({ content })
    .where(eq(schema.messages.id, id))
    .run();
}

export function updateMessageMetadata(id: string, metadata: MessageMetadata): void {
  db.update(schema.messages)
    .set({ metadata: JSON.stringify(metadata) })
    .where(eq(schema.messages.id, id))
    .run();
}
