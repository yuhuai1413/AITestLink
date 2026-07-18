import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function SectionHeader({ eyebrow, title, description, meta, actions }: SectionHeaderProps) {
  return (
    <header className="section-header">
      <div className="section-header__topline">
        <div className="section-header__copy">
          {eyebrow ? <span className="section-header__eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="section-header__actions">{actions}</div> : null}
      </div>
      {description || meta ? (
        <div className="section-header__subline">
          {description ? <p>{description}</p> : <span />}
          {meta ? <span className="section-header__meta">{meta}</span> : null}
        </div>
      ) : null}
    </header>
  );
}
