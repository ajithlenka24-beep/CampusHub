/**
 * The original CampusHub hero effect: every letter turns a random colour on hover.
 * Rebuilt as a React component (no innerHTML), so it works with any text safely.
 */
const COLORS = ["#ff5c8a", "#ff9f43", "#f9ca24", "#6ab04c", "#22a6b3", "#4834d4", "#be2edd"];

export function LetterHover({ text, as: Tag = "h1", className = "" }: { text: string; as?: "h1" | "h2"; className?: string }) {
  const words = text.trim().split(" ");
  return (
    <Tag className={`letter-heading ${className}`} aria-label={text}>
      {words.map((word, w) => (
        <span key={`${word}-${w}`} aria-hidden="true">
          <span className="word">
            {[...word].map((letter, i) => (
              <span
                key={i}
                className="letter"
                onMouseEnter={(e) => e.currentTarget.style.setProperty("--hover-color", COLORS[Math.floor(Math.random() * COLORS.length)])}
              >
                {letter}
              </span>
            ))}
          </span>
          {w < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
