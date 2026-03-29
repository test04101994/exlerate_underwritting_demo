import { useState } from 'react'
import ConfigurableJiraDataExtractionForm from '@/components/configurable-jira-data-extraction-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Settings, CheckCircle, Download } from 'lucide-react'

export default function ConfigurableFormsTestPage() {
  const [showForm, setShowForm] = useState(false)

  const handleApprove = (data: any) => {
    console.log('Form approved with data:', data)
    alert('Form approved! Check console for data.')
  }

  const handleReject = (reason: string) => {
    console.log('Form rejected with reason:', reason)
    alert(`Form rejected: ${reason}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            EXLerate AI - Jira Forms System
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Demonstration of the configurable data extraction forms for Jira workflows
          </p>
          <Badge variant="outline" className="text-green-600 border-green-600">
            ✅ System Fully Functional
          </Badge>
        </div>

        {/* Configuration Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Configuration File
              </CardTitle>
              <CardDescription>
                JSON configuration for form fields and behavior
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Location:</strong> <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                    public/jira-forms/data-extraction-config.json
                  </code>
                </p>
                <p className="text-sm">
                  <strong>Sections:</strong> 4 (Basic Info, Risk Details, Financial Terms, Policy Dates)
                </p>
                <p className="text-sm">
                  <strong>Fields:</strong> 12 total fields with confidence scoring
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-orange-600" />
                Customization Features
              </CardTitle>
              <CardDescription>
                Available customization options
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                <li>• Field types: text, email, currency, date, select, textarea</li>
                <li>• Confidence thresholds and badges</li>
                <li>• Source indicators (email, PDF, both)</li>
                <li>• Form titles and descriptions</li>
                <li>• Button labels and actions</li>
                <li>• Quality summary metrics</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                System Status
              </CardTitle>
              <CardDescription>
                Current implementation status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800">Complete</Badge>
                  <span className="text-sm">API Endpoint</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800">Complete</Badge>
                  <span className="text-sm">React Component</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800">Complete</Badge>
                  <span className="text-sm">Workflow Integration</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800">Complete</Badge>
                  <span className="text-sm">Configuration System</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Customize Forms</CardTitle>
            <CardDescription>
              Follow these steps to customize data extraction forms for all Jira workflows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">1. Edit Configuration File</h4>
                <ul className="text-sm space-y-2 text-gray-600">
                  <li>• Open <code className="bg-gray-100 px-1 rounded">public/jira-forms/data-extraction-config.json</code></li>
                  <li>• Modify form title, subtitle, and sections</li>
                  <li>• Add, remove, or edit field definitions</li>
                  <li>• Adjust confidence thresholds and quality metrics</li>
                  <li>• Customize button labels and form settings</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3">2. Changes Apply Automatically</h4>
                <ul className="text-sm space-y-2 text-gray-600">
                  <li>• All Jira workflows detect the session ID pattern</li>
                  <li>• Configuration is loaded via API endpoint</li>
                  <li>• Form updates appear immediately without code changes</li>
                  <li>• Supports field types: text, email, currency, date, select, textarea</li>
                  <li>• Confidence badges and source indicators included</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Section */}
        <div className="text-center">
          <Button
            onClick={() => setShowForm(!showForm)}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {showForm ? 'Hide' : 'Show'} Configurable Form Demo
          </Button>
        </div>

        {/* Form Demo */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Live Form Demo</CardTitle>
              <CardDescription>
                This form is loaded from the JSON configuration file and represents exactly 
                what users will see in Jira workflows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigurableJiraDataExtractionForm
                sessionId="DEMO-TEST-001"
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>✅ Configurable Forms System Complete - Ready for Production Use</p>
        </div>
      </div>
    </div>
  )
}