import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { Icon } from "./Icon";

/** Chip-style input for skills, with autocomplete from the shared skill catalogue. */
export function TagInput({
  value,
  onChange,
  placeholder = "Type a skill and press Enter",
  max = 20,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  id?: string;
}) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<{ skills: { name: string }[] }>(`/skills?q=${encodeURIComponent(q)}`)
        .then((r) => setSuggestions(r.skills.map((s) => s.name).filter((n) => !value.some((v) => v.toLowerCase() === n.toLowerCase())).slice(0, 8)))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [text, value]);

  const add = (raw: string) => {
    const name = raw.trim().replace(/,$/, "");
    if (!name || value.length >= max || value.some((v) => v.toLowerCase() === name.toLowerCase())) {
      setText("");
      return;
    }
    onChange([...value, name.slice(0, 60)]);
    setText("");
    setSuggestions([]);
    setActive(-1);
  };

  return (
    <div className="tag-input">
      <div className="tag-box" onClick={() => inputRef.current?.focus()}>
        {value.map((tag) => (
          <span key={tag} className="chip">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((v) => v !== tag))}>
              <Icon name="x" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={text}
          placeholder={value.length >= max ? `Maximum ${max}` : placeholder}
          disabled={value.length >= max}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            // keep what was typed even if the user clicks Save/Add without pressing Enter
            if (text.trim()) add(text);
            setTimeout(() => setSuggestions([]), 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(active >= 0 ? suggestions[active] : text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <button key={s} type="button" className={i === active ? "active" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
