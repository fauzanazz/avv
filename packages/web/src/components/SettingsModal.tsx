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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md shadow-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Settings</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-lg transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* GitHub PAT */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              GitHub Personal Access Token
            </label>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Connect your GitHub account to push generated projects.
              Create a token with <code className="text-[var(--text-tertiary)]">repo</code> scope.
            </p>

            {githubStatus.connected ? (
              <div className="flex items-center gap-2 py-2">
                <span className="w-2 h-2 rounded-full bg-[var(--status-success)]" />
                <span className="text-xs text-[var(--status-success)]">
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
                    aria-label="GitHub Personal Access Token"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl px-3 py-2 pr-16 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-muted)] font-mono transition-colors"
                  />
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-tertiary)] transition-colors"
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
                <button
                  onClick={handleConnect}
                  disabled={!token.trim()}
                  className="w-full py-2 text-xs font-medium rounded-xl bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--border-default)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Connect
                </button>
                {githubStatus.error && (
                  <p className="text-[11px] text-[var(--status-error)]">{githubStatus.error}</p>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border-subtle)]" />

          {/* About */}
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-muted)]">
              AVV v2 — Agentic Chat Platform
            </p>
            <p className="text-[11px] text-[var(--text-muted)] opacity-50">
              Powered by Claude Agent SDK
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
