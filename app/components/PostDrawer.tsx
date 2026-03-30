'use client';

import { useState } from 'react';

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

const PLATFORM_LABELS: Record<string, string> = {
  linkedin_article: 'LinkedIn Article', linkedin_post: 'LinkedIn Post', linkedin: 'LinkedIn',
  email: 'Email', x: 'X / Twitter', twitter: 'X / Twitter',
  instagram_post: 'Instagram Post', instagram_reel: 'Instagram Reel',
  instagram_caption: 'Instagram Post', instagram: 'Instagram', carousel: 'Carousel',
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin_article: '#0a66c2', linkedin_post: '#0a66c2', linkedin: '#0a66c2',
  email: '#ea580c', x: '#fff', twitter: '#fff',
  instagram_post: '#e040a0', instagram_reel: '#e040a0',
  instagram_caption: '#e040a0', instagram: '#e040a0', carousel: '#8b5cf6',
};

export function PostDrawer({
  post,
  onUpdate,
  onClose,
}: {
  post: Post;
  onUpdate: (id: string, updates: { status?: string; draft_content?: string; chloe_notes?: string }) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(post.draft_content);
  const [description, setDescription] = useState(post.description || '');
  const [notes, setNotes] = useState(post.chloe_notes || '');
  const [showSources, setShowSources] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(post.scheduled_date);
  const [showRegen, setShowRegen] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const DESCRIPTION_LABELS: Record<string, string> = {
    linkedin_article: 'Article Description',
    linkedin_post: 'Key Takeaway',
    email: 'Subject Line',
    instagram_post: 'Image Overlay Hook',
    instagram_reel: 'Reel Caption',
    carousel: 'Carousel Summary',
    x: 'Description',
  };
  const descriptionLabel = DESCRIPTION_LABELS[post.platform] || 'Description';
  const hasDescription = !!(post.description || description);
  const hasChanges = content !== post.draft_content || notes !== (post.chloe_notes || '') || description !== (post.description || '');
  const platformColor = PLATFORM_COLORS[post.platform] || '#999';

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 999,
      }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px',
        background: '#141419', borderLeft: '1px solid rgba(255,255,255,0.06)',
        zIndex: 1000, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                fontSize: '13px', fontWeight: 700, color: platformColor,
              }}>
                {PLATFORM_LABELS[post.platform] || post.platform}
              </span>
              {post.post_type && (
                <span style={{
                  fontSize: '11px', color: 'rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px',
                }}>{post.post_type.replace(/_/g, ' ')}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
              {new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.4)',
            width: '30px', height: '30px', borderRadius: '8px', fontSize: '16px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>{'\u2715'}</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* Status */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: '20px',
              fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
              background: post.status === 'approved' ? 'rgba(74,222,128,0.1)' :
                post.status === 'rejected' ? 'rgba(248,113,113,0.1)' :
                post.status === 'scheduled' ? 'rgba(96,165,250,0.1)' : 'rgba(245,158,11,0.1)',
              color: post.status === 'approved' ? '#4ade80' :
                post.status === 'rejected' ? '#f87171' :
                post.status === 'scheduled' ? '#60a5fa' : '#f59e0b',
            }}>{post.status}</span>
          </div>

          {/* Content editor */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Draft Content
            </label>
            <button
              onClick={() => setPreviewMode(!previewMode)}
              style={{
                padding: '3px 10px', borderRadius: '5px', border: 'none',
                fontSize: '11px', fontWeight: 600,
                background: previewMode ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.06)',
                color: previewMode ? '#a855f7' : 'rgba(255,255,255,0.35)',
              }}
            >
              {previewMode ? 'Edit' : 'Preview'}
            </button>
          </div>
          {previewMode ? (
            <div
              dangerouslySetInnerHTML={{ __html: content }}
              style={{
                width: '100%', minHeight: '220px', padding: '16px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', fontSize: '14px', lineHeight: '1.7',
                color: '#e0e0e0', overflow: 'auto',
              }}
            />
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: '100%', minHeight: '220px', padding: '16px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', fontSize: '14px', lineHeight: '1.7',
                fontFamily: 'inherit', color: '#e0e0e0', resize: 'vertical',
              }}
            />
          )}
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '6px', textAlign: 'right' }}>
            {content.length} characters
          </div>

          {/* Description (for Reels and LinkedIn Articles) */}
          {hasDescription && (
            <>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '20px', marginBottom: '8px' }}>
                {descriptionLabel}
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '8px', color: 'rgba(255,255,255,0.2)' }}>
                  {post.platform === 'instagram_reel' ? '(text shown below the reel)' : '(teaser/summary)'}
                </span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={post.platform === 'instagram_reel' ? 'Caption that appears under the reel on Instagram...' : 'Short teaser or summary for the article...'}
                style={{
                  width: '100%', minHeight: '100px', padding: '14px',
                  background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)',
                  borderRadius: '10px', fontSize: '13px', lineHeight: '1.6',
                  fontFamily: 'inherit', color: '#e0e0e0', resize: 'vertical',
                }}
              />
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '4px', textAlign: 'right' }}>
                {description.length} characters
              </div>
            </>
          )}

          {/* Date */}
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '20px', marginBottom: '8px' }}>
            Scheduled Date
          </label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            style={{
              padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
              fontSize: '14px', color: '#e0e0e0', colorScheme: 'dark',
            }}
          />

          {/* Notes */}
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '20px', marginBottom: '8px' }}>
            Your Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add feedback or notes..."
            style={{
              width: '100%', minHeight: '80px', padding: '14px',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit',
              color: '#e0e0e0', resize: 'vertical',
            }}
          />

          {/* Graphic Prompt */}
          {(post.graphic_prompt || true) && (
            <>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '20px', marginBottom: '8px' }}>
                Graphic / Visual Idea
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '8px', color: 'rgba(255,255,255,0.15)' }}>
                  (creative direction for the image)
                </span>
              </label>
              <div style={{
                padding: '14px', borderRadius: '10px',
                background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.12)',
                fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.55)',
              }}>
                {post.graphic_prompt || <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.2)' }}>No graphic prompt yet. Regenerate the post to add one.</span>}
              </div>
            </>
          )}

          {/* Regenerate */}
          <button
            onClick={() => setShowRegen(!showRegen)}
            style={{
              marginTop: '20px', padding: '10px 14px', width: '100%', textAlign: 'left',
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
              borderRadius: '8px', fontSize: '12px', color: 'rgba(245,158,11,0.7)',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {'\u21BB'} Regenerate with instructions
          </button>

          {showRegen && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea
                value={regenInstructions}
                onChange={(e) => setRegenInstructions(e.target.value)}
                placeholder={"e.g. \"Add a CTA to comment below\", \"Promote the workshop but don't give the price away\""}
                style={{
                  width: '100%', minHeight: '80px', padding: '12px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.15)',
                  borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit',
                  color: '#e0e0e0', resize: 'vertical',
                }}
              />
              <button
                disabled={regenerating || !regenInstructions.trim()}
                onClick={async () => {
                  setRegenerating(true);
                  try {
                    const res = await fetch(`/api/posts/${post.id}/regenerate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ instructions: regenInstructions }),
                    });
                    if (res.ok) {
                      const updated = await res.json();
                      setContent(updated.draft_content);
                      setDescription(updated.description || '');
                      onUpdate(post.id, {
                        draft_content: updated.draft_content,
                        ...(updated.description ? {} : {}),
                      });
                      setShowRegen(false);
                      setRegenInstructions('');
                    }
                  } finally {
                    setRegenerating(false);
                  }
                }}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: regenerating || !regenInstructions.trim()
                    ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
                  color: '#fff', fontSize: '12px', fontWeight: 700,
                  opacity: regenerating || !regenInstructions.trim() ? 0.4 : 1,
                  alignSelf: 'flex-end',
                }}
              >
                {regenerating ? 'Regenerating...' : 'Regenerate Post'}
              </button>
            </div>
          )}

          {/* Source chunks */}
          {post.source_chunk_ids?.length > 0 && (
            <button
              onClick={() => setShowSources(!showSources)}
              style={{
                marginTop: '20px', padding: '10px 14px', width: '100%', textAlign: 'left',
                background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)',
                borderRadius: '8px', fontSize: '12px', color: 'rgba(168,85,247,0.7)',
              }}
            >
              {showSources ? '\u25B4' : '\u25BE'} Source Knowledge ({post.source_chunk_ids.length} chunks used)
            </button>
          )}

          {showSources && post.source_chunk_ids?.length > 0 && (
            <div style={{
              marginTop: '8px', padding: '14px', background: 'rgba(255,255,255,0.02)',
              borderRadius: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace',
            }}>
              {post.source_chunk_ids.map((id, i) => (
                <div key={id} style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  {i + 1}. {id}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: '10px', alignItems: 'center',
        }}>
          {hasChanges && (
            <button onClick={() => onUpdate(post.id, { draft_content: content, chloe_notes: notes || undefined })} style={{
              padding: '10px 18px', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
              color: '#e0e0e0', fontSize: '13px', fontWeight: 500,
            }}>Save</button>
          )}
          <button onClick={() => {
            if (!notes.trim()) { alert('Add a note explaining why.'); return; }
            onUpdate(post.id, { status: 'rejected', chloe_notes: notes });
          }} style={{
            padding: '10px 18px', background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px',
            color: '#f87171', fontSize: '13px', fontWeight: 600,
          }}>Reject</button>
          <button onClick={() => onUpdate(post.id, { status: 'approved', draft_content: content, chloe_notes: notes || undefined })} style={{
            padding: '10px 24px', background: 'linear-gradient(135deg, #059669, #10b981)',
            border: 'none', borderRadius: '8px',
            color: '#fff', fontSize: '13px', fontWeight: 700, marginLeft: 'auto',
          }}>Approve</button>
        </div>
      </div>
    </>
  );
}
