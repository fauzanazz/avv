import type { Session } from "@avv/shared";

class SessionStore {
  private sessions = new Map<string, Session>();

  create(prompt: string, mode: "simple" | "ultrathink"): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      prompt,
      mode,
      status: "idle",
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    return session ? { ...session } : undefined;
  }

  update(id: string, updates: Partial<Omit<Session, "id">>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.sessions.set(id, updated);
    return updated;
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }
}

export const sessionStore = new SessionStore();
