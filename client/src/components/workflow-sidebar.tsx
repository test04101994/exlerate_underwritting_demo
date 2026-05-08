import { useState, useEffect } from 'react';
import type { WorkflowSession, Agent } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from './document-viewer';
import { DataExtractionViewer } from './data-extraction-viewer';
import exlLogo from "@/assets/exl-logo.svg";
import { RefreshCw, FileText, Edit2, Plus, Play, RotateCcw, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface WorkflowSidebarProps {
  session?: WorkflowSession;
  agents: Agent[];
  workflowStatus?: string;
  onRefresh?: () => void;
  onProcessWithAgents?: () => void;
  onNewSession?: () => void;
  onOpenEmailEditor?: () => void;
  isDataExtractionApproved?: boolean;
  onShowDataExtractionForm?: (agentType?: string) => void;
}

export function WorkflowSidebar({ session, agents, workflowStatus, onRefresh, onProcessWithAgents, onNewSession, onOpenEmailEditor, isDataExtractionApproved = false, onShowDataExtractionForm }: WorkflowSidebarProps) {
  const queryClient = useQueryClient();
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [displayAgents, setDisplayAgents] = useState<Agent[]>([]);
  const [shuffleOrder, setShuffleOrder] = useState<number[] | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<number | null>(null);

  const isManualMode = session?.workflowType === 'claim' || session?.workflowType === 'pre_bind';

  useEffect(() => {
    if (!agents || agents.length <= 1) {
      setDisplayAgents(agents);
      return;
    }
    // Claim workflows are human-driven — keep agents in their natural pipeline order
    // so the adjuster sees a logical sequence rather than a randomized list.
    if (isManualMode) {
      setDisplayAgents(agents);
      return;
    }
    if (!shuffleOrder) {
      const indices = agents.map((_, i) => i);
      const firstIndex = indices[0];
      const restIndices = indices.slice(1);
      for (let i = restIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [restIndices[i], restIndices[j]] = [restIndices[j], restIndices[i]];
      }
      const newOrder = [firstIndex, ...restIndices];
      setShuffleOrder(newOrder);
      setDisplayAgents(newOrder.map(i => agents[i]));
    } else {
      setDisplayAgents(shuffleOrder.map(i => agents[i]));
    }
  }, [agents, shuffleOrder, isManualMode]);

  const handleRunAgent = async (agentId: number) => {
    if (!session?.sessionId) return;
    setRunningAgentId(agentId);
    try {
      const res = await fetch(`/api/workflows/${session.sessionId}/run-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (!res.ok) {
        console.error('[Run Agent] Server returned', res.status);
      }
      await queryClient.invalidateQueries({ queryKey: [`/api/workflows/${session.sessionId}`] });
    } catch (err) {
      console.error('[Run Agent] Error:', err);
    } finally {
      setTimeout(() => setRunningAgentId(null), 800);
    }
  };

  const dataExtractionAgent = agents.find(agent => agent.type === 'extractor' || agent.name.includes('Data Extraction'));

  return (
    <div className="w-full h-full bg-background border-r border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <img src={exlLogo} alt="EXL" className="h-8 w-auto" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">Agentic Platform</h1>
          </div>
        </div>
      </div>

      {/* Agent Registry - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Agent Registry</h2>
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh} className="h-6 px-2 text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {displayAgents && displayAgents.length > 0 ? displayAgents.map((agent) => (
              <div
                key={agent.id}
                className={`rounded-lg p-3 transition-all duration-300 ${
                  agent.status === 'running'
                    ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border border-border bg-card'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {/* Live indicator — always connected */}
                  <div className="relative flex-shrink-0 w-2 h-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <div className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate text-foreground">
                        {agent.type === 'mismatch_summary' ? 'Quality Assurance Agent' :
                         agent.type === 'field_comparison' && session?.sessionId?.startsWith('JIR-') ? 'Data Transformation Agent' :
                         agent.name}
                      </span>
                      <span className="text-[10px] font-medium text-green-500 flex-shrink-0 pl-2">Live</span>
                    </div>
                    {agent.status === 'running' && (
                      <span className="text-[10px] text-muted-foreground">Processing...</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {agent.type === 'mismatch_summary'
                    ? 'Validates accuracy and completeness of underwriting data against PAS'
                    : agent.type === 'field_comparison' && session?.sessionId?.startsWith('JIR-')
                    ? 'Transforms extracted data into standardized formats for downstream processing'
                    : agent.type === 'video_review'
                    ? 'Validates extracted data using LLM as a judge.'
                    : agent.description || `${agent.name} for insurance underwriting`
                  }
                </p>

                {/* Manual run controls for claim workflows.
                    For the Data Extraction agent we promote "View Data" to the primary action
                    once it's completed (since that's the natural next step), and demote re-run
                    to a small text link. For other claim agents only the Run / Re-run control shows. */}
                {isManualMode && (() => {
                  const isRunning = agent.status === 'running' || runningAgentId === agent.id;
                  const isCompleted = agent.status === 'completed';
                  // Agents that have a backing form view — when completed, the
                  // primary action becomes "View extracted data" and re-run is a
                  // secondary link. FNOL, Coverage Validation, and Invoice
                  // Validation all use a form.
                  const isExtractor = agent.type === 'fnol_intake'
                    || agent.type === 'coverage_validation'
                    || agent.type === 'invoice_validation'
                    || agent.type === 'claim_extractor'
                    || agent.type === 'submissions_extractor'
                    || agent.name.includes('Data Extraction')
                    || agent.name.includes('Submissions Extraction')
                    || agent.name.includes('FNOL')
                    || agent.name.includes('Coverage Validation')
                    || agent.name.includes('Invoice Validation');

                  const handleViewData = () => {
                    if (session?.sessionId?.startsWith('JIR-') || session?.workflowType === 'submission' || session?.workflowType === 'slip' || session?.workflowType === 'claim' || session?.workflowType === 'pre_bind') {
                      // Pass agent.type so the form endpoint can serve the matching
                      // static config (FNOL vs Coverage Validation) regardless of
                      // which form the session is currently paused on.
                      onShowDataExtractionForm?.(agent.type);
                    } else if (agent.status === 'completed' || session?.extractedData) {
                      setShowDataViewer(true);
                    }
                  };

                  // Primary button content based on state
                  let primaryLabel: React.ReactNode;
                  let primaryStyle: string;
                  let primaryOnClick: () => void;
                  let primaryDisabled = false;

                  if (isRunning) {
                    primaryLabel = (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Running…</span>
                      </>
                    );
                    primaryStyle = 'bg-blue-50 text-blue-700 cursor-not-allowed dark:bg-blue-950/40 dark:text-blue-300';
                    primaryOnClick = () => {};
                    primaryDisabled = true;
                  } else if (isCompleted && isExtractor) {
                    primaryLabel = (
                      <>
                        <FileText className="h-3.5 w-3.5" />
                        <span>View extracted data</span>
                      </>
                    );
                    primaryStyle = 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]';
                    primaryOnClick = handleViewData;
                  } else if (isCompleted) {
                    primaryLabel = (
                      <>
                        <RotateCcw className="h-3.5 w-3.5 transition-transform group-hover:-rotate-45" />
                        <span>Run again</span>
                      </>
                    );
                    primaryStyle = 'bg-transparent text-muted-foreground border border-border hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/60 dark:hover:bg-blue-950/30 dark:hover:text-blue-300';
                    primaryOnClick = () => handleRunAgent(agent.id);
                  } else {
                    primaryLabel = (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current transition-transform group-hover:translate-x-0.5" />
                        <span>Run agent</span>
                      </>
                    );
                    primaryStyle = 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]';
                    primaryOnClick = () => handleRunAgent(agent.id);
                  }

                  return (
                    <div className="mt-3 pt-2.5 border-t border-border/60">
                      <button
                        type="button"
                        disabled={primaryDisabled}
                        onClick={primaryOnClick}
                        className={`group inline-flex items-center justify-center gap-1.5 w-full h-8 px-3 text-xs font-medium rounded-md transition-all ${primaryStyle}`}
                      >
                        {primaryLabel}
                      </button>
                      {isCompleted && isExtractor && (
                        <button
                          type="button"
                          onClick={() => handleRunAgent(agent.id)}
                          className="mt-1.5 w-full text-center text-[11px] text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Re-run extraction</span>
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Email Draft Button */}
                {(agent.type === 'email_drafter' || agent.name.includes('Email Draft')) && agent.status === 'completed' && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-7"
                      onClick={() => onOpenEmailEditor?.()}
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit Email Draft
                    </Button>
                  </div>
                )}
              </div>
            )) : (
              <div className="text-center text-muted-foreground text-xs py-6">
                No agents found for this workflow
              </div>
            )}

            {/* Q&A Assistant — passive agent that triggers automatically
                whenever the user types in the chat. Sits at the bottom of
                the registry and uses the same chrome as runnable agents but
                has no Run button. Label depends on workflow type. */}
            {isManualMode && (
              <div className="rounded-lg p-3 border border-border bg-card">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="relative flex-shrink-0 w-2 h-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <div className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate text-foreground">
                        {session?.workflowType === 'pre_bind' ? 'Query Retrieval Agent' : 'Claim Q&A Assistant'}
                      </span>
                      <span className="text-[10px] font-medium text-green-500 flex-shrink-0 pl-2">Live</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {session?.workflowType === 'pre_bind'
                    ? 'Triggers automatically when you type in the chat. Ask anything about this submission — risk profile, sanctions, premium, peer comparison, or appetite fit.'
                    : 'Triggers automatically when you type in the chat. Ask anything about this claim — loss details, coverage, fraud risk, reserves, or recommended next steps.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border flex-shrink-0 space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8"
          onClick={onNewSession}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Session
        </Button>
        {workflowStatus && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              workflowStatus === 'Running' ? 'bg-green-500' :
              workflowStatus === 'Online' ? 'bg-green-500' :
              workflowStatus === 'Pending Approval' ? 'bg-orange-500' :
              workflowStatus === 'Completed' ? 'bg-blue-500' : 'bg-green-500'
            }`}></div>
            <span className="text-xs text-muted-foreground">{workflowStatus}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground truncate">
            {session?.sessionId ? `Session: ${session.sessionId.substring(0, 14)}` : 'No session'}
          </span>
          <button className="text-xs text-primary hover:underline font-medium flex-shrink-0 ml-2">
            Export
          </button>
        </div>
      </div>

      {documentViewerOpen && (
        <DocumentViewer
          isOpen={documentViewerOpen}
          onOpenChange={setDocumentViewerOpen}
          sessionId={session?.sessionId || ''}
          agentStatus={(dataExtractionAgent?.status as "running" | "pending" | "completed") || 'pending'}
        />
      )}

      {showDataViewer && session?.sessionId && (
        <DataExtractionViewer
          sessionId={session.sessionId}
          onClose={() => setShowDataViewer(false)}
        />
      )}
    </div>
  );
}
