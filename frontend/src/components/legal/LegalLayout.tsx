import { type ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandLink } from '../layout/Logo';
import ThemeToggle from '../layout/ThemeToggle';
import { SiteFooter } from '../layout/SiteFooter';
import { LEGAL } from '../../legal/legalInfo';

export type LegalSection = { id: string; title: string; body: ReactNode };

const PAGES = [
  { to: '/privacy', label: 'Privacy policy' },
  { to: '/terms', label: 'Terms of service' },
  { to: '/cookies', label: 'Cookies' },
];

export function LegalLayout({
  title,
  intro,
  sections,
  current,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  current: string;
}) {
  // The router keeps the previous page's scroll position; start each policy at the top.
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [current]);

  useEffect(() => {
    document.title = `${title} · Dirah`;
    return () => {
      document.title = 'Dirah';
    };
  }, [title]);

  return (
    <div className="home legal">
      <header className="home-bar">
        <BrandLink size="sm" />
        <div className="home-bar-actions">
          <ThemeToggle />
          <Link to="/login">Sign in</Link>
        </div>
      </header>
      <main className="legal-main">
        <nav className="legal-switch" aria-label="Legal pages">
          {PAGES.map((page) => (
            <Link
              key={page.to}
              to={page.to}
              className={page.to === current ? 'is-current' : undefined}
              aria-current={page.to === current ? 'page' : undefined}
            >
              {page.label}
            </Link>
          ))}
        </nav>
        <header className="legal-head">
          <h1>{title}</h1>
          <p className="legal-updated">Last updated {LEGAL.lastUpdated}</p>
          <div className="legal-intro">{intro}</div>
        </header>
        <div className="legal-body">
          <nav className="legal-toc" aria-label="On this page">
            <p>On this page</p>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="legal-article">
            {sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.title}</h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function ContactLink() {
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
}
