export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GenerateRequest {
  prompt: string;
  mode: "simple" | "ultrathink";
  sessionId?: string;
}

export interface Session {
  id: string;
  prompt: string;
  mode: "simple" | "ultrathink";
  status: "idle" | "generating" | "done" | "error";
  createdAt: string;
}
