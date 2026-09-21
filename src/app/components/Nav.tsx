'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/packets', label: 'Packets' },
  { href: '/try', label: 'Try it' },
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/method', label: 'Method' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Bench sections">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-active={
            link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
          }
        >
          <span className="ring" aria-hidden="true" />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
