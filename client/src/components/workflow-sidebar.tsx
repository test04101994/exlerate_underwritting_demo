import { useState, useEffect } from 'react';
import type { WorkflowSession, Agent } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from './document-viewer';
import { DataExtractionViewer } from './data-extraction-viewer';
import exlLogo from "@/assets/exl-logo.svg";
import { RefreshCw, FileText, Edit2, Plus } from "lucide-react";

interface WorkflowSidebarProps {
  session?: WorkflowSession;
  agents: Agent[];
  workflowStatus?: string;
  onRefresh?: () => void;
  onProcessWithAgents?: () => void;
  onNewSession?: () => void;
  onOpenEmailEditor?: () => void;
  isDataExtractionApproved?: boolean;
  onShowDataExtractionForm?: () => void;
}

export function WorkflowSidebar({ session, agents, workflowStatus, onRefresh, onProcessWithAgents, onNewSession, onOpenEmailEditor, isDataExtractionApproved = false, onShowDataExtractionForm }: WorkflowSidebarProps) {
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [displayAgents, setDisplayAgents] = useState<Agent[]>([]);
  const [shuffleOrder, setShuffleOrder] = useState<number[] | null>(null);

  useEffect(() => {
    if (!agents || agents.length <= 1) {
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
  }, [agents, shuffleOrder]);

  const dataExtractionAgent = agents.find(agent => agent.type === 'extractor' || agent.name.includes('Data Extraction'));

  return (
    <div className="w-full h-full bg-background border-r border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <img src={exlLogo} alt="EXL" className="h-8 w-auto" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">Underwriting Platform</h1>
            <p className="text-xs text-muted-foreground">AI-Powered</p>
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

                {/* View Data Button */}
                {(agent.type === 'extraction' || agent.type === 'data_extraction' || agent.name.includes('Data Extraction')) && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-7"
                      disabled={session?.workflowType !== 'slip' && session?.workflowType !== 'jira' && agent.status !== 'completed' && session?.status !== 'pending_data_extraction' && session?.status !== 'completed'}
                      onClick={() => {
                        if (session?.sessionId?.startsWith('JIR-') || session?.workflowType === 'slip' || session?.workflowType === 'jira') {
                          onShowDataExtractionForm?.();
                        } else if (agent.status === 'completed' || session?.extractedData) {
                          setShowDataViewer(true);
                        }
                      }}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      View Data
                    </Button>
                  </div>
                )}

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
