export interface Project {
  id: string;
  conversationId: string;
  promptId?: string;
  name: string;
  path: string;
  githubRepo?: string;
  createdAt: number;
}
