import { useState, useRef, useEffect, useCallback } from "react";
import type { ServerMessage, ClientMessage } from "@avv/shared";
import { saveSession, loadSession, clearAll, type ChatEntry } from "../../utils/session-persistence";

type ChatMessage = Omit<ChatEntry, "timestamp"> & { timestamp: Date };

interface RightPanelProps {
  messages: ServerMessage[];
  isConnected: boolean;
  sessionId: string | null;
  onSend: (msg: ClientMessage) => void;
  onClose: () => void;
}

export function RightPanel({ messages, isConnected, sessionId, onSend, onClose }: RightPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"simple" | "ultrathink">("simple");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted session on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved && saved.chatHistory.length > 0) {
      setChatHistory(saved.chatHistory.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      setMode(saved.mode);
      if (saved.sessionId) setHasStarted(true);
    }
  }, []);

  // Save session on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSession({
        sessionId,
        chatHistory: chatHistory.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })),
        mode,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [chatHistory, sessionId, mode]);

  // Convert new server messages to chat entries
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    let entry: ChatMessage | null = null;
    const ts = new Date();
    const id = crypto.randomUUID();

    if (last.type === "agent:thinking") entry = { id, type: "thinking", content: last.thought, timestamp: ts };
    else if (last.type === "agent:option") entry = { id, type: "option", content: last.description, title: last.title, previewHtml: last.previewHtml, timestamp: ts };
    else if (last.type === "agent:log") entry = { id, type: "agent", content: last.message, timestamp: ts };
    else if (last.type === "generation:done") entry = { id, type: "system", content: "Generation complete.", timestamp: ts };
    else if (last.type === "error") entry = { id, type: "system", content: `Error: ${last.message}`, timestamp: ts };

    if (entry) setChatHistory((prev) => [...prev, entry!]);
  }, [messages]);

  useEffect(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [chatHistory]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || !isConnected) return;
    const text = input.trim();
    setChatHistory((prev) => [...prev, { id: crypto.randomUUID(), type: "user", content: text, timestamp: new Date() }]);
    setInput("");
    if (!hasStarted) { onSend({ type: "generate", prompt: text, mode }); setHasStarted(true); }
    else { onSend({ type: "chat", message: text }); }
  }, [input, isConnected, hasStarted, mode, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  return (
    <aside className="w-80 bg-white flex flex-col border-l border-stone-100 shrink-0 z-40 shadow-2xl shadow-stone-900/5">
      <div className="p-4 border-b border-stone-100 flex justify-between items-center">
        <div>
          <h2 className="text-stone-900 font-[Noto_Serif] font-bold italic text-sm">AVV Agent</h2>
          <p className="text-[10px] text-stone-400 font-[Public_Sans] tracking-tighter">{isConnected ? "Design Intelligence" : "Connecting..."}</p>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><span className="material-symbols-outlined text-lg">close</span></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {chatHistory.length === 0 && (
          <div className="text-center mt-12 space-y-4">
            <span className="material-symbols-outlined text-4xl text-stone-200">auto_awesome</span>
            <p className="text-sm font-[Noto_Serif] italic text-stone-400">Describe the UI you want to build.</p>
          </div>
        )}
        {chatHistory.map((entry) => {
          if (entry.type === "user") return (
            <div key={entry.id} className="flex flex-row-reverse gap-3">
              <div className="w-6 h-6 rounded bg-blue-700 shrink-0 flex items-center justify-center text-[10px] text-white font-bold">ME</div>
              <div className="space-y-1 text-right">
                <div className="bg-blue-700 text-white p-3 rounded-lg rounded-tr-none shadow-lg shadow-blue-700/10"><p className="text-sm leading-relaxed">{entry.content}</p></div>
                <span className="text-[9px] font-[Public_Sans] text-stone-400">{entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          );
          if (entry.type === "agent") return (
            <div key={entry.id} className="flex gap-3">
              <div className="w-6 h-6 rounded bg-amber-100 shrink-0 flex items-center justify-center"><span className="material-symbols-outlined text-xs text-amber-700">auto_awesome</span></div>
              <div className="space-y-1"><div className="bg-stone-100 p-3 rounded-lg rounded-tl-none"><p className="text-sm leading-relaxed text-stone-800">{entry.content}</p></div><span className="text-[9px] font-[Public_Sans] text-stone-400">AVV Agent</span></div>
            </div>
          );
          if (entry.type === "thinking") return (
            <div key={entry.id} className="flex gap-3">
              <div className="w-6 h-6 rounded bg-stone-100 shrink-0 flex items-center justify-center"><span className="material-symbols-outlined text-xs text-stone-400">pending</span></div>
              <p className="text-[11px] font-[Noto_Serif] italic text-stone-400 self-center">{entry.content}</p>
            </div>
          );
          if (entry.type === "option") return (
            <div key={entry.id} className="flex gap-3">
              <div className="w-6 h-6 rounded bg-amber-100 shrink-0 flex items-center justify-center"><span className="material-symbols-outlined text-xs text-amber-700">style</span></div>
              <div className="flex-1 bg-stone-50 border border-stone-200 p-3 rounded-lg">
                <p className="text-xs font-[Public_Sans] font-bold text-stone-700 mb-1">{entry.title}</p>
                <p className="text-[11px] text-stone-500">{entry.content}</p>
                {entry.previewHtml && <iframe srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><script src="https://cdn.tailwindcss.com"></script><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui}</style></head><body>${entry.previewHtml}</body></html>`} sandbox="allow-scripts" className="w-full h-24 border-none rounded mt-2 bg-white" title="Preview" />}
              </div>
            </div>
          );
          if (entry.type === "system") return (
            <div key={entry.id} className="text-center"><span className="text-[10px] font-[Public_Sans] text-stone-400 uppercase tracking-widest">{entry.content}</span></div>
          );
          return null;
        })}
      </div>

      <div className="p-4 border-t border-stone-100 bg-stone-50">
        <div className="relative">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe what you want to build..." className="w-full bg-white border-none rounded-xl p-3 pr-12 text-sm focus:ring-1 focus:ring-amber-700/30 resize-none h-24 shadow-sm" />
          <button onClick={handleSubmit} disabled={!input.trim() || !isConnected} className="absolute bottom-3 right-3 p-1.5 bg-amber-700 text-white rounded-lg shadow-lg shadow-amber-700/20 disabled:opacity-40 hover:bg-amber-800"><span className="material-symbols-outlined text-sm">send</span></button>
        </div>
        <div className="mt-3 flex justify-between items-center">
          <div className="flex gap-1">
            {(["simple", "ultrathink"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-2 py-1 rounded text-[10px] font-[Public_Sans] font-bold uppercase tracking-widest ${mode === m ? "bg-stone-200 text-stone-700" : "text-stone-400 hover:text-stone-600"}`}>{m === "ultrathink" ? "UltraThink" : "Simple"}</button>
            ))}
          </div>
          <button onClick={() => { if (confirm("Start fresh?")) { clearAll(); window.location.reload(); } }} className="text-[10px] font-[Public_Sans] font-bold text-stone-400 hover:text-red-500 uppercase tracking-widest">New</button>
        </div>
      </div>
    </aside>
  );
}
