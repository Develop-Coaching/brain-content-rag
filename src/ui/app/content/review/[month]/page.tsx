'use client';

import { useEffect, useState } from 'react';
import { CalendarView } from '../../../components/CalendarView';
import { PostDrawer } from '../../../components/PostDrawer';

interface Post {
  id: string;
  platform: string;
  post_type: string;
  draft_content: string;
  source_chunk_ids: string[];
  scheduled_date: string;
  status: string;
  chloe_notes: string | null;
}

interface Calendar {
  id: string;
  month: string;
  themes: string[];
  status: string;
}

export default function ReviewPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthParam, setMonthParam] = useState<string>('');

  useEffect(() => {
    params.then((p) => {
      setMonthParam(p.month);
      loadData(p.month);
    });
  }, [params]);

  async function loadData(month: string) {
    setLoading(true);
    const res = await fetch(`/api/posts?month=${month}`);
    const data = await res.json();
    setCalendar(data.calendar);
    setPosts(data.posts);
    setLoading(false);
  }

  async function updatePost(
    postId: string,
    updates: { status?: string; draft_content?: string; chloe_notes?: string }
  ) {
    const res = await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, ...updates } : p))
      );
      if (selectedPost?.id === postId) {
        setSelectedPost({ ...selectedPost, ...updates });
      }
    }
  }

  async function bulkApprove() {
    const draftIds = posts.filter((p) => p.status === 'draft').map((p) => p.id);
    if (draftIds.length === 0) return;

    const res = await fetch('/api/posts/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: draftIds }),
    });

    if (res.ok) {
      setPosts((prev) =>
        prev.map((p) =>
          draftIds.includes(p.id) ? { ...p, status: 'approved' } : p
        )
      );
    }
  }

  async function triggerSchedule() {
    const res = await fetch('/api/schedule', { method: 'POST' });
    if (res.ok) {
      loadData(monthParam);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
        Loading...
      </div>
    );
  }

  if (!calendar) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
        No calendar found for this month.
      </div>
    );
  }

  const draftCount = posts.filter((p) => p.status === 'draft').length;
  const approvedCount = posts.filter((p) => p.status === 'approved').length;
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;

  const monthDate = new Date(calendar.month);
  const monthName = monthDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <a
            href="/"
            style={{ fontSize: '13px', color: '#666', textDecoration: 'none' }}
          >
            &larr; All Calendars
          </a>
          <h2 style={{ margin: '4px 0 0 0' }}>{monthName}</h2>
          {calendar.themes && (
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
              Themes: {calendar.themes.join(' / ')}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>
            {draftCount} draft / {approvedCount} approved / {scheduledCount}{' '}
            scheduled
          </span>

          {draftCount > 0 && (
            <button
              onClick={bulkApprove}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2e7d32',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Approve All ({draftCount})
            </button>
          )}

          {approvedCount > 0 && (
            <button
              onClick={triggerSchedule}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1565c0',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Schedule Approved ({approvedCount})
            </button>
          )}
        </div>
      </div>

      <CalendarView
        posts={posts}
        month={monthDate}
        onSelectPost={setSelectedPost}
      />

      {selectedPost && (
        <PostDrawer
          post={selectedPost}
          onUpdate={updatePost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
