import Link from 'next/link';
import { Icon } from '@/components/icons';

export default function Denied() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <Icon name="shield" className="mx-auto h-10 w-10 text-crit" />
      <h1 className="h1 mt-3">You do not have access to this page</h1>
      <p className="mt-2 text-sm text-muted">This area belongs to another role or another ward. If you think you should have access, ask a super admin to add a ward or department membership.</p>
      <Link href="/" className="btn-primary mt-5">Go to my home page</Link>
    </div>
  );
}
