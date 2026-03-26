/**
 * Agent Configuration Loader
 * Dynamically loads and manages agents from configuration files
 */

const fs = require('fs');
const path = require('path');

class AgentConfigLoader {
  constructor(configPath = './config') {
    this.configPath = configPath;
    this.cache = new Map();
  }

  /**
   * Load agents for a specific workflow type
   * @param {string} workflowType - 'submission' or 'slip' 
   * @returns {Array} Array of agent configurations
   */
  loadAgents(workflowType) {
    const cacheKey = `agents-${workflowType}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const agentFile = path.join(this.configPath, 'agents', `${workflowType}-agents.json`);
    
    try {
      const agentConfig = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
      const agents = agentConfig.agents.sort((a, b) => a.executionOrder - b.executionOrder);
      
      this.cache.set(cacheKey, agents);
      return agents;
    } catch (error) {
      console.error(`Failed to load agents for ${workflowType}:`, error);
      return [];
    }
  }

  /**
   * Load workflow configuration
   * @param {string} workflowType - 'submission' or 'slip'
   * @returns {Object} Workflow configuration
   */
  loadWorkflow(workflowType) {
    const cacheKey = `workflow-${workflowType}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const workflowFile = path.join(this.configPath, 'workflows', `${workflowType}-workflow.json`);
    
    try {
      const workflowConfig = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
      this.cache.set(cacheKey, workflowConfig);
      return workflowConfig;
    } catch (error) {
      console.error(`Failed to load workflow for ${workflowType}:`, error);
      return null;
    }
  }

  /**
   * Load agent prompts and templates
   * @returns {Object} Prompts and templates
   */
  loadPrompts() {
    const cacheKey = 'prompts';
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const promptFile = path.join(this.configPath, 'templates', 'agent-prompts.json');
    
    try {
      const prompts = JSON.parse(fs.readFileSync(promptFile, 'utf8'));
      this.cache.set(cacheKey, prompts);
      return prompts;
    } catch (error) {
      console.error('Failed to load agent prompts:', error);
      return {};
    }
  }

  /**
   * Load completion messages
   * @returns {Object} Completion messages
   */
  loadCompletionMessages() {
    const cacheKey = 'completion-messages';
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const messageFile = path.join(this.configPath, 'templates', 'completion-messages.json');
    
    try {
      const messages = JSON.parse(fs.readFileSync(messageFile, 'utf8'));
      this.cache.set(cacheKey, messages);
      return messages;
    } catch (error) {
      console.error('Failed to load completion messages:', error);
      return {};
    }
  }

  /**
   * Create agent instance from configuration
   * @param {Object} agentConfig - Agent configuration
   * @param {Object} context - Workflow context
   * @returns {Object} Agent instance
   */
  createAgent(agentConfig, context = {}) {
    const prompts = this.loadPrompts();
    const messages = this.loadCompletionMessages();

    return {
      id: agentConfig.id,
      name: agentConfig.name,
      type: agentConfig.type,
      role: agentConfig.role,
      executionOrder: agentConfig.executionOrder,
      required: agentConfig.required,
      
      // AI Model Configuration
      aiModel: agentConfig.aiModel,
      
      // Dynamic Prompt Generation
      getSystemPrompt: () => {
        return prompts.systemPrompts[agentConfig.prompt.systemPrompt] || '';
      },
      
      getContextPrompt: (contextData) => {
        const template = prompts.contextTemplates[agentConfig.prompt.contextTemplate] || '';
        return this.replaceTemplateVariables(template, contextData);
      },
      
      // Progress Tracking
      getProgressStages: () => agentConfig.progressTracking.stages,
      getEstimatedDuration: () => agentConfig.progressTracking.estimatedDuration,
      
      // Completion Messages
      getStartMessage: () => messages.workMessages[agentConfig.id]?.started || `${agentConfig.name} started...`,
      getProgressMessages: () => messages.workMessages[agentConfig.id]?.progress || [],
      getCompletionMessage: (results) => {
        const template = messages.workMessages[agentConfig.id]?.completed || '';
        return this.replaceTemplateVariables(template, results);
      },
      
      // Validation
      validate: (results) => {
        const validation = agentConfig.validation;
        if (!validation) return { valid: true };
        
        const errors = [];
        
        // Check required fields
        for (const field of validation.requiredFields) {
          if (!results[field]) {
            errors.push(`Missing required field: ${field}`);
          }
        }
        
        // Check confidence threshold
        if (results.confidence_score < validation.confidenceThreshold * 100) {
          errors.push(`Confidence score ${results.confidence_score} below threshold ${validation.confidenceThreshold * 100}`);
        }
        
        // Check allowed values
        if (validation.allowedValues) {
          for (const [field, allowedVals] of Object.entries(validation.allowedValues)) {
            if (results[field] && !allowedVals.includes(results[field])) {
              errors.push(`Invalid value for ${field}: ${results[field]}`);
            }
          }
        }
        
        return {
          valid: errors.length === 0,
          errors: errors
        };
      },
      
      // Approval Requirements
      requiresApproval: (results) => {
        const approval = agentConfig.approval;
        if (!approval) return false;
        
        if (approval.requiresHumanApproval === true) return true;
        if (approval.requiresHumanApproval === false) return false;
        
        // Conditional approval
        if (approval.requiresHumanApproval === 'conditional' && approval.approvalCondition) {
          return this.evaluateCondition(approval.approvalCondition, results);
        }
        
        return false;
      },
      
      // Dependencies
      getDependencies: () => agentConfig.dependencies || [],
      
      // Raw configuration for advanced use
      config: agentConfig
    };
  }

  /**
   * Replace template variables in strings
   * @param {string} template - Template string with {variable} placeholders
   * @param {Object} data - Data object with variable values
   * @returns {string} Processed string
   */
  replaceTemplateVariables(template, data) {
    if (!template || !data) return template;
    
    return template.replace(/\{([^}]+)\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  }

  /**
   * Evaluate conditional expressions
   * @param {string} condition - Condition string
   * @param {Object} data - Data to evaluate against
   * @returns {boolean} Result of condition evaluation
   */
  evaluateCondition(condition, data) {
    try {
      // Simple condition evaluation (extend as needed)
      // This is a basic implementation - you may want to use a proper expression parser
      const processedCondition = condition.replace(/(\w+)/g, (match) => {
        return data[match] !== undefined ? JSON.stringify(data[match]) : match;
      });
      
      return eval(processedCondition);
    } catch (error) {
      console.error('Error evaluating condition:', condition, error);
      return false;
    }
  }

  /**
   * Get all available workflow types
   * @returns {Array} Array of workflow types
   */
  getAvailableWorkflowTypes() {
    try {
      const workflowDir = path.join(this.configPath, 'workflows');
      const files = fs.readdirSync(workflowDir);
      
      return files
        .filter(file => file.endsWith('-workflow.json'))
        .map(file => file.replace('-workflow.json', ''));
    } catch (error) {
      console.error('Failed to get workflow types:', error);
      return [];
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Reload configuration (clears cache)
   */
  reload() {
    this.clearCache();
  }
}

// Usage Examples:
/*
const loader = new AgentConfigLoader('./config');

// Load agents for submission workflow
const submissionAgents = loader.loadAgents('submission');

// Create agent instances
const agents = submissionAgents.map(config => 
  loader.createAgent(config, { client_name: 'John Doe' })
);

// Execute agents in order
for (const agent of agents) {
  console.log(agent.getStartMessage());
  // ... execute agent logic
  console.log(agent.getCompletionMessage(results));
}
*/

module.exports = { AgentConfigLoader };