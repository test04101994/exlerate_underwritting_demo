/**
 * Dynamic Interface Generator for Data Extraction Forms
 * Generates React components from interface configuration files
 */

const fs = require('fs');
const path = require('path');

class InterfaceGenerator {
  constructor(configPath = './config/interfaces') {
    this.configPath = configPath;
    this.interfaceCache = new Map();
  }

  /**
   * Load interface configuration
   * @param {string} workflowType - 'submission' or 'slip'
   * @returns {Object} Interface configuration
   */
  loadInterfaceConfig(workflowType) {
    const cacheKey = `${workflowType}-interface`;
    
    if (this.interfaceCache.has(cacheKey)) {
      return this.interfaceCache.get(cacheKey);
    }

    const configFile = path.join(this.configPath, `${workflowType}-data-extraction.json`);
    
    try {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      this.interfaceCache.set(cacheKey, config);
      return config;
    } catch (error) {
      console.error(`Failed to load interface config for ${workflowType}:`, error);
      return null;
    }
  }

  /**
   * Generate form fields from configuration
   * @param {Object} config - Interface configuration
   * @param {Object} csvData - CSV data to populate fields
   * @returns {Array} Array of form field components
   */
  generateFormFields(config, csvData = {}) {
    const fields = [];
    
    for (const section of config.sections) {
      const sectionFields = this.generateSectionFields(section, csvData);
      fields.push({
        section: section.title,
        fields: sectionFields
      });
    }
    
    return fields;
  }

  /**
   * Generate fields for a specific section
   * @param {Object} section - Section configuration
   * @param {Object} csvData - CSV data
   * @returns {Array} Array of field configurations
   */
  generateSectionFields(section, csvData) {
    const fields = [];
    
    if (section.type === 'field-grid') {
      for (const field of section.fields) {
        fields.push(this.generateField(field, csvData));
      }
    } else if (section.type === 'tabbed-section') {
      for (const tab of section.tabs) {
        for (const field of tab.fields) {
          fields.push(this.generateField(field, csvData));
        }
      }
    } else if (section.type === 'table') {
      fields.push(this.generateTableField(section, csvData));
    }
    
    return fields;
  }

  /**
   * Generate individual field configuration
   * @param {Object} fieldConfig - Field configuration
   * @param {Object} csvData - CSV data
   * @returns {Object} Field component configuration
   */
  generateField(fieldConfig, csvData) {
    const csvValue = csvData[fieldConfig.csvField] || '';
    const confidenceScore = this.calculateConfidenceScore(fieldConfig.confidenceScore);
    
    return {
      id: fieldConfig.id,
      label: fieldConfig.label,
      type: fieldConfig.type,
      value: csvValue,
      required: fieldConfig.required,
      editable: fieldConfig.editable,
      confidenceScore: confidenceScore,
      confidenceLevel: fieldConfig.confidenceScore,
      validation: fieldConfig.validation || {},
      placeholder: fieldConfig.placeholder || '',
      options: fieldConfig.options || [],
      prefix: fieldConfig.prefix || '',
      suffix: fieldConfig.suffix || '',
      rows: fieldConfig.rows || 1,
      gridPosition: fieldConfig.gridPosition || 'span-1',
      format: fieldConfig.format || 'text'
    };
  }

  /**
   * Generate table field configuration
   * @param {Object} section - Table section configuration
   * @param {Object} csvData - CSV data
   * @returns {Object} Table component configuration
   */
  generateTableField(section, csvData) {
    const columns = section.columns.map(col => ({
      id: col.id,
      label: col.label,
      type: col.type,
      required: col.required,
      editable: col.editable,
      confidenceScore: this.calculateConfidenceScore(col.confidenceScore),
      validation: col.validation || {},
      prefix: col.prefix || '',
      suffix: col.suffix || ''
    }));

    // Generate table rows from CSV data
    const rows = [];
    if (csvData.syndicate_participation) {
      rows.push({
        syndicate_number: csvData.syndicate_number || '',
        syndicate_name: csvData.syndicate_name || '',
        participation_percentage: csvData.participation_percentage || '',
        syndicate_capacity: csvData.syndicate_capacity || ''
      });
    }

    return {
      id: section.id,
      type: 'table',
      title: section.title,
      columns: columns,
      rows: rows,
      addable: section.addable || false,
      removable: section.removable || false
    };
  }

  /**
   * Calculate confidence score percentage
   * @param {string} level - Confidence level (high/medium/low)
   * @returns {number} Confidence percentage
   */
  calculateConfidenceScore(level) {
    const scores = {
      'high': Math.floor(Math.random() * 5) + 95,    // 95-99%
      'medium': Math.floor(Math.random() * 10) + 85, // 85-94%
      'low': Math.floor(Math.random() * 15) + 65      // 65-79%
    };
    
    return scores[level] || 80;
  }

  /**
   * Generate confidence badge configuration
   * @param {string} level - Confidence level
   * @param {number} percentage - Confidence percentage
   * @param {Object} styling - Styling configuration
   * @returns {Object} Badge configuration
   */
  generateConfidenceBadge(level, percentage, styling) {
    const badgeConfig = styling.confidenceBadges[level];
    
    return {
      level: level,
      percentage: percentage,
      label: badgeConfig.label.replace('{percentage}', percentage),
      color: badgeConfig.color,
      visible: true
    };
  }

  /**
   * Generate form actions from configuration
   * @param {Object} config - Interface configuration
   * @param {string} sessionId - Workflow session ID
   * @returns {Array} Array of action configurations
   */
  generateFormActions(config, sessionId) {
    const actions = [];
    
    if (config.actions.primary) {
      actions.push({
        id: 'primary',
        label: config.actions.primary.label,
        type: config.actions.primary.type,
        style: config.actions.primary.style,
        endpoint: config.actions.primary.endpoint.replace('{sessionId}', sessionId),
        method: config.actions.primary.method,
        confirmMessage: config.actions.primary.confirmMessage,
        successMessage: config.actions.primary.successMessage
      });
    }
    
    if (config.actions.secondary) {
      actions.push({
        id: 'secondary',
        label: config.actions.secondary.label,
        type: config.actions.secondary.type,
        style: config.actions.secondary.style,
        endpoint: config.actions.secondary.endpoint.replace('{sessionId}', sessionId),
        method: config.actions.secondary.method,
        confirmMessage: config.actions.secondary.confirmMessage,
        successMessage: config.actions.secondary.successMessage
      });
    }
    
    return actions;
  }

  /**
   * Generate validation rules from configuration
   * @param {Object} config - Interface configuration
   * @returns {Object} Validation rules
   */
  generateValidationRules(config) {
    const rules = {};
    
    for (const section of config.sections) {
      for (const field of section.fields || []) {
        if (field.validation) {
          rules[field.id] = {
            required: field.required,
            pattern: field.validation.pattern,
            min: field.validation.min,
            max: field.validation.max,
            message: field.validation.message,
            type: field.type
          };
        }
      }
    }
    
    return rules;
  }

  /**
   * Generate complete interface configuration
   * @param {string} workflowType - 'submission' or 'slip'
   * @param {Object} csvData - CSV data
   * @param {string} sessionId - Workflow session ID
   * @returns {Object} Complete interface configuration
   */
  generateInterface(workflowType, csvData, sessionId) {
    const config = this.loadInterfaceConfig(workflowType);
    if (!config) {
      throw new Error(`Interface configuration not found for ${workflowType}`);
    }

    return {
      title: config.interface.title,
      subtitle: config.interface.subtitle,
      formType: config.interface.formType,
      layout: config.interface.layout,
      submissionSelector: config.interface.submissionSelector,
      editButton: config.interface.editButton,
      sections: this.generateFormFields(config, csvData),
      actions: this.generateFormActions(config, sessionId),
      validation: this.generateValidationRules(config),
      styling: config.styling,
      dataSource: config.dataSource
    };
  }

  /**
   * Clear interface cache
   */
  clearCache() {
    this.interfaceCache.clear();
  }
}

// Usage Examples:
/*
const generator = new InterfaceGenerator('./config/interfaces');

// Generate submission interface
const submissionInterface = generator.generateInterface('submission', csvData, 'SUB-123');

// Generate slip interface
const slipInterface = generator.generateInterface('slip', csvData, 'SLP-456');

// Use in React component
const DataExtractionForm = ({ workflowType, csvData, sessionId }) => {
  const interfaceConfig = generator.generateInterface(workflowType, csvData, sessionId);
  return <DynamicForm config={interfaceConfig} />;
};
*/

module.exports = { InterfaceGenerator };