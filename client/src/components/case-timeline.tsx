import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Clock, 
  FileText, 
  Mail, 
  Phone, 
  User, 
  Bot, 
  MessageSquare, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  Calendar,
  Download
} from "lucide-react";

interface TimelineEvent {
  id: string;
  timestamp: Date | string;
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

interface CaseTimelineProps {
  caseId: string;
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

export function CaseTimeline({ caseId, events, onEventClick }: CaseTimelineProps) {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  console.log('CaseTimeline render:', { 
    caseId, 
    eventsLength: events?.length, 
    events: events?.slice(0, 2)
  });

  const getEventIcon = (type: TimelineEvent['type'], actorType: TimelineEvent['actorType']) => {
    switch (type) {
      case 'agent_execution': return <Bot className="h-4 w-4" />;
      case 'email_sent': 
      case 'email_received': return <Mail className="h-4 w-4" />;
      case 'document_upload': return <FileText className="h-4 w-4" />;
      case 'phone_call': return <Phone className="h-4 w-4" />;
      case 'approval_request':
      case 'approval_response': return <CheckCircle className="h-4 w-4" />;
      case 'system_event': return <AlertCircle className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getActorIcon = (actorType: TimelineEvent['actorType']) => {
    switch (actorType) {
      case 'agent': return <Bot className="h-3 w-3" />;
      case 'broker': return <User className="h-3 w-3" />;
      case 'underwriter': return <User className="h-3 w-3" />;
      case 'system': return <AlertCircle className="h-3 w-3" />;
      default: return <User className="h-3 w-3" />;
    }
  };

  const formatTimestamp = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getEventColor = (type: TimelineEvent['type'], status: TimelineEvent['status']) => {
    if (status === 'failed') return 'bg-red-100 text-red-800 border-red-200';
    if (status === 'pending') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (status === 'in_progress') return 'bg-blue-100 text-blue-800 border-blue-200';
    
    switch (type) {
      case 'agent_execution': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'email_sent':
      case 'email_received': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'document_upload': return 'bg-green-100 text-green-800 border-green-200';
      case 'phone_call': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'approval_request':
      case 'approval_response': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'system_event': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Process events with proper validation
  console.log('CaseTimeline: Processing events', { caseId, eventsCount: events?.length, events: events?.slice(0, 2) });
  
  const processedEvents = (events || []).map(event => {
    if (!event || !event.timestamp) {
      console.warn('Invalid event found:', event);
      return null;
    }
    return {
      ...event,
      timestamp: typeof event.timestamp === 'string' ? new Date(event.timestamp) : event.timestamp
    };
  }).filter(Boolean) as TimelineEvent[];
  
  console.log('CaseTimeline: Processed events count:', processedEvents.length);

  // Group events by date
  const groupEventsByDate = (events: TimelineEvent[]) => {
    const groups: { [key: string]: TimelineEvent[] } = {};
    events.forEach(event => {
      const timestamp = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
      const dateKey = timestamp.toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
    });
    
    // Sort events within each date group by timestamp (newest first)
    Object.keys(groups).forEach(dateKey => {
      groups[dateKey].sort((a, b) => {
        const timestampA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
        const timestampB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
        return timestampB.getTime() - timestampA.getTime();
      });
    });
    
    return groups;
  };

  const sortedEvents = processedEvents.sort((a, b) => {
    const timestampA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timestampB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return timestampB.getTime() - timestampA.getTime();
  });
  
  const eventGroups = groupEventsByDate(sortedEvents);
  
  // Sort date groups by date (newest first)
  const sortedDateGroups = Object.entries(eventGroups).sort((a, b) => {
    const dateA = new Date(a[0]);
    const dateB = new Date(b[0]);
    return dateB.getTime() - dateA.getTime();
  });

  console.log('Timeline processing:', {
    originalEvents: events?.length,
    processedEvents: processedEvents.length,
    sortedDateGroups: sortedDateGroups.length
  });

  // Show empty state if no events
  if (!processedEvents || processedEvents.length === 0) {
    return (
      <div className="w-full h-full flex flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400 text-sm">No timeline events yet</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Case ID: {caseId}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Calendar className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h3 className="text-lg font-semibold">Case Timeline</h3>
            <Badge variant="outline" className="text-sm">
              {processedEvents.length} events
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Timeline
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 dark:bg-gray-900 min-h-0 case-timeline-scroll" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {sortedDateGroups.map(([date, dayEvents]) => (
          <div key={date} className="space-y-3">
            <div className="flex items-center">
              <div className="flex-shrink-0 w-20 text-sm font-medium text-gray-600 dark:text-gray-400">
                {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700 ml-4"></div>
            </div>

            <div className="space-y-3">
              {dayEvents.map((event, index) => (
                <div key={`${event.id}-${index}-${event.timestamp}`} className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-20 text-sm text-gray-500 dark:text-gray-400 text-right pt-2">
                    {formatTimestamp(event.timestamp)}
                  </div>
                  
                  <div className="flex-shrink-0 mt-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${getEventColor(event.type, event.status)}`}>
                      {getEventIcon(event.type, event.actorType)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedEvent(event)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{event.title}</h4>
                              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                                {getActorIcon(event.actorType)}
                                <span>{event.actor}</span>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{event.description}</p>
                            
                            {event.relatedAgents && event.relatedAgents.length > 0 && (
                              <div className="flex items-center space-x-1 mb-1">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Related agents:</span>
                                {event.relatedAgents.map((agent, agentIndex) => (
                                  <Badge key={`${event.id}-agent-${agentIndex}`} variant="secondary" className="text-xs px-1 py-0">
                                    {agent}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {event.attachments && event.attachments.length > 0 && (
                              <div className="flex items-center space-x-1 mb-1">
                                <FileText className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {event.attachments.length} attachment{event.attachments.length > 1 ? 's' : ''}
                                </span>
                              </div>
                            )}

                            {event.details && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{event.details}</p>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-2 ml-4">
                            <Badge variant={event.priority === 'high' ? 'destructive' : event.priority === 'medium' ? 'default' : 'secondary'} className="text-xs">
                              {event.priority === 'high' ? 'High Priority' : event.priority === 'medium' ? 'Medium Priority' : 'Low Priority'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {event.status}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${getEventColor(selectedEvent?.type || 'system_event', selectedEvent?.status || 'completed')}`}>
                {getEventIcon(selectedEvent?.type || 'system_event', selectedEvent?.actorType || 'system')}
              </div>
              <span>{selectedEvent?.title}</span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Actor:</span>
                  <div className="flex items-center space-x-1 mt-1">
                    {getActorIcon(selectedEvent.actorType)}
                    <span>{selectedEvent.actor}</span>
                  </div>
                </div>
                <div>
                  <span className="font-medium">Time:</span>
                  <p className="mt-1">{formatTimestamp(selectedEvent.timestamp)}</p>
                </div>
                <div>
                  <span className="font-medium">Status:</span>
                  <Badge variant="outline" className="mt-1">
                    {selectedEvent.status}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Priority:</span>
                  <Badge variant={selectedEvent.priority === 'high' ? 'destructive' : selectedEvent.priority === 'medium' ? 'default' : 'secondary'} className="mt-1">
                    {selectedEvent.priority}
                  </Badge>
                </div>
              </div>
              
              <div>
                <span className="font-medium">Description:</span>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{selectedEvent.description}</p>
              </div>
              
              {selectedEvent.details && (
                <div>
                  <span className="font-medium">Details:</span>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{selectedEvent.details}</p>
                </div>
              )}
              
              {selectedEvent.attachments && selectedEvent.attachments.length > 0 && (
                <div>
                  <span className="font-medium">Attachments:</span>
                  <div className="mt-1 space-y-1">
                    {selectedEvent.attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span>{attachment}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}