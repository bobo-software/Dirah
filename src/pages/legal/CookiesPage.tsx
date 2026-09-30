import { Link } from 'react-router-dom';
import { LEGAL } from '../../legal/legalInfo';
import { ContactLink, LegalLayout, type LegalSection } from './LegalLayout';

const SECTIONS: LegalSection[] = [
  {
    id: 'cookies',
    title: 'Cookies we set',
    body: (
      <>
        <p>We set one cookie, and only after you sign in.</p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Purpose</th>
                <th scope="col">Lasts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>dirah_refresh</code>
                </td>
                <td>Keeps you signed in. It cannot be read by scripts on the page.</td>
                <td>{LEGAL.sessionCookieDays} days, or until you sign out</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'storage',
    title: 'Saved in your browser',
    body: (
      <>
        <p>Dirah also saves a few things in your browser&rsquo;s local storage, on your device only.</p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>dirah.theme</code>
                </td>
                <td>Remembers whether you chose light, dark or your device&rsquo;s theme.</td>
              </tr>
              <tr>
                <td>
                  <code>dirah.lastWorkspaceId</code>
                </td>
                <td>Opens the workspace you used last.</td>
              </tr>
              <tr>
                <td>
                  <code>dirah.refreshToken</code>
                </td>
                <td>
                  Held for a moment while you sign in with Google or GitHub, then swapped for the sign-in cookie and
                  removed.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'not-used',
    title: 'What we don’t use',
    body: <p>No advertising cookies, no analytics or tracking cookies, and no third-party cookies.</p>,
  },
  {
    id: 'control',
    title: 'Controlling them',
    body: (
      <p>
        You can clear cookies and site data in your browser settings at any time. Clearing them signs you out and resets
        your theme choice. Because we only use what Dirah needs to work, there is nothing to opt out of.
      </p>
    ),
  },
  {
    id: 'more',
    title: 'More information',
    body: (
      <p>
        How we handle personal information is covered in the <Link to="/privacy">privacy policy</Link>. Questions:{' '}
        <ContactLink />.
      </p>
    ),
  },
];

export function CookiesPage() {
  return (
    <LegalLayout
      title="Cookies"
      current="/cookies"
      intro={<p>Dirah uses only what it needs to keep you signed in and remember your preferences.</p>}
      sections={SECTIONS}
    />
  );
}
