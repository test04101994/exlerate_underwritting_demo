import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Mail, Database, RefreshCw } from 'lucide-react'

export default function ConfigurableDocumentsTest() {
  const [selectedDoc, setSelectedDoc] = useState<string>('email')

  // Fetch configurable Jira documents
  const { data: documents, isLoading, refetch } = useQuery({
    queryKey: ['/api/jira-documents'],
    queryFn: async () => {
      const response = await fetch('/api/jira-documents')
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      return response.json()
    }
  })

  const getDocIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="h-4 w-4" />
      case 'pdf': return <FileText className="h-4 w-4" />
      case 'data': return <Database className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const selectedDocument = documents?.find((doc: any) => doc.id === selectedDoc)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  EXLerate AI - Configurable Documents
                </h1>
                <p className="text-gray-600">
                  Test the configurable document system. All Jira workflows use documents from the 
                  <code className="bg-gray-200 px-2 py-1 rounded text-sm mx-1">public/jira-documents/</code> 
                  folder.
                </p>
              </div>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-8">Loading documents...</div>
          )}

          {documents && (
            <div className="grid grid-cols-12 gap-6">
              {/* Document List */}
              <div className="col-span-3">
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="font-semibold mb-4">Available Documents</h3>
                  <div className="space-y-2">
                    {documents.map((doc: any) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedDoc === doc.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {getDocIcon(doc.type)}
                          <span className="font-medium text-sm">{doc.title}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {doc.type.toUpperCase()} • {(doc.size / 1024).toFixed(1)} KB
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">How to Customize</h4>
                    <div className="text-xs text-blue-800 space-y-1">
                      <p>1. Replace files in <code>public/jira-documents/</code></p>
                      <p>2. Keep the same filenames</p>
                      <p>3. Click Refresh to see changes</p>
                      <p>4. All Jira workflows will use your new content</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Preview */}
              <div className="col-span-9">
                {selectedDocument && (
                  <div className="bg-white rounded-lg shadow">
                    <div className="border-b p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getDocIcon(selectedDocument.type)}
                          <h3 className="font-semibold">{selectedDocument.title}</h3>
                          <Badge variant="secondary">{selectedDocument.type.toUpperCase()}</Badge>
                        </div>
                        <div className="text-sm text-gray-500">
                          File: {selectedDocument.name} • {(selectedDocument.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      {selectedDocument.type === 'email' && (
                        <div className="border rounded-lg overflow-hidden">
                          <div 
                            dangerouslySetInnerHTML={{ __html: selectedDocument.content }}
                            className="min-h-[500px]"
                          />
                        </div>
                      )}

                      {selectedDocument.type === 'pdf' && (
                        <div className="border rounded-lg overflow-hidden">
                          <iframe
                            src={selectedDocument.url}
                            className="w-full h-[600px] border-0"
                            title={selectedDocument.title}
                          />
                        </div>
                      )}

                      {selectedDocument.type === 'data' && (
                        <div className="space-y-6">
                          <div>
                            <h4 className="font-semibold mb-3">Extracted Fields</h4>
                            <div className="grid gap-2">
                              {selectedDocument.content.extracted_fields?.map((field: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded border">
                                  <span className="font-medium">
                                    {field.field.replace(/_/g, ' ').toUpperCase()}
                                  </span>
                                  <span className="text-gray-700">{field.value}</span>
                                  <Badge variant={
                                    field.confidence > 0.95 ? 'default' : 
                                    field.confidence > 0.9 ? 'secondary' : 
                                    'destructive'
                                  }>
                                    {(field.confidence * 100).toFixed(0)}%
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h4 className="font-semibold mb-3">Quality Metrics</h4>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="p-3 bg-gray-50 rounded border text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                  {(selectedDocument.content.quality_metrics?.completeness_score * 100).toFixed(0)}%
                                </div>
                                <div className="text-sm text-gray-600">Completeness</div>
                              </div>
                              <div className="p-3 bg-gray-50 rounded border text-center">
                                <div className="text-2xl font-bold text-green-600">
                                  {(selectedDocument.content.quality_metrics?.consistency_score * 100).toFixed(0)}%
                                </div>
                                <div className="text-sm text-gray-600">Consistency</div>
                              </div>
                              <div className="p-3 bg-gray-50 rounded border text-center">
                                <div className="text-2xl font-bold text-purple-600">
                                  {(selectedDocument.content.quality_metrics?.accuracy_score * 100).toFixed(0)}%
                                </div>
                                <div className="text-sm text-gray-600">Accuracy</div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h4 className="font-semibold mb-3">Risk Analysis</h4>
                            <div className="p-4 bg-gray-50 rounded border">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="font-medium">Years Trading:</span>
                                  <span className="ml-2">{selectedDocument.content.risk_analysis?.years_trading}</span>
                                </div>
                                <div>
                                  <span className="font-medium">Loss Record:</span>
                                  <span className="ml-2 capitalize">{selectedDocument.content.risk_analysis?.loss_record}</span>
                                </div>
                              </div>
                              <div className="mt-3">
                                <span className="font-medium">Risk Improvements:</span>
                                <ul className="list-disc list-inside mt-1 text-sm text-gray-700">
                                  {selectedDocument.content.risk_analysis?.risk_improvements?.map((improvement: string, idx: number) => (
                                    <li key={idx}>{improvement}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4">Testing Instructions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-medium mb-2">1. View Current Documents</h4>
                <p className="text-sm text-gray-600">
                  The documents shown above are loaded from <code>public/jira-documents/</code>. 
                  These same documents will appear in all Jira workflows.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">2. Customize Content</h4>
                <p className="text-sm text-gray-600">
                  Replace any file in the folder with your own content. Keep the same filename 
                  (email.html, slip-document.pdf, extracted-data.json).
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">3. Test Changes</h4>
                <p className="text-sm text-gray-600">
                  Navigate to any Jira workflow (HIS-87, HIS-88, HIS-89) and verify your 
                  customized content appears in the Document Viewer.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}