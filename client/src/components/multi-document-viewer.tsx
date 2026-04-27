import { useState, useRef, useEffect, useMemo } from 'react';
import { PDFHighlightViewer, type HighlightTarget } from './pdf-highlight-viewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FileText, Download, X, GripVertical, ZoomIn, ZoomOut, RotateCcw, MapPin, Sheet } from 'lucide-react';
import { getSubmissionDataById } from "@shared/csv-data";
import { useQuery } from '@tanstack/react-query';
import { PropertyMapCard } from './property-map-card';

interface DocumentViewerProps {
  sessionId: string;
  className?: string;
  onWidthChange?: (width: number) => void;
  initialWidth?: number;
  submissionId?: string;
  caseId?: string;
  workflowType?: string;
  highlight?: HighlightTarget | null;
  propertyLocation?: string;
}

interface Document {
  id: string;
  title: string;
  type: 'pdf' | 'email' | 'spreadsheet' | 'other';
  icon: React.ReactNode;
  content: React.ReactNode;
  name?: string;
  size?: number;
}

// Email view backed by the /api/eml-content endpoint. Fetches parsed
// headers + body + attachments and renders a styled email layout.
function EmailView({ caseId, fileName, workflowType }: { caseId: string; fileName: string; workflowType?: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    const url = `/api/eml-content/${encodeURIComponent(caseId)}/${encodeURIComponent(fileName)}${workflowType ? `?workflowType=${workflowType}` : ''}`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(j => { if (!cancelled) setData(j); })
      .catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [caseId, fileName, workflowType]);

  if (error) return <div className="p-6 text-sm text-red-600">Failed to parse email: {error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading email…</div>;

  const headers: Array<[string, string]> = [
    ['From', data.from],
    ['To', data.to],
    ['CC', data.cc],
    ['Date', data.date],
    ['Subject', data.subject],
  ].filter(([, v]) => v) as Array<[string, string]>;

  return (
    <div className="bg-white dark:bg-background h-full overflow-auto">
      <div className="px-5 py-4 border-b bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground mb-2">{data.subject || fileName}</h3>
        <div className="grid gap-1 text-xs">
          {headers.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground min-w-[44px]">{k}:</span>
              <span className="text-foreground break-all">{v}</span>
            </div>
          ))}
        </div>
        {data.attachments && data.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.attachments.map((a: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border bg-card">
                <FileText className="h-3 w-3" />
                {a.filename}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="p-5">
        {data.html ? (
          <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: data.html }} />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">{data.text}</pre>
        )}
      </div>
    </div>
  );
}

// CSV-backed spreadsheet view — fetches the file as text, splits into rows/cols,
// and renders as a styled table that visually reads as a spreadsheet.
function SpreadsheetView({ url, name }: { url: string; name: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => {
        if (cancelled) return;
        const parsed = parseCsv(text);
        setRows(parsed);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Failed to load spreadsheet');
      });
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return <div className="p-6 text-sm text-red-600">Failed to load {name}: {error}</div>;
  }
  if (!rows) {
    return <div className="p-6 text-sm text-muted-foreground">Loading spreadsheet…</div>;
  }
  if (rows.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">Empty spreadsheet.</div>;
  }

  const [header, ...body] = rows;

  return (
    <div className="bg-white dark:bg-background h-full overflow-auto">
      <div className="px-4 py-2.5 border-b bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
        <span>{name}</span>
        <span>{body.length} row{body.length === 1 ? '' : 's'} · {header.length} column{header.length === 1 ? '' : 's'}</span>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-muted text-muted-foreground font-medium px-2 py-1.5 border border-border w-10 text-center">#</th>
            {header.map((h, i) => (
              <th key={i} className="bg-muted text-foreground font-semibold px-3 py-1.5 border border-border text-left whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/30">
              <td className="bg-muted/50 text-muted-foreground text-center px-2 py-1.5 border border-border w-10 font-mono">{ri + 1}</td>
              {header.map((_, ci) => (
                <td key={ci} className="px-3 py-1.5 border border-border align-top text-foreground">{row[ci] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Minimal CSV parser supporting quoted values with commas and escaped quotes
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

export function MultiDocumentViewer({ sessionId, className, onWidthChange, initialWidth = 320, submissionId = "UW-2025-001", caseId, workflowType, highlight, propertyLocation }: DocumentViewerProps) {
  const [selectedTab, setSelectedTab] = useState('');
  const [openDocuments, setOpenDocuments] = useState<string[]>([]);
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const resizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom functions
  const handleZoomIn = () => {
    setZoomLevel(prev => {
      const newLevel = Math.min(prev + 25, 300);
      console.log('Zoom In:', prev, '->', newLevel);
      return newLevel;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newLevel = Math.max(prev - 25, 50);
      console.log('Zoom Out:', prev, '->', newLevel);
      return newLevel;
    });
  };

  const handleZoomReset = () => {
    console.log('Zoom Reset to 100%');
    setZoomLevel(100);
  };

  // Get client name from CSV data with memoization
  const clientName = useMemo(() => {
    const csvData = getSubmissionDataById(submissionId);
    return csvData 
      ? `${csvData.title || ''} ${csvData.first_name || ''} ${csvData.middle_name || ''} ${csvData.surname || ''}`.trim()
      : 'Client Name';
  }, [submissionId]);

  // Check if this is a Jira workflow
  const isJiraWorkflow = sessionId?.startsWith('JIR-');

  // Fetch documents - use configurable Jira documents for Jira workflows, regular documents for others
  const { data: caseDocuments, isLoading } = useQuery({
    queryKey: isJiraWorkflow ? ['/api/jira-documents'] : ['/api/documents', caseId || submissionId, workflowType],
    queryFn: async () => {
      if (isJiraWorkflow) {
        const response = await fetch('/api/jira-documents');
        if (!response.ok) throw new Error('Failed to fetch documents');
        return response.json();
      }
      const params = new URLSearchParams();
      if (workflowType) params.append('workflowType', workflowType);
      const endpoint = `/api/documents/${caseId || submissionId}${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!sessionId && (!!caseId || !!submissionId || isJiraWorkflow)
  });

  // Handle document download
  const handleDocumentDownload = async (fileName: string) => {
    try {
      let downloadUrl = isJiraWorkflow 
        ? `/jira-documents/${encodeURIComponent(fileName)}`
        : `/api/documents/${caseId || submissionId}/${fileName}`;
      
      if (!isJiraWorkflow && workflowType) {
        downloadUrl += `?workflowType=${workflowType}`;
      }
      
      const response = await fetch(downloadUrl);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading document:', error);
    }
  };

  // Convert case documents to Document format
  const allDocuments: Document[] = useMemo(() => {
    if (!caseDocuments || caseDocuments.length === 0) {
      return [];
    }
    

    
    return caseDocuments.map((doc: any, index: number) => ({
      id: doc.id,
      title: doc.name,
      type: doc.type as 'pdf' | 'email' | 'doc' | 'docx' | 'spreadsheet' | 'other',
      name: doc.name,
      size: doc.size,
      icon: doc.type === 'spreadsheet'
        ? <Sheet className="h-4 w-4 text-emerald-600" />
        : <FileText className="h-4 w-4" />,
      content: (
        <div className="flex flex-col h-full gap-2">
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="font-medium">{doc.name}</h3>
              <p className="text-sm text-gray-600">
                {doc.type.toUpperCase()} Document
                {doc.size && ` • ${(doc.size / 1024).toFixed(1)} KB`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleDocumentDownload(doc.name)}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              
              <div className="flex items-center gap-1 border rounded-md">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 50}
                  className="h-8 w-8 p-0"
                >
                  <ZoomOut className="h-3 w-3" />
                </Button>
                
                <span className="text-xs text-gray-600 px-2 min-w-[3rem] text-center">
                  {zoomLevel}%
                </span>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 300}
                  className="h-8 w-8 p-0"
                >
                  <ZoomIn className="h-3 w-3" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomReset}
                  className="h-8 w-8 p-0"
                  title="Reset zoom to 100%"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <div className="border rounded-lg overflow-auto flex-1 min-h-0">
            {/* Show different views based on document type */}
            {(doc.type === 'doc' || doc.type === 'docx') ? (
              <div className="flex items-center justify-center h-full bg-gray-50 p-8">
                <div className="text-center max-w-md">
                  <div className="mb-4">
                    <FileText className="h-16 w-16 mx-auto text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Microsoft Word Document</h3>
                  <p className="text-gray-600 mb-4">
                    This is a {doc.type.toUpperCase()} document. Click the download button above to view it in Microsoft Word or a compatible application.
                  </p>
                  <div className="space-y-2 text-sm text-gray-500">
                    <p>File: {doc.name}</p>
                    <p>Size: {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : 'Unknown'}</p>
                    <p>Type: {doc.type.toUpperCase()} Document</p>
                  </div>
                  <div className="mt-4">
                    <Button 
                      onClick={() => handleDocumentDownload(doc.name)}
                      className="w-full"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download to View
                    </Button>
                  </div>
                </div>
              </div>
            ) : doc.type === 'spreadsheet' ? (
              <SpreadsheetView
                url={`/api/documents/${caseId || submissionId}/${doc.name}${workflowType ? `?workflowType=${workflowType}` : ''}`}
                name={doc.name}
              />
            ) : (doc.name?.toLowerCase().endsWith('.html') || doc.name?.toLowerCase().endsWith('.htm')) ? (
              <iframe
                src={`/api/documents/${caseId || submissionId}/${doc.name}${workflowType ? `?workflowType=${workflowType}` : ''}`}
                title={doc.name}
                className="w-full h-full bg-white"
                sandbox="allow-same-origin"
              />
            ) : doc.name?.toLowerCase().endsWith('.eml') ? (
              <EmailView
                caseId={caseId || submissionId || ''}
                fileName={doc.name}
                workflowType={workflowType}
              />
            ) : doc.type === 'email' ? (
              <div className="bg-white p-6 h-full overflow-auto">
                <div className="max-w-4xl mx-auto">
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <h3 className="font-semibold text-gray-900">Email Message</h3>
                      <p className="text-sm text-gray-600">{doc.name}</p>
                    </div>
                    <div className="p-4">
                      <div className="space-y-3 mb-4">
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-gray-700 min-w-[60px]">From:</span>
                          <span className="text-sm text-gray-900">broker@example.com</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-gray-700 min-w-[60px]">To:</span>
                          <span className="text-sm text-gray-900">underwriter@company.com</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-gray-700 min-w-[60px]">Subject:</span>
                          <span className="text-sm text-gray-900">New Business Submission - {clientName}</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-gray-700 min-w-[60px]">Date:</span>
                          <span className="text-sm text-gray-900">{new Date().toLocaleDateString()}</span>
                        </div>
                      </div>
                      <hr className="my-4" />
                      <div className="text-sm text-gray-900 leading-relaxed">
                        <p>Dear Underwriter,</p>
                        <br />
                        <p>Please find attached the insurance application documents for {clientName}.</p>
                        <br />
                        <p>The application includes all required documentation and has been reviewed for completeness.</p>
                        <br />
                        <p>Please let us know if you need any additional information.</p>
                        <br />
                        <p>Best regards,<br />Broker Team</p>
                        <br />
                        <div className="mt-4 p-3 bg-gray-50 rounded border">
                          <p className="text-xs text-gray-600">
                            <strong>Attachments:</strong> {doc.name.includes('.eml') ? 'Email with attachments' : 'Outlook message file'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <PDFHighlightViewer
                url={isJiraWorkflow
                  ? `/jira-documents/${encodeURIComponent(doc.name)}`
                  : `/api/documents/${caseId || submissionId}/${doc.name}${workflowType ? `?workflowType=${workflowType}` : ''}`
                }
                highlight={highlight ?? null}
                zoom={zoomLevel}
              />
            )}
          </div>
        </div>
      )
    }));
  }, [caseDocuments, clientName, caseId, submissionId, zoomLevel, highlight, isJiraWorkflow, workflowType]);

  // Initialize first document as selected when documents load
  useEffect(() => {
    if (allDocuments.length > 0 && !selectedTab) {
      setSelectedTab(allDocuments[0].id);
      setOpenDocuments(allDocuments.map(doc => doc.id));
    }
  }, [allDocuments, selectedTab]);

  const displayedDocuments = allDocuments;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      const clampedWidth = Math.max(300, Math.min(1400, newWidth));
      
      setWidth(clampedWidth);
      onWidthChange?.(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  if (isLoading) {
    return (
      <div className={`bg-gray-50 border-l flex items-center justify-center ${className}`} style={{ width }}>
        <div className="text-center p-8">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Documents...</h3>
          <p className="text-gray-500">Fetching documents from case folder</p>
        </div>
      </div>
    );
  }

  if (displayedDocuments.length === 0) {
    return (
      <div className={`bg-background border-l relative ${className}`} style={{ width }}>
        {/* Resize Handle */}
        <div
          ref={resizeRef}
          className={`absolute left-0 top-0 w-2 h-full cursor-col-resize group hover:bg-blue-200 transition-colors ${
            isResizing ? 'bg-blue-300' : 'bg-gray-200'
          }`}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-2 h-8 flex items-center justify-center">
            <GripVertical className="h-4 w-4 text-gray-500 group-hover:text-blue-600" />
          </div>
        </div>
        <div className="pl-4 h-full flex flex-col">
          <div className="flex-shrink-0 px-4 py-3 border-b flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Property Map</span>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <PropertyMapCard location={propertyLocation} className="h-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`bg-background border-l relative ${className}`} 
      style={{ width }}
    >
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        className={`absolute left-0 top-0 w-2 h-full cursor-col-resize group hover:bg-blue-200 transition-colors ${
          isResizing ? 'bg-blue-300' : 'bg-gray-200'
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-2 h-8 flex items-center justify-center">
          <GripVertical className="h-4 w-4 text-gray-500 group-hover:text-blue-600" />
        </div>
      </div>

      <div className="pl-4 h-full">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
          <div className="flex-shrink-0 px-4 py-3 border-b">
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${displayedDocuments.length + 1}, minmax(0, 1fr))` }}>
              {displayedDocuments.map((doc) => (
                <TabsTrigger key={doc.id} value={doc.id} className="flex items-center gap-1 text-xs">
                  {doc.icon}
                  <span className="truncate">{doc.title}</span>
                </TabsTrigger>
              ))}
              <TabsTrigger value="__map__" className="flex items-center gap-1 text-xs">
                <MapPin className="h-3.5 w-3.5" />
                <span>Map</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden h-full">
            {displayedDocuments.map((doc) => (
              <TabsContent key={doc.id} value={doc.id} className="h-full m-0 p-2">
                {doc.content}
              </TabsContent>
            ))}
            <TabsContent value="__map__" className="h-full m-0 p-2">
              <PropertyMapCard location={propertyLocation} className="h-full" />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}