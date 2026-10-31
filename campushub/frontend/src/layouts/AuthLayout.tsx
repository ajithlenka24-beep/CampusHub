import type { ReactNode } from "react";
import { Icon } from "../components/Icon";
import { LetterHover } from "../components/LetterHover";

/** Split screen: CampusHub brand story on the left, the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-brand">
        <div>
          <span className="logo-text">CampusHub</span>
        </div>
        <div>
          <LetterHover text="Build Your Skills. Discover Opportunities. Build Your Team." className="gold-gradient-text" />
          <p className="lead">CampusHub helps students showcase their skills, discover relevant opportunities, track applications and build stronger project teams.</p>
        </div>
        <div className="feature-list">
          {[
            ["target", "Skill-matched opportunities", "See exactly how well you match every internship and hackathon."],
            ["users", "Group Up", "Build balanced teams and spot missing roles instantly."],
            ["sparkles", "AI career assistant", "Personal guidance based on your real profile data."],
          ].map(([icon, title, text]) => (
            <div className="feature" key={title}>
              <span className="ico"><Icon name={icon} /></span>
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <main className="auth-panel">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
