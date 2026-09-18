'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/packets', label: 'Packets' },
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/method', label: 'Method' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-active={
            link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
