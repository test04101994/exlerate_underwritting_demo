/**
 * Dynamic Form Generator - Creates React forms from JSON configuration
 * Supports CSV data integration, custom validation, and dynamic layouts
 */

import { z } from 'zod';

// Form configuration schema
export const formConfigSchema = z.object({
  version: z.string(),
  formId: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  layout: z.object({
    columns: z.number().default(2),
    spacing: z.string().default('4'),
    containerClass: z.string().default('max-w-6xl mx-auto p-6')
  }),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(['form', 'info', 'table', 'custom']),
    columns: z.number().default(2),
    styling: z.object({
      backgroundColor: z.string().default('bg-white'),
      borderColor: z.string().default('border-gray-200'),
      borderStyle: z.string().default('border rounded-lg'),
      padding: z.string().default('p-6'),
      marginBottom: z.string().default('mb-6')
    }),
    fields: z.array(z.object({
      id: z.string(),
      label: z.string(),
      type: z.enum(['text', 'email', 'number', 'date', 'datetime', 'currency', 'percentage', 'textarea', 'select', 'checkbox', 'address', 'phone']),
      csvField: z.string().optional(),
      csvFields: z.record(z.string()).optional(), // For composite fields like address
      gridPosition: z.string().default('col-span-1'),
      confidenceScore: z.enum(['high', 'medium', 'low']).default('medium'),
      order: z.number(),
      readonly: z.boolean().default(false),
      required: z.boolean().default(false),
      value: z.string().optional(),
      options: z.array(z.object({
        label: z.string(),
        value: z.string()
      })).optional(), // For select fields
      validation: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        pattern: z.string().optional(),
        message: z.string().optional()
      }).optional()
    }))
  })),
  actions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['primary', 'secondary', 'tertiary']),
    variant: z.string().default('default'),
    className: z.string().optional(),
    action: z.string()
  })),
  validation: z.object({
    requiredFields: z.array(z.string()),
    conditionalFields: z.record(z.object({
      condition: z.string(),
      additionalSections: z.array(z.string()).optional(),
      additionalFields: z.array(z.string()).optional()
    })).optional()
  }),
  confidence: z.object({
    thresholds: z.object({
      high: z.number().default(90),
      medium: z.number().default(70),
      low: z.number().default(50)
    }),
    colors: z.object({
      high: z.string().default('bg-green-100 text-green-800'),
      medium: z.string().default('bg-yellow-100 text-yellow-800'),
      low: z.string().default('bg-red-100 text-red-800')
    })
  })
});

export type FormConfig = z.infer<typeof formConfigSchema>;

// CSV Integration utilities
export interface CsvDataSource {
  getDataById(id: string): Record<string, any> | null;
  getAllIds(): string[];
  getFieldValue(id: string, field: string): string;
  hasMultipleEntries(id: string): boolean;
}

// Form field value resolver
export class FormFieldResolver {
  constructor(private csvDataSource: CsvDataSource) {}

  resolveFieldValue(fieldConfig: FormConfig['sections'][0]['fields'][0], recordId: string): string {
    if (fieldConfig.value === 'auto_generated') {
      return this.generateAutoValue(fieldConfig.type);
    }

    if (fieldConfig.csvField) {
      return this.csvDataSource.getFieldValue(recordId, fieldConfig.csvField) || '';
    }

    if (fieldConfig.csvFields) {
      return this.resolveCompositeField(fieldConfig.csvFields, recordId);
    }

    return fieldConfig.value || '';
  }

  private generateAutoValue(type: string): string {
    switch (type) {
      case 'datetime':
        return new Date().toISOString();
      case 'date':
        return new Date().toISOString().split('T')[0];
      default:
        return '';
    }
  }

  private resolveCompositeField(csvFields: Record<string, string>, recordId: string): string {
    const values = Object.entries(csvFields).map(([key, csvField]) => {
      const value = this.csvDataSource.getFieldValue(recordId, csvField);
      return value || '';
    });
    return values.filter(v => v.trim()).join(', ');
  }
}

// Dynamic form validator
export class FormValidator {
  constructor(private config: FormConfig) {}

  validateField(fieldId: string, value: string): { valid: boolean; message?: string } {
    const field = this.findField(fieldId);
    if (!field) return { valid: true };

    // Required field validation
    if (field.required && !value.trim()) {
      return { valid: false, message: `${field.label} is required` };
    }

    // Type-specific validation
    switch (field.type) {
      case 'email':
        return this.validateEmail(value);
      case 'number':
        return this.validateNumber(value, field.validation);
      case 'currency':
        return this.validateCurrency(value);
      case 'date':
        return this.validateDate(value);
      case 'phone':
        return this.validatePhone(value);
      default:
        return { valid: true };
    }
  }

  private findField(fieldId: string): FormConfig['sections'][0]['fields'][0] | undefined {
    for (const section of this.config.sections) {
      const field = section.fields.find(f => f.id === fieldId);
      if (field) return field;
    }
    return undefined;
  }

  private validateEmail(value: string): { valid: boolean; message?: string } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value.trim()) return { valid: true };
    if (!emailRegex.test(value)) {
      return { valid: false, message: 'Invalid email format' };
    }
    return { valid: true };
  }

  private validateNumber(value: string, validation?: FormConfig['sections'][0]['fields'][0]['validation']): { valid: boolean; message?: string } {
    if (!value.trim()) return { valid: true };
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, message: 'Must be a valid number' };
    }
    if (validation?.min && num < validation.min) {
      return { valid: false, message: `Must be at least ${validation.min}` };
    }
    if (validation?.max && num > validation.max) {
      return { valid: false, message: `Must be at most ${validation.max}` };
    }
    return { valid: true };
  }

  private validateCurrency(value: string): { valid: boolean; message?: string } {
    if (!value.trim()) return { valid: true };
    const currencyRegex = /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/;
    if (!currencyRegex.test(value.replace(/[£€¥]/, '$'))) {
      return { valid: false, message: 'Invalid currency format' };
    }
    return { valid: true };
  }

  private validateDate(value: string): { valid: boolean; message?: string } {
    if (!value.trim()) return { valid: true };
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, message: 'Invalid date format' };
    }
    return { valid: true };
  }

  private validatePhone(value: string): { valid: boolean; message?: string } {
    if (!value.trim()) return { valid: true };
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) {
      return { valid: false, message: 'Invalid phone number format' };
    }
    return { valid: true };
  }
}

// Confidence score calculator
export class ConfidenceCalculator {
  constructor(private config: FormConfig) {}

  calculateFieldConfidence(fieldId: string, csvData: Record<string, any>): {
    level: 'high' | 'medium' | 'low';
    score: number;
    color: string;
  } {
    const field = this.findField(fieldId);
    if (!field) return { level: 'medium', score: 75, color: this.config.confidence.colors.medium };

    // Base confidence from field configuration
    let confidence = this.getBaseConfidence(field.confidenceScore);

    // Adjust based on data quality
    const fieldValue = csvData[field.csvField || fieldId];
    if (fieldValue) {
      confidence += this.assessDataQuality(fieldValue, field.type);
    }

    // Determine level based on thresholds
    const level = this.determineConfidenceLevel(confidence);
    
    return {
      level,
      score: Math.min(99, Math.max(1, confidence)),
      color: this.config.confidence.colors[level]
    };
  }

  private findField(fieldId: string): FormConfig['sections'][0]['fields'][0] | undefined {
    for (const section of this.config.sections) {
      const field = section.fields.find(f => f.id === fieldId);
      if (field) return field;
    }
    return undefined;
  }

  private getBaseConfidence(level: 'high' | 'medium' | 'low'): number {
    switch (level) {
      case 'high': return 85;
      case 'medium': return 70;
      case 'low': return 55;
    }
  }

  private assessDataQuality(value: string, type: string): number {
    if (!value || value.trim() === '') return -20;
    
    switch (type) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 10 : -10;
      case 'currency':
        return /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(value) ? 5 : -5;
      case 'date':
        return !isNaN(new Date(value).getTime()) ? 5 : -10;
      case 'number':
        return !isNaN(parseFloat(value)) ? 5 : -10;
      default:
        return value.length > 10 ? 5 : 0;
    }
  }

  private determineConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= this.config.confidence.thresholds.high) return 'high';
    if (score >= this.config.confidence.thresholds.medium) return 'medium';
    return 'low';
  }
}

// Form layout generator
export class FormLayoutGenerator {
  constructor(private config: FormConfig) {}

  generateLayout(): {
    containerClass: string;
    sections: Array<{
      id: string;
      title: string;
      className: string;
      gridCols: string;
      fields: Array<{
        id: string;
        label: string;
        type: string;
        className: string;
        gridPosition: string;
        required: boolean;
        readonly: boolean;
      }>;
    }>;
    actions: Array<{
      id: string;
      label: string;
      className: string;
      type: string;
    }>;
  } {
    return {
      containerClass: this.config.layout.containerClass,
      sections: this.config.sections.map(section => ({
        id: section.id,
        title: section.title,
        className: this.buildSectionClassName(section),
        gridCols: this.getGridColsClass(section.columns),
        fields: section.fields
          .sort((a, b) => a.order - b.order)
          .map(field => ({
            id: field.id,
            label: field.label,
            type: field.type,
            className: this.buildFieldClassName(field),
            gridPosition: field.gridPosition,
            required: field.required,
            readonly: field.readonly
          }))
      })),
      actions: this.config.actions.map(action => ({
        id: action.id,
        label: action.label,
        className: this.buildActionClassName(action),
        type: action.type
      }))
    };
  }

  private buildSectionClassName(section: FormConfig['sections'][0]): string {
    const { styling } = section;
    return `${styling.backgroundColor} ${styling.borderColor} ${styling.borderStyle} ${styling.padding} ${styling.marginBottom}`;
  }

  private buildFieldClassName(field: FormConfig['sections'][0]['fields'][0]): string {
    const baseClass = 'w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent';
    const readonlyClass = field.readonly ? 'bg-gray-100 cursor-not-allowed' : 'bg-white';
    return `${baseClass} ${readonlyClass}`;
  }

  private buildActionClassName(action: FormConfig['actions'][0]): string {
    const baseClass = 'px-4 py-2 rounded-md font-medium transition-colors';
    const typeClass = action.type === 'primary' ? 'text-white' : 'text-gray-700';
    return `${baseClass} ${typeClass} ${action.className || ''}`;
  }

  private getGridColsClass(columns: number): string {
    const colsMap: Record<number, string> = {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
      5: 'grid-cols-5',
      6: 'grid-cols-6'
    };
    return colsMap[columns] || 'grid-cols-2';
  }
}

// Configuration loader
export class ConfigurationLoader {
  static async loadFormConfig(formType: 'submission' | 'slip'): Promise<FormConfig> {
    try {
      const configPath = `core/config/interfaces/${formType}-data-extraction.json`;
      const response = await fetch(`/api/config/${formType}-data-extraction`);
      
      if (!response.ok) {
        throw new Error(`Failed to load ${formType} configuration`);
      }
      
      const config = await response.json();
      return formConfigSchema.parse(config);
    } catch (error) {
      console.error(`Error loading ${formType} configuration:`, error);
      throw error;
    }
  }

  static validateConfig(config: any): FormConfig {
    return formConfigSchema.parse(config);
  }
}