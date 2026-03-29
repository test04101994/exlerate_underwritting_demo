/**
 * ConfigurableForm - Dynamic form component that renders from JSON configuration
 * Supports CSV data integration and real-time validation
 */

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  FormConfig, 
  FormFieldResolver, 
  FormValidator, 
  ConfidenceCalculator, 
  FormLayoutGenerator,
  CsvDataSource 
} from '@shared/configurable-forms';

interface ConfigurableFormProps {
  config: FormConfig;
  csvDataSource: CsvDataSource;
  recordId: string;
  onSubmit: (action: string, data: Record<string, any>) => void;
  onFieldChange?: (fieldId: string, value: string) => void;
}

export function ConfigurableForm({ 
  config, 
  csvDataSource, 
  recordId, 
  onSubmit, 
  onFieldChange 
}: ConfigurableFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Initialize form utilities
  const fieldResolver = useMemo(() => new FormFieldResolver(csvDataSource), [csvDataSource]);
  const validator = useMemo(() => new FormValidator(config), [config]);
  const confidenceCalculator = useMemo(() => new ConfidenceCalculator(config), [config]);
  const layoutGenerator = useMemo(() => new FormLayoutGenerator(config), [config]);

  // Generate layout
  const layout = useMemo(() => layoutGenerator.generateLayout(), [layoutGenerator]);

  // Initialize form data from CSV
  useEffect(() => {
    const initialData: Record<string, any> = {};
    
    config.sections.forEach(section => {
      section.fields.forEach(field => {
        const value = fieldResolver.resolveFieldValue(field, recordId);
        initialData[field.id] = value;
      });
    });

    setFormData(initialData);
  }, [config, recordId, fieldResolver]);

  // Handle field value changes
  const handleFieldChange = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    
    // Validate field
    const validation = validator.validateField(fieldId, value);
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (validation.valid) {
        delete newErrors[fieldId];
      } else {
        newErrors[fieldId] = validation.message || 'Invalid value';
      }
      return newErrors;
    });

    // Notify parent component
    onFieldChange?.(fieldId, value);
  };

  // Render field based on type
  const renderField = (field: any, sectionId: string) => {
    const fieldValue = formData[field.id] || '';
    const hasError = validationErrors[field.id];
    const confidence = confidenceCalculator.calculateFieldConfidence(field.id, formData);
    const isReadonly = field.readonly || !isEditing;

    const fieldProps = {
      id: field.id,
      value: fieldValue,
      onChange: (e: any) => handleFieldChange(field.id, e.target.value),
      className: `${field.className} ${hasError ? 'border-red-500' : ''}`,
      disabled: isReadonly,
      required: field.required
    };

    let fieldElement;

    switch (field.type) {
      case 'textarea':
        fieldElement = (
          <Textarea
            {...fieldProps}
            rows={3}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
        break;

      case 'select':
        fieldElement = (
          <Select value={fieldValue} onValueChange={(value) => handleFieldChange(field.id, value)}>
            <SelectTrigger className={field.className}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;

      case 'checkbox':
        fieldElement = (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.id}
              checked={fieldValue === 'true' || fieldValue === true}
              onCheckedChange={(checked) => handleFieldChange(field.id, checked ? 'true' : 'false')}
              disabled={isReadonly}
            />
            <Label htmlFor={field.id} className="text-sm font-medium">
              {field.label}
            </Label>
          </div>
        );
        break;

      case 'currency':
        fieldElement = (
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">£</span>
            <Input
              {...fieldProps}
              type="text"
              placeholder="0.00"
              className={`${field.className} pl-8`}
            />
          </div>
        );
        break;

      case 'percentage':
        fieldElement = (
          <div className="relative">
            <Input
              {...fieldProps}
              type="number"
              placeholder="0"
              min="0"
              max="100"
              className={field.className}
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
          </div>
        );
        break;

      case 'date':
        fieldElement = (
          <Input
            {...fieldProps}
            type="date"
            className={field.className}
          />
        );
        break;

      case 'datetime':
        fieldElement = (
          <Input
            {...fieldProps}
            type="datetime-local"
            className={field.className}
          />
        );
        break;

      case 'email':
        fieldElement = (
          <Input
            {...fieldProps}
            type="email"
            placeholder="example@company.com"
            className={field.className}
          />
        );
        break;

      case 'number':
        fieldElement = (
          <Input
            {...fieldProps}
            type="number"
            placeholder="0"
            className={field.className}
          />
        );
        break;

      case 'phone':
        fieldElement = (
          <Input
            {...fieldProps}
            type="tel"
            placeholder="+44 20 7123 4567"
            className={field.className}
          />
        );
        break;

      default:
        fieldElement = (
          <Input
            {...fieldProps}
            type="text"
            placeholder={`Enter ${field.label.toLowerCase()}`}
            className={field.className}
          />
        );
    }

    return (
      <div key={field.id} className={field.gridPosition}>
        {field.type !== 'checkbox' && (
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor={field.id} className="text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {!isReadonly && (
              <Badge className={confidence.color}>
                {confidence.level.toUpperCase()} ({confidence.score}%)
              </Badge>
            )}
          </div>
        )}
        
        {fieldElement}
        
        {hasError && (
          <p className="mt-1 text-sm text-red-600">{validationErrors[field.id]}</p>
        )}
      </div>
    );
  };

  // Handle form submission
  const handleSubmit = (actionId: string) => {
    const action = config.actions.find(a => a.id === actionId);
    if (!action) return;

    // Validate required fields
    const errors: Record<string, string> = {};
    config.validation.requiredFields.forEach(fieldId => {
      const value = formData[fieldId];
      if (!value || value.toString().trim() === '') {
        const field = config.sections.flatMap(s => s.fields).find(f => f.id === fieldId);
        errors[fieldId] = `${field?.label || fieldId} is required`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast({
        title: 'Validation Error',
        description: 'Please fix the required fields before submitting.',
        variant: 'destructive'
      });
      return;
    }

    // Submit form data
    onSubmit(action.action, formData);
  };

  return (
    <div className={layout.containerClass}>
      {/* Form Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{config.title}</h1>
        {config.subtitle && (
          <p className="text-gray-600">{config.subtitle}</p>
        )}
      </div>

      {/* Form Sections */}
      {layout.sections.map(section => (
        <Card key={section.id} className={section.className}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid ${section.gridCols} gap-4`}>
              {section.fields.map(field => {
                const configField = config.sections
                  .find(s => s.id === section.id)
                  ?.fields.find(f => f.id === field.id);
                return configField ? renderField(configField, section.id) : null;
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Form Actions */}
      <div className="flex justify-end space-x-4 mt-8">
        {!isEditing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsEditing(true)}
            className="px-6 py-2"
          >
            Edit Fields
          </Button>
        )}
        
        {layout.actions.map(action => (
          <Button
            key={action.id}
            type="button"
            onClick={() => handleSubmit(action.id)}
            className={action.className}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}