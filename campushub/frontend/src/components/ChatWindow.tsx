import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../services/api";
import type { AiStatus } from "../types";
import { Icon } from "./Icon";

interface Message { id: string; role: "user" | "assistant"; content: string; provider?: string; createdAt: string }

const PROMPTS = [
  "Which internships match my current skills?",
  "What skill should I learn next?",
  "How can I improve my profile?",
  "How is my match percentage calculated?",
  "What roles is my team missing?",
];

/** CampusHub AI Assistant chat (used by the floating widget and the full page). */
export function ChatWindow({ onClose, compact }: { onClose?: () => void; compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ messages: Message[]; ai: AiStatus }>("/assistant")
      .then((d) => {
        setMessages(d.messages);
        setAi(d.ai);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    setError(null);
    setInput("");
    const temp: Message = { id: `tmp-${Date.now()}`, role: "user", content: message, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    setSending(true);
    try {
      const res = await api.post<{ userMessage: Message; assistantMessage: Message; degraded: boolean; ai: AiStatus }>("/assistant/messages", { message });
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), res.userMessage, res.assistantMessage]);
      setAi(res.ai);
      setNotice(res.degraded ? "The AI provider didn't respond, so the basic assistant answered instead." : null);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setInput(message);
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    await api.del("/assistant");
    setMessages([]);
  };

  return (
    <div className="chat-window">
      <div className="chat-head">
        <span className="feature"><span className="ico"><Icon name="sparkles" /></span></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title">CampusHub AI Assistant</div>
          <div className="faint small">{ai ? (ai.mode === "ai" ? `Powered by ${ai.provider} · ${ai.model}` : "Basic assistant (no AI provider configured)") : "Loading…"}</div>
        </div>
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost btn-xs" onClick={clear}>Clear</button>
        )}
        {onClose && (
          <button type="button" className="icon-btn sm" aria-label="Close assistant" onClick={onClose}>
            <Icon name="x" />
          </button>
        )}
      </div>

      <div className="chat-messages" ref={listRef} aria-live="polite">
        {ai?.mode === "fallback" && (
          <div className="alert alert-info small">{ai.label} It only answers from your CampusHub data.</div>
        )}
        {messages.length === 0 && (
          <div className="stack">
            <p className="muted small">Hi! I can see your CampusHub profile, matches, applications and teams. Ask me anything about your career progress.</p>
            <div className="prompt-chips">
              {PROMPTS.slice(0, compact ? 3 : 5).map((p) => (
                <button key={p} type="button" onClick={() => send(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.content}
            {m.role === "assistant" && <span className="meta">{m.provider === "fallback" ? "Basic assistant" : m.provider?.replace(":", " · ")}</span>}
          </div>
        ))}
        {sending && (
          <div className="msg assistant" aria-label="Assistant is typing">
            <span className="typing"><span /><span /><span /></span>
          </div>
        )}
        {notice && <div className="alert alert-warning small">{notice}</div>}
        {error && <div className="alert alert-error small">{error}</div>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          className="textarea"
          rows={1}
          maxLength={1000}
          placeholder="Ask about internships, skills, your profile…"
          aria-label="Message the assistant"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()} aria-label="Send">
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="chat-panel">
      <ChatWindow compact onClose={() => setOpen(false)} />
    </div>
  ) : (
    <button type="button" className="chat-fab" onClick={() => setOpen(true)}>
      <Icon name="sparkles" />
      <span>Ask CampusHub AI</span>
    </button>
  );
}
