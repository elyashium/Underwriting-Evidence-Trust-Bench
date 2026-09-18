import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Rate } from '@/lib/score';
import { pct } from '@/lib/score';
import type { Classification } from '@/lib/types';

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  conflict: 'conflict',
  supersession: 'supersession',
  benign_variant: 'benign variant',
  unresolved: 'unresolved',
  consistent: 'consistent',
};

export function Badge({ of }: { of: Classification }) {
  return <span className={`badge badge-${of}`}>{CLASSIFICATION_LABELS[of]}</span>;
}

export function classificationLabel(of: Classification): string {
  return CLASSIFICATION_LABELS[of];
}

/**
 * A metric tile. `href` is not decoration: every headline on the scorecard
 * links to the graded rows it was computed from, so a reader who does not
 * believe a number can go and count it.
 */
export function Metric({
  label,
  value,
  sub,
  href,
  headline = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  headline?: boolean;
}) {
  const className = `metric${headline ? ' metric-headline' : ''}`;
  const body = (
    <>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** A rate rendered as a percentage over its own denominator, never bare. */
export function RateValue({ of }: { of: Rate }) {
  return (
    <>
      <span className="metric-value">{pct(of)}</span>
    </>
  );
}

export function countOf(r: Rate): string {
  return `${r.n} of ${r.of}`;
}

export function Bucket({ of }: { of: 'true_conflict' | 'hard_negative' }) {
  return (
    <span className={`chip bucket-${of}`}>
      {of === 'true_conflict' ? 'true conflict' : 'hard negative'}
    </span>
  );
}

export function PageHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      {children}
    </div>
  );
}

/** ISO timestamp → the form a reviewer reads in a document header. */
export function shortDate(iso: string): string {
  return iso.slice(0, 10);
}
