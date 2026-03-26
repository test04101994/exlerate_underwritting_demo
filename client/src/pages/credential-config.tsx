import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface CredentialConfig {
  aws: {
    access_key_id: string;
    secret_access_key: string;
    session_token: string;
    region: string;
    services: {
      s3: { bucket_name: string };
      ses: { from_email: string };
    };
  };
  jira: {
    base_url: string;
    api_token: string;
    email: string;
    project_key: string;
  };
  openrouter: {
    api_key: string;
    base_url: string;
    models: {
      primary: string;
      fallback: string;
    };
  };
  features: {
    enable_aws_integration: boolean;
    enable_jira_polling: boolean;
    enable_openrouter_ai: boolean;
    auto_resume_workflows: boolean;
    comment_polling_interval: number;
  };
}

export default function CredentialConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<CredentialConfig | null>(null);

  const { data: credentialData, isLoading } = useQuery({
    queryKey: ['/api/config/credentials'],
    enabled: true
  });

  const { data: validationData } = useQuery({
    queryKey: ['/api/config/credentials/validate'],
    enabled: true
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<CredentialConfig>) => 
      apiRequest('/api/config/credentials', {
        method: 'POST',
        body: updates
      }),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Credentials updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/config/credentials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/config/credentials/validate'] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update credentials', variant: 'destructive' });
    }
  });

  useEffect(() => {
    if (credentialData) {
      setConfig(credentialData);
    }
  }, [credentialData]);

  const handleInputChange = (section: keyof CredentialConfig, field: string, value: any) => {
    if (!config) return;
    
    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...prev![section],
        [field]: value
      }
    }));
  };

  const handleNestedInputChange = (section: keyof CredentialConfig, nested: string, field: string, value: any) => {
    if (!config) return;
    
    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...prev![section],
        [nested]: {
          ...(prev![section] as any)[nested],
          [field]: value
        }
      }
    }));
  };

  const handleSave = () => {
    if (config) {
      updateMutation.mutate(config);
    }
  };

  const getStatusBadge = (configured: boolean) => (
    <span className={`px-2 py-1 rounded text-xs ${
      configured ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      {configured ? 'Configured' : 'Not Configured'}
    </span>
  );

  if (isLoading || !config) {
    return <div className="p-6">Loading credentials...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Credential Configuration</h1>
        <p className="text-gray-600">Manage API credentials and feature settings</p>
      </div>

      {validationData && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Service Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex justify-between items-center">
                <span>AWS Integration</span>
                {getStatusBadge(validationData.services?.aws?.configured)}
              </div>
              <div className="flex justify-between items-center">
                <span>Jira Integration</span>
                {getStatusBadge(validationData.services?.jira?.configured)}
              </div>
              <div className="flex justify-between items-center">
                <span>OpenRouter AI</span>
                {getStatusBadge(validationData.services?.openrouter?.configured)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="aws" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="aws">AWS</TabsTrigger>
          <TabsTrigger value="jira">Jira</TabsTrigger>
          <TabsTrigger value="openrouter">OpenRouter</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="aws">
          <Card>
            <CardHeader>
              <CardTitle>AWS Configuration</CardTitle>
              <CardDescription>Configure AWS services for document storage and email</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="aws-access-key">Access Key ID</Label>
                <Input
                  id="aws-access-key"
                  type="password"
                  value={config.aws.access_key_id}
                  onChange={(e) => handleInputChange('aws', 'access_key_id', e.target.value)}
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                />
              </div>
              <div>
                <Label htmlFor="aws-secret-key">Secret Access Key</Label>
                <Input
                  id="aws-secret-key"
                  type="password"
                  value={config.aws.secret_access_key}
                  onChange={(e) => handleInputChange('aws', 'secret_access_key', e.target.value)}
                  placeholder="Your AWS secret key"
                />
              </div>
              <div>
                <Label htmlFor="aws-session-token">Session Token (Optional)</Label>
                <Input
                  id="aws-session-token"
                  type="password"
                  value={config.aws.session_token}
                  onChange={(e) => handleInputChange('aws', 'session_token', e.target.value)}
                  placeholder="Temporary session token"
                />
              </div>
              <div>
                <Label htmlFor="aws-region">Region</Label>
                <Input
                  id="aws-region"
                  value={config.aws.region}
                  onChange={(e) => handleInputChange('aws', 'region', e.target.value)}
                  placeholder="us-east-1"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jira">
          <Card>
            <CardHeader>
              <CardTitle>Jira Configuration</CardTitle>
              <CardDescription>Configure Jira integration for ticket management</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="jira-url">Base URL</Label>
                <Input
                  id="jira-url"
                  value={config.jira.base_url}
                  onChange={(e) => handleInputChange('jira', 'base_url', e.target.value)}
                  placeholder="https://digitalfx.atlassian.net"
                />
              </div>
              <div>
                <Label htmlFor="jira-email">Email</Label>
                <Input
                  id="jira-email"
                  type="email"
                  value={config.jira.email}
                  onChange={(e) => handleInputChange('jira', 'email', e.target.value)}
                  placeholder="paras.ghai@exlservice.com"
                />
              </div>
              <div>
                <Label htmlFor="jira-token">API Token</Label>
                <Input
                  id="jira-token"
                  type="password"
                  value={config.jira.api_token}
                  onChange={(e) => handleInputChange('jira', 'api_token', e.target.value)}
                  placeholder="Your Jira API token"
                />
              </div>
              <div>
                <Label htmlFor="jira-project">Project Key</Label>
                <Input
                  id="jira-project"
                  value={config.jira.project_key}
                  onChange={(e) => handleInputChange('jira', 'project_key', e.target.value)}
                  placeholder="HIS"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="openrouter">
          <Card>
            <CardHeader>
              <CardTitle>OpenRouter AI Configuration</CardTitle>
              <CardDescription>Configure AI model access for agent processing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="openrouter-key">API Key</Label>
                <Input
                  id="openrouter-key"
                  type="password"
                  value={config.openrouter.api_key}
                  onChange={(e) => handleInputChange('openrouter', 'api_key', e.target.value)}
                  placeholder="sk-or-v1-..."
                />
              </div>
              <div>
                <Label htmlFor="openrouter-primary-model">Primary Model</Label>
                <Input
                  id="openrouter-primary-model"
                  value={config.openrouter.models.primary}
                  onChange={(e) => handleNestedInputChange('openrouter', 'models', 'primary', e.target.value)}
                  placeholder="openai/gpt-4o-mini"
                />
              </div>
              <div>
                <Label htmlFor="openrouter-fallback-model">Fallback Model</Label>
                <Input
                  id="openrouter-fallback-model"
                  value={config.openrouter.models.fallback}
                  onChange={(e) => handleNestedInputChange('openrouter', 'models', 'fallback', e.target.value)}
                  placeholder="openai/gpt-3.5-turbo"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Feature Configuration</CardTitle>
              <CardDescription>Enable or disable system features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="aws-integration">AWS Integration</Label>
                <Switch
                  id="aws-integration"
                  checked={config.features.enable_aws_integration}
                  onCheckedChange={(checked) => handleNestedInputChange('features', '', 'enable_aws_integration', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="jira-polling">Jira Auto-Polling</Label>
                <Switch
                  id="jira-polling"
                  checked={config.features.enable_jira_polling}
                  onCheckedChange={(checked) => handleNestedInputChange('features', '', 'enable_jira_polling', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="openrouter-ai">OpenRouter AI</Label>
                <Switch
                  id="openrouter-ai"
                  checked={config.features.enable_openrouter_ai}
                  onCheckedChange={(checked) => handleNestedInputChange('features', '', 'enable_openrouter_ai', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-resume">Auto Resume Workflows</Label>
                <Switch
                  id="auto-resume"
                  checked={config.features.auto_resume_workflows}
                  onCheckedChange={(checked) => handleNestedInputChange('features', '', 'auto_resume_workflows', checked)}
                />
              </div>
              <div>
                <Label htmlFor="polling-interval">Comment Polling Interval (ms)</Label>
                <Input
                  id="polling-interval"
                  type="number"
                  value={config.features.comment_polling_interval}
                  onChange={(e) => handleNestedInputChange('features', '', 'comment_polling_interval', parseInt(e.target.value))}
                  placeholder="2000"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end mt-6">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}