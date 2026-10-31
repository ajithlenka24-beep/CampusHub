# Legacy static prototype

The original single-page CampusHub prototype (HTML + CSS + vanilla JavaScript with localStorage).
It is kept here for reference only; the full-stack app in `frontend/` and `backend/` replaces it.

What carried over into the new app:
- **Design system**: `style1.css` → `frontend/src/styles/theme.css` (black / gold / mint, cards, match bars, score circle, tracker, team card).
- **Letter-hover heading** → `frontend/src/components/LetterHover.tsx`.
- **Skill matching, profile completion and team analysis logic** (`script.js`) → `backend/src/services/engines.ts`
  and `skillNormalizer.ts`, now running on the server against PostgreSQL data.
- **localStorage persistence** → replaced by PostgreSQL + authenticated APIs.
