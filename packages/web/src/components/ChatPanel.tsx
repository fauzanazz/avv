import { useState, useEffect, useRef } from "react";

interface Question {
  questionId: string;
  question: string;
  options?: string[];
}

interface ChatPanelProps {
  isOpen: boolean;
  questions: Question[];
  spec: string | null;
  onAnswer: (questionId: string, answer: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function ChatPanel({ isOpen, questions, spec, onAnswer, onConfirm, onClose }: ChatPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const prevQuestionsRef = useRef(questions);

  useEffect(() => {
    if (questions !== prevQuestionsRef.current && questions.length > 0) {
      const prevIds = new Set(prevQuestionsRef.current.map((q) => q.questionId));
      const hasNewQuestions = questions.some((q) => !prevIds.has(q.questionId));
      if (hasNewQuestions && prevQuestionsRef.current.length > 0) {
        setAnswers({});
      }
    }
    prevQuestionsRef.current = questions;
  }, [questions]);

  if (!isOpen) return null;

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.questionId]);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-white border-l border-slate-200 flex flex-col z-50 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">UltraThink Mode</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {questions.map((q) => (
          <div key={q.questionId} className="space-y-2">
            <p className="text-sm font-medium text-slate-700">{q.question}</p>

            {q.options ? (
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setAnswers((prev) => ({ ...prev, [q.questionId]: opt }));
                      onAnswer(q.questionId, opt);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      answers[q.questionId] === opt
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                placeholder="Your answer..."
                value={answers[q.questionId] || ""}
                onChange={(e) => {
                  setAnswers((prev) => ({ ...prev, [q.questionId]: e.target.value }));
                  onAnswer(q.questionId, e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        ))}

        {spec && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-medium text-slate-500 mb-1">Generated Spec:</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{spec}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {allAnswered && !spec && (
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={onConfirm}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Generate Design
          </button>
        </div>
      )}
    </div>
  );
}
