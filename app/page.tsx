import { getSupabase } from './lib/supabase';
import { DeleteCalendarButton } from './components/DeleteCalendarButton';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = getSupabase();
  const { data: calendars } = await supabase
    .from('greg_monthly_calendars')
    .select('id, month, themes, status, generated_at')
    .order('month', { ascending: false })
    .limit(12);

  const calendarIds = calendars?.map((c) => c.id) || [];
  const { data: posts } = calendarIds.length
    ? await supabase
        .from('greg_content_queue')
        .select('calendar_id, status')
        .in('calendar_id', calendarIds)
    : { data: [] };

  const postCounts: Record<string, { total: number; draft: number; approved: number }> = {};
  for (const p of posts || []) {
    if (!postCounts[p.calendar_id]) postCounts[p.calendar_id] = { total: 0, draft: 0, approved: 0 };
    postCounts[p.calendar_id].total++;
    if (p.status === 'draft') postCounts[p.calendar_id].draft++;
    if (p.status === 'approved') postCounts[p.calendar_id].approved++;
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

      {(!calendars || calendars.length === 0) && (
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
        {calendars?.map((cal) => {
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
              <DeleteCalendarButton id={cal.id} monthName={monthName} />

              <a href={`/content/review/${cal.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
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
