'use client';

/**
 * Converts raw content (which may contain HTML tags, markdown-style formatting,
 * or plain text with \n line breaks) into clean, readable formatted HTML.
 */
function formatToHtml(raw: string): string {
  let text = raw;

  // If it looks like a full HTML document (e.g. Vercel error page), strip everything
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    return '<p style="color:#f87171;">Error: received an HTML page instead of content. The server may have timed out.</p>';
  }

  // If it already has HTML block tags, use it but sanitise script/style
  if (/<(p|div|h[1-6]|ul|ol|li|br)\b/i.test(text)) {
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    return text;
  }

  // Otherwise treat as plain text / light markdown — convert to HTML
  // Headers: ## or **HEADER**
  text = text.replace(/^###\s*(.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^##\s*(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^#\s*(.+)$/gm, '<h3>$1</h3>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Bullet lists
  text = text.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Numbered lists
  text = text.replace(/^\d+[.)]\s+(.+)$/gm, '<li>$1</li>');

  // HOOK: / BODY: / CLOSE: labels (reel scripts)
  text = text.replace(/^(HOOK|BODY|CLOSE|CTA|SUBJECT|OPENING|CLOSING):\s*/gm,
    '<strong style="color:#a855f7;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;display:block;margin-top:12px;">$1</strong>');

  // Slide labels (Slide 1:, Slide 2:, etc.)
  text = text.replace(/^(Slide\s+\d+)[:\s]*(.*)$/gm,
    '<strong style="color:#8b5cf6;font-size:12px;display:block;margin-top:10px;">$1</strong>$2');

  // Double newline = paragraph break
  text = text.replace(/\n\n+/g, '</p><p>');

  // Single newline = line break
  text = text.replace(/\n/g, '<br>');

  // Wrap in paragraph tags
  text = `<p>${text}</p>`;

  // Clean up empty paragraphs
  text = text.replace(/<p>\s*<\/p>/g, '');

  return text;
}

const contentStyles = `
  .formatted-content p { margin: 0 0 10px 0; }
  .formatted-content p:last-child { margin-bottom: 0; }
  .formatted-content h3 { font-size: 16px; font-weight: 700; color: #fff; margin: 16px 0 8px 0; }
  .formatted-content h4 { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85); margin: 12px 0 6px 0; }
  .formatted-content strong { color: rgba(255,255,255,0.9); }
  .formatted-content em { color: rgba(255,255,255,0.7); font-style: italic; }
  .formatted-content ul { margin: 8px 0; padding-left: 20px; }
  .formatted-content li { margin: 4px 0; color: rgba(255,255,255,0.75); }
  .formatted-content br + br { display: none; }
`;

export function FormattedContent({
  content,
  style,
}: {
  content: string;
  style?: React.CSSProperties;
}) {
  return (
    <>
      <style>{contentStyles}</style>
      <div
        className="formatted-content"
        dangerouslySetInnerHTML={{ __html: formatToHtml(content) }}
        style={{
          fontSize: '14px',
          lineHeight: '1.7',
          color: '#e0e0e0',
          ...style,
        }}
      />
    </>
  );
}
