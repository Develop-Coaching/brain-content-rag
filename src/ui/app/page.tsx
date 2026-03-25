import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { data: calendars } = await supabase
    .from('greg_monthly_calendars')
    .select('id, month, themes, status, generated_at')
    .order('month', { ascending: false })
    .limit(12);

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>Content Calendars</h2>

      {(!calendars || calendars.length === 0) && (
        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            padding: '40px',
            textAlign: 'center',
            color: '#666',
          }}
        >
          <p>No content calendars yet.</p>
          <p style={{ fontSize: '14px' }}>
            Run <code>npm run monthly</code> to generate your first content plan.
          </p>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
        }}
      >
        {calendars?.map((cal) => {
          const monthDate = new Date(cal.month);
          const monthName = monthDate.toLocaleString('default', {
            month: 'long',
            year: 'numeric',
          });
          const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

          return (
            <a
              key={cal.id}
              href={`/content/review/${monthKey}`}
              style={{
                background: 'white',
                borderRadius: '8px',
                padding: '20px',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid #e0e0e0',
                transition: 'box-shadow 0.2s',
              }}
            >
              <h3 style={{ margin: '0 0 8px 0' }}>{monthName}</h3>
              <div
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor:
                    cal.status === 'approved'
                      ? '#e8f5e9'
                      : cal.status === 'published'
                        ? '#e3f2fd'
                        : '#fff3e0',
                  color:
                    cal.status === 'approved'
                      ? '#2e7d32'
                      : cal.status === 'published'
                        ? '#1565c0'
                        : '#e65100',
                }}
              >
                {cal.status}
              </div>
              {cal.themes && cal.themes.length > 0 && (
                <div style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
                  {cal.themes.join(' / ')}
                </div>
              )}
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
                Generated{' '}
                {new Date(cal.generated_at).toLocaleDateString()}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
