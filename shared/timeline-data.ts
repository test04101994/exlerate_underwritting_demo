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

// Mock timeline data for demonstration
export const generateTimelineEvents = (caseId: string): TimelineEvent[] => {
  const now = new Date();
  const events: TimelineEvent[] = [];

  // Day 1: Initial submission
  events.push({
    id: `${caseId}-001`,
    timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    type: 'email_received',
    actor: 'Peters Charley',
    actorType: 'broker',
    title: 'Initial Submission Received',
    description: 'New home insurance application from Lee Warner Jones',
    details: 'Subject: Home Insurance Application - UW-2025-001\n\nDear Underwriting Team,\n\nPlease find attached the home insurance application for our client Lee Warner Jones. The property is a detached house valued at £2,230,555 with contents coverage of £291,655.\n\nKey details:\n- Property type: House - Detached\n- Year built: 1985\n- Target premium: £8,021\n- Previous insurer: Aviva\n\nPlease let me know if you need any additional information.\n\nBest regards,\nPeters Charley\nArthur J Gallagher (UK) Ltd',
    attachments: ['Application_Form.pdf', 'Property_Survey.pdf'],
    status: 'completed',
    priority: 'medium'
  });

  // Data extraction agent
  events.push({
    id: `${caseId}-002`,
    timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // 30 mins later
    type: 'agent_execution',
    actor: 'Data Extraction Agent',
    actorType: 'agent',
    title: 'Data Extraction Completed',
    description: 'Automatically extracted key information from submission documents',
    details: 'Extracted data:\n- Client: Lee Warner Jones\n- Property: 123 Main Street, London SW1A 1AA\n- Building sum: £2,230,555\n- Contents sum: £291,655\n- Jewellery: £97,507\n- Confidence score: 94%',
    relatedAgents: ['Data Extraction Agent'],
    status: 'completed',
    priority: 'low'
  });

  // Underwriter review
  events.push({
    id: `${caseId}-003`,
    timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
    type: 'approval_request',
    actor: 'Sarah Johnson',
    actorType: 'underwriter',
    title: 'Data Extraction Approved',
    description: 'Underwriter approved extracted data with minor corrections',
    details: 'Approved extracted data. Updated jewellery value from £97,507 to £100,000 based on recent valuation.',
    status: 'completed',
    priority: 'medium'
  });

  // Day 2: Sanctions check and issues
  events.push({
    id: `${caseId}-004`,
    timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    type: 'agent_execution',
    actor: 'Sanctions Check Agent',
    actorType: 'agent',
    title: 'Sanctions Check - Issue Identified',
    description: 'Potential sanctions match found requiring manual review',
    details: 'Sanctions screening identified potential match:\n- Name: Lee Warner Jones\n- Match confidence: 67%\n- Source: OFAC watchlist\n- Status: Requires manual review\n\nRecommendation: Manual verification required before proceeding.',
    relatedAgents: ['Sanctions Check Agent'],
    status: 'completed',
    priority: 'high'
  });

  // Phone call for clarification
  events.push({
    id: `${caseId}-005`,
    timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
    type: 'phone_call',
    actor: 'Sarah Johnson',
    actorType: 'underwriter',
    title: 'Phone Call - Broker Clarification',
    description: 'Called broker to clarify client identity and address sanctions concerns',
    details: 'Call duration: 15 minutes\nDiscussion points:\n- Verified client identity with passport details\n- Confirmed address and occupation\n- Sanctions match determined to be false positive\n- Broker provided additional ID documentation\n\nOutcome: Approved to proceed with underwriting',
    status: 'completed',
    priority: 'high'
  });

  // Follow-up email
  events.push({
    id: `${caseId}-006`,
    timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 2.5 * 60 * 60 * 1000),
    type: 'email_sent',
    actor: 'Sarah Johnson',
    actorType: 'underwriter',
    title: 'Sanctions Clearance Email',
    description: 'Sent confirmation email to broker regarding sanctions clearance',
    details: 'Subject: Sanctions Clearance - UW-2025-001\n\nDear Peters,\n\nFollowing our phone conversation, I can confirm that the sanctions screening has been cleared. The initial match was a false positive and we can proceed with the underwriting process.\n\nNext steps:\n- Premium calculation in progress\n- Target completion: Tomorrow\n\nBest regards,\nSarah Johnson\nSenior Underwriter',
    attachments: ['Sanctions_Clearance_Certificate.pdf'],
    status: 'completed',
    priority: 'medium'
  });

  // Day 3: Premium calculation and negotiation
  events.push({
    id: `${caseId}-007`,
    timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    type: 'agent_execution',
    actor: 'Premium Calculation Agent',
    actorType: 'agent',
    title: 'Premium Calculation Completed',
    description: 'Calculated premium based on risk assessment and market conditions',
    details: 'Premium calculation results:\n- Base premium: £8,500\n- Risk adjustments: +£300 (high value property)\n- Discounts: -£450 (security systems)\n- Final premium: £8,350\n\nTarget premium: £8,021\nVariance: +£329 (4.1% above target)',
    relatedAgents: ['Premium Calculation Agent', 'Risk Assessment Agent'],
    status: 'completed',
    priority: 'medium'
  });

  // Broker negotiation
  events.push({
    id: `${caseId}-008`,
    timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
    type: 'email_received',
    actor: 'Peters Charley',
    actorType: 'broker',
    title: 'Premium Negotiation Request',
    description: 'Broker requesting premium reduction to meet target',
    details: 'Subject: Premium Negotiation - UW-2025-001\n\nDear Sarah,\n\nI\'ve reviewed the premium calculation of £8,350. Could we explore options to meet the target premium of £8,021?\n\nClient considerations:\n- Long-term customer relationship\n- Excellent claims history\n- Potential for additional policies\n\nPlease let me know if there\'s flexibility in the pricing.\n\nBest regards,\nPeters Charley',
    status: 'completed',
    priority: 'medium'
  });

  // Today: Recent activity
  events.push({
    id: `${caseId}-009`,
    timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
    type: 'agent_execution',
    actor: 'Risk Assessment Agent',
    actorType: 'agent',
    title: 'Risk Re-assessment for Pricing',
    description: 'Re-evaluated risk factors to support premium negotiation',
    details: 'Risk re-assessment findings:\n- Property security: Upgraded alarm system noted\n- Location risk: Reduced flood risk rating\n- Client profile: Excellent payment history confirmed\n\nRecommendation: Support premium reduction to £8,050 (within acceptable risk parameters)',
    relatedAgents: ['Risk Assessment Agent', 'Premium Calculation Agent'],
    status: 'completed',
    priority: 'medium'
  });

  events.push({
    id: `${caseId}-010`,
    timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
    type: 'approval_request',
    actor: 'Sarah Johnson',
    actorType: 'underwriter',
    title: 'Premium Adjustment Approval',
    description: 'Approved premium adjustment to £8,050 based on risk re-assessment',
    details: 'Approved premium adjustment:\n- Original: £8,350\n- Adjusted: £8,050\n- Variance from target: +£29 (0.36%)\n\nJustification: Risk re-assessment supports lower premium while maintaining profitability.',
    status: 'completed',
    priority: 'medium'
  });

  events.push({
    id: `${caseId}-011`,
    timestamp: new Date(now.getTime() - 30 * 60 * 1000), // 30 minutes ago
    type: 'email_sent',
    actor: 'Sarah Johnson',
    actorType: 'underwriter',
    title: 'Premium Confirmation Email',
    description: 'Sent revised premium offer to broker',
    details: 'Subject: Revised Premium Offer - UW-2025-001\n\nDear Peters,\n\nFollowing our risk re-assessment, I\'m pleased to offer a revised premium of £8,050 for the Lee Warner Jones policy.\n\nThis represents excellent value considering:\n- High-value property coverage\n- Comprehensive contents protection\n- Competitive market positioning\n\nPlease confirm acceptance and we can proceed with policy issuance.\n\nBest regards,\nSarah Johnson',
    attachments: ['Revised_Quote.pdf'],
    status: 'completed',
    priority: 'medium'
  });

  // Pending items
  events.push({
    id: `${caseId}-012`,
    timestamp: new Date(now.getTime() - 10 * 60 * 1000), // 10 minutes ago
    type: 'system_event',
    actor: 'System',
    actorType: 'system',
    title: 'Awaiting Broker Response',
    description: 'Waiting for broker confirmation on revised premium offer',
    details: 'Status: Pending broker response\nDeadline: End of business today\nNext action: Follow up if no response by 5 PM',
    status: 'pending',
    priority: 'medium'
  });

  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

// API helper functions
export const getTimelineEvents = (caseId: string): TimelineEvent[] => {
  return generateTimelineEvents(caseId);
};

export const addTimelineEvent = (caseId: string, event: Omit<TimelineEvent, 'id'>): TimelineEvent => {
  const newEvent: TimelineEvent = {
    ...event,
    id: `${caseId}-${Date.now()}`
  };
  
  // In a real system, this would save to database
  return newEvent;
};

export const updateTimelineEvent = (eventId: string, updates: Partial<TimelineEvent>): TimelineEvent | null => {
  // In a real system, this would update in database
  return null;
};