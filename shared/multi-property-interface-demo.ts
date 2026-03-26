// Multi-Property Interface Demonstration for UW-2025-003
// This shows exactly how the form will render with multiple property sections

export interface MultiPropertyFormDemo {
  submissionId: string;
  clientName: string;
  brokerName: string;
  brokerEmail: string;
  sections: FormSection[];
}

export interface FormSection {
  id: string;
  title: string;
  type: string;
  columns: number;
  styling: SectionStyling;
  fields: FormField[];
}

export interface SectionStyling {
  backgroundColor: string;
  borderColor: string;
  borderStyle: string;
  padding: string;
  marginBottom: string;
}

export interface FormField {
  id: string;
  label: string;
  value: string;
  type: string;
  gridPosition: string;
  confidenceScore: string;
  confidencePercentage: number;
  badgeColor: string;
  order: number;
}

export const uw2025003Demo: MultiPropertyFormDemo = {
  submissionId: "UW-2025-003",
  clientName: "Emma Wilson",
  brokerName: "Emma Wilson",
  brokerEmail: "emma.wilson@willistowerswatson.com",
  sections: [
    {
      id: "client-information",
      title: "CLIENT INFORMATION",
      type: "field-grid",
      columns: 2,
      styling: {
        backgroundColor: "bg-white",
        borderColor: "border-gray-200",
        borderStyle: "border-b",
        padding: "pb-6",
        marginBottom: "mb-6"
      },
      fields: [
        {
          id: "client_name",
          label: "Client Name",
          value: "Emma Wilson",
          type: "text",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 98,
          badgeColor: "bg-green-100 text-green-800",
          order: 1
        },
        {
          id: "broker_name",
          label: "Broker Name",
          value: "Emma Wilson",
          type: "text",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 95,
          badgeColor: "bg-green-100 text-green-800",
          order: 2
        },
        {
          id: "broker_email",
          label: "Broker Email",
          value: "emma.wilson@willistowerswatson.com",
          type: "email",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 99,
          badgeColor: "bg-green-100 text-green-800",
          order: 3
        },
        {
          id: "policy_type",
          label: "Policy Type",
          value: "Multi-Property Home Insurance",
          type: "text",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 92,
          badgeColor: "bg-green-100 text-green-800",
          order: 4
        }
      ]
    },
    {
      id: "property-1-details",
      title: "PROPERTY 1 DETAILS",
      type: "field-grid",
      columns: 3,
      styling: {
        backgroundColor: "bg-blue-50",
        borderColor: "border-blue-400",
        borderStyle: "border-l-4",
        padding: "p-4 pl-4 rounded-r-lg",
        marginBottom: "mb-6"
      },
      fields: [
        {
          id: "property1_address",
          label: "Property Address",
          value: "156 The Gables, Park Avenue, Birmingham B15 2TH",
          type: "textarea",
          gridPosition: "span-3",
          confidenceScore: "high",
          confidencePercentage: 96,
          badgeColor: "bg-green-100 text-green-800",
          order: 1
        },
        {
          id: "property1_type",
          label: "Property Type",
          value: "House - Detached",
          type: "select",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 94,
          badgeColor: "bg-green-100 text-green-800",
          order: 2
        },
        {
          id: "property1_value",
          label: "Property Value",
          value: "£850,000",
          type: "currency",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 91,
          badgeColor: "bg-green-100 text-green-800",
          order: 3
        },
        {
          id: "property1_year_built",
          label: "Year Built",
          value: "1985",
          type: "number",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 78,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 4
        },
        {
          id: "property1_bedrooms",
          label: "Bedrooms",
          value: "4",
          type: "number",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 85,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 5
        },
        {
          id: "property1_bathrooms",
          label: "Bathrooms",
          value: "3",
          type: "number",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 82,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 6
        },
        {
          id: "property1_construction_type",
          label: "Construction Type",
          value: "Brick",
          type: "select",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 76,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 7
        },
        {
          id: "property1_roof_type",
          label: "Roof Type",
          value: "Tiles",
          type: "select",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 73,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 8
        },
        {
          id: "property1_security_features",
          label: "Security Features",
          value: "Alarm System, CCTV, Motion Sensors",
          type: "text",
          gridPosition: "span-2",
          confidenceScore: "low",
          confidencePercentage: 65,
          badgeColor: "bg-red-100 text-red-800",
          order: 9
        }
      ]
    },
    {
      id: "property-2-details",
      title: "PROPERTY 2 DETAILS",
      type: "field-grid",
      columns: 3,
      styling: {
        backgroundColor: "bg-green-50",
        borderColor: "border-green-400",
        borderStyle: "border-l-4",
        padding: "p-4 pl-4 rounded-r-lg",
        marginBottom: "mb-6"
      },
      fields: [
        {
          id: "property2_address",
          label: "Property Address",
          value: "42 Seaside Cottage, Coastal Road, Brighton BN1 3AN",
          type: "textarea",
          gridPosition: "span-3",
          confidenceScore: "high",
          confidencePercentage: 93,
          badgeColor: "bg-green-100 text-green-800",
          order: 1
        },
        {
          id: "property2_type",
          label: "Property Type",
          value: "House - Terraced",
          type: "select",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 89,
          badgeColor: "bg-green-100 text-green-800",
          order: 2
        },
        {
          id: "property2_value",
          label: "Property Value",
          value: "£725,000",
          type: "currency",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 88,
          badgeColor: "bg-green-100 text-green-800",
          order: 3
        },
        {
          id: "property2_year_built",
          label: "Year Built",
          value: "1920",
          type: "number",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 81,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 4
        },
        {
          id: "property2_bedrooms",
          label: "Bedrooms",
          value: "3",
          type: "number",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 86,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 5
        },
        {
          id: "property2_bathrooms",
          label: "Bathrooms",
          value: "2",
          type: "number",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 84,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 6
        },
        {
          id: "property2_construction_type",
          label: "Construction Type",
          value: "Stone",
          type: "select",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 79,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 7
        },
        {
          id: "property2_roof_type",
          label: "Roof Type",
          value: "Slate",
          type: "select",
          gridPosition: "span-1",
          confidenceScore: "medium",
          confidencePercentage: 77,
          badgeColor: "bg-yellow-100 text-yellow-800",
          order: 8
        },
        {
          id: "property2_security_features",
          label: "Security Features",
          value: "Smart Door Locks, Window Sensors",
          type: "text",
          gridPosition: "span-2",
          confidenceScore: "low",
          confidencePercentage: 62,
          badgeColor: "bg-red-100 text-red-800",
          order: 9
        }
      ]
    },
    {
      id: "summary-information",
      title: "SUMMARY INFORMATION",
      type: "field-grid",
      columns: 2,
      styling: {
        backgroundColor: "bg-gray-50",
        borderColor: "border-gray-400",
        borderStyle: "border-l-4",
        padding: "p-4 pl-4 rounded-r-lg",
        marginBottom: "mb-6"
      },
      fields: [
        {
          id: "total_property_value",
          label: "Total Property Value",
          value: "£1,575,000",
          type: "currency",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 100,
          badgeColor: "bg-green-100 text-green-800",
          order: 1
        },
        {
          id: "property_count",
          label: "Number of Properties",
          value: "2",
          type: "number",
          gridPosition: "span-1",
          confidenceScore: "high",
          confidencePercentage: 100,
          badgeColor: "bg-green-100 text-green-800",
          order: 2
        }
      ]
    }
  ]
};

// Function to generate layout visualization
export function generateLayoutVisualization(demo: MultiPropertyFormDemo): string {
  return `
# Multi-Property Form Layout Visualization for ${demo.submissionId}

## CLIENT INFORMATION (2 columns, white background)
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT INFORMATION                        │
│  [Emma Wilson] High 98%         [Emma Wilson] High 95%      │
│  [emma.wilson@...] High 99%     [Multi-Property...] High 92%│
└─────────────────────────────────────────────────────────────┘

## PROPERTY 1 DETAILS (3 columns, blue background)
┌─────────────────────────────────────────────────────────────┐
│ │ PROPERTY 1 DETAILS (Blue Background)                      │
│ │ [156 The Gables, Park Avenue, Birmingham B15 2TH]         │
│ │ High 96% - Full Width                                      │
│ │ [House - Detached] [£850,000]      [1985]                │
│ │ High 94%           High 91%        Medium 78%             │
│ │ [4]                [3]             [Brick]                │
│ │ Medium 85%         Medium 82%      Medium 76%             │
│ │ [Tiles]            [Alarm System, CCTV, Motion Sensors]  │
│ │ Medium 73%         Low 65% - 2 Columns                   │
└─────────────────────────────────────────────────────────────┘

## PROPERTY 2 DETAILS (3 columns, green background)
┌─────────────────────────────────────────────────────────────┐
│ │ PROPERTY 2 DETAILS (Green Background)                     │
│ │ [42 Seaside Cottage, Coastal Road, Brighton BN1 3AN]     │
│ │ High 93% - Full Width                                      │
│ │ [House - Terraced] [£725,000]      [1920]                │
│ │ High 89%           High 88%        Medium 81%             │
│ │ [3]                [2]             [Stone]                │
│ │ Medium 86%         Medium 84%      Medium 79%             │
│ │ [Slate]            [Smart Door Locks, Window Sensors]    │
│ │ Medium 77%         Low 62% - 2 Columns                   │
└─────────────────────────────────────────────────────────────┘

## SUMMARY INFORMATION (2 columns, gray background)
┌─────────────────────────────────────────────────────────────┐
│ │ SUMMARY INFORMATION (Gray Background)                     │
│ │ [£1,575,000]                [2]                          │
│ │ High 100%                   High 100%                    │
└─────────────────────────────────────────────────────────────┘

## Action Buttons
┌─────────────────────────────────────────────────────────────┐
│  [Approve & Continue] (Green)    [Reject & Stop] (Red)      │
└─────────────────────────────────────────────────────────────┘
  `;
}

// Example usage
export const uw2025003LayoutVisualization = generateLayoutVisualization(uw2025003Demo);

// Function to render confidence badges
export function renderConfidenceBadge(score: string, percentage: number): string {
  const colors = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-red-100 text-red-800'
  };
  
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[score as keyof typeof colors]}">${score.toUpperCase()} (${percentage}%)</span>`;
}

// Function to get field layout CSS classes
export function getFieldLayoutClasses(gridPosition: string, columns: number): string {
  const baseClasses = 'w-full px-3 py-2 border border-gray-300 rounded-md';
  
  switch (gridPosition) {
    case 'span-1':
      return `${baseClasses} col-span-1`;
    case 'span-2':
      return `${baseClasses} col-span-2`;
    case 'span-3':
      return `${baseClasses} col-span-3`;
    case 'span-full':
      return `${baseClasses} col-span-full`;
    default:
      return baseClasses;
  }
}