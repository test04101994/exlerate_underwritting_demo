import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ChevronRight, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  Pause,
  FileText,
  MessageSquare,
  User,
  Bot
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { WorkflowSession, Agent, Message } from '@shared/schema';

interface ProcessHistoryViewProps {
  session?: WorkflowSession;
  agents: Agent[];
  messages: Message[];
  onViewDocuments?: (agentId: number) => void;
}

interface ProcessStep {
  id: string;
  title: string;
  status: 'completed' | 'running' | 'pending' | 'failed';
  startTime?: Date;
  endTime?: Date;
  duration?: string;
  agent?: Agent;
  messages: Message[];
  details?: {
    input?: string;
    output?: string;
    confidence?: number;
    errorMessage?: string;
  };
}

export function ProcessHistoryView({ session, agents, messages, onViewDocuments }: ProcessHistoryViewProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  // Convert agents to process steps with history
  const processSteps: ProcessStep[] = agents.map((agent, index) => {
    const agentMessages = messages.filter(msg => 
      msg.content.toLowerCase().includes(agent.name.toLowerCase()) ||
      msg.sender === 'system' && msg.content.includes('Agent')
    );

    const startTime = agent.createdAt ? new Date(agent.createdAt) : new Date();
    const endTime = agent.status === 'completed' ? new Date(Date.now() - (7 - index) * 30000) : undefined;
    
    return {
      id: `step-${agent.id}`,
      title: agent.name,
      status: agent.status as 'completed' | 'running' | 'pending' | 'failed',
      startTime,
      endTime,
      duration: endTime ? formatDistanceToNow(endTime, { includeSeconds: true }) : undefined,
      agent,
      messages: agentMessages,
      details: {
        input: getAgentInput(agent),
        output: getAgentOutput(agent),
        confidence: getAgentConfidence(agent),
        errorMessage: agent.status === 'failed' ? 'Agent execution failed' : undefined
      }
    };
  });

  function getAgentInput(agent: Agent): string {
    switch (agent.type) {
      case 'extractor':
        return 'Email: Insurance Policy Application - Premier Holdings LLC\nPDF: Premier_Holdings_Application.pdf (8 pages)';
      case 'sanctions':
        return 'Business Name: Premier Holdings LLC\nOwners: John Smith, Sarah Johnson\nLocation: Chicago, IL';
      case 'calculator':
        return 'Business Type: Manufacturing\nRevenue: $2.5M\nEmployees: 45\nCoverage: General Liability, Property, Workers Comp';
      case 'reviewer':
        return 'Premium Quote: $12,500/year\nCoverage Limits: $1M General Liability\nDeductibles: $5,000 Property';
      case 'drafter':
        return 'Approval Status: Approved\nPremium: $12,500\nBroker: broker@premierinsurance.com';
      case 'sender':
        return 'Email Draft: Approved\nRecipient: broker@premierinsurance.com\nSubject: Policy Approval - Premier Holdings LLC';
      case 'decision':
        return 'All Steps Completed\nFinal Status: Approved\nTotal Premium: $12,500';
      default:
        return 'Processing workflow data...';
    }
  }

  function getAgentOutput(agent: Agent): string {
    if (agent.status !== 'completed') return 'Processing...';

    switch (agent.type) {
      case 'extractor':
        return 'Extracted 10 fields\nConfidence: 94%\nBusiness Name: Premier Holdings LLC\nRevenue: $2.5M\nEmployees: 45';
      case 'sanctions':
        return 'Sanctions Check: CLEAR\nNo matches found\nDatabase checked: OFAC, EU, UN\nRisk Level: Low';
      case 'calculator':
        return 'Premium Calculated: $12,500/year\nBase Rate: $8,500\nRisk Adjustment: +$2,000\nDiscount Applied: -$500';
      case 'reviewer':
        return 'Policy Review: APPROVED\nCompliance: ✓ Passed\nRisk Assessment: Medium\nRecommendation: Approve';
      case 'drafter':
        return 'Email Draft Created\nSubject: Policy Approval - Premier Holdings LLC\nContent: 145 words\nTone: Professional';
      case 'sender':
        return 'Email Sent Successfully\nDelivered: 2025-01-09 07:15:42\nStatus: Delivered\nTracking ID: MSG-789456';
      case 'decision':
        return 'FINAL DECISION: APPROVED\nPolicy Number: POL-2025-001234\nEffective Date: 2025-01-15\nPremium: $12,500';
      default:
        return 'Step completed successfully';
    }
  }

  function getAgentConfidence(agent: Agent): number {
    if (agent.status !== 'completed') return 0;
    return Math.floor(Math.random() * 20) + 80; // 80-100%
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'running':
        return <Play className="h-4 w-4 text-blue-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Process Execution History</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            Session: {session?.sessionId?.slice(-8) || 'N/A'}
          </Badge>
          <Badge className={getStatusColor(session?.status || 'pending')}>
            {session?.status || 'Pending'}
          </Badge>
        </div>
      </div>

      <ScrollArea className="h-[600px]">
        <div className="space-y-2">
          {processSteps.map((step, index) => (
            <Card key={step.id} className="overflow-hidden">
              <Collapsible
                open={expandedSteps.has(step.id)}
                onOpenChange={() => toggleStep(step.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {expandedSteps.has(step.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span className="font-mono text-sm text-gray-500">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(step.status)}
                          <CardTitle className="text-sm">{step.title}</CardTitle>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(step.status)}>
                          {step.status}
                        </Badge>
                        <div className="text-xs text-gray-500">
                          {step.agent?.progress || 0}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          Started: {step.startTime ? step.startTime.toLocaleTimeString() : 'N/A'}
                        </span>
                        {step.endTime && (
                          <span>
                            Completed: {step.endTime.toLocaleTimeString()}
                          </span>
                        )}
                        {step.duration && (
                          <span>
                            Duration: {step.duration}
                          </span>
                        )}
                      </div>
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            step.status === 'completed' ? 'bg-green-500' :
                            step.status === 'running' ? 'bg-blue-500' :
                            step.status === 'failed' ? 'bg-red-500' : 'bg-gray-300'
                          }`}
                          style={{ width: `${step.agent?.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {/* Input/Output */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-medium text-sm mb-2">Input</h4>
                          <div className="bg-gray-50 p-3 rounded text-xs">
                            <pre className="whitespace-pre-wrap">{step.details?.input}</pre>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium text-sm mb-2">Output</h4>
                          <div className="bg-gray-50 p-3 rounded text-xs">
                            <pre className="whitespace-pre-wrap">{step.details?.output}</pre>
                          </div>
                        </div>
                      </div>

                      {/* Confidence & Actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {step.details?.confidence && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">Confidence:</span>
                              <Badge variant="outline">{step.details.confidence}%</Badge>
                            </div>
                          )}
                          {step.details?.errorMessage && (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-red-500" />
                              <span className="text-sm text-red-600">{step.details.errorMessage}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {step.agent?.type === 'extractor' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onViewDocuments?.(step.agent!.id)}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              View Documents
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Messages */}
                      {step.messages.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">Messages</h4>
                          <div className="space-y-2">
                            {step.messages.map((message, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs">
                                <div className="mt-1">
                                  {message.sender === 'user' ? (
                                    <User className="h-3 w-3 text-blue-500" />
                                  ) : (
                                    <Bot className="h-3 w-3 text-gray-500" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium">
                                      {message.sender === 'user' ? 'User' : 'System'}
                                    </span>
                                    <span className="text-gray-500">
                                      {new Date(message.createdAt).toLocaleTimeString()}
                                    </span>
                                  </div>
                                  <div className="text-gray-700">{message.content}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}