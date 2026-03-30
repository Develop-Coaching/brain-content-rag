'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteCalendarButton({ id, monthName }: { id: string; monthName: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete the ${monthName} calendar and all its posts? This can't be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/calendars/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    }
    setDeleting(false);
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      style={{
        position: 'absolute', top: '12px', right: '12px',
        background: 'rgba(255,255,255,0.04)', border: 'none',
        color: 'rgba(255,255,255,0.2)', width: '28px', height: '28px',
        borderRadius: '6px', fontSize: '14px', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        opacity: deleting ? 0.3 : 1, cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.15)'; e.currentTarget.style.color = '#f87171'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; }}
      title="Delete calendar"
    >
      {deleting ? '...' : '\u2715'}
    </button>
  );
}
