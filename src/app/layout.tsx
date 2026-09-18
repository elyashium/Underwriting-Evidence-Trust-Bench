import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <Link href="/" className="wordmark">
              Underwriting Evidence Trust Bench <span>· synthetic corpus</span>
            </Link>
            <Nav />
          </div>
        </header>

        <main className="shell">{children}</main>

        {/*
          The disclaimer is in the layout rather than on a single "about" page
          on purpose: any screenshot of any page carries it.
        */}
        <div className="shell">
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
      </body>
    </html>
  );
}
