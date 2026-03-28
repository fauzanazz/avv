import { useState } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectGitHub: (token: string) => void;
  githubStatus: { connected: boolean; username?: string; error?: string };
}

export function SettingsModal({
  isOpen,
  onClose,
  onConnectGitHub,
  githubStatus,
}: SettingsModalProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  if (!isOpen) return null;

  const handleConnect = () => {
    if (token.trim()) {
      onConnectGitHub(token.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-200">Settings</h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 text-lg transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* GitHub PAT */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-300">
              GitHub Personal Access Token
            </label>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Connect your GitHub account to push generated projects.
              Create a token with <code className="text-neutral-400">repo</code> scope.
            </p>

            {githubStatus.connected ? (
              <div className="flex items-center gap-2 py-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-green-400">
                  Connected as {githubStatus.username}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 pr-16 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 font-mono"
                  />
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
                <button
                  onClick={handleConnect}
                  disabled={!token.trim()}
                  className="w-full py-2 text-xs font-medium rounded-lg bg-neutral-700 text-neutral-200 hover:bg-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Connect
                </button>
                {githubStatus.error && (
                  <p className="text-[11px] text-red-400">{githubStatus.error}</p>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-neutral-800" />

          {/* About */}
          <div className="space-y-1">
            <p className="text-xs text-neutral-500">
              AVV v2 — Agentic Chat Platform
            </p>
            <p className="text-[11px] text-neutral-700">
              Powered by Claude Agent SDK
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
