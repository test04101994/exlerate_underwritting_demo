# Agent Configuration System

This directory contains comprehensive configuration files for managing AI agents in submission and slip workflows.

## Directory Structure

```
config/
├── agents/                     # Agent-specific configurations
│   ├── submission-agents.json  # Agents for submission workflows
│   ├── slip-agents.json       # Agents for Lloyd's slip workflows
│   └── common-agents.json     # Shared agent configurations
├── workflows/                  # Workflow orchestration configs
│   ├── submission-workflow.json # Submission workflow definition
│   └── slip-workflow.json     # Slip workflow definition
├── templates/                  # Reusable templates
│   ├── agent-prompts.json     # AI model prompts and templates
│   ├── completion-messages.json # Agent completion messages
│   └── data-schemas.json      # Data validation schemas
└── README.md                  # This file
```

## Configuration Files Overview

### Agent Configurations

#### submission-agents.json
- **Purpose**: Defines all agents for insurance submission workflows
- **Agents**: Data Extraction, Sanctions Check, Premium Calculation, Email Draft, Email Sender, Final Decision
- **Features**: Human approval gates, AI model settings, validation rules

#### slip-agents.json
- **Purpose**: Defines all agents for Lloyd's slip processing workflows
- **Agents**: Data Extraction, Slip Validation, Coverage Analysis, Risk Assessment, Pricing, Documentation
- **Features**: Lloyd's market compliance, syndicate-specific processing, risk-based approvals

### Workflow Configurations

#### submission-workflow.json
- **Purpose**: Orchestrates submission workflow execution
- **Features**: Sequential processing, 2 approval gates, error handling, notifications
- **Duration**: ~145 seconds with 6 steps

#### slip-workflow.json
- **Purpose**: Orchestrates Lloyd's slip processing workflow
- **Features**: Complex validation, conditional approvals, risk escalation, comprehensive monitoring
- **Duration**: ~210 seconds with 6 steps

### Templates

#### agent-prompts.json
- **Purpose**: AI model prompts and context templates
- **Contents**: System prompts, context templates, output format specifications
- **Usage**: Dynamic prompt generation based on agent type and context

#### completion-messages.json
- **Purpose**: Agent progress and completion messages
- **Contents**: Work progress messages, completion summaries, approval prompts
- **Usage**: Real-time user feedback and workflow status updates

#### data-schemas.json
- **Purpose**: Data validation and structure definitions
- **Contents**: Input/output schemas, validation rules, confidence thresholds
- **Usage**: Ensures data integrity throughout workflow execution

## Key Features

### Dynamic Agent Creation
- Agents are created based on workflow type (submission/slip)
- Each agent has specific AI model settings and validation rules
- Supports conditional execution and dependency management

### Flexible Approval Gates
- Human approval points configurable per agent
- Conditional approvals based on risk levels or confidence scores
- Timeout and escalation policies for delayed approvals

### Comprehensive Monitoring
- Progress tracking with multiple stages per agent
- Confidence scoring and quality metrics
- Error handling and fallback strategies

### Data Validation
- Schema validation for all inputs and outputs
- Confidence threshold enforcement
- Numeric range validation and format checking

## Usage Examples

### Loading Agent Configuration
```javascript
const submissionAgents = require('./config/agents/submission-agents.json');
const slipAgents = require('./config/agents/slip-agents.json');

// Create agents based on workflow type
const agents = workflowType === 'submission' ? submissionAgents : slipAgents;
```

### Workflow Execution
```javascript
const workflow = require('./config/workflows/submission-workflow.json');

// Execute workflow steps sequentially
for (const step of workflow.steps) {
  await executeAgent(step.agentId, step.preconditions);
}
```

### Dynamic Prompt Generation
```javascript
const prompts = require('./config/templates/agent-prompts.json');

// Generate context-aware prompt
const prompt = prompts.contextTemplates.submission_context_template
  .replace('{client_name}', clientName)
  .replace('{broker_name}', brokerName);
```

## Configuration Management

### Version Control
- All configuration files are versioned
- Changes tracked through version numbers
- Backward compatibility maintained

### Environment-Specific Configs
- Development, staging, and production configurations
- Environment-specific overrides supported
- Secure handling of sensitive configuration data

### Validation
- JSON schema validation for all configuration files
- Required field checking and data type validation
- Configuration consistency checks across related files

## Customization Guide

### Adding New Agents
1. Define agent in appropriate agents/*.json file
2. Add corresponding prompts in agent-prompts.json
3. Create completion messages in completion-messages.json
4. Update workflow configuration to include new agent

### Modifying Workflows
1. Update workflow steps in workflows/*.json
2. Adjust approval gates and dependencies
3. Update data flow schemas if needed
4. Test workflow execution with new configuration

### Updating AI Models
1. Modify aiModel settings in agent configurations
2. Adjust token limits and temperature settings
3. Update prompts for new model capabilities
4. Test agent performance with new models

## Best Practices

1. **Consistency**: Use consistent naming conventions across all configuration files
2. **Validation**: Always validate configuration changes before deployment
3. **Documentation**: Document any custom modifications or extensions
4. **Testing**: Test configuration changes in development environment first
5. **Backup**: Maintain backups of working configurations before making changes

## Support

For questions or issues with configuration files:
1. Check the validation schemas in data-schemas.json
2. Review existing agent configurations for examples
3. Consult the workflow documentation for execution flow
4. Test changes in development environment before production deployment