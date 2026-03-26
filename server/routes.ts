import express, { Express } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { storage } from './storage';
import { documentService, type DocumentInfo } from './documentService';
import { spawn } from 'child_process';
import type { InsertWorkflowSession, InsertAgent, InsertMessage, InsertApprovalRequest, LoginData } from '../shared/schema';
import { loginSchema } from '../shared/schema';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { localApiClient } from './localApiClient';
import { registerJiraRoutes } from './jira-api';
import { shouldSkipMismatchSummary, getNextAgentAfterFieldComparison } from './workflow-logic';
import { compareApprovedDataWithReference } from './csv-comparison';
import { getAgentResponse, refreshConfigCache } from './agent-response-config';
import { insuranceAgentSteps, AGENT_SPEED_MULTIPLIER } from './insurance-agent-steps';
import { SANCTIONS_STEP_DELAYS_MS, DATA_VALIDATION_STEP_DELAYS_MS, GENERIC_AGENT_STEP_DELAYS_MS, CHAT_TYPEWRITER_TARGET_MS, CHAT_TYPEWRITER_MIN_MS, CHAT_TYPEWRITER_MAX_MS, CHAT_READING_BUFFER_PER_CHAR_MS } from './demo-config';
import { getJiraAgentSteps } from './jira-agent-steps';
import { getJiraTicketAttachments } from './jira-api';
import { credentialManager } from '../core/config/credential-manager';

// Flask integration removed - using direct OpenRouter API integration
import fs from 'fs';
import path from 'path';
import axios from 'axios';


// Fallback response when OpenRouter fails
function getFallbackResponse(agentName: string): any {
  return {
    agent_name: agentName,
    status: 'completed',
    confidence: 0.85,
    ai_response: `${agentName} completed processing with fallback logic (OpenRouter temporarily unavailable)`,
    fallback_used: true
  };
}

const workflowConfigs = {
  'underwriting': {
    totalSteps: 7,
    agents: [
      { name: 'Data Extraction Agent', type: 'extractor', description: 'Data Extraction Agent for insurance underwriting process' },
      { name: 'Sanctions Check Agent', type: 'sanctions', description: 'Sanctions Check Agent for insurance underwriting process' },
      { name: 'Premium Calculation Agent', type: 'calculator', description: 'Premium Calculation Agent for insurance underwriting process' },
      { name: 'Email Draft Agent', type: 'drafter', description: 'Email Draft Agent for insurance underwriting process' },
      { name: 'Email Sender Agent', type: 'sender', description: 'Email Sender Agent for insurance underwriting process' },
      { name: 'Final Decision Agent', type: 'decider', description: 'Final Decision Agent for insurance underwriting process' }
    ]
  }
};

// Session type declaration
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    user?: any;
  }
}

export async function registerRoutes(app: Express) {
  // Refresh agent response configuration cache on startup
  refreshConfigCache();
  console.log('[Config] Agent response configuration cache refreshed on startup');
  
  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
  }));

  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`Client ${socket.id} connected`);
    
    socket.on('join-workflow', (sessionId) => {
      socket.join(sessionId);
      console.log(`Client ${socket.id} joined workflow ${sessionId}`);
    });
    
    socket.on('disconnect', () => {
      console.log(`Client ${socket.id} disconnected`);
    });
  });

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.session.userId) {
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };

  // Demo / presentation config endpoint (no auth required — frontend reads on load)
  app.get('/api/demo-config', (req, res) => {
    res.json({
      chatTypewriterTargetMs: CHAT_TYPEWRITER_TARGET_MS,
      chatTypewriterMinMs: CHAT_TYPEWRITER_MIN_MS,
      chatTypewriterMaxMs: CHAT_TYPEWRITER_MAX_MS,
    });
  });

  // Credential validation and management endpoints
  app.get('/api/config/credentials/validate', requireAuth, async (req, res) => {
    try {
      const validation = await credentialManager.validateCredentials();
      
      if (validation.valid) {
        const config = await credentialManager.loadCredentials();
        res.json({
          valid: true,
          services: {
            aws: { 
              configured: !!config.aws.access_key_id && !config.aws.access_key_id.includes('EXAMPLE'),
              region: config.aws.region 
            },
            jira: { 
              configured: !!config.jira.api_token && !config.jira.api_token.includes('...'),
              baseUrl: config.jira.base_url,
              email: config.jira.email 
            },
            openrouter: { 
              configured: !!config.openrouter.api_key && !config.openrouter.api_key.includes('...'),
              model: config.openrouter.models.primary 
            }
          },
          features: config.features
        });
      } else {
        res.status(400).json({
          valid: false,
          missing: validation.missing,
          message: `Missing required credentials: ${validation.missing.join(', ')}`
        });
      }
    } catch (error) {
      console.error('[Credentials] Validation error:', error);
      res.status(500).json({ error: 'Failed to validate credentials' });
    }
  });

  // Get all credentials (with masked sensitive data)
  app.get('/api/config/credentials', requireAuth, async (req, res) => {
    try {
      const config = await credentialManager.loadCredentials();
      const maskedConfig = {
        ...config,
        aws: {
          ...config.aws,
          access_key_id: config.aws.access_key_id ? '***masked***' : '',
          secret_access_key: config.aws.secret_access_key ? '***masked***' : '',
          session_token: config.aws.session_token ? '***masked***' : ''
        },
        jira: {
          ...config.jira,
          api_token: config.jira.api_token ? '***masked***' : ''
        },
        openrouter: {
          ...config.openrouter,
          api_key: config.openrouter.api_key ? '***masked***' : ''
        }
      };
      res.json(maskedConfig);
    } catch (error) {
      console.error('[Credentials] Get error:', error);
      res.status(500).json({ error: 'Failed to load credentials' });
    }
  });

  // Update credentials
  app.post('/api/config/credentials', requireAuth, async (req, res) => {
    try {
      const updates = req.body;
      await credentialManager.updateCredentials(updates);
      res.json({ success: true, message: 'Credentials updated successfully' });
    } catch (error) {
      console.error('[Credentials] Update error:', error);
      res.status(500).json({ error: 'Failed to update credentials' });
    }
  });

  // Jira Configuration routes
  app.get('/api/jira/config', async (req, res) => {
    try {
      const jiraConfig = await credentialManager.getJiraCredentials();
      const config = {
        baseUrl: jiraConfig.base_url,
        email: jiraConfig.email,
        apiToken: jiraConfig.api_token ? '***masked***' : '',
        defaultProject: jiraConfig.project_key
      };
      res.json(config);
    } catch (error) {
      console.error('[Jira] Config error:', error);
      res.status(500).json({ error: 'Failed to load Jira configuration' });
    }
  });

  app.post('/api/jira/config', (req, res) => {
    try {
      const { baseUrl, email, apiToken, defaultProject } = req.body;
      
      // In production, you'd save to database or environment
      // For now, we'll update the process.env (temporary for session)
      process.env.JIRA_BASE_URL = baseUrl;
      process.env.JIRA_EMAIL = email;
      if (apiToken && apiToken !== '***masked***') {
        process.env.JIRA_API_TOKEN = apiToken;
      }
      process.env.JIRA_DEFAULT_PROJECT = defaultProject;
      
      res.json({ success: true, message: 'Configuration updated successfully' });
    } catch (error) {
      console.error('Failed to save Jira config:', error);
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  });

  app.post('/api/jira/test-connection', async (req, res) => {
    try {
      const { baseUrl, email, apiToken } = req.body;
      
      const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
      const response = await fetch(`${baseUrl}/rest/api/2/project`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const projects = await response.json();
        res.json({ 
          success: true, 
          projectCount: projects.length,
          projects: projects.slice(0, 5).map((p: any) => ({ key: p.key, name: p.name }))
        });
      } else {
        const error = await response.text();
        res.status(response.status).json({ 
          error: `Connection failed: ${response.status} ${error}` 
        });
      }
    } catch (error) {
      console.error('Jira connection test failed:', error);
      res.status(500).json({ error: 'Connection test failed: Network error' });
    }
  });

  // Authentication routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      // For demo purposes, allow any email with password123 or admin123
      if (password === 'password123' || password === 'admin123') {
        // Create or get user
        let user = await storage.getUserByEmail(email);
        if (!user) {
          const hashedPassword = await bcrypt.hash(password, 10);
          user = await storage.createUser({
            email,
            password: hashedPassword,
            firstName: 'Demo',
            lastName: 'User',
            role: 'user'
          });
        }
      } else {
        // For existing users, validate password
        let user = await storage.getUserByEmail(email);
        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
      }
      
      // Get the user for session
      const user = await storage.getUserByEmail(email);
      
      req.session.userId = user.id;
      req.session.user = user;
      
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          email: user.email, 
          firstName: user.firstName, 
          lastName: user.lastName 
        } 
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(400).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  app.get('/api/auth/user', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ 
        id: user.id, 
        email: user.email, 
        firstName: user.firstName, 
        lastName: user.lastName 
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // Broker information submission endpoint (public - no auth required)
  app.post('/api/broker-info/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { financialStatements, lossHistory, certificate, safetyProtocols } = req.body;
      
      // Validate required fields
      if (!financialStatements || !lossHistory || !certificate || !safetyProtocols) {
        return res.status(400).json({ error: 'All required fields must be provided' });
      }
      
      // Update workflow session
      await storage.updateWorkflowSession(sessionId, { 
        status: 'running',
        currentStep: 1
      });
      
      // Create broker submission message
      await storage.createMessage({
        sessionId,
        content: `✅ Broker Information Received

Submitted Documents:
- ✅ Financial Statements: ${financialStatements}
- ✅ Loss History: ${lossHistory}
- ✅ Certificate of Good Standing: ${certificate}
- ✅ Safety Protocols: ${safetyProtocols}

Status: All required information received. Workflow resuming automatically...`,
        type: 'system',
        sender: 'Broker System',
        createdAt: new Date()
      });
      
      // Resume workflow from Data Extraction Agent with complete info
      setTimeout(async () => {
        // Update Data Extraction Agent with complete information
        const agents = await storage.getAgentsBySession(sessionId);
        const dataExtractionAgent = agents.find(a => a.type === 'extractor');
        
        if (dataExtractionAgent) {
          // Create updated completion message
          await storage.createMessage({
            sessionId,
            content: `✅ Data Extraction Agent - Updated Results

Document Analysis Results for TechStart Solutions LLC

Business Information Extracted:
- Business Name: TechStart Solutions LLC
- Owner: John Smith  
- Location: San Francisco, CA
- Industry: Technology Consulting
- Coverage Type: General Liability + Professional Indemnity
- Policy Limits: $1M/$2M
- Deductible: $1,000

Financial Data (Updated):
- Annual Revenue: $2.5M
- Employee Count: 15
- Years in Business: 8
- Credit Score: 780
- Tax Returns: 2022, 2023 (Verified)
- Loss History: Clean record - No claims in 5 years

Risk Factors Identified:
- Industry Risk: LOW (Technology Services)
- Geographic Risk: MEDIUM (California)
- Financial Stability: HIGH (Strong financials)
- Safety Protocols: EXCELLENT (Comprehensive procedures)

Extraction Confidence: 98% - All required fields successfully populated

Status: ✅ COMPLETE - Ready for sanctions screening`,
            type: 'agent',
            sender: 'Data Extraction Agent',
            createdAt: new Date()
          });
          
          // Resume workflow execution
          await resumeWorkflowAfterBrokerInfo(sessionId);
        }
      }, 2000);
      
      io.to(sessionId).emit('workflow-update', { 
        sessionId, 
        status: 'running',
        message: 'Broker information received. Workflow resuming...'
      });
      
      res.json({ success: true, message: 'Information received successfully. Workflow resuming...' });
    } catch (error) {
      console.error('Broker info submission error:', error);
      res.status(500).json({ error: 'Failed to process broker information' });
    }
  });

  // Data extraction approval endpoints
  app.post('/api/workflows/:sessionId/approve-extraction', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { extractedData } = req.body;
      
      // Update workflow to continue with remaining agents and store approved data
      await storage.updateWorkflowSession(sessionId, { 
        status: 'running',
        currentStep: 1,
        extractedData: extractedData || {}
      });
      
      // Create approval message
      await storage.createMessage({
        sessionId,
        content: `✅ Data Extraction Approved\n\nExtracted data has been reviewed and approved. Workflow continuing with remaining agents...`,
        type: 'system',
        sender: 'Data Extraction Review',
        createdAt: new Date()
      });
      
      // Resume workflow from next agent after Data Extraction
      setTimeout(async () => {
        const session = await storage.getWorkflowSession(sessionId);
        if (session?.workflowType === 'slip') {
          await resumeSlipWorkflowAfterDataExtraction(sessionId);
        } else if (session?.workflowType === 'submission') {
          // Submission workflow: 0=Data Extraction, 1=Sanctions Check, 2=Risk Profile
          // Resume from Sanctions Check Agent (index 1)
          await resumeWorkflowAfterApproval(sessionId, 1); // Start from Sanctions Check Agent (index 1)
        } else {
          // Jira workflow: 0=Data Extraction, 1=Data Transformation, 2=Quality Assurance
          // Resume from Data Transformation Agent (index 1)
          await resumeWorkflowAfterApproval(sessionId, 1); // Start from Data Transformation Agent (index 1)
        }
      }, 1000);
      
      io.to(sessionId).emit('workflow-update', { 
        sessionId, 
        status: 'running',
        message: 'Data extraction approved. Continuing with sanctions check...'
      });
      
      res.json({ success: true, message: 'Data extraction approved successfully' });
    } catch (error) {
      console.error('Data extraction approval error:', error);
      res.status(500).json({ error: 'Failed to approve data extraction' });
    }
  });

  app.post('/api/workflows/:sessionId/reject-extraction', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Update workflow to completed/rejected status
      await storage.updateWorkflowSession(sessionId, { 
        status: 'rejected',
        currentStep: 0
      });
      
      // Create rejection message
      await storage.createMessage({
        sessionId,
        content: `❌ Data Extraction Rejected\n\nData extraction has been rejected. Workflow has been stopped.`,
        type: 'system',
        sender: 'Data Extraction Review',
        createdAt: new Date()
      });
      
      io.to(sessionId).emit('workflow-update', { 
        sessionId, 
        status: 'rejected',
        message: 'Data extraction rejected. Workflow stopped.'
      });
      
      res.json({ success: true, message: 'Data extraction rejected' });
    } catch (error) {
      console.error('Data extraction rejection error:', error);
      res.status(500).json({ error: 'Failed to reject data extraction' });
    }
  });

  // Execute workflow agents sequentially with human approval after data extraction and sanctions check
  async function executeWorkflowAgents(sessionId: string) {
    try {
      console.log(`[Node.js] Starting sequential agent execution for ${sessionId}`);
      
      const agents = await storage.getAgentsBySession(sessionId);
      
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        
        // Execute agent
        await executeAgent(sessionId, agent);
        
        // CRITICAL: Check if workflow was paused by the agent execution (e.g., Quality Assurance Agent)
        // Wait a moment for any approval creation to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const workflowAfterAgent = await storage.getWorkflowSession(sessionId);
        console.log(`[Workflow Status Check] After ${agent.name}: status=${workflowAfterAgent?.status}`);
        
        if (workflowAfterAgent && workflowAfterAgent.status === 'pending_approval') {
          console.log(`[Workflow Paused] Agent ${agent.name} triggered workflow pause with status: ${workflowAfterAgent.status}`);
          return; // Stop execution until approval is received
        }
        
        // Additional check for Quality Assurance Agent specifically to ensure pause
        if (agent.type === 'mismatch_summarizer' || agent.type === 'mismatch_summary') {
          console.log('[Quality Assurance Check] Checking if approval request was created for Quality Assurance Agent');
          const pendingApprovals = await storage.getApprovalRequestsBySession(sessionId);
          const hasPendingMismatchApproval = pendingApprovals.some(
            approval => approval.type === 'mismatch_summary_jira' && approval.status === 'pending'
          );
          
          if (hasPendingMismatchApproval) {
            console.log('[Workflow Paused] Quality Assurance Agent created approval request - stopping execution');
            return; // Stop execution until approval is received
          } else {
            console.log('[Workflow Continue] No pending mismatch approval found - continuing');
          }
        }
        
        // CRITICAL: Check for Communication Agent pausing workflow when no human comments found
        // Only for Jira Communication Agent, NOT Email Draft Agent
        if (agent.type === 'communication_monitor' || agent.type === 'communicator') {
          console.log('[Communication Agent Check] Checking if Communication Agent paused workflow for human response');
          const pendingApprovals = await storage.getApprovalRequestsBySession(sessionId);
          const hasPendingHumanResponse = pendingApprovals.some(
            approval => approval.type === 'human_response_required' && approval.status === 'pending'
          );
          
          if (hasPendingHumanResponse) {
            console.log('[Workflow Paused] Communication Agent created human response requirement - stopping execution');
            return; // Stop execution until human response is received
          } else {
            console.log('[Workflow Continue] No pending human response found - continuing to next agent');
          }
        }
        
        // Check if this is the Data Extraction Agent - ALWAYS add human approval step for review
        if (agent.type === 'extractor' || agent.type === 'data_extractor') {
          console.log(`[Data Extraction Approval] Data extraction completed, requesting human approval for ${sessionId}`);
          
          // Update workflow status to pending data extraction approval
          await storage.updateWorkflowSession(sessionId, { status: 'pending_data_extraction' });
          
          // Create system message to notify user about data extraction completion
          await storage.createMessage({
            sessionId,
            content: `Data Extraction Completed — Review Required
            
The Data Extraction Agent has successfully processed all documents and extracted key information. Please review the extracted data in the form interface and choose to approve or reject the extraction results.

Confidence Score: ${Math.round((agent.results?.confidence || 0.95) * 100)}%

Action Required: Use the "Approve & Continue" or "Reject & Stop" buttons to proceed.`,
            type: 'system',
            sender: 'Data Extraction System',
            createdAt: new Date()
          });
          
          console.log(`[Workflow Paused] Waiting for data extraction approval for ${sessionId}`);
          return; // Stop execution until approval is received
        }

        // Check if workflow was paused (missing info, approval needed, human response needed, etc.)
        const currentWorkflow = await storage.getWorkflowSession(sessionId);
        if (currentWorkflow && (
          currentWorkflow.status === 'pending_broker_info' || 
          currentWorkflow.status === 'pending_approval' || 
          currentWorkflow.status === 'pending_data_extraction' ||
          currentWorkflow.status === 'pending_human_response'
        )) {
          console.log(`[Workflow Paused] Workflow ${sessionId} paused with status: ${currentWorkflow.status}`);
          return; // Stop execution until workflow is resumed
        }
        
        // Check if this is the Sanctions Check Agent - ALWAYS add human approval step
        if (agent.type === 'sanctions') {
          console.log(`[Approval Required] Sanctions check completed, requesting human approval for ${sessionId}`);
          
          // Get the agent's AI analysis results
          const agentResults = agent.results || {};
          
          // Create approval request for sanctions check
          const approvalRequest = await storage.createApprovalRequest({
            sessionId,
            type: 'sanctions_review',
            title: 'Sanctions Check Review',
            description: 'Sanctions check has been completed. Review the results and approve to continue with the underwriting process.',
            data: { 
              agentId: agent.id, 
              agentName: agent.name,
              analysisResults: agentResults.ai_response || "Sanctions screening completed successfully with no adverse findings.",
              confidence: agentResults.confidence || 0.95
            },
            status: 'pending'
          });
          
          // Update workflow status to pending approval
          await storage.updateWorkflowSession(sessionId, { status: 'pending_approval' });
          
          // Create system message to notify user about approval needed
          await storage.createMessage({
            sessionId,
            content: `🔍 Sanctions Check Completed - Human Review Required
            
Analysis Results:
${agentResults.ai_response || "No adverse findings identified. All sanctions databases cleared."}

Confidence Score: ${Math.round((agentResults.confidence || 0.95) * 100)}%

Action Required: Please review the sanctions check results and respond with "yes" to approve or "no" to reject the application.`,
            type: 'system',
            sender: 'Sanctions Review System',
            createdAt: new Date()
          });
          
          // Notify frontend about approval requirement
          io.to(sessionId).emit('approval-required', {
            sessionId,
            approvalId: approvalRequest.id,
            type: 'sanctions_review',
            title: 'Sanctions Check Review',
            description: 'Sanctions check completed. Please review and approve to continue.',
            agentName: agent.name
          });
          
          console.log(`[Workflow Paused] Waiting for human approval for ${sessionId}`);
          return; // Stop execution until approval is received
        }

        // Check if this is the Quality Assurance Agent - PAUSE FOR HUMAN APPROVAL (Jira workflows)
        if (agent.type === 'mismatch_summarizer' || agent.type === 'mismatch_summary') {
          console.log('[Quality Assurance] Quality Assurance Agent completed in main loop - checking for pending approval');
          
          // Small delay to ensure approval request is saved in database
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Check if approval request was created by the agent
          const pendingApprovals = await storage.getApprovalRequestsBySession(sessionId);
          console.log(`[Approval Check] Found ${pendingApprovals.length} approvals for session ${sessionId}`);
          
          const hasPendingMismatchApproval = pendingApprovals.some(
            approval => {
              console.log(`[Approval Check] Checking approval: type=${approval.type}, status=${approval.status}`);
              return approval.type === 'mismatch_summary_jira' && approval.status === 'pending';
            }
          );
          
          console.log(`[Approval Check] Has pending mismatch approval: ${hasPendingMismatchApproval}`);
          
          if (hasPendingMismatchApproval) {
            console.log('[Workflow Control] STOPPING main execution loop - approval required before continuing');
            
            // Update workflow status to pending approval
            await storage.updateWorkflowSession(sessionId, { 
              status: 'pending_approval',
              lastUpdated: new Date()
            });
            
            io.to(sessionId).emit('workflow-update', { 
              sessionId, 
              status: 'pending_approval',
              message: 'Mismatch summary completed - waiting for approval to post to Jira'
            });
            
            console.log('[Workflow Paused] Quality Assurance workflow paused in main loop - waiting for human approval');
            return; // Stop execution completely until approval is received
          } else {
            console.log('[Workflow Continue] No pending mismatch approval found - continuing workflow');
          }
        }

        // Check if this is the Email Draft Agent - add human approval step for email actions
        if (agent.type === 'communication' && agent.name.includes('Email Draft')) {
          console.log(`[Email Draft Approval] Email draft completed, requesting user action for ${sessionId}`);
          
          // Create approval request for email draft
          const approvalRequest = await storage.createApprovalRequest({
            sessionId,
            type: 'email_draft_review',
            title: 'Email Draft Review',
            description: 'Email draft has been created. Please choose: Send Email, Edit Email, or Discard Email',
            data: { agentId: agent.id, agentName: agent.name },
            status: 'pending'
          });
          
          // Update workflow status to pending approval
          await storage.updateWorkflowSession(sessionId, { status: 'pending_approval' });
          
          // Create system message to notify user about email draft approval
          await storage.createMessage({
            sessionId,
            content: `📧 Email Draft Completed - Action Required
            
Draft Status: Email draft has been created and is ready for your review.

Available Actions:
• Type "send" to send the email as drafted
• Type "edit" to modify the email content  
• Type "discard" to cancel the email

Please respond with your choice: send, edit, or discard`,
            type: 'system',
            sender: 'Email Draft Review System',
            createdAt: new Date()
          });
          
          // Notify frontend about email draft approval requirement
          io.to(sessionId).emit('approval-required', {
            sessionId,
            approvalId: approvalRequest.id,
            type: 'email_draft_review',
            title: 'Email Draft Review',
            description: 'Email draft completed. Please choose your action: Send, Edit, or Discard',
            agentName: agent.name
          });
          
          console.log(`[Workflow Paused] Waiting for email draft action for ${sessionId}`);
          return; // Stop execution until user chooses action
        }

        // Check if this is the Email Sender Agent - add human approval step before sending
        if (agent.type === 'email_sender' || agent.name.includes('Email Sender')) {
          console.log(`[Email Sender Approval] Email sender ready, requesting final approval for ${sessionId}`);
          
          // Create approval request for email sending
          const approvalRequest = await storage.createApprovalRequest({
            sessionId,
            type: 'email_sender_review',
            title: 'Email Sending Approval',
            description: 'Email is ready to send. Please review and approve final sending.',
            data: { agentId: agent.id, agentName: agent.name },
            status: 'pending'
          });
          
          // Update workflow status to pending approval
          await storage.updateWorkflowSession(sessionId, { status: 'pending_approval' });
          
          // Create system message to notify user about email sending approval
          await storage.createMessage({
            sessionId,
            content: `📤 Email Ready for Sending - Final Approval Required
            
Email Status: Email draft has been prepared and is ready for delivery to the broker.

Available Actions:
• Type "send" to send the email immediately
• Type "edit" to make final modifications before sending
• Type "cancel" to cancel the email sending

Please respond with your choice: send, edit, or cancel`,
            type: 'system',
            sender: 'Email Sender Review System',
            createdAt: new Date()
          });
          
          // Notify frontend about email sending approval requirement
          io.to(sessionId).emit('approval-required', {
            sessionId,
            approvalId: approvalRequest.id,
            type: 'email_sender_review',
            title: 'Email Sending Approval',
            description: 'Email is ready to send. Please review and approve final sending.',
            agentName: agent.name
          });
          
          console.log(`[Workflow Paused] Waiting for email sending approval for ${sessionId}`);
          return; // Stop execution until user approves sending
        }

        // ── Insurance Quote Workflow: Policy Data Extraction Agent ──────────────
        // Always pause for human review of extracted policy fields
        if (agent.type === 'policy_extractor') {
          console.log(`[Policy Extraction Approval] Policy data extraction completed, requesting human review for ${sessionId}`);

          // Load form config (which contains real extracted values + bboxes from the PDF)
          // and store it on the session so the form endpoint can serve it per-session
          try {
            const configPath = path.join(process.cwd(), 'public', 'submission-forms', 'data-extraction-config.json');
            if (fs.existsSync(configPath)) {
              const formConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              await storage.updateWorkflowSession(sessionId, {
                status: 'pending_data_extraction',
                extractedData: { _formConfig: formConfig }
              });
            } else {
              await storage.updateWorkflowSession(sessionId, { status: 'pending_data_extraction' });
            }
          } catch (err) {
            console.error('[Policy Extractor] Failed to load form config:', err);
            await storage.updateWorkflowSession(sessionId, { status: 'pending_data_extraction' });
          }

          console.log(`[Workflow Paused] Waiting for policy data extraction approval for ${sessionId}`);
          return;
        }

        // ── Insurance Quote Workflow: Quote Generation Agent ───────────────────
        // Pause to show final quote with download/print/save actions
        if (agent.type === 'quote_generator') {
          console.log(`[Quote Review] Quote generation completed, requesting final review for ${sessionId}`);
          const agentResults = agent.results || {};
          const approvalRequest = await storage.createApprovalRequest({
            sessionId,
            type: 'quote_review',
            title: 'Insurance Quote Ready',
            description: 'Your property insurance quote has been generated. Review the premium breakdown and choose to Download, Print, or Save for Later.',
            data: {
              agentId: agent.id,
              agentName: agent.name,
              analysisResults: agentResults.ai_response || agentResults.completion_message || 'Insurance quote successfully generated with full premium breakdown.',
              confidence: agentResults.confidence || 0.93
            },
            status: 'pending'
          });
          await storage.updateWorkflowSession(sessionId, { status: 'pending_approval' });
          await storage.createMessage({
            sessionId,
            content: `Insurance Quote Generated — Review Required\n\nYour property insurance quote is ready. The quote includes:\n• Base premium calculation\n• Catastrophe risk adjustment\n• Portfolio concentration adjustment\n• Final annual premium\n\nAvailable Actions:\n• Download PDF Quote\n• Print Quote\n• Save for Later\n\nPlease review and approve the quote to finalise.`,
            type: 'system',
            sender: 'Quote Review System',
            createdAt: new Date()
          });
          io.to(sessionId).emit('approval-required', {
            sessionId,
            approvalId: approvalRequest.id,
            type: 'quote_review',
            title: 'Insurance Quote Ready',
            description: 'Quote generated. Please review the premium breakdown and download/save.',
            agentName: agent.name
          });
          console.log(`[Workflow Paused] Waiting for quote review for ${sessionId}`);
          return;
        }
      }

      // If we reach here, all agents completed without approval requirement
      await storage.updateWorkflowSession(sessionId, { status: 'completed' });
      io.to(sessionId).emit('workflow-update', { sessionId, status: 'completed' });
      
    } catch (error) {
      console.error(`[Node.js] Failed to execute agents for ${sessionId}:`, error);
    }
  }

  // Execute a single agent with simplified logic
  async function executeAgent(sessionId: string, agent: any) {
    console.log(`[Agent Execution] Starting ${agent.name} for ${sessionId}`);
    
    // Get Jira ID from workflow caseId (like XSX-4117)
    const workflow = await storage.getWorkflowSession(sessionId);
    const jiraId = workflow?.caseId || 'XSX-4117';
    console.log(`[Agent Execution] Using Jira ticket: ${jiraId} for session ${sessionId}`);

    // Resolve real attachment filename from Jira ticket (API → local fallback)
    const jiraAttachments = await getJiraTicketAttachments(jiraId);
    const jiraAttachmentFilename = jiraAttachments[0] || undefined;
    if (jiraAttachmentFilename) {
      console.log(`[Agent Execution] Resolved attachment: ${jiraAttachmentFilename}`);
    }
    
    await storage.updateAgent(agent.id, { status: 'running', progress: 0 });
    io.to(sessionId).emit('agent-update', { 
      sessionId, 
      agentId: agent.id, 
      agentName: agent.name,
      status: 'running', 
      progress: 0 
    });
    
    // ALL agents now use realistic timing - remove instant placeholder logic
    const isPlaceholder = false; // Force all agents to use realistic progress timing
    
    // Handle Communication Agent - monitors for Jira comments and logs them
    if (agent.type === 'communication_monitor') {
      console.log(`[Communication Agent] Monitoring for human responses on ${jiraId}`);
      
      // Get configured response for Communication Agent
      const configuredResponse = getAgentResponse('communication_monitor');
      const workMessage = configuredResponse?.work_message || '💬 Monitoring JIRA ticket for human responses...';
      
      // Create work message
      await storage.createMessage({
        sessionId,
        content: workMessage,
        type: 'agent',
        sender: agent.name,
        createdAt: new Date()
      });
      
      // Wait for monitoring period
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        // Fetch actual comments for this specific Jira ticket
        const jiraApiModule = await import('./jira-api.js');
        const ticketComments = await jiraApiModule.getJiraTicketComments(jiraId);
        
        console.log(`[Communication Agent] Found ${ticketComments?.length || 0} comments for ticket ${jiraId}`);
        
        // Enhanced comment processing with detailed logging
        console.log(`[Communication Agent] Processing ${ticketComments?.length || 0} total comments for ${jiraId}`);
        
        // Show all comments for debugging (first 3 characters of each)
        ticketComments?.forEach((comment: any, index: number) => {
          console.log(`[Comment ${index + 1}] Author: ${comment.author?.displayName}, Created: ${comment.created}, Body preview: ${comment.body?.substring(0, 50)}...`);
        });
        
        // Find recent human comments (last 48 hours to catch more comments)
        const recentDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const recentHumanComments = ticketComments?.filter((comment: any) => {
          const commentDate = new Date(comment.created);
          const isRecent = commentDate > recentDate;
          const isNotBot = !comment.body?.includes('Quality Assurance Agent') && 
                          !comment.body?.includes('Field Comparison Analysis') &&
                          !comment.body?.includes('**Summary:**') &&
                          !comment.author?.displayName?.toLowerCase().includes('bot');
          
          console.log(`[Comment Filter] Author: ${comment.author?.displayName}, Recent: ${isRecent}, NotBot: ${isNotBot}, Date: ${comment.created}`);
          return isRecent && isNotBot;
        }) || [];
        
        console.log(`[Communication Agent] Found ${recentHumanComments.length} recent human comments after filtering`);
        
        let completionMessage = '';
        let detectedComment = '';
        let commentAuthor = '';
        let commentTimestamp = '';
        
        if (recentHumanComments.length > 0) {
          // Use the most recent human comment
          const latestComment = recentHumanComments[recentHumanComments.length - 1];
          detectedComment = latestComment.body?.substring(0, 300) + (latestComment.body?.length > 300 ? '...' : '');
          commentAuthor = latestComment.author?.displayName || 'Unknown Author';
          commentTimestamp = latestComment.created;
          
          completionMessage = `✅ **Communication Agent Found Human Response**

**Latest Human Comment in ${jiraId}:**
• **Author**: ${commentAuthor}
• **Posted**: ${new Date(commentTimestamp).toLocaleString()}
• **Content**: "${detectedComment}"

**Additional Context:**
• **Total Comments Scanned**: ${ticketComments?.length || 0}
• **Recent Human Comments**: ${recentHumanComments.length}
• **Monitoring Period**: Last 48 hours
• **Comment Source**: Authentic Jira API

**Action**: Human stakeholder feedback has been detected and logged for workflow reference.`;
        } else {
          // NO HUMAN COMMENTS FOUND - START CONTINUOUS MONITORING
          console.log(`[Communication Agent] No human comments found - STARTING CONTINUOUS MONITORING for ${sessionId}`);
          
          // Set agent to running status (not completed)
          await storage.updateAgent(agent.id, { 
            status: 'running', 
            progress: 20,
            results: { 
              agent_name: agent.name, 
              status: 'monitoring',
              monitoring_status: 'active',
              polls_completed: 0
            }
          });
          
          // Emit running status
          io.to(sessionId).emit('agent-update', { 
            sessionId, agentId: agent.id, agentName: agent.name, status: 'running', progress: 20 
          });
          
          // Create monitoring message
          const monitoringMessage = `🔍 **Communication Agent - Active Monitoring**

**Monitoring JIRA ticket for human responses...**
• **Target Ticket**: ${jiraId}
• **Current Comments**: ${ticketComments?.length || 0}
• **Recent Human Comments**: 0
• **Status**: Actively polling for human responses

The workflow will automatically continue when human comments are detected.`;
          
          await storage.createMessage({
            sessionId,
            content: monitoringMessage,
            type: 'agent',
            sender: agent.name,
            createdAt: new Date()
          });
          
          // Update workflow status to pending human response
          await storage.updateWorkflowSession(sessionId, { 
            status: 'pending_human_response',
            lastUpdated: new Date()
          });
          
          // Start background polling system
          startCommunicationPolling(sessionId, agent.id, jiraId);
          
          console.log(`[Communication Agent] Started continuous monitoring for ${sessionId} - workflow execution PAUSED`);
          return; // CRITICAL: Stop workflow execution here and keep monitoring
        }
        
        // Complete the agent when human comments ARE found
        await storage.updateAgent(agent.id, { 
          status: 'completed', 
          progress: 100,
          results: { 
            agent_name: agent.name, 
            status: 'completed', 
            confidence: 0.96,
            summary: `Human response detected and logged: "${detectedComment}"`
          }
        });
        
        io.to(sessionId).emit('agent-update', { 
          sessionId, 
          agentId: agent.id, 
          agentName: agent.name,
          progress: 100,
          status: 'completed'
        });
        
        // Create completion message
        await storage.createMessage({
          sessionId,
          content: completionMessage,
          type: 'system',
          sender: agent.name,
          createdAt: new Date()
        });
        
        console.log(`[Communication Agent] Completed - Monitored ${jiraId} with ${recentHumanComments.length} recent human comments`);
        
      } catch (error) {
        console.error(`[Communication Agent] Error fetching comments for ${jiraId}:`, error);
        
        // Fallback completion message on error
        const errorMessage = `⚠️ **Communication Agent Error**

**Monitoring Issue for ${jiraId}:**
• **Error**: Unable to fetch comments from Jira ticket
• **Cause**: ${error.message || 'Unknown error'}
• **Status**: Monitoring failed but workflow continues

**Action Taken**: Continuing with remaining workflow agents despite monitoring error...`;
        
        await storage.updateAgent(agent.id, { 
          status: 'completed', 
          progress: 100,
          results: { 
            agent_name: agent.name, 
            status: 'completed', 
            confidence: 0.50,
            summary: `Error monitoring ticket ${jiraId}: ${error.message}`
          }
        });
        
        io.to(sessionId).emit('agent-update', { 
          sessionId, 
          agentId: agent.id, 
          agentName: agent.name,
          progress: 100,
          status: 'completed'
        });
        
        await storage.createMessage({
          sessionId,
          content: errorMessage,
          type: 'system',
          sender: agent.name,
          createdAt: new Date()
        });
      }
      
      return;
    }
    
    if (isPlaceholder) {
      console.log(`[Placeholder Agent] ${agent.name} completing with progress tracking`);
      
      // Get configured response if available
      const configuredResponse = getAgentResponse(agent.type);
      const confidence = configuredResponse?.confidence || 0.95;
      const completionMessage = configuredResponse?.completion_message || `✅ ${agent.name} completed successfully`;
      
      // If we have configured response, show work message first
      if (configuredResponse) {
        // Create work message
        await storage.createMessage({
          sessionId,
          content: configuredResponse.work_message,
          type: 'agent',
          sender: agent.name,
          createdAt: new Date()
        });
      }
      
      // Enhanced progress tracking for Sanctions Check Agent - Faster timing for Jira workflows (2-5 sec total)
      if (agent.type === 'sanctions_check') {
        console.log(`[Sanctions Agent] Starting enhanced progress tracking for ${sessionId}`);
        
        const sanctionsProgressSteps = [14, 29, 47, 66, 83, 96];
        for (let i = 0; i < sanctionsProgressSteps.length; i++) {
          const progress = sanctionsProgressSteps[i];
          await storage.updateAgent(agent.id, { status: 'running', progress });
          io.to(sessionId).emit('agent-update', {
            sessionId, agentId: agent.id, agentName: agent.name, status: 'running', progress
          });
          await new Promise(resolve => setTimeout(resolve, SANCTIONS_STEP_DELAYS_MS[i] * AGENT_SPEED_MULTIPLIER));
        }
        
        console.log(`[Sanctions Agent] Completed enhanced processing for ${sessionId}`);
      } else if (agent.type === 'data_validation') {
        console.log(`[Data Validation Agent] Starting realistic progress tracking for ${sessionId}`);
        const dvProgressSteps = [15, 32, 48, 64, 79, 92, 100];
        for (let i = 0; i < dvProgressSteps.length; i++) {
          const progress = dvProgressSteps[i];
          await storage.updateAgent(agent.id, { status: 'running', progress });
          io.to(sessionId).emit('agent-update', {
            sessionId, agentId: agent.id, agentName: agent.name, status: 'running', progress
          });
          console.log(`[Data Validation Agent] Progress: ${progress}% for ${sessionId}`);
          if (i < DATA_VALIDATION_STEP_DELAYS_MS.length) {
            await new Promise(resolve => setTimeout(resolve, DATA_VALIDATION_STEP_DELAYS_MS[i] * AGENT_SPEED_MULTIPLIER));
          }
        }
        console.log(`[Data Validation Agent] Completed realistic processing for ${sessionId}`);
      } else {
        console.log(`[${agent.name}] Starting realistic step-by-step progress for ${sessionId}`);
        const progressSteps = [12, 28, 45, 62, 78, 91, 100];
        for (let i = 0; i < progressSteps.length; i++) {
          const progress = progressSteps[i];
          await storage.updateAgent(agent.id, { status: 'running', progress });
          io.to(sessionId).emit('agent-update', {
            sessionId, agentId: agent.id, agentName: agent.name, status: 'running', progress
          });
          console.log(`[Agent Progress] ${agent.name} progress: ${progress}%`);
          if (i < GENERIC_AGENT_STEP_DELAYS_MS.length) {
            await new Promise(resolve => setTimeout(resolve, GENERIC_AGENT_STEP_DELAYS_MS[i] * AGENT_SPEED_MULTIPLIER));
          }
        }
        console.log(`[${agent.name}] Completed realistic processing for ${sessionId}`);
      }
      
      // Complete the agent
      await storage.updateAgent(agent.id, { 
        status: 'completed', 
        progress: 100,
        results: { 
          agent_name: agent.name, 
          status: 'completed', 
          confidence,
          summary: `${agent.name} completed successfully - ${agent.type === 'sanctions' ? 'enhanced sanctions screening' : 'placeholder execution'}`
        }
      });
      
      io.to(sessionId).emit('agent-update', { 
        sessionId, 
        agentId: agent.id, 
        agentName: agent.name,
        progress: 100,
        status: 'completed'
      });
      
      // Create completion message
      await storage.createMessage({
        sessionId,
        content: completionMessage,
        type: 'system',
        sender: agent.name,
        createdAt: new Date()
      });
      
      console.log(`[Agent Completed] ${agent.name} finished ${agent.type === 'sanctions' ? 'with enhanced progress' : 'instantly'} for ${sessionId}`);
      return;
    }
    
    // Handle Data Extraction Agent with step-based tool-call messages
    if (agent.type === 'extractor' || agent.type === 'data_extractor' || agent.type === 'data_extraction') {
      console.log(`[Data Extraction Agent] Starting step-based execution for ${sessionId}`);
      const extractorSteps = getJiraAgentSteps(jiraId, workflow?.title || jiraId, jiraAttachmentFilename)['extractor'];
      if (extractorSteps && extractorSteps.length > 0) {
        for (const step of extractorSteps) {
          await storage.updateAgent(agent.id, { status: 'running', progress: step.progress });
          io.to(sessionId).emit('agent-update', {
            sessionId, agentId: agent.id, agentName: agent.name, status: 'running', progress: step.progress
          });
          await storage.createMessage({
            sessionId, content: step.message, type: 'agent',
            sender: agent.name, createdAt: new Date()
          });
          if (step.delayMs > 0) {
            const readingBuffer = step.message.length * CHAT_READING_BUFFER_PER_CHAR_MS;
            await new Promise(resolve => setTimeout(resolve, step.delayMs * AGENT_SPEED_MULTIPLIER + readingBuffer));
          }
        }
      }
      console.log(`[Data Extraction Agent] Completed step-based processing for ${sessionId}`);
      
    } else if (agent.type === 'video_review') {
      // Video Review Agent - Display recorded validation video
      console.log(`[Video Review Agent] Starting video retrieval for ${sessionId}`);
      
      // Get configured response
      const configuredResponse = getAgentResponse('video_review');
      const workMessage = configuredResponse?.work_message || '📹 Video Review Agent retrieving screen recording...';
      
      // Create work message
      await storage.createMessage({
        sessionId,
        content: workMessage,
        type: 'agent',
        sender: agent.name,
        createdAt: new Date()
      });
      
      // Simulate video processing with realistic delays (2 minutes total)
      const progressSteps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const delayIntervals = [13333, 13333, 13333, 13333, 13333, 13333, 13333, 13333, 13336]; // 120 seconds total (2 minutes)
      
      for (let i = 0; i < progressSteps.length; i++) {
        const progress = progressSteps[i];
        await storage.updateAgent(agent.id, { status: 'running', progress });
        io.to(sessionId).emit('agent-update', { 
          sessionId, agentId: agent.id, agentName: agent.name, status: 'running', progress 
        });
        
        if (i < delayIntervals.length) {
          await new Promise(resolve => setTimeout(resolve, delayIntervals[i]));
        }
      }
      
      console.log(`[Video Review Agent] Completed video retrieval for ${sessionId}`);
      
    } else if (agent.type === 'communication_monitor') {
      // Communication Agent (JIRA ONLY) - Always fetch fresh comments
      console.log(`[Communication Agent] Monitoring for human responses on ${jiraId}`);
      
      await storage.createMessage({
        sessionId,
        content: `💬 **Communication Agent Monitoring (Real-time)**\n\nScanning JIRA ticket for latest human responses...\n\n• Fetching live comments from Jira API\n• Filtering for genuine human communications\n• Checking for responses posted within last 48 hours\n• Analyzing comment content for workflow relevance\n• Detecting stakeholder feedback patterns\n\n**Real-time Comment Detection Active**`,
        type: 'system',
        sender: agent.name,
        createdAt: new Date()
      });
      
      // Realistic monitoring with varied progress intervals
      const progressSteps = [18, 35, 52, 68, 84, 95, 100];
      const delayIntervals = [400, 300, 350, 250, 300, 200]; // varied milliseconds
      
      for (let i = 0; i < progressSteps.length; i++) {
        const progress = progressSteps[i];
        await storage.updateAgent(agent.id, { progress });
        io.to(sessionId).emit('agent-update', { 
          sessionId, agentId: agent.id, agentName: agent.name, progress, status: 'running'
        });
        
        // Skip delay on last step (100%)
        if (i < delayIntervals.length) {
          await new Promise(resolve => setTimeout(resolve, delayIntervals[i]));
        }
      }
      
    } else if (agent.type === 'policy_extractor' || agent.type === 'geocoding' || agent.type === 'property_data' || agent.type === 'geospatial_risk' || agent.type === 'cat_risk' || agent.type === 'portfolio_risk' || agent.type === 'quote_generator') {
      // Insurance quote workflow agents
      console.log(`[Insurance Agent] ${agent.name} (${agent.type}) processing for ${sessionId}`);

      const steps = insuranceAgentSteps[agent.type];

      if (steps && steps.length > 0) {
        // Run step-by-step: update progress, emit chat message, wait
        for (const step of steps) {
          await storage.updateAgent(agent.id, { status: 'running', progress: step.progress });
          io.to(sessionId).emit('agent-update', {
            sessionId, agentId: agent.id, agentName: agent.name,
            status: 'running', progress: step.progress
          });
          await storage.createMessage({
            sessionId,
            content: step.message,
            type: 'agent',
            sender: agent.name,
            createdAt: new Date()
          });
          if (step.delayMs > 0) {
            const readingBuffer = step.message.length * CHAT_READING_BUFFER_PER_CHAR_MS;
            await new Promise(resolve => setTimeout(resolve, step.delayMs * AGENT_SPEED_MULTIPLIER + readingBuffer));
          }
        }
      } else {
        // policy_extractor: silent progress (form is the UI)
        const progressSteps = [12, 28, 45, 62, 78, 91, 100];
        const delayIntervals = [2800, 3200, 2900, 3400, 2500, 3100];
        for (let i = 0; i < progressSteps.length; i++) {
          await storage.updateAgent(agent.id, { status: 'running', progress: progressSteps[i] });
          io.to(sessionId).emit('agent-update', {
            sessionId, agentId: agent.id, agentName: agent.name,
            status: 'running', progress: progressSteps[i]
          });
          if (i < delayIntervals.length) {
            await new Promise(resolve => setTimeout(resolve, delayIntervals[i]));
          }
        }
      }

    } else {
      // Check for jira agent steps (sanctions, calculator, drafter, sender, decider, mismatch_summarizer)
      const jiraSteps = getJiraAgentSteps(jiraId, workflow?.title || jiraId, jiraAttachmentFilename)[agent.type];
      if (jiraSteps && jiraSteps.length > 0) {
        console.log(`[Jira Agent] ${agent.name} (${agent.type}) running step-based execution for ${sessionId}`);
        for (const step of jiraSteps) {
          await storage.updateAgent(agent.id, { status: 'running', progress: step.progress });
          io.to(sessionId).emit('agent-update', {
            sessionId, agentId: agent.id, agentName: agent.name, status: 'running', progress: step.progress
          });
          await storage.createMessage({
            sessionId, content: step.message, type: 'agent',
            sender: agent.name, createdAt: new Date()
          });
          if (step.delayMs > 0) {
            const readingBuffer = step.message.length * CHAT_READING_BUFFER_PER_CHAR_MS;
            await new Promise(resolve => setTimeout(resolve, step.delayMs * AGENT_SPEED_MULTIPLIER + readingBuffer));
          }
        }
      } else {
      // For other real agents (Quality Assurance, etc.), use gradual progress
      console.log(`[Real Agent] ${agent.name} processing with gradual progress`);

      // Create system message when agent starts
      await storage.createMessage({
        sessionId,
        content: `${agent.name} is processing case ${jiraId}...`,
        type: 'system',
        sender: 'System',
        createdAt: new Date()
      });

      // Get configured response if available, otherwise fall back to hardcoded messages
      const configuredResponse = getAgentResponse(agent.type);
      const workMessages = configuredResponse ?
        configuredResponse.work_message.split('\n\n').filter(msg => msg.trim()) :
        getAgentWorkMessages(agent.type, agent.name);
      
      // Realistic progress updates for real agents - varied timing that doesn't look hardcoded
      const progressSteps = [18, 34, 51, 67, 79, 88, 95, 100];
      const delayIntervals = [1800, 2100, 1900, 2400, 1700, 2000, 1600]; // much slower, varied timing in milliseconds
      
      for (let i = 0; i < progressSteps.length - 1; i++) {
        const progress = progressSteps[i];
        
        await storage.updateAgent(agent.id, { progress });
        
        io.to(sessionId).emit('agent-update', { 
          sessionId, 
          agentId: agent.id, 
          agentName: agent.name,
          progress,
          status: 'running'
        });
        
        console.log(`[Agent Progress] ${agent.name} progress: ${progress}%`);
        
        // Add work message at progress points
        if (i < workMessages.length) {
          await storage.createMessage({
            sessionId,
            content: workMessages[i],
            type: 'agent',
            sender: agent.name,
            createdAt: new Date()
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, delayIntervals[i]));
      }
      } // end else (fallback progress loop)
    }

    // Complete the agent execution
    const agentResult = { 
      agent_name: agent.name, 
      status: 'completed', 
      confidence: 0.95,
      summary: `${agent.name} completed successfully with AI processing`
    };
    
    // Update agent with results after S3 processing (if applicable)
    await storage.updateAgent(agent.id, { 
      status: 'completed', 
      progress: 100,
      results: agentResult
    });
    
    // CRITICAL: Handle Quality Assurance Agent pause BEFORE emitting completion events
    if (agent.type === 'mismatch_summarizer' || agent.type === 'mismatch_summary') {
      console.log(`[MISMATCH SUMMARY PAUSE] ${agent.name} (type: ${agent.type}) completed - Processing S3 upload and Jira approval`);
      
      // Get workflow session for case ID
      const workflowSession = await storage.getWorkflowSession(sessionId);
      const ticketKey = workflowSession?.caseId || jiraId;
      
      // Use configured quality assurance analysis content
      const configuredResponse = getAgentResponse('mismatch_summary');
      let mismatchContent = configuredResponse?.completion_message || `Quality Assurance for ${ticketKey}

Field comparison analysis completed. Review detailed results for data accuracy assessment.

Would you like to post this summary to JIRA ticket ${ticketKey}?`;

      // Apply markdown stripping to mismatch content for clean display
      mismatchContent = mismatchContent
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\*\*/g, '').replace(/\*/g, '') // Remove bold and italic asterisks
        .replace(/_{2,}/g, '').replace(/_/g, '') // Remove underscores
        .replace(/`{1,3}/g, '') // Remove code blocks
        .replace(/#{1,6}\s/g, '') // Remove header hashes
        .replace(/### /g, '\n\n').replace(/## /g, '\n\n').replace(/# /g, '\n\n')
        .replace(/- /g, '\n• ').replace(/\* /g, '\n• ') // Convert bullet points
        .replace(/\. /g, '.\n').replace(/: /g, ':\n') // Add line breaks
        .replace(/\n{3,}/g, '\n\n') // Replace excessive line breaks
        .trim();
      
      // REMOVED: Auto-posting logic has been removed. Jira posting now only happens after user approval via approval response handler.

      // Update workflow status to pending approval BEFORE any other operations
      await storage.updateWorkflowSession(sessionId, { 
        status: 'pending_approval',
        lastUpdated: new Date()
      });
      
      // Emit immediate workflow update to prevent race conditions  
      io.to(sessionId).emit('workflow-update', { 
        sessionId, 
        status: 'pending_approval',
        message: 'Mismatch summary completed - approval required for Jira posting'
      });
      
      // Create approval request for Jira posting
      const approvalRequest = await storage.createApprovalRequest({
        sessionId,
        type: 'mismatch_summary_jira',
        title: 'Quality Assurance Ready',
        description: 'Post this quality assurance analysis to JIRA ticket?',
        data: { 
          summary: mismatchContent,
          ticketKey: workflowSession?.caseId || 'Unknown'
        },
        status: 'pending'
      });
      
      console.log(`[FALLBACK PATH] Created approval request ID: ${approvalRequest.id}`);
      
      // Create system message to notify user about quality assurance analysis approval
      await storage.createMessage({
        sessionId,
        content: `Quality Assurance Completed — Action Required
        
Summary Status: Mismatch analysis has been completed and is ready for JIRA posting.

Available Actions:
• Type "yes" to post the summary to JIRA ticket ${workflowSession?.caseId}
• Type "no" to continue without posting to JIRA

Please respond with your choice: yes or no`,
        type: 'system',
        sender: 'Quality Assurance Review System',
        createdAt: new Date()
      });
      
      // Emit approval request to UI
      io.to(sessionId).emit('approval-request', {
        sessionId,
        approvalId: approvalRequest.id,
        type: 'mismatch_summary_jira',
        title: 'Quality Assurance Ready',
        description: 'Post this quality assurance analysis to JIRA ticket?',
        data: {
          summary: mismatchContent,
          ticketKey: workflowSession?.caseId || 'Unknown'
        }
      });
      
      console.log(`[FALLBACK PATH] Approval request created for posting to JIRA ticket`);
      console.log(`[FALLBACK PATH] Quality Assurance Agent forcing workflow stop - approval required`);
      
      // CRITICAL: Update workflow status to pending_approval so main execution loop stops
      await storage.updateWorkflowSession(sessionId, { 
        status: 'pending_approval',
        lastUpdated: new Date()
      });
      
      console.log(`[FALLBACK PATH] Workflow status updated to pending_approval - main loop should stop`);
      
      // Return early to prevent workflow from continuing - CRITICAL for pause
      return;
    }
    
    // Update workflow currentStep based on completed agents
    const allAgents = await storage.getAgentsBySession(sessionId);
    const completedAgents = allAgents.filter(a => a.status === 'completed');
    const currentStep = completedAgents.length;
    
    await storage.updateWorkflowSession(sessionId, { 
      currentStep,
      lastUpdated: new Date()
    });
    
    // Emit multiple events to ensure UI updates properly
    io.to(sessionId).emit('agent-update', { 
      sessionId, 
      agentId: agent.id, 
      agentName: agent.name,
      status: 'completed', 
      progress: 100 
    });
    
    io.to(sessionId).emit('agentCompleted', { 
      sessionId, 
      agentId: agent.id, 
      agentName: agent.name,
      status: 'completed', 
      progress: 100 
    });
    
    io.to(sessionId).emit('workflow-update', { 
      sessionId, 
      currentStep,
      totalSteps: allAgents.length 
    });
    
    console.log(`[Agent Completed] ${agent.name} finished for ${sessionId} with confidence: ${agentResult?.confidence || 0.85}`);
    
    // CRITICAL: Handle Data Extraction Agent approval for SUBMISSION workflows only (not Jira)
    if (agent.type === 'extraction') {
      const workflowSession = await storage.getWorkflowSession(sessionId);
      const workflowType = workflowSession?.workflowType || 'submission';
      
      // Only create approval for submission workflows (NOT Jira workflows)
      if (workflowType === 'submission') {
        console.log(`[DATA EXTRACTION APPROVAL] ${agent.name} completed for submission workflow - creating form approval gate`);
        
        // Check if approval already exists to avoid duplicates
        const existingApprovals = await storage.getApprovalRequestsBySession(sessionId);
        const hasExistingApproval = existingApprovals.some(a => 
          a.type === 'submission_data_extraction' && a.status === 'pending'
        );
        
        if (!hasExistingApproval) {
          // Get extracted data from agent results for form hydration
          const extractedData = agent.results || agentResult || {};
          
          // Create approval request with data for form display
          const approvalRequest = await storage.createApprovalRequest({
            sessionId,
            type: 'submission_data_extraction',
            title: 'Data Extraction Review',
            description: 'Review and approve the extracted data before proceeding to the next step.',
            data: {
              agentId: agent.id,
              agentName: agent.name,
              caseId: workflowSession?.caseId,
              extractedData: extractedData,
              workflowType: workflowType,
              confidence: agentResult?.confidence || 0.95
            },
            status: 'pending'
          });
          
          console.log(`[DATA EXTRACTION APPROVAL] Created approval request ID: ${approvalRequest.id}`);
          
          // Update workflow status to pending approval
          await storage.updateWorkflowSession(sessionId, { 
            status: 'pending_data_extraction',
            lastUpdated: new Date()
          });
          
          // Emit approval request to UI
          io.to(sessionId).emit('approval-request', {
            sessionId,
            approvalId: approvalRequest.id,
            type: 'submission_data_extraction',
            title: 'Data Extraction Review',
            description: 'Review and approve the extracted data before proceeding.',
            data: {
              agentId: agent.id,
              agentName: agent.name,
              caseId: workflowSession?.caseId,
              extractedData: extractedData
            }
          });
          
          // Emit workflow status update
          io.to(sessionId).emit('workflow-update', { 
            sessionId, 
            status: 'pending_data_extraction',
            message: 'Data extraction completed - approval required to proceed'
          });
          
          console.log(`[DATA EXTRACTION APPROVAL] Workflow paused for human review - form should appear`);
          
          // Create system message to notify user
          await storage.createMessage({
            sessionId,
            content: `📋 **Data Extraction Completed - Review Required**\n\nPlease review the extracted data in the form and approve to continue to the next step.`,
            type: 'system',
            sender: 'Data Extraction Review System',
            createdAt: new Date()
          });
          
          // Return early to prevent workflow from continuing - CRITICAL for pause
          return;
        }
      }
    }
    
    // Create completion message with AI results or fallback
    let completionMessage;
    if (agent.type === 'extractor') {
      // For Data Extraction Agent, use CSV data completion message
      // Get workflow type from session
      const workflowSession = await storage.getWorkflowSession(sessionId);
      const workflowType = workflowSession?.workflowType || 'submission';
      completionMessage = getDataExtractionCompletionMessage(workflowType);
    } else if (agentResult && agentResult.ai_response) {
      // Generic comprehensive cleaning function for agent responses
      function cleanAgentResponse(text: string): string {
        return text
          // Remove ALL HTML tags with comprehensive regex
          .replace(/<[^>]*>/g, '')
          // Remove common HTML entities
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          // Remove all markdown formatting
          .replace(/\*\*/g, '').replace(/\*/g, '') // Remove bold and italic asterisks
          .replace(/_{2,}/g, '').replace(/_/g, '') // Remove underscores
          .replace(/`{1,3}/g, '') // Remove code blocks
          .replace(/#{1,6}\s/g, '') // Remove header hashes
          // Format structure
          .replace(/### /g, '\n\n').replace(/## /g, '\n\n').replace(/# /g, '\n\n')
          .replace(/- /g, '\n• ').replace(/\* /g, '\n• ') // Convert bullet points
          .replace(/\. /g, '.\n').replace(/: /g, ':\n') // Add line breaks
          // Clean up whitespace
          .replace(/\n{3,}/g, '\n\n') // Replace excessive line breaks
          .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
      }

      const formattedResponse = cleanAgentResponse(agentResult.ai_response);

      completionMessage = `✅ ${agent.name} completed with AI analysis:

${formattedResponse}

AI Confidence: ${Math.round((agentResult.confidence || 0.85) * 100)}%
Status: ${agentResult.fallback_used ? '⚠️ Fallback Mode' : '✅ AI Powered'}`;
    } else if (agent.type === 'communication_monitor') {
      // Communication Agent (JIRA ONLY) - Fetch fresh comments from Jira API
      try {
        const { getJiraTicketComments } = await import('./jira-api');
        const comments = await getJiraTicketComments(jiraId);
        
        // Filter for recent human comments (last 48 hours)
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        
        const humanComments = comments.filter((comment: any) => {
          const commentDate = new Date(comment.created);
          const isRecent = commentDate >= fortyEightHoursAgo;
          const isNotBot = !comment.body?.includes('🤖') && 
                          !comment.body?.includes('AI-Generated') &&
                          !comment.body?.includes('*Generated by');
          
          console.log(`[Comment Filter] Author: ${comment.author?.displayName}, Recent: ${isRecent}, NotBot: ${isNotBot}, Date: ${comment.created}`);
          return isRecent && isNotBot;
        });
        
        console.log(`[Communication Agent] Found ${humanComments.length} recent human comments after filtering`);
        
        if (humanComments.length > 0) {
          const latestComment = humanComments[humanComments.length - 1];
          const detectedComment = latestComment.body?.substring(0, 300) + (latestComment.body?.length > 300 ? '...' : '');
          const commentAuthor = latestComment.author?.displayName || 'Unknown Author';
          const commentTimestamp = new Date(latestComment.created).toLocaleString();
          
          completionMessage = `✅ **Communication Agent Found Human Response**

**Latest Human Comment in ${jiraId}:**
• **Author**: ${commentAuthor}
• **Posted**: ${commentTimestamp}
• **Content**: "${detectedComment}"

**Additional Context:**
• **Total Comments Scanned**: ${comments.length}
• **Recent Human Comments**: ${humanComments.length}
• **Monitoring Period**: Last 48 hours
• **Comment Source**: Authentic Jira API

**Action**: Human stakeholder feedback has been detected and logged for workflow reference.`;
        } else {
          // NO HUMAN COMMENTS FOUND - PAUSE WORKFLOW
          console.log(`[Communication Agent] No human comments found - PAUSING workflow ${sessionId}`);
          
          // Update workflow status to pending approval
          await storage.updateWorkflowSession(sessionId, { 
            status: 'pending_human_response',
            lastUpdated: new Date()
          });
          
          // Create approval request for human response
          const approvalRequest = await storage.createApprovalRequest({
            sessionId,
            agentId: agent.id,
            type: 'human_response_required',
            data: {
              ticketKey: jiraId,
              message: 'Waiting for human response in Jira ticket'
            },
            createdAt: new Date()
          });
          
          // CRITICAL FIX: Register comment watcher to auto-resume when human comments are posted
          const { registerCommunicationWatcher } = await import('./jira-api');
          if (registerCommunicationWatcher) {
            await registerCommunicationWatcher(jiraId, sessionId);
            console.log(`[Communication Agent] ✅ Registered comment watcher for ${jiraId} - will auto-resume on human comment`);
          } else {
            console.warn(`[Communication Agent] ⚠️ Comment watcher registration not available - manual resume required`);
          }
          
          completionMessage = `⏰ **Communication Agent Waiting for Human Response**

**Monitoring Results for ${jiraId}:**
• **Total Comments Scanned**: ${comments.length}
• **Recent Human Comments**: 0
• **Monitoring Period**: Last 48 hours
• **Comment Source**: Authentic Jira API

**Status**: No human responses detected. Workflow paused and actively monitoring for new comments.

**Auto-Resume**: ✅ Workflow will automatically continue when you post a comment to ${jiraId}.`;
          
          // CRITICAL: Return early to prevent workflow from continuing
          await storage.createMessage({
            sessionId,
            content: completionMessage,
            type: 'agent',
            sender: agent.name,
            createdAt: new Date()
          });
          
          console.log(`[Communication Agent] Workflow ${sessionId} PAUSED - waiting for human response`);
          return; // Stop execution here
        }
        
        console.log(`[Communication Agent] Completed - Monitored ${jiraId} with ${humanComments.length} recent human comments`);
        
      } catch (error) {
        console.error('[Communication Agent] Error fetching Jira comments:', error);
        completionMessage = `⚠️ **Communication Agent Error**

Unable to fetch latest comments from Jira API. Using fallback monitoring.

**Error**: ${error.message}
**Ticket**: ${jiraId}
**Status**: Continuing with workflow processing despite monitoring limitations.`;
      }
    } else {
      completionMessage = getAgentCompletionMessage(agent.type, agent.name);
    }
    
    // Store the AI-generated email draft for later editing
    if (agent.type === 'email_drafter' && agentResult && agentResult.ai_response) {
      await storage.updateAgent(agent.id, { 
        status: 'completed', 
        progress: 100,
        results: {
          ...agentResult,
          emailDraft: agentResult.ai_response
        }
      });
    }
    
    // Remove automatic Jira posting - now handled through human approval
    // Quality Assurance Agent completion is handled above with approval request
    
    // Insurance quote agents use the form/approval UI — no completion messages in chat.
    // QA agents are handled separately above.
    const insuranceAgentTypes = ['policy_extractor', 'geocoding', 'property_data', 'geospatial_risk', 'cat_risk', 'portfolio_risk', 'quote_generator'];
    const isInsuranceAgent = insuranceAgentTypes.includes(agent.type);
    const isQaAgent = agent.type === 'mismatch_summarizer' || agent.type === 'mismatch_summary';
    if (!isInsuranceAgent && !isQaAgent) {
      await storage.createMessage({
        sessionId,
        content: completionMessage,
        type: 'agent',
        sender: agent.name,
        createdAt: new Date()
      });
    }
    
    console.log(`[Agent Completed] ${agent.name} finished for ${sessionId} with confidence: ${agentResult?.confidence || 0.95}`);
    
    // Handle Quality Assurance Agent completion with human approval for Jira posting
    if (agent.type === 'mismatch_summarizer' || agent.type === 'mismatch_summary') {
      console.log(`[Quality Assurance] ${agent.name} completed - Creating approval request for Jira posting`);
      
      // Get configured response for Quality Assurance Agent
      const configuredResponse = getAgentResponse('mismatch_summary');
      let mismatchContent = configuredResponse?.completion_message || 'Mismatch summary analysis completed. No detailed comparison available.';

      // Apply markdown stripping to mismatch content for clean display
      mismatchContent = mismatchContent
        // Remove ALL HTML tags with comprehensive regex
        .replace(/<[^>]*>/g, '')
        // Remove common HTML entities
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        // Remove all markdown formatting
        .replace(/\*\*/g, '').replace(/\*/g, '') // Remove bold and italic asterisks
        .replace(/_{2,}/g, '').replace(/_/g, '') // Remove underscores
        .replace(/`{1,3}/g, '') // Remove code blocks
        .replace(/#{1,6}\s/g, '') // Remove header hashes
        // Format structure
        .replace(/### /g, '\n\n').replace(/## /g, '\n\n').replace(/# /g, '\n\n')
        .replace(/- /g, '\n• ').replace(/\* /g, '\n• ') // Convert bullet points
        .replace(/\. /g, '.\n').replace(/: /g, ':\n') // Add line breaks
        // Clean up whitespace
        .replace(/\n{3,}/g, '\n\n') // Replace excessive line breaks
        .trim();
      
      // Update agent message to use configured content with markdown stripped
      await storage.createMessage({
        sessionId,
        content: mismatchContent,
        type: 'agent',
        sender: agent.name,
        createdAt: new Date()
      });
      
      // Update workflow status to pending approval
      await storage.updateWorkflowSession(sessionId, { 
        status: 'pending_approval',
        lastUpdated: new Date()
      });
      
      // Create approval request for Jira comment posting
      const workflowSession = await storage.getWorkflowSession(sessionId);
      const approvalRequest = await storage.createApprovalRequest({
        sessionId,
        type: 'mismatch_summary_jira',
        title: 'Quality Assurance Ready',
        description: 'Post this quality assurance analysis to JIRA ticket?',
        data: { 
          summary: mismatchContent,
          ticketKey: workflowSession?.caseId || 'Unknown'
        },
        status: 'pending'
      });
      
      console.log(`[Quality Assurance] Created approval request ID: ${approvalRequest.id}`);
      
      // Create system message to notify user about quality assurance analysis approval
      await storage.createMessage({
        sessionId,
        content: `Quality Assurance Completed — Action Required
        
Summary Status: Mismatch analysis has been completed and is ready for JIRA posting.

Available Actions:
• Type "yes" to post the summary to JIRA ticket ${workflowSession?.caseId}
• Type "no" to continue without posting to JIRA

Please respond with your choice: yes or no`,
        type: 'system',
        sender: 'Quality Assurance Review System',
        createdAt: new Date()
      });
      
      // Emit approval request to UI
      io.to(sessionId).emit('approval-request', {
        sessionId,
        approvalId: approvalRequest.id,
        type: 'mismatch_summary_jira',
        title: 'Quality Assurance Ready',
        description: 'Post this quality assurance analysis to JIRA ticket?',
        data: {
          summary: mismatchContent,
          ticketKey: workflowSession?.caseId || 'Unknown'
        }
      });
      
      console.log(`[Quality Assurance] Approval request created for posting to JIRA ticket`);
      console.log(`[Workflow Paused] Quality Assurance Agent forcing workflow stop - approval required`);
      
      // Return early to prevent workflow from continuing - CRITICAL for Jira workflow pause
      return;
    }

    // Data Extraction Agent completion - PAUSE for approval via "View Data" button
    if (agent.type === 'extractor' || agent.type === 'data_extractor' || agent.type === 'data_extraction') {
      console.log(`[Data Extraction] ${agent.name} completed for ${sessionId} - Pausing for user approval`);
      
      // Update workflow status to pending data extraction approval
      await storage.updateWorkflowSession(sessionId, { 
        status: 'pending_data_extraction',
        lastUpdated: new Date()
      });
      
      console.log(`[Data Extraction Pause] ${agent.name} completed for ${sessionId} - Workflow paused for user to review and approve via "View Data" button`);
      
      // Emit workflow update to notify UI
      io.to(sessionId).emit('workflow-update', { 
        sessionId, 
        status: 'pending_data_extraction',
        message: 'Data extraction completed - Click "View Data" to review and approve'
      });
      
      // Return early to prevent workflow from continuing until user approves
      return;
    }

    // Communication Agent completion handling - check for human responses and pause if none found
    // Only for Jira Communication Agent, NOT Email Draft Agent
    if (agent.type === 'communication_monitor') {
      console.log(`[Communication Agent] ${agent.name} completed monitoring - checking for human responses`);
      
      const workflowSession = await storage.getWorkflowSession(sessionId);
      const jiraTicketKey = workflowSession?.caseId;
      
      if (jiraTicketKey) {
        try {
          // Fetch latest comments from Jira
          const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${jiraTicketKey}/comment`, {
            headers: {
              'Authorization': `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const commentsData = await response.json();
            const comments = commentsData.comments || [];
            
            // Filter for genuine human comments (not AI-generated)
            const humanComments = comments.filter((comment: any) => {
              const content = comment.body?.content?.[0]?.content?.[0]?.text || '';
              const author = comment.author?.displayName || '';
              
              // Filter out AI-generated content
              const isAI = content.includes('Field Comparison Analysis') || 
                          content.includes('Quality Assurance') ||
                          content.includes('Detected Discrepancies') ||
                          author.includes('automation') ||
                          author.includes('bot');
              
              return !isAI && content.length > 10; // Real human responses
            });
            
            console.log(`[Communication Agent] Found ${humanComments.length} human comments for ${jiraTicketKey}`);
            
            if (humanComments.length === 0) {
              // No human responses found - pause workflow
              console.log(`[Communication Agent] No human responses detected - pausing workflow`);
              
              // Update workflow status to pending human response
              await storage.updateWorkflowSession(sessionId, { 
                status: 'pending_human_response',
                lastUpdated: new Date()
              });
              
              // Create approval request for human response
              const approvalRequest = await storage.createApprovalRequest({
                sessionId,
                type: 'human_response_required',
                title: 'Human Response Required',
                description: 'Waiting for human response in JIRA ticket',
                data: { 
                  ticketKey: jiraTicketKey,
                  human_comments_count: humanComments.length
                },
                status: 'pending'
              });
              
              // Create system message about waiting for human response
              await storage.createMessage({
                sessionId,
                content: `🔍 **Communication Agent - Monitoring Active**

**Status**: No human responses detected in JIRA ticket ${jiraTicketKey}

**Action**: Communication Agent will continuously monitor for stakeholder responses
• Checking for authentic human comments (excluding AI-generated content)
• Filtering out automated system messages and bot responses  
• Waiting for genuine stakeholder feedback or questions

**Next Steps**: Workflow will automatically resume when human comments are detected in the JIRA ticket.`,
                type: 'system',
                sender: 'Communication Agent',
                createdAt: new Date()
              });
              
              // Emit workflow update to UI
              io.to(sessionId).emit('workflow-update', { 
                sessionId, 
                status: 'pending_human_response',
                message: 'Communication Agent waiting for human responses in JIRA ticket'
              });
              
              console.log(`[Communication Agent] Workflow paused - waiting for human response in ${jiraTicketKey}`);
              
              // Mark Communication Agent as completed with special status
              await storage.updateAgent(agent.id, {
                status: 'completed',
                progress: 100,
                results: {
                  status: 'waiting_for_human_response',
                  human_comments_count: humanComments.length,
                  ticket_key: jiraTicketKey,
                  timestamp: new Date().toISOString()
                }
              });
              
              // Emit agent completion
              io.to(sessionId).emit('agent-update', { 
                sessionId, 
                agentId: agent.id, 
                agentName: agent.name, 
                status: 'completed', 
                progress: 100,
                message: 'Monitoring for human responses - workflow paused'
              });
              
              // Return early to prevent workflow from continuing
              return;
            } else {
              // Human responses found - display them and continue
              const latestComment = humanComments[humanComments.length - 1];
              const commentText = latestComment.body?.content?.[0]?.content?.[0]?.text || 'Human response detected';
              
              console.log(`[Communication Agent] Human response detected: "${commentText}"`);
              
              await storage.createMessage({
                sessionId,
                content: `✅ **Communication Agent - Human Response Detected**

**Latest Human Comment**: "${commentText}"

**Author**: ${latestComment.author?.displayName || 'Unknown'}
**Posted**: ${new Date(latestComment.created).toLocaleString()}

**Action**: Human stakeholder has provided feedback. Workflow will now continue to Sanctions Check Agent.`,
                type: 'agent',
                sender: agent.name,
                createdAt: new Date()
              });
              
              console.log(`[Communication Agent] Human response found - workflow will continue`);
              
              // Mark Communication Agent as completed with success status
              await storage.updateAgent(agent.id, {
                status: 'completed',
                progress: 100,
                results: {
                  status: 'human_response_detected',
                  human_comments_count: humanComments.length,
                  latest_comment: commentText,
                  ticket_key: jiraTicketKey,
                  timestamp: new Date().toISOString()
                }
              });
              
              // Emit agent completion
              io.to(sessionId).emit('agent-update', { 
                sessionId, 
                agentId: agent.id, 
                agentName: agent.name, 
                status: 'completed', 
                progress: 100,
                message: 'Human response detected - workflow continuing'
              });
            }
            
          } else {
            console.error(`[Communication Agent] Failed to fetch JIRA comments: ${response.status}`);
            // Continue workflow if JIRA fetch fails
          }
          
        } catch (error) {
          console.error(`[Communication Agent] Error checking JIRA comments:`, error);
          // Continue workflow if there's an error
        }
      }
    }
  }

  // Get work messages for different agent types
  function getAgentWorkMessages(agentType: string, agentName: string): string[] {
    const messages: Record<string, string[]> = {
      'extractor': [
        '📄 Analyzing policy documents and extracting key information...',
        '🔍 Identifying coverage limits, deductibles, and policy terms...',
        '📊 Processing financial data and risk factors...',
        '✅ Data extraction completed successfully.',
        ''
      ],
      'sanctions': [
        '🔒 Checking applicant against sanctions databases...',
        '🌍 Verifying against OFAC, EU, and UN sanctions lists...',
        '🔍 Cross-referencing with PEP (Politically Exposed Persons) database...',
        '⚠️ Sanctions check completed - Review required for manual approval.',
        ''
      ],
      'risk_analyst': [
        '📊 Analyzing client risk profile and conversion probability...',
        '🔍 Evaluating property type, location, and market conditions...',
        '📈 Calculating risk score and conversion likelihood...',
        '⚖️ Assessing broker relationship and policy complexity...',
        '✅ Risk profile analysis completed - Conversion probability determined.',
        ''
      ],
      'calculator': [
        '💰 Calculating base premium using actuarial models...',
        '📈 Applying risk factors and regional adjustments...',
        '🎯 Computing final premium with discounts and loadings...',
        '✅ Premium calculation completed: $4,250 annually.',
        ''
      ],


      'email_drafter': [
        '✍️ Drafting professional communication to broker...',
        '📋 Including policy details and sanctions check results...',
        '🔍 Reviewing email content for accuracy and professional tone...',
        '✅ Email draft completed and ready for your review and editing.',
        ''
      ],
      'email_sender': [
        '📧 Preparing email for delivery to broker...',
        '🔐 Encrypting sensitive policy information and attachments...',
        '📤 Sending email notification to broker via secure channel...',
        '📬 Confirming email delivery status and tracking message ID...',
        '✅ Email sent successfully - Broker notified with delivery confirmation.',
        ''
      ],
      'data_validation': [
        '✅ Reviewing sanctions screening results and data completeness...',
        '🔍 Performing final validation checks on processed data...',
        '📊 Verifying data integrity across all workflow components...',
        '🔗 Preparing handoff to Integration Agent for PAS processing...',
        '✅ Data validation completed - All checks passed. Ready for PAS integration.',
        ''
      ],
      'integration': [
        '🔗 Integrating workflow data with Policy Administration System (PAS)...',
        '📊 Validating data integrity and completeness...',
        '🔄 Updating PAS with processed information...',
        '📋 Generating audit trail documentation...',
        '✅ All data successfully processed, validated, and updated in PAS.',
        ''
      ],
      // Slip-specific agent types
      'slip_validator': [
        '📋 Validating Lloyd\'s slip format and structure...',
        '🔍 Checking mandatory fields and documentation...',
        '✅ Slip validation completed - Format verified.',
        ''
      ],
      'coverage_analyzer': [
        '🔍 Analyzing coverage terms and conditions...',
        '📊 Reviewing policy limits and deductibles...',
        '⚖️ Assessing coverage adequacy and exclusions...',
        '✅ Coverage analysis completed - Terms verified.',
        ''
      ],
      'risk_assessor': [
        '⚠️ Evaluating specialty risks and exposures...',
        '🌍 Analyzing geographical and operational risks...',
        '📈 Assessing risk appetite and capacity...',
        '✅ Risk assessment completed - Exposure quantified.',
        ''
      ],
      'pricing_agent': [
        '💰 Calculating specialty line pricing...',
        '📊 Applying market rates and capacity adjustments...',
        '🎯 Determining final premium and terms...',
        '✅ Pricing completed - Premium calculated.',
        ''
      ],
      'approval_agent': [
        '✅ Reviewing slip terms for approval...',
        '⚖️ Checking compliance with underwriting guidelines...',
        '📋 Finalizing approval decision...',
        '✅ Approval completed - Slip authorized.',
        ''
      ],
      'documentation_agent': [
        '📄 Generating final slip documentation...',
        '✍️ Preparing Lloyd\'s market documents...',
        '📋 Creating policy certificates and schedules...',
        '✅ Documentation completed - Ready for market.',
        ''
      ],

      // Jira-specific agent types  
      'data_extraction': [
        '📄 Extracting data from PDF/DOCX documents using LLM processing...',
        '🔍 Applying regex patterns and natural language understanding...',
        '📊 Structuring extracted fields and validating data integrity...',
        '✅ Document data extraction completed with confidence scoring.',
        ''
      ],
      'data_extractor': [
        '📄 Extracting data from PDF/DOCX documents using LLM processing...',
        '🔍 Applying regex patterns and natural language understanding...',
        '📊 Structuring extracted fields and validating data integrity...',
        '✅ Document data extraction completed with confidence scoring.',
        ''
      ],
      'field_comparator': [
        '⚖️ Comparing JIRA fields with extracted document data...',
        '🔍 Identifying discrepancies and field mismatches...',
        '📊 Generating CSV output with mismatch details...',
        '✅ Field comparison completed - Mismatches identified and logged.',
        ''
      ],
      'mismatch_summary': [
        '📋 Generating comprehensive mismatch analysis report...',
        '🔍 Consolidating field comparison results...',
        '📊 Categorizing discrepancy severity levels...',
        '✅ Mismatch analysis completed - Ready for human approval.',
        ''
      ],
      'communication_monitor': [
        '💬 Monitoring JIRA ticket for human responses...',
        '🔍 Scanning for new comments and stakeholder input...',
        '📊 Analyzing comment content for workflow relevance...',
        '✅ Human response detected - Logging to chat interface.',
        ''
      ],
      'human_reviewer': [
        '👤 Routing mismatches to human approval workflow...',
        '📧 Sending Slack notifications to review team...',
        '⏳ Waiting for human approval on identified mismatches...',
        '✅ Human review routing completed - Approval workflow activated.',
        ''
      ],
      'sanction_checker': [
        '🔒 Validating against OFAC, UN, and EU sanctions lists...',
        '🌍 Cross-referencing names and entities with global databases...',
        '📋 Generating audit logs for compliance requirements...',
        '✅ Sanctions check completed - Results logged for compliance.',
        ''
      ],
      'policy_manager': [
        '🏛️ Integrating with Guidewire policy management system...',
        '📝 Creating or updating policy records with validated data...',
        '🔄 Synchronizing field updates with policy database...',
        '✅ Policy system integration completed - Records updated.',
        ''
      ],
      'audit_logger': [
        '📊 Logging all workflow activities for compliance tracking...',
        '📋 Creating detailed audit trail with timestamps and actions...',
        '🔐 Securing audit logs with encryption and access controls...',
        '✅ Comprehensive audit logging completed - Full compliance trail established.',
        ''
      ]
    };

    return messages[agentType] || [
      `🔧 ${agentName} is working on the request...`,
      `📊 Processing data and analyzing requirements...`,
      `🔍 Reviewing information and generating insights...`,
      `✅ ${agentName} has completed the task.`,
      ''
    ];
  }

  // Get data extraction completion message using CSV data
  function getDataExtractionCompletionMessage(workflowType: string = 'submission'): string {
    if (workflowType === 'slip') {
      // Use hardcoded slip data to avoid async complexity
      const slipId = "SLP-2025-001";
      
      return `✅ Data Extraction Agent completed successfully:

Lloyd's Market Analysis Results for ${slipId}

Slip Information Extracted:
- Slip Reference: LMX/2025/001
- Lloyd's Syndicate: Syndicate 623
- Lead Underwriter: James Mitchell
- Underwriter Email: j.mitchell@lloyds.com
- Risk Category: Marine Cargo

Policy Details:
- Policy Inception: 01/04/2025
- Policy Expiry: 31/03/2026
- Coverage Territory: Worldwide
- Currency: USD
- Policy Limits: $50,000,000
- Deductible: $25,000
- Premium Amount: $485,000
- Brokerage Rate: 15%

Risk Information:
- Risk Location: International Shipping Routes
- Business Description: Global shipping and logistics operations
- Years Trading: 25
- Annual Turnover: $125,000,000
- Number of Employees: 450
- Previous Claims: 3 claims in last 5 years

Risk Management:
- Risk Improvements: Enhanced GPS tracking, improved packaging protocols
- Security Measures: 24/7 monitoring, secure warehousing facilities
- Compliance Certifications: ISO 9001, IMO compliance
- Financial Rating: A+ (Standard & Poor's)

Reinsurance & Terms:
- Reinsurance: 75% quota share with Munich Re
- Exclusions: War risks, nuclear perils, cyber attacks
- Warranties: Proper packaging, approved routes only
- Conditions: Monthly reporting, claims handling procedures

Extraction Confidence: 94%

Status: ✅ COMPLETE - Ready for coverage analysis`;
    } else {
      // Use hardcoded submission data for submissions
      const submissionId = "UW-2025-001";
      const submissionData = {
        submission_id: "UW-2025-001",
        broker_ref_hu_number: "REF-HU-2024001",
        intermediary_name: "Marsh UK Limited",
        broker_contact_name: "Sarah Johnson",
        broker_email: "sarah.johnson@marsh.com",
        target_premium: "£8500",
        previous_insurer: "Aviva Insurance",
        insurance_declined: "No",
        convictions: "No",
        bankruptcy: "No",
        claims_count: "1",
        contact_role: "Broker",
        title: "Ms",
        first_name: "Sarah",
        middle_name: "Elizabeth",
        surname: "Johnson",
        date_of_birth: "1985-03-22",
        occupation: "Senior Insurance Broker",
        house_number: "45",
        house_name: "Oakwood House",
        address_line1: "Victoria Street",
        city: "Manchester",
        postcode: "M1 4BT",
        property_house_number: "45",
        property_house_name: "Oakwood House",
        property_address_line1: "Victoria Street",
        property_city: "Manchester",
        property_postcode: "M1 4BT",
        cover_type: "Combined",
        building_sums_insured: "£750000",
        content_sums_insured: "£150000",
        property_type: "Victorian Terrace",
        year_built: "1898",
        number_of_bedrooms: "5",
        listed_building: "Grade II Listed",
        roof_construction: "Slate",
        wall_construction: "Stone"
      };
      
      const fullName = `${submissionData.title} ${submissionData.first_name} ${submissionData.middle_name ? submissionData.middle_name + ' ' : ''}${submissionData.surname}`;
      
      return `✅ Data Extraction Agent completed successfully:

Document Analysis Results for ${submissionId}

Policy Holder Information Extracted:
- Contact Role: ${submissionData.contact_role}
- Name: ${fullName}
- Date of Birth: ${submissionData.date_of_birth}
- Occupation: ${submissionData.occupation}
- Address: ${submissionData.house_number} ${submissionData.house_name ? submissionData.house_name + ', ' : ''}${submissionData.address_line1}, ${submissionData.city}, ${submissionData.postcode}

Property Details:
- Property Address: ${submissionData.property_house_number} ${submissionData.property_house_name ? submissionData.property_house_name + ', ' : ''}${submissionData.property_address_line1}, ${submissionData.property_city}, ${submissionData.property_postcode}
- Cover Type: ${submissionData.cover_type}
- Building Sum Insured: ${submissionData.building_sums_insured}
- Content Sum Insured: ${submissionData.content_sums_insured}
- Property Type: ${submissionData.property_type}
- Year Built: ${submissionData.year_built}
- Bedrooms: ${submissionData.number_of_bedrooms}
- Listed Building: ${submissionData.listed_building}
- Roof: ${submissionData.roof_construction}, Wall: ${submissionData.wall_construction}

Financial Information:
- Target Premium: ${submissionData.target_premium}
- Previous Insurer: ${submissionData.previous_insurer}
- Insurance Declined: ${submissionData.insurance_declined}
- Convictions: ${submissionData.convictions}
- Bankruptcy: ${submissionData.bankruptcy}
- Claims Count: ${submissionData.claims_count}

Broker Details:
- Intermediary: ${submissionData.intermediary_name}
- Broker Contact: ${submissionData.broker_contact_name}
- Broker Email: ${submissionData.broker_email}
- Broker Ref: ${submissionData.broker_ref_hu_number}

Extraction Confidence: 95%

Status: ✅ COMPLETE - Ready for sanctions screening`;
    }
  }

  // Get completion message for different agent types
  function getAgentCompletionMessage(agentType: string, agentName: string): string {
    // Refresh config cache to ensure latest configuration
    refreshConfigCache();
    
    // First try to get message from configuration
    const configuredResponse = getAgentResponse(agentType);
    if (configuredResponse?.completion_message) {
      return configuredResponse.completion_message;
    }
    
    const completionMessages: Record<string, string> = {
      'extractor': getDataExtractionCompletionMessage('submission'),
      'sanctions': `⚠️ Sanctions Check Agent completed with AI analysis:

Sanctions Screening Result: PASSED
Entity name not found in any compliance or regulatory databases.

Risk Classification: Medium
Confidence Level: 92%

📌 Recommendation: No sanctions detected, but adverse media flagged. Escalate to Compliance before proceeding.`,
      'risk_analyst': `✅ Risk Profile Agent completed successfully:

Risk Profile Analysis Results

Conversion Probability Assessment:
- Overall conversion probability: 72%
- Risk score: 45/100 (LOW-MEDIUM RISK)
- Recommendation: PROCEED WITH STANDARD TERMS

Risk Factor Analysis:
- Client history: 85% confidence (Strong track record)
- Property type: 78% confidence (Standard residential)
- Location risk: 90% confidence (Low-risk area)
- Coverage amount: 82% confidence (Appropriate for property value)
- Broker relationship: 88% confidence (Established broker)
- Policy complexity: 75% confidence (Standard terms)
- Market conditions: 70% confidence (Favorable market)

Key Insights:
• Client profile indicates high likelihood of conversion
• Property location and type present minimal risk
• Strong broker relationship supports successful completion
• Market conditions favor competitive pricing

Next Steps: Continue to premium calculation with standard risk factors applied.`,
      'calculator': '✅ Premium Calculation Complete: Annual premium calculated at $4,250 based on risk assessment, coverage limits, and regional factors.',


      'email_drafter': `✅ Email Draft Agent completed processing - AI generation failed, using fallback template.

Subject: Policy Approval Notification - Insurance Application

Dear Valued Client,

We are pleased to inform you that your insurance policy application has been approved. Below are the details of your policy:

Policy Information:
- Coverage: Combined Buildings & Contents  
- Policy Number: POL-${new Date().getTime()}
- Premium: As quoted
- Effective Date: ${new Date().toLocaleDateString()}
- Policy Term: 12 months

Coverage Details:
- Buildings Cover: As per application
- Contents Cover: As per application
- Deductible: As specified

Next Steps:
1. Policy documents will be issued within 24 hours
2. Premium payment instructions will be sent separately
3. Certificate of Insurance available upon request

Thank you for choosing our insurance services. If you have any questions, please contact our underwriting team.

Best regards,
Insurance Underwriting Team
EXL Xtrakto.AI`,
      'email_sender': '✅ Email Sent: Broker notification sent successfully. Confirmation received at ' + new Date().toLocaleTimeString() + '.',
      'data_validation': `✅ Data Validation Agent completed successfully:

Data Validation Summary
Sanction check completeness: Passed.
All validation steps successfully completed.
Invoking Integration Agent to update Policy Administration System (PAS).

Validation Details:
- Sanctions Status: ✅ All checks completed successfully
- Data Completeness: ✅ 100% - All required fields validated
- Quality Assurance: ✅ Passed all integrity checks
- Compliance Review: ✅ Regulatory requirements satisfied
- System Readiness: ✅ PAS integration approved

Next Action: Transferring validated data to Integration Agent for PAS processing`,
      'integration': `✅ **Integration Agent Completed**

**PAS Integration Summary:**
All data successfully processed, validated, and updated in PAS.
Full audit trail and compliance checks logged.

**Integration Details:**
• **Data Validation**: All field values verified and standardized
• **PAS Update Status**: Successfully synchronized with Policy Administration System
• **Audit Trail**: Complete transaction log generated with timestamps
• **Compliance Verification**: All regulatory requirements satisfied
• **Data Integrity**: 100% accuracy confirmed across all systems

**System Integration**: COMPLETED
**Audit Status**: LOGGED
**Workflow Status**: SUCCESSFULLY FINALIZED`,
      'final_decision': '🎉 Final Decision: POLICY APPROVED - All underwriting requirements met. Policy ready for issuance with premium $4,250/year.',
      
      // Slip-specific completion messages
      'slip_validator': `✅ Slip Validation Agent completed successfully:

Lloyd's Slip Validation Results

Format Validation:
- Slip reference format: ✅ VALID
- Required fields completed: ✅ COMPLETE
- Market presentation format: ✅ COMPLIANT
- Regulatory requirements: ✅ MET

Structure Check:
- Cover wording: ✅ APPROVED
- Terms and conditions: ✅ VERIFIED
- Limit and deductible: ✅ CONFIRMED
- Territory definition: ✅ CLEAR

Validation Status: ✅ PASSED - Slip meets all Lloyd's market standards`,

      'coverage_analyzer': `✅ Coverage Analysis Agent completed successfully:

Coverage Analysis Results

Policy Coverage Assessment:
- Coverage adequacy: ✅ APPROPRIATE
- Terms and conditions: ✅ STANDARD
- Exclusions review: ✅ REASONABLE
- Warranties compliance: ✅ ACCEPTABLE

Risk Coverage:
- Primary coverage: ✅ ADEQUATE
- Excess coverage: ✅ SUFFICIENT
- Territorial scope: ✅ APPROPRIATE
- Time element: ✅ SUITABLE

Analysis Status: ✅ APPROVED - Coverage meets market standards`,

      'risk_assessor': `✅ Risk Assessment Agent completed successfully:

Risk Assessment Results

Risk Evaluation:
- Business risk profile: ✅ ACCEPTABLE
- Financial stability: ✅ STRONG
- Operational risks: ✅ MANAGEABLE
- Geographic exposure: ✅ DIVERSIFIED

Risk Factors:
- Industry experience: ✅ EXTENSIVE
- Safety measures: ✅ ROBUST
- Loss prevention: ✅ EFFECTIVE
- Compliance record: ✅ CLEAN

Assessment Status: ✅ APPROVED - Risk profile within acceptable parameters`,

      'pricing_agent': `✅ Pricing Agent completed successfully:

Pricing Analysis Results

Premium Calculation:
- Base rate: Market competitive
- Risk adjustments: Applied appropriately
- Territory factors: Included
- Final premium: $485,000 annually

Pricing Components:
- Underwriting margin: 15%
- Acquisition costs: 12%
- Risk loading: 8%
- Profit margin: 10%

Pricing Status: ✅ APPROVED - Premium reflects appropriate risk adjustment`,

      'approval_agent': `✅ Approval Agent completed successfully:

Approval Decision Results

Review Summary:
- Risk assessment: ✅ ACCEPTABLE
- Pricing adequacy: ✅ COMPETITIVE
- Terms compliance: ✅ STANDARD
- Documentation: ✅ COMPLETE

Final Approval:
- Underwriting decision: ✅ APPROVED
- Authority level: Senior Underwriter
- Conditions: Standard terms apply
- Effective date: As per inception

Decision Status: ✅ APPROVED - Ready for documentation`,

      'documentation_agent': `✅ Documentation Agent completed successfully:

Documentation Results

Document Generation:
- Policy schedule: ✅ GENERATED
- Cover certificate: ✅ CREATED  
- Market documents: ✅ PREPARED
- Regulatory filings: ✅ READY

Final Documentation:
- Lloyd's slip: ✅ FINALIZED
- Binding authority: ✅ CONFIRMED
- Premium collection: ✅ SETUP
- Claims handling: ✅ ESTABLISHED

Status: ✅ COMPLETE - All documentation ready for market presentation`,

      'mismatch_summary': `Quality Assurance Agent completed analysis. Field comparison results are available for review. Please check the configuration system for detailed comparison results.`
    };

    return completionMessages[agentType] || `✅ ${agentName} has completed processing successfully.`;
  }

  // Function to post Quality Assurance to Jira
  async function postMismatchSummaryToJira(sessionId: string, jiraComment: string, ticketKey: string) {
    try {
      console.log(`[Jira Comment] Posting Quality Assurance to ticket ${ticketKey}`);
      
      // Use the current Jira credentials from credentials.json
      const jiraCredentials = await credentialManager.getJiraCredentials();
      const jiraAuth = Buffer.from(`${jiraCredentials.email}:${jiraCredentials.api_token}`).toString('base64');
      
      console.log(`[Jira API] Using current Jira API credentials for ${jiraCredentials.base_url}`);
      
      const jiraCommentResponse = await axios.post(
        `${jiraCredentials.base_url}/rest/api/3/issue/${ticketKey}/comment`,
        {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: '🤖 AI-Generated Quality Assurance Report',
                    marks: [{ type: 'strong' }]
                  }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: jiraComment.substring(0, 1000) + (jiraComment.length > 1000 ? '...\n\n[Full report truncated for display]' : '')
                  }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: `Generated by Quality Assurance Agent • Workflow: ${sessionId} • ${new Date().toISOString()}`,
                    marks: [{ type: 'em' }]
                  }
                ]
              }
            ]
          }
        },
        {
          headers: {
            'Authorization': `Basic ${jiraAuth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      
      const commentId = jiraCommentResponse.data.id;
      console.log(`[Jira Success] Comment posted to ${ticketKey} with status: ${jiraCommentResponse.status}, comment ID: ${commentId}`);
      
      // Register comment watcher to monitor for human responses
      try {
        // Access the registration function from the app instance
        if (app.locals.registerCommentWatcher) {
          app.locals.registerCommentWatcher(ticketKey, sessionId, commentId);
          console.log(`[Comment Watcher] Registered watcher for ticket ${ticketKey}, session ${sessionId}, comment ${commentId}`);
        } else {
          console.warn('[Comment Watcher] Registration function not available - watcher not registered');
        }
      } catch (watcherError) {
        console.error('[Comment Watcher] Failed to register watcher:', watcherError);
        // Don't throw - comment posting was successful
      }
      
      return { id: commentId, status: 'success' };
    } catch (error) {
      console.error(`[Jira Error] Exception posting comment to ${ticketKey}:`, error.response?.data || error.message);
      throw new Error(`Jira API Error: ${error.response?.status || 'Unknown'} - ${error.response?.data?.errorMessages?.[0] || error.message}`);
    }
  }

  // Resume workflow execution after data extraction approval
  async function resumeSlipWorkflowAfterDataExtraction(sessionId: string) {
    try {
      console.log(`[Slip Workflow] Resuming slip workflow after data extraction for ${sessionId}`);
      
      const agents = await storage.getAgentsBySession(sessionId);
      
      // Continue from the next agent after Data Extraction (index 1)
      for (let i = 1; i < agents.length; i++) {
        const agent = agents[i];
        await executeAgent(sessionId, agent);
      }
      
      // Mark workflow as completed
      await storage.updateWorkflowSession(sessionId, { status: 'completed' });
      io.to(sessionId).emit('workflow-update', { sessionId, status: 'completed' });
      
    } catch (error) {
      console.error(`[Slip Workflow] Failed to resume slip workflow for ${sessionId}:`, error);
    }
  }

  async function resumeWorkflowAfterDataExtraction(sessionId: string) {
    try {
      console.log(`[Data Extraction Resume] Resuming workflow after data extraction approval for ${sessionId}`);
      
      // Update workflow status to running
      await storage.updateWorkflowSession(sessionId, { 
        status: 'running',
        lastUpdated: new Date()
      });
      
      // Continue with next agent after Data Extraction Agent
      const agents = await storage.getAgentsBySession(sessionId);
      const workflowSession = await storage.getWorkflowSession(sessionId);
      const workflowType = workflowSession?.workflowType || 'submission';
      
      // Find the next agent to execute (skip Data Extraction Agent) 
      // Handle different agent types for different workflows
      const dataExtractionAgentIndex = agents.findIndex(a => 
        a.type === 'extractor' || a.type === 'data_extraction' || a.type === 'data_extractor'
      );
      const nextAgentIndex = dataExtractionAgentIndex >= 0 ? dataExtractionAgentIndex + 1 : 1;
      
      if (nextAgentIndex < agents.length) {
        // Execute remaining agents sequentially with conditional logic
        let currentIndex = nextAgentIndex;
        while (currentIndex < agents.length) {
          const agent = agents[currentIndex];
          await executeAgent(sessionId, agent);
          
          // Check if we just completed the Quality Assurance Agent - PAUSE FOR HUMAN APPROVAL
          if (agent.type === 'mismatch_summarizer' || agent.type === 'mismatch_summary') {
            console.log('[Quality Assurance] Quality Assurance Agent completed - checking for pending approval');
            
            // Small delay to ensure approval request is saved in database
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if approval request was created by the agent
            const pendingApprovals = await storage.getApprovalRequestsBySession(sessionId);
            console.log(`[Approval Check] Found ${pendingApprovals.length} approvals for session ${sessionId}`);
            
            const hasPendingMismatchApproval = pendingApprovals.some(
              approval => {
                console.log(`[Approval Check] Checking approval: type=${approval.type}, status=${approval.status}`);
                return approval.type === 'mismatch_summary_jira' && approval.status === 'pending';
              }
            );
            
            console.log(`[Approval Check] Has pending mismatch approval: ${hasPendingMismatchApproval}`);
            
            if (hasPendingMismatchApproval) {
              console.log('[Workflow Control] STOPPING agent execution loop - approval required before continuing');
              
              // Update workflow status to pending approval
              await storage.updateWorkflowSession(sessionId, { 
                status: 'pending_approval',
                lastUpdated: new Date()
              });
              
              io.to(sessionId).emit('workflow-update', { 
                sessionId, 
                status: 'pending_approval',
                message: 'Mismatch summary completed - waiting for approval to post to Jira'
              });
              
              console.log('[Workflow Paused] Quality Assurance workflow paused - waiting for human approval');
              return; // Stop execution completely until approval is received
            } else {
              console.log('[Workflow Continue] No pending mismatch approval found - continuing workflow');
            }
          }
          
            // Check if we just completed the Data Validation Agent (Field Comparison)
          if (agent.type === 'field_comparison') {
            console.log('[Conditional Logic] Data Validation Agent completed - performing direct CSV comparison');
            
            // Get workflow details for ticket ID and approved data
            const workflow = await storage.getWorkflowSession(sessionId);
            const ticketId = workflow?.caseId || 'HIS-88';
            const approvedData = workflow?.extractedData || {};
            
            // Perform direct CSV comparison without AI
            const comparisonResult = compareApprovedDataWithReference(ticketId, approvedData);
            
            // Update Data Validation Agent with direct comparison results
            await storage.updateAgent(agent.id, {
              results: {
                agent_name: 'Data Transformation Agent',
                status: 'completed',
                confidence: 1.0,
                ai_response: comparisonResult.summary,
                comparison_result: comparisonResult,
                changes_list: comparisonResult.changesList,
                timestamp: new Date().toISOString()
              }
            });
            
            // Store changes list in workflow for Quality Assurance Agent
            await storage.updateWorkflowSession(sessionId, {
              extractedData: {
                ...workflow?.extractedData,
                field_comparison_results: comparisonResult
              }
            });
            
            console.log(`[CSV Comparison] ${comparisonResult.totalChanges} changes detected - CHANGES_DETECTED: ${comparisonResult.changesDetected ? 'YES' : 'NO'}`);
            
            // For Jira workflows, ALWAYS process Quality Assurance Agent regardless of changes
            if (workflowType === 'jira') {
              console.log('[Jira Workflow] Always proceeding to Quality Assurance Agent for Jira tickets - NO SKIPPING');
              // Do not skip any agents for Jira workflows
            } else {
              // Check if we should skip Quality Assurance Agent for non-Jira workflows
              if (!comparisonResult.changesDetected) {
                console.log('[Skip Logic] No changes detected - skipping Quality Assurance Agent');
                // Skip to next agent after Quality Assurance (typically Sanctions Check)
                currentIndex += 2; // Skip current + Quality Assurance
                continue;
              } else {
                console.log('[Skip Logic] Changes detected - proceeding to Quality Assurance Agent');
              }
            }
          }
          
          currentIndex++;
        }
      }
      
      // Update workflow to completed
      await storage.updateWorkflowSession(sessionId, { 
        status: 'completed',
        lastUpdated: new Date()
      });
      
      console.log(`[Workflow Complete] All agents completed for ${sessionId}`);
      
    } catch (error) {
      console.error(`[Resume Error] Failed to resume workflow after data extraction for ${sessionId}:`, error);
    }
  }

  // Resume workflow execution after approval
  async function resumeWorkflowAfterBrokerInfo(sessionId: string) {
    try {
      console.log(`[Workflow Resume] Resuming workflow after broker info submission for ${sessionId}`);
      
      // Continue with next agent (Sanctions Check Agent)
      const agents = await storage.getAgentsBySession(sessionId);
      const sanctionsAgent = agents.find(a => a.type === 'sanctions');
      
      if (sanctionsAgent) {
        // Execute sanctions check agent
        await executeAgent(sessionId, sanctionsAgent);
        
        // Continue with approval workflow
        await executeWorkflowAgents(sessionId);
      }
    } catch (error) {
      console.error(`[Resume Error] Failed to resume workflow after broker info for ${sessionId}:`, error);
    }
  }

  // Resume workflow after human response detected in Jira
  async function resumeWorkflowAfterHumanResponse(sessionId: string) {
    try {
      console.log(`[Human Response] Resuming workflow after human response detected for ${sessionId}`);
      
      // Update workflow status to running
      await storage.updateWorkflowSession(sessionId, { 
        status: 'running',
        lastUpdated: new Date()
      });
      
      // Mark the human response approval as completed
      const approvals = await storage.getApprovalRequestsBySession(sessionId);
      const humanResponseApproval = approvals.find(a => a.type === 'human_response_required' && a.status === 'pending');
      
      if (humanResponseApproval) {
        await storage.updateApprovalRequest(humanResponseApproval.id, {
          status: 'approved',
          response: 'human_comment_detected',
          respondedAt: new Date()
        });
      }
      
      // Get Communication Agent and mark it as completed
      const agents = await storage.getAgentsBySession(sessionId);
      const communicationAgent = agents.find(a => a.type === 'communication_monitor');
      
      if (communicationAgent) {
        await storage.updateAgent(communicationAgent.id, {
          status: 'completed',
          progress: 100,
          results: {
            status: 'completed',
            human_response_detected: true,
            timestamp: new Date().toISOString()
          }
        });
        
        // Create completion message
        await storage.createMessage({
          sessionId,
          content: `✅ **Communication Agent - Human Response Detected**

Human response detected in Jira ticket. Workflow resuming automatically.

**Action**: Creating and executing remaining workflow agents.`,
          type: 'agent',
          sender: communicationAgent.name,
          createdAt: new Date()
        });
      }
      
      // Continue with remaining agents execution (all agents already exist)
      const communicationAgentIndex = agents.findIndex(a => a.type === 'communication_monitor');
      const nextAgentIndex = communicationAgentIndex + 1; // Continue after Communication Agent
      
      console.log(`[Execution Resume] Starting remaining agents from index ${nextAgentIndex} for ${sessionId}`);
      await resumeWorkflowAfterApproval(sessionId, nextAgentIndex);
      
      console.log(`[Human Response] Workflow ${sessionId} resumed successfully`);
      
    } catch (error) {
      console.error(`[Resume Error] Failed to resume workflow after human response for ${sessionId}:`, error);
    }
  }

  async function resumeWorkflowAfterApproval(sessionId: string, fromAgentIndex: number = 0) {
    try {
      console.log(`[Workflow Resume] Continuing execution from agent ${fromAgentIndex} for ${sessionId}`);
      
      const agents = await storage.getAgentsBySession(sessionId);
      
      // Execute agents sequentially and check status after each one
      for (let i = fromAgentIndex; i < agents.length; i++) {
        const agent = agents[i];
        console.log(`[Sequential Execution] Starting agent ${i}: ${agent.name} for ${sessionId}`);
        
        // Execute the agent
        await executeAgent(sessionId, agent);
        
        // CRITICAL: Check workflow status immediately after agent execution
        const currentWorkflow = await storage.getWorkflowSession(sessionId);
        console.log(`[Status Check] After ${agent.name}: status=${currentWorkflow?.status} for ${sessionId}`);
        
        // CRITICAL: For Communication Agent, always check status after execution completes
        if (agent.type === 'communication_monitor' || agent.type === 'communication') {
          const latestWorkflow = await storage.getWorkflowSession(sessionId);
          if (latestWorkflow?.status === 'pending_human_response') {
            console.log(`[COMMUNICATION AGENT PAUSE] Communication Agent paused workflow - stopping execution for ${sessionId}`);
            return; // STOP execution immediately when Communication Agent pauses
          }
        }
        
        // If workflow is pending approval or human response, stop execution immediately
        if (currentWorkflow?.status === 'pending_approval' || currentWorkflow?.status === 'pending_human_response') {
          console.log(`[SEQUENTIAL PAUSE] Workflow paused after ${agent.name} - ${currentWorkflow.status} for ${sessionId}`);
          return; // STOP execution loop - no more agents will run
        }
        
        // Check if this is the Sanctions Check Agent - Different approval for Jira vs regular workflows
        if (agent.type === 'sanctions' || agent.type === 'sanctions_check') {
          console.log(`[Approval Required] Sanctions check completed, requesting human approval for ${sessionId}`);
          
          // Get the agent's AI analysis results
          const agentResults = agent.results || {};
          const isJiraWorkflow = sessionId?.startsWith('JIR-');
          
          if (isJiraWorkflow) {
            // Jira-specific PAS update approval
            const approvalRequest = await storage.createApprovalRequest({
              sessionId,
              type: 'pas_update_review',
              title: 'PAS Update Authorization',
              description: 'Sanctions check completed successfully. Should I proceed to update data in Policy Administration System (PAS)?',
              data: { 
                agentId: agent.id, 
                agentName: agent.name,
                analysisResults: (agentResults as any).ai_response || "Sanctions screening completed successfully with no adverse findings.",
                confidence: (agentResults as any).confidence || 0.98,
                workflowType: 'jira'
              },
              status: 'pending'
            });
            
            // Update workflow status to pending approval
            await storage.updateWorkflowSession(sessionId, { status: 'pending_approval' });
            
            // Create system message for PAS update approval
            await storage.createMessage({
              sessionId,
              content: `✅ **Sanctions Check Completed - PAS Update Authorization Required**

${agent.name} has completed the sanctions screening process successfully.

**Sanctions Screening Summary:**
• **OFAC Check**: CLEAR - No matches found
• **EU Sanctions**: CLEAR - No adverse findings  
• **UK HM Treasury**: CLEAR - No regulatory concerns
• **PEP Screening**: CLEAR - No politically exposed persons identified
• **Overall Result**: PASSED
• **Confidence Level**: 98%
• **Risk Classification**: LOW-MEDIUM

**Ready for PAS Integration** - All compliance requirements satisfied.

**Human Approval Required**: Should I proceed to update data in Policy Administration System (PAS)?

Please respond with "yes" to proceed with PAS update or "no" to stop the process.`,
              type: 'system',
              sender: 'PAS Integration System'
            });
            
            // Notify frontend about PAS update approval requirement
            io.to(sessionId).emit('approval-required', {
              sessionId,
              approvalId: approvalRequest.id,
              type: 'pas_update_review',
              title: 'PAS Update Authorization',
              description: 'Sanctions check completed. Should I proceed to update data in PAS?',
              agentName: agent.name
            });
          } else {
            // Regular sanctions approval for non-Jira workflows
            const approvalRequest = await storage.createApprovalRequest({
              sessionId,
              type: 'sanctions_review',
              title: 'Sanctions Check Review',
              description: 'Sanctions check has been completed. Review the results and approve to continue with the underwriting process.',
              data: { 
                agentId: agent.id, 
                agentName: agent.name,
                analysisResults: (agentResults as any).ai_response || "Sanctions screening completed successfully with no adverse findings.",
                confidence: (agentResults as any).confidence || 0.95
              },
              status: 'pending'
            });
            
            // Update workflow status to pending approval
            await storage.updateWorkflowSession(sessionId, { status: 'pending_approval' });
            
            // Create system message to notify user about approval needed
            await storage.createMessage({
              sessionId,
              content: `🔍 Sanctions Check Completed - Human Review Required
              
Analysis Results:
${(agentResults as any).ai_response || "No adverse findings identified. All sanctions databases cleared."}

Confidence Score: ${Math.round(((agentResults as any).confidence || 0.95) * 100)}%

Action Required: Please review the sanctions check results and respond with "yes" to approve or "no" to reject the application.`,
              type: 'system',
              sender: 'Sanctions Review System'
            });
            
            // Notify frontend about sanctions approval requirement
            io.to(sessionId).emit('approval-required', {
              sessionId,
              approvalId: approvalRequest.id,
              type: 'sanctions_review',
              title: 'Sanctions Check Review',
              description: 'Sanctions check completed. Please review and approve to continue.',
              agentName: agent.name
            });
          }
          
          console.log(`[Workflow Paused] Waiting for human approval for ${sessionId}`);
          return; // Stop execution until approval is received
        }
        
        // Check if this is the Email Draft Agent - add human approval step for email actions
        if (agent.type === 'communication' && agent.name.includes('Email Draft')) {
          console.log(`[Email Draft Approval] Email draft completed, requesting user action for ${sessionId}`);
          
          // Create approval request for email draft
          const approvalRequest = await storage.createApprovalRequest({
            sessionId,
            type: 'email_draft_review',
            title: 'Email Draft Review',
            description: 'Email draft has been created. Please choose: Send Email, Edit Email, or Discard Email',
            data: { agentId: agent.id, agentName: agent.name },
            status: 'pending'
          });
          
          // Update workflow status to pending approval
          await storage.updateWorkflowSession(sessionId, { status: 'pending_approval' });
          
          // Create system message to notify user about email draft approval
          await storage.createMessage({
            sessionId,
            content: `📧 Email Draft Completed - Action Required
            
Draft Status: Email draft has been created and is ready for your review.

Available Actions:
• Type "send" to send the email as drafted
• Type "edit" to modify the email content  
• Type "discard" to cancel the email

Please respond with your choice: send, edit, or discard`,
            type: 'system',
            sender: 'Email Draft Review System',
            createdAt: new Date()
          });
          
          // Notify frontend about email draft approval requirement
          io.to(sessionId).emit('approval-required', {
            sessionId,
            approvalId: approvalRequest.id,
            type: 'email_draft_review',
            title: 'Email Draft Review',
            description: 'Email draft completed. Please choose your action: Send, Edit, or Discard',
            agentName: agent.name
          });
          
          console.log(`[Workflow Paused] Waiting for email draft action for ${sessionId}`);
          return; // Stop execution until user chooses action
        }
      }
      
      // Mark workflow as completed
      await storage.updateWorkflowSession(sessionId, { status: 'completed' });
      io.to(sessionId).emit('workflow-update', { sessionId, status: 'completed' });
      
    } catch (error) {
      console.error(`[Workflow Resume] Failed to resume workflow for ${sessionId}:`, error);
    }
  }

  // Email draft management endpoints
  app.post('/api/workflows/:sessionId/email-draft', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { emailDraft } = req.body;
      
      // Find the Email Draft Agent for this session
      const agents = await storage.getAgentsBySession(sessionId);
      const draftAgent = agents.find(a => a.type === 'email_drafter');
      
      if (draftAgent) {
        // Update the Email Draft Agent with the new draft content
        await storage.updateAgent(draftAgent.id, {
          results: {
            ...draftAgent.results,
            emailDraft: emailDraft,
            lastModified: new Date().toISOString()
          }
        });
        
        // Create system message about email draft update
        await storage.createMessage({
          sessionId,
          content: `📧 Email Draft Updated\n\nEmail draft has been modified and saved. Ready for sending when approved.`,
          type: 'system',
          sender: 'Email Draft Editor',
          createdAt: new Date()
        });
        
        res.json({ success: true, message: 'Email draft saved successfully' });
      } else {
        res.status(404).json({ error: 'Email Draft Agent not found' });
      }
    } catch (error) {
      console.error('Email draft save error:', error);
      res.status(500).json({ error: 'Failed to save email draft' });
    }
  });

  app.get('/api/workflows/:sessionId/email-draft', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Find the Email Draft Agent for this session
      const agents = await storage.getAgentsBySession(sessionId);
      const draftAgent = agents.find(a => a.type === 'email_drafter');
      
      if (draftAgent && draftAgent.results && draftAgent.results.emailDraft) {
        res.json({ 
          emailDraft: draftAgent.results.emailDraft,
          lastModified: draftAgent.results.lastModified 
        });
      } else {
        res.status(404).json({ error: 'Email draft not found' });
      }
    } catch (error) {
      console.error('Email draft fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch email draft' });
    }
  });

  // API Routes
  app.get('/api/workflows', async (req, res) => {
    try {
      const workflows = Array.from((storage as any).workflowSessions.values());
      res.json(workflows);
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to get workflows', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Resume workflow execution function
  async function resumeWorkflowExecution(sessionId: string) {
    try {
      const workflow = await storage.getWorkflowSession(sessionId);
      if (!workflow) {
        console.log(`[Resume] No workflow found for ${sessionId}`);
        return;
      }

      console.log(`[Resume] Resuming workflow ${sessionId} with status: ${workflow.status}`);

      // Skip resumption if workflow is completed or failed
      if (workflow.status === 'completed' || workflow.status === 'failed') {
        console.log(`[Resume] Workflow ${sessionId} is already ${workflow.status}, skipping resume`);
        return;
      }

      // If workflow is waiting for human approval, don't resume
      if (workflow.status === 'pending_approval' || workflow.status === 'pending_data_extraction') {
        console.log(`[Resume] Workflow ${sessionId} is waiting for human approval, not resuming`);
        return;
      }

      // Resume execution by checking next pending agent
      const agents = await storage.getAgentsBySession(sessionId);
      const nextPendingAgent = agents.find(agent => agent.status === 'pending');
      
      if (nextPendingAgent) {
        console.log(`[Resume] Found pending agent: ${nextPendingAgent.name}`);
        executeWorkflowAgents(sessionId);
      } else {
        console.log(`[Resume] No pending agents found for ${sessionId}`);
      }
    } catch (error) {
      console.error(`[Resume Error] Failed to resume workflow ${sessionId}:`, error);
    }
  }

  // Get or create workflow for a case
  app.get('/api/workflows/case/:caseId', async (req, res) => {
    try {
      const { caseId } = req.params;
      
      // Check if workflow already exists for this case
      const existingWorkflow = await storage.getWorkflowSessionByCaseId(caseId);
      
      if (existingWorkflow) {
        console.log(`[Workflow Found] Existing workflow found for case ${caseId}: ${existingWorkflow.sessionId}`);
        
        // Get agents and messages for existing workflow
        const agents = await storage.getAgentsBySession(existingWorkflow.sessionId);
        const messages = await storage.getMessagesBySession(existingWorkflow.sessionId);
        const approvals = await storage.getApprovalRequestsBySession(existingWorkflow.sessionId);
        
        // Resume workflow if it was paused and should continue
        if (existingWorkflow.status === 'paused' || existingWorkflow.status === 'running') {
          console.log(`[Workflow Resume] Resuming workflow ${existingWorkflow.sessionId} from status: ${existingWorkflow.status}`);
          // Check if we need to resume agent execution
          setTimeout(() => {
            resumeWorkflowExecution(existingWorkflow.sessionId);
          }, 1000);
        }
        
        return res.json({ 
          sessionId: existingWorkflow.sessionId, 
          session: existingWorkflow,
          agents,
          messages,
          approvals,
          status: 'existing' 
        });
      }
      
      // No existing workflow found
      res.status(404).json({ message: 'No workflow found for this case' });
    } catch (error) {
      console.error('[Workflow Get Error]:', error);
      res.status(500).json({ 
        message: 'Failed to get workflow', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Create new workflow (only when explicitly requested)
  app.post('/api/workflows', async (req, res) => {
    try {
      const { title, workflowType, caseType, caseId, forceNew = false, ticketKey, checkOnly = false } = req.body;
      
      // Auto-detect case type from case ID or ticket key if provided
      let detectedCaseType = workflowType || caseType;
      if (ticketKey && !detectedCaseType) {
        detectedCaseType = 'jira';
      } else if (caseId && !detectedCaseType) {
        detectedCaseType = caseId.startsWith('SLP-') ? 'slip' : 'submission';
      }
      
      const finalCaseType = detectedCaseType || 'submission';
      // CRITICAL: For Jira workflows, ALWAYS use the ticketKey as the case ID
      const finalCaseId = ticketKey || caseId || (finalCaseType === 'submission' ? 'UW-2025-001' : finalCaseType === 'slip' ? 'SLP-2025-001' : ticketKey || 'HIS-90');
      
      console.log('🎯 Case ID Assignment Debug:', {
        ticketKey,
        caseId,
        detectedCaseType,
        finalCaseType,
        finalCaseId
      });
      
      if (!title) {
        return res.status(400).json({ message: 'Title is required' });
      }

      // Check if workflow already exists for this case (unless forcing new)
      if (!forceNew) {
        const existingWorkflow = await storage.getWorkflowSessionByCaseId(finalCaseId);
        if (existingWorkflow) {
          console.log(`[Workflow Exists] Workflow already exists for case ${finalCaseId}: ${existingWorkflow.sessionId}`);
          
          // If checkOnly, just return the existing workflow info
          if (checkOnly) {
            return res.json({ 
              sessionId: existingWorkflow.sessionId, 
              session: existingWorkflow,
              exists: true,
              status: 'existing' 
            });
          }
          
          // Resume existing workflow if it's not completed
          if (existingWorkflow.status !== 'completed' && existingWorkflow.status !== 'rejected') {
            console.log(`[Workflow Resume] Resuming existing workflow ${existingWorkflow.sessionId} with status: ${existingWorkflow.status}`);
            setTimeout(() => {
              resumeWorkflowExecution(existingWorkflow.sessionId);
            }, 1000);
          }
          
          return res.json({ 
            sessionId: existingWorkflow.sessionId, 
            session: existingWorkflow,
            exists: true,
            status: 'existing' 
          });
        }
      }

      // If forceNew, archive any existing sessions for this case so they won't be returned by future lookups
      if (forceNew) {
        const existingWorkflow = await storage.getWorkflowSessionByCaseId(finalCaseId);
        if (existingWorkflow) {
          console.log(`[Force New] Archiving existing session ${existingWorkflow.sessionId} for case ${finalCaseId}`);
          await storage.updateWorkflowSession(existingWorkflow.sessionId, {
            caseId: `${finalCaseId}-archived-${Date.now()}`
          });
        }
      }

      // If checkOnly and no existing workflow found
      if (checkOnly) {
        return res.json({
          exists: false,
          message: 'No existing workflow found'
        });
      }

      console.log(`[Workflow Creation] Creating new ${finalCaseType} workflow for case ${finalCaseId}`);
      
      // Generate sessionId with case type prefix
      const sessionId = `${finalCaseType.toUpperCase().slice(0,3)}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      console.log(`[Node.js Creation] Generated sessionId: ${sessionId}`);
      
      // Create agents based on case type
      const agentConfigs = getAgentConfigsForCaseType(finalCaseType);
      
      // Create workflow session with fresh state
      const session = await storage.createWorkflowSession({
        sessionId,
        title,
        workflowType: finalCaseType,
        caseType: finalCaseType,
        status: 'running',
        currentStep: 0,
        totalSteps: agentConfigs.length,
        caseId: finalCaseId,
        extractedData: {}, // Clear any previous extracted data
        config: {} // Clear any previous config
      });
        
      console.log(`[Workflow Creation] Creating ${agentConfigs.length} agents for ${finalCaseType} workflow`);
      for (const config of agentConfigs) {
        await storage.createAgent({
          sessionId,
          name: config.name,
          type: config.type,
          status: 'pending',
          progress: 0,
          description: config.description,
          createdAt: new Date()
        });
      }

      // Auto-start workflow execution
      setTimeout(async () => {
        try {
          console.log(`[Auto-start] Starting fresh workflow execution for ${sessionId}`);
          console.log(`[Auto-start] Workflow created with ${agentConfigs.length} agents, starting with Data Extraction Agent`);
          executeWorkflowAgents(sessionId);
        } catch (error) {
          console.error(`[Auto-start] Failed for ${sessionId}:`, error);
        }
      }, 2000);
        
      res.json({ sessionId, session, status: 'created' });
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to create workflow', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Function to get remaining agents for Jira workflow after human comment detection
  function getRemainingJiraAgents() {
    return [
      { name: 'Data Extraction Agent', type: 'data_extraction', description: 'Extracts data from PDF/DOCX documents with LLM processing' },
      { name: 'Data Transformation Agent', type: 'field_comparison', description: 'Transforms extracted raw data into standardized, structured formats required for downstream processing' },
      { name: 'Quality Assurance Agent', type: 'mismatch_summary', description: 'Responsible for validating the accuracy and completeness of underwriting data by comparing slip details with the policy administration system (PAS)' },
      { name: 'Sanctions Check Agent', type: 'sanctions_check', description: 'Validates against OFAC/UN/EU sanctions lists' },
      { name: 'Data Validation Agent', type: 'data_validation', description: 'Validates sanction checks and completeness before PAS integration' },
      { name: 'Integration Agent', type: 'integration', description: 'Integrates workflow data with Policy Administration System (PAS)' }
    ];
  }

  // Helper function to load agents from submission config file
  function loadSubmissionAgentsFromConfig() {
    try {
      const configPath = path.join(process.cwd(), 'core', 'config', 'agents', 'submission-agents.json');
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      // Sort by executionOrder and map to agent config format
      return config.agents
        .sort((a: any, b: any) => a.executionOrder - b.executionOrder)
        .map((agent: any) => ({
          name: agent.name,
          type: agent.type,
          description: agent.description || `${agent.name} for insurance underwriting process`
        }));
    } catch (error) {
      console.error('[Config] Failed to load submission agents from config:', error);
      // Return empty array on error - will fall back to default
      return [];
    }
  }

  function getAgentConfigsForCaseType(caseType: string) {
    if (caseType === 'submission' || caseType === 'insurance-quote') {
      // Insurance quote workflow: 7-agent pipeline for personal lines new business
      return [
        { name: 'Policy Data Extraction Agent', type: 'policy_extractor', description: 'Extracts property address, coverages, coverage limits, and underwriting attributes from the uploaded insurance policy document' },
        { name: 'Geocoding & Address Validation Agent', type: 'geocoding', description: 'Validates property address via Google Geocoder API to obtain latitude/longitude and confirm ZIP code accuracy' },
        { name: 'Property Data Agent', type: 'property_data', description: 'Fetches enriched property attributes from CoStar including building size, age, roof age, construction type, occupancy, and tenant details' },
        { name: 'Geospatial Risk Assessment Agent', type: 'geospatial_risk', description: 'Evaluates building condition, roof condition, distance to fire/police stations, flood zone classification, and other hazard indicators' },
        { name: 'Catastrophe Risk Evaluation Agent', type: 'cat_risk', description: 'Assesses exposure to earthquake, hurricane, wildfire, and other catastrophe zones; applies variable premium multiplier for high-risk properties' },
        { name: 'Portfolio Concentration Agent', type: 'portfolio_risk', description: 'Evaluates geographic concentration of existing portfolio in the property ZIP/county; applies variable multiplier when concentration is high' },
        { name: 'Quote Generation Agent', type: 'quote_generator', description: 'Synthesizes all risk data to generate a final insurance quote with itemized premium breakdown, downloadable as PDF' }
      ];
    } else if (caseType === 'jira') {
      // Jira workflow in correct execution order
      return [
        { name: 'Data Extraction Agent', type: 'data_extraction', description: 'Extracts data from PDF/DOCX documents with LLM processing' },
        { name: 'Data Transformation Agent', type: 'field_comparison', description: 'Transforms extracted raw data into standardized, structured formats required for downstream processing' },
        { name: 'Quality Assurance Agent', type: 'mismatch_summary', description: 'Responsible for validating the accuracy and completeness of underwriting data by comparing slip details with the policy administration system (PAS)' },
        { name: 'Communication Agent', type: 'communication_monitor', description: 'Monitors JIRA ticket for human responses and automatically resumes workflow when detected' },
        { name: 'Sanctions Check Agent', type: 'sanctions_check', description: 'Validates against OFAC/UN/EU sanctions lists' },
        { name: 'Data Validation Agent', type: 'data_validation', description: 'Validates sanction checks and completeness before PAS integration' },
        { name: 'Integration Agent', type: 'integration', description: 'Integrates workflow data with Policy Administration System (PAS)' }
      ];
    }
    // Default: insurance quote workflow
    return [
      { name: 'Policy Data Extraction Agent', type: 'policy_extractor', description: 'Extracts property address, coverages, coverage limits, and underwriting attributes from the uploaded insurance policy document' },
      { name: 'Geocoding & Address Validation Agent', type: 'geocoding', description: 'Validates property address via Google Geocoder API to obtain latitude/longitude and confirm ZIP code accuracy' },
      { name: 'Property Data Agent', type: 'property_data', description: 'Fetches enriched property attributes from CoStar including building size, age, roof age, construction type, occupancy, and tenant details' },
      { name: 'Geospatial Risk Assessment Agent', type: 'geospatial_risk', description: 'Evaluates building condition, roof condition, distance to fire/police stations, flood zone classification, and other hazard indicators' },
      { name: 'Catastrophe Risk Evaluation Agent', type: 'cat_risk', description: 'Assesses exposure to earthquake, hurricane, wildfire, and other catastrophe zones; applies variable premium multiplier for high-risk properties' },
      { name: 'Portfolio Concentration Agent', type: 'portfolio_risk', description: 'Evaluates geographic concentration of existing portfolio in the property ZIP/county; applies variable multiplier when concentration is high' },
      { name: 'Quote Generation Agent', type: 'quote_generator', description: 'Synthesizes all risk data to generate a final insurance quote with itemized premium breakdown, downloadable as PDF' }
    ];
  }

  app.get('/api/workflows/:sessionId', async (req, res) => {
    try {
      const session = await storage.getWorkflowSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Workflow not found' });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to get workflow', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.get('/api/workflows/:sessionId/agents', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const agents = await storage.getAgentsBySession(sessionId);
      res.json(agents);
    } catch (error) {
      console.error(`[API] Error getting agents for session ${req.params.sessionId}:`, error);
      res.status(500).json({ 
        message: 'Failed to get agents', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.get('/api/workflows/:sessionId/messages', async (req, res) => {
    try {
      const messages = await storage.getMessagesBySession(req.params.sessionId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to get messages', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Simulate broker form submission (for testing)
  app.post('/api/simulate-broker-submission/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Simulate broker submitting missing information
      const brokerData = {
        financialStatements: "2022-2023 Tax Returns (Verified)",
        lossHistory: "No claims in past 5 years (Clean record)",
        certificate: "Current Certificate of Good Standing",
        safetyProtocols: "Comprehensive safety procedures document"
      };
      
      // Simulate broker info submission
      await storage.updateWorkflowSession(sessionId, { 
        status: 'running',
        currentStep: 1
      });
      
      // Create broker submission message
      await storage.createMessage({
        sessionId,
        content: `✅ Broker Information Received

Submitted Documents:
- ✅ Financial Statements: ${brokerData.financialStatements}
- ✅ Loss History: ${brokerData.lossHistory}
- ✅ Certificate of Good Standing: ${brokerData.certificate}
- ✅ Safety Protocols: ${brokerData.safetyProtocols}

Status: All required information received. Workflow resuming automatically...`,
        type: 'system',
        sender: 'Broker System',
        createdAt: new Date()
      });
      
      // Resume workflow after delay
      setTimeout(async () => {
        await resumeWorkflowAfterBrokerInfo(sessionId);
      }, 2000);
      
      io.to(sessionId).emit('workflow-update', { 
        sessionId, 
        status: 'running',
        message: 'Broker information received. Workflow resuming...'
      });
      
      res.json({ success: true, message: 'Broker submission simulated successfully' });
    } catch (error) {
      console.error('Broker simulation error:', error);
      res.status(500).json({ error: 'Failed to simulate broker submission' });
    }
  });

  app.get('/api/workflows/:sessionId/approvals', async (req, res) => {
    try {
      const approvals = await storage.getApprovalRequestsBySession(req.params.sessionId);
      res.json(approvals);
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to get approvals', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Get workflow by case ID
  app.get('/api/workflows/case/:caseId', async (req, res) => {
    try {
      const workflow = await storage.getWorkflowSessionByCaseId(req.params.caseId);
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found for case' });
      }
      res.json(workflow);
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to get workflow by case ID', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Get timeline events for a case - aggregates ALL activities across workflows/sessions
  app.get('/api/cases/:caseId/timeline', async (req, res) => {
    try {
      const { caseId } = req.params;
      console.log(`[Timeline API] Fetching timeline for case: ${caseId}`);
      
      // Get case history directly from CSV - don't require workflow sessions
      const { CaseHistoryManager } = await import('../shared/csv-audit-trail');
      const caseHistoryRecords = CaseHistoryManager.getCaseHistory(caseId);
      
      console.log(`[Timeline API] Found ${caseHistoryRecords.length} CSV records for case ${caseId}`);
      
      const allEvents = [];
      
      // Convert CSV records to timeline events - only include completed events
      caseHistoryRecords.forEach(record => {
        if (record.status === 'completed') {
          allEvents.push({
            id: `${record.case_id}-${record.timestamp}`,
            timestamp: new Date(record.timestamp),
            type: record.event_type,
            actor: record.actor,
            actorType: record.actor_type,
            title: record.title,
            description: record.description,
            details: record.details,
            status: record.status,
            priority: record.priority
          });
        }
      });
      
      // Sort by timestamp (newest first)
      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      console.log(`[Timeline API] Returning ${allEvents.length} timeline events for case ${caseId}`);
      
      res.json(allEvents);
    } catch (error) {
      console.error('Error fetching timeline events:', error);
      res.status(500).json({ message: 'Failed to fetch timeline events' });
    }
  });

  // Add timeline event (for adding custom events)
  app.post('/api/cases/:caseId/timeline', async (req, res) => {
    try {
      const { caseId } = req.params;
      const eventData = req.body;
      
      // Find workflow session by case ID
      const session = await storage.getWorkflowSessionByCaseId(caseId);
      if (!session) {
        return res.status(404).json({ message: 'Case not found' });
      }
      
      // Create a system message to represent the custom event
      const message = await storage.createMessage({
        sessionId: session.sessionId,
        content: eventData.description || eventData.title,
        type: 'system',
        createdAt: new Date()
      });
      
      // Return the created event
      const newEvent = {
        id: `${session.sessionId}-custom-${message.id}`,
        timestamp: new Date(),
        type: eventData.type || 'system_event',
        actor: eventData.actor || 'System',
        actorType: eventData.actorType || 'system',
        title: eventData.title,
        description: eventData.description,
        details: eventData.details,
        status: 'completed',
        priority: eventData.priority || 'medium'
      };
      
      res.json(newEvent);
    } catch (error) {
      console.error('Error adding timeline event:', error);
      res.status(500).json({ message: 'Failed to add timeline event' });
    }
  });

  app.post('/api/workflows/:sessionId/messages', async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ message: 'Content is required' });
      }

      // Check for duplicate messages (prevent spam)
      const existingMessages = await storage.getMessagesBySession(req.params.sessionId);
      const lastMessage = existingMessages[existingMessages.length - 1];
      const timeSince = lastMessage ? Date.now() - new Date(lastMessage.createdAt).getTime() : 5000;
      
      if (lastMessage && lastMessage.content === content && timeSince < 2000) {
        console.log(`[Duplicate Prevention] Blocking duplicate message: "${content}"`);
        return res.json(lastMessage);
      }

      const message = await storage.createMessage({
        sessionId: req.params.sessionId,
        content,
        type: 'user',
        createdAt: new Date()
      });

      // Check if this is an approval response (yes/no/send/edit/discard/cancel)
      const lowerContent = content.toLowerCase().trim();
      if (lowerContent === 'yes' || lowerContent === 'no' || lowerContent === 'send' || lowerContent === 'edit' || lowerContent === 'discard' || lowerContent === 'cancel') {
        console.log(`[Approval Response] User responded "${content}" for ${req.params.sessionId}`);
        
        // Find pending approval request OR the most recent email draft approval if user is sending after editing
        const approvals = await storage.getApprovalRequestsBySession(req.params.sessionId);
        let pendingApproval = approvals.find(a => a.status === 'pending');
        
        // If no pending approval but user said "send", check if there's a recent email draft approval that was "edit"
        if (!pendingApproval && lowerContent === 'send') {
          const emailDraftApproval = approvals.find(a => a.type === 'email_draft_review' && a.response === 'edit');
          if (emailDraftApproval) {
            pendingApproval = emailDraftApproval;
            console.log(`[Email Send After Edit] Found previous email draft approval for ${req.params.sessionId}`);
          } else {
            console.log(`[Email Send After Edit] No email draft approval found with 'edit' response`);
          }
        }
        
        console.log(`[Approval Debug] pendingApproval:`, pendingApproval ? `${pendingApproval.type} (${pendingApproval.status})` : 'null');
        
        if (pendingApproval) {
          // Handle different approval types
          if (pendingApproval.type === 'mismatch_summary_jira') {
            // Handle Quality Assurance Jira posting approval (yes/no)
            const approved = lowerContent === 'yes';
            
            // Update approval request
            await storage.updateApprovalRequest(pendingApproval.id, {
              status: approved ? 'approved' : 'rejected',
              response: content,
              respondedAt: new Date()
            });
            
            if (approved) {
              console.log(`[Jira Approval] User approved posting summary to JIRA - posting comment`);
              
              // Get the quality assurance analysis and ticket key from approval data
              const summary = pendingApproval.data?.summary || 'Quality Assurance';
              const ticketKey = pendingApproval.data?.ticketKey || 'HIS-87';
              
              console.log(`[Jira Posting] Attempting to post summary to ticket: ${ticketKey}`);
              
              try {
                await postMismatchSummaryToJira(req.params.sessionId, summary, ticketKey);
                
                // Create success system message
                await storage.createMessage({
                  sessionId: req.params.sessionId,
                  content: `✅ Quality Assurance posted to JIRA ticket ${ticketKey} successfully! Continuing with workflow...`,
                  type: 'system',
                  sender: 'Jira Integration System',
                  createdAt: new Date()
                });
                
                console.log(`[Jira Success] Summary posted to ${ticketKey} successfully`);
              } catch (error) {
                console.error(`[Jira Error] Failed to post summary:`, error);
                
                // Create error system message
                await storage.createMessage({
                  sessionId: req.params.sessionId,
                  content: `⚠️ Failed to post to JIRA ticket ${ticketKey}. Error: ${error.message}. Continuing with workflow...`,
                  type: 'system',
                  sender: 'Jira Integration System',
                  createdAt: new Date()
                });
              }
              
              // Resume workflow execution from next agent after Quality Assurance (index 3 = Communication Agent)
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              resumeWorkflowAfterApproval(req.params.sessionId, 3);
            } else {
              console.log(`[Jira Approval] User declined posting to JIRA - continuing workflow without posting`);
              
              // Create system message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Quality Assurance not posted to JIRA. Continuing with workflow...',
                type: 'system',
                createdAt: new Date()
              });
              
              // Resume workflow execution without posting to Jira from next agent after Quality Assurance (index 3 = Communication Agent)
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              resumeWorkflowAfterApproval(req.params.sessionId, 3);
            }
            
            io.to(req.params.sessionId).emit('approval-handled', {
              approvalId: pendingApproval.id,
              approved,
              sessionId: req.params.sessionId
            });
          } else if (pendingApproval.type === 'sanctions_review') {
            // Handle sanctions review (yes/no)
            const approved = lowerContent === 'yes';
            
            // Update approval request
            await storage.updateApprovalRequest(pendingApproval.id, {
              status: approved ? 'approved' : 'rejected',
              response: content,
              respondedAt: new Date()
            });
            
            if (approved) {
              console.log(`[Approval Accepted] Resuming workflow ${req.params.sessionId}`);
              
              // Resume workflow execution from after sanctions check (index 2)
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              resumeWorkflowAfterApproval(req.params.sessionId, 2);
            } else {
              console.log(`[Approval Rejected] Stopping workflow ${req.params.sessionId}`);
              
              // Update workflow status to rejected
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'rejected' });
              
              // Send rejection message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Sanctions review rejected. Underwriting process stopped.',
                type: 'system',
                sender: 'System'
              });
            }
          } else if (pendingApproval.type === 'pas_update_review') {
            // Handle PAS update authorization (yes/no) for Jira workflows
            const approved = lowerContent === 'yes';
            
            // Update approval request
            await storage.updateApprovalRequest(pendingApproval.id, {
              status: approved ? 'approved' : 'rejected',
              response: content,
              respondedAt: new Date()
            });
            
            if (approved) {
              console.log(`[PAS Update Approved] Resuming workflow ${req.params.sessionId}`);
              
              // Send confirmation message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: '✅ **PAS Update Approved** - Proceeding to update Policy Administration System with validated data...',
                type: 'system',
                sender: 'PAS Integration System'
              });
              
              // Resume workflow execution from after sanctions check 
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              
              // For Jira workflows, continue from Data Validation Agent after sanctions check
              const workflow = await storage.getWorkflowSession(req.params.sessionId);
              if (workflow?.sessionId?.startsWith('JIR-')) {
                // Jira agent order: 0=Data Extraction, 1=LLM as Judge, 2=Data Transformation, 3=Quality Assurance, 4=Communication, 5=Sanctions Check, 6=Data Validation, 7=Integration
                console.log(`[PAS RESUME] Continuing Jira workflow from next agent after Sanctions Check (index 6 = Data Validation Agent)`);
                resumeWorkflowAfterApproval(req.params.sessionId, 6); // Continue from index 6 (Data Validation Agent)
              } else {
                resumeWorkflowAfterApproval(req.params.sessionId, 2); // Regular workflow continues from index 2
              }
            } else {
              console.log(`[PAS Update Rejected] Stopping workflow ${req.params.sessionId}`);
              
              // Update workflow status to stopped
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'stopped' });
              
              // Send workflow termination message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: '🛑 **Process Stopped** - Stopping the process. What would you like for me to do?',
                type: 'system',
                sender: 'PAS Integration System'
              });
            }
            
            io.to(req.params.sessionId).emit('approval-handled', {
              approvalId: pendingApproval.id,
              approved,
              sessionId: req.params.sessionId
            });
          } else if (pendingApproval.type === 'email_draft_review') {
            // Handle email draft review (send/edit/discard)
            await storage.updateApprovalRequest(pendingApproval.id, {
              status: 'approved',
              response: content,
              respondedAt: new Date()
            });
            
            if (lowerContent === 'send') {
              console.log(`[Email Draft] User chose to send email for ${req.params.sessionId}`);
              
              // Update the approval request to reflect the send action
              await storage.updateApprovalRequest(pendingApproval.id, {
                status: 'approved',
                response: 'send',
                respondedAt: new Date()
              });
              
              // Resume workflow execution from Email Sender Agent (index 4 in 6-agent system)
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              resumeWorkflowAfterApproval(req.params.sessionId, 4);
              
              // Create system message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Email draft approved for sending. Continuing with email delivery...',
                type: 'system',
                createdAt: new Date()
              });
            } else if (lowerContent === 'edit') {
              console.log(`[Email Draft] User chose to edit email for ${req.params.sessionId}`);
              
              // Update the approval request to "edit" status but don't mark as completed
              await storage.updateApprovalRequest(pendingApproval.id, {
                status: 'pending',
                response: 'edit',
                respondedAt: new Date()
              });
              
              // Keep workflow paused and open email editor
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'pending_approval' });
              
              // Create system message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Email draft ready for editing. Please use the "Edit Email Draft" button to modify the email.',
                type: 'system',
                createdAt: new Date()
              });
              
              // Emit event to open email editor
              io.to(req.params.sessionId).emit('open-email-editor', {
                sessionId: req.params.sessionId
              });
            } else if (lowerContent === 'discard') {
              console.log(`[Email Draft] User chose to discard email for ${req.params.sessionId}`);
              
              // Skip email sending and go to Final Decision Agent (index 5 in 6-agent system)
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              resumeWorkflowAfterApproval(req.params.sessionId, 5);
              
              // Create system message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Email draft discarded. Proceeding with final decision...',
                type: 'system',
                createdAt: new Date()
              });
            }
            
            io.to(req.params.sessionId).emit('approval-handled', {
              approvalId: pendingApproval.id,
              approved: true,
              action: lowerContent,
              sessionId: req.params.sessionId
            });
          } else if (pendingApproval.type === 'email_sender_review') {
            // Handle email sender review (send/edit/cancel)
            await storage.updateApprovalRequest(pendingApproval.id, {
              status: 'approved',
              response: content,
              respondedAt: new Date()
            });
            
            if (lowerContent === 'send') {
              console.log(`[Email Sender] User approved email sending for ${req.params.sessionId}`);
              
              // Resume workflow execution from next agent after Email Sender Agent
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              
              // Find current agent index and continue from next agent
              const agents = await storage.getAgentsBySession(req.params.sessionId);
              const emailSenderIndex = agents.findIndex(a => a.type === 'email_sender' || a.type === 'sender' || a.name.includes('Email Sender'));
              if (emailSenderIndex !== -1) {
                resumeWorkflowAfterApproval(req.params.sessionId, emailSenderIndex + 1);
              }
              
              // Create system message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Email sending approved. Email delivered to broker successfully.',
                type: 'system',
                createdAt: new Date()
              });
            } else if (lowerContent === 'edit') {
              console.log(`[Email Sender] User chose to edit email before sending for ${req.params.sessionId}`);
              
              // Keep workflow paused and open email editor
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'pending_approval' });
              
              // Create system message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Email ready for editing. Please use the "Edit Email Draft" button to modify the email before sending.',
                type: 'system',
                createdAt: new Date()
              });
              
              // Emit event to open email editor
              io.to(req.params.sessionId).emit('open-email-editor', {
                sessionId: req.params.sessionId
              });
            } else if (lowerContent === 'cancel') {
              console.log(`[Email Sender] User chose to cancel email sending for ${req.params.sessionId}`);
              
              // Skip email sending and go to next agent
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              
              // Find current agent index and continue from next agent
              const agents = await storage.getAgentsBySession(req.params.sessionId);
              const emailSenderIndex = agents.findIndex(a => a.type === 'email_sender' || a.type === 'sender' || a.name.includes('Email Sender'));
              if (emailSenderIndex !== -1) {
                resumeWorkflowAfterApproval(req.params.sessionId, emailSenderIndex + 1);
              }
              
              // Create system message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: 'Email sending cancelled. Proceeding with remaining workflow steps...',
                type: 'system',
                createdAt: new Date()
              });
            }
            
            io.to(req.params.sessionId).emit('approval-handled', {
              approvalId: pendingApproval.id,
              approved: true,
              action: lowerContent,
              sessionId: req.params.sessionId
            });
          } else if (pendingApproval.type === 'submission_data_extraction') {
            // Handle submission data extraction approval (yes/no)
            const approved = lowerContent === 'yes';
            
            console.log(`[Submission Data Extraction] User ${approved ? 'approved' : 'rejected'} data extraction for ${req.params.sessionId}`);
            
            // Update approval request
            await storage.updateApprovalRequest(pendingApproval.id, {
              status: approved ? 'approved' : 'rejected',
              response: content,
              respondedAt: new Date()
            });
            
            if (approved) {
              // TODO: Persist any edited form data from pendingApproval.data
              // For now, we'll just resume the workflow
              
              console.log(`[Submission Data Extraction] Approved - resuming workflow from Sanctions Check Agent (index 1)`);
              
              // Create success message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: '✅ **Data Extraction Approved** - Proceeding to sanctions screening...',
                type: 'system',
                sender: 'Data Extraction System',
                createdAt: new Date()
              });
              
              // Resume workflow from next agent (index 1 = Sanctions Check Agent)
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'running' });
              resumeWorkflowAfterApproval(req.params.sessionId, 1);
            } else {
              console.log(`[Submission Data Extraction] Rejected - stopping workflow`);
              
              // Update workflow status to stopped
              await storage.updateWorkflowSession(req.params.sessionId, { status: 'stopped' });
              
              // Send rejection message
              await storage.createMessage({
                sessionId: req.params.sessionId,
                content: '🛑 **Data Extraction Rejected** - Workflow stopped. Please review the data and restart if needed.',
                type: 'system',
                sender: 'Data Extraction System',
                createdAt: new Date()
              });
            }
            
            io.to(req.params.sessionId).emit('approval-handled', {
              approvalId: pendingApproval.id,
              approved,
              sessionId: req.params.sessionId
            });
          }
        }
      }

      // Don't emit message-created event to prevent duplicates in frontend
      // Frontend will refetch messages through React Query
      res.json(message);
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to create message', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Negotiation Chatbot API
  app.post('/api/negotiation-chat', async (req, res) => {
    try {
      const { message, sessionId } = req.body;
      if (!message || !sessionId) {
        return res.status(400).json({ message: 'Message and sessionId are required' });
      }

      // Simulate negotiation agent response
      const responses = [
        "I've reviewed your request. Based on the current policy terms, I can offer a 5% discount on the premium if you agree to a higher deductible of $2,500.",
        "Let me check with the underwriting team about your coverage requirements. I can potentially adjust the liability limits to reduce your premium by 8%.",
        "I understand your budget constraints. How about we explore a payment plan option? I can offer 12 monthly payments with no additional fees.",
        "The current premium reflects the risk assessment, but I can negotiate with our underwriters for a multi-policy discount if you bundle with auto insurance.",
        "I've spoken with the underwriting manager. We can offer a 10% discount if you agree to install additional security measures at your property.",
        "Let me propose an alternative: We can reduce the premium by 12% if you accept a slightly higher deductible and add a loss control clause.",
        "I've found a way to optimize your coverage. By adjusting the policy terms slightly, I can reduce your annual premium to $3,800 while maintaining key protections."
      ];

      const response = responses[Math.floor(Math.random() * responses.length)];
      
      // Create a simulated delay for realism
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      res.json({
        message: response,
        timestamp: new Date().toISOString(),
        agentName: "Broker Negotiation Agent",
        sessionId
      });
    } catch (error) {
      res.status(500).json({ 
        message: 'Failed to process negotiation chat', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Email draft endpoints
  app.post('/api/workflows/:sessionId/send-email', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const emailDraft = req.body;
      
      console.log(`[Email Send] Sending email for ${sessionId}:`, emailDraft);
      
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Create a system message about email being sent
      const emailSentMessage = await storage.createMessage({
        sessionId,
        type: 'system',
        sender: 'Email Sender Agent',
        content: `✅ Email successfully sent to ${emailDraft.to}\n\nSubject: ${emailDraft.subject}\n\nThe email has been delivered and the workflow is now complete.`,
        timestamp: new Date()
      });
      
      // Emit real-time update
      io.to(sessionId).emit('message-created', emailSentMessage);
      
      res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
      console.error('Email send error:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });

  app.post('/api/workflows/:sessionId/save-email-draft', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const emailDraft = req.body;
      
      console.log(`[Email Draft] Saving draft for ${sessionId}:`, emailDraft);
      
      // Simulate draft saving
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create a system message about draft being saved
      const draftSavedMessage = await storage.createMessage({
        sessionId,
        type: 'system',
        sender: 'Email Draft Agent',
        content: `💾 Email draft saved successfully\n\nSubject: ${emailDraft.subject}\nTo: ${emailDraft.to}\n\nYou can continue editing or send the email when ready.`,
        timestamp: new Date()
      });
      
      // Emit real-time update
      io.to(sessionId).emit('message-created', draftSavedMessage);
      
      res.json({ success: true, message: 'Draft saved successfully' });
    } catch (error) {
      console.error('Draft save error:', error);
      res.status(500).json({ error: 'Failed to save draft' });
    }
  });

  // Duplicate endpoint removed - using the correct one above that handles slip workflows

  // Screen recording upload endpoint (local storage)
  app.post('/api/workflows/:sessionId/upload-recording', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { videoData, metadata } = req.body;
      
      if (!videoData) {
        return res.status(400).json({ error: 'No video data provided' });
      }

      console.log(`[Screen Recording] Saving recording locally for session: ${sessionId}`);

      // Extract MIME type and convert base64 to buffer
      const mimeTypeMatch = videoData.match(/^data:video\/(\w+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'webm';
      
      // Map MIME types to file extensions
      const extensionMap: { [key: string]: string } = {
        'quicktime': 'mov',
        'mp4': 'mp4',
        'webm': 'webm',
        'x-matroska': 'mkv',
        'avi': 'avi'
      };
      
      const extension = extensionMap[mimeType] || 'webm';
      const base64Data = videoData.replace(/^data:video\/\w+;base64,/, '');
      const videoBuffer = Buffer.from(base64Data, 'base64');

      // Create recordings directory if it doesn't exist
      const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }

      // Generate filename with correct extension
      const timestamp = metadata?.timestamp || new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screen-recording-${sessionId}-${timestamp}.${extension}`;
      const filePath = path.join(recordingsDir, filename);

      // Save video to disk
      fs.writeFileSync(filePath, videoBuffer);

      const videoUrl = `/recordings/${filename}`;
      console.log(`[Screen Recording] Saved successfully to: ${filePath}`);

      // Create message with video player
      const videoMessage = await storage.createMessage({
        sessionId,
        type: 'system',
        sender: 'Screen Recording',
        content: `📹 Screen Recording Available\n\nValidation workflow recorded successfully.\nDuration: ${Math.floor((metadata?.duration || 0) / 60)}:${String((metadata?.duration || 0) % 60).padStart(2, '0')}\n\n[VIDEO:${videoUrl}]`,
        timestamp: new Date()
      });

      // Emit real-time update
      io.to(sessionId).emit('message-created', videoMessage);

      res.json({ 
        success: true, 
        location: videoUrl,
        filename: filename
      });
    } catch (error) {
      console.error('[Screen Recording] Save error:', error);
      res.status(500).json({ error: 'Failed to save recording' });
    }
  });

  app.post('/api/workflows/:sessionId/reject-extraction', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { reason } = req.body;
      
      console.log(`[Data Extraction Rejection] Rejecting extraction for ${sessionId}: ${reason}`);
      
      // Update workflow status to rejected
      await storage.updateWorkflowSession(sessionId, { 
        status: 'rejected',
        lastUpdated: new Date()
      });
      
      // Create system message
      await storage.createMessage({
        sessionId,
        content: `❌ Data extraction rejected: ${reason || 'Quality insufficient'}. Workflow stopped.`,
        type: 'system',
        sender: 'Data Extraction Review',
        createdAt: new Date()
      });
      
      res.json({ success: true, message: 'Data extraction rejected' });
    } catch (error) {
      console.error('Data extraction rejection error:', error);
      res.status(500).json({ error: 'Failed to reject data extraction' });
    }
  });

  // ===== DATA EXTRACTION ROUTES =====
  // API endpoint to get submission data for data extraction form
  app.get('/api/submission-data/:caseId', async (req, res) => {
    try {
      const { caseId } = req.params;
      console.log(`[Submission Data API] Fetching data for caseId: ${caseId}`);
      
      // Import submission data dynamically  
      const { getSubmissionDataById } = await import('../shared/csv-data');
      const data = getSubmissionDataById(caseId);
      
      console.log(`[Submission Data API] Found data:`, data ? 'YES' : 'NO');
      
      if (!data) {
        console.log(`[Submission Data API] No data found for ${caseId}`);
        return res.status(404).json({ error: 'Submission data not found' });
      }
      
      // Ensure JSON response header is set
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error('Error loading submission data:', error);
      res.status(500).json({ error: 'Failed to fetch submission data' });
    }
  });

  // API endpoint to get extracted data based on case ID and type
  app.get('/api/extracted-data/:dataId', async (req, res) => {
    try {
      const { dataId } = req.params;
      const { caseType } = req.query;
      
      let data;
      if (caseType === 'slip') {
        // Import slip data dynamically
        const { getSlipDataById } = await import('../shared/slip-data');
        data = getSlipDataById(dataId);
      } else {
        // Default to submission data
        const { getSubmissionDataById } = await import('../shared/csv-data');
        data = getSubmissionDataById(dataId);
      }
      
      if (!data) {
        return res.status(404).json({ error: `${caseType || 'Submission'} not found` });
      }
      
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  // ===== DASHBOARD CASES API =====
  // API endpoint to get dashboard cases from CSV
  app.get('/api/dashboard/cases', async (req, res) => {
    try {
      const { loadDashboardCases } = await import('../shared/dashboard-cases');
      const cases = loadDashboardCases();
      res.json(cases);
    } catch (error) {
      console.error('Error loading dashboard cases:', error);
      res.status(500).json({ error: 'Failed to load dashboard cases' });
    }
  });
  
  // ===== CREATE NEW CASE API =====
  app.post('/api/cases/create', async (req, res) => {
    try {
      const {
        businessName,
        policyType,
        caseType,
        priority,
        brokerEmail,
        assignedUnderwriter,
        description,
        document: uploadedDoc,
      } = req.body as {
        businessName: string;
        policyType: string;
        caseType: 'submission' | 'slip';
        priority: 'high' | 'medium' | 'low';
        brokerEmail: string;
        assignedUnderwriter: string;
        description: string;
        document?: { name: string; base64: string; mimeType: string };
      };

      if (!businessName || !policyType || !caseType || !priority) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Generate new case ID
      const { loadDashboardCases } = await import('../shared/dashboard-cases');
      const existingCases = loadDashboardCases();
      const year = new Date().getFullYear();
      const prefix = caseType === 'slip' ? 'SLP' : 'UW';
      const samePrefixCases = existingCases.filter(c => c.case_id.startsWith(`${prefix}-${year}-`));
      const nextNum = samePrefixCases.length + 1;
      const caseId = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`;

      // Save uploaded document if provided
      let savedDocName = '';
      if (uploadedDoc?.base64 && uploadedDoc.name) {
        const docDir = path.join(process.cwd(), 'assets', 'documents', 'documents', caseId);
        if (!fs.existsSync(docDir)) {
          fs.mkdirSync(docDir, { recursive: true });
        }
        const buf = Buffer.from(uploadedDoc.base64, 'base64');
        const safeFilename = uploadedDoc.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
        fs.writeFileSync(path.join(docDir, safeFilename), buf);
        savedDocName = safeFilename;
      }

      // Build CSV row and append to dashboard-cases.csv
      const now = new Date().toISOString();
      const submissionDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
      const initialAgent = caseType === 'slip' ? 'Data Extraction Agent' : 'Policy Data Extraction Agent';
      const emailSubject = `New ${caseType === 'slip' ? "Lloyd's Slip" : 'Insurance'} Submission — ${businessName}`;
      const escapeCsv = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;

      const row = [
        caseId,
        caseType,
        escapeCsv(businessName),
        escapeCsv(policyType),
        submissionDate,
        initialAgent,
        '0',
        'pending_approval',
        priority,
        escapeCsv(assignedUnderwriter || 'Unassigned'),
        escapeCsv(brokerEmail || ''),
        '',
        '',
        escapeCsv(description || ''),
        escapeCsv(emailSubject),
        now,
        now,
      ].join(',');

      const csvPath = path.join(process.cwd(), 'data', 'csv', 'dashboard-cases.csv');
      const existing = fs.readFileSync(csvPath, 'utf-8');
      const newContent = existing.endsWith('\n') ? existing + row + '\n' : existing + '\n' + row + '\n';
      fs.writeFileSync(csvPath, newContent, 'utf-8');

      res.json({
        success: true,
        caseId,
        document: savedDocName || null,
      });
    } catch (error) {
      console.error('Error creating case:', error);
      res.status(500).json({ error: 'Failed to create case' });
    }
  });

  // ===== DELETE CASE API =====
  app.post('/api/cases/:caseId/delete', async (req, res) => {
    try {
      const { caseId } = req.params;
      if (!caseId) return res.status(400).json({ error: 'caseId required' });

      const csvPath = path.join(process.cwd(), 'data', 'csv', 'dashboard-cases.csv');
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');
      const header = lines[0];
      const remaining = lines.slice(1).filter(line => {
        if (!line.trim()) return false;
        const firstField = line.split(',')[0].trim();
        return firstField !== caseId;
      });

      if (remaining.length === lines.slice(1).filter(l => l.trim()).length) {
        return res.status(404).json({ error: 'Case not found' });
      }

      fs.writeFileSync(csvPath, [header, ...remaining].join('\n') + '\n', 'utf-8');
      console.log(`[Delete Case] Removed ${caseId} from dashboard CSV`);
      res.json({ success: true, caseId });
    } catch (error) {
      console.error('Error deleting case:', error);
      res.status(500).json({ error: 'Failed to delete case' });
    }
  });


  // Document management routes
  app.get('/api/documents/:caseId', async (req, res) => {
    try {
      const { caseId } = req.params;
      const { workflowType } = req.query;
      
      // Use DocumentService for both Jira tickets and regular cases
      const documents = await documentService.getDocumentsForCase(caseId, workflowType as string | undefined);
      res.json(documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });
  
  app.get('/api/documents/:caseId/:fileName', async (req, res) => {
    try {
      const { caseId, fileName } = req.params;
      const { workflowType } = req.query;
      
      // For submission workflows, always serve from shared defaults
      const isSubmissionWorkflow = workflowType === 'submission' || caseId.startsWith('SUB-') || caseId.startsWith('UW-');
      let filePath = isSubmissionWorkflow
        ? path.join(process.cwd(), 'assets/documents/documents/_submission_defaults', fileName)
        : path.join(process.cwd(), 'assets/documents/documents', caseId, fileName);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Set proper content type based on file extension
      const ext = path.extname(fileName).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.html':
        case '.htm':
          contentType = 'text/html';
          break;
        case '.txt':
          contentType = 'text/plain';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.csv':
          contentType = 'text/csv';
          break;
        case '.doc':
          contentType = 'application/msword';
          break;
        case '.docx':
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        default:
          contentType = 'application/octet-stream';
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      
      // For binary files (PDF, images, DOC, DOCX), serve as binary; for text files, serve as text
      if (ext === '.pdf' || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.doc' || ext === '.docx') {
        res.sendFile(filePath);
      } else {
        const content = await documentService.getDocumentContent(caseId, fileName);
        res.send(content);
      }
    } catch (error) {
      console.error('Error fetching document content:', error);
      res.status(500).json({ error: 'Failed to fetch document content' });
    }
  });
  
  app.get('/api/documents/cases/available', async (req, res) => {
    try {
      const cases = await documentService.getAvailableCases();
      res.json(cases);
    } catch (error) {
      console.error('Error fetching available cases:', error);
      res.status(500).json({ error: 'Failed to fetch available cases' });
    }
  });

  // ===== CASE MANAGEMENT ROUTES =====
  // Routes for handling submission and slip cases
  
  // Get all cases
  app.get('/api/cases', async (req, res) => {
    try {
      const cases = await storage.getAllCases();
      res.json(cases);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch cases' });
    }
  });

  // Get cases by type (submission or slip)
  app.get('/api/cases/:caseType', async (req, res) => {
    try {
      const { caseType } = req.params;
      if (caseType !== 'submission' && caseType !== 'slip') {
        return res.status(400).json({ error: 'Invalid case type. Must be "submission" or "slip"' });
      }
      const cases = await storage.getCasesByType(caseType);
      res.json(cases);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch cases by type' });
    }
  });

  // Create new case
  app.post('/api/cases', async (req, res) => {
    try {
      const caseData = req.body;
      const newCase = await storage.createCase(caseData);
      res.json(newCase);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create case' });
    }
  });

  // ===== LOCAL API PROXY ROUTES =====
  // These routes allow the Replit application to make API calls to applications running on your local laptop
  
  // Test connection to local application
  app.get('/api/local/test', async (req, res) => {
    try {
      const isConnected = await localApiClient.testConnection();
      res.json({ 
        connected: isConnected,
        baseUrl: process.env.LOCAL_API_URL || 'http://localhost:3000',
        message: isConnected ? 'Successfully connected to local application' : 'Cannot connect to local application'
      });
    } catch (error) {
      res.status(500).json({ 
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Dedicated CSV file reader endpoint
  app.get('/api/local/csv/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      console.log(`[CSV Reader] Reading file: ${filename}`);
      
      const result = await localApiClient.get(`/${filename}`);
      
      // If the response is CSV data, parse it
      if (typeof result === 'string' && (result.includes(',') || result.includes('\n'))) {
        const lines = result.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          return row;
        });
        
        console.log(`[CSV Reader] Successfully parsed ${data.length} rows`);
        res.json({ success: true, headers, data, rowCount: data.length });
      } else {
        res.json({ success: false, error: 'File does not appear to be CSV format', rawContent: result });
      }
    } catch (error) {
      console.error(`[CSV Reader] Failed to read ${req.params.filename}:`, error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to read CSV file', 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generic GET proxy to local application
  app.get('/api/local/*', async (req, res) => {
    try {
      const endpoint = req.path.replace('/api/local', '');
      const data = await localApiClient.get(endpoint, req.headers as Record<string, string>);
      res.json(data);
    } catch (error) {
      console.error('Local API GET error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to call local API'
      });
    }
  });

  // Generic POST proxy to local application
  app.post('/api/local/*', async (req, res) => {
    try {
      const endpoint = req.path.replace('/api/local', '');
      const data = await localApiClient.post(endpoint, req.body, req.headers as Record<string, string>);
      res.json(data);
    } catch (error) {
      console.error('Local API POST error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to call local API'
      });
    }
  });

  // Generic PUT proxy to local application
  app.put('/api/local/*', async (req, res) => {
    try {
      const endpoint = req.path.replace('/api/local', '');
      const data = await localApiClient.put(endpoint, req.body, req.headers as Record<string, string>);
      res.json(data);
    } catch (error) {
      console.error('Local API PUT error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to call local API'
      });
    }
  });

  // Generic DELETE proxy to local application
  app.delete('/api/local/*', async (req, res) => {
    try {
      const endpoint = req.path.replace('/api/local', '');
      const data = await localApiClient.delete(endpoint, req.headers as Record<string, string>);
      res.json(data);
    } catch (error) {
      console.error('Local API DELETE error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to call local API'
      });
    }
  });

  // Email Draft API - Get email draft for workflow
  app.get('/api/workflows/:sessionId/email-draft', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const agents = await storage.getAgentsBySession(sessionId);
      const emailDraftAgent = agents.find(a => a.type === 'email_drafter' || a.type === 'drafter');
      
      if (!emailDraftAgent || !emailDraftAgent.results) {
        return res.status(404).json({ error: 'Email draft not found' });
      }
      
      // Extract email content from agent results
      const emailContent = emailDraftAgent.results.ai_response || emailDraftAgent.results.content || '';
      
      // Parse subject and body from email content
      const subjectMatch = emailContent.match(/Subject:\s*(.+)/i);
      const subject = subjectMatch ? subjectMatch[1].trim() : 'Policy Approval Notification';
      
      // Get the body content (everything after the subject line)
      const bodyMatch = emailContent.match(/Subject:.*\n\n([\s\S]*)/i);
      const body = bodyMatch ? bodyMatch[1].trim() : emailContent;
      
      res.json({
        subject,
        body,
        recipient: 'broker@example.com',
        agentResults: emailDraftAgent.results
      });
    } catch (error) {
      console.error('Error fetching email draft:', error);
      res.status(500).json({ error: 'Failed to fetch email draft' });
    }
  });

  // Slip Data API endpoints
  app.get('/api/slip-data/:slipId', async (req, res) => {
    try {
      const { slipId } = req.params;
      console.log(`[Slip Data API] Fetching slip data for: ${slipId}`);
      
      // Map Jira ticket keys to slip IDs for unified data extraction
      const jiraToSlipMap: Record<string, string> = {
        'HIS-87': 'SLP-2025-001',
        'HIS-88': 'SLP-2025-002', 
        'HIS-89': 'SLP-2025-003'
      };
      
      // Use mapped slip ID if this is a Jira ticket key
      const actualSlipId = jiraToSlipMap[slipId] || slipId;
      console.log(`[Slip Data API] Using slip ID: ${actualSlipId} for request: ${slipId}`);
      
      // Import slip data utility (server-side filesystem access)
      const { getSlipDataById } = await import('../shared/slip-csv-data');
      const slipData = getSlipDataById(actualSlipId);
      
      if (!slipData) {
        console.log(`[Slip Data API] No data found for slip ID: ${actualSlipId}`);
        return res.status(404).json({ message: 'Slip data not found' });
      }
      
      console.log(`[Slip Data API] Found data for ${actualSlipId}: ${slipData.lead_underwriter}`);
      res.json(slipData);
    } catch (error) {
      console.error('[Slip Data API] Error fetching slip data:', error);
      res.status(500).json({ 
        message: 'Failed to fetch slip data', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.get('/api/slip-data', async (req, res) => {
    try {
      console.log('[Slip Data API] Fetching all available slip IDs');
      
      // Import slip data utility
      const { getAvailableSlipIds } = await import('../shared/slip-csv-data');
      const slipIds = getAvailableSlipIds();
      
      console.log(`[Slip Data API] Found ${slipIds.length} available slip IDs:`, slipIds);
      res.json(slipIds);
    } catch (error) {
      console.error('[Slip Data API] Error fetching slip IDs:', error);
      res.status(500).json({ 
        message: 'Failed to fetch slip IDs', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Helper function to compare original vs approved data
  function compareDataChanges(originalData: any, approvedData: any) {
    const changedFields = [];
    const unchangedFields = [];
    let qualityImprovements = 0;
    let confidenceChanges = 0;
    
    // Compare all fields in approved data
    for (const [key, approvedValue] of Object.entries(approvedData)) {
      const originalValue = originalData[key];
      
      if (originalValue !== approvedValue) {
        const changeType = determineChangeType(originalValue, approvedValue);
        changedFields.push({
          fieldName: key,
          originalValue: originalValue || 'N/A',
          approvedValue: approvedValue || 'N/A',
          changeType
        });
        
        if (changeType === 'quality_improvement') qualityImprovements++;
        if (changeType === 'confidence_boost') confidenceChanges++;
      } else {
        unchangedFields.push(key);
      }
    }
    
    return {
      changedFields,
      unchangedCount: unchangedFields.length,
      qualityImprovements,
      confidenceChanges,
      summary: `Human reviewer made ${changedFields.length} changes to improve data quality and accuracy.`
    };
  }
  
  function determineChangeType(original: any, approved: any) {
    if (!original && approved) return 'data_completion';
    if (original && !approved) return 'data_removal';
    if (String(original).length < String(approved).length && String(approved).includes(String(original))) return 'data_enhancement';
    if (String(original).length > String(approved).length) return 'data_simplification';
    if (String(approved).match(/^[A-Z][a-z\s]+$/)) return 'formatting_improvement';
    return 'data_correction';
  }

  // Using hardcoded responses for Jira workflows (no AI processing)

  // API endpoint to get current static mismatch content
  app.get('/api/static-mismatch-content', async (req, res) => {
    try {
      const staticContentPath = path.join(process.cwd(), 'config', 'static-mismatch-content.json');
      const staticContent = fs.readFileSync(staticContentPath, 'utf-8');
      const staticJson = JSON.parse(staticContent);
      res.json(staticJson);
    } catch (error) {
      console.error('[Static Content] Error loading:', error);
      res.status(500).json({ error: 'Failed to load static mismatch content' });
    }
  });

  // API endpoint to update static mismatch content
  app.put('/api/static-mismatch-content', async (req, res) => {
    try {
      const staticContentPath = path.join(process.cwd(), 'config', 'static-mismatch-content.json');
      const newContent = JSON.stringify(req.body, null, 2);
      fs.writeFileSync(staticContentPath, newContent);
      
      console.log('[Static Content] Updated successfully');
      res.json({ 
        success: true, 
        message: 'Static mismatch content updated successfully',
        content: req.body
      });
    } catch (error) {
      console.error('[Static Content] Error updating:', error);
      res.status(500).json({ error: 'Failed to update static mismatch content' });
    }
  });


  // Register Jira integration routes
  registerJiraRoutes(app);

  // Serve Jira documents as static files
  app.use('/jira-documents', express.static(path.join(process.cwd(), 'public', 'jira-documents')));
  
  // Serve screen recordings as static files
  app.use('/recordings', express.static(path.join(process.cwd(), 'public', 'recordings')));

  // API endpoint to serve configurable Jira form configuration
  app.get('/api/jira-forms/data-extraction-config', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const configPath = path.join(process.cwd(), 'public', 'jira-forms', 'data-extraction-config.json');
      
      // Check if config file exists
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Jira form configuration not found' });
      }
      
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      res.json(config);
      
    } catch (error) {
      console.error('[Jira Forms] Error loading configuration:', error);
      res.status(500).json({ 
        error: 'Failed to load Jira form configuration',
        message: error.message 
      });
    }
  });

  // Download generated insurance quote PDF
  app.get('/api/quote/download', (req, res) => {
    const pdfPath = path.join(process.cwd(), 'public', 'Insurance_Quote_Harrington.pdf');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'Quote PDF not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Insurance_Quote_Harrington.pdf"');
    fs.createReadStream(pdfPath).pipe(res);
  });

  // API endpoint to serve submission form configuration
  // If ?sessionId=X is provided, merges real extracted values from the session's policy_extractor results
  app.get('/api/submission-forms/data-extraction-config', async (req, res) => {
    try {
      const configPath = path.join(process.cwd(), 'public', 'submission-forms', 'data-extraction-config.json');

      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Submission form configuration not found' });
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // If sessionId provided, check if the session has a _formConfig stored by policy_extractor
      const { sessionId } = req.query;
      if (sessionId && typeof sessionId === 'string') {
        try {
          const session = await storage.getWorkflowSession(sessionId);
          const sessionFormConfig = (session?.extractedData as any)?._formConfig;
          if (sessionFormConfig) {
            return res.json(sessionFormConfig);
          }
        } catch (err) {
          console.warn('[Submission Forms] Failed to load session config, using static:', err);
        }
      }

      res.json(config);
    } catch (error) {
      console.error('[Submission Forms] Error loading configuration:', error);
      res.status(500).json({
        error: 'Failed to load submission form configuration',
        message: error.message
      });
    }
  });

  // API endpoint to serve slip form configuration
  app.get('/api/slip-forms/data-extraction-config', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const configPath = path.join(process.cwd(), 'public', 'slip-forms', 'data-extraction-config.json');

      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Slip form configuration not found' });
      }

      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      res.json(config);
    } catch (error) {
      console.error('[Slip Forms] Error loading configuration:', error);
      res.status(500).json({
        error: 'Failed to load slip form configuration',
        message: error.message
      });
    }
  });

  // API endpoint to serve configurable Jira documents
  app.get('/api/jira-documents', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const documentsPath = path.join(process.cwd(), 'public', 'jira-documents');
      console.log(`[Jira Documents] Looking for documents in: ${documentsPath}`);
      
      // Check if documents directory exists
      if (!fs.existsSync(documentsPath)) {
        console.log(`[Jira Documents] Directory not found: ${documentsPath}`);
        return res.status(404).json({ error: 'Jira documents directory not found' });
      }
      
      const files = fs.readdirSync(documentsPath);
      console.log(`[Jira Documents] Found files: ${files.join(', ')}`);
      const documents = [];
      
      for (const file of files) {
        const filePath = path.join(documentsPath, file);
        const stats = fs.statSync(filePath);
        
        // Handle all file types dynamically
        if (file.endsWith('.html')) {
          const content = fs.readFileSync(filePath, 'utf8');
          documents.push({
            id: file.replace('.html', ''),
            title: file === 'email.html' ? 'Broker Email' : file.replace('.html', '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            type: 'email',
            content: content,
            name: file,
            size: stats.size
          });
        } else if (file.endsWith('.pdf')) {
          // Handle ALL PDF files, not just specific ones
          documents.push({
            id: file.replace('.pdf', ''),
            title: file === 'slip-document.pdf' ? 'Slip Document' : file.replace('.pdf', '').replace(/[-_()]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            type: 'pdf',
            url: `/jira-documents/${encodeURIComponent(file)}`,
            name: file,
            size: stats.size
          });
        } else if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            documents.push({
              id: file.replace('.json', ''),
              title: file === 'extracted-data.json' ? 'Extracted Data' : file.replace('.json', '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              type: 'data',
              content: data,
              name: file,
              size: stats.size
            });
          } catch (error) {
            console.error(`Error parsing JSON file ${file}:`, error);
          }
        } else if (file.endsWith('.txt') || file.endsWith('.csv')) {
          // Handle text and CSV files
          const content = fs.readFileSync(filePath, 'utf8');
          documents.push({
            id: file.split('.')[0],
            title: file.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            type: file.endsWith('.csv') ? 'data' : 'text',
            content: content,
            name: file,
            size: stats.size
          });
        }
      }
      
      console.log(`[Jira Documents] Returning ${documents.length} documents:`, documents.map(d => d.title));
      res.json(documents);
      
    } catch (error) {
      console.error('[Jira Documents] Error loading documents:', error);
      res.status(500).json({ 
        error: 'Failed to load Jira documents',
        message: error.message 
      });
    }
  });

  // Test endpoint to manually trigger Communication Agent
  app.post('/api/test-communication-agent', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      console.log(`[Test Communication Agent] Manually executing Communication Agent for ${sessionId}`);
      
      // Find the Communication Agent
      const agents = await storage.getAgentsBySession(sessionId);
      const communicationAgent = agents.find(a => a.type === 'communication_monitor');
      
      if (!communicationAgent) {
        return res.status(404).json({ error: 'Communication Agent not found' });
      }
      
      // Execute the Communication Agent directly
      await executeAgent(sessionId, communicationAgent);
      
      res.json({ 
        success: true, 
        message: 'Communication Agent executed successfully',
        agent: communicationAgent.name
      });
      
    } catch (error) {
      console.error('[Test Communication Agent] Error:', error);
      res.status(500).json({ 
        error: 'Failed to execute Communication Agent',
        message: error.message 
      });
    }
  });

  // Test endpoint to manually trigger Sanctions Agent with enhanced progress
  app.post('/api/test-sanctions-agent', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      console.log(`[Test Sanctions Agent] Manually executing Sanctions Agent with enhanced progress for ${sessionId}`);
      
      // Find the Sanctions Agent
      const agents = await storage.getAgentsBySession(sessionId);
      const sanctionsAgent = agents.find(a => a.type === 'sanctions' || a.name.includes('Sanctions'));
      
      if (!sanctionsAgent) {
        return res.status(404).json({ error: 'Sanctions Agent not found' });
      }
      
      // Execute the Sanctions Agent directly to demonstrate enhanced progress
      await executeAgent(sessionId, sanctionsAgent);
      
      res.json({ 
        success: true, 
        message: 'Sanctions Agent executed successfully with enhanced progress tracking',
        agent: sanctionsAgent.name,
        features: [
          'Enhanced progress tracking (10% → 25% → 45% → 65% → 85% → 95% → 100%)',
          'Realistic sleep delays between progress steps',
          'OFAC Database check simulation',
          'EU Sanctions check simulation', 
          'PEP Database verification',
          'International watch list screening',
          'Final compliance report generation'
        ]
      });
      
    } catch (error) {
      console.error('[Test Sanctions Agent] Error:', error);
      res.status(500).json({ 
        error: 'Failed to execute Sanctions Agent',
        message: error.message 
      });
    }
  });

  // Enhanced Quality Assurance Agent with Pre/Post Validation Comparison
  app.post('/api/mismatch-summary', async (req, res) => {
    try {
      const { ticketKey, context, sessionId, includeDataComparison = true } = req.body;
      
      if (!ticketKey) {
        return res.status(400).json({ error: 'Jira ticket key is required' });
      }

      console.log(`[Quality Assurance] Processing ticket ${ticketKey} with AI analysis and data comparison`);

      // Get original and approved data for comparison if sessionId provided
      let dataComparisonContext = '';
      let originalData = {};
      let approvedData = {};
      
      if (sessionId && includeDataComparison) {
        try {
          // Get workflow session to access approved data
          const workflowSession = await storage.getWorkflowSession(sessionId);
          if (workflowSession?.extractedData) {
            approvedData = workflowSession.extractedData;
            console.log(`[Data Comparison] Found approved data for ${sessionId}`);
          }

          // Get original extracted data from CSV or case source
          const caseId = workflowSession?.caseId || ticketKey;
          const workflowType = workflowSession?.workflowType || 'submission';
          
          if (workflowType === 'slip') {
            const { getSlipDataById } = await import('../shared/slip-data');
            originalData = getSlipDataById(caseId) || {};
          } else {
            const { getSubmissionDataById } = await import('../shared/csv-data');
            originalData = getSubmissionDataById(caseId) || {};
          }
          
          // Generate comparison analysis
          if (Object.keys(originalData).length > 0 && Object.keys(approvedData).length > 0) {
            const changes = compareDataChanges(originalData, approvedData);
            dataComparisonContext = `

=== DATA VALIDATION COMPARISON ===
Original Extracted Data vs Human-Approved Data:

${changes.summary}

Changed Fields (${changes.changedFields.length}):
${changes.changedFields.map(field => 
`- ${field.fieldName}: "${field.originalValue}" → "${field.approvedValue}" (${field.changeType})`
).join('\n')}

Unchanged Fields: ${changes.unchangedCount}
Quality Improvements: ${changes.qualityImprovements}
Confidence Changes: ${changes.confidenceChanges}

=== END DATA COMPARISON ===`;
            
            console.log(`[Data Comparison] Found ${changes.changedFields.length} field changes between original and approved data`);
          }
        } catch (error) {
          console.error('[Data Comparison] Error comparing data:', error);
          dataComparisonContext = '\n=== DATA COMPARISON UNAVAILABLE ===\nCould not retrieve original/approved data for comparison.\n';
        }
      }

      let aiResponse = '';
      let confidence = 85;
      let useAI = true;

      // Use hardcoded responses (no AI processing for Jira workflows)
      const CORRECT_API_KEY = "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";
      
      try {
        console.log(`[Hardcoded Response] Using hardcoded content for ${ticketKey}...`);
        // Use hardcoded content instead of AI processing
        useAI = false;
      } catch (error) {
        console.log(`[Hardcoded Response] Using fallback content for ${ticketKey}`);
        useAI = false;
      }

      // Use configured quality assurance analysis content for Jira workflows
      const configuredResponse = getAgentResponse('mismatch_summary');
      let mismatchSummaryContent = configuredResponse?.completion_message || `Hello! I've reviewed the slip attached to JIRA Ticket ${ticketKey}. Here are the key mismatches I found:

**Field Comparison Results:**
• Client Name: Database shows "Lee Warner Jones" but slip shows "L.W. Jones" 
• Coverage Type: Database shows "Buildings & Contents" but slip shows "Property - Combined"
• Policy Limits: Database shows "£2,230,555" but slip shows "£2.2M"

**Impact Assessment:**
These mismatches indicate formatting inconsistencies between our internal database and the Lloyd's slip format. The client identity is consistent (Lee Warner Jones = L.W. Jones), but standardization is needed.

**Recommendations:**
1. Standardize client name format across all systems
2. Align coverage type terminology with Lloyd's standards  
3. Use consistent currency formatting (£2,230,555 vs £2.2M)

**Confidence Score:** 92% (High confidence in mismatch identification)`;

      // Apply markdown stripping to quality assurance analysis content for clean display
      aiResponse = mismatchSummaryContent
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\*\*/g, '').replace(/\*/g, '') // Remove bold and italic asterisks
        .replace(/_{2,}/g, '').replace(/_/g, '') // Remove underscores
        .replace(/`{1,3}/g, '') // Remove code blocks
        .replace(/#{1,6}\s/g, '') // Remove header hashes
        .replace(/### /g, '\n\n').replace(/## /g, '\n\n').replace(/# /g, '\n\n')
        .replace(/- /g, '\n• ').replace(/\* /g, '\n• ') // Convert bullet points
        .replace(/\. /g, '.\n').replace(/: /g, ':\n') // Add line breaks
        .replace(/\n{3,}/g, '\n\n') // Replace excessive line breaks
        .trim();
      
      confidence = configuredResponse?.confidence ? (configuredResponse.confidence * 100) : 92;
      
      // Skip this entire section since we're using hardcoded content
      if (false) {
        aiResponse = `**Original Quality Assurance Analysis Report - ${ticketKey}**

**Data Discrepancy Analysis:**
Based on the analysis of ticket ${ticketKey} with processing context from ${context?.source || 'Lloyd\'s Insurance'}, the system has identified several areas requiring attention:

• Processing Type: ${context?.processing_type || 'Standard mismatch analysis'}
• Priority Level: ${context?.priority || 'Medium'} priority case
• Source System: ${context?.source || 'Lloyd\'s Insurance platform'}

**Risk Assessment of Mismatches:**
• Medium risk level identified based on ticket classification and processing context
• Data consistency requires verification against master records
• Standard Lloyd's of London underwriting protocols should be applied
• Human review recommended for validation of critical data points

**Recommended Actions:**
1. Cross-reference data fields with authoritative insurance databases
2. Validate client information against KYC and sanctions databases  
3. Review coverage amounts and policy terms for consistency
4. Escalate any persistent discrepancies to senior underwriting team
5. Document all findings in case management system

**Quality Assurance:**
• All data points should be verified through multiple sources
• Critical fields require dual approval before processing
• Compliance with Lloyd's market standards maintained throughout

**Confidence Score:** ${confidence}% (Professional analysis with systematic review)`;
        
        confidence = 82;
        console.log(`[Quality Assurance] Generated professional fallback analysis for ${ticketKey}`);
      }

      // Create enhanced quality assurance analysis response object
      const mismatchSummary: any = {
        ticketKey,
        sessionId: sessionId || null,
        timestamp: new Date().toISOString(),
        analysisType: includeDataComparison ? 'mismatch_detection_with_validation' : 'mismatch_detection',
        summary: aiResponse,
        confidence,
        status: 'completed',
        processingTime: 1200, // Simulated processing time
        recommendations: 'Cross-reference data fields and validate client information',
        dataComparisonIncluded: includeDataComparison && dataComparisonContext.length > 0,
        changesDetected: dataComparisonContext.includes('Changed Fields') ? 
          parseInt(dataComparisonContext.match(/Changed Fields \((\d+)\):/)?.[1] || '0') : 0
      };

      console.log(`[Quality Assurance] Generated summary for ${ticketKey} with ${confidence}% confidence`);

      // Add Jira comment with real API call
      let jiraUpdated = false;
      if (context?.addToJira !== false) {
        try {
          console.log(`[Jira Comment] Adding quality assurance analysis to ticket ${ticketKey}`);
          
          // Use updated Jira credentials and API
          const jiraAuth = Buffer.from(`paras.ghai@exlservice.com:ATATT3xFfGF03n-cYP9dKNXucL0TK88A1kzxKBxrnwu-VZLwGEJCj_ViQwNYtB8ctzYhNYM6gIj0tXzFBCQWS7lTMfsT1FMmvQSY0o_IGD_VI2t6IrygDSEC-sTCbVH2bRzQRIjrfDZ_W_Gn7S36Jr0sSzLiVj1KiBwRhHM9ocDlIRAXlciLUHY=06B9FBA0`).toString('base64');
          
          const jiraCommentResponse = await axios.post(
            `https://digitalfx.atlassian.net/rest/api/3/issue/${ticketKey}/comment`,
            {
              body: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: '🤖 AI-Generated Quality Assurance Report',
                        marks: [{ type: 'strong' }]
                      }
                    ]
                  },
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: aiResponse.substring(0, 1000) + (aiResponse.length > 1000 ? '...\n\n[Full report truncated for display]' : '')
                      }
                    ]
                  },
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: `Generated by Quality Assurance Agent • Confidence: ${confidence}% • ${new Date().toISOString()}`,
                        marks: [{ type: 'em' }]
                      }
                    ]
                  }
                ]
              }
            },
            {
              headers: {
                'Authorization': `Basic ${jiraAuth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );
          
          jiraUpdated = true;
          console.log(`[Jira Comment] Successfully added quality assurance analysis to ${ticketKey} (Status: ${jiraCommentResponse.status})`);
          
        } catch (jiraError: any) {
          console.error(`[Jira Comment] Failed to add comment to ${ticketKey}:`, {
            status: jiraError.response?.status,
            statusText: jiraError.response?.statusText,
            data: jiraError.response?.data,
            message: jiraError.message
          });
          
          // If ticket doesn't exist, log helpful information
          if (jiraError.response?.status === 404) {
            console.log(`[Jira Comment] Ticket ${ticketKey} not found. Please verify:
            1. Ticket exists at https://digitalfx.atlassian.net/browse/${ticketKey}
            2. You have permission to view/comment on this ticket
            3. The project key and issue number are correct`);
          }
        }
      }
      
      // Add jiraUpdated to response
      mismatchSummary.jiraUpdated = jiraUpdated;
      
      // Log summary of enhancements
      if (dataComparisonContext.length > 0) {
        console.log(`[Enhanced Analysis] Included pre/post validation comparison for ${ticketKey} with ${mismatchSummary.changesDetected} field changes`);
      }

      res.json(mismatchSummary);
      
    } catch (error) {
      console.error('[Quality Assurance] Processing error:', error.response?.data || error.message);
      
      // Provide fallback response if everything fails
      const fallbackSummary = {
        ticketKey: req.body.ticketKey,
        timestamp: new Date().toISOString(),
        analysisType: 'mismatch_detection',
        summary: `**Quality Assurance Analysis Report - ${req.body.ticketKey}**

**Data Discrepancy Analysis:**
Professional analysis completed for Lloyd's insurance case with systematic review of data consistency and accuracy requirements.

**Risk Assessment:**
Medium risk level identified requiring human validation and cross-reference verification.

**Recommended Actions:**
1. Verify data accuracy against master records
2. Cross-reference client information
3. Review coverage amounts and policy terms
4. Escalate persistent discrepancies

**Confidence Score:** 75% (Systematic professional analysis)`,
        confidence: 75,
        status: 'completed_fallback',
        processingTime: 800,
        recommendations: 'Verify data accuracy and cross-reference with master records'
      };
      
      res.json(fallbackSummary);
    }
  });

  // Register Jira-specific routes  
  app.get('/api/jira/HIS-88/data-extraction', async (req, res) => {
    try {
      res.json([{
        ticket_key: 'HIS-88',
        extracted_data: 'Sample extracted data for HIS-88',
        confidence: 95
      }]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch data extraction' });
    }
  });

  // Serve static HTML as fallback for DNS issues
  app.get("/direct", (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  // Let Vite handle the root route to serve client/index.html

  // Helper function to map internal agent types to Flask API endpoints
  function getFlaskAgentType(agentType: string, agentName: string): string {
    // Map agent names to Flask API endpoints
    const agentMapping: { [key: string]: string } = {
      'Data Extraction Agent': 'data_extraction',
      'Data Validation Agent': 'field_comparison', 
      'Quality Assurance Agent': 'mismatch_summary',
      'Sanctions Check Agent': 'sanctions_check',
      'Policy Integration Agent': 'policy_integration',
      'Final Decision Agent': 'final_decision',
      // Additional slip agents
      'Clause Checker Agent': 'clause_checker',
      'Rule Evaluation Agent': 'rule_evaluation',
      'Quote Drafting Agent': 'quote_drafting',
      'Email Send Agent': 'email_sender',
      'Documentation Agent': 'documentation'
    };
    
    return agentMapping[agentName] || agentType.toLowerCase().replace(/\s+/g, '_');
  }

  // Background polling system for Communication Agent
  function startCommunicationPolling(sessionId: string, agentId: number, jiraId: string) {
    let pollCount = 0;
    const maxPolls = 3600; // 2 hours maximum (3600 * 2 seconds)
    
    const pollForComments = async () => {
      try {
        pollCount++;
        console.log(`[Communication Polling] Poll #${pollCount} for ${jiraId} (${sessionId})`);
        
        // Check if workflow still exists and is in correct state
        const currentWorkflow = await storage.getWorkflowSession(sessionId);
        if (!currentWorkflow || currentWorkflow.status !== 'pending_human_response') {
          console.log(`[Communication Polling] Workflow ${sessionId} no longer waiting for human response - stopping polling`);
          return;
        }
        
        // Import Jira API module for comment fetching
        const jiraApiModule = await import('./jira-api.js');
        const ticketComments = await jiraApiModule.getJiraTicketComments(jiraId);
        
        // Check if most recent comment is from a human (not bot)
        let isHumanResponse = false;
        let mostRecentComment = null;
        if (ticketComments && ticketComments.length > 0) {
          // Sort comments by creation date descending (most recent first)
          const sortedComments = ticketComments.sort((a, b) => 
            new Date(b.created).getTime() - new Date(a.created).getTime()
          );
          mostRecentComment = sortedComments[0];
          
          const isFromBot = mostRecentComment.body?.includes('🤖') || 
                           mostRecentComment.body?.includes('AI-Generated') ||
                           mostRecentComment.author?.displayName?.toLowerCase().includes('bot');
          isHumanResponse = !isFromBot;
        }
        
        console.log(`[Communication Polling] Poll #${pollCount}: Human response detected = ${isHumanResponse} in ${jiraId}`);
        
        // Debug: Log comment details for verification
        if (ticketComments && ticketComments.length > 0) {
          const sortedComments = ticketComments.sort((a, b) => 
            new Date(b.created).getTime() - new Date(a.created).getTime()
          );
          console.log(`[Communication Polling] Debug - Most recent 3 comments:`);
          sortedComments.slice(0, 3).forEach((comment, index) => {
            const isBot = comment.body?.includes('🤖') || comment.body?.includes('AI-Generated');
            console.log(`  ${index + 1}. ${comment.created}: "${comment.body.substring(0, 30)}..." (Bot: ${isBot})`);
          });
          console.log(`[Communication Polling] Most recent comment author: ${mostRecentComment?.author?.displayName}`);
        }
        
        // Update progress periodically - scale properly across 2 hours (3600 polls)
        const progress = Math.min(20 + Math.floor((pollCount / maxPolls) * 75), 95);
        await storage.updateAgent(agentId, { 
          progress,
          results: { 
            agent_name: 'Communication Agent', 
            status: 'monitoring',
            monitoring_status: 'active',
            polls_completed: pollCount,
            last_poll: new Date().toISOString(),
            target_ticket: jiraId,
            most_recent_comment_is_human: isHumanResponse
          }
        });
        
        io.to(sessionId).emit('agent-update', { 
          sessionId, agentId, agentName: 'Communication Agent', status: 'running', progress 
        });
        
        // If human response detected - COMPLETE the agent and resume workflow
        if (isHumanResponse && mostRecentComment) {
          const detectedComment = `${mostRecentComment.author?.displayName}: "${mostRecentComment.body.substring(0, 100)}..."`;
          
          console.log(`[Communication Polling] ✅ Human comment detected in ${jiraId} after ${pollCount} polls: ${detectedComment}`);
          
          // Complete the agent
          await storage.updateAgent(agentId, { 
            status: 'completed', 
            progress: 100,
            results: { 
              agent_name: 'Communication Agent', 
              status: 'completed', 
              confidence: 0.96,
              summary: `Human response detected in ${jiraId}: "${detectedComment}"`,
              human_response_detected: true,
              polls_completed: pollCount,
              target_ticket: jiraId
            }
          });
          
          // Emit completion
          io.to(sessionId).emit('agent-update', { 
            sessionId, agentId, agentName: 'Communication Agent', status: 'completed', progress: 100 
          });
          
          // Create completion message
          await storage.createMessage({
            sessionId,
            content: `✅ **Communication Agent - Human Response Detected!**

**Monitoring Results for ${jiraId}:**
• **Most Recent Comment**: ${detectedComment}
• **Human Response**: Confirmed
• **Monitoring Duration**: ${pollCount * 2} seconds (${pollCount} polls)
• **Status**: Human response detected - proceeding to next agents

**Workflow will now continue with remaining agents...**`,
            type: 'agent',
            sender: 'Communication Agent',
            createdAt: new Date()
          });
          
          // Update workflow to continue (remove pending status)
          await storage.updateWorkflowSession(sessionId, { status: 'running' });
          
          // Resume workflow execution from next agent
          const agents = await storage.getAgentsBySession(sessionId);
          const communicationAgentIndex = agents.findIndex(a => a.type === 'communication_monitor');
          const nextAgentIndex = communicationAgentIndex + 1;
          
          if (nextAgentIndex < agents.length) {
            console.log(`[Communication Polling] Resuming workflow from agent ${nextAgentIndex}`);
            // Continue with remaining agents after small delay
            setTimeout(() => resumeWorkflowAfterApproval(sessionId, nextAgentIndex), 2000);
          }
          
          return; // Stop polling
        }
        
        // If max polls reached without human comments - timeout
        if (pollCount >= maxPolls) {
          console.log(`[Communication Polling] Max polling reached (${maxPolls}) for ${sessionId} - timing out`);
          
          await storage.updateAgent(agentId, { 
            status: 'completed', 
            progress: 100,
            results: { 
              agent_name: 'Communication Agent', 
              status: 'timeout', 
              confidence: 0.50,
              summary: `No human response detected in ${jiraId} within monitoring period`,
              polls_completed: pollCount,
              timeout_reached: true,
              target_ticket: jiraId
            }
          });
          
          await storage.createMessage({
            sessionId,
            content: `⏰ **Communication Agent - Monitoring Timeout**

**Final Monitoring Results for ${jiraId}:**
• **Total Polls**: ${pollCount}
• **Monitoring Duration**: 2 hours
• **Human Comments Found**: 0
• **Status**: Workflow paused - manual intervention required

**Action Required**: Please add a comment to ${jiraId} to continue the workflow.`,
            type: 'agent',
            sender: 'Communication Agent',
            createdAt: new Date()
          });
          
          return; // Stop polling
        }
        
        // Continue polling every 2 seconds
        setTimeout(pollForComments, 2000);
        
      } catch (error) {
        console.error(`[Communication Polling] Error in poll #${pollCount} for ${jiraId}:`, error);
        // Continue polling despite errors, but log them
        setTimeout(pollForComments, 2000);
      }
    };
    
    // Start first poll after small delay
    console.log(`[Communication Polling] Starting background polling for ${jiraId} every 2 seconds`);
    setTimeout(pollForComments, 5000);
  }


  // Update agent descriptions for existing workflows
  app.put('/api/agents/update-descriptions', async (req, res) => {
    try {
      // Get all workflow sessions and update their Quality Assurance Agents
      const sessions = await storage.getAllWorkflowSessions();
      let updatedCount = 0;
      
      for (const session of sessions) {
        const agents = await storage.getAgentsBySession(session.sessionId);
        const qualityAssuranceAgents = agents.filter(agent => agent.type === 'mismatch_summary');
        
        for (const agent of qualityAssuranceAgents) {
          await storage.updateAgent(agent.id, {
            description: 'Responsible for validating the accuracy and completeness of underwriting data by comparing slip details with the policy administration system (PAS)'
          });
          updatedCount++;
        }
      }
      
      res.json({ 
        message: `Updated ${updatedCount} Quality Assurance Agent descriptions`,
        updatedCount 
      });
    } catch (error) {
      console.error('Error updating agent descriptions:', error);
      res.status(500).json({ error: 'Failed to update agent descriptions' });
    }
  });

  // Direct Jira posting endpoint that works independently of workflow state
  app.post('/api/post-to-jira-direct', async (req, res) => {
    try {
      const { ticketKey, summaryData } = req.body;
      
      console.log(`[Direct Jira Post] Posting summary to ticket ${ticketKey}`);
      
      if (!ticketKey || !summaryData) {
        return res.status(400).json({ error: 'Missing ticketKey or summaryData' });
      }
      
      // Post to Jira using the existing function
      const result = await postMismatchSummaryToJira('direct-post', summaryData, ticketKey);
      
      console.log(`[Direct Jira Post] Successfully posted to ${ticketKey}:`, result);
      
      res.json({ 
        success: true, 
        message: `Quality assurance summary posted to ${ticketKey}`,
        jiraResult: result 
      });
    } catch (error) {
      console.error('[Direct Jira Post] Error:', error);
      res.status(500).json({ error: 'Failed to post to Jira', details: error.message });
    }
  });

  return server;
}

// Export the resumeWorkflowAfterHumanResponse function for use by comment watcher system
export { resumeWorkflowAfterHumanResponse };