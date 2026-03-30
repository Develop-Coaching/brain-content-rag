'use client';

import { useEffect, useState } from 'react';
import { CalendarView } from '../../../components/CalendarView';
import { PostDrawer } from '../../../components/PostDrawer';

interface Post {
  id: string;
  platform: string;
  post_type: string;
  draft_content: string;
  description: string | null;
  graphic_prompt: string | null;
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

export default function ReviewPage({ params }: { params: Promise<{ month: string }> }) {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthParam, setMonthParam] = useState<string>('');

  useEffect(() => {
    params.then((p) => { setMonthParam(p.month); loadData(p.month); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(month: string) {
    setLoading(true);
    const res = await fetch(`/api/posts?month=${month}`);
    const data = await res.json();
    setCalendar(data.calendar);
    setPosts(data.posts);
    setLoading(false);
  }

  async function updatePost(postId: string, updates: { status?: string; draft_content?: string; description?: string; chloe_notes?: string; scheduled_date?: string }) {
    const res = await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...updates } : p)));
      if (selectedPost?.id === postId) setSelectedPost({ ...selectedPost, ...updates });
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
      setPosts((prev) => prev.map((p) => draftIds.includes(p.id) ? { ...p, status: 'approved' } : p));
    }
  }

  async function triggerSchedule() {
    const res = await fetch('/api/schedule', { method: 'POST' });
    if (res.ok) loadData(monthParam);
  }

  async function deletePost(postId: string) {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      if (selectedPost?.id === postId) setSelectedPost(null);
    }
  }

  async function deleteWeek(postIds: string[]) {
    for (const id of postIds) {
      await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    }
    setPosts(prev => prev.filter(p => !postIds.includes(p.id)));
    if (selectedPost && postIds.includes(selectedPost.id)) setSelectedPost(null);
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.25)' }}>
        <div style={{ fontSize: '28px', marginBottom: '12px', animation: 'pulse 2s infinite' }}>&#9881;</div>
        Loading content plan...
      </div>
    );
  }

  if (!calendar) {
    return (
      <div style={{ textAlign: 'center', padding: '80px' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.2 }}>&#128196;</div>
        <p style={{ color: 'rgba(255,255,255,0.3)' }}>No calendar found for this month.</p>
        <a href="/" style={{ fontSize: '13px', color: '#7c3aed', marginTop: '8px', display: 'inline-block' }}>
          {'\u2190'} Back to calendars
        </a>
      </div>
    );
  }

  const draftCount = posts.filter((p) => p.status === 'draft').length;
  const approvedCount = posts.filter((p) => p.status === 'approved').length;
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;

  const monthDate = new Date(calendar.month + 'T00:00:00');
  const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <a href="/" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
          {'\u2190'} All Calendars
        </a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>{monthName}</h2>
            {calendar.themes && (
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {calendar.themes.map((theme, i) => (
                  <span key={i} style={{
                    fontSize: '11px', padding: '3px 10px', borderRadius: '6px',
                    background: 'rgba(124,58,237,0.1)', color: 'rgba(168,85,247,0.7)',
                  }}>{theme}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Stats */}
            <div style={{ display: 'flex', gap: '12px', fontSize: '12px', marginRight: '8px' }}>
              {draftCount > 0 && <span style={{ color: '#f59e0b' }}>{draftCount} draft</span>}
              {approvedCount > 0 && <span style={{ color: '#4ade80' }}>{approvedCount} approved</span>}
              {scheduledCount > 0 && <span style={{ color: '#60a5fa' }}>{scheduledCount} scheduled</span>}
            </div>

            {draftCount > 0 && (
              <button onClick={bulkApprove} style={{
                padding: '9px 18px', background: 'linear-gradient(135deg, #059669, #10b981)',
                border: 'none', borderRadius: '8px', color: '#fff',
                fontSize: '13px', fontWeight: 600,
              }}>
                Approve All ({draftCount})
              </button>
            )}

            {approvedCount > 0 && (
              <button onClick={triggerSchedule} style={{
                padding: '9px 18px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                border: 'none', borderRadius: '8px', color: '#fff',
                fontSize: '13px', fontWeight: 600,
              }}>
                Schedule ({approvedCount})
              </button>
            )}
          </div>
        </div>
      </div>

      <CalendarView posts={posts} month={monthDate} themes={calendar.themes} onSelectPost={setSelectedPost} onDeletePost={deletePost} onDeleteWeek={deleteWeek} />

      {selectedPost && (
        <PostDrawer post={selectedPost} onUpdate={updatePost} onDelete={deletePost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  );
}
