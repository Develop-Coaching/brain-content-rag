'use client';

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

const PLATFORM_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  linkedin_article: { icon: 'in', color: '#0a66c2', bg: 'rgba(10,102,194,0.15)', label: 'LinkedIn Article' },
  linkedin_post: { icon: 'in', color: '#0a66c2', bg: 'rgba(10,102,194,0.12)', label: 'LinkedIn Post' },
  linkedin: { icon: 'in', color: '#0a66c2', bg: 'rgba(10,102,194,0.12)', label: 'LinkedIn' },
  email: { icon: '\u2709', color: '#ea580c', bg: 'rgba(234,88,12,0.12)', label: 'Email' },
  x: { icon: 'X', color: '#fff', bg: 'rgba(255,255,255,0.08)', label: 'X / Twitter' },
  twitter: { icon: 'X', color: '#fff', bg: 'rgba(255,255,255,0.08)', label: 'X / Twitter' },
  instagram_post: { icon: 'IG', color: '#e040a0', bg: 'rgba(224,64,160,0.12)', label: 'Instagram Post' },
  instagram_reel: { icon: '\u25B6', color: '#e040a0', bg: 'rgba(224,64,160,0.18)', label: 'Instagram Reel' },
  instagram_caption: { icon: 'IG', color: '#e040a0', bg: 'rgba(224,64,160,0.12)', label: 'Instagram Post' },
  instagram: { icon: 'IG', color: '#e040a0', bg: 'rgba(224,64,160,0.12)', label: 'Instagram' },
  carousel: { icon: '\u25a3', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: 'Carousel' },
};

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  draft: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  approved: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  scheduled: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  published: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
};

const POST_TYPE_LABELS: Record<string, string> = {
  hook_post: 'Hook',
  story_post: 'Story',
  framework_post: 'Framework',
  carousel: 'Carousel',
  contrarian_hook: 'Contrarian Hook',
  personal_letter: 'Personal Letter',
  one_liner: 'One-liner',
  tactical_advice: 'Tactical',
  practical_guide: 'Guide',
  tough_love: 'Tough Love',
  personal_story: 'Story',
  contrarian_take: 'Contrarian',
  process_breakdown: 'Breakdown',
  step_by_step: 'Step-by-step',
  industry_insight: 'Insight',
  reality_check: 'Reality Check',
  pricing_reality: 'Pricing',
  tactical_framework: 'Framework',
  pricing_guide: 'Pricing Guide',
  behind_scenes: 'Behind the Scenes',
  hard_truth: 'Hard Truth',
  team_focus: 'Team Focus',
  margin_focus: 'Margins',
  year_end_advice: 'Year End',
  profit_focus: 'Profit',
  framework_breakdown: 'Framework',
};

export function CalendarView({
  posts,
  month,
  themes,
  onSelectPost,
}: {
  posts: Post[];
  themes?: string[];
  month: Date;
  onSelectPost: (post: Post) => void;
}) {
  // Group posts by week
  const weeks: { weekNum: number; startDate: Date; endDate: Date; posts: Post[] }[] = [];

  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  for (let w = 0; w < 5; w++) {
    const startDay = w * 7 + 1;
    if (startDay > daysInMonth) break;
    const endDay = Math.min((w + 1) * 7, daysInMonth);
    const startDate = new Date(year, monthIdx, startDay);
    const endDate = new Date(year, monthIdx, endDay);

    const weekPosts = posts.filter((p) => {
      const d = new Date(p.scheduled_date + 'T00:00:00');
      return d >= startDate && d <= endDate;
    });

    // Also catch posts slightly outside month bounds (edge cases)
    if (w === 0) {
      const beforeMonth = posts.filter((p) => {
        const d = new Date(p.scheduled_date + 'T00:00:00');
        return d < startDate;
      });
      weekPosts.push(...beforeMonth);
    }
    if (w === 4 || startDay + 6 >= daysInMonth) {
      const afterMonth = posts.filter((p) => {
        const d = new Date(p.scheduled_date + 'T00:00:00');
        return d > endDate;
      });
      weekPosts.push(...afterMonth);
    }

    weeks.push({ weekNum: w + 1, startDate, endDate, posts: weekPosts });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {weeks.map((week) => (
        <div key={week.weekNum} style={{
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '14px',
          border: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}>
          {/* Week header */}
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '12px', fontWeight: 700, color: '#7c3aed',
                background: 'rgba(124,58,237,0.12)', padding: '3px 10px', borderRadius: '6px',
              }}>
                WEEK {week.weekNum}
              </span>
              {themes && themes[week.weekNum - 1] && (
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  {themes[week.weekNum - 1]}
                </span>
              )}
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>
                {week.startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {' \u2013 '}
                {week.endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
              {week.posts.length} post{week.posts.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Posts */}
          {week.posts.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: '13px' }}>
              No posts scheduled
            </div>
          ) : (
            <div style={{ padding: '8px' }}>
              {week.posts.map((post) => {
                const platform = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.email;
                const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                const typeLabel = POST_TYPE_LABELS[post.post_type] || post.post_type || '';
                const postDate = new Date(post.scheduled_date + 'T00:00:00');
                const dayName = postDate.toLocaleDateString('en-GB', { weekday: 'short' });
                const dayNum = postDate.getDate();

                return (
                  <button
                    key={post.id}
                    onClick={() => onSelectPost(post)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '14px',
                      width: '100%', padding: '14px 16px', marginBottom: '4px',
                      background: 'transparent', border: 'none', borderRadius: '10px',
                      textAlign: 'left', color: '#e0e0e0', transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Date */}
                    <div style={{ minWidth: '40px', textAlign: 'center', paddingTop: '2px' }}>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontWeight: 600 }}>{dayName}</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', lineHeight: 1.2 }}>{dayNum}</div>
                    </div>

                    {/* Platform icon */}
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: platform.bg, color: platform.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 800, flexShrink: 0,
                    }}>
                      {platform.icon}
                    </div>

                    {/* Content preview */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{platform.label}</span>
                        {typeLabel && (
                          <span style={{
                            fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
                            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)',
                            fontWeight: 500,
                          }}>{typeLabel}</span>
                        )}
                        <span style={{
                          fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
                          background: status.bg, color: status.color,
                          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px',
                          marginLeft: 'auto',
                        }}>{post.status}</span>
                      </div>
                      {post.description && (
                        <div style={{
                          fontSize: '12px', color: 'rgba(168,85,247,0.6)', lineHeight: '1.4',
                          marginBottom: '4px', fontStyle: 'italic',
                        }}>
                          {post.description.slice(0, 120)}{post.description.length > 120 ? '...' : ''}
                        </div>
                      )}
                      <div style={{
                        fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.45',
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {post.draft_content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
