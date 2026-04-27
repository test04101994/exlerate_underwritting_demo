import { useParams, useLocation } from "wouter";
import React, { useEffect, useState } from "react";
import { useWorkflow } from "@/hooks/use-workflow";
import { WorkflowSidebar } from "@/components/workflow-sidebar";
import { ChatInterface } from "@/components/chat-interface";
import { WorkflowProgress } from "@/components/workflow-progress";
import { ApprovalModal } from "@/components/approval-modal";
import { NotificationSystem } from "@/components/notification-system";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { NegotiationChatbot } from "@/components/negotiation-chatbot";
import { MultiDocumentViewer } from "@/components/multi-document-viewer";
import { EmailDraftEditor } from "@/components/email-draft-editor";
import ConfigurableJiraDataExtractionForm, { type FieldSource } from "@/components/configurable-jira-data-extraction-form";
import type { HighlightTarget } from "@/components/pdf-highlight-viewer";
import { CaseTimeline } from "@/components/case-timeline";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
// Removed Tabs import - using full-height chat interface
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import exlLogo from "@/assets/exl-logo.svg";
import { Send, Pause, Square, Edit2, Rocket, ChevronRight, ChevronLeft, TrendingUp, MessageSquare, Clock, ClipboardCheck, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function WorkflowPage() {
  const { sessionId, ticketKey } = useParams<{ sessionId?: string; ticketKey?: string }>();
  const [location, navigate] = useLocation();
  
  // Extract sessionId from query parameters if not in path
  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const querySessionId = queryParams.get('sessionId');
  const finalSessionId = sessionId || querySessionId;
  
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(finalSessionId || null);
  const [isJiraWorkflow, setIsJiraWorkflow] = useState(!!ticketKey);
  
  console.log('WorkflowPage initialization:', {
    pathSessionId: sessionId,
    querySessionId,
    finalSessionId,
    ticketKey,
    location,
    currentSessionId
  });
  const [isEmailEditorOpen, setIsEmailEditorOpen] = useState(false);
  const [showDataExtractionForm, setShowDataExtractionForm] = useState(false);
  // When the sidebar's View Data button is clicked, capture which agent's
  // form to load — so claim workflows can switch between FNOL and Coverage
  // Validation forms even after the session-level _formConfig has been
  // overwritten by approved values.
  const [viewFormAgentType, setViewFormAgentType] = useState<string | undefined>(undefined);
  const [showTimeline, setShowTimeline] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const [dataExtractionCompleted, setDataExtractionCompleted] = useState(false);
  const [propertyLocation, setPropertyLocation] = useState<string>('');
  const [pdfHighlight, setPdfHighlight] = useState<HighlightTarget | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    workflowData,
    messages,
    isLoading,
    connect,
    disconnect,
    sendMessage,
    handleApproval,
    notifications,
    dismissNotification
  } = useWorkflow(currentSessionId);

  // Listen for real-time agent status updates via Socket.IO
  useEffect(() => {
    if (!currentSessionId) return;

    const handleAgentUpdate = () => {
      // Invalidate agents query to force refetch on any agent status change
      queryClient.invalidateQueries({ queryKey: [`/api/workflows/${currentSessionId}/agents`] });
    };

    // Get socket from useWorkflow - we'll listen on window for socket events
    const socket = (window as any).__socket;
    if (socket) {
      socket.on('agent-update', handleAgentUpdate);
      return () => socket.off('agent-update', handleAgentUpdate);
    }
  }, [currentSessionId, queryClient]);

  // Show data extraction form when:
  // 1. Manually triggered via "View Data" button, OR
  // 2. There's a pending submission_data_extraction approval (for submission workflows), OR
  // 3. This is a submission workflow that is running or pending_data_extraction
  //    (form is the primary UI — never show raw chat for submission workflows)
  const workflowStatus = (workflowData as any)?.session?.status;
  const hasPendingDataExtractionApproval = (workflowData?.approvals || []).some(
    (approval: any) => approval.type === 'submission_data_extraction' && approval.status === 'pending'
  );
  const wfType = (workflowData as any)?.session?.workflowType || '';
  const isSubmissionWorkflow = wfType === 'submission';
  const isClaimWorkflow = wfType === 'claim';
  // For submission workflows, show the data extraction form as the primary UI while
  // the pipeline is initialising (running) or waiting for human review (pending_data_extraction).
  // Once the underwriter approves the form (dataExtractionCompleted=true) we switch back to
  // chat so the remaining agents' messages are visible.
  // Exclude pending_approval — that's the quote-review stage handled by the approval modal.
  const isSubmissionAtDataExtractionGate = isSubmissionWorkflow && !dataExtractionCompleted &&
    workflowStatus === 'pending_data_extraction';
  // Claim workflows can pause for the form multiple times in a single session
  // (FNOL Intake form, then Coverage Validation form). Auto-show whenever the
  // session is at a data-extraction gate — the form's contents come from
  // session.extractedData._formConfig which the agent updates per-pause.
  const isClaimAtDataExtractionGate = isClaimWorkflow && workflowStatus === 'pending_data_extraction';
  const shouldShowDataExtractionForm = showDataExtractionForm || hasPendingDataExtractionApproval || isSubmissionAtDataExtractionGate || isClaimAtDataExtractionGate;
  


  // Get case information from dashboard cases (for regular workflows)
  const { data: dashboardCases } = useQuery({
    queryKey: ['/api/dashboard/cases'],
    enabled: !!currentSessionId && !isJiraWorkflow
  });

  // Get Jira ticket information (for Jira workflows)
  const { data: jiraTicket, isLoading: jiraTicketLoading, error: jiraTicketError } = useQuery({
    queryKey: [`/api/jira/ticket/${ticketKey}`],
    enabled: isJiraWorkflow && !!ticketKey,
    retry: 1,
  });

  // Get Jira data extraction details
  const { data: jiraExtractedData, isLoading: jiraExtractionLoading } = useQuery({
    queryKey: [`/api/jira/${ticketKey}/data-extraction`],
    enabled: isJiraWorkflow && !!ticketKey,
    retry: 1,
  });

  // Get timeline events for current case with real-time updates
  // CRITICAL: Always use the actual workflow caseId from the session data as primary source
  const timelineCaseId = (workflowData as any)?.session?.caseId || (workflowData as any)?.caseId || ticketKey || 'UW-2025-001';
  
  console.log('🎯 Timeline Case ID Debug:', {
    isJiraWorkflow,
    ticketKey,
    workflowCaseId: (workflowData as any)?.session?.caseId,
    fallbackCaseId: (workflowData as any)?.caseId,
    finalTimelineCaseId: timelineCaseId,
    sessionId: currentSessionId
  });
  
  const { data: timelineEvents = [], isLoading: timelineLoading, error: timelineError } = useQuery({
    queryKey: [`/api/cases/${timelineCaseId}/timeline`],
    enabled: !!currentSessionId && !!timelineCaseId,
    refetchInterval: 2000, // Refetch every 2 seconds for real-time updates
    refetchOnWindowFocus: true
  });

  // Debug workflow state and layout
  console.log('Workflow Layout Debug:', {
    workflowStatus,
    shouldShowDataExtractionForm,
    showDataExtractionForm,
    showTimeline,
    timelineEvents: Array.isArray(timelineEvents) ? timelineEvents.length : 0,
    timelineCaseId,
    dataExtractionCompleted,
    agentStatuses: Array.isArray((workflowData as any)?.agents) ? (workflowData as any).agents.map((a: any) => `${a.name}: ${a.status}`) : []
  });

  // Find the current case and get its title/subject
  const currentCase = Array.isArray(dashboardCases) ? dashboardCases.find((c: any) => c.case_id === (workflowData as any)?.session?.caseId) : undefined;
  const workflowTitle = isJiraWorkflow 
    ? ((jiraTicket as any)?.summary || `Jira Ticket ${ticketKey}`)
    : ((currentCase as any)?.email_subject || (workflowData as any)?.session?.title || "Insurance Underwriting Workflow");

  const createWorkflowMutation = useMutation({
    mutationFn: async ({ title, workflowType, forceNew = false, ticketKey }: { title: string; workflowType: string; forceNew?: boolean; ticketKey?: string }) => {
      const payload = ticketKey 
        ? { title, workflowType: 'jira', forceNew, caseId: ticketKey, ticketKey }
        : { title, workflowType, forceNew };
      const response = await apiRequest("POST", "/api/workflows", payload);
      return response.json();
    },
    onSuccess: (data) => {
      console.log('New workflow created, resetting all states:', data.sessionId);
      // Reset all state when creating new workflow
      setShowDataExtractionForm(false);
      setDataExtractionCompleted(false);
      setIsEmailEditorOpen(false);
      
      // For Jira workflows, navigate with ticket key to maintain URL structure
      // For regular workflows, navigate to the new session
      if (isJiraWorkflow && ticketKey) {
        navigate(`/workflow/${data.sessionId}/${ticketKey}`);
        setCurrentSessionId(data.sessionId);
      } else if (isJiraWorkflow) {
        // Fallback if no ticketKey available
        setCurrentSessionId(data.sessionId);
      } else {
        navigate(`/workflow/${data.sessionId}`);
        setCurrentSessionId(data.sessionId);
      }
      
      toast({
        title: "Workflow Created", 
        description: isJiraWorkflow ? "Jira workflow started successfully" : "New AI workflow started successfully"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create workflow",
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    if (currentSessionId) {
      connect(currentSessionId);
    }
    return () => {
      disconnect();
    };
  }, [currentSessionId]);

  // Reset states when sessionId changes (navigation)
  useEffect(() => {
    const newSessionId = sessionId || querySessionId;
    console.log('Session ID changed, resetting all states:', { 
      oldSessionId: currentSessionId, 
      newSessionId,
      pathSessionId: sessionId,
      querySessionId
    });
    setShowDataExtractionForm(false);
    setDataExtractionCompleted(false);
    setIsEmailEditorOpen(false);
    setCurrentSessionId(newSessionId || null);
  }, [sessionId, querySessionId]);

  // For Jira workflows, don't auto-load - always show manual creation interface
  // This eliminates any loading screens and provides consistent UX

  // Force hide data extraction form for pending_approval workflow
  useEffect(() => {
    const workflowStatus = (workflowData as any)?.session?.status;
    if (workflowStatus === 'pending_approval') {
      setShowDataExtractionForm(false);
    }
  }, [workflowData]);

  // DO NOT auto-show data extraction form - it should only be triggered manually via "View Data" button
  // This useEffect has been disabled to prevent automatic form display after Data Extraction Agent completes

  const handleCreateWorkflow = (workflowType: string) => {
    const title = workflowType === 'slip' ? "Lloyd's Slip Processing" : "Insurance Underwriting Workflow";
    createWorkflowMutation.mutate({ 
      title: title,
      workflowType: workflowType,
      forceNew: true  // Force new workflow creation
    });
  };

  const handleStartOfflineDemo = () => {
    // Create a demo workflow ID for offline use
    const demoSessionId = "demo-" + Date.now();
    setCurrentSessionId(demoSessionId);
    toast({
      title: "Demo Mode Started",
      description: "Running in offline demo mode"
    });
  };

  const handlePauseWorkflow = () => {
    toast({
      title: "Workflow Paused",
      description: "The workflow has been paused"
    });
  };

  const handleStopWorkflow = () => {
    toast({
      title: "Workflow Stopped",
      description: "The workflow has been stopped",
      variant: "destructive"
    });
  };

  const handleNewSession = async () => {
    // Capture current session info before disconnecting
    const oldCaseId = (workflowData as any)?.session?.caseId;
    const oldTitle = (workflowData as any)?.session?.title;
    const oldWorkflowType = (workflowData as any)?.session?.workflowType;
    const isJira = isJiraWorkflow || (workflowData as any)?.session?.workflowType === 'jira';
    const tKey = ticketKey || (isJira ? oldCaseId : undefined);

    // Disconnect immediately to stop old socket messages
    disconnect();

    try {
      const body = isJira && tKey
        ? { title: oldTitle || `Jira Ticket ${tKey}`, workflowType: 'jira', forceNew: true, caseId: tKey, ticketKey: tKey }
        : { title: oldTitle || 'Insurance Underwriting Workflow', workflowType: oldWorkflowType || 'submission', ...(oldCaseId && { caseId: oldCaseId }), forceNew: true };

      // Use apiRequest (includes auth credentials) just like createWorkflowMutation does
      const response = await apiRequest("POST", "/api/workflows", body);
      if (!response.ok) {
        toast({ title: "Error", description: "Failed to create new session", variant: "destructive" });
        return;
      }
      const workflow = await response.json();

      // Set currentSessionId immediately to avoid showing picker screen during transition
      setCurrentSessionId(workflow.sessionId);
      // Navigate to new session URL — same pattern the dashboard uses
      navigate(`/workflow/${workflow.sessionId}`);
    } catch (error) {
      toast({ title: "Error", description: "Failed to create new session", variant: "destructive" });
    }
  };

  const handleProcessWithAgents = () => {
    if (isJiraWorkflow && jiraTicket) {
      // Start Jira workflow
      createWorkflowMutation.mutate({ 
        title: (jiraTicket as any)?.summary || `Jira Ticket ${ticketKey}`,
        workflowType: 'jira',
        forceNew: true,
        ticketKey: ticketKey
      });
      toast({
        title: "Processing Jira Ticket",
        description: "Starting Lloyd's workflow for Jira ticket"
      });
    } else if (isJiraWorkflow && ticketKey) {
      // Handle Jira workflow when we have ticketKey but no jiraTicket data yet
      createWorkflowMutation.mutate({ 
        title: `Jira Ticket ${ticketKey}`,
        workflowType: 'jira',
        forceNew: true,
        ticketKey: ticketKey
      });
      toast({
        title: "Processing Jira Ticket",
        description: "Starting Lloyd's workflow for Jira ticket"
      });
    } else if (workflowData?.session?.caseId && workflowData.session.workflowType === 'jira') {
      // Fallback: If current workflow is Jira type, use its caseId as ticketKey
      const extractedTicketKey = workflowData.session.caseId;
      createWorkflowMutation.mutate({ 
        title: workflowData.session.title,
        workflowType: 'jira',
        forceNew: true,
        ticketKey: extractedTicketKey
      });
      toast({
        title: "Processing Jira Ticket",
        description: `Starting new workflow for ${extractedTicketKey}`
      });
    } else if (workflowData?.session) {
      // Restart workflow with same type and title but new session ID
      createWorkflowMutation.mutate({ 
        title: workflowData.session.title,
        workflowType: workflowData.session.workflowType,
        forceNew: true  // Force new workflow creation
      });
      toast({
        title: "Processing with AI Agents",
        description: "Starting new workflow session with AI agents"
      });
    }
  };

  const handleEmailDraftSend = async (draft: any) => {
    try {
      const response = await apiRequest("POST", `/api/workflows/${currentSessionId}/send-email`, draft);
      if (response.ok) {
        toast({
          title: "Email Sent",
          description: "Email has been sent successfully"
        });
        setIsEmailEditorOpen(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email",
        variant: "destructive"
      });
    }
  };

  const handleEmailDraftSave = async (draft: any) => {
    try {
      const response = await apiRequest("POST", `/api/workflows/${currentSessionId}/save-draft`, draft);
      if (response.ok) {
        toast({
          title: "Draft Saved",
          description: "Email draft has been saved"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save draft",
        variant: "destructive"
      });
    }
  };

  // Handle data extraction approval
  const handleDataExtractionApprove = async (extractedData?: any) => {
    try {
      const response = await apiRequest("POST", `/api/workflows/${currentSessionId}/approve-extraction`, {
        extractedData: extractedData || {}
      });
      
      if (response.ok) {
        setDataExtractionCompleted(true);
        setShowDataExtractionForm(false);
        toast({
          title: "Data Extraction Approved",
          description: "Workflow continuing with remaining agents"
        });
      }
    } catch (error) {
      console.error('Data extraction approval error:', error);
      toast({
        title: "Error",
        description: "Failed to approve data extraction",
        variant: "destructive"
      });
    }
  };

  // Handle data extraction rejection
  const handleDataExtractionReject = async (reason?: string) => {
    try {
      const response = await apiRequest("POST", `/api/workflows/${currentSessionId}/reject-extraction`, {
        reason: reason || "Data extraction quality insufficient"
      });
      
      if (response.ok) {
        setShowDataExtractionForm(false);
        toast({
          title: "Data Extraction Rejected",
          description: "Workflow has been stopped",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Data extraction rejection error:', error);
      toast({
        title: "Error",
        description: "Failed to reject data extraction",
        variant: "destructive"
      });
    }
  };

  // For Jira workflows without sessionId, redirect back to dashboard (but allow time for sessionId extraction)
  if (!currentSessionId && isJiraWorkflow && !finalSessionId) {
    console.log('🚨 NO SESSION ID FOUND - checking extraction:', {
      currentSessionId,
      finalSessionId,
      querySessionId,
      pathSessionId: sessionId,
      location
    });
    
    React.useEffect(() => {
      const timer = setTimeout(() => {
        console.log('🚨 REDIRECTING TO DASHBOARD - no sessionId after delay');
        navigate('/jira-dashboard');
      }, 2000); // Increased timeout to allow for sessionId extraction
      return () => clearTimeout(timer);
    }, [navigate]);
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (!currentSessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 max-w-2xl">
          <div className="w-16 h-16 bg-card rounded-lg border border-border flex items-center justify-center mx-auto">
            <img src={exlLogo} alt="EXL" className="h-8 w-auto" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">EXLerate AI</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Underwriting Platform - Create and manage multi-agent workflows with human approval steps and real-time progress tracking.
          </p>
          
          <div className="flex justify-center mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
              {/* Submission Workflow */}
              <div className="border rounded-lg p-8 space-y-6 hover:border-primary transition-colors">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-amber-100 rounded-xl flex items-center justify-center">
                    <ClipboardCheck className="h-8 w-8 text-amber-600" />
                  </div>
                </div>
                <div className="text-center space-y-3">
                  <h3 className="text-xl font-semibold">Insurance Underwriting Workflow</h3>
                  <p className="text-muted-foreground">
                    Complete 8-step underwriting process with submission processing, data extraction, sanctions check, premium calculation, and automated broker communication.
                  </p>
                </div>
                <Button 
                  onClick={() => handleCreateWorkflow('underwriting')}
                  disabled={createWorkflowMutation.isPending}
                  className="w-full h-12"
                  size="lg"
                >
                  {createWorkflowMutation.isPending ? "Creating Workflow..." : "Start New Underwriting"}
                </Button>
              </div>
              
              {/* Slip Workflow */}
              <div className="border rounded-lg p-8 space-y-6 hover:border-primary transition-colors">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center">
                    <FileText className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <div className="text-center space-y-3">
                  <h3 className="text-xl font-semibold">Lloyd's Slip Processing</h3>
                  <p className="text-muted-foreground">
                    Complete 6-step Lloyd's slip processing with validation, coverage analysis, risk assessment, pricing, approval, and documentation.
                  </p>
                </div>
                <Button 
                  onClick={() => handleCreateWorkflow('slip')}
                  disabled={createWorkflowMutation.isPending}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  {createWorkflowMutation.isPending ? "Creating Workflow..." : "Start New Slip Processing"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Loading workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* 3-Column Layout: Agent View | Chat/Timeline | Document Viewer */}
        <PanelGroup direction="horizontal" className="flex-1 min-h-0">
          {/* Left Column - Agent Sidebar (resizable + collapsible) */}
          {!sidebarCollapsed && (
            <>
              <Panel defaultSize={22} minSize={14} maxSize={40} className="min-w-0">
                <WorkflowSidebar
                  session={workflowData?.session}
                  agents={workflowData?.agents || []}
                  workflowStatus={(() => {
                    const hasRunningAgents = workflowData?.agents?.some(a => a.status === 'running');
                    const hasCompletedAgents = workflowData?.agents?.some(a => a.status === 'completed');
                    const hasPendingApprovals = workflowData?.approvals?.some(a => a.status === 'pending');
                    const allAgentsCompleted = workflowData?.agents?.every(a => a.status === 'completed');
                    if (hasPendingApprovals || workflowData?.session?.status === 'pending_approval') return 'Pending Approval';
                    if (allAgentsCompleted && workflowData?.agents?.length) return 'Completed';
                    if (workflowData?.session?.status === 'completed') return 'Completed';
                    if (hasRunningAgents || hasCompletedAgents || workflowData?.session?.status === 'running') return 'Running';
                    return 'Online';
                  })()}
                  onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: [`/api/workflows/${currentSessionId}`] });
                  }}
                  onProcessWithAgents={handleProcessWithAgents}
                  onNewSession={handleNewSession}
                  onOpenEmailEditor={() => setIsEmailEditorOpen(true)}
                  isDataExtractionApproved={dataExtractionCompleted}
                  onShowDataExtractionForm={(agentType) => {
                    setViewFormAgentType(agentType);
                    setShowDataExtractionForm(true);
                  }}
                />
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-blue-400 transition-colors cursor-col-resize" />
            </>
          )}

          {/* Center + Right as one panel group */}
          <Panel className="flex overflow-hidden min-w-0">
            {/* Center Column - AI Workflow OR Timeline View */}
            <div className="flex-1 flex flex-col border-r border-border relative min-w-0">
              {/* Fixed Header with view toggle + action buttons */}
              <div className="sticky top-0 z-10 bg-card px-3 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="h-7 w-7 p-0"
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  </Button>
                  <span className="text-sm font-medium text-foreground">
                    {showTimeline ? 'Timeline' : shouldShowDataExtractionForm ? 'Extracted Data' : 'AI Workflow'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {shouldShowDataExtractionForm && !showTimeline && (
                    <Button variant="ghost" size="sm" onClick={() => setShowDataExtractionForm(false)} className="h-7 px-2 text-xs">
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      Chat
                    </Button>
                  )}
                  <Button
                    variant={showTimeline ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setShowTimeline(!showTimeline); if (!showTimeline) setShowDataExtractionForm(false); }}
                    className="h-7 px-2 text-xs"
                  >
                    {showTimeline ? <MessageSquare className="h-3.5 w-3.5 mr-1" /> : <Clock className="h-3.5 w-3.5 mr-1" />}
                    {showTimeline ? 'Workflow' : 'Timeline'}
                  </Button>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <Button variant="default" size="sm" onClick={handleProcessWithAgents} className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2 text-xs">
                    <Rocket className="h-3.5 w-3.5 mr-1" />
                    Run
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDataExtractionForm(true)} className="h-7 px-2 text-xs">
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Data
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePauseWorkflow} disabled={workflowData?.session?.status !== 'running'} className="h-7 w-7 p-0">
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleStopWorkflow} disabled={workflowData?.session?.status === 'completed'} className="h-7 w-7 p-0 text-destructive border-destructive/30 hover:bg-destructive/10">
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-hidden">
                {showTimeline ? (
                  <div className="h-full flex flex-col">
                    <div className="flex-shrink-0 p-4 border-b border-border bg-card">
                      <h4 className="text-sm font-medium text-foreground mb-2">Case Timeline - {timelineCaseId}</h4>
                      <p className="text-xs text-muted-foreground">Showing {Array.isArray(timelineEvents) ? timelineEvents.length : 0} timeline events</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <CaseTimeline
                        caseId={(workflowData as any)?.session?.caseId || (workflowData as any)?.caseId || 'UW-2025-001'}
                        events={Array.isArray(timelineEvents) ? timelineEvents : []}
                        onEventClick={(event) => {
                          console.log('Timeline event clicked:', event);
                        }}
                      />
                    </div>
                  </div>
                ) : shouldShowDataExtractionForm ? (
                  <div className="h-full overflow-y-auto px-4">
                    {(() => {
                      const isJiraForm = wfType === 'jira' || isJiraWorkflow || currentSessionId?.startsWith('JIR-');
                      const isSlipForm = wfType === 'slip';
                      const isClaimForm = wfType === 'claim';

                      const claimAgentParam = viewFormAgentType ? `&agentType=${viewFormAgentType}` : '';
                      const configEndpoint = isJiraForm
                        ? '/api/jira-forms/data-extraction-config'
                        : isSlipForm
                          ? '/api/slip-forms/data-extraction-config'
                          : isClaimForm
                            ? `/api/claims-forms/data-extraction-config?sessionId=${currentSessionId}${claimAgentParam}`
                            : `/api/submission-forms/data-extraction-config?sessionId=${currentSessionId}`;

                      return (
                        <ConfigurableJiraDataExtractionForm
                          sessionId={currentSessionId}
                          onApprove={handleDataExtractionApprove}
                          onReject={handleDataExtractionReject}
                          onFieldFocus={(source: FieldSource) => setPdfHighlight(source)}
                          onLocationChange={(loc) => setPropertyLocation(loc)}
                          configEndpoint={configEndpoint}
                        />
                      );
                    })()}
                  </div>
                ) : (
                  <div className="h-full">
                    <ChatInterface
                      messages={messages}
                      onSendMessage={sendMessage}
                      sessionId={currentSessionId}
                      approvalRequests={workflowData?.approvals || []}
                      agents={workflowData?.agents || []}
                      onApprove={(requestId) => handleApproval(requestId, true)}
                      onReject={(requestId) => handleApproval(requestId, false)}
                      workflowType={wfType}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Document Viewer */}
            <div className="relative border-l border-border flex-shrink-0 h-full">
              <MultiDocumentViewer
                sessionId={currentSessionId}
                className="h-full"
                initialWidth={500}
                caseId={workflowData?.session?.caseId ?? undefined}
                submissionId={workflowData?.session?.caseId ?? undefined}
                workflowType={workflowData?.session?.workflowType}
                highlight={pdfHighlight}
                propertyLocation={propertyLocation || undefined}
                onWidthChange={(width) => {
                  console.log('Document viewer width changed to:', width);
                }}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <NotificationSystem
        notifications={notifications}
        onDismiss={dismissNotification}
      />
      
      {/* Email Draft Editor */}
      {currentSessionId && (
        <EmailDraftEditor
          isOpen={isEmailEditorOpen}
          onClose={() => setIsEmailEditorOpen(false)}
          sessionId={currentSessionId}
          onSendEmail={handleEmailDraftSend}
          onSaveDraft={handleEmailDraftSave}
        />
      )}
      
      {/* Negotiation Chatbot — submission/slip workflows only. Claim workflows
          have their own Q&A path through the main chat input. */}
      {currentSessionId && wfType !== 'claim' && <NegotiationChatbot sessionId={currentSessionId} />}
    </div>
  );
}
