import { storage } from './storage';
import { Agent, Message, ApprovalRequest, WorkflowSession } from '@shared/schema';
import { CaseHistoryManager } from '@shared/csv-audit-trail';

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'agent_execution' | 'email_sent' | 'email_received' | 'document_upload' | 'phone_call' | 'approval_request' | 'approval_response' | 'system_event';
  actor: string;
  actorType: 'agent' | 'broker' | 'underwriter' | 'system';
  title: string;
  description: string;
  details?: string;
  attachments?: string[];
  relatedAgents?: string[];
  status: 'completed' | 'pending' | 'failed' | 'in_progress';
  priority: 'high' | 'medium' | 'low';
}

export class TimelineGenerator {
  async generateTimelineForSession(sessionId: string): Promise<TimelineEvent[]> {
    const events: TimelineEvent[] = [];
    
    // Get session to find case ID
    const session = await storage.getWorkflowSession(sessionId);
    if (!session || !session.caseId) {
      console.log(`[Timeline] No session or case ID found for ${sessionId}`);
      return [];
    }

    console.log(`[Timeline] Looking for case history for case: ${session.caseId}`);
    
    // Get ALL case history records for this case (across all sessions)
    const caseRecords = CaseHistoryManager.getCaseHistory(session.caseId);
    console.log(`[Timeline] Found ${caseRecords.length} records for case ${session.caseId} across all sessions`);
    
    // Convert CSV records to timeline events - only include completed events
    caseRecords.forEach(record => {
      if (record.status === 'completed') {
        // Add session ID to details if available
        let detailsWithSession = record.details || '';
        if (record.session_id) {
          detailsWithSession = detailsWithSession ? 
            `${detailsWithSession} | Session: ${record.session_id}` : 
            `Session: ${record.session_id}`;
        }
        
        events.push({
          id: `${record.case_id}-${record.timestamp}`,
          timestamp: new Date(record.timestamp),
          type: record.event_type as any,
          actor: record.actor,
          actorType: record.actor_type as any,
          title: record.title,
          description: record.description,
          details: detailsWithSession,
          status: record.status as any,
          priority: record.priority as any
        });
      }
    });

    // Sort events by timestamp (newest first - most recent at top)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    console.log(`[Timeline] Generated ${events.length} timeline events for case ${session.caseId} across all sessions`);
    return events;
  }
}

export const timelineGenerator = new TimelineGenerator();