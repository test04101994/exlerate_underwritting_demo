import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, X, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

interface NegotiationChatbotProps {
  sessionId: string;
}

export function NegotiationChatbot({ sessionId }: NegotiationChatbotProps) {
  console.log('NegotiationChatbot rendering with sessionId:', sessionId);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      content: "Hello! I'm your Broker Negotiation Agent. I can help you discuss policy terms, coverage options, and pricing. What would you like to negotiate today?",
      sender: 'agent',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Send message to negotiation API
      const response = await fetch('/api/negotiation-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMessage, sessionId })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      // Add agent response
      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.message,
        sender: 'agent',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        sender: 'agent',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render if no sessionId
  if (!sessionId) {
    console.log('NegotiationChatbot: No sessionId provided, not rendering');
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Chat Icon */}
      {!isOpen && (
        <div className="relative group">
          <Button
            onClick={() => setIsOpen(true)}
            className="rounded-full w-14 h-14 bg-blue-600 hover:bg-blue-700 shadow-lg"
            size="icon"
          >
            <MessageCircle className="w-6 h-6 text-white" />
          </Button>
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            Negotiation Agent
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-gray-900"></div>
          </div>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className="w-96 h-[500px] shadow-xl border-2 border-blue-200">
          <CardHeader className="bg-blue-600 text-white rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Negotiation Agent
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-blue-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex flex-col h-[calc(100%-4rem)]">
            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.sender === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.sender === 'agent' && (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-blue-600" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] p-3 rounded-lg",
                        message.sender === 'user'
                          ? 'bg-blue-600 text-white ml-auto'
                          : 'bg-gray-100 text-gray-800'
                      )}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    {message.sender === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-600" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="bg-gray-100 p-3 rounded-lg">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={messagesEndRef} />
            </ScrollArea>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !inputMessage.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}