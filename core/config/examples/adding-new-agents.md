# Adding New Agents Using Configuration

This guide shows how to add new agents to your workflow using only configuration files - no code changes required!

## Step 1: Define the New Agent

Add your agent to the appropriate config file (`submission-agents.json` or `slip-agents.json`):

```json
{
  "id": "fraud-detection",
  "name": "Fraud Detection Agent",
  "type": "security",
  "role": "fraud_analyst",
  "executionOrder": 3,
  "required": true,
  "aiModel": {
    "provider": "openrouter",
    "model": "gpt-4o-mini",
    "maxTokens": 350,
    "temperature": 0.1
  },
  "prompt": {
    "systemPrompt": "fraud_detection_prompt",
    "contextTemplate": "fraud_context_template",
    "outputFormat": "fraud_assessment"
  },
  "validation": {
    "requiredFields": ["fraud_score", "risk_indicators", "recommendation"],
    "confidenceThreshold": 0.9,
    "allowedValues": {
      "recommendation": ["approve", "reject", "investigate", "escalate"]
    }
  },
  "approval": {
    "requiresHumanApproval": "conditional",
    "approvalCondition": "fraud_score > 0.7",
    "approvalType": "fraud_override",
    "pauseWorkflow": true
  },
  "dependencies": ["sanctions-check"],
  "progressTracking": {
    "stages": ["scanning", "analyzing", "scoring", "completed"],
    "estimatedDuration": 40
  }
}
```

## Step 2: Add Agent Prompts

Update `config/templates/agent-prompts.json`:

```json
{
  "systemPrompts": {
    "fraud_detection_prompt": "You are an expert fraud detection specialist. Analyze client data, transaction patterns, and risk indicators to identify potential fraudulent activity. Provide detailed fraud risk assessment with confidence scoring."
  },
  "contextTemplates": {
    "fraud_context_template": "Analyze fraud risk for client: {client_name}, Policy amount: {policy_amount}, Transaction history: {transaction_history}, Risk factors: {risk_factors}. Provide comprehensive fraud assessment."
  },
  "outputFormats": {
    "fraud_assessment": {
      "format": "JSON",
      "required_fields": ["fraud_score", "risk_indicators", "recommendation", "confidence_score"],
      "optional_fields": ["investigation_notes", "escalation_reasons"]
    }
  }
}
```

## Step 3: Add Completion Messages

Update `config/templates/completion-messages.json`:

```json
{
  "workMessages": {
    "fraud-detection": {
      "started": "Fraud Detection Agent started analyzing client data...",
      "progress": [
        "Scanning client information and transaction history...",
        "Analyzing patterns for fraud indicators...",
        "Cross-referencing with fraud databases...",
        "Calculating fraud risk score...",
        "Preparing fraud assessment report..."
      ],
      "completed": "Fraud Detection Agent completed successfully.\n\nFraud Assessment:\n• Fraud Score: {fraud_score}/100\n• Risk Level: {risk_level}\n• Key Indicators: {risk_indicators}\n• Recommendation: {recommendation}\n• Investigation Notes: {investigation_notes}\n\nConfidence Score: {confidence_score}/100\nStatus: {final_status}"
    }
  },
  "approvalMessages": {
    "fraud_override": {
      "prompt": "Fraud detection flagged potential issues. Please review and approve to override or reject to investigate.",
      "success": "Fraud override approved. Workflow continuing with elevated monitoring.",
      "rejection": "Fraud override rejected. Case escalated to fraud investigation team."
    }
  }
}
```

## Step 4: Update Workflow Configuration

Update `config/workflows/submission-workflow.json` to include your new agent:

```json
{
  "steps": [
    {
      "stepId": "step-3",
      "agentId": "fraud-detection",
      "name": "Fraud Detection",
      "description": "Analyze client data for potential fraudulent activity",
      "executionType": "sequential",
      "preconditions": ["sanctions_cleared"],
      "postconditions": ["fraud_assessed"],
      "conditionalExecution": {
        "escalateIf": "fraud_score_high_risk"
      },
      "errorHandling": {
        "onFailure": "escalate_to_fraud_team",
        "notifyUsers": ["fraud_analyst", "underwriter"],
        "escalationLevel": "high"
      },
      "monitoring": {
        "trackProgress": true,
        "logLevel": "detailed",
        "metrics": ["fraud_accuracy", "false_positive_rate", "processing_time"]
      }
    }
  ]
}
```

## Step 5: Add Data Schema (Optional)

Update `config/templates/data-schemas.json`:

```json
{
  "intermediateSchemas": {
    "fraud_assessment_schema": {
      "type": "object",
      "required": ["fraud_score", "risk_indicators", "recommendation"],
      "properties": {
        "fraud_score": {"type": "number", "minimum": 0, "maximum": 100},
        "risk_indicators": {"type": "array", "items": {"type": "string"}},
        "recommendation": {"type": "string", "enum": ["approve", "reject", "investigate", "escalate"]},
        "confidence_score": {"type": "number", "minimum": 0, "maximum": 100},
        "investigation_notes": {"type": "string"}
      }
    }
  }
}
```

## Agent Types You Can Add

### Security Agents
- **Fraud Detection**: Analyze transaction patterns
- **Identity Verification**: Verify client identities
- **Credit Check**: Assess creditworthiness
- **Background Screening**: Check criminal/regulatory history

### Specialized Analysis Agents
- **Property Valuation**: Assess property values
- **Medical Review**: Analyze medical records
- **Legal Compliance**: Check regulatory compliance
- **Financial Analysis**: Deep dive into financial data

### Communication Agents
- **SMS Sender**: Send text message notifications
- **Document Generator**: Create policy documents
- **Report Writer**: Generate detailed reports
- **Translation**: Translate documents

### Integration Agents
- **External API**: Connect to third-party services
- **Database Sync**: Sync with external databases
- **File Processor**: Process uploaded files
- **Notification Hub**: Send multi-channel notifications

## Best Practices

1. **Execution Order**: Set appropriate `executionOrder` to control sequence
2. **Dependencies**: Define which agents must complete before this one runs
3. **Conditional Logic**: Use `requiresHumanApproval` conditions for complex decisions
4. **Error Handling**: Define what happens when the agent fails
5. **Progress Tracking**: Break work into logical stages for user feedback
6. **Validation**: Set appropriate confidence thresholds and required fields

## Testing New Agents

1. **Validation**: Check JSON syntax in all config files
2. **Dependencies**: Ensure all referenced agents exist
3. **Templates**: Verify all prompt and message templates are defined
4. **Workflow**: Test the complete workflow with new agent included
5. **Approval Flow**: Test conditional approvals and error scenarios

The system will automatically load your new agents and include them in workflows based on the configuration!