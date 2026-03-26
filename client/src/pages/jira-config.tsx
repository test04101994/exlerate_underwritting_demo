import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Save, TestTube } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// import { StaticSidebar } from '@/components/static-sidebar';

interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  defaultProject: string;
}

export default function JiraConfigPage() {
  const [config, setConfig] = useState<JiraConfig>({
    baseUrl: 'https://digitalfx.atlassian.net',
    email: 'paras.ghai@exlservice.com',
    apiToken: '',
    defaultProject: 'HIS'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const { toast } = useToast();

  const { register, handleSubmit, setValue, watch } = useForm<JiraConfig>({
    defaultValues: config
  });

  // Load current configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/jira/config');
        if (response.ok) {
          const data = await response.json();
          setConfig(data);
          Object.keys(data).forEach(key => {
            setValue(key as keyof JiraConfig, data[key]);
          });
        }
      } catch (error) {
        console.error('Failed to load Jira config:', error);
      }
    };
    loadConfig();
  }, [setValue]);

  const onSubmit = async (data: JiraConfig) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/jira/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        setConfig(data);
        toast({
          title: "Configuration Saved",
          description: "Jira configuration updated successfully",
        });
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save Jira configuration",
        variant: "destructive"
      });
    }
    setIsLoading(false);
  };

  const testConnection = async () => {
    setIsLoading(true);
    setTestResult('');
    
    try {
      const currentData = watch();
      const response = await fetch('/api/jira/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentData)
      });

      const result = await response.json();
      
      if (response.ok) {
        setTestResult(`✅ Connection successful! Found ${result.projectCount} projects.`);
        toast({
          title: "Connection Test Passed",
          description: "Successfully connected to Jira",
        });
      } else {
        setTestResult(`❌ Connection failed: ${result.error}`);
        toast({
          title: "Connection Test Failed",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      setTestResult('❌ Connection test failed: Network error');
      toast({
        title: "Connection Test Failed",
        description: "Network error occurred",
        variant: "destructive"
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Settings className="h-8 w-8 text-orange-600" />
              EXLerate AI - Underwriting Platform
            </h1>
            <p className="text-gray-600 mt-2">
              Configure your Jira connection settings and switch between different tickets and projects.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Connection Settings</CardTitle>
                <CardDescription>
                  Configure your Jira instance connection details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="baseUrl">Jira Base URL</Label>
                  <Input
                    id="baseUrl"
                    {...register('baseUrl', { required: true })}
                    placeholder="https://yourcompany.atlassian.net"
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Example: https://digitalfx.atlassian.net
                  </p>
                </div>

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email', { required: true })}
                    placeholder="your.email@company.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="apiToken">API Token</Label>
                  <Input
                    id="apiToken"
                    type="password"
                    {...register('apiToken', { required: true })}
                    placeholder="Your Jira API token"
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Generate at: Account Settings → Security → API tokens
                  </p>
                </div>

                <div>
                  <Label htmlFor="defaultProject">Default Project Key</Label>
                  <Input
                    id="defaultProject"
                    {...register('defaultProject')}
                    placeholder="HIS, XSX, etc."
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Default project for ticket searches (optional)
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Ticket Access</CardTitle>
                <CardDescription>
                  Common ticket patterns for easy switching
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">HIS Project Tickets</Label>
                    <div className="mt-2 space-y-2">
                      <div className="text-sm text-gray-600">
                        • HIS-86, HIS-87, HIS-88, HIS-89, HIS-90
                      </div>
                      <div className="text-sm text-gray-500">
                        URL: https://digitalfx.atlassian.net/browse/HIS-XX
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">XSX Project Tickets</Label>
                    <div className="mt-2 space-y-2">
                      <div className="text-sm text-gray-600">
                        • XSX-4113, XSX-4114, XSX-4115
                      </div>
                      <div className="text-sm text-gray-500">
                        URL: https://digitalfx.atlassian.net/browse/XSX-XXXX
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {testResult && (
              <Alert>
                <AlertDescription>{testResult}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={isLoading}
              >
                <TestTube className="h-4 w-4 mr-2" />
                Test Connection
              </Button>
            </div>
          </form>
        </div>
    </div>
  );
}