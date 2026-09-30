import { Link } from 'react-router-dom';
import { LEGAL } from '../../legal/legalInfo';
import { ContactLink, LegalLayout, type LegalSection } from './LegalLayout';

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Using Dirah',
    body: (
      <p>
        These terms are an agreement between you and {LEGAL.company}. By creating an account or using {LEGAL.product},
        you accept them. If you use Dirah for an organisation, you confirm you may accept these terms on its behalf.
      </p>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <ul>
        <li>You must be at least 18 to use Dirah.</li>
        <li>Give us an email address you control, and keep your password and access tokens private.</li>
        <li>You are responsible for what happens under your account. Tell us straight away if you think it has been misused.</li>
      </ul>
    ),
  },
  {
    id: 'content',
    title: 'Your content',
    body: (
      <>
        <p>
          You own what you put in Dirah. You give us permission to store, copy and display it only as needed to run the
          service for you, including sending it to the agents and features you choose to use.
        </p>
        <p>Make sure you have the right to upload what you add, and that it does not break the law or anyone&rsquo;s rights.</p>
      </>
    ),
  },
  {
    id: 'agents',
    title: 'Connected agents',
    body: (
      <>
        <p>
          When you connect an agent such as Claude or Cursor, it acts on your behalf. You are responsible for the changes
          it makes within the access you grant, so give each connection only the workspaces and permissions it needs.
        </p>
        <p>
          Those agents are provided by other companies under their own terms. We are not responsible for how they work
          or what they do with information they read.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>Do not use Dirah to:</p>
        <ul>
          <li>Store or share content that is unlawful, infringing, or harmful to others.</li>
          <li>Access other people&rsquo;s accounts or data without permission.</li>
          <li>Interfere with the service, overload it, or get around its limits or security.</li>
          <li>Send spam or unwanted invitations.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Sharing and public links',
    body: (
      <p>
        Anyone with a public share link can read that page. You decide what to share and can turn a link off at any
        time. Workspace members can see and, depending on their role, change the content of that workspace.
      </p>
    ),
  },
  {
    id: 'fees',
    title: 'Fees',
    body: (
      <p>
        If we introduce paid plans, we will tell you the price and what it includes before any charge applies. You will
        not be charged without agreeing first.
      </p>
    ),
  },
  {
    id: 'availability',
    title: 'Changes to the service',
    body: (
      <p>
        We work to keep Dirah available and your data safe, but we may change, add or remove features. If we make a
        change that significantly reduces what you can do, we will give you reasonable notice and a way to export your
        content.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Closing your account',
    body: (
      <p>
        You can stop using Dirah and ask us to close your account at any time. We may suspend or close accounts that break
        these terms, and will tell you why unless the law or security prevents it.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Warranties and liability',
    body: (
      <>
        <p>
          Dirah is provided as it is. To the extent the law allows, we do not guarantee it will be uninterrupted or free
          of errors, and we are not liable for indirect or consequential loss.
        </p>
        <p>Nothing in these terms limits rights you have under the Consumer Protection Act or other law that cannot be excluded.</p>
      </>
    ),
  },
  {
    id: 'law',
    title: 'Governing law',
    body: <p>These terms are governed by the laws of the Republic of {LEGAL.country}.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        If we change these terms, we will update the date at the top and tell you about significant changes before they
        take effect. Using Dirah after that means you accept the new terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Questions about these terms: <ContactLink />. How we handle personal information is covered in the{' '}
        <Link to="/privacy">privacy policy</Link>.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of service"
      current="/terms"
      intro={<p>The rules for using Dirah: what you can expect from us, and what we expect from you and the agents you connect.</p>}
      sections={SECTIONS}
    />
  );
}
