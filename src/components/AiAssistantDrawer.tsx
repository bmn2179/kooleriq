import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  ExternalLink,
  Globe,
  Send,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { ChatMessageItem } from '../types/kooleriq';

interface AiAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessageItem[];
  onSendMessage: (
    message: string,
    modelMode: 'standard' | 'fast',
    useSearchGrounding: boolean
  ) => Promise<void>;
  onClearHistory: () => void;
  isSending: boolean;
  errorMsg: string | null;
}

const QUICK_PROMPTS = [
  'Which cooler door needs restocking first?',
  'Explain the Door 04 temperature alert',
  'What are top 2026 c-store energy drink trends?',
  'Summarize KoolerIQ Google Play pricing tiers',
];

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  open,
  onClose,
  messages,
  onSendMessage,
  onClearHistory,
  isSending,
  errorMsg,
}) => {
  const [input, setInput] = useState('');
  const [modelMode, setModelMode] = useState<'standard' | 'fast'>('standard');
  const [useSearchGrounding, setUseSearchGrounding] = useState(true);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages.length, isSending]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    await onSendMessage(text, modelMode, modelMode === 'standard' && useSearchGrounding);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-lg h-full bg-[#0A1128] border-l border-[#00E5FF]/30 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        aria-label="KoolerIQ Gemini Merchandising Assistant"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-white/10 bg-[#101F42] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/50 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-[#00E5FF]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-display font-bold text-[#DCE1FF] truncate">
                KoolerIQ Merchandising Copilot
              </h2>
              <p className="text-[11px] font-mono-tabular text-[#849396] truncate">
                {modelMode === 'fast'
                  ? 'gemini-3.1-flash-lite · Fast Aisle Mode'
                  : useSearchGrounding
                    ? 'gemini-4-hydrogen · Web Search Grounded'
                    : 'gemini-4-hydrogen · Store Telemetry Mode'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded text-[#849396] hover:text-[#FF5A5F] hover:bg-white/5 transition-colors"
                aria-label="Clear conversation history"
                title="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded text-[#BAC9CC] hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close assistant"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Model & Grounding Controls */}
        <div className="px-4 py-2.5 border-b border-white/10 bg-[#060D24] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded bg-[#101F42] border border-white/10">
            <button
              type="button"
              onClick={() => setModelMode('standard')}
              className={`min-h-[32px] px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                modelMode === 'standard'
                  ? 'bg-[#00E5FF] text-[#0A1128]'
                  : 'text-[#BAC9CC] hover:text-white'
              }`}
            >
              Analyst
            </button>
            <button
              type="button"
              onClick={() => setModelMode('fast')}
              className={`min-h-[32px] px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                modelMode === 'fast'
                  ? 'bg-[#00E5FF] text-[#0A1128]'
                  : 'text-[#BAC9CC] hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3" />
              Fast
            </button>
          </div>

          {modelMode === 'standard' && (
            <button
              type="button"
              onClick={() => setUseSearchGrounding((v) => !v)}
              className={`min-h-[32px] px-2.5 py-1 rounded text-[11px] font-medium border transition-colors flex items-center gap-1.5 ${
                useSearchGrounding
                  ? 'bg-[#10B981]/15 border-[#10B981]/50 text-[#A8FFD2]'
                  : 'bg-[#101F42] border-white/10 text-[#849396]'
              }`}
            >
              <Globe className="w-3 h-3" />
              Google Search: {useSearchGrounding ? 'On' : 'Off'}
            </button>
          )}
        </div>

        {/* Scrollable Conversation Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-4 py-4">
              <div className="rounded-xl bg-[#101F42] border border-white/10 p-4 space-y-2">
                <p className="text-sm font-semibold text-[#DCE1FF]">
                  Ready to assist on Store #1042 coolers
                </p>
                <p className="text-xs text-[#BAC9CC] leading-relaxed">
                  Ask about OOS priority doors, compressor temperature faults, Google Play fleet
                  licensing, or enable Google Search for live 2026 convenience beverage trends.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-medium text-[#849396]">Suggested prompts</div>
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() =>
                      onSendMessage(q, modelMode, modelMode === 'standard' && useSearchGrounding)
                    }
                    disabled={isSending}
                    className="w-full text-left min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#101F42]/80 border border-white/10 hover:border-[#00E5FF]/50 text-xs text-[#DCE1FF] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#00E5FF] text-[#0A1128] font-medium'
                      : 'bg-[#101F42] border border-white/10 text-[#DCE1FF]'
                  }`}
                >
                  {msg.content}

                  {msg.role === 'model' && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1.5">
                      <div className="text-[10px] font-mono-tabular text-[#00E5FF]">
                        Google Search Sources
                      </div>
                      <div className="flex flex-col gap-1">
                        {msg.sources.slice(0, 4).map((src) => (
                          <a
                            key={src.uri}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] text-[#A8FFD2] hover:underline truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-mono-tabular text-[#849396] mt-1 px-1">
                  {msg.role === 'user' ? 'You' : msg.modelUsed}
                </span>
              </div>
            ))
          )}

          {isSending && (
            <div className="flex items-start">
              <div className="rounded-xl bg-[#101F42] border border-[#00E5FF]/30 px-4 py-3 text-xs text-[#00E5FF] font-mono-tabular">
                Analyzing cooler telemetry...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg bg-[#FF5A5F]/15 border border-[#FF5A5F]/50 px-3.5 py-2.5 text-xs text-[#FFB4AB]">
              {errorMsg}
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Message Composer */}
        <form
          onSubmit={handleSubmit}
          className="p-3.5 border-t border-white/10 bg-[#101F42] flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about cooler stock, temps, or market trends..."
            className="flex-1 min-h-[44px] px-3.5 rounded-lg bg-[#0A1128] border border-white/15 text-sm text-[#DCE1FF] placeholder:text-[#849396] focus:outline-none focus:border-[#00E5FF]"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="min-h-[44px] min-w-[44px] px-4 rounded-lg bg-[#00E5FF] text-[#0A1128] font-semibold text-xs hover:bg-[#33ECFF] disabled:opacity-45 transition-colors flex items-center justify-center"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </div>
  );
};
