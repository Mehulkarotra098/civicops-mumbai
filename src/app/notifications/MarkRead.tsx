'use client';
import { useRouter } from 'next/navigation';
import { postJson } from '@/components/client';

export function MarkRead() {
  const router = useRouter();
  return <button className="btn-secondary" onClick={async () => { await postJson('/api/notifications/read', { all: true }); router.refresh(); }}>Mark all as read</button>;
}
