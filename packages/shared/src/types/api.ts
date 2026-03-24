/** Success response with data */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Success response without data */
export interface ApiSuccessEmpty {
  success: true;
}

/** Error response */
export interface ApiError {
  success: false;
  error: string;
}

/** Standard API response wrapper — discriminated union on `success` */
export type ApiResponse<T = void> =
  | (T extends void ? ApiSuccessEmpty : ApiSuccess<T>)
  | ApiError;

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
