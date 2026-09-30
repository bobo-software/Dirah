import { Link } from 'react-router-dom';
import { LEGAL } from '../../legal/legalInfo';
import { ContactLink, LegalLayout, type LegalSection } from './LegalLayout';

const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          {LEGAL.product} is run by {LEGAL.company} in {LEGAL.country}. We are the responsible party for the personal
          information described here, as defined by the Protection of Personal Information Act (POPIA).
        </p>
        <p>
          For anything in this policy, email <ContactLink />.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <h3>Your account</h3>
        <p>
          Your email address and a hashed version of your password. If you sign in with Google or GitHub, we receive
          your email address and an account identifier from them. We never see your Google or GitHub password.
        </p>
        <h3>What you put in Dirah</h3>
        <p>
          Workspaces, folders, pages, files you upload, share links you create, and the email addresses of people you
          invite.
        </p>
        <h3>Agent connections</h3>
        <p>
          The MCP connections and access tokens you create, which workspaces each can use, and a record of each tool an
          agent calls: which tool, which page, when, and whether it succeeded.
        </p>
        <h3>Technical logs</h3>
        <p>
          For each request to our servers we record the address requested, the response status, how long it took, your
          account ID if you are signed in, and your IP address. We also log request and response data to diagnose
          errors, with passwords and access tokens removed before they are stored.
        </p>
        <h3>Emails we send</h3>
        <p>When we send an email, such as a workspace invitation, we log the recipient, subject and whether it was delivered.</p>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    title: 'How we use it',
    body: (
      <ul>
        <li>To run Dirah: sign you in, store and sync your pages, and let the agents you connect read and update them.</li>
        <li>To send the emails the service needs, such as invitations.</li>
        <li>To keep Dirah secure: detect abuse, investigate problems and fix errors.</li>
        <li>To meet our legal obligations.</li>
      </ul>
    ),
  },
  {
    id: 'ai-features',
    title: 'AI features',
    body: (
      <>
        <p>
          When you use Ask on a page, we send your question and that page&rsquo;s content to OpenAI to generate the
          answer. Nothing is sent unless you ask a question.
        </p>
        <p>
          Agents you connect over MCP, such as Claude or Cursor, are run by those companies under their own privacy
          policies. They can only reach the workspaces you allow, and you can revoke access at any time.
        </p>
        <p>We do not use your content to train AI models, and we do not sell it.</p>
      </>
    ),
  },
  {
    id: 'encryption',
    title: 'Encrypted workspaces',
    body: (
      <p>
        If you turn on encryption for a workspace, page content is encrypted in your browser before it reaches us, and
        we cannot read it. Encrypted workspaces cannot be connected to agents or used with Ask.
      </p>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <p>We share personal information only with:</p>
        <ul>
          <li>Service providers who host our servers and files and deliver our email, under contracts that protect your data.</li>
          <li>OpenAI, only when you use Ask, as described above.</li>
          <li>Google or GitHub, if you choose to sign in with them.</li>
          <li>People you choose: workspace members you invite, and anyone who opens a public share link you create.</li>
          <li>Authorities, when the law requires it.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'Where your data is stored',
    body: (
      <p>
        Some of our service providers store or process data outside {LEGAL.country}. When that happens we make sure the
        information is protected to a standard comparable to POPIA, as section 72 of the Act requires.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <ul>
        <li>Your account and content: until you delete them or close your account.</li>
        <li>Deleted pages: kept in the workspace trash until you empty it or restore them.</li>
        <li>Technical and email logs: for a limited period, only as long as we need them to run and secure Dirah.</li>
      </ul>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under POPIA you can:</p>
        <ul>
          <li>Ask what personal information we hold about you and get a copy.</li>
          <li>Ask us to correct or delete it.</li>
          <li>Object to how we process it.</li>
          <li>
            Complain to the Information Regulator at{' '}
            <a href="https://inforegulator.org.za" rel="noreferrer" target="_blank">
              inforegulator.org.za
            </a>
            .
          </li>
        </ul>
        <p>
          To use any of these rights, email <ContactLink /> from the address on your account.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        Connections to Dirah are encrypted in transit. Passwords are stored only as hashes, sessions use secure cookies,
        and access is limited to the people and agents you allow. No system is perfectly secure; if a breach affects your
        information, we will tell you and the Information Regulator as POPIA requires.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <p>
        We use one cookie to keep you signed in, and store a few preferences in your browser. We do not use advertising or
        analytics cookies. See the <Link to="/cookies">cookie notice</Link> for details.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: <p>Dirah is not meant for anyone under 18, and we do not knowingly collect their information.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        If we change this policy, we will update the date at the top. If a change affects how we use your information, we
        will tell you by email or in Dirah before it takes effect.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy policy"
      current="/privacy"
      intro={
        <p>
          What personal information Dirah collects, why, who we share it with, and how to get a copy or have it deleted.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
