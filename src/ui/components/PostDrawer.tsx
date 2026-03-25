'use client';

import { useState } from 'react';

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

export function PostDrawer({
  post,
  onUpdate,
  onClose,
}: {
  post: Post;
  onUpdate: (
    id: string,
    updates: { status?: string; draft_content?: string; chloe_notes?: string }
  ) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(post.draft_content);
  const [notes, setNotes] = useState(post.chloe_notes || '');
  const [showSources, setShowSources] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(post.scheduled_date);

  const hasChanges =
    content !== post.draft_content || notes !== (post.chloe_notes || '');

  function handleApprove() {
    onUpdate(post.id, {
      status: 'approved',
      draft_content: content,
      chloe_notes: notes || undefined,
    });
  }

  function handleReject() {
    if (!notes.trim()) {
      alert('Please add a note explaining why this post was rejected.');
      return;
    }
    onUpdate(post.id, {
      status: 'rejected',
      chloe_notes: notes,
    });
  }

  function handleSave() {
    onUpdate(post.id, {
      draft_content: content,
      chloe_notes: notes || undefined,
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '480px',
        backgroundColor: 'white',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: '480px',
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 999,
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                textTransform: 'uppercase',
                color: '#666',
              }}
            >
              {post.platform}
            </span>
            {post.post_type && (
              <span
                style={{
                  fontSize: '12px',
                  color: '#999',
                  backgroundColor: '#f5f5f5',
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}
              >
                {post.post_type}
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
            Scheduled: {new Date(scheduledDate).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: '#666',
            padding: '4px 8px',
          }}
        >
          x
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {/* Status badge */}
        <div style={{ marginBottom: '16px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor:
                post.status === 'approved'
                  ? '#e8f5e9'
                  : post.status === 'rejected'
                    ? '#ffebee'
                    : post.status === 'scheduled'
                      ? '#e3f2fd'
                      : '#fff3e0',
              color:
                post.status === 'approved'
                  ? '#2e7d32'
                  : post.status === 'rejected'
                    ? '#c62828'
                    : post.status === 'scheduled'
                      ? '#1565c0'
                      : '#e65100',
            }}
          >
            {post.status}
          </span>
        </div>

        {/* Editable content */}
        <label
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#666',
            display: 'block',
            marginBottom: '4px',
          }}
        >
          Draft Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
            lineHeight: '1.6',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            fontSize: '12px',
            color: '#999',
            marginTop: '4px',
            textAlign: 'right',
          }}
        >
          {content.length} chars
        </div>

        {/* Scheduled date picker */}
        <label
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#666',
            display: 'block',
            marginTop: '16px',
            marginBottom: '4px',
          }}
        >
          Scheduled Date
        </label>
        <input
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />

        {/* Notes */}
        <label
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#666',
            display: 'block',
            marginTop: '16px',
            marginBottom: '4px',
          }}
        >
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes for this post..."
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        {/* Source chunks toggle */}
        <button
          onClick={() => setShowSources(!showSources)}
          style={{
            marginTop: '16px',
            padding: '8px 12px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            color: '#666',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {showSources ? 'Hide' : 'Show'} Source Chunks (
          {post.source_chunk_ids?.length || 0})
        </button>

        {showSources && post.source_chunk_ids?.length > 0 && (
          <div
            style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#fafafa',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#666',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
              Knowledge base chunks used to generate this post:
            </p>
            {post.source_chunk_ids.map((id, i) => (
              <div
                key={id}
                style={{
                  padding: '4px 0',
                  borderBottom: '1px solid #eee',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                }}
              >
                {i + 1}. {id}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          gap: '8px',
        }}
      >
        {hasChanges && (
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Save Changes
          </button>
        )}
        <button
          onClick={handleReject}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          style={{
            padding: '8px 16px',
            backgroundColor: '#2e7d32',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            marginLeft: 'auto',
          }}
        >
          Approve
        </button>
      </div>
    </div>
  );
}
