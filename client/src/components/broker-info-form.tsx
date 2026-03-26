import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BrokerInfoFormProps {
  sessionId: string;
  onSubmit: () => void;
}

export function BrokerInfoForm({ sessionId, onSubmit }: BrokerInfoFormProps) {
  const [formData, setFormData] = useState({
    financialStatements: '',
    lossHistory: '',
    certificate: '',
    safetyProtocols: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.financialStatements || !formData.lossHistory || !formData.certificate || !formData.safetyProtocols) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      await apiRequest(`/api/broker-info/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      
      toast({
        title: "Information Submitted",
        description: "Broker information received successfully. Workflow resuming...",
        variant: "default"
      });
      
      onSubmit();
    } catch (error) {
      console.error('Broker form submission error:', error);
      toast({
        title: "Submission Failed",
        description: "Failed to submit broker information. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Missing Information Required</CardTitle>
        <CardDescription>
          Please provide the following documents to continue with the underwriting process for TechStart Solutions LLC.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="financialStatements">Financial Statements *</Label>
            <Input
              id="financialStatements"
              placeholder="e.g., 2022-2023 Tax Returns"
              value={formData.financialStatements}
              onChange={(e) => setFormData(prev => ({ ...prev, financialStatements: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lossHistory">Loss History *</Label>
            <Input
              id="lossHistory"
              placeholder="e.g., Claims history for past 5 years"
              value={formData.lossHistory}
              onChange={(e) => setFormData(prev => ({ ...prev, lossHistory: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="certificate">Certificate of Good Standing *</Label>
            <Input
              id="certificate"
              placeholder="e.g., Current business registration certificate"
              value={formData.certificate}
              onChange={(e) => setFormData(prev => ({ ...prev, certificate: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="safetyProtocols">Safety Protocols *</Label>
            <Input
              id="safetyProtocols"
              placeholder="e.g., Risk management procedures document"
              value={formData.safetyProtocols}
              onChange={(e) => setFormData(prev => ({ ...prev, safetyProtocols: e.target.value }))}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Information'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}