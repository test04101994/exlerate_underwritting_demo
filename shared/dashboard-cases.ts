import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type RiskDecision = 'Underwriter Review' | 'Decline' | 'Quote' | '';

export interface DashboardCase {
  case_id: string;
  case_type: 'submission' | 'slip' | 'claim' | 'pre_bind';
  business_name: string;
  policy_type: string;
  submission_date: string;
  current_agent: string;
  agent_progress: number;
  status: 'pending_approval' | 'processing' | 'completed' | 'rejected';
  priority: 'high' | 'medium' | 'low';
  assigned_underwriter: string;
  broker_email: string;
  target_premium: string;
  coverage_amount: string;
  description: string;
  email_subject: string;
  created_at: string;
  updated_at: string;
  risk_decision?: RiskDecision;
}

// Function to parse CSV data
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Function to load dashboard cases from CSV
export function loadDashboardCases(): DashboardCase[] {
  try {
    const csvPath = join(process.cwd(), 'data/csv', 'dashboard-cases.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      console.warn('Dashboard CSV file is empty or has no data rows');
      return [];
    }
    
    const headers = parseCSVLine(lines[0]);
    const cases: DashboardCase[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length !== headers.length) {
        console.warn(`Skipping malformed CSV line ${i + 1}: ${lines[i]}`);
        continue;
      }
      
      const caseData: any = {};
      headers.forEach((header, index) => {
        caseData[header] = values[index];
      });
      
      // Convert string values to appropriate types
      caseData.agent_progress = parseInt(caseData.agent_progress) || 0;
      caseData.case_type = caseData.case_type as 'submission' | 'slip' | 'claim';
      caseData.status = caseData.status as 'pending_approval' | 'processing' | 'completed' | 'rejected';
      caseData.priority = caseData.priority as 'high' | 'medium' | 'low';
      
      cases.push(caseData as DashboardCase);
    }
    
    return cases;
  } catch (error) {
    console.error('Error loading dashboard cases from CSV:', error);
    return [];
  }
}

// Update the risk_decision column on a case in the CSV. Returns true on success.
// Used by the Risk Prioritization Accept/Reject flow to persist the underwriter's
// final routing (Underwriter Review / Decline / Quote) so the dashboard buckets
// stay in sync with what was signed off.
export function setCaseRiskDecision(caseId: string, decision: RiskDecision): boolean {
  try {
    const csvPath = join(process.cwd(), 'data/csv', 'dashboard-cases.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    if (lines.length < 2) return false;

    const headers = parseCSVLine(lines[0]);
    const decisionIdx = headers.indexOf('risk_decision');
    if (decisionIdx === -1) return false;

    let updated = false;
    const escapeCsv = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      if (values[0] === caseId) {
        // Ensure the values array is at least as long as headers
        while (values.length < headers.length) values.push('');
        values[decisionIdx] = decision;
        // Bump updated_at too so the dashboard reflects the change order
        const updatedAtIdx = headers.indexOf('updated_at');
        if (updatedAtIdx !== -1) values[updatedAtIdx] = new Date().toISOString();
        lines[i] = values.map(v => escapeCsv(v ?? '')).join(',');
        updated = true;
        break;
      }
    }

    if (!updated) return false;
    writeFileSync(csvPath, lines.join('\n'), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error updating risk_decision on case:', error);
    return false;
  }
}

// Function to get case by ID
export function getDashboardCaseById(caseId: string): DashboardCase | null {
  const cases = loadDashboardCases();
  return cases.find(c => c.case_id === caseId) || null;
}

// Function to get cases by type
export function getDashboardCasesByType(caseType: 'submission' | 'slip' | 'claim'): DashboardCase[] {
  const cases = loadDashboardCases();
  return cases.filter(c => c.case_type === caseType);
}

// Function to get all case IDs
export function getAllDashboardCaseIds(): string[] {
  const cases = loadDashboardCases();
  return cases.map(c => c.case_id);
}

// Function to get cases by status
export function getDashboardCasesByStatus(status: string): DashboardCase[] {
  const cases = loadDashboardCases();
  return cases.filter(c => c.status === status);
}

// Function to get agent configurations based on case type
export function getAgentConfigsForDashboardCase(caseType: 'submission' | 'slip' | 'claim') {
  if (caseType === 'slip') {
    return [
      { name: 'Slip Validation Agent', type: 'slip_validator', icon: '📋' },
      { name: 'Coverage Analysis Agent', type: 'coverage_analyzer', icon: '🔍' },
      { name: 'Risk Assessment Agent', type: 'risk_assessor', icon: '⚠️' },
      { name: 'Pricing Agent', type: 'pricing_agent', icon: '💰' },
      { name: 'Approval Agent', type: 'approval_agent', icon: '✅' },
      { name: 'Documentation Agent', type: 'documentation_agent', icon: '📄' }
    ];
  } else if (caseType === 'claim') {
    return [
      { name: 'Claim Event Summarizer Agent', type: 'claim_event_summarizer', icon: '🕐' },
      { name: 'FNOL Intake & Assignment Agent', type: 'fnol_intake', icon: '📥' },
      { name: 'Coverage Validation Assistant', type: 'coverage_validation', icon: '🔍' },
      { name: 'Loss Report Summarizer Agent', type: 'loss_report_summarizer', icon: '📋' },
      { name: 'Invoice Validation Agent', type: 'invoice_validation', icon: '🧾' },
      { name: 'Automated Correspondence Generator', type: 'correspondence_generator', icon: '✉️' }
    ];
  } else {
    return [
      { name: 'Data Extraction Agent', type: 'extractor', icon: '📊' },
      { name: 'Sanctions Check Agent', type: 'sanctions', icon: '🛡️' },
      { name: 'Risk Profile Agent', type: 'risk_analyst', icon: '📈' },
      { name: 'Premium Calculation Agent', type: 'calculator', icon: '🧮' },
      { name: 'Email Draft Agent', type: 'drafter', icon: '📝' },
      { name: 'Email Sender Agent', type: 'sender', icon: '📧' },
      { name: 'Final Decision Agent', type: 'decider', icon: '🎯' }
    ];
  }
}