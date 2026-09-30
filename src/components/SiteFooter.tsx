import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { LEGAL } from '../legal/legalInfo';

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-foot">
      <div className="site-foot-inner">
        <div className="site-foot-brand">
          <Link to="/" className="brand" aria-label="Dirah home">
            <Logo size="md" decorative />
          </Link>
          <p>A context bank for your AI agents.</p>
        </div>
        <nav className="site-foot-nav" aria-label="Footer">
          <div>
            <h2>Product</h2>
            <ul>
              <li>
                <Link to="/#connect">Set up your agent</Link>
              </li>
              <li>
                <Link to="/#pricing">Pricing</Link>
              </li>
              <li>
                <Link to="/register">Create your workspace</Link>
              </li>
              <li>
                <Link to="/login">Sign in</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Legal</h2>
            <ul>
              <li>
                <Link to="/privacy">Privacy policy</Link>
              </li>
              <li>
                <Link to="/terms">Terms of service</Link>
              </li>
              <li>
                <Link to="/cookies">Cookies</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Contact</h2>
            <ul>
              <li>
                <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <p className="site-foot-legal">
        &copy; {year} {LEGAL.company}. Dirah is made in {LEGAL.country}.
      </p>
    </footer>
  );
}
