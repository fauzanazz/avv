import type { ServerMessage, ClientMessage } from "@avv/shared";

export type { ServerMessage, ClientMessage };

export function handleWebSocketUpgrade() {
  throw new Error("handleWebSocketUpgrade is not yet implemented (see avv-agent-canvas-bridge)");
}
