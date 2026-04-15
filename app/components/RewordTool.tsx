'use client';

import { useState } from 'react';

const PLATFORMS = [
  { value: 'general', label: 'General' },
  { value: 'instagram_caption', label: 'Instagram Caption' },
  { value: 'instagram_reel', label: 'Instagram Reel Script' },
  { value: 'linkedin_post', label: 'LinkedIn Post' },
  { value: 'linkedin_article', label: 'LinkedIn Article' },
  { value: 'email', label: 'Email' },
  { value: 'x', label: 'X / Twitter' },
];

export function RewordTool() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('general');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleReword() {
    if (!text.trim()) return;
    setLoading(true);
    setResult('');
    setCopied(false);
    try {
      const res = await fetch('/api/reword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, platform }),
      });
      const data = await res.json();
      if (data.error) {
        setResult(`Error: ${data.error}`);
      } else {
        setResult(data.reworded);
      }
    } catch {
      setResult('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          width: '100%',
          padding: '20px 24px',
          borderRadius: '14px',
          border: '1px dashed rgba(124,58,237,0.3)',
          background: 'linear-gradient(145deg, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0.03) 100%)',
          color: 'rgba(168,85,247,0.9)',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(145deg, rgba(124,58,237,0.14) 0%, rgba(124,58,237,0.06) 100%)';
          e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(145deg, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0.03) 100%)';
          e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)';
        }}
      >
        <span style={{ fontSize: '18px' }}>&#9997;&#65039;</span>
        Reword in Greg's Voice — Paste a caption or script to restyle it
      </button>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
      borderRadius: '14px',
      padding: '24px',
      border: '1px solid rgba(124,58,237,0.2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' }}>
          Reword in Greg's Voice
        </h3>
        <button
          onClick={() => { setIsOpen(false); setText(''); setResult(''); }}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
            fontSize: '18px', cursor: 'pointer', padding: '4px 8px',
          }}
        >
          &times;
        </button>
      </div>

      <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
        Paste in a caption, reel script, or any text and it'll be rewritten in Greg's style.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPlatform(p.value)}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: platform === p.value ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)',
              background: platform === p.value ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.03)',
              color: platform === p.value ? '#a855f7' : 'rgba(255,255,255,0.5)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your caption, reel script, or content here..."
        style={{
          width: '100%',
          minHeight: '120px',
          padding: '14px',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.3)',
          color: '#fff',
          fontSize: '14px',
          fontFamily: 'inherit',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
      />

      <button
        onClick={handleReword}
        disabled={loading || !text.trim()}
        style={{
          marginTop: '12px',
          padding: '10px 24px',
          borderRadius: '8px',
          border: 'none',
          background: loading || !text.trim()
            ? 'rgba(124,58,237,0.3)'
            : 'linear-gradient(135deg, #7c3aed, #a855f7)',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 700,
          cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {loading ? 'Rewriting...' : 'Reword It'}
      </button>

      {result && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Greg's Version
            </span>
            <button
              onClick={handleCopy}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
                color: copied ? '#4ade80' : 'rgba(255,255,255,0.5)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div style={{
            padding: '16px',
            borderRadius: '10px',
            background: 'rgba(74,222,128,0.05)',
            border: '1px solid rgba(74,222,128,0.15)',
            color: 'rgba(255,255,255,0.85)',
            fontSize: '14px',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}>
            {result}
          </div>
        </div>
      )}
    </div>
  );
}
