import { users, workflowSessions, agents, messages, approvalRequests, cases,
         type User, type InsertUser, type WorkflowSession, type InsertWorkflowSession,
         type Agent, type InsertAgent, type Message, type InsertMessage,
         type ApprovalRequest, type InsertApprovalRequest, type Case, type InsertCase } from "@shared/schema";
import { CaseHistoryManager, WorkflowStateManager, AgentStateManager } from "@shared/csv-audit-trail";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  validateUser(email: string, password: string): Promise<User | null>;
  
  // Workflow session methods
  createWorkflowSession(session: InsertWorkflowSession): Promise<WorkflowSession>;
  getWorkflowSession(sessionId: string): Promise<WorkflowSession | undefined>;
  getWorkflowSessionByCaseId(caseId: string): Promise<WorkflowSession | undefined>;
  getAllWorkflowSessions(): Promise<WorkflowSession[]>;
  updateWorkflowSession(sessionId: string, updates: Partial<WorkflowSession>): Promise<WorkflowSession>;
  
  // Agent methods
  createAgent(agent: InsertAgent): Promise<Agent>;
  getAgentsBySession(sessionId: string): Promise<Agent[]>;
  updateAgent(id: number, updates: Partial<Agent>): Promise<Agent>;
  
  // Message methods
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesBySession(sessionId: string): Promise<Message[]>;
  
  // Approval request methods
  createApprovalRequest(request: InsertApprovalRequest): Promise<ApprovalRequest>;
  getApprovalRequestsBySession(sessionId: string): Promise<ApprovalRequest[]>;
  updateApprovalRequest(id: number, updates: Partial<ApprovalRequest>): Promise<ApprovalRequest>;
  
  // Case methods
  createCase(caseData: InsertCase): Promise<Case>;
  getCase(caseId: string): Promise<Case | undefined>;
  getAllCases(): Promise<Case[]>;
  getCasesByType(caseType: string): Promise<Case[]>;
  updateCase(caseId: string, updates: Partial<Case>): Promise<Case>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private workflowSessions: Map<string, WorkflowSession>;
  private agents: Map<number, Agent>;
  private messages: Map<number, Message>;
  private approvalRequests: Map<number, ApprovalRequest>;
  private cases: Map<string, Case>;
  private currentUserId: number;
  private currentAgentId: number;
  private currentMessageId: number;
  private currentApprovalId: number;
  private currentCaseId: number;

  constructor() {
    this.users = new Map();
    this.workflowSessions = new Map();
    this.agents = new Map();
    this.messages = new Map();
    this.approvalRequests = new Map();
    this.cases = new Map();
    this.currentUserId = 1;
    this.currentAgentId = 1;
    this.currentMessageId = 1;
    this.currentApprovalId = 1;
    this.currentCaseId = 1;
    
    // Initialize with dummy cases
    this.initializeDummyCases();
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      id,
      username: insertUser.username || null,
      email: insertUser.email,
      password: insertUser.password,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      role: insertUser.role || "user",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (user && user.password === password) {
      return user;
    }
    return null;
  }

  async createWorkflowSession(insertSession: InsertWorkflowSession): Promise<WorkflowSession> {
    const now = new Date();
    const session: WorkflowSession = {
      id: this.workflowSessions.size + 1,
      sessionId: insertSession.sessionId,
      title: insertSession.title,
      workflowType: insertSession.workflowType || 'underwriting',
      caseType: insertSession.caseType || 'submission',
      status: insertSession.status || 'active',
      currentStep: insertSession.currentStep || 0,
      totalSteps: insertSession.totalSteps || 7,
      caseId: insertSession.caseId || 'UW-2025-001',
      config: insertSession.config || {},
      extractedData: insertSession.extractedData || {},
      createdAt: now,
      updatedAt: now,
    };
    this.workflowSessions.set(session.sessionId, session);
    
    // Save to CSV audit trail
    WorkflowStateManager.saveWorkflowState({
      session_id: session.sessionId,
      title: session.title,
      workflow_type: session.workflowType as any,
      status: session.status as any,
      current_step: session.currentStep,
      total_steps: session.totalSteps,
      case_id: session.caseId || '',
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
      extracted_data: JSON.stringify(session.extractedData),
      config: JSON.stringify(session.config)
    });
    
    // Add case history entry
    CaseHistoryManager.addCaseHistoryRecord({
      case_id: session.caseId || '',
      session_id: session.sessionId,
      event_type: 'system_event',
      actor: 'System',
      actor_type: 'system',
      title: 'Workflow Started',
      description: `${session.title} workflow initiated`,
      details: `Workflow Type: ${session.workflowType}\nCase ID: ${session.caseId}\nTotal Steps: ${session.totalSteps}`,
      status: 'completed',
      priority: 'medium',
      timestamp: session.createdAt.toISOString(),
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString()
    });
    
    return session;
  }

  async getWorkflowSession(sessionId: string): Promise<WorkflowSession | undefined> {
    let session = this.workflowSessions.get(sessionId);
    if (session) return session;

    // Fall back to CSV if not in memory (e.g. after server restart)
    const csvStates = WorkflowStateManager.getAllWorkflowStates();
    const csvState = csvStates.find(s => s.session_id === sessionId);
    if (csvState) {
      session = {
        id: this.workflowSessions.size + 1,
        sessionId: csvState.session_id,
        title: csvState.title,
        workflowType: csvState.workflow_type,
        caseType: csvState.workflow_type,
        status: csvState.status,
        currentStep: csvState.current_step,
        totalSteps: csvState.total_steps,
        caseId: csvState.case_id,
        config: JSON.parse(csvState.config || '{}'),
        extractedData: JSON.parse(csvState.extracted_data || '{}'),
        createdAt: new Date(csvState.created_at),
        updatedAt: new Date(csvState.updated_at)
      };
      this.workflowSessions.set(sessionId, session);
    }
    return session;
  }

  async getWorkflowSessionByCaseId(caseId: string): Promise<WorkflowSession | undefined> {
    // Get all sessions for this case from both memory and CSV
    const allSessions: WorkflowSession[] = [];
    
    // Add in-memory sessions
    Array.from(this.workflowSessions.values())
      .filter(session => session.caseId === caseId)
      .forEach(session => allSessions.push(session));
    
    // Add CSV workflow states
    const csvWorkflowStates = WorkflowStateManager.getAllWorkflowStates()
      .filter(state => state.case_id === caseId);
    
    csvWorkflowStates.forEach(csvWorkflowState => {
      // Only add if not already in memory
      if (!allSessions.find(s => s.sessionId === csvWorkflowState.session_id)) {
        const session: WorkflowSession = {
          id: this.workflowSessions.size + allSessions.length + 1,
          sessionId: csvWorkflowState.session_id,
          title: csvWorkflowState.title,
          workflowType: csvWorkflowState.workflow_type,
          caseType: csvWorkflowState.workflow_type,
          status: csvWorkflowState.status,
          currentStep: csvWorkflowState.current_step,
          totalSteps: csvWorkflowState.total_steps,
          caseId: csvWorkflowState.case_id,
          config: JSON.parse(csvWorkflowState.config || '{}'),
          extractedData: JSON.parse(csvWorkflowState.extracted_data || '{}'),
          createdAt: new Date(csvWorkflowState.created_at),
          updatedAt: new Date(csvWorkflowState.updated_at)
        };
        allSessions.push(session);
        // Add to in-memory storage for future queries
        this.workflowSessions.set(session.sessionId, session);
      }
    });
    
    // Return the most recent session, but prefer workflows with matching case type
    if (allSessions.length > 0) {
      // Auto-detect expected case type from case ID
      const expectedCaseType = caseId.startsWith('SLP-')
        ? 'slip'
        : caseId.startsWith('CLM-')
          ? 'claim'
          : 'submission';
      
      // First, try to find workflows with matching case type
      const matchingTypeSessions = allSessions.filter(session => 
        session.workflowType === expectedCaseType || session.caseType === expectedCaseType
      );
      
      // If we have matching type sessions, use the most recent one
      if (matchingTypeSessions.length > 0) {
        const mostRecentMatchingSession = matchingTypeSessions.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];
        
        console.log(`[Storage] Found ${allSessions.length} sessions for case ${caseId}, returning most recent matching type (${expectedCaseType}): ${mostRecentMatchingSession.sessionId} (status: ${mostRecentMatchingSession.status})`);
        return mostRecentMatchingSession;
      }
      
      // Fallback: return most recent session regardless of type
      const mostRecentSession = allSessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      
      console.log(`[Storage] Found ${allSessions.length} sessions for case ${caseId}, returning most recent (no type match): ${mostRecentSession.sessionId} (status: ${mostRecentSession.status})`);
      return mostRecentSession;
    }
    
    return undefined;
  }

  async getAllWorkflowSessions(): Promise<WorkflowSession[]> {
    // Get all sessions from memory
    const memorySessions = Array.from(this.workflowSessions.values());
    
    // Get all sessions from CSV and add any missing ones
    const csvWorkflowStates = WorkflowStateManager.getAllWorkflowStates();
    const sessionMap = new Map<string, WorkflowSession>();
    
    // Add memory sessions first
    memorySessions.forEach(session => {
      sessionMap.set(session.sessionId, session);
    });
    
    // Add CSV sessions that aren't in memory
    csvWorkflowStates.forEach(csvState => {
      if (!sessionMap.has(csvState.session_id)) {
        const session: WorkflowSession = {
          id: this.workflowSessions.size + sessionMap.size + 1,
          sessionId: csvState.session_id,
          title: csvState.title,
          workflowType: csvState.workflow_type,
          caseType: csvState.workflow_type,
          status: csvState.status,
          currentStep: csvState.current_step,
          totalSteps: csvState.total_steps,
          caseId: csvState.case_id,
          config: JSON.parse(csvState.config || '{}'),
          extractedData: JSON.parse(csvState.extracted_data || '{}'),
          createdAt: new Date(csvState.created_at),
          updatedAt: new Date(csvState.updated_at)
        };
        sessionMap.set(session.sessionId, session);
        // Also add to in-memory storage
        this.workflowSessions.set(session.sessionId, session);
      }
    });
    
    return Array.from(sessionMap.values());
  }

  async updateWorkflowSession(sessionId: string, updates: Partial<WorkflowSession>): Promise<WorkflowSession> {
    let session = this.workflowSessions.get(sessionId);

    // Fall back to CSV if not in memory (e.g. after server restart)
    if (!session) {
      const csvStates = WorkflowStateManager.getAllWorkflowStates();
      const csvState = csvStates.find(s => s.session_id === sessionId);
      if (csvState) {
        session = {
          id: this.workflowSessions.size + 1,
          sessionId: csvState.session_id,
          title: csvState.title,
          workflowType: csvState.workflow_type,
          caseType: csvState.workflow_type,
          status: csvState.status,
          currentStep: csvState.current_step,
          totalSteps: csvState.total_steps,
          caseId: csvState.case_id,
          config: JSON.parse(csvState.config || '{}'),
          extractedData: JSON.parse(csvState.extracted_data || '{}'),
          createdAt: new Date(csvState.created_at),
          updatedAt: new Date(csvState.updated_at)
        };
        this.workflowSessions.set(sessionId, session);
      }
    }

    if (!session) throw new Error('Session not found');
    
    const updatedSession = { ...session, ...updates, updatedAt: new Date() };
    this.workflowSessions.set(sessionId, updatedSession);
    
    // Save to CSV audit trail
    WorkflowStateManager.saveWorkflowState({
      session_id: updatedSession.sessionId,
      title: updatedSession.title,
      workflow_type: updatedSession.workflowType as any,
      status: updatedSession.status as any,
      current_step: updatedSession.currentStep,
      total_steps: updatedSession.totalSteps,
      case_id: updatedSession.caseId || '',
      created_at: updatedSession.createdAt.toISOString(),
      updated_at: updatedSession.updatedAt.toISOString(),
      extracted_data: JSON.stringify(updatedSession.extractedData),
      config: JSON.stringify(updatedSession.config)
    });
    
    // Add case history entry for status changes
    if (updates.status && updates.status !== session.status) {
      CaseHistoryManager.addCaseHistoryRecord({
        case_id: updatedSession.caseId || '',
        session_id: updatedSession.sessionId,
        event_type: 'system_event',
        actor: 'System',
        actor_type: 'system',
        title: `Workflow Status Changed`,
        description: `Status changed from ${session.status} to ${updates.status}`,
        details: `Previous Status: ${session.status}\nNew Status: ${updates.status}\nStep: ${updatedSession.currentStep}/${updatedSession.totalSteps}`,
        status: 'completed',
        priority: 'medium',
        timestamp: updatedSession.updatedAt.toISOString(),
        created_at: updatedSession.updatedAt.toISOString(),
        updated_at: updatedSession.updatedAt.toISOString()
      });
    }
    
    return updatedSession;
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const now = new Date();
    const agent: Agent = {
      id: this.currentAgentId++,
      sessionId: insertAgent.sessionId,
      name: insertAgent.name,
      type: insertAgent.type,
      status: insertAgent.status || 'waiting',
      progress: insertAgent.progress || 0,
      description: insertAgent.description || null,
      results: insertAgent.results || {},
      systemPrompt: insertAgent.systemPrompt || null,
      instructions: insertAgent.instructions || null,
      config: insertAgent.config || {},
      capabilities: insertAgent.capabilities || [],
      createdAt: now,
      updatedAt: now,
    };
    this.agents.set(agent.id, agent);
    
    // Save to CSV audit trail
    AgentStateManager.saveAgentState({
      session_id: agent.sessionId,
      agent_id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status as any,
      progress: agent.progress,
      output: JSON.stringify(agent.results),
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString()
    });
    
    return agent;
  }

  async getAgentsBySession(sessionId: string): Promise<Agent[]> {
    // First get agents from memory
    const memoryAgents = Array.from(this.agents.values()).filter(agent => agent.sessionId === sessionId);
    
    // Then get agents from CSV
    const csvAgentStates = AgentStateManager.getAgentStates(sessionId);
    const agentMap = new Map<number, Agent>();
    
    // Add memory agents first
    memoryAgents.forEach(agent => {
      agentMap.set(agent.id, agent);
    });
    
    // Add CSV agents that aren't in memory
    csvAgentStates.forEach(csvState => {
      if (!agentMap.has(csvState.agent_id)) {
        const agent: Agent = {
          id: csvState.agent_id,
          sessionId: csvState.session_id,
          name: csvState.name,
          type: csvState.type,
          status: csvState.status,
          progress: csvState.progress,
          description: null,
          results: JSON.parse(csvState.output || '{}'),
          systemPrompt: null,
          instructions: null,
          config: {},
          capabilities: [],
          createdAt: new Date(csvState.created_at),
          updatedAt: new Date(csvState.updated_at)
        };
        agentMap.set(agent.id, agent);
        // Also add to in-memory storage
        this.agents.set(agent.id, agent);
      }
    });
    
    return Array.from(agentMap.values());
  }

  async updateAgent(id: number, updates: Partial<Agent>): Promise<Agent> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error('Agent not found');
    
    const updatedAgent = { ...agent, ...updates, updatedAt: new Date() };
    this.agents.set(id, updatedAgent);
    
    // Save to CSV audit trail
    AgentStateManager.saveAgentState({
      session_id: updatedAgent.sessionId,
      agent_id: updatedAgent.id,
      name: updatedAgent.name,
      type: updatedAgent.type,
      status: updatedAgent.status as any,
      progress: updatedAgent.progress,
      output: JSON.stringify(updatedAgent.results),
      created_at: updatedAgent.createdAt.toISOString(),
      updated_at: updatedAgent.updatedAt.toISOString()
    });
    
    // Add case history entry for agent status changes
    if (updates.status && updates.status !== agent.status) {
      const session = this.workflowSessions.get(updatedAgent.sessionId);
      const caseId = session?.caseId || '';
      
      if (updates.status === 'running') {
        CaseHistoryManager.addCaseHistoryRecord({
          case_id: caseId,
          session_id: updatedAgent.sessionId,
          event_type: 'agent_execution',
          actor: updatedAgent.name,
          actor_type: 'agent',
          title: `${updatedAgent.name} Started`,
          description: `Agent processing started for ${updatedAgent.type}`,
          details: `Agent Type: ${updatedAgent.type}\nStatus: started\nProgress: ${updatedAgent.progress}%`,
          status: 'completed',
          priority: 'medium',
          timestamp: updatedAgent.updatedAt.toISOString(),
          created_at: updatedAgent.updatedAt.toISOString(),
          updated_at: updatedAgent.updatedAt.toISOString()
        });
      } else if (updates.status === 'completed') {
        CaseHistoryManager.addCaseHistoryRecord({
          case_id: caseId,
          session_id: updatedAgent.sessionId,
          event_type: 'agent_execution',
          actor: updatedAgent.name,
          actor_type: 'agent',
          title: `${updatedAgent.name} Completed`,
          description: `Agent successfully completed processing`,
          details: `Agent: ${updatedAgent.name}\nStatus: completed\nProgress: ${updatedAgent.progress}%\nConfidence: ${updates.results ? '0.85' : '0.80'}\nOutput: ${typeof updates.results === 'string' ? updates.results : JSON.stringify(updates.results)}`,
          status: 'completed',
          priority: 'medium',
          timestamp: updatedAgent.updatedAt.toISOString(),
          created_at: updatedAgent.updatedAt.toISOString(),
          updated_at: updatedAgent.updatedAt.toISOString()
        });
      }
    }
    
    return updatedAgent;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const message: Message = {
      id: this.currentMessageId++,
      sessionId: insertMessage.sessionId,
      type: insertMessage.type,
      sender: insertMessage.sender,
      content: insertMessage.content,
      metadata: insertMessage.metadata || {},
      timestamp: new Date(),
    };
    this.messages.set(message.id, message);
    return message;
  }

  async getMessagesBySession(sessionId: string): Promise<Message[]> {
    const memoryMessages = Array.from(this.messages.values())
      .filter(message => message.sessionId === sessionId);
    
    // Always load historical messages from CSV for complete case history
    const session = this.workflowSessions.get(sessionId);
    if (session) {
      // Get ALL case history across all sessions for this case
      const caseHistory = CaseHistoryManager.getCaseHistory(session.caseId);
      
      // Create system messages from complete case history
      const historicalMessages: Message[] = [];
      
      // Only show case history for Jira workflows that are fully completed —
      // never for running/paused sessions, because a fresh forceNew session
      // starts with 0 messages and would otherwise flash old history.
      const isJiraWorkflow = session.workflowType === 'jira';
      const isCompleted = session.status === 'completed' || session.status === 'rejected';
      if (isJiraWorkflow && isCompleted && memoryMessages.length === 0) {
        caseHistory.forEach((record, index) => {
          const message: Message = {
            id: this.currentMessageId++,
            sessionId: sessionId,
            role: 'system',
            content: `**${record.title}**\n\n${record.description}\n\n${record.details || ''}`,
            timestamp: new Date(record.timestamp),
            createdAt: new Date(record.timestamp),
            updatedAt: new Date(record.timestamp)
          };
          historicalMessages.push(message);
          // Don't store in memory to avoid duplicates
        });
      }
      
      // Combine historical messages with current session messages
      const allMessages = [...historicalMessages, ...memoryMessages];
      return allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    
    return memoryMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async createApprovalRequest(insertRequest: InsertApprovalRequest): Promise<ApprovalRequest> {
    // Only check for pending requests to prevent duplicates
    const existingRequests = Array.from(this.approvalRequests.values())
      .filter(r => r.sessionId === insertRequest.sessionId && r.status === 'pending');
    
    if (existingRequests.length > 0) {
      // Return existing pending request instead of creating new one
      return existingRequests[0];
    }

    const request: ApprovalRequest = {
      id: this.currentApprovalId++,
      sessionId: insertRequest.sessionId,
      type: insertRequest.type,
      title: insertRequest.title,
      description: insertRequest.description,
      data: insertRequest.data,
      status: insertRequest.status || 'pending',
      createdAt: new Date(),
      resolvedAt: null,
    };
    this.approvalRequests.set(request.id, request);
    
    // Add case history entry for approval request
    const session = this.workflowSessions.get(request.sessionId);
    const caseId = session?.caseId || '';
    
    CaseHistoryManager.addCaseHistoryRecord({
      case_id: caseId,
      session_id: request.sessionId,
      event_type: 'approval_request',
      actor: 'System',
      actor_type: 'system',
      title: `${request.type === 'data_extraction' ? 'Data Extraction' : request.type === 'sanctions_check' ? 'Sanctions Check' : 'Email Draft'} Approval Required`,
      description: `Human review required for ${request.type.replace('_', ' ')}`,
      details: `Request: ${request.title}\nType: ${request.type}\nStatus: pending`,
      status: 'completed',
      priority: 'high',
      timestamp: request.createdAt.toISOString(),
      created_at: request.createdAt.toISOString(),
      updated_at: request.createdAt.toISOString()
    });
    
    return request;
  }

  async getApprovalRequestsBySession(sessionId: string): Promise<ApprovalRequest[]> {
    return Array.from(this.approvalRequests.values())
      .filter(request => request.sessionId === sessionId);
  }

  async updateApprovalRequest(id: number, updates: Partial<ApprovalRequest>): Promise<ApprovalRequest> {
    const request = this.approvalRequests.get(id);
    if (!request) throw new Error('Approval request not found');
    
    const updatedRequest = { ...request, ...updates };
    if (updates.status && updates.status !== 'pending') {
      updatedRequest.resolvedAt = new Date();
    }
    this.approvalRequests.set(id, updatedRequest);
    
    // Add case history entry for approval response
    if (updates.status && updates.status !== 'pending') {
      const session = this.workflowSessions.get(updatedRequest.sessionId);
      const caseId = session?.caseId || '';
      
      CaseHistoryManager.addCaseHistoryRecord({
        case_id: caseId,
        session_id: updatedRequest.sessionId,
        event_type: 'approval_response',
        actor: 'Underwriter',
        actor_type: 'underwriter',
        title: `${updatedRequest.type === 'data_extraction' ? 'Data Extraction' : updatedRequest.type === 'sanctions_check' ? 'Sanctions Check' : 'Email Draft'} ${updates.status === 'approved' ? 'Approved' : 'Rejected'}`,
        description: `Human ${updates.status === 'approved' ? 'approved' : 'rejected'} ${updatedRequest.type.replace('_', ' ')} request`,
        details: `Request: ${updatedRequest.title}\nResponse: ${updates.status === 'approved' ? 'Approved' : 'Rejected'}\nDecision: ${updates.status}`,
        status: 'completed',
        priority: 'high',
        timestamp: updatedRequest.resolvedAt?.toISOString() || new Date().toISOString(),
        created_at: updatedRequest.resolvedAt?.toISOString() || new Date().toISOString(),
        updated_at: updatedRequest.resolvedAt?.toISOString() || new Date().toISOString()
      });
    }
    
    return updatedRequest;
  }

  // Case methods
  async createCase(insertCase: InsertCase): Promise<Case> {
    const caseData: Case = {
      id: this.currentCaseId++,
      caseId: insertCase.caseId,
      caseType: insertCase.caseType,
      businessName: insertCase.businessName,
      policyType: insertCase.policyType,
      assignedUnderwriter: insertCase.assignedUnderwriter || null,
      priority: insertCase.priority || 'medium',
      status: insertCase.status || 'pending',
      submissionDate: insertCase.submissionDate || new Date(),
      premium: insertCase.premium || null,
      broker: insertCase.broker || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.cases.set(caseData.caseId, caseData);
    return caseData;
  }

  async getCase(caseId: string): Promise<Case | undefined> {
    return this.cases.get(caseId);
  }

  async getAllCases(): Promise<Case[]> {
    return Array.from(this.cases.values());
  }

  async getCasesByType(caseType: string): Promise<Case[]> {
    return Array.from(this.cases.values())
      .filter(caseData => caseData.caseType === caseType);
  }

  async updateCase(caseId: string, updates: Partial<Case>): Promise<Case> {
    const caseData = this.cases.get(caseId);
    if (!caseData) throw new Error('Case not found');
    
    const updatedCase = { ...caseData, ...updates, updatedAt: new Date() };
    this.cases.set(caseId, updatedCase);
    return updatedCase;
  }

  private initializeDummyCases() {
    // Submission cases
    const submissionCases = [
      {
        caseId: 'SUB-2025-001',
        caseType: 'submission',
        businessName: 'Arthur J Gallagher (UK) Ltd',
        policyType: 'Home Insurance',
        assignedUnderwriter: 'Sarah Johnson',
        priority: 'high',
        status: 'processing',
        premium: '£8,021',
        broker: 'Peters Charley',
        submissionDate: new Date('2025-01-10')
      },
      {
        caseId: 'SUB-2025-002',
        caseType: 'submission',
        businessName: 'Marsh UK Limited',
        policyType: 'Commercial Property',
        assignedUnderwriter: 'Michael Brown',
        priority: 'medium',
        status: 'pending',
        premium: '£15,450',
        broker: 'Emma Wilson',
        submissionDate: new Date('2025-01-11')
      },
      {
        caseId: 'SUB-2025-003',
        caseType: 'submission',
        businessName: 'AON Risk Solutions',
        policyType: 'Motor Fleet',
        assignedUnderwriter: 'David Lee',
        priority: 'low',
        status: 'completed',
        premium: '£22,100',
        broker: 'James Thompson',
        submissionDate: new Date('2025-01-09')
      }
    ];

    // Claim cases
    const claimCases = [
      {
        caseId: 'CLM-2025-001',
        caseType: 'claim',
        businessName: 'Lee Warner Jones',
        policyType: 'Water Damage',
        assignedUnderwriter: 'Michael Brown',
        priority: 'high',
        status: 'pending_approval',
        premium: '£18,500',
        broker: 'Peters Charley',
        submissionDate: new Date('2025-02-15')
      },
      {
        caseId: 'CLM-2025-002',
        caseType: 'claim',
        businessName: 'Michael James Thompson',
        policyType: 'Theft',
        assignedUnderwriter: 'Rachel Green',
        priority: 'high',
        status: 'processing',
        premium: '£62,400',
        broker: 'Michael Thompson',
        submissionDate: new Date('2025-03-02')
      },
      {
        caseId: 'CLM-2025-003',
        caseType: 'claim',
        businessName: 'Emma Louise Wilson',
        policyType: 'Fire',
        assignedUnderwriter: 'David Lee',
        priority: 'medium',
        status: 'completed',
        premium: '£42,750',
        broker: 'Emma Wilson',
        submissionDate: new Date('2025-03-18')
      }
    ];

    // Slip cases
    const slipCases = [
      {
        caseId: 'SLP-2025-001',
        caseType: 'slip',
        businessName: 'London Market Syndicate',
        policyType: 'Marine Cargo',
        assignedUnderwriter: 'Rachel Green',
        priority: 'high',
        status: 'processing',
        premium: '£85,000',
        broker: 'Lloyd\'s Broker',
        submissionDate: new Date('2025-01-12')
      },
      {
        caseId: 'SLP-2025-002',
        caseType: 'slip',
        businessName: 'Specialty Lines Ltd',
        policyType: 'Aviation',
        assignedUnderwriter: 'Tom Wilson',
        priority: 'high',
        status: 'pending_approval',
        premium: '£125,000',
        broker: 'Aviation Specialists',
        submissionDate: new Date('2025-01-11')
      },
      {
        caseId: 'SLP-2025-003',
        caseType: 'slip',
        businessName: 'Energy Risks plc',
        policyType: 'Oil & Gas',
        assignedUnderwriter: 'Lisa Chen',
        priority: 'medium',
        status: 'completed',
        premium: '£45,500',
        broker: 'Energy Brokers Ltd',
        submissionDate: new Date('2025-01-08')
      }
    ];

    // Initialize all cases
    [...submissionCases, ...slipCases, ...claimCases].forEach(caseData => {
      const fullCase: Case = {
        id: this.currentCaseId++,
        caseId: caseData.caseId,
        caseType: caseData.caseType as 'submission' | 'slip' | 'claim',
        businessName: caseData.businessName,
        policyType: caseData.policyType,
        assignedUnderwriter: caseData.assignedUnderwriter,
        priority: caseData.priority as 'high' | 'medium' | 'low',
        status: caseData.status as 'pending' | 'processing' | 'completed' | 'rejected' | 'pending_approval',
        submissionDate: caseData.submissionDate,
        premium: caseData.premium,
        broker: caseData.broker,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.cases.set(fullCase.caseId, fullCase);
    });
  }
}

export const storage = new MemStorage();
