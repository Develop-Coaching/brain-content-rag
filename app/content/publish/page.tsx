'use client';

import { useEffect, useState, useCallback } from 'react';

interface QueuePost {
  id: string;
  platform: string;
  post_type: string | null;
  draft_content: string;
  description: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  publish_mode: string | null;
  image_urls: string[] | null;
  asset_url: string | null;
  published_url: string | null;
  last_publish_error: string | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  instagram_caption: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  email: 'Email',
};

export default function PublishWeeklyPage() {
  const [weekStart, setWeekStart] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  });
  const [posts, setPosts] = useState<QueuePost[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/publish/week?start=${weekStart}`);
      const json = await res.json();
      setPosts(json.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftWeek = (days: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + days);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const grouped = groupByDate(posts);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0, flex: 1 }}>Publish — week of {weekStart}</h1>
        <button onClick={() => shiftWeek(-7)}>← Prev</button>
        <button onClick={() => shiftWeek(7)}>Next →</button>
        <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </header>

      {Object.keys(grouped).length === 0 && (
        <p style={{ color: '#666' }}>No posts scheduled this week.</p>
      )}

      {Object.entries(grouped).map(([date, dayPosts]) => (
        <section key={date} style={{ marginBottom: 32 }}>
          <h2 style={{ borderBottom: '2px solid #1a1a2e', paddingBottom: 4 }}>
            {formatDay(date)}
          </h2>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {dayPosts.map((p) => (
              <PostCard key={p.id} post={p} onChange={load} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function PostCard({ post, onChange }: { post: QueuePost; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const image = post.image_urls?.[0] || post.asset_url;
  const time = post.scheduled_time
    ? new Date(post.scheduled_time).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  const copy = async () => {
    await navigator.clipboard.writeText(post.draft_content);
    alert('Copied caption');
  };

  const markPosted = async () => {
    if (!confirm('Mark this post as posted?')) return;
    setBusy(true);
    try {
      await fetch(`/api/posts/${post.id}/mark-posted`, { method: 'POST', body: JSON.stringify({}) });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article style={{
      border: '1px solid #ddd',
      borderRadius: 8,
      padding: 16,
      background: post.status === 'published' ? '#f0fff4' : '#fff',
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>{PLATFORM_LABEL[post.platform] ?? post.platform}</strong>
        <span style={{ fontSize: 12, color: '#666' }}>
          {time} · <Status post={post} />
        </span>
      </header>

      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" style={{ width: '100%', borderRadius: 4, marginBottom: 8 }} />
      )}

      <pre style={{
        whiteSpace: 'pre-wrap',
        font: 'inherit',
        fontSize: 13,
        background: '#fafafa',
        padding: 8,
        borderRadius: 4,
        maxHeight: 220,
        overflow: 'auto',
      }}>{post.draft_content}</pre>

      {post.last_publish_error && (
        <p style={{ color: '#c00', fontSize: 12 }}>Last error: {post.last_publish_error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={copy}>Copy caption</button>
        {image && <a href={image} download><button>Download image</button></a>}
        {post.status !== 'published' && (
          <button onClick={markPosted} disabled={busy}>
            {busy ? 'Saving…' : '✓ Mark posted'}
          </button>
        )}
        {post.published_url && (
          <a href={post.published_url} target="_blank" rel="noopener noreferrer">
            <button>View live</button>
          </a>
        )}
      </div>
    </article>
  );
}

function Status({ post }: { post: QueuePost }) {
  const color = post.status === 'published' ? '#2a7'
    : post.status === 'scheduled' ? '#1a1a2e'
    : post.status === 'approved' ? '#06c'
    : '#888';
  const label = post.publish_mode === 'manual' && post.status === 'published' ? 'posted (manual)'
    : post.status;
  return <span style={{ color }}>{label}</span>;
}

function groupByDate(posts: QueuePost[]): Record<string, QueuePost[]> {
  const out: Record<string, QueuePost[]> = {};
  for (const p of posts) {
    const k = p.scheduled_date ?? 'unscheduled';
    (out[k] ||= []).push(p);
  }
  return out;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
}
