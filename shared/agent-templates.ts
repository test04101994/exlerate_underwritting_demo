import { z } from 'zod';

// Agent configuration template schema
export const agentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  instructions: z.string(),
  capabilities: z.array(z.string()),
  config: z.record(z.any()).default({}),
  isCustom: z.boolean().default(false),
});

export type AgentTemplate = z.infer<typeof agentTemplateSchema>;

// Default agent templates
export const defaultAgentTemplates: AgentTemplate[] = [
  {
    id: 'researcher',
    name: 'Research Agent',
    type: 'researcher',
    description: 'Gathers information and sources from various data points',
    systemPrompt: 'You are a professional research agent. Your role is to gather, analyze, and synthesize information from multiple sources to provide comprehensive insights.',
    instructions: 'Conduct thorough research on the given topic. Focus on finding reliable sources, current data, and actionable insights. Present findings in a structured format.',
    capabilities: ['data_collection', 'source_validation', 'trend_analysis'],
    config: {
      maxSources: 15,
      confidenceThreshold: 0.8,
      researchDepth: 'comprehensive'
    },
    isCustom: false
  },
  {
    id: 'analyst',
    name: 'Data Analyst',
    type: 'analyst',
    description: 'Analyzes data and identifies patterns and trends',
    systemPrompt: 'You are an expert data analyst. Your role is to examine data, identify patterns, trends, and provide analytical insights that drive decision-making.',
    instructions: 'Analyze the provided data thoroughly. Look for patterns, trends, correlations, and anomalies. Present your findings with confidence scores and actionable recommendations.',
    capabilities: ['pattern_recognition', 'statistical_analysis', 'data_visualization'],
    config: {
      analysisDepth: 'detailed',
      confidenceThreshold: 0.85,
      includeVisualizations: true
    },
    isCustom: false
  },
  {
    id: 'writer',
    name: 'Content Writer',
    type: 'writer',
    description: 'Creates comprehensive reports and documentation',
    systemPrompt: 'You are a professional content writer. Your role is to create clear, engaging, and well-structured content based on research and analysis.',
    instructions: 'Create comprehensive, well-structured content based on the provided research and analysis. Focus on clarity, readability, and actionable insights.',
    capabilities: ['content_creation', 'report_writing', 'documentation'],
    config: {
      wordCountTarget: 2500,
      readabilityLevel: 8,
      includeExecutiveSummary: true
    },
    isCustom: false
  },
  {
    id: 'assessor',
    name: 'Business Assessor',
    type: 'assessor',
    description: 'Evaluates business requirements and risk factors',
    systemPrompt: 'You are a business assessment specialist. Your role is to evaluate business requirements, identify risks, and provide strategic recommendations.',
    instructions: 'Conduct a thorough business assessment focusing on assets, risks, compliance requirements, and strategic opportunities. Provide detailed analysis and recommendations.',
    capabilities: ['risk_assessment', 'compliance_analysis', 'strategic_planning'],
    config: {
      assessmentFramework: 'comprehensive',
      riskLevels: ['low', 'medium', 'high', 'critical'],
      includeCompliance: true
    },
    isCustom: false
  },
  {
    id: 'advisor',
    name: 'Strategic Advisor',
    type: 'advisor',
    description: 'Provides strategic recommendations and guidance',
    systemPrompt: 'You are a strategic advisor. Your role is to analyze business situations and provide expert recommendations for optimal outcomes.',
    instructions: 'Analyze the business context and provide strategic recommendations. Focus on practical, implementable solutions with clear benefits and risk assessments.',
    capabilities: ['strategic_analysis', 'recommendation_engine', 'implementation_planning'],
    config: {
      recommendationStyle: 'actionable',
      prioritization: 'impact_effort_matrix',
      includeRoadmap: true
    },
    isCustom: false
  }
];

// Custom agent template schema for user-defined agents
export const customAgentSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  type: z.string().min(1, 'Agent type is required'),
  description: z.string().min(1, 'Description is required'),
  systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
  instructions: z.string().min(10, 'Instructions must be at least 10 characters'),
  capabilities: z.array(z.string()).min(1, 'At least one capability is required'),
  config: z.record(z.any()).default({})
});

export type CustomAgentInput = z.infer<typeof customAgentSchema>;

// Agent configuration validation
export const agentConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  model: z.string().optional(),
  timeout: z.number().min(1000).max(300000).optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;