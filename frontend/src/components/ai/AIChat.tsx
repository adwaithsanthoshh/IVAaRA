// IVaaRA – AI Chat component
// "Ask IVaaRA AI" — sends question to backend, backend calls Groq

import { useEffect, useRef, useState } from 'react';
import { askAI } from '../../services/api';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
  ai_available?: boolean;
}

const EXAMPLE_QUESTIONS = [
  'Why was this device flagged?',
  'Was the flow stable in the last 30 minutes?',
  'When did the last anomaly occur?',
  'What was the lowest flow rate?',
  'Summarize this monitoring session.',
];

interface AIChatProps {
  deviceId: string;
}

export function AIChat({ deviceId }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await askAI(deviceId, text);
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: res.answer,
        timestamp: new Date(res.timestamp),
        ai_available: res.ai_available,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: `e-${Date.now()}`,
        role: 'ai',
        text: 'Failed to reach AI service. Please check backend connectivity.',
        timestamp: new Date(),
        ai_available: false,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-card flex flex-col" style={{ height: 360 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e2e8f0]">
        <span className="material-symbols-outlined text-[#006194] text-[18px]">chat</span>
        <span className="text-label-md font-bold text-[#161c27] uppercase tracking-wide">Ask IVaaRA AI</span>
        <span className="ml-auto text-[10px] text-[#94a3b8]">Device: {deviceId}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs text-[#94a3b8] mb-1">Ask a question about this device:</p>
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-left text-xs px-3 py-1.5 border border-[#e2e8f0] rounded hover:bg-[#f1f3ff] hover:border-[#006194] text-[#334155] transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#006194] text-white'
                  : msg.ai_available === false
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-[#f1f3ff] text-[#334155]'
              }`}
            >
              {msg.role === 'ai' && msg.ai_available === false && (
                <span className="text-[10px] font-bold text-amber-600 uppercase block mb-1">AI Unavailable</span>
              )}
              <p className="whitespace-pre-wrap">{msg.text}</p>
              <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-[#94a3b8]'}`}>
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#f1f3ff] px-3 py-2 rounded-lg">
              <span className="text-xs text-[#94a3b8] animate-pulse">IVaaRA AI is thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-[#e2e8f0]">
        <input
          ref={inputRef}
          type="text"
          className="flex-1 border border-[#e2e8f0] rounded px-3 py-2 text-sm text-[#161c27] focus:outline-none focus:border-[#006194] placeholder:text-[#94a3b8]"
          placeholder="Ask about this IV device…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!question.trim() || loading}
          className="px-4 py-2 bg-[#006194] text-white rounded text-sm font-semibold hover:bg-[#004b73] disabled:opacity-40 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">send</span>
        </button>
      </div>
    </div>
  );
}
