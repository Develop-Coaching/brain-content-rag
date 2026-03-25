import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Greg Brain - Content Approval',
  description: 'Content calendar review and approval for Develop Coaching',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#f5f5f5',
          color: '#1a1a1a',
        }}
      >
        <header
          style={{
            backgroundColor: '#1a1a1a',
            color: 'white',
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              Greg Brain
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#999' }}>
              Content Calendar &amp; Approval
            </p>
          </div>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Develop Coaching
          </span>
        </header>
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
