import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Mail, Download, Eye, CheckCircle, AlertCircle } from 'lucide-react';

interface DocumentViewerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  agentStatus: 'running' | 'completed' | 'pending';
}

interface ExtractedData {
  field: string;
  value: string;
  confidence: number;
  source: 'email' | 'pdf';
}

export function DocumentViewer({ isOpen, onOpenChange, sessionId, agentStatus }: DocumentViewerProps) {
  const [selectedTab, setSelectedTab] = useState('email');

  // Mock data - in real implementation, this would come from the API
  const emailData = {
    subject: "Insurance Policy Application - Premier Holdings LLC",
    from: "broker@premierinsurance.com",
    to: "underwriting@company.com",
    date: "2025-01-09 07:08:42",
    body: `Dear Underwriting Team,

Please find attached the insurance policy application for Premier Holdings LLC.

Key Details:
- Business Type: Manufacturing
- Annual Revenue: $2.5M
- Employees: 45
- Location: Chicago, IL
- Coverage Requested: General Liability, Property, Workers' Comp

The completed application form and supporting documents are attached as PDF.

Please let me know if you need any additional information.

Best regards,
Sarah Johnson
Senior Insurance Broker
Premier Insurance Services`
  };

  const pdfData = {
    filename: "Premier_Holdings_Application.pdf",
    pages: 8,
    size: "2.3 MB",
    content: "Insurance Application Form - Premier Holdings LLC..."
  };

  const extractedData: ExtractedData[] = [
    { field: "Business Name", value: "Premier Holdings LLC", confidence: 98, source: "email" },
    { field: "Business Type", value: "Manufacturing", confidence: 95, source: "email" },
    { field: "Annual Revenue", value: "$2,500,000", confidence: 92, source: "pdf" },
    { field: "Employee Count", value: "45", confidence: 88, source: "pdf" },
    { field: "Location", value: "Chicago, IL", confidence: 96, source: "email" },
    { field: "Coverage Types", value: "General Liability, Property, Workers' Comp", confidence: 94, source: "email" },
    { field: "Industry Code", value: "NAICS 332", confidence: 85, source: "pdf" },
    { field: "Years in Business", value: "12", confidence: 90, source: "pdf" },
    { field: "Prior Claims", value: "2 in last 5 years", confidence: 87, source: "pdf" },
    { field: "Risk Assessment", value: "Medium", confidence: 83, source: "pdf" }
  ];

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return "text-green-600";
    if (confidence >= 80) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 90) return <CheckCircle className="h-4 w-4 text-green-600" />;
    return <AlertCircle className="h-4 w-4 text-yellow-600" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Extraction Review
            <Badge variant={agentStatus === 'completed' ? 'default' : 'secondary'}>
              {agentStatus === 'running' ? 'Processing...' : 
               agentStatus === 'completed' ? 'Completed' : 'Pending'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="pdf" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                PDF Attachment
              </TabsTrigger>
              <TabsTrigger value="extracted" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Extracted Data
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="email" className="flex-1 overflow-hidden">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Email Details</CardTitle>
                  <CardDescription>
                    From: {emailData.from} | Date: {emailData.date}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="font-medium text-sm">Subject:</label>
                      <p className="text-sm bg-gray-50 p-2 rounded">{emailData.subject}</p>
                    </div>
                    <div>
                      <label className="font-medium text-sm">Message Body:</label>
                      <ScrollArea className="h-64 w-full">
                        <pre className="text-sm bg-gray-50 p-4 rounded whitespace-pre-wrap">
                          {emailData.body}
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="pdf" className="flex-1 overflow-hidden">
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">PDF Document</CardTitle>
                      <CardDescription>
                        {pdfData.filename} | {pdfData.pages} pages | {pdfData.size}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg h-96 flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-sm text-gray-600">PDF Preview</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {pdfData.filename}
                      </p>
                      <div className="mt-4 bg-gray-50 p-4 rounded text-left max-w-md">
                        <p className="text-sm text-gray-700">{pdfData.content}</p>
                        <p className="text-xs text-gray-500 mt-2">... and {pdfData.pages - 1} more pages</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="extracted" className="flex-1 overflow-hidden">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Extracted Information</CardTitle>
                  <CardDescription>
                    Data automatically extracted from email and PDF attachment
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    <div className="space-y-3">
                      {extractedData.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{item.field}:</span>
                              <Badge variant={item.source === 'email' ? 'default' : 'secondary'}>
                                {item.source}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{item.value}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {getConfidenceIcon(item.confidence)}
                            <span className={`text-xs font-medium ${getConfidenceColor(item.confidence)}`}>
                              {item.confidence}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-500">
            Session: {sessionId}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button>
              Approve Extraction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}