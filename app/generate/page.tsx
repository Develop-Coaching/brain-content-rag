'use client';

import { useState } from 'react';

type WeekMode = 'auto' | 'custom';

interface ContentMix {
  linkedin_article: number;
  linkedin_post: number;
  email: number;
  x: number;
  instagram_post: number;
  instagram_reel: number;
  carousel: number;
}

const DEFAULT_MIX: ContentMix = {
  linkedin_article: 1,
  linkedin_post: 1,
  email: 1,
  x: 1,
  instagram_post: 1,
  instagram_reel: 1,
  carousel: 1,
};

const CONTENT_TYPES: { key: keyof ContentMix; label: string; icon: string; color: string }[] = [
  { key: 'linkedin_article', label: 'LinkedIn Article', icon: 'in', color: '#0a66c2' },
  { key: 'linkedin_post', label: 'LinkedIn Post', icon: 'in', color: '#0a66c2' },
  { key: 'email', label: 'Email', icon: '\u2709', color: '#ea580c' },
  { key: 'x', label: 'X / Twitter', icon: 'X', color: '#fff' },
  { key: 'instagram_post', label: 'Instagram Post', icon: 'IG', color: '#e040a0' },
  { key: 'instagram_reel', label: 'Instagram Reel', icon: '\u25B6', color: '#e040a0' },
  { key: 'carousel', label: 'Carousel', icon: '\u25a3', color: '#8b5cf6' },
];

interface WeekConfig {
  mode: WeekMode;
  theme: string;
  instructions: string;
  file: File | null;
  fileName: string;
  contentMix: ContentMix;
  showMix: boolean;
}

function newWeek(): WeekConfig {
  return { mode: 'auto', theme: '', instructions: '', file: null, fileName: '', contentMix: { ...DEFAULT_MIX }, showMix: false };
}

export default function GeneratePage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    now.setMonth(now.getMonth() + 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [weeks, setWeeks] = useState<WeekConfig[]>([newWeek(), newWeek(), newWeek(), newWeek()]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ reviewUrl: string; postsCreated: number; themes: string[] } | null>(null);
  const [error, setError] = useState('');

  function updateWeek(i: number, updates: Partial<WeekConfig>) {
    setWeeks(prev => prev.map((w, idx) => idx === i ? { ...w, ...updates } : w));
  }

  function updateMix(weekIdx: number, key: keyof ContentMix, value: number) {
    setWeeks(prev => prev.map((w, idx) => {
      if (idx !== weekIdx) return w;
      return { ...w, contentMix: { ...w.contentMix, [key]: Math.max(0, Math.min(5, value)) } };
    }));
  }

  function setAllAuto() {
    setWeeks(prev => prev.map(w => ({ ...w, mode: 'auto' as WeekMode })));
  }

  function setAllCustom() {
    setWeeks(prev => prev.map(w => ({ ...w, mode: 'custom' as WeekMode })));
  }

  function removeWeek(i: number) {
    setWeeks(prev => prev.filter((_, idx) => idx !== i));
  }

  function addWeek() {
    setWeeks(prev => [...prev, newWeek()]);
  }

  function getWeekPostCount(mix: ContentMix): number {
    return Object.values(mix).reduce((sum, n) => sum + n, 0);
  }

  const customThemes = weeks
    .map((w, i) => ({ week: i + 1, theme: w.mode === 'custom' ? w.theme.trim() : '' }))
    .filter(w => w.theme.length > 0);
  const autoWeeks = weeks.filter(w => w.mode === 'auto').length;
  const customWeeksWithContent = customThemes.length;
  const customWeeksMissing = weeks.filter(w => w.mode === 'custom' && !w.theme.trim()).length;
  const totalPosts = weeks.reduce((sum, w) => sum + getWeekPostCount(w.contentMix), 0);
  const canGenerate = !generating && customWeeksMissing === 0 && totalPosts > 0;

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    setResult(null);
    setProgress('Generating themes and content... this takes 1-2 minutes.');

    try {
      const weekData = await Promise.all(weeks.map(async (w, i) => {
        let fileContent: string | null = null;
        if (w.file) {
          fileContent = await w.file.text();
        }
        return {
          week: i + 1,
          mode: w.mode,
          theme: w.mode === 'custom' ? w.theme.trim() : null,
          instructions: (w.instructions || '').trim() || null,
          fileContent,
          fileName: w.fileName || null,
          contentMix: w.contentMix,
        };
      }));

      setProgress(`Generating themes for ${weeks.length} weeks...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 290000);

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          mode: 'mixed',
          weeks: weekData,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          res.status === 504 || responseText.includes('<!DOCTYPE')
            ? 'The request timed out. This usually means your Vercel plan doesn\'t support long-running functions. The generate endpoint needs up to 5 minutes — Vercel Hobby plans cap at 10 seconds. Upgrade to Vercel Pro, or run generation locally with `npm run monthly`.'
            : `Server error (${res.status})`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setResult(data);
      setProgress('');
    } catch (e) {
      console.error('Generate error:', e);
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setProgress('');
    } finally {
      setGenerating(false);
    }
  }

  const [monthYear, monthNum] = month.split('-');
  const monthName = new Date(Number(monthYear), Number(monthNum) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div style={{ maxWidth: '680px' }}>
      <a href="/" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}>
        {'\u2190'} Back
      </a>
      <h2 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>
        Generate Content Plan
      </h2>
      <p style={{ margin: '0 0 32px', fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
        Create a full month of content in Greg's voice. Pick auto or custom for each week.
      </p>

      {/* Month picker */}
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
        Month
      </label>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        style={{
          padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
          fontSize: '14px', color: '#e0e0e0', colorScheme: 'dark', width: '100%',
        }}
      />

      {/* Quick toggles */}
      <div style={{ marginTop: '28px', display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: '28px' }}>
          Weekly Themes
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button onClick={setAllAuto} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600,
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
          }}>All Auto</button>
          <button onClick={setAllCustom} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600,
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
          }}>All Custom</button>
        </div>
      </div>

      {/* Week rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {weeks.map((week, i) => {
          const weekPostCount = getWeekPostCount(week.contentMix);
          return (
            <div key={i} style={{
              padding: '14px 16px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              position: 'relative',
            }}>
              {/* Top row: week label, mode toggle, remove */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: week.mode === 'custom' || week.showMix ? '12px' : '0' }}>
                {/* Week label */}
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#7c3aed',
                  background: 'rgba(124,58,237,0.12)', padding: '4px 9px', borderRadius: '6px',
                  minWidth: '30px', textAlign: 'center', flexShrink: 0,
                }}>W{i + 1}</span>

                {/* Mode toggle */}
                <button
                  onClick={() => updateWeek(i, { mode: week.mode === 'auto' ? 'custom' : 'auto' })}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600,
                    background: week.mode === 'auto' ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)',
                    color: week.mode === 'auto' ? '#4ade80' : '#f59e0b',
                    minWidth: '70px', flexShrink: 0,
                  }}
                >
                  {week.mode === 'auto' ? '\u2713 Auto' : '\u270E Custom'}
                </button>

                {/* Content mix toggle */}
                <button
                  onClick={() => updateWeek(i, { showMix: !week.showMix })}
                  style={{
                    padding: '5px 10px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600,
                    background: week.showMix ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                    color: week.showMix ? '#60a5fa' : 'rgba(255,255,255,0.3)',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  {weekPostCount} posts {week.showMix ? '\u25B4' : '\u25BE'}
                </button>

                {/* Auto description */}
                {week.mode === 'auto' && !week.showMix && (
                  <span style={{ flex: 1, fontSize: '12px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                    Auto theme from seasonal context
                  </span>
                )}

                {/* Remove button */}
                {weeks.length > 1 && (
                  <button
                    onClick={() => removeWeek(i)}
                    title="Remove this week"
                    style={{
                      background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)',
                      fontSize: '14px', cursor: 'pointer', padding: '2px 6px',
                      borderRadius: '4px', lineHeight: 1, marginLeft: 'auto', flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.15)')}
                  >{'\u2715'}</button>
                )}
              </div>

              {/* Content mix selector */}
              {week.showMix && (
                <div style={{
                  padding: '12px', borderRadius: '8px',
                  background: 'rgba(96,165,250,0.04)', border: '1px solid rgba(96,165,250,0.1)',
                  marginBottom: week.mode === 'custom' ? '12px' : '0',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                    Content Mix
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {CONTENT_TYPES.map(({ key, label, icon, color }) => (
                      <div key={key} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 8px', borderRadius: '6px',
                        background: week.contentMix[key] > 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                      }}>
                        <span style={{
                          width: '22px', height: '22px', borderRadius: '5px',
                          background: week.contentMix[key] > 0 ? `${color}22` : 'rgba(255,255,255,0.04)',
                          color: week.contentMix[key] > 0 ? color : 'rgba(255,255,255,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '9px', fontWeight: 800, flexShrink: 0,
                        }}>{icon}</span>
                        <span style={{
                          flex: 1, fontSize: '11px', fontWeight: 500,
                          color: week.contentMix[key] > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
                        }}>{label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <button
                            onClick={() => updateMix(i, key, week.contentMix[key] - 1)}
                            style={{
                              width: '22px', height: '22px', borderRadius: '4px',
                              background: 'rgba(255,255,255,0.06)', border: 'none',
                              color: 'rgba(255,255,255,0.4)', fontSize: '14px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >-</button>
                          <span style={{
                            minWidth: '20px', textAlign: 'center',
                            fontSize: '13px', fontWeight: 700,
                            color: week.contentMix[key] > 0 ? '#fff' : 'rgba(255,255,255,0.2)',
                          }}>{week.contentMix[key]}</span>
                          <button
                            onClick={() => updateMix(i, key, week.contentMix[key] + 1)}
                            style={{
                              width: '22px', height: '22px', borderRadius: '4px',
                              background: 'rgba(255,255,255,0.06)', border: 'none',
                              color: 'rgba(255,255,255,0.4)', fontSize: '14px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Theme input + file upload (only for custom) */}
              {week.mode === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter your theme for this week..."
                    value={week.theme}
                    onChange={(e) => updateWeek(i, { theme: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
                      fontSize: '13px', color: '#e0e0e0',
                    }}
                  />
                  <textarea
                    placeholder="Custom instructions: e.g. &quot;CTA should drive people to comment&quot;, &quot;Promote the workshop but don't give too much away&quot;..."
                    value={week.instructions}
                    onChange={(e) => updateWeek(i, { instructions: e.target.value })}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)', borderRadius: '7px',
                      fontSize: '12px', color: 'rgba(255,255,255,0.5)', minHeight: '50px',
                      resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{
                      padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
                      background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)',
                      color: 'rgba(168,85,247,0.7)', cursor: 'pointer', display: 'inline-flex',
                      alignItems: 'center', gap: '4px',
                    }}>
                      <span>{'\u{1F4CE}'}</span> {week.fileName ? 'Change file' : 'Add reference file'}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.md,.csv"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          updateWeek(i, { file, fileName: file?.name || '' });
                        }}
                      />
                    </label>
                    {week.fileName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                          {week.fileName}
                        </span>
                        <button
                          onClick={() => updateWeek(i, { file: null, fileName: '' })}
                          style={{
                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
                            fontSize: '14px', cursor: 'pointer', padding: '0 4px',
                          }}
                        >{'\u2715'}</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add week button */}
        <button
          onClick={addWeek}
          style={{
            width: '100%', padding: '10px', borderRadius: '10px',
            background: 'none', border: '1px dashed rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.25)', fontSize: '13px', fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)'; e.currentTarget.style.color = 'rgba(168,85,247,0.6)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
        >
          + Add Week
        </button>
      </div>

      {/* Summary */}
      <div style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.25)', display: 'flex', gap: '16px' }}>
        {autoWeeks > 0 && <span>{autoWeeks} auto-generated</span>}
        {customWeeksWithContent > 0 && <span>{customWeeksWithContent} custom</span>}
        <span style={{ marginLeft: 'auto' }}>{totalPosts} posts total across {weeks.length} weeks</span>
      </div>

      {customWeeksMissing > 0 && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#f59e0b' }}>
          {customWeeksMissing} custom week{customWeeksMissing > 1 ? 's' : ''} still need{customWeeksMissing === 1 ? 's' : ''} a theme
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        style={{
          marginTop: '28px', width: '100%', padding: '14px',
          background: !canGenerate ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
          border: 'none', borderRadius: '10px', color: '#fff',
          fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px',
          opacity: !canGenerate ? 0.4 : 1,
        }}
      >
        {generating ? 'Generating...' : `Generate ${monthName} Content Plan`}
      </button>

      {/* Progress */}
      {progress && (
        <div style={{
          marginTop: '20px', padding: '16px', borderRadius: '10px',
          background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)',
          fontSize: '13px', color: 'rgba(168,85,247,0.8)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#9881;</span>
          {progress}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginTop: '20px', padding: '16px', borderRadius: '10px',
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          fontSize: '13px', color: '#f87171', wordBreak: 'break-word',
        }}>
          {error.includes('<') ? error.replace(/<[^>]*>/g, '').slice(0, 500) : error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          marginTop: '20px', padding: '20px', borderRadius: '12px',
          background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#4ade80', marginBottom: '12px' }}>
            {result.postsCreated} posts generated
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
            {result.themes.map((theme, i) => (
              <span key={i} style={{
                fontSize: '11px', padding: '3px 10px', borderRadius: '6px',
                background: 'rgba(124,58,237,0.12)', color: 'rgba(168,85,247,0.8)',
              }}>{theme}</span>
            ))}
          </div>
          <a href={result.reviewUrl} style={{
            display: 'inline-block', padding: '10px 20px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff', fontSize: '13px', fontWeight: 600,
          }}>
            Review Posts {'\u2192'}
          </a>
        </div>
      )}
    </div>
  );
}
