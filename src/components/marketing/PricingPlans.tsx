import { Link } from 'react-router-dom';
import { motion, type Variants } from 'motion/react';
import { BILLING_ENABLED, PLANS, formatZar, planLines, type Plan } from '../../billing/plans';
import { trackSpotlight } from '../../utils/spotlight';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

const inView = { initial: 'hidden', whileInView: 'shown', viewport: { once: true, amount: 0.2 } } as const;

export function PricingPlans() {
  return (
    <section id="pricing" className="pricing" aria-labelledby="pricing-title">
      <motion.div className="pricing-head" variants={item} {...inView}>
        <h2 id="pricing-title" className="home-section-title">
          Pricing
        </h2>
        <p>
          {BILLING_ENABLED
            ? 'Start free and upgrade when you need more room. Prices are per month, in rand.'
            : 'Everyone is on Free while paid plans are on the way. Prices are per month, in rand, and nothing is charged until you choose a plan.'}
        </p>
      </motion.div>
      <motion.ol className="pricing-plans" variants={group} {...inView}>
        {PLANS.map((plan) => (
          <PlanColumn key={plan.id} plan={plan} />
        ))}
      </motion.ol>
      <motion.p className="pricing-every" variants={item} {...inView}>
        Every plan includes unlimited pages, public share links, encrypted workspaces, and connections from Claude,
        Claude Code, Cursor or any MCP client.
      </motion.p>
    </section>
  );
}

function PlanColumn({ plan }: { plan: Plan }) {
  const isFree = plan.priceZar === 0;
  const titleId = `plan-${plan.id}`;

  return (
    <motion.li
      className={`pricing-plan has-spotlight pricing-plan-${plan.id}${plan.recommended ? ' is-recommended' : ''}`}
      variants={item}
      onPointerMove={trackSpotlight}
      aria-labelledby={titleId}
    >
      <div className="pricing-plan-top">
        <h3 id={titleId}>
          <span className="pricing-medal" aria-hidden="true" />
          {plan.name}
        </h3>
        {plan.recommended && <p className="pricing-flag">Best for teams</p>}
      </div>
      <p className="pricing-price">
        <span className="pricing-amount">{formatZar(plan.priceZar)}</span>
        <span className="pricing-per">{isFree ? 'forever' : '/month'}</span>
      </p>
      <p className="pricing-summary">{plan.summary}</p>
      {isFree ? (
        <Link className="pricing-cta is-primary" to="/register">
          Create your workspace
        </Link>
      ) : BILLING_ENABLED ? (
        <Link className="pricing-cta" to={`/register?plan=${plan.id}`}>
          Choose {plan.name}
        </Link>
      ) : (
        <p className="pricing-cta is-soon" aria-disabled="true">
          Coming soon
        </p>
      )}
      <ul className="pricing-lines">
        {planLines(plan).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </motion.li>
  );
}
