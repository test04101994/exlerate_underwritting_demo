import { useState } from 'react';
import { formatDistanceToNow } from "date-fns";
import type { WorkflowSession, Agent } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from './document-viewer';
import { ProcessHistoryView } from './process-history-view';

interface WorkflowSidebarProps {
  session?: WorkflowSession;
  agents: Agent[];
  onRefresh?: () => void;
  onProcessWithAgents?: () => void;
}

export function WorkflowSidebar({ session, agents, onRefresh, onProcessWithAgents }: WorkflowSidebarProps) {
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const dataExtractionAgent = agents.find(agent => agent.type === 'extractor' || agent.name.includes('Data Extraction'));

  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'researcher':
        return 'fas fa-search';
      case 'analyst':
        return 'fas fa-chart-line';
      case 'writer':
        return 'fas fa-pen';
      case 'assessor':
        return 'fas fa-clipboard-check';
      case 'advisor':
        return 'fas fa-user-tie';
      default:
        return 'fas fa-robot';
    }
  };

  const getAgentColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'running':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-gray-400';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'running':
        return 'text-blue-600';
      case 'pending':
        return 'text-gray-500';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Complete';
      case 'running':
        return 'Running';
      case 'pending':
        return 'Waiting';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'running':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-gray-300';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  return (
    <div className="w-80 bg-surface border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-project-diagram text-white text-sm"></i>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">LangGraph Studio</h1>
            <p className="text-sm text-gray-500">Multi-Agent Workflow</p>
          </div>
        </div>
      </div>

      {/* Workflow Status */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Workflow Status</h2>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${session?.status === 'running' ? 'bg-success animate-pulse' : 'bg-gray-400'}`}></div>
            <span className={`text-xs font-medium ${session?.status === 'running' ? 'text-success' : 'text-gray-500'}`}>
              {session?.status === 'running' ? 'Active' : 
               session?.status === 'completed' ? 'Completed' :
               session?.status || 'Inactive'}
            </span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <i className="fas fa-clock text-gray-400 text-xs"></i>
            <span className="text-xs text-gray-600">
              {session?.createdAt 
                ? `Started ${formatDistanceToNow(new Date(session.createdAt))} ago`
                : 'Not started'
              }
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <i className="fas fa-tasks text-gray-400 text-xs"></i>
            <span className="text-xs text-gray-600">
              Step {session?.currentStep || 0} of {session?.totalSteps || 9} completed
            </span>
          </div>
        </div>
      </div>

      {/* Process History */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <ProcessHistoryView 
            session={session}
            agents={agents}
            messages={[]} // This would come from props in real implementation
            onViewDocuments={(agentId) => {
              setSelectedAgentId(agentId);
              setDocumentViewerOpen(true);
            }}
          />
        </div>
      </div>

      {/* Restart Workflow Button */}
      <div className="p-4 border-t border-gray-200">
        <Button
          variant="outline"
          size="sm"
          className="w-full mb-3"
          onClick={onProcessWithAgents || onRefresh}
        >
          <i className="fas fa-rocket mr-2"></i>
          Process with AI Agents
        </Button>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <i className="fas fa-user-circle text-gray-400"></i>
            <span className="text-sm text-gray-600">
              Session: {session?.sessionId?.substring(0, 12) || 'No session'}
            </span>
          </div>
          <button className="text-xs text-primary hover:text-primary-dark font-medium">
            Export
          </button>
        </div>
      </div>
      
      {/* Document Viewer Modal */}
      {documentViewerOpen && (
        <DocumentViewer
          isOpen={documentViewerOpen}
          onOpenChange={setDocumentViewerOpen}
          sessionId={session?.sessionId || ''}
          agentStatus={dataExtractionAgent?.status || 'pending'}
        />
      )}
    </div>
  );
}