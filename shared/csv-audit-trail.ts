import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface CaseHistoryRecord {
  case_id: string;
  session_id: string;
  event_type: 'system_event' | 'agent_execution' | 'approval_request' | 'approval_response' | 'email_sent' | 'email_received' | 'document_upload' | 'phone_call';
  actor: string;
  actor_type: 'agent' | 'broker' | 'underwriter' | 'system' | 'user';
  title: string;
  description: string;
  details?: string;
  status: 'completed' | 'pending' | 'failed' | 'in_progress';
  priority: 'high' | 'medium' | 'low';
  timestamp: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStateRecord {
  session_id: string;
  title: string;
  workflow_type: 'submission' | 'slip' | 'underwriting';
  status: 'running' | 'completed' | 'failed' | 'pending_approval' | 'pending_data_extraction' | 'pending_broker_info';
  current_step: number;
  total_steps: number;
  case_id: string;
  created_at: string;
  updated_at: string;
  extracted_data: string; // JSON string
  config: string; // JSON string
}

export interface AgentStateRecord {
  session_id: string;
  agent_id: number;
  name: string;
  type: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  progress: number;
  output: string; // JSON string
  created_at: string;
  updated_at: string;
}

const DATA_DIR = join(process.cwd(), 'data/csv');
const CASE_HISTORY_FILE = join(DATA_DIR, 'case-history.csv');
const WORKFLOW_STATE_FILE = join(DATA_DIR, 'workflow-state.csv');
const AGENT_STATE_FILE = join(DATA_DIR, 'agent-state.csv');

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // Skip the next quote
      } else {
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
    i++;
  }
  
  result.push(current);
  return result;
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export class CaseHistoryManager {
  static addCaseHistoryRecord(record: CaseHistoryRecord): void {
    const timestamp = new Date().toISOString();
    record.created_at = timestamp;
    record.updated_at = timestamp;
    
    const csvLine = [
      record.case_id,
      record.session_id,
      record.event_type,
      record.actor,
      record.actor_type,
      record.title,
      record.description,
      record.details || '',
      record.status,
      record.priority,
      record.timestamp,
      record.created_at,
      record.updated_at
    ].map(escapeCSV).join(',');
    
    if (!existsSync(CASE_HISTORY_FILE)) {
      const header = 'case_id,session_id,event_type,actor,actor_type,title,description,details,status,priority,timestamp,created_at,updated_at';
      writeFileSync(CASE_HISTORY_FILE, header + '\n' + csvLine + '\n');
    } else {
      const existingContent = readFileSync(CASE_HISTORY_FILE, 'utf-8');
      writeFileSync(CASE_HISTORY_FILE, existingContent + csvLine + '\n');
    }
  }
  
  static getCaseHistory(caseId: string): CaseHistoryRecord[] {
    if (!existsSync(CASE_HISTORY_FILE)) {
      return [];
    }
    
    const content = readFileSync(CASE_HISTORY_FILE, 'utf-8');
    const lines = content.split('\n');
    
    if (lines.length <= 1) return [];
    
    const records: CaseHistoryRecord[] = [];
    
    // Process CSV records - handle multi-line fields
    let currentRecord = '';
    let inQuotes = false;
    let quoteCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      if (!line.trim()) continue;
      
      // Check if this line continues a multi-line record
      if (currentRecord) {
        currentRecord += '\n' + line;
      } else {
        currentRecord = line;
      }
      
      // Count quotes to determine if we're in a multi-line field
      quoteCount = 0;
      for (let j = 0; j < currentRecord.length; j++) {
        if (currentRecord[j] === '"') {
          quoteCount++;
        }
      }
      
      // If quote count is even, we have a complete record
      if (quoteCount % 2 === 0) {
        const fields = parseCSVLine(currentRecord);
        if (fields.length >= 13) {
          const recordCaseId = fields[0];
          
          if (recordCaseId === caseId) {
            records.push({
              case_id: fields[0],
              session_id: fields[1],
              event_type: fields[2] as any,
              actor: fields[3],
              actor_type: fields[4] as any,
              title: fields[5],
              description: fields[6],
              details: fields[7],
              status: fields[8] as any,
              priority: fields[9] as any,
              timestamp: fields[10],
              created_at: fields[11],
              updated_at: fields[12]
            });
          }
        }
        currentRecord = '';
      }
    }
    
    return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  
  static getAllCaseHistory(): CaseHistoryRecord[] {
    if (!existsSync(CASE_HISTORY_FILE)) {
      return [];
    }
    
    const content = readFileSync(CASE_HISTORY_FILE, 'utf-8');
    const lines = content.trim().split('\n');
    
    if (lines.length <= 1) return [];
    
    const records: CaseHistoryRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length >= 13) {
        records.push({
          case_id: fields[0],
          session_id: fields[1],
          event_type: fields[2] as any,
          actor: fields[3],
          actor_type: fields[4] as any,
          title: fields[5],
          description: fields[6],
          details: fields[7],
          status: fields[8] as any,
          priority: fields[9] as any,
          timestamp: fields[10],
          created_at: fields[11],
          updated_at: fields[12]
        });
      }
    }
    
    return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}

export class WorkflowStateManager {
  static saveWorkflowState(record: WorkflowStateRecord): void {
    const timestamp = new Date().toISOString();
    record.updated_at = timestamp;
    
    // Update existing record or add new one
    const existingRecords = this.getAllWorkflowStates();
    const existingIndex = existingRecords.findIndex(r => r.session_id === record.session_id);
    
    if (existingIndex >= 0) {
      existingRecords[existingIndex] = record;
    } else {
      record.created_at = timestamp;
      existingRecords.push(record);
    }
    
    // Write all records back
    const header = 'session_id,title,workflow_type,status,current_step,total_steps,case_id,created_at,updated_at,extracted_data,config';
    const csvContent = header + '\n' + existingRecords.map(r => [
      r.session_id,
      r.title,
      r.workflow_type,
      r.status,
      r.current_step.toString(),
      r.total_steps.toString(),
      r.case_id,
      r.created_at,
      r.updated_at,
      r.extracted_data,
      r.config
    ].map(escapeCSV).join(',')).join('\n');
    
    writeFileSync(WORKFLOW_STATE_FILE, csvContent);
  }
  
  static getWorkflowState(sessionId: string): WorkflowStateRecord | null {
    const records = this.getAllWorkflowStates();
    return records.find(r => r.session_id === sessionId) || null;
  }
  
  static getWorkflowByCaseId(caseId: string): WorkflowStateRecord | null {
    const records = this.getAllWorkflowStates();
    return records.find(r => r.case_id === caseId) || null;
  }
  
  static getAllWorkflowStates(): WorkflowStateRecord[] {
    if (!existsSync(WORKFLOW_STATE_FILE)) {
      return [];
    }
    
    const content = readFileSync(WORKFLOW_STATE_FILE, 'utf-8');
    const lines = content.trim().split('\n');
    
    if (lines.length <= 1) return [];
    
    const records: WorkflowStateRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length >= 11) {
        records.push({
          session_id: fields[0],
          title: fields[1],
          workflow_type: fields[2] as any,
          status: fields[3] as any,
          current_step: parseInt(fields[4]),
          total_steps: parseInt(fields[5]),
          case_id: fields[6],
          created_at: fields[7],
          updated_at: fields[8],
          extracted_data: fields[9],
          config: fields[10]
        });
      }
    }
    
    return records;
  }
}

export class AgentStateManager {
  static saveAgentState(record: AgentStateRecord): void {
    const timestamp = new Date().toISOString();
    record.updated_at = timestamp;
    
    // Update existing record or add new one
    const existingRecords = this.getAllAgentStates();
    const existingIndex = existingRecords.findIndex(r => r.session_id === record.session_id && r.agent_id === record.agent_id);
    
    if (existingIndex >= 0) {
      existingRecords[existingIndex] = record;
    } else {
      record.created_at = timestamp;
      existingRecords.push(record);
    }
    
    // Write all records back
    const header = 'session_id,agent_id,name,type,status,progress,output,created_at,updated_at';
    const csvContent = header + '\n' + existingRecords.map(r => [
      r.session_id,
      r.agent_id.toString(),
      r.name,
      r.type,
      r.status,
      r.progress.toString(),
      r.output,
      r.created_at,
      r.updated_at
    ].map(escapeCSV).join(',')).join('\n');
    
    writeFileSync(AGENT_STATE_FILE, csvContent);
  }
  
  static getAgentStates(sessionId: string): AgentStateRecord[] {
    const records = this.getAllAgentStates();
    return records.filter(r => r.session_id === sessionId);
  }
  
  static getAllAgentStates(): AgentStateRecord[] {
    if (!existsSync(AGENT_STATE_FILE)) {
      return [];
    }
    
    const content = readFileSync(AGENT_STATE_FILE, 'utf-8');
    const lines = content.trim().split('\n');
    
    if (lines.length <= 1) return [];
    
    const records: AgentStateRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length >= 9) {
        records.push({
          session_id: fields[0],
          agent_id: parseInt(fields[1]),
          name: fields[2],
          type: fields[3],
          status: fields[4] as any,
          progress: parseInt(fields[5]),
          output: fields[6],
          created_at: fields[7],
          updated_at: fields[8]
        });
      }
    }
    
    return records;
  }
}