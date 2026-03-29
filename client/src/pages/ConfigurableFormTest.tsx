import { useState } from 'react';
import { ConfigurableForm } from '@/components/ConfigurableForm';
import { useConfigurableForm, SubmissionCsvDataSource } from '@/hooks/useConfigurableForm';
import { getSubmissionDataById } from '../../../shared/csv-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function ConfigurableFormTest() {
  const [selectedConfig, setSelectedConfig] = useState<'submission-data-extraction' | 'slip-data-extraction' | 'enhanced-submission-example'>('submission-data-extraction');
  const [recordId, setRecordId] = useState('UW-2025-001');

  // Create CSV data source
  const csvDataSource = new SubmissionCsvDataSource(getSubmissionDataById);

  const { config, isConfigLoading, configError } = useConfigurableForm({
    formType: selectedConfig,
    recordId,
    csvDataSource
  });

  const handleFormSubmit = (action: string, data: Record<string, any>) => {
    console.log('Form submitted:', { action, data });
    alert(`Form submitted with action: ${action}\nData keys: ${Object.keys(data).join(', ')}`);
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    console.log('Field changed:', { fieldId, value });
  };

  if (isConfigLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-red-600">Configuration Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{configError.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">No configuration found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">EXLerate AI - Configurable Forms</h1>
              <p className="text-gray-600">Testing dynamic form generation from JSON configuration</p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="secondary">
                Version: {config.version}
              </Badge>
              <Badge variant="outline">
                {config.sections.length} sections
              </Badge>
              <Badge variant="outline">
                {config.sections.reduce((acc, section) => acc + section.fields.length, 0)} fields
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Selector */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Configuration Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Form Configuration
                </label>
                <select
                  value={selectedConfig}
                  onChange={(e) => setSelectedConfig(e.target.value as any)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="submission-data-extraction">Basic Submission Form</option>
                  <option value="slip-data-extraction">Lloyd's Slip Form</option>
                  <option value="enhanced-submission-example">Enhanced Submission (Example)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Record ID
                </label>
                <select
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="UW-2025-001">UW-2025-001 (Lee Warner Jones)</option>
                  <option value="UW-2025-002">UW-2025-002 (Standard Case)</option>
                  <option value="UW-2025-003">UW-2025-003 (Multi-Property)</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="w-full"
                >
                  Refresh Configuration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic Form */}
        <ConfigurableForm
          config={config}
          csvDataSource={csvDataSource}
          recordId={recordId}
          onSubmit={handleFormSubmit}
          onFieldChange={handleFieldChange}
        />
      </div>

      {/* Footer */}
      <div className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-gray-600">
            <p>Form generated from: <code className="bg-gray-100 px-2 py-1 rounded text-sm">core/config/interfaces/{selectedConfig}.json</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}