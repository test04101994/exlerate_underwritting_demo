import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { defaultAgentTemplates, type AgentTemplate, type CustomAgentInput, customAgentSchema, type AgentConfig } from '@/../../shared/agent-templates';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from './ui/form';

interface AgentConfiguratorProps {
  onConfigureAgent: (config: AgentTemplate) => void;
  existingAgents?: AgentTemplate[];
  workflowType?: string;
}

export function AgentConfigurator({ onConfigureAgent, existingAgents = [], workflowType = 'research' }: AgentConfiguratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [newCapability, setNewCapability] = useState('');

  const form = useForm<CustomAgentInput>({
    resolver: zodResolver(customAgentSchema),
    defaultValues: {
      name: '',
      type: 'custom',
      description: '',
      systemPrompt: '',
      instructions: '',
      capabilities: [],
      config: {}
    }
  });

  // Filter templates based on workflow type
  const relevantTemplates = defaultAgentTemplates.filter(template => {
    if (workflowType === 'insurance') {
      return ['researcher', 'analyst', 'assessor', 'advisor', 'writer'].includes(template.type);
    }
    return ['researcher', 'analyst', 'writer'].includes(template.type);
  });

  const addCapability = () => {
    if (newCapability.trim() && !capabilities.includes(newCapability.trim())) {
      const updatedCapabilities = [...capabilities, newCapability.trim()];
      setCapabilities(updatedCapabilities);
      form.setValue('capabilities', updatedCapabilities);
      setNewCapability('');
    }
  };

  const removeCapability = (capability: string) => {
    const updatedCapabilities = capabilities.filter(cap => cap !== capability);
    setCapabilities(updatedCapabilities);
    form.setValue('capabilities', updatedCapabilities);
  };

  const handleTemplateSelect = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    if (template.isCustom) {
      setIsCustomMode(true);
      form.reset({
        name: template.name,
        type: template.type,
        description: template.description,
        systemPrompt: template.systemPrompt,
        instructions: template.instructions,
        capabilities: template.capabilities,
        config: template.config
      });
      setCapabilities(template.capabilities);
    } else {
      setIsCustomMode(false);
    }
  };

  const onSubmit = (data: CustomAgentInput) => {
    const agentConfig: AgentTemplate = {
      id: `custom-${Date.now()}`,
      name: data.name,
      type: data.type,
      description: data.description,
      systemPrompt: data.systemPrompt,
      instructions: data.instructions,
      capabilities: data.capabilities,
      config: data.config,
      isCustom: true
    };
    onConfigureAgent(agentConfig);
    form.reset();
    setCapabilities([]);
    setSelectedTemplate(null);
    setIsCustomMode(false);
  };

  const handleUseTemplate = (template: AgentTemplate) => {
    onConfigureAgent(template);
    setSelectedTemplate(null);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center space-x-2">
          <i className="fas fa-robot"></i>
          <span>Configure Agent</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <i className="fas fa-cogs text-primary"></i>
            <span>Agent Configuration</span>
          </DialogTitle>
          <DialogDescription>
            Configure agents with custom prompts and capabilities for your workflow
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates">Agent Templates</TabsTrigger>
            <TabsTrigger value="custom">Custom Agent</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relevantTemplates.map((template) => (
                <Card 
                  key={template.id} 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedTemplate?.id === template.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant="secondary">{template.type}</Badge>
                    </div>
                    <CardDescription className="text-sm">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Capabilities</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {template.capabilities.slice(0, 3).map((capability) => (
                            <Badge key={capability} variant="outline" className="text-xs">
                              {capability.replace('_', ' ')}
                            </Badge>
                          ))}
                          {template.capabilities.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{template.capabilities.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {selectedTemplate?.id === template.id && (
                        <div className="space-y-2 pt-2 border-t">
                          <div>
                            <Label className="text-xs font-semibold">System Prompt</Label>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {template.systemPrompt}
                            </p>
                          </div>
                          <Button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUseTemplate(template);
                            }}
                            className="w-full"
                            size="sm"
                          >
                            Use This Template
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agent Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Market Research Specialist" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agent Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select agent type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="custom">Custom</SelectItem>
                            <SelectItem value="researcher">Researcher</SelectItem>
                            <SelectItem value="analyst">Analyst</SelectItem>
                            <SelectItem value="writer">Writer</SelectItem>
                            <SelectItem value="assessor">Assessor</SelectItem>
                            <SelectItem value="advisor">Advisor</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="Brief description of the agent's role" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="systemPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Prompt</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Define the agent's role, personality, and behavior..."
                          className="h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This prompt defines how the agent will behave and respond
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Instructions</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Specific instructions for how the agent should complete its tasks..."
                          className="h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Detailed instructions for task execution
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <FormLabel>Capabilities</FormLabel>
                  <div className="flex space-x-2">
                    <Input 
                      value={newCapability}
                      onChange={(e) => setNewCapability(e.target.value)}
                      placeholder="Add capability (e.g., data_analysis)"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCapability())}
                    />
                    <Button type="button" onClick={addCapability} variant="outline">
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {capabilities.map((capability) => (
                      <Badge 
                        key={capability} 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => removeCapability(capability)}
                      >
                        {capability}
                        <i className="fas fa-times ml-1 text-xs"></i>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => form.reset()}>
                    Reset
                  </Button>
                  <Button type="submit">
                    Create Custom Agent
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Advanced configuration component for AI model parameters
export function AgentAdvancedConfig({ config, onConfigChange }: { config: AgentConfig; onConfigChange: (config: AgentConfig) => void }) {
  const [localConfig, setLocalConfig] = useState<AgentConfig>(config);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  const updateConfig = (key: keyof AgentConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Advanced Configuration</CardTitle>
        <CardDescription>
          Fine-tune AI model parameters for optimal performance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={localConfig.temperature || 0.7}
              onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Controls randomness (0.0 = deterministic, 2.0 = very creative)
            </p>
          </div>
          
          <div>
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              min="1"
              max="8000"
              value={localConfig.maxTokens || 2000}
              onChange={(e) => updateConfig('maxTokens', parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum response length
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="topP">Top P</Label>
            <Input
              id="topP"
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={localConfig.topP || 0.9}
              onChange={(e) => updateConfig('topP', parseFloat(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Nucleus sampling threshold
            </p>
          </div>
          
          <div>
            <Label htmlFor="timeout">Timeout (ms)</Label>
            <Input
              id="timeout"
              type="number"
              min="1000"
              max="300000"
              value={localConfig.timeout || 30000}
              onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum execution time
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}