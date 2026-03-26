import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { io, Socket } from "socket.io-client";
import type { WorkflowSession, Agent, Message, ApprovalRequest } from "@shared/schema";

interface WorkflowData {
  session: WorkflowSession;
  agents: Agent[];
  messages: Message[];
  approvals: ApprovalRequest[];
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
}

export function useWorkflow(sessionId: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const queryClient = useQueryClient();

  const { data: workflowData, isLoading } = useQuery<WorkflowData>({
    queryKey: ['/api/workflows', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      
      // Fetch all workflow data in parallel
      const [sessionResponse, agentsResponse, messagesResponse, approvalsResponse] = await Promise.all([
        apiRequest("GET", `/api/workflows/${sessionId}`),
        apiRequest("GET", `/api/workflows/${sessionId}/agents`),
        apiRequest("GET", `/api/workflows/${sessionId}/messages`),
        apiRequest("GET", `/api/workflows/${sessionId}/approvals`)
      ]);
      
      const [session, agents, messages, approvals] = await Promise.all([
        sessionResponse.json(),
        agentsResponse.json(),
        messagesResponse.json(),
        approvalsResponse.json()
      ]);
      
      return { session, agents, messages, approvals };
    },
    enabled: !!sessionId,
    refetchInterval: 10000, // Refresh every 10 seconds to reduce reloading
    refetchOnWindowFocus: false,
    staleTime: 5000, // 5 seconds
  });

  const messages = workflowData?.messages || [];

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", `/api/workflows/${sessionId}/messages`, {
        type: 'user',
        sender: 'User',
        content,
        metadata: {}
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
    }
  });

  const handleApprovalMutation = useMutation({
    mutationFn: async ({ requestId, approved }: { requestId: number; approved: boolean }) => {
      // Send approval response as a chat message
      const message = approved ? 'yes' : 'no';
      const response = await apiRequest("POST", `/api/workflows/${sessionId}/messages`, {
        type: 'user',
        sender: 'User',
        content: message,
        metadata: { approvalRequestId: requestId }
      });
      return response.json();
    },
    onSuccess: () => {
      // Force immediate refresh of workflow data
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
      queryClient.refetchQueries({ queryKey: ['/api/workflows', sessionId] });
    }
  });

  const addNotification = useCallback((type: Notification['type'], title: string, message: string) => {
    const notification: Notification = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      timestamp: new Date()
    };
    
    setNotifications(prev => {
      // Only keep last 5 notifications to prevent memory issues
      const updated = [...prev, notification];
      return updated.slice(-5);
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const connect = useCallback((sessionId: string) => {
    if (socket) {
      socket.disconnect();
    }

    const newSocket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('Connected to workflow socket');
      newSocket.emit('join-workflow', sessionId);
    });

    newSocket.on('stepStarted', (data) => {
      console.log('Step started:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
    });

    newSocket.on('agent-update', (data) => {
      console.log('Agent update:', data);
      
      // CRITICAL: Force immediate refetch on any agent status change to show real-time highlighting
      if (data.status === 'running') {
        // Immediately invalidate to force refetch when agent starts running
        queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
      }
      
      // Update the main workflow data with new agent progress using smooth animation
      queryClient.setQueryData(['/api/workflows', sessionId], (oldData: any) => {
        if (!oldData) return oldData;
        
        const updatedAgents = oldData.agents.map((agent: any) => {
          if (agent.id === data.agentId) {
            return {
              ...agent,
              progress: data.progress,
              status: data.status || agent.status
            };
          }
          return agent;
        });
        
        return {
          ...oldData,
          agents: updatedAgents
        };
      });
      
      // Invalidate queries when agent status changes
      if (data.status === 'running' || data.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
        
        // Invalidate timeline cache when agent completes for real-time updates
        if (data.caseId) {
          queryClient.invalidateQueries({ 
            queryKey: [`/api/cases/${data.caseId}/timeline`],
            exact: false
          });
        }
      }
      
      // Add status-specific notifications
      if (data.status === 'running' && data.progress === 0) {
        addNotification('info', `⚡ ${data.agentName || 'Agent'} Started`, 'Agent is now processing data with AI models');
      } else if (data.status === 'completed') {
        addNotification('success', `🧠 ${data.agentName || 'Agent'} Completed`, 'Optimized Agent memory - Processing complete with high confidence');
      }
    });

    newSocket.on('agentCompleted', (data) => {
      console.log('Agent completed:', data);
      // This event is handled by agent-update event when status is 'completed'
      // Just invalidate timeline for completed agents
      if (data.caseId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/cases/${data.caseId}/timeline`],
          exact: false
        });
      }
    });

    newSocket.on('workflow-update', (data) => {
      console.log('Workflow update:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
      
      // Invalidate timeline cache when workflow updates for real-time updates
      if (data.caseId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/cases/${data.caseId}/timeline`],
          exact: false
        });
      }
      
      if (data.status === 'completed') {
        addNotification('success', 'Workflow Completed', 'All agents have completed successfully');
      }
    });

    newSocket.on('messageAdded', (data) => {
      console.log('Message added:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
      
      // Invalidate timeline cache when new messages are added
      if (data.caseId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/cases/${data.caseId}/timeline`],
          exact: false
        });
      }
    });

    newSocket.on('approvalRequired', (data) => {
      console.log('Approval required:', data);
      addNotification('warning', 'Approval Required', 'Human approval needed to continue');
      // Force immediate refresh of workflow data to get new approval
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
      queryClient.refetchQueries({ queryKey: ['/api/workflows', sessionId] });
    });

    newSocket.on('approvalHandled', (data) => {
      console.log('Approval handled:', data);
      addNotification('success', 'Approval Processed', 
        data.approved ? 'Request approved, continuing workflow' : 'Request rejected, workflow paused'
      );
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
      
      // Invalidate timeline cache when approvals are processed
      if (data.caseId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/cases/${data.caseId}/timeline`],
          exact: false
        });
      }
    });

    newSocket.on('workflowCompleted', (data) => {
      console.log('Workflow completed:', data);
      addNotification('success', 'Workflow Complete', 'All steps completed successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', sessionId] });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from workflow socket');
    });

    setSocket(newSocket);
  }, []);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  }, [socket]);

  const sendMessage = useCallback((content: string) => {
    if (sessionId) {
      sendMessageMutation.mutate(content);
    }
  }, [sessionId, sendMessageMutation]);

  const handleApproval = useCallback((requestId: number, approved: boolean) => {
    console.log('HandleApproval called with:', requestId, approved);
    if (sessionId) {
      handleApprovalMutation.mutate({ requestId, approved });
    }
  }, [sessionId, handleApprovalMutation]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    workflowData,
    messages,
    isLoading,
    notifications,
    connect,
    disconnect,
    sendMessage,
    handleApproval,
    dismissNotification
  };
}
