import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ApprovalRequest } from '@shared/schema';
import {
  CheckCircle2, XCircle, AlertTriangle, Mail, Send,
  Pencil, Trash2, BarChart3, ShieldCheck, Eye, Edit3,
} from 'lucide-react';
// Note: CheckCircle2 / AlertTriangle kept for generic approval cards only

interface ChatApprovalInterfaceProps {
  approvalRequest: ApprovalRequest;
  onApprove: (requestId: number) => void;
  onReject: (requestId: number) => void;
  onOpenEmailEditor?: () => void;
}

// ── Focused approval card ─────────────────────────────────────────────────
// Visually distinct from regular chat bubbles: full-width, elevated, accent stripe
function ApprovalCard({
  accentColor,   // Tailwind color key: 'amber' | 'blue' | 'green'
  headerIcon,
  headerLabel,
  headerBadge,
  children,
}: {
  accentColor: 'amber' | 'blue' | 'green';
  headerIcon: React.ReactNode;
  headerLabel: string;
  headerBadge?: string;
  children: React.ReactNode;
}) {
  const accent = {
    amber: {
      stripe:  'bg-amber-500',
      iconBg:  'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
      badge:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      border:  'border-amber-200/60 dark:border-amber-700/40',
      glow:    'shadow-amber-500/10',
    },
    blue: {
      stripe:  'bg-blue-500',
      iconBg:  'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
      badge:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      border:  'border-blue-200/60 dark:border-blue-700/40',
      glow:    'shadow-blue-500/10',
    },
    green: {
      stripe:  'bg-green-500',
      iconBg:  'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
      badge:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      border:  'border-green-200/60 dark:border-green-700/40',
      glow:    'shadow-green-500/10',
    },
  }[accentColor];

  return (
    <div className={`my-3 rounded-xl border ${accent.border} bg-card shadow-md ${accent.glow} overflow-hidden`}>
      {/* Accent stripe */}
      <div className={`h-0.5 w-full ${accent.stripe}`} />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${accent.iconBg}`}>
          {headerIcon}
        </div>
        <span className="text-sm font-semibold text-foreground flex-1">{headerLabel}</span>
        {headerBadge && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${accent.badge}`}>
            {headerBadge}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3">{children}</div>;
}

function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-t border-border/60">
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function ChatApprovalInterface({
  approvalRequest,
  onApprove,
  onReject,
  onOpenEmailEditor,
}: ChatApprovalInterfaceProps) {
  const [processing, setProcessing] = useState(false);
  const [editMode, setEditMode]     = useState(false);
  const [editedSummary, setEditedSummary] = useState<string>(
    approvalRequest.data?.summary || ''
  );

  const handleApprove = async () => {
    setProcessing(true);
    try {
      if (approvalRequest.type === 'mismatch_summary_jira') {
        const ticketKey = approvalRequest.data?.ticketKey;
        if (ticketKey) {
          const r = await fetch('/api/post-to-jira-direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketKey, summaryData: editedSummary }),
          });
          if (!r.ok) throw new Error('Failed to post to Jira');
          await fetch(`/api/workflows/${approvalRequest.sessionId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'yes' }),
          });
          return;
        }
      }
      const r = await fetch(`/api/workflows/${approvalRequest.sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'yes' }),
      });
      if (!r.ok) throw new Error('Failed to send approval');
    } finally {
      setTimeout(() => setProcessing(false), 1000);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      const r = await fetch(`/api/workflows/${approvalRequest.sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'no' }),
      });
      if (!r.ok) throw new Error('Failed to reject');
    } finally {
      setTimeout(() => setProcessing(false), 1000);
    }
  };

  const handleEmailAction = async (action: string) => {
    setProcessing(true);
    try {
      if (action === 'edit' && onOpenEmailEditor) {
        onOpenEmailEditor();
        setProcessing(false);
        return;
      }
      const r = await fetch(`/api/workflows/${approvalRequest.sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: action }),
      });
      if (!r.ok) throw new Error('Failed to send action');
    } finally {
      setTimeout(() => setProcessing(false), 1000);
    }
  };

  if (approvalRequest.status !== 'pending') return null;

  // ── Mismatch Summary / Quality Assurance ────────────────────────────────
  if (approvalRequest.type === 'mismatch_summary_jira') {
    const lines = editedSummary.split('\n').filter(l => l.trim());

    return (
      <ApprovalCard
        accentColor="amber"
        headerIcon={<BarChart3 className="w-3.5 h-3.5" />}
        headerLabel={approvalRequest.title || 'Quality Assurance Ready'}
        headerBadge="Action Required"
      >
        <CardBody>
          <p className="text-xs text-muted-foreground mb-3">{approvalRequest.description}</p>

          {/* Edit / Preview toggle */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground">Summary</span>
            <button
              onClick={() => setEditMode(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {editMode
                ? <><Eye className="w-3 h-3" />Preview</>
                : <><Edit3 className="w-3 h-3" />Edit</>}
            </button>
          </div>

          {editMode ? (
            /* Editable textarea */
            <Textarea
              value={editedSummary}
              onChange={e => setEditedSummary(e.target.value)}
              className="text-xs font-mono min-h-[180px] resize-y bg-background border-border"
              spellCheck={false}
            />
          ) : (
            /* Plain text preview — no icons, clean and professional */
            <div className="rounded-lg border border-border bg-muted/40 p-3 max-h-52 overflow-y-auto">
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {editedSummary}
              </p>
            </div>
          )}
        </CardBody>

        <CardFooter>
          <Button
            size="sm" variant="outline" onClick={handleReject} disabled={processing}
            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <XCircle className="w-3 h-3 mr-1" />
            {processing ? 'Processing…' : 'Discard'}
          </Button>
          <Button
            size="sm" onClick={handleApprove} disabled={processing}
            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {processing ? 'Posting…' : 'Post to Jira'}
          </Button>
        </CardFooter>
      </ApprovalCard>
    );
  }

  // ── PAS Update ────────────────────────────────────────────────────────────
  if (approvalRequest.type === 'pas_update_review') {
    return (
      <ApprovalCard
        accentColor="blue"
        headerIcon={<ShieldCheck className="w-3.5 h-3.5" />}
        headerLabel="PAS Update Authorization"
        headerBadge="Required"
      >
        <CardBody>
          <p className="text-sm text-foreground">
            Sanctions check completed successfully. Proceed to update data in the Policy Administration System (PAS)?
          </p>
        </CardBody>
        <CardFooter>
          <Button size="sm" variant="outline" onClick={handleReject} disabled={processing}
            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
            <XCircle className="w-3 h-3 mr-1" />{processing ? 'Processing…' : 'No, Stop'}
          </Button>
          <Button size="sm" onClick={handleApprove} disabled={processing}
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <CheckCircle2 className="w-3 h-3 mr-1" />{processing ? 'Processing…' : 'Yes, Proceed to PAS'}
          </Button>
        </CardFooter>
      </ApprovalCard>
    );
  }

  // ── Email Draft Review ────────────────────────────────────────────────────
  if (approvalRequest.type === 'email_draft_review') {
    return (
      <ApprovalCard
        accentColor="blue"
        headerIcon={<Mail className="w-3.5 h-3.5" />}
        headerLabel={approvalRequest.title || 'Email Draft Ready'}
        headerBadge="Review"
      >
        <CardBody>
          <p className="text-sm text-foreground">{approvalRequest.description}</p>
        </CardBody>
        <CardFooter>
          <Button size="sm" variant="outline" onClick={() => handleEmailAction('discard')} disabled={processing}
            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
            <Trash2 className="w-3 h-3 mr-1" />Discard
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleEmailAction('edit')} disabled={processing}
            className="h-7 text-xs">
            <Pencil className="w-3 h-3 mr-1" />Edit
          </Button>
          <Button size="sm" onClick={() => handleEmailAction('send')} disabled={processing}
            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
            <Send className="w-3 h-3 mr-1" />{processing ? 'Sending…' : 'Send'}
          </Button>
        </CardFooter>
      </ApprovalCard>
    );
  }

  // ── Email Sender Review ───────────────────────────────────────────────────
  if (approvalRequest.type === 'email_sender_review') {
    return (
      <ApprovalCard
        accentColor="green"
        headerIcon={<Send className="w-3.5 h-3.5" />}
        headerLabel={approvalRequest.title || 'Email Ready to Send'}
        headerBadge="Confirm"
      >
        <CardBody>
          <p className="text-sm text-foreground">{approvalRequest.description}</p>
        </CardBody>
        <CardFooter>
          <Button size="sm" variant="outline" onClick={() => handleEmailAction('cancel')} disabled={processing}
            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
            <XCircle className="w-3 h-3 mr-1" />Cancel
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleEmailAction('edit')} disabled={processing}
            className="h-7 text-xs">
            <Pencil className="w-3 h-3 mr-1" />Edit
          </Button>
          <Button size="sm" onClick={() => handleEmailAction('send')} disabled={processing}
            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
            <Send className="w-3 h-3 mr-1" />{processing ? 'Sending…' : 'Send Email'}
          </Button>
        </CardFooter>
      </ApprovalCard>
    );
  }

  // ── Generic / Sanctions ───────────────────────────────────────────────────
  return (
    <ApprovalCard
      accentColor="amber"
      headerIcon={<AlertTriangle className="w-3.5 h-3.5" />}
      headerLabel={approvalRequest.title || 'Approval Needed'}
      headerBadge="Action Required"
    >
      <CardBody>
        <p className="text-sm text-foreground mb-3">{approvalRequest.description}</p>
        {approvalRequest.data && typeof approvalRequest.data === 'object' && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Agent</span>
              <span className="text-foreground font-medium">{approvalRequest.data.agentName || 'Sanctions Check Agent'}</span>
            </div>
            {approvalRequest.data.confidence && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confidence</span>
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {(approvalRequest.data.confidence * 100).toFixed(1)}%
                </span>
              </div>
            )}
            {approvalRequest.data.analysisResults && (
              <div className="pt-2 border-t border-border text-muted-foreground max-h-20 overflow-y-auto whitespace-pre-line">
                {typeof approvalRequest.data.analysisResults === 'string'
                  ? approvalRequest.data.analysisResults.substring(0, 200) + '…'
                  : JSON.stringify(approvalRequest.data.analysisResults, null, 2)}
              </div>
            )}
          </div>
        )}
      </CardBody>
      <CardFooter>
        <Button size="sm" variant="outline" onClick={handleReject} disabled={processing}
          className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
          <XCircle className="w-3 h-3 mr-1" />{processing ? 'Processing…' : 'Reject'}
        </Button>
        <Button size="sm" onClick={handleApprove} disabled={processing}
          className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
          <CheckCircle2 className="w-3 h-3 mr-1" />{processing ? 'Processing…' : 'Approve'}
        </Button>
      </CardFooter>
    </ApprovalCard>
  );
}
