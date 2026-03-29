import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, X, Loader2, Wand2 } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

const DEMO_SAMPLE = {
  businessName: 'Pacific Rim Energy Holdings',
  policyType: 'Energy Offshore',
  priority: 'medium' as const,
  brokerEmail: 'submissions@aon-london.com',
  assignedUnderwriter: 'David Chen',
  description: "Lloyd's facultative slip for offshore platform risk in Southeast Asia. TIV USD 340M. Requires CAR + DSU cover with 12-month policy period.",
};

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewCaseModal({ open, onClose }: NewCaseModalProps) {
  const caseType = 'slip' as const;
  const [businessName, setBusinessName] = useState('');
  const [policyType, setPolicyType] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [brokerEmail, setBrokerEmail] = useState('');
  const [assignedUnderwriter, setAssignedUnderwriter] = useState('');
  const [description, setDescription] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fillDemo = () => {
    const sample = DEMO_SAMPLE;
    setBusinessName(sample.businessName);
    setPolicyType(sample.policyType);
    setPriority(sample.priority);
    setBrokerEmail(sample.brokerEmail);
    setAssignedUnderwriter(sample.assignedUnderwriter);
    setDescription(sample.description);
    setError('');
  };

  const reset = () => {
    setBusinessName('');
    setPolicyType('');
    setPriority('medium');
    setBrokerEmail('');
    setAssignedUnderwriter('');
    setDescription('');
    setDocFile(null);
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setDocFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!businessName.trim()) { setError('Client / Business name is required.'); return; }
    if (!policyType.trim()) { setError('Policy type is required.'); return; }

    setSubmitting(true);
    try {
      let documentPayload: { name: string; base64: string; mimeType: string } | undefined;
      if (docFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // strip data URL prefix
          };
          reader.onerror = reject;
          reader.readAsDataURL(docFile);
        });
        documentPayload = { name: docFile.name, base64, mimeType: docFile.type };
      }

      const res = await fetch('/api/cases/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          policyType: policyType.trim(),
          caseType,
          priority,
          brokerEmail: brokerEmail.trim(),
          assignedUnderwriter: assignedUnderwriter.trim(),
          description: description.trim(),
          document: documentPayload,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create case');
      }

      // Refresh dashboard
      await queryClient.invalidateQueries({ queryKey: ['/api/dashboard/cases'] });
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const policyTypeOptions = [
    'All Risks Reinsurance',
    'Property Catastrophe',
    'Facultative Property',
    'Marine Cargo',
    'Energy Offshore',
    'Aviation Hull',
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">Create New Insurance Case</DialogTitle>
            <button
              type="button"
              onClick={fillDemo}
              title="Fill with sample demo data"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-500 border border-dashed border-border hover:border-blue-400 px-2.5 py-1.5 rounded-md transition-colors mr-6"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Demo data
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Business Name */}
          <div className="space-y-1.5">
            <Label htmlFor="businessName">
              Insured / Business Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. ABC Private Limited"
            />
          </div>

          {/* Policy Type */}
          <div className="space-y-1.5">
            <Label>Policy Type <span className="text-red-500">*</span></Label>
            <Select value={policyType} onValueChange={setPolicyType}>
              <SelectTrigger>
                <SelectValue placeholder="Select policy type" />
              </SelectTrigger>
              <SelectContent>
                {policyTypeOptions.map((pt) => (
                  <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority & Underwriter */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as 'high' | 'medium' | 'low')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="underwriter">Assigned Underwriter</Label>
              <Input
                id="underwriter"
                value={assignedUnderwriter}
                onChange={(e) => setAssignedUnderwriter(e.target.value)}
                placeholder="e.g. Sarah Mitchell"
              />
            </div>
          </div>

          {/* Broker Email */}
          <div className="space-y-1.5">
            <Label htmlFor="brokerEmail">Broker Email</Label>
            <Input
              id="brokerEmail"
              type="email"
              value={brokerEmail}
              onChange={(e) => setBrokerEmail(e.target.value)}
              placeholder="broker@company.com"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the case..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Document Upload */}
          <div className="space-y-1.5">
            <Label>Supporting Document</Label>
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {docFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <span className="text-sm text-foreground truncate max-w-[250px]">{docFile.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDocFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to upload PDF, DOCX, or image</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                'Create Case'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
