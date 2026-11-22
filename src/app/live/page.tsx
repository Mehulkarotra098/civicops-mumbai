// Public live dashboard for the projector. No sign-in; the data feed carries no personal data.
import { pageMeta } from '@/lib/seo';
import type { Metadata } from 'next';
import { SyntheticNote } from '@/components/ui';
import LiveDashboard from './LiveDashboard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMeta('Mumbai live: service and spending', 'Every ward on a real map of Mumbai, every urgent ticket, deadline health and spending flags, updating live.');

export default function LivePage() {
  return (
    <div className="-mx-4 -my-6 sm:mx-0 sm:my-0">
      <div className="overflow-hidden sm:rounded-2xl sm:shadow-xl">
        <LiveDashboard />
      </div>
      <div className="px-4 py-3 sm:px-0">
        <SyntheticNote>
          Spending figures, wards and contractors are synthetic data from the Claude Impact Lab repo, not BMC records. Ticket figures update live from
          reports filed in this app; no reporter details are shown.
        </SyntheticNote>
      </div>
    </div>
  );
}
