'use client';

interface Post {
  id: string;
  platform: string;
  post_type: string;
  draft_content: string;
  scheduled_date: string;
  status: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: 'in',
  email: '@',
  x: 'X',
  instagram_caption: 'IG',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#fff3e0', text: '#e65100' },
  approved: { bg: '#e8f5e9', text: '#2e7d32' },
  scheduled: { bg: '#e3f2fd', text: '#1565c0' },
  published: { bg: '#f3e5f5', text: '#7b1fa2' },
  rejected: { bg: '#ffebee', text: '#c62828' },
};

export function CalendarView({
  posts,
  month,
  onSelectPost,
}: {
  posts: Post[];
  month: Date;
  onSelectPost: (post: Post) => void;
}) {
  // Build a grid of days for the month
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, monthIdx, 1).getDay();

  // Group posts by date
  const postsByDate: Record<string, Post[]> = {};
  for (const post of posts) {
    const dateKey = post.scheduled_date;
    if (!postsByDate[dateKey]) postsByDate[dateKey] = [];
    postsByDate[dateKey].push(post);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells: (number | null)[] = [];

  // Leading empty cells
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  return (
    <div>
      {/* Day headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '1px',
          marginBottom: '1px',
        }}
      >
        {dayNames.map((name) => (
          <div
            key={name}
            style={{
              padding: '8px',
              textAlign: 'center',
              fontSize: '12px',
              fontWeight: 600,
              color: '#666',
              backgroundColor: '#e0e0e0',
            }}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '1px',
          backgroundColor: '#e0e0e0',
        }}
      >
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <div
                key={`empty-${idx}`}
                style={{ backgroundColor: '#fafafa', minHeight: '100px' }}
              />
            );
          }

          const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayPosts = postsByDate[dateStr] || [];

          return (
            <div
              key={day}
              style={{
                backgroundColor: 'white',
                minHeight: '100px',
                padding: '4px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#666',
                  marginBottom: '4px',
                }}
              >
                {day}
              </div>

              {dayPosts.map((post) => {
                const colors = STATUS_COLORS[post.status] || STATUS_COLORS.draft;
                return (
                  <button
                    key={post.id}
                    onClick={() => onSelectPost(post)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      width: '100%',
                      padding: '3px 6px',
                      marginBottom: '2px',
                      backgroundColor: colors.bg,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: colors.text,
                        minWidth: '16px',
                      }}
                    >
                      {PLATFORM_ICONS[post.platform] || post.platform}
                    </span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: '#333',
                      }}
                    >
                      {post.post_type || post.draft_content.slice(0, 30)}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
