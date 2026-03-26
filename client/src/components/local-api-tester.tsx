import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Globe, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LocalApiTesterProps {
  className?: string;
}

export function LocalApiTester({ className }: LocalApiTesterProps) {
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [testEndpoint, setTestEndpoint] = useState('/api/health');
  const [testMethod, setTestMethod] = useState<'GET' | 'POST'>('GET');
  const [testData, setTestData] = useState('{"test": "data"}');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [csvFilename, setCsvFilename] = useState('dashboard.csv');
  const [csvData, setCsvData] = useState<any>(null);
  const { toast } = useToast();

  const testConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/local/test');
      const data = await response.json();
      
      setConnectionStatus(data.connected ? 'connected' : 'disconnected');
      setBaseUrl(data.baseUrl || 'http://localhost:3000');
      
      toast({
        title: data.connected ? 'Connection Successful' : 'Connection Failed',
        description: data.message,
        variant: data.connected ? 'default' : 'destructive',
      });
    } catch (error) {
      setConnectionStatus('disconnected');
      toast({
        title: 'Connection Error',
        description: 'Failed to test connection to local application',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const makeApiCall = async () => {
    setLoading(true);
    setResponse('');
    
    try {
      const options: RequestInit = {
        method: testMethod,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (testMethod === 'POST' && testData) {
        options.body = testData;
      }

      const response = await fetch(`/api/local${testEndpoint}`, options);
      const data = await response.json();
      
      setResponse(JSON.stringify(data, null, 2));
      
      toast({
        title: 'API Call Successful',
        description: `${testMethod} request to ${testEndpoint} completed`,
      });
    } catch (error) {
      setResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast({
        title: 'API Call Failed',
        description: 'Failed to make API call to local application',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const readCsvFile = async () => {
    setLoading(true);
    setCsvData(null);
    
    try {
      const response = await fetch(`/api/local/csv/${csvFilename}`);
      const data = await response.json();
      
      if (data.success) {
        setCsvData(data);
        toast({
          title: 'CSV File Read Successfully',
          description: `Successfully read ${data.rowCount} rows from ${csvFilename}`,
        });
      } else {
        toast({
          title: 'CSV Read Failed',
          description: data.error || 'Failed to read CSV file',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'CSV Read Error',
        description: 'Failed to read CSV file from local system',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Local API Proxy
        </CardTitle>
        <CardDescription>
          Test API calls to applications running on your local laptop
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label>Connection Status:</Label>
            {connectionStatus === 'connected' && (
              <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {connectionStatus === 'disconnected' && (
              <Badge variant="destructive">
                <AlertCircle className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
            {connectionStatus === 'unknown' && (
              <Badge variant="secondary">Unknown</Badge>
            )}
          </div>
          <Button 
            onClick={testConnection} 
            disabled={loading}
            size="sm"
          >
            Test Connection
          </Button>
        </div>

        {/* Base URL Display */}
        <div className="space-y-2">
          <Label>Target URL:</Label>
          <Input 
            value={baseUrl} 
            readOnly 
            className="bg-gray-50 text-gray-600"
          />
          <p className="text-xs text-gray-500">
            Set LOCAL_API_URL environment variable to change this
          </p>
        </div>

        {/* API Test Section */}
        <div className="space-y-4 border-t pt-4">
          <h4 className="font-medium">Test API Call</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <select 
                id="method"
                value={testMethod}
                onChange={(e) => setTestMethod(e.target.value as 'GET' | 'POST')}
                className="w-full p-2 border rounded-md"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                value={testEndpoint}
                onChange={(e) => setTestEndpoint(e.target.value)}
                placeholder="/api/health"
              />
            </div>
          </div>

          {testMethod === 'POST' && (
            <div className="space-y-2">
              <Label htmlFor="data">Request Body (JSON)</Label>
              <textarea
                id="data"
                value={testData}
                onChange={(e) => setTestData(e.target.value)}
                className="w-full p-2 border rounded-md h-20 font-mono text-sm"
                placeholder='{"key": "value"}'
              />
            </div>
          )}

          <Button 
            onClick={makeApiCall} 
            disabled={loading}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            Make API Call
          </Button>

          {/* Response Display */}
          {response && (
            <div className="space-y-2">
              <Label>Response:</Label>
              <pre className="bg-gray-50 p-3 rounded-md text-sm overflow-auto max-h-60">
                {response}
              </pre>
            </div>
          )}
        </div>

        {/* CSV File Reader Section */}
        <div className="space-y-4 border-t pt-4">
          <h4 className="font-medium">CSV File Reader</h4>
          
          <div className="flex gap-2">
            <Input
              placeholder="dashboard.csv"
              value={csvFilename}
              onChange={(e) => setCsvFilename(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={readCsvFile} 
              disabled={loading || !csvFilename}
              size="sm"
            >
              Read CSV
            </Button>
          </div>

          {/* CSV Data Display */}
          {csvData && (
            <div className="space-y-2">
              <Label>CSV Data ({csvData.rowCount} rows):</Label>
              <div className="overflow-auto max-h-96 border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {csvData.headers.map((header: string, index: number) => (
                        <th key={index} className="px-2 py-1 text-left font-medium border-b">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.data.slice(0, 10).map((row: any, rowIndex: number) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        {csvData.headers.map((header: string, colIndex: number) => (
                          <td key={colIndex} className="px-2 py-1 border-b">
                            {row[header] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.data.length > 10 && (
                  <p className="text-xs text-gray-500 p-2">
                    Showing first 10 rows of {csvData.data.length} total rows
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}