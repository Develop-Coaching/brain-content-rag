'use client';

import { useState } from 'react';

type WeekMode = 'auto' | 'custom';
type Step = 'configure' | 'themes' | 'generating' | 'done';

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
  description: string;
  instructions: string;
  file: File | null;
  fileName: string;
  contentMix: ContentMix;
  showMix: boolean;
}

function newWeek(): WeekConfig {
  return { mode: 'auto', theme: '', description: '', instructions: '', file: null, fileName: '', contentMix: { ...DEFAULT_MIX }, showMix: false };
}

export default function GeneratePage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    now.setMonth(now.getMonth() + 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [weeks, setWeeks] = useState<WeekConfig[]>([newWeek(), newWeek(), newWeek(), newWeek()]);
  const [step, setStep] = useState<Step>('configure');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ reviewUrl: string; postsCreated: number; themes: string[] } | null>(null);
  const [error, setError] = useState('');
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [weekStatuses, setWeekStatuses] = useState<('pending' | 'generating' | 'done' | 'failed')[]>([]);
  const [weekPostCounts, setWeekPostCounts] = useState<number[]>([]);

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

  const autoWeeks = weeks.filter(w => w.mode === 'auto').length;
  const customWeeksWithContent = weeks.filter(w => w.mode === 'custom' && w.theme.trim()).length;
  const customWeeksMissing = weeks.filter(w => w.mode === 'custom' && !w.theme.trim()).length;
  const totalPosts = weeks.reduce((sum, w) => sum + getWeekPostCount(w.contentMix), 0);
  const canGenerate = step === 'configure' && customWeeksMissing === 0 && totalPosts > 0;

  // Step 1: Generate themes for auto weeks, then show for approval
  async function handleGenerateThemes() {
    // If all weeks are custom, skip straight to theme review
    if (autoWeeks === 0) {
      setStep('themes');
      return;
    }
    setError('');
    setProgress('Generating themes...');
    setStep('generating');

    try {
      const weekData = weeks.map((w, i) => ({
        week: i + 1,
        mode: w.mode,
        theme: w.mode === 'custom' ? w.theme.trim() : null,
      }));

      const res = await fetch('/api/generate-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, weeks: weekData }),
      });

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(responseText.includes('<!DOCTYPE') ? 'Server error — check Vercel logs' : `Server error (${res.status})`);
      }

      if (!res.ok) throw new Error(data.error || 'Failed to generate themes');

      // Fill in auto themes
      const autoThemes: { theme: string; description: string }[] = data.themes || [];
      let autoIdx = 0;
      setWeeks(prev => prev.map(w => {
        if (w.mode === 'auto') {
          const t = autoThemes[autoIdx++] || { theme: 'Content Week', description: '' };
          return { ...w, theme: t.theme, description: t.description };
        }
        return w;
      }));

      setStep('themes');
      setProgress('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setStep('configure');
      setProgress('');
    }
  }

  // Regenerate a single auto theme
  async function handleRegenTheme(weekIdx: number) {
    setError('');
    try {
      const otherThemes = weeks.filter((_, i) => i !== weekIdx).map(w => w.theme).filter(Boolean);
      const weekData = [{ week: 1, mode: 'auto' as const, theme: null }];
      // Pass other themes as custom so they're excluded
      const fakeWeeks = [
        ...otherThemes.map((t, i) => ({ week: i + 2, mode: 'custom' as const, theme: t })),
        { week: 1, mode: 'auto' as const, theme: null },
      ];

      const res = await fetch('/api/generate-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, weeks: fakeWeeks }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      const newTheme = data.themes?.[0];
      if (newTheme) {
        updateWeek(weekIdx, { theme: newTheme.theme, description: newTheme.description });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate theme');
    }
  }

  // Step 2: Generate content week by week
  async function handleGenerateContent(startFromWeek: number = 0) {
    setStep('generating');
    setError('');

    let currentCalendarId = calendarId;

    // Create calendar if we don't have one yet
    if (!currentCalendarId) {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month,
            themes: weeks.map(w => w.theme),
          }),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status})`); }
        if (!res.ok) throw new Error(data.error || 'Failed to create calendar');
        currentCalendarId = data.calendarId;
        setCalendarId(currentCalendarId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create calendar');
        setStep('themes');
        return;
      }
    }

    // Initialize statuses
    const statuses: ('pending' | 'generating' | 'done' | 'failed')[] =
      weekStatuses.length === weeks.length ? [...weekStatuses] : weeks.map(() => 'pending');
    const counts = weekPostCounts.length === weeks.length ? [...weekPostCounts] : weeks.map(() => 0);

    // Generate each week sequentially
    for (let i = startFromWeek; i < weeks.length; i++) {
      const w = weeks[i];
      statuses[i] = 'generating';
      setWeekStatuses([...statuses]);
      setProgress(`Generating Week ${i + 1}: ${w.theme}...`);

      try {
        let fileContent: string | null = null;
        if (w.file) {
          fileContent = await w.file.text();
        }

        const res = await fetch('/api/generate-week', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calendarId: currentCalendarId,
            month,
            weekNumber: i + 1,
            theme: w.theme.trim(),
            instructions: (w.instructions || '').trim() || null,
            fileContent,
            fileName: w.fileName || null,
            contentMix: w.contentMix,
          }),
        });

        const responseText = await res.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          // Response wasn't JSON — extract useful info
          const isHtml = responseText.includes('<!DOCTYPE') || responseText.includes('<html');
          const statusInfo = `(${res.status} ${res.statusText})`;
          if (isHtml) {
            throw new Error(`Server error ${statusInfo}. Check Vercel logs for details.`);
          }
          throw new Error(`Invalid response ${statusInfo}: ${responseText.slice(0, 200)}`);
        }

        if (!res.ok) throw new Error(data.error || `Generation failed (${res.status})`);

        statuses[i] = 'done';
        counts[i] = data.postsCreated || 0;
        setWeekStatuses([...statuses]);
        setWeekPostCounts([...counts]);
      } catch (e) {
        statuses[i] = 'failed';
        setWeekStatuses([...statuses]);
        setWeekPostCounts([...counts]);
        setError(`Week ${i + 1} failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        setProgress('');
        return; // Stop here — user can click Continue
      }
    }

    // All done
    const totalPosts = counts.reduce((sum, n) => sum + n, 0);
    setResult({
      postsCreated: totalPosts,
      themes: weeks.map(w => w.theme),
      reviewUrl: `/content/review/${month}`,
    });
    setStep('done');
    setProgress('');
  }

  function handleContinueGenerating() {
    const firstIncomplete = weekStatuses.findIndex(s => s === 'failed' || s === 'pending');
    if (firstIncomplete >= 0) {
      handleGenerateContent(firstIncomplete);
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
        {step === 'configure' && 'Step 1: Configure your weeks, themes, and content mix.'}
        {step === 'themes' && 'Step 2: Review and approve your weekly themes before generating content.'}
        {step === 'generating' && 'Generating...'}
        {step === 'done' && 'Content plan generated!'}
      </p>

      {/* ── STEP 1: CONFIGURE ── */}
      {step === 'configure' && (
        <>
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
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: week.mode === 'custom' || week.showMix ? '12px' : '0' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, color: '#7c3aed',
                      background: 'rgba(124,58,237,0.12)', padding: '4px 9px', borderRadius: '6px',
                      minWidth: '30px', textAlign: 'center', flexShrink: 0,
                    }}>W{i + 1}</span>

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

                    {week.mode === 'auto' && !week.showMix && (
                      <span style={{ flex: 1, fontSize: '12px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                        Auto theme from seasonal context
                      </span>
                    )}

                    {weeks.length > 1 && (
                      <button
                        onClick={() => removeWeek(i)}
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

                  {/* Content mix */}
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
                              <button onClick={() => updateMix(i, key, week.contentMix[key] - 1)} style={{
                                width: '22px', height: '22px', borderRadius: '4px',
                                background: 'rgba(255,255,255,0.06)', border: 'none',
                                color: 'rgba(255,255,255,0.4)', fontSize: '14px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>-</button>
                              <span style={{
                                minWidth: '20px', textAlign: 'center', fontSize: '13px', fontWeight: 700,
                                color: week.contentMix[key] > 0 ? '#fff' : 'rgba(255,255,255,0.2)',
                              }}>{week.contentMix[key]}</span>
                              <button onClick={() => updateMix(i, key, week.contentMix[key] + 1)} style={{
                                width: '22px', height: '22px', borderRadius: '4px',
                                background: 'rgba(255,255,255,0.06)', border: 'none',
                                color: 'rgba(255,255,255,0.4)', fontSize: '14px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom theme inputs */}
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
                        placeholder="Custom instructions (optional)..."
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
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{week.fileName}</span>
                            <button onClick={() => updateWeek(i, { file: null, fileName: '' })} style={{
                              background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
                              fontSize: '14px', cursor: 'pointer', padding: '0 4px',
                            }}>{'\u2715'}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

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

          {/* Generate Themes button */}
          <button
            onClick={handleGenerateThemes}
            disabled={!canGenerate}
            style={{
              marginTop: '28px', width: '100%', padding: '14px',
              background: !canGenerate ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
              border: 'none', borderRadius: '10px', color: '#fff',
              fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px',
              opacity: !canGenerate ? 0.4 : 1,
            }}
          >
            {autoWeeks > 0 ? `Generate Themes for ${monthName}` : `Continue to Review Themes`}
          </button>
        </>
      )}

      {/* ── STEP 2: THEME APPROVAL ── */}
      {step === 'themes' && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            {monthName} — Weekly Themes
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {weeks.map((week, i) => {
              const weekPostCount = getWeekPostCount(week.contentMix);
              return (
                <div key={i} style={{
                  padding: '16px 20px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, color: '#7c3aed',
                      background: 'rgba(124,58,237,0.12)', padding: '4px 9px', borderRadius: '6px',
                      flexShrink: 0, marginTop: '2px',
                    }}>W{i + 1}</span>

                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        value={week.theme}
                        onChange={(e) => updateWeek(i, { theme: e.target.value })}
                        style={{
                          width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                          fontSize: '15px', fontWeight: 600, color: '#fff',
                        }}
                      />
                      {week.description && (
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '6px', lineHeight: '1.4' }}>
                          {week.description}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '6px' }}>
                        {weekPostCount} posts
                      </div>
                    </div>

                    <button
                      onClick={() => handleRegenTheme(i)}
                      title="Generate a different theme"
                      style={{
                        padding: '6px 12px', borderRadius: '6px', border: 'none',
                        background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                        fontSize: '11px', fontWeight: 600, flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {'\u21BB'} New Theme
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setStep('configure')}
              style={{
                padding: '12px 24px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: 600,
              }}
            >
              {'\u2190'} Back
            </button>
            <button
              onClick={() => handleGenerateContent()}
              style={{
                flex: 1, padding: '14px',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                border: 'none', borderRadius: '10px', color: '#fff',
                fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px',
              }}
            >
              Approve & Generate {totalPosts} Posts
            </button>
          </div>
        </>
      )}

      {/* ── GENERATING PROGRESS ── */}
      {step === 'generating' && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {weeks.map((w, i) => {
            const status = weekStatuses[i] || 'pending';
            const count = weekPostCounts[i] || 0;
            return (
              <div key={i} style={{
                padding: '14px 18px', borderRadius: '10px',
                background: status === 'generating' ? 'rgba(124,58,237,0.08)' :
                  status === 'done' ? 'rgba(74,222,128,0.06)' :
                  status === 'failed' ? 'rgba(248,113,113,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${status === 'generating' ? 'rgba(124,58,237,0.2)' :
                  status === 'done' ? 'rgba(74,222,128,0.15)' :
                  status === 'failed' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.05)'}`,
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#7c3aed',
                  background: 'rgba(124,58,237,0.12)', padding: '3px 8px', borderRadius: '5px',
                }}>W{i + 1}</span>
                <span style={{
                  flex: 1, fontSize: '13px', fontWeight: 600,
                  color: status === 'done' ? '#4ade80' :
                    status === 'failed' ? '#f87171' :
                    status === 'generating' ? 'rgba(168,85,247,0.8)' : 'rgba(255,255,255,0.25)',
                }}>
                  {w.theme}
                </span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                  {status === 'done' && `${count} posts \u2713`}
                  {status === 'generating' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#9881;</span>
                      generating...
                    </span>
                  )}
                  {status === 'failed' && 'failed'}
                  {status === 'pending' && 'waiting'}
                </span>
              </div>
            );
          })}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── ERROR + CONTINUE ── */}
      {error && (
        <div style={{ marginTop: '16px' }}>
          <div style={{
            padding: '16px', borderRadius: '10px',
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            fontSize: '13px', color: '#f87171', wordBreak: 'break-word',
          }}>
            {error.includes('<') ? error.replace(/<[^>]*>/g, '').slice(0, 500) : error}
          </div>
          {step === 'generating' && weekStatuses.some(s => s === 'failed' || s === 'pending') && (
            <button
              onClick={handleContinueGenerating}
              style={{
                marginTop: '12px', width: '100%', padding: '14px',
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                border: 'none', borderRadius: '10px', color: '#fff',
                fontSize: '15px', fontWeight: 700,
              }}
            >
              Continue Generating
            </button>
          )}
        </div>
      )}

      {/* ── STEP 3: DONE ── */}
      {step === 'done' && result && (
        <div style={{
          marginTop: '20px', padding: '24px', borderRadius: '14px',
          background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80', marginBottom: '14px' }}>
            {result.postsCreated} posts generated
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
            {result.themes.map((theme, i) => (
              <span key={i} style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '6px',
                background: 'rgba(124,58,237,0.12)', color: 'rgba(168,85,247,0.8)',
              }}>{theme}</span>
            ))}
          </div>
          <a href={result.reviewUrl} style={{
            display: 'inline-block', padding: '12px 24px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff', fontSize: '14px', fontWeight: 700,
          }}>
            Review Posts {'\u2192'}
          </a>
        </div>
      )}
    </div>
  );
}
