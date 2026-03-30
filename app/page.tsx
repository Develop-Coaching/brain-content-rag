'use client';

import { useEffect, useState } from 'react';

interface Calendar {
  id: string;
  month: string;
  themes: string[];
  status: string;
  generated_at: string;
}

export default function HomePage() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [postCounts, setPostCounts] = useState<Record<string, { total: number; draft: number; approved: number }>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const res = await fetch('/api/calendars');
    const data = await res.json();
    setCalendars(data.calendars || []);
    setPostCounts(data.postCounts || {});
    setLoading(false);
  }

  async function handleDelete(id: string, monthName: string) {
    if (!confirm(`Delete the ${monthName} calendar and all its posts? This can't be undone.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/calendars/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCalendars(prev => prev.filter(c => c.id !== id));
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.25)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>
            Content Calendars
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
            Monthly content plans generated from Greg's knowledge base
          </p>
        </div>
        <a href="/generate" style={{
          padding: '10px 20px', borderRadius: '8px',
          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
          color: '#fff', fontSize: '13px', fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: '6px',
        }}>
          + Generate New Month
        </a>
      </div>

      {calendars.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>&#128196;</div>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>No content calendars yet.</p>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>
            Click <strong>Generate New Month</strong> to create your first plan.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {calendars.map((cal) => {
          const monthDate = new Date(cal.month + 'T00:00:00');
          const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
          const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
          const counts = postCounts[cal.id] || { total: 0, draft: 0, approved: 0 };
          const statusColor = cal.status === 'approved' ? '#4ade80' : cal.status === 'published' ? '#60a5fa' : '#f59e0b';

          return (
            <div key={cal.id} style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
              borderRadius: '14px', padding: '24px',
              border: '1px solid rgba(255,255,255,0.06)',
              position: 'relative',
            }}>
              {/* Delete button */}
              <button
                onClick={(e) => { e.preventDefault(); handleDelete(cal.id, monthName); }}
                disabled={deleting === cal.id}
                style={{
                  position: 'absolute', top: '12px', right: '12px',
                  background: 'rgba(255,255,255,0.04)', border: 'none',
                  color: 'rgba(255,255,255,0.2)', width: '28px', height: '28px',
                  borderRadius: '6px', fontSize: '14px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  opacity: deleting === cal.id ? 0.3 : 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.15)'; e.currentTarget.style.color = '#f87171'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; }}
                title="Delete calendar"
              >
                {deleting === cal.id ? '...' : '\u2715'}
              </button>

              <a href={`/content/review/${monthKey}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: '28px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>{monthName}</h3>
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                    background: `${statusColor}18`, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>{cal.status}</span>
                </div>

                {cal.themes && cal.themes.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {cal.themes.map((theme: string, i: number) => (
                      <span key={i} style={{
                        fontSize: '11px', padding: '3px 10px', borderRadius: '6px',
                        background: 'rgba(124,58,237,0.12)', color: 'rgba(168,85,247,0.8)',
                      }}>{theme}</span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: '18px', display: 'flex', gap: '16px', fontSize: '13px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <strong style={{ color: '#fff' }}>{counts.total}</strong> posts
                  </span>
                  {counts.draft > 0 && (
                    <span style={{ color: '#f59e0b' }}>{counts.draft} to review</span>
                  )}
                  {counts.approved > 0 && (
                    <span style={{ color: '#4ade80' }}>{counts.approved} approved</span>
                  )}
                </div>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
