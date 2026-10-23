import { Link } from 'react-router-dom';

export type LogoSize = 'sm' | 'md' | 'lg';

export function Logo({
  size = 'md',
  decorative = false,
}: {
  size?: LogoSize;
  decorative?: boolean;
}) {
  return (
    <span className={`logo logo-${size}`} aria-hidden={decorative ? true : undefined} translate="no">
      DIRAH
    </span>
  );
}

export function BrandLink({
  to = '/',
  size = 'sm',
}: {
  to?: string;
  size?: LogoSize;
}) {
  return (
    <Link to={to} className="brand" aria-label="Dirah home">
      <Logo size={size} decorative />
    </Link>
  );
}
