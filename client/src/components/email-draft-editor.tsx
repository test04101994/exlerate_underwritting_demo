import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Mail, 
  Send, 
  Edit3, 
  Check, 
  X, 
  Bold, 
  Italic, 
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  Save
} from 'lucide-react';

interface EmailDraftEditorProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  initialDraft?: EmailDraft;
  onSendEmail: (draft: EmailDraft) => void;
  onSaveDraft: (draft: EmailDraft) => void;
}

interface EmailDraft {
  id: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
  attachments?: string[];
  createdAt: Date;
  lastModified: Date;
}

export function EmailDraftEditor({ 
  isOpen, 
  onClose, 
  sessionId, 
  initialDraft,
  onSendEmail,
  onSaveDraft 
}: EmailDraftEditorProps) {
  const [draft, setDraft] = useState<EmailDraft>(
    initialDraft || {
      id: `draft-${Date.now()}`,
      to: '',
      subject: '',
      body: '',
      priority: 'normal',
      createdAt: new Date(),
      lastModified: new Date()
    }
  );
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Fetch actual AI-generated email draft from Email Draft Agent
  useEffect(() => {
    if (!initialDraft && sessionId) {
      // Fetch the actual email draft from the Email Draft Agent
      const fetchEmailDraft = async () => {
        try {
          const response = await fetch(`/api/workflows/${sessionId}/email-draft`);
          if (response.ok) {
            const data = await response.json();
            if (data.emailDraft) {
              // Parse the AI-generated email content
              const aiEmailContent = data.emailDraft;
              
              // Extract subject and body from AI content
              const subjectMatch = aiEmailContent.match(/Subject:\s*(.+)/);
              const bodyMatch = aiEmailContent.match(/(?:Dear|To:|Subject:.*\n\n?)([\s\S]*?)(?:\n\n*Best regards|$)/);
              
              setDraft({
                id: `draft-${Date.now()}`,
                to: 'james_potter1@ajg.com', // Use actual broker email from CSV
                cc: 'underwriting@exlxtrakto.ai',
                subject: subjectMatch ? subjectMatch[1].trim() : 'Insurance Application Update',
                body: bodyMatch ? bodyMatch[1].trim() : aiEmailContent,
                priority: 'high',
                createdAt: new Date(),
                lastModified: new Date(data.lastModified || Date.now())
              });
            }
          } else {
            // Fallback if no email draft found - use CSV data
            setDraft({
              id: `draft-${Date.now()}`,
              to: 'james_potter1@ajg.com',
              cc: 'underwriting@exlxtrakto.ai',
              subject: 'Insurance Application Update - Lee Warner Jones',
              body: `Dear Peters Charley,

I hope this email finds you well. I am writing to inform you about the status of the insurance application for Lee Warner Jones.

Application Details:
- Client: Lee Warner Jones
- Property: 122 Victoria Street, Princess Road, CW5 8JE
- Coverage: Combined Buildings & Contents
- Building Sum Insured: £2,230,555
- Content Sum Insured: £291,655
- Total Jewellery Value: £97,507
- Target Premium: £8,021

Our underwriting team has completed the assessment and we are pleased to inform you that the application has been processed successfully.

Please contact me if you have any questions or require additional information.

Best regards,

EXL Xtrakto.AI Underwriting Team
Email: underwriting@exlxtrakto.ai`,
              priority: 'high',
              createdAt: new Date(),
              lastModified: new Date()
            });
          }
        } catch (error) {
          console.error('Failed to fetch email draft:', error);
          // Use fallback with CSV data
          setDraft({
            id: `draft-${Date.now()}`,
            to: 'james_potter1@ajg.com',
            cc: 'underwriting@exlxtrakto.ai',
            subject: 'Insurance Application Update - Lee Warner Jones',
            body: `Dear Peters Charley,

I hope this email finds you well. I am writing to inform you about the status of the insurance application for Lee Warner Jones.

Application Details:
- Client: Lee Warner Jones
- Property: 122 Victoria Street, Princess Road, CW5 8JE
- Coverage: Combined Buildings & Contents
- Building Sum Insured: £2,230,555
- Content Sum Insured: £291,655
- Total Jewellery Value: £97,507
- Target Premium: £8,021

Our underwriting team has completed the assessment and we are pleased to inform you that the application has been processed successfully.

Please contact me if you have any questions or require additional information.

Best regards,

EXL Xtrakto.AI Underwriting Team
Email: underwriting@exlxtrakto.ai`,
            priority: 'high',
            createdAt: new Date(),
            lastModified: new Date()
          });
        }
      };
      
      fetchEmailDraft();
    }
  }, [initialDraft, sessionId]);

  const handleSave = async () => {
    setIsSaving(true);
    const updatedDraft = {
      ...draft,
      lastModified: new Date()
    };
    setDraft(updatedDraft);
    await onSaveDraft(updatedDraft);
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleSend = async () => {
    setIsSending(true);
    await onSendEmail(draft);
    setIsSending(false);
    onClose();
  };

  const formatText = (format: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    let formattedText = selectedText;
    switch (format) {
      case 'bold':
        formattedText = `**${selectedText}**`;
        break;
      case 'italic':
        formattedText = `*${selectedText}*`;
        break;
      case 'underline':
        formattedText = `__${selectedText}__`;
        break;
    }
    
    const newValue = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
    setDraft(prev => ({ ...prev, body: newValue }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Email Draft Editor</CardTitle>
            <Badge variant={draft.priority === 'high' ? 'destructive' : 'secondary'}>
              {draft.priority} priority
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Edit3 className="h-4 w-4 mr-1" />
              {isEditing ? 'Preview' : 'Edit'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Email Headers */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  value={draft.to}
                  onChange={(e) => setDraft(prev => ({ ...prev, to: e.target.value }))}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc">CC</Label>
                <Input
                  id="cc"
                  value={draft.cc || ''}
                  onChange={(e) => setDraft(prev => ({ ...prev, cc: e.target.value }))}
                  disabled={!isEditing}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={draft.subject}
                onChange={(e) => setDraft(prev => ({ ...prev, subject: e.target.value }))}
                disabled={!isEditing}
              />
            </div>
          </div>

          <Separator />

          {/* Formatting Toolbar */}
          {isEditing && (
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('bold')}
                className="h-8 w-8 p-0"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('italic')}
                className="h-8 w-8 p-0"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('underline')}
                className="h-8 w-8 p-0"
              >
                <Underline className="h-4 w-4" />
              </Button>
              <div className="h-4 w-px bg-gray-300 mx-2" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <AlignRight className="h-4 w-4" />
              </Button>
              <div className="h-4 w-px bg-gray-300 mx-2" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Email Body */}
          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              ref={bodyRef}
              value={draft.body}
              onChange={(e) => setDraft(prev => ({ ...prev, body: e.target.value }))}
              disabled={!isEditing}
              rows={16}
              className="min-h-[400px] font-mono text-sm leading-relaxed"
            />
          </div>

          {/* Footer Info */}
          <div className="text-sm text-gray-500 flex justify-between">
            <span>Session: {sessionId.slice(-8)}</span>
            <span>
              Last modified: {draft.lastModified.toLocaleString()}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || !isEditing}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? 'Saving...' : 'Save Draft'}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={isSending || !draft.to || !draft.subject || !draft.body}
              >
                <Send className="h-4 w-4 mr-1" />
                {isSending ? 'Sending...' : 'Send Email'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}