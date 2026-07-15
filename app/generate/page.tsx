'use client';

import { useState } from 'react';
import { weekPieceCount } from '../../src/agent/cadence';

type WeekMode = 'auto' | 'custom';
type Step = 'configure' | 'themes' | 'spine' | 'generating' | 'done';

interface WeekConfig {
  mode: WeekMode;
  theme: string;
  description: string;
  instructions: string;
  file: File | null;
  fileName: string;
}

interface SpineDay {
  date: string;
  day_of_week: string;
  heavy: 'reel' | 'carousel';
  spine_topic: string;
  hook: string;
  scamper_lens: string;
}

interface WeekSpine {
  week: number;
  theme: string;
  weekly_cta: string;
  days: SpineDay[];
}

// The baked daily rhythm - same source of truth the generator uses.
const PER_WEEK = weekPieceCount();
const RHYTHM = [
  ['Mon', '2 feed', 'Article', 'Reel', 'X thread'],
  ['Tue', '2 feed', 'Article', 'Carousel', '3 tweets'],
  ['Wed', '3 feed', 'Article', 'Reel', 'X poll'],
  ['Thu', '2 feed', 'Article', 'Carousel', 'Threads'],
  ['Fri', '2 feed', 'Article', 'Reel', 'X thread'],
  ['Sat', '2 feed', 'Article', 'Carousel', 'Threads'],
  ['Sun', '2 feed', 'Article', 'Reel (wrap)', 'X thread'],
];

function newWeek(): WeekConfig {
  return { mode: 'auto', theme: '', description: '', instructions: '', file: null, fileName: '' };
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reviewUrl: string; postsCreated: number; themes: string[] } | null>(null);
  const [error, setError] = useState('');
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [spineWeeks, setSpineWeeks] = useState<WeekSpine[]>([]);
  const [weekStatuses, setWeekStatuses] = useState<('pending' | 'generating' | 'done' | 'failed')[]>([]);
  const [weekPostCounts, setWeekPostCounts] = useState<number[]>([]);

  function updateWeek(i: number, updates: Partial<WeekConfig>) {
    setWeeks(prev => prev.map((w, idx) => idx === i ? { ...w, ...updates } : w));
  }
  function setAllAuto() { setWeeks(prev => prev.map(w => ({ ...w, mode: 'auto' as WeekMode }))); }
  function setAllCustom() { setWeeks(prev => prev.map(w => ({ ...w, mode: 'custom' as WeekMode }))); }
  function removeWeek(i: number) { setWeeks(prev => prev.filter((_, idx) => idx !== i)); }
  function addWeek() { setWeeks(prev => [...prev, newWeek()]); }

  const autoWeeks = weeks.filter(w => w.mode === 'auto').length;
  const customWeeksWithContent = weeks.filter(w => w.mode === 'custom' && w.theme.trim()).length;
  const customWeeksMissing = weeks.filter(w => w.mode === 'custom' && !w.theme.trim()).length;
  const estTotal = weeks.length * PER_WEEK;
  const canGenerate = step === 'configure' && customWeeksMissing === 0 && weeks.length > 0;

  // ── Step 1: Generate themes for auto weeks, then show for approval ──
  async function handleGenerateThemes() {
    if (autoWeeks === 0) { setStep('themes'); return; }
    setError('');
    setProgress('Generating themes...');
    setBusy(true);
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
      try { data = JSON.parse(responseText); }
      catch { throw new Error(responseText.includes('<!DOCTYPE') ? 'Server error - check logs' : `Server error (${res.status})`); }
      if (!res.ok) throw new Error(data.error || 'Failed to generate themes');

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function handleRegenTheme(weekIdx: number) {
    setError('');
    try {
      const otherThemes = weeks.filter((_, i) => i !== weekIdx).map(w => w.theme).filter(Boolean);
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
      if (newTheme) updateWeek(weekIdx, { theme: newTheme.theme, description: newTheme.description });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate theme');
    }
  }

  // ── Step 2: Create the calendar, then plan the day-by-day spine per week ──
  async function handleGenerateSpine() {
    setError('');
    setBusy(true);
    setProgress('Creating calendar...');
    try {
      let currentCalendarId = calendarId;
      if (!currentCalendarId) {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, themes: weeks.map(w => w.theme) }),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status})`); }
        if (!res.ok) throw new Error(data.error || 'Failed to create calendar');
        currentCalendarId = data.calendarId;
        setCalendarId(currentCalendarId);
      }

      setProgress('Planning the days...');
      const spines = await Promise.all(weeks.map(async (w, i) => {
        const res = await fetch('/api/generate-spine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calendarId: currentCalendarId,
            month,
            weekNumber: i + 1,
            theme: w.theme.trim(),
            instructions: (w.instructions || '').trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Week ${i + 1} spine failed`);
        return data as WeekSpine;
      }));

      setSpineWeeks(spines);
      setStep('spine');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to plan the days');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  // ── Step 3: Generate all content, week by week, from the approved spine ──
  async function handleGenerateContent(startFromWeek = 0) {
    if (!calendarId) { setError('No calendar - go back and plan the days first'); return; }
    setStep('generating');
    setError('');

    const statuses: ('pending' | 'generating' | 'done' | 'failed')[] =
      weekStatuses.length === weeks.length ? [...weekStatuses] : weeks.map(() => 'pending');
    const counts = weekPostCounts.length === weeks.length ? [...weekPostCounts] : weeks.map(() => 0);

    for (let i = startFromWeek; i < weeks.length; i++) {
      const w = weeks[i];
      statuses[i] = 'generating';
      setWeekStatuses([...statuses]);
      setProgress(`Generating Week ${i + 1}: ${w.theme}...`);
      try {
        const res = await fetch('/api/generate-week', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calendarId,
            month,
            weekNumber: i + 1,
            theme: w.theme.trim(),
            instructions: (w.instructions || '').trim() || null,
            spine: spineWeeks[i] || null,
          }),
        });
        const responseText = await res.text();
        let data;
        try { data = JSON.parse(responseText); }
        catch {
          const isHtml = responseText.includes('<!DOCTYPE') || responseText.includes('<html');
          throw new Error(isHtml ? `Server error (${res.status}). Check logs.` : `Invalid response (${res.status}): ${responseText.slice(0, 200)}`);
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
        return;
      }
    }

    setResult({
      postsCreated: counts.reduce((sum, n) => sum + n, 0),
      themes: weeks.map(w => w.theme),
      reviewUrl: `/content/review/${calendarId}`,
    });
    setStep('done');
    setProgress('');
  }

  function handleContinueGenerating() {
    const firstIncomplete = weekStatuses.findIndex(s => s === 'failed' || s === 'pending');
    if (firstIncomplete >= 0) handleGenerateContent(firstIncomplete);
  }

  const [monthYear, monthNum] = month.split('-');
  const monthName = new Date(Number(monthYear), Number(monthNum) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div style={{ maxWidth: '680px' }}>
      <a href="/" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}>
        {'←'} Back
      </a>
      <h2 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>
        Generate Content Plan
      </h2>
      <p style={{ margin: '0 0 32px', fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
        {step === 'configure' && 'Step 1: Pick the month and your weekly themes.'}
        {step === 'themes' && 'Step 2: Review and approve your weekly themes.'}
        {step === 'spine' && 'Step 3: Review the day-by-day plan before writing the posts.'}
        {step === 'generating' && 'Writing the posts...'}
        {step === 'done' && 'Content plan generated!'}
      </p>

      {/* ── STEP 1: CONFIGURE ── */}
      {step === 'configure' && (
        <>
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

          {/* Daily rhythm summary (baked - matches Greg's real cadence) */}
          <div style={{
            marginTop: '24px', padding: '16px', borderRadius: '12px',
            background: 'rgba(96,165,250,0.04)', border: '1px solid rgba(96,165,250,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(96,165,250,0.9)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Daily rhythm
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                ~{PER_WEEK} pieces/week · article every day · 4 reels/week · every platform weekly
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: '4px', columnGap: '12px', fontSize: '12px' }}>
              {RHYTHM.map(([day, ...items]) => (
                <div key={day} style={{ display: 'contents' }}>
                  <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{day}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{items.join('  ·  ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick toggles */}
          <div style={{ marginTop: '28px', display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: '28px' }}>
              Weekly Themes
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              <button onClick={setAllAuto} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>All Auto</button>
              <button onClick={setAllCustom} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>All Custom</button>
            </div>
          </div>

          {/* Week rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {weeks.map((week, i) => (
              <div key={i} style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: week.mode === 'custom' ? '12px' : '0' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.12)', padding: '4px 9px', borderRadius: '6px', minWidth: '30px', textAlign: 'center', flexShrink: 0 }}>W{i + 1}</span>
                  <button
                    onClick={() => updateWeek(i, { mode: week.mode === 'auto' ? 'custom' : 'auto' })}
                    style={{
                      padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600,
                      background: week.mode === 'auto' ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)',
                      color: week.mode === 'auto' ? '#4ade80' : '#f59e0b', minWidth: '70px', flexShrink: 0,
                    }}
                  >
                    {week.mode === 'auto' ? '✓ Auto' : '✎ Custom'}
                  </button>
                  {week.mode === 'auto' && (
                    <span style={{ flex: 1, fontSize: '12px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                      Auto theme from seasonal context
                    </span>
                  )}
                  {weeks.length > 1 && (
                    <button
                      onClick={() => removeWeek(i)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)', fontSize: '14px', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', lineHeight: 1, marginLeft: 'auto', flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.15)')}
                    >{'✕'}</button>
                  )}
                </div>

                {week.mode === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter your theme for this week..."
                      value={week.theme}
                      onChange={(e) => updateWeek(i, { theme: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', fontSize: '13px', color: '#e0e0e0' }}
                    />
                    <textarea
                      placeholder="Custom instructions (optional)..."
                      value={week.instructions}
                      onChange={(e) => updateWeek(i, { instructions: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '7px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', minHeight: '50px', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={addWeek}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'none', border: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.25)', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)'; e.currentTarget.style.color = 'rgba(168,85,247,0.6)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
            >
              + Add Week
            </button>
          </div>

          <div style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.25)', display: 'flex', gap: '16px' }}>
            {autoWeeks > 0 && <span>{autoWeeks} auto-generated</span>}
            {customWeeksWithContent > 0 && <span>{customWeeksWithContent} custom</span>}
            <span style={{ marginLeft: 'auto' }}>~{estTotal} pieces across {weeks.length} weeks</span>
          </div>

          {customWeeksMissing > 0 && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#f59e0b' }}>
              {customWeeksMissing} custom week{customWeeksMissing > 1 ? 's' : ''} still need{customWeeksMissing === 1 ? 's' : ''} a theme
            </div>
          )}

          <button
            onClick={handleGenerateThemes}
            disabled={!canGenerate || busy}
            style={{
              marginTop: '28px', width: '100%', padding: '14px',
              background: (!canGenerate || busy) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
              border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px',
              opacity: (!canGenerate || busy) ? 0.4 : 1,
            }}
          >
            {busy ? (progress || 'Working...') : autoWeeks > 0 ? `Generate Themes for ${monthName}` : 'Continue to Review Themes'}
          </button>
        </>
      )}

      {/* ── STEP 2: THEME APPROVAL ── */}
      {step === 'themes' && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            {monthName} - Weekly Themes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {weeks.map((week, i) => (
              <div key={i} style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.12)', padding: '4px 9px', borderRadius: '6px', flexShrink: 0, marginTop: '2px' }}>W{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={week.theme}
                      onChange={(e) => updateWeek(i, { theme: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '15px', fontWeight: 600, color: '#fff' }}
                    />
                    {week.description && (
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '6px', lineHeight: '1.4' }}>{week.description}</div>
                    )}
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '6px' }}>~{PER_WEEK} pieces</div>
                  </div>
                  <button
                    onClick={() => handleRegenTheme(i)}
                    title="Generate a different theme"
                    style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '11px', fontWeight: 600, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {'↻'} New Theme
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setStep('configure')}
              style={{ padding: '12px 24px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: 600 }}
            >
              {'←'} Back
            </button>
            <button
              onClick={handleGenerateSpine}
              disabled={busy}
              style={{ flex: 1, padding: '14px', background: busy ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px', opacity: busy ? 0.5 : 1 }}
            >
              {busy ? (progress || 'Planning...') : 'Plan the Days →'}
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3: SPINE REVIEW ── */}
      {step === 'spine' && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            {monthName} - Day-by-day plan
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {spineWeeks.map((sw, i) => (
              <div key={i} style={{ padding: '16px 18px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.12)', padding: '4px 9px', borderRadius: '6px' }}>W{sw.week}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{sw.theme}</span>
                  {sw.weekly_cta && (
                    <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '3px 10px', borderRadius: '6px' }}>
                      CTA: {sw.weekly_cta}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {sw.days.map((d, j) => (
                    <div key={j} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '12px', paddingBottom: '6px', borderBottom: j < sw.days.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.5)', minWidth: '58px', flexShrink: 0 }}>{d.day_of_week} {d.date.slice(8)}</span>
                      <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: d.heavy === 'reel' ? '#e040a0' : '#8b5cf6', background: d.heavy === 'reel' ? 'rgba(224,64,160,0.12)' : 'rgba(139,92,246,0.12)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0, alignSelf: 'center' }}>
                        {d.heavy}{d.scamper_lens ? ` · ${d.scamper_lens}` : ''}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{d.spine_topic}</div>
                        {d.hook && <div style={{ color: 'rgba(255,255,255,0.35)', marginTop: '2px', fontStyle: 'italic' }}>{d.hook}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setStep('themes')}
              style={{ padding: '12px 24px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: 600 }}
            >
              {'←'} Back
            </button>
            <button
              onClick={() => handleGenerateContent()}
              style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px' }}
            >
              Approve & Write ~{estTotal} Posts
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
                background: status === 'generating' ? 'rgba(124,58,237,0.08)' : status === 'done' ? 'rgba(74,222,128,0.06)' : status === 'failed' ? 'rgba(248,113,113,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${status === 'generating' ? 'rgba(124,58,237,0.2)' : status === 'done' ? 'rgba(74,222,128,0.15)' : status === 'failed' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.05)'}`,
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.12)', padding: '3px 8px', borderRadius: '5px' }}>W{i + 1}</span>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: status === 'done' ? '#4ade80' : status === 'failed' ? '#f87171' : status === 'generating' ? 'rgba(168,85,247,0.8)' : 'rgba(255,255,255,0.25)' }}>
                  {w.theme}
                </span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                  {status === 'done' && `${count} posts ✓`}
                  {status === 'generating' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#9881;</span>
                      writing...
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
          <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', fontSize: '13px', color: '#f87171', wordBreak: 'break-word' }}>
            {error.includes('<') ? error.replace(/<[^>]*>/g, '').slice(0, 500) : error}
          </div>
          {step === 'generating' && weekStatuses.some(s => s === 'failed' || s === 'pending') && (
            <button
              onClick={handleContinueGenerating}
              style={{ marginTop: '12px', width: '100%', padding: '14px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 700 }}
            >
              Continue Generating
            </button>
          )}
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && result && (
        <div style={{ marginTop: '20px', padding: '24px', borderRadius: '14px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80', marginBottom: '14px' }}>
            {result.postsCreated} posts generated
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
            {result.themes.map((theme, i) => (
              <span key={i} style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '6px', background: 'rgba(124,58,237,0.12)', color: 'rgba(168,85,247,0.8)' }}>{theme}</span>
            ))}
          </div>
          <a href={result.reviewUrl} style={{ display: 'inline-block', padding: '12px 24px', borderRadius: '10px', background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontSize: '14px', fontWeight: 700 }}>
            Review Posts {'→'}
          </a>
        </div>
      )}
    </div>
  );
}
