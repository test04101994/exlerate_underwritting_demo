import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Edit2, ThumbsUp, HelpCircle, ChevronDown, ChevronRight, Wrench, CheckCircle2, Download, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message, ApprovalRequest } from "@shared/schema";
import { ChatApprovalInterface } from './chat-approval-interface';
import { EmailDraftEditor } from './email-draft-editor';
import { VideoPlayer } from './video-player';

// ---------- policy validation approve button ----------
// Renders an "Approve coverage" button (or "Approved" pill).
// Clicking POSTs to /validate-policy, which appends a confirmation message.
function ValidatePolicyButton({ sessionId, state }: { sessionId?: string; state: 'ready' | 'approved' }) {
  const [busy, setBusy] = useState(false);
  const [optimisticDone, setOptimisticDone] = useState(false);
  const isDone = state === 'approved' || optimisticDone;

  const onApprove = async () => {
    if (!sessionId || busy || isDone) return;
    setBusy(true);
    try {
      await fetch(`/api/workflows/${sessionId}/validate-policy`, { method: 'POST' });
      setOptimisticDone(true);
    } catch (e) {
      console.error('[Validate Policy] failed:', e);
    } finally {
      setTimeout(() => setBusy(false), 800);
    }
  };

  if (isDone) {
    return (
      <div className="mt-3 mb-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 text-xs font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Coverage approved</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!sessionId || busy}
      onClick={onApprove}
      className={`group mt-3 mb-1 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
        busy
          ? 'bg-blue-50 text-blue-700 cursor-not-allowed'
          : 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]'
      }`}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>{busy ? 'Approving…' : 'Approve coverage'}</span>
    </button>
  );
}

// ---------- acknowledgement-letter send button ----------
// Renders a "Ready to Send" button (or "Sent" pill if already sent).
// Clicking POSTs to /send-ack-letter, which appends a confirmation message.
function AckLetterButton({ sessionId, state }: { sessionId?: string; state: 'ready' | 'sent' }) {
  const [busy, setBusy] = useState(false);
  const [optimisticSent, setOptimisticSent] = useState(false);
  const isSent = state === 'sent' || optimisticSent;

  const onSend = async () => {
    if (!sessionId || busy || isSent) return;
    setBusy(true);
    try {
      await fetch(`/api/workflows/${sessionId}/send-ack-letter`, { method: 'POST' });
      setOptimisticSent(true);
    } catch (e) {
      console.error('[Send Ack Letter] failed:', e);
    } finally {
      setTimeout(() => setBusy(false), 800);
    }
  };

  if (isSent) {
    return (
      <div className="mt-3 mb-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 text-xs font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Acknowledgement sent</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!sessionId || busy}
      onClick={onSend}
      className={`group mt-3 mb-1 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
        busy
          ? 'bg-blue-50 text-blue-700 cursor-not-allowed'
          : 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]'
      }`}
    >
      <Send className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      <span>{busy ? 'Sending…' : 'Ready to Send'}</span>
    </button>
  );
}

// ---------- regenerate summary picker ----------
// Renders Short / Medium / Long buttons. Clicking one POSTs to the backend,
// which appends a fresh summary message at the requested length.
function RegenerateSummaryPicker({ sessionId, currentLength }: { sessionId?: string; currentLength: 'short' | 'medium' | 'long' }) {
  const [busy, setBusy] = useState<'short' | 'medium' | 'long' | null>(null);
  const onPick = async (length: 'short' | 'medium' | 'long') => {
    if (!sessionId || busy) return;
    setBusy(length);
    try {
      await fetch(`/api/workflows/${sessionId}/regenerate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length }),
      });
    } catch (e) {
      console.error('[Regenerate Summary] failed:', e);
    } finally {
      setTimeout(() => setBusy(null), 800);
    }
  };
  const opts: Array<{ key: 'short' | 'medium' | 'long'; label: string; sub: string }> = [
    { key: 'short', label: 'Short', sub: '~3 sentences' },
    { key: 'medium', label: 'Medium', sub: '4 paragraphs' },
    { key: 'long', label: 'Long', sub: 'full detail' },
  ];
  return (
    <div className="mt-3 mb-1 px-3 py-2.5 rounded-lg border border-border bg-muted/30">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Regenerate summary</div>
      <div className="flex flex-wrap gap-1.5">
        {opts.map(o => {
          const isActive = o.key === currentLength;
          const isBusy = busy === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={!!busy}
              onClick={() => onPick(o.key)}
              className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'bg-card border border-border text-foreground hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/60 dark:hover:bg-blue-950/30 dark:hover:text-blue-300'
              } ${busy ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <span>{o.label}</span>
              <span className={`text-[10px] ${isActive ? 'opacity-80' : 'text-muted-foreground'}`}>· {o.sub}</span>
              {isBusy && <span className="ml-1 w-2 h-2 rounded-full bg-current animate-ping" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- markdown table block renderer ----------
// Detects pipe-style markdown tables in chat messages and renders them as styled HTML tables.
// Pattern: a header row `| col | col |` followed by a separator `|---|---|` and one or more data rows.
function MarkdownTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  return (
    <div className="my-3 border border-border rounded-lg overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              {header.map((cell, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-foreground border-b border-r border-border last:border-r-0 whitespace-nowrap">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/30">
                {header.map((_, ci) => (
                  <td key={ci} className="px-3 py-2 text-foreground border-b border-r border-border last:border-r-0 align-top">
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Splits a text block on markdown table boundaries. Returns an array of segments,
// each either { kind: 'text', value: '...' } or { kind: 'table', rows: [[...], ...] }.
function splitTextOnTables(text: string): Array<{ kind: 'text'; value: string } | { kind: 'table'; rows: string[][] }> {
  const lines = text.split('\n');
  const out: Array<{ kind: 'text'; value: string } | { kind: 'table'; rows: string[][] }> = [];
  let textBuf: string[] = [];
  const flushText = () => {
    if (textBuf.length > 0) {
      out.push({ kind: 'text', value: textBuf.join('\n') });
      textBuf = [];
    }
  };
  const isPipeLine = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isSeparatorLine = (s: string) => /^\s*\|?\s*:?-{2,}.*\|.*$/.test(s) && /^\s*\|?[\s:|-]+$/.test(s);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isPipeLine(line) && i + 1 < lines.length && isSeparatorLine(lines[i + 1])) {
      // Found a table — collect header + (skip separator) + data rows
      flushText();
      const rows: string[][] = [];
      const splitRow = (s: string) => s.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      rows.push(splitRow(line));
      i += 2; // skip header + separator
      while (i < lines.length && isPipeLine(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push({ kind: 'table', rows });
      continue;
    }
    textBuf.push(line);
    i++;
  }
  flushText();
  return out;
}

// ---------- inline markdown (bold + italic) ----------
// Splits a line into spans of plain text, **bold**, and *italic* (or _italic_).
function renderInlineMarkdown(line: string, lineKey: number | string) {
  // Capture group covers: **bold**, *italic*, _italic_
  // The non-greedy `+?` and `[^*\n]`/`[^_\n]` constraints prevent matching across whole lines
  // and prevent consuming the asterisks from `**`.
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_)/g;
  const parts = line.split(re);
  return parts.map((part, pi) => {
    const key = `${lineKey}-${pi}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <span key={key}>{part}</span>;
  });
}

// ---------- collapsible tool-call block ----------
function ToolCallBlock({ type, toolName, body }: { type: 'call' | 'result'; toolName: string; body: string }) {
  const [open, setOpen] = useState(false);
  const isCall = type === 'call';
  return (
    <div className={`my-1.5 rounded-lg border text-xs font-mono overflow-hidden ${
      isCall
        ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-950/20'
        : 'border-green-200 dark:border-green-800/50 bg-green-50/60 dark:bg-green-950/20'
    }`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:opacity-80 transition-opacity ${
          isCall ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-400'
        }`}
      >
        {open ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
        {isCall
          ? <Wrench className="h-3 w-3 flex-shrink-0" />
          : <CheckCircle2 className="h-3 w-3 flex-shrink-0" />}
        <span className="font-semibold">{isCall ? 'Tool call' : 'Tool result'}</span>
        <span className="ml-1 opacity-70">{toolName}</span>
      </button>
      {open && (
        <pre className={`px-3 pb-2.5 pt-0 text-xs overflow-x-auto whitespace-pre-wrap break-all leading-relaxed ${
          isCall ? 'text-blue-800 dark:text-blue-300' : 'text-green-800 dark:text-green-300'
        }`}>{body.trim()}</pre>
      )}
    </div>
  );
}

// ---------- formatted content (bold + video + tool calls) ----------
const FormattedMessageContent = ({ content, sessionId }: { content: string; sessionId?: string }) => {
  // Detect if the message contains tool call / result patterns
  // Pattern: a line like `→ \`tool_name\`` or `✓ \`tool_name\`` followed optionally by a JSON block
  const hasToolPattern = /^[→✓]\s*`[^`]+`/m.test(content);

  if (hasToolPattern) {
    // Split the content into segments: plain text, tool-calls, tool-results
    const segments: Array<{ type: 'text' | 'call' | 'result'; toolName?: string; body?: string; text?: string }> = [];
    const lines = content.split('\n');
    let i = 0;
    let textAcc: string[] = [];

    const flushText = () => {
      const t = textAcc.join('\n').trim();
      if (t) segments.push({ type: 'text', text: t });
      textAcc = [];
    };

    while (i < lines.length) {
      const line = lines[i];
      const callMatch = line.match(/^→\s*`([^`]+)`/);
      const resultMatch = line.match(/^✓\s*`([^`]+)`/);

      if (callMatch || resultMatch) {
        flushText();
        const type = callMatch ? 'call' : 'result';
        const toolName = (callMatch || resultMatch)![1];
        // Collect the body: look for the next ```...``` block or plain text until next tool line
        const bodyLines: string[] = [];
        // The rest of this line after the tool name (e.g. suffix text)
        const suffix = line.slice(line.indexOf('`' + toolName + '`') + toolName.length + 2).trim();
        if (suffix) bodyLines.push(suffix);
        i++;
        // Consume a ```json ... ``` block if present
        if (i < lines.length && lines[i].trim().startsWith('```')) {
          i++; // skip opening ```
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            bodyLines.push(lines[i]);
            i++;
          }
          i++; // skip closing ```
        }
        // Also consume a trailing status line (e.g. ⏳ ...)
        if (i < lines.length && lines[i].trim().match(/^[⏳✓→]/)) {
          bodyLines.push(lines[i]);
          i++;
        }
        segments.push({ type, toolName, body: bodyLines.join('\n') });
      } else {
        textAcc.push(line);
        i++;
      }
    }
    flushText();

    const formatText = (text: string) => {
      const segs = splitTextOnTables(text);
      return segs.map((seg, si) => {
        if (seg.kind === 'table') return <MarkdownTable key={`tbl-${si}`} rows={seg.rows} />;
        return seg.value.split('\n').map((line, li, arr) => (
          <span key={`t-${si}-${li}`}>
            {renderInlineMarkdown(line, `${si}-${li}`)}
            {li < arr.length - 1 && <br />}
          </span>
        ));
      });
    };

    const renderTextSeg = (text: string, idx: number) => {
      const pdfM = text.match(/\[PDF_DOWNLOAD:([^:]+):([^\]]+)\]/);
      if (pdfM) {
        const [full, url, filename] = pdfM;
        const before = text.slice(0, text.indexOf(full));
        const after  = text.slice(text.indexOf(full) + full.length);
        return (
          <span key={idx}>
            {before && <span>{formatText(before)}</span>}
            <a href={url} download={filename}
              className="inline-flex items-center gap-2 mt-3 mb-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors no-underline">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span>{filename}</span>
              <Download className="h-4 w-4 flex-shrink-0 ml-1 opacity-80" />
            </a>
            {after && <span>{formatText(after)}</span>}
          </span>
        );
      }
      return <span key={idx}>{formatText(text)}</span>;
    };

    return (
      <>
        {segments.map((seg, idx) => {
          if (seg.type === 'text') return renderTextSeg(seg.text!, idx);
          return <ToolCallBlock key={idx} type={seg.type as 'call' | 'result'} toolName={seg.toolName!} body={seg.body!} />;
        })}
      </>
    );
  }

  const formatText = (text: string) => {
    const segs = splitTextOnTables(text);
    return segs.map((seg, si) => {
      if (seg.kind === 'table') return <MarkdownTable key={`tbl-${si}`} rows={seg.rows} />;
      return seg.value.split('\n').map((line, li, arr) => (
        <span key={`t-${si}-${li}`}>
          {renderInlineMarkdown(line, `${si}-${li}`)}
          {li < arr.length - 1 && <br />}
        </span>
      ));
    });
  };

  // Policy validation marker: [VALIDATE_POLICY:ready] or [VALIDATE_POLICY:approved]
  // ready    → renders an "Approve coverage" button
  // approved → renders a "Coverage approved" pill
  const validateMatch = content.match(/\[VALIDATE_POLICY:(ready|approved)\]/);
  if (validateMatch) {
    const [full, vState] = validateMatch;
    const before = content.slice(0, content.indexOf(full));
    const after = content.slice(content.indexOf(full) + full.length);
    return (
      <>
        {before && <div className="mb-1">{formatText(before)}</div>}
        <ValidatePolicyButton sessionId={sessionId} state={vState as 'ready' | 'approved'} />
        {after && <div className="mt-1">{formatText(after)}</div>}
      </>
    );
  }

  // Acknowledgement-letter marker: [ACK_LETTER:ready] or [ACK_LETTER:sent]
  // ready → renders a "Ready to Send" button
  // sent  → renders a "Sent" confirmation pill
  const ackMatch = content.match(/\[ACK_LETTER:(ready|sent)\]/);
  if (ackMatch) {
    const [full, ackState] = ackMatch;
    const before = content.slice(0, content.indexOf(full));
    const after = content.slice(content.indexOf(full) + full.length);
    return (
      <>
        {before && <div className="mb-1">{formatText(before)}</div>}
        <AckLetterButton sessionId={sessionId} state={ackState as 'ready' | 'sent'} />
        {after && <div className="mt-1">{formatText(after)}</div>}
      </>
    );
  }

  // Regenerate-summary marker: [REGENERATE_SUMMARY:short|medium|long]
  // Renders three buttons; clicking one POSTs to /regenerate-summary which appends
  // a fresh summary message at the requested length.
  const regenMatch = content.match(/\[REGENERATE_SUMMARY:(short|medium|long)\]/);
  if (regenMatch) {
    const [full, currentLength] = regenMatch;
    const before = content.slice(0, content.indexOf(full));
    const after = content.slice(content.indexOf(full) + full.length);
    return (
      <>
        {before && <div className="mb-3">{formatText(before)}</div>}
        <RegenerateSummaryPicker sessionId={sessionId} currentLength={currentLength as 'short' | 'medium' | 'long'} />
        {after && <div className="mt-3">{formatText(after)}</div>}
      </>
    );
  }

  // PDF download marker: [PDF_DOWNLOAD:url:filename]
  const pdfMatch = content.match(/\[PDF_DOWNLOAD:([^:]+):([^\]]+)\]/);
  if (pdfMatch) {
    const [full, url, filename] = pdfMatch;
    const before = content.slice(0, content.indexOf(full));
    const after  = content.slice(content.indexOf(full) + full.length);
    return (
      <>
        {before && <div className="mb-3">{formatText(before)}</div>}
        <a
          href={url}
          download={filename}
          className="inline-flex items-center gap-2 mt-3 mb-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors no-underline"
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span>{filename}</span>
          <Download className="h-4 w-4 flex-shrink-0 ml-1 opacity-80" />
        </a>
        {after && <div className="mt-3">{formatText(after)}</div>}
      </>
    );
  }

  const videoMatch = content.match(/\[VIDEO:(.*?)\]/);
  if (videoMatch) {
    const [full, url] = videoMatch;
    const before = content.slice(0, content.indexOf(full));
    const after  = content.slice(content.indexOf(full) + full.length);
    return (
      <>
        {before && <div className="mb-3">{formatText(before)}</div>}
        <VideoPlayer src={url} className="my-3" />
        {after && <div className="mt-3">{formatText(after)}</div>}
      </>
    );
  }
  return <>{formatText(content)}</>;
};

// ---------- typewriter config (fetched once from server demo-config) ----------
let _typewriterConfig = { chatTypewriterTargetMs: 4000, chatTypewriterMinMs: 18, chatTypewriterMaxMs: 80 };
let _configFetched = false;
function useDemoConfig() {
  const [cfg, setCfg] = useState(_typewriterConfig);
  useEffect(() => {
    if (_configFetched) return;
    _configFetched = true;
    fetch('/api/demo-config')
      .then(r => r.json())
      .then(data => { _typewriterConfig = data; setCfg(data); })
      .catch(() => {/* use defaults */});
  }, []);
  return cfg;
}

// ---------- streaming text component ----------
function StreamingText({
  content,
  stream,
  onComplete,
  sessionId,
}: {
  content: string;
  stream: boolean;
  onComplete?: () => void;
  sessionId?: string;
}) {
  const [displayed, setDisplayed] = useState(stream ? '' : content);
  const idxRef = useRef(0);
  const cfg = useDemoConfig();

  useEffect(() => {
    if (!stream) { setDisplayed(content); return; }

    idxRef.current = 0;
    setDisplayed('');

    // speed controlled by server/demo-config.ts → CHAT_TYPEWRITER_TARGET_MS
    const speed = Math.min(cfg.chatTypewriterMaxMs, Math.max(cfg.chatTypewriterMinMs, cfg.chatTypewriterTargetMs / content.length));

    const iv = setInterval(() => {
      idxRef.current += 1;
      setDisplayed(content.slice(0, idxRef.current));
      if (idxRef.current >= content.length) {
        clearInterval(iv);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(iv);
  }, [content, stream, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = displayed.length >= content.length;

  return (
    <>
      <FormattedMessageContent content={displayed} sessionId={sessionId} />
      {!done && (
        <span className="inline-block w-[2px] h-[1em] bg-current ml-0.5 align-middle animate-[blink_0.7s_step-end_infinite]" />
      )}
    </>
  );
}

// ---------- props ----------
interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  sessionId: string;
  approvalRequests?: ApprovalRequest[];
  onApprove?: (requestId: number) => void;
  onReject?: (requestId: number) => void;
  agents?: any[];
  workflowType?: string;
}

// ---------- main component ----------
export function ChatInterface({
  messages,
  onSendMessage,
  sessionId,
  approvalRequests = [],
  onApprove,
  onReject,
  agents = [],
  workflowType,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isEmailEditorOpen, setIsEmailEditorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track which message IDs have already been fully shown (no streaming for them)
  const seenIdsRef = useRef<Set<number | string>>(new Set());
  const initializedRef = useRef(false);
  // Only one message streams at a time — the single last unseen message
  const streamingIdRef = useRef<number | string | null>(null);

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    if (!initializedRef.current) {
      // First load: mark everything as seen, nothing streams
      initializedRef.current = true;
      messages.forEach(m => seenIdsRef.current.add(m.id));
      return;
    }

    // Find unseen messages
    const unseen = messages.filter(m => !seenIdsRef.current.has(m.id));
    if (unseen.length === 0) return;

    // Mark all but the very last one as instantly seen
    unseen.slice(0, -1).forEach(m => seenIdsRef.current.add(m.id));

    // The last unseen one gets to stream
    const last = unseen[unseen.length - 1];
    streamingIdRef.current = last.id;
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim() && !isSending) {
      setIsSending(true);
      onSendMessage(inputValue.trim());
      setInputValue('');
      setTimeout(() => setIsSending(false), 1000);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleEmailDraftSend = async (draft: any) => {
    try {
      const r = await fetch(`/api/workflows/${sessionId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (r.ok) onSendMessage(`Email sent successfully to ${draft.to}`);
    } catch (e) { console.error('Failed to send email:', e); }
  };

  const handleEmailDraftSave = async (draft: any) => {
    try {
      await fetch(`/api/workflows/${sessionId}/save-email-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
    } catch (e) { console.error('Failed to save draft:', e); }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes thinking-dot { 0%,80%,100%{transform:translateY(0);opacity:0.3} 40%{transform:translateY(-4px);opacity:1} }
      `}</style>

      <EmailDraftEditor
        isOpen={isEmailEditorOpen}
        onClose={() => setIsEmailEditorOpen(false)}
        sessionId={sessionId}
        onSendEmail={handleEmailDraftSend}
        onSaveDraft={handleEmailDraftSave}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-full">
        {[...(messages || [])]
          .sort((a, b) => {
            // Guarantee creation order using the monotonically-increasing id.
            // Falls back to timestamp if id is missing.
            const ai = typeof a.id === 'number' ? a.id : 0;
            const bi = typeof b.id === 'number' ? b.id : 0;
            if (ai !== bi) return ai - bi;
            const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return at - bt;
          })
          .map((message) => {
          if (!message) return null;

          const isUser   = message.type === 'user';
          const isSystem = message.type === 'system';

          // Per-message typewriter animation is disabled across all workflows.
          // It caused a render flicker (the new message rendered with full content first,
          // then reset to empty as the typewriter kicked in late — because streamingIdRef
          // updates in a useEffect that runs after the first render of the new message).
          // The server-side step delays between Thinking → tool call → tool result → answer
          // already provide the live feel without needing per-character animation on top.
          const shouldStream = false;

          const timestamp = (() => {
            if (!message.timestamp) return 'Just now';
            try {
              const d = new Date(message.timestamp);
              return isNaN(d.getTime()) ? 'Just now' : formatDistanceToNow(d) + ' ago';
            } catch { return 'Just now'; }
          })();

          // ── User message ──────────────────────────────────────
          if (isUser) {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[75%]">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                    <p className="text-sm leading-relaxed">
                      <FormattedMessageContent content={message.content || ''} sessionId={sessionId} />
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-right">{timestamp}</p>
                </div>
              </div>
            );
          }

          // ── System & Agent messages — left-aligned chat bubble ─
          const isEmailDraft =
            message.sender === 'Email Draft Agent' &&
            (message.content?.includes('created email draft') ||
              message.content?.includes('have created email draft') ||
              message.content?.includes('Email draft completed'));

          // Avatar: initial letter for all messages — clean and professional
          const senderName = message.sender && message.sender !== 'System'
            ? message.sender
            : 'System';
          const avatarContent = senderName.charAt(0).toUpperCase();

          const avatarBg = isSystem
            ? 'bg-muted text-muted-foreground'
            : 'bg-muted text-muted-foreground';

          const senderLabel = senderName;

          return (
            <div key={message.id} className="flex items-start gap-2.5">
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-semibold ${avatarBg}`}>
                {avatarContent}
              </div>

              {/* Bubble */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">{senderLabel}</span>
                  <span className="text-xs text-muted-foreground">{timestamp}</span>
                </div>
                <div className={`border rounded-2xl rounded-tl-sm px-4 py-2.5 ${
                  isSystem
                    ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/40'
                    : 'bg-card border-border'
                }`}>
                  <p className="text-sm leading-relaxed text-foreground">
                    <StreamingText
                      sessionId={sessionId}
                      content={message.content || ''}
                      stream={shouldStream}
                      onComplete={() => {
                        seenIdsRef.current.add(message.id);
                        streamingIdRef.current = null;
                      }}
                    />
                  </p>
                  {isEmailDraft && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <Button
                        onClick={() => setIsEmailEditorOpen(true)}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                      >
                        <Edit2 className="h-3 w-3 mr-1.5" />
                        Edit Email Draft
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Agent thinking indicator — shown when any agent is actively running */}
        {agents.some(a => a.status === 'running') && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-muted text-muted-foreground text-xs font-semibold">
              {(agents.find(a => a.status === 'running')?.name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">
                  {agents.find(a => a.status === 'running')?.name || 'Agent'}
                </span>
                <span className="text-xs text-muted-foreground">thinking...</span>
              </div>
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 rounded-2xl rounded-tl-sm px-4 py-3 inline-flex items-center gap-1">
                {[0, 160, 320].map(delay => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-orange-400 dark:bg-orange-500 inline-block"
                    style={{ animation: `thinking-dot 0.9s ease-in-out ${delay}ms infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pending approval requests */}
        {approvalRequests?.filter(r => r.status === 'pending').map(approval => (
          <ChatApprovalInterface
            key={approval.id}
            approvalRequest={approval}
            onApprove={onApprove!}
            onReject={onReject!}
            onOpenEmailEditor={() => setIsEmailEditorOpen(true)}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-border p-4 bg-card sticky bottom-0">
        {/* Suggested questions for claim workflows — clicking sends as a user message
            and the Claim Assistant produces an agentic Q&A trace. */}
        {workflowType === 'claim' && (
          <div className="mb-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Try asking</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                'What is the limit of each location?',
                'What is the Business Liability Amount?',
                'What is the recommended settlement amount?',
              ].map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSendMessage(q)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border bg-card text-xs text-foreground hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300 transition-colors"
                >
                  <HelpCircle className="h-3 w-3" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder={workflowType === 'claim'
              ? 'Ask the Claim Assistant anything (e.g. "What\'s the loss amount?", "Any fraud risk?")'
              : 'Type your message or give instructions to agents...'}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyPress={handleKey}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!inputValue.trim() || isSending} size="sm">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center space-x-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => onSendMessage('Continue with the workflow')}>
            <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />Continue
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSendMessage('Please modify the instructions')}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />Modify Instructions
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSendMessage('Can you provide more details?')}>
            <HelpCircle className="h-3.5 w-3.5 mr-1.5" />Ask Agent
          </Button>
        </div>
      </div>
    </div>
  );
}
