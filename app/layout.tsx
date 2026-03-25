import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Greg Brain - Content Engine',
  description: 'Content calendar review and approval for Develop Coaching',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; background: #0a0a0f; color: #e0e0e0; min-height: 100vh; }
          a { color: inherit; text-decoration: none; }
          button { font-family: inherit; cursor: pointer; }
          ::selection { background: rgba(124,58,237,0.3); }
        `}</style>
      </head>
      <body>
        <header style={{
          background: 'linear-gradient(135deg, #13131a 0%, #1a1a2e 100%)',
          padding: '14px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', fontWeight: 700, color: 'white',
            }}>G</div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>Greg Brain</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>Content Engine</div>
            </div>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
            Develop Coaching
          </div>
        </header>
        <main style={{ maxWidth: '1060px', margin: '0 auto', padding: '32px 24px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
