import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { pct } from '@/lib/score';

import { bench } from './bench';
import { Nav } from './components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Underwriting Evidence Trust Bench',
    template: '%s · Trust Bench',
  },
  description:
    'An evaluation harness for cross-document extraction and reconciliation on ' +
    'synthetic commercial-auto submissions. Not a benchmark of any real product.',
};

/** Ledger-card mark: stacked dotted rows with a settled dot. Original artwork. */
function Mark() {
  return (
    <svg
      width="46"
      height="46"
      viewBox="0 0 46 46"
      role="img"
      aria-label="Trust Bench mark"
    >
      <rect x="4" y="4" width="38" height="38" rx="10" fill="none" stroke="#16130d" strokeWidth="3.5" />
      <line x1="12" y1="17" x2="27" y2="17" stroke="#16130d" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="0.5 6" />
      <line x1="12" y1="25" x2="34" y2="25" stroke="#16130d" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="0.5 6" />
      <circle cx="17" cy="33" r="3.4" fill="#16130d" />
      <line x1="24" y1="33" x2="34" y2="33" stroke="#16130d" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="0.5 6" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const { reference } = bench();

  return (
    <html lang="en">
      <body>
        <div className="frame">
          <aside className="rail">
            <Link href="/" className="mark" aria-label="Trust Bench home">
              <Mark />
            </Link>
            <p className="rail-tag">
              An evaluation harness for cross-document reconciliation
            </p>
            <Link href="/packets" className="bracket">
              <span className="br">{'{ '}</span>Start here
              <span className="br">{' }'}</span>
            </Link>
            <Nav />
            <div className="rail-foot">
              <div>
                FPR <b>{pct(reference.hardNegativePacketFpr)}</b> · recall{' '}
                <b>{pct(reference.conflictRecall)}</b>
              </div>
              <div>16 synthetic packets · v1.0</div>
            </div>
          </aside>

          <div className="body">
            <main className="shell">{children}</main>

            {/*
              The disclaimer is in the layout rather than on a single "about" page
              on purpose: any screenshot of any page carries it.
            */}
            <footer className="colophon">
              <p>
                <strong>Every document in this tool is synthetic.</strong> The insureds,
                vehicles, VINs, addresses, losses and carrier language were written for this
                project. No real submission, carrier system or ACORD form layout is
                reproduced. The underwriting guidelines the rules cite are illustrative
                inventions, not any carrier&rsquo;s real appetite, and nothing here is advice.
              </p>
              <p>
                <strong>This is a methodology demonstration, not a product benchmark.</strong>{' '}
                The two engines compared here are both mine. The scorecard measures the
                reference engine against hand-authored labels on sixteen packets I wrote —
                it does not measure, test, or estimate the behaviour of any commercial
                extraction product, and no result here should be read as a comparison
                against one.
              </p>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
