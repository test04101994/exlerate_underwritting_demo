import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertCircle, Edit2, Save, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'

export interface FieldSource {
  page: number
  bbox: [number, number, number, number]
}

interface ConfigurableJiraDataExtractionFormProps {
  sessionId: string
  onApprove: (data: any) => void
  onReject: (reason: string) => void
  onFieldFocus?: (source: FieldSource) => void
  onLocationChange?: (location: string) => void
  configEndpoint?: string
}

export default function ConfigurableJiraDataExtractionForm({
  sessionId,
  onApprove,
  onReject,
  onFieldFocus,
  onLocationChange,
  configEndpoint = '/api/jira-forms/data-extraction-config'
}: ConfigurableJiraDataExtractionFormProps) {
  const { toast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [extractedData, setExtractedData] = useState<any>(null)
  const [currentInstances, setCurrentInstances] = useState<{ [key: string]: number }>({})
  const [collapsedSections, setCollapsedSections] = useState<{ [key: string]: boolean }>({})
  const [assignedAdjuster, setAssignedAdjuster] = useState<string>('')
  const [modelState, setModelState] = useState<'hidden' | 'processing' | 'ready'>('hidden')

  // Claim FNOL form replaces "Quality Summary" + "Submission Triage" panels with
  // an adjuster-assignment dropdown + "Model Results" (Severity / Subrogation /
  // Litigation / SIU). Model Results only appears after an adjuster is picked,
  // and shows a processing state while the analytics model "runs".
  const isClaimForm = configEndpoint.includes('/claims-forms/')

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  // Fetch configurable form configuration
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['form-config', configEndpoint, sessionId],
    queryFn: async () => {
      const sep = configEndpoint.includes('?') ? '&' : '?'
      const response = await fetch(configEndpoint + sep + '_=' + Date.now())
      if (!response.ok) {
        throw new Error('Failed to fetch form configuration')
      }
      return response.json()
    },
    staleTime: 0,
    refetchOnMount: true
  })

  // Adjuster assignment + Model Results only show on forms that opt in via
  // `show_adjuster_assignment: true` in the form config (FNOL intake form).
  // Coverage Validation / Invoice Validation forms omit the flag, so those
  // forms are read-only data review with no adjuster picker or analytics gauges.
  // Declared AFTER the useQuery above so `config` is initialized before access.
  const showAdjusterAssignment = isClaimForm && (config as any)?.show_adjuster_assignment === true

  // Trigger the analytics-model processing animation when an adjuster gets selected
  useEffect(() => {
    if (!showAdjusterAssignment) return
    if (!assignedAdjuster) {
      setModelState('hidden')
      return
    }
    setModelState('processing')
    const t = setTimeout(() => setModelState('ready'), 2800)
    return () => clearTimeout(t)
  }, [assignedAdjuster, showAdjusterAssignment])

  // Initialize extracted data when config loads - always refresh when config changes
  useEffect(() => {
    if (config) {
      const initialData: any = {}
      const initialInstances: { [key: string]: number } = {}
      
      config.sections?.forEach((section: any) => {
        if (section.multiple_instances) {
          // Handle sections with multiple instances - initialize to first instance
          initialInstances[section.id] = 0
          section.multiple_instances.forEach((instance: any) => {
            instance.fields?.forEach((field: any) => {
              initialData[field.id] = field.value
            })
          })
        } else if (section.subsections) {
          // Handle sections with subsections
          section.subsections.forEach((subsection: any) => {
            subsection.fields?.forEach((field: any) => {
              initialData[field.id] = field.value
            })
          })
        } else {
          // Handle regular sections
          section.fields?.forEach((field: any) => {
            initialData[field.id] = field.value
          })
        }
      })
      console.log('Setting extracted data:', initialData)
      setExtractedData(initialData)
      setCurrentInstances(initialInstances)
    }
  }, [config])

  // Fire onLocationChange when property address fields change (for map updates)
  useEffect(() => {
    if (!onLocationChange || !extractedData) return
    const parts = [
      extractedData['property_address_line1'],
      extractedData['property_city'],
      extractedData['property_state'],
      extractedData['property_zip'],
    ].filter(Boolean)
    // Fall back to insured zip if property fields are empty
    const location = parts.length > 0 ? parts.join(', ') : (extractedData['insured_zip'] || '')
    onLocationChange(location)
  }, [
    extractedData?.property_address_line1,
    extractedData?.property_city,
    extractedData?.property_state,
    extractedData?.property_zip,
    extractedData?.insured_zip,
  ])

  // Helper function to get confidence badge matching slip form style
  const getConfidenceBadge = (field: any) => {
    if (field.confidence === 0) return null
    const confidence = field.confidence || 0.85
    const score = Math.round(confidence * 100)
    if (confidence >= 0.90) {
      return <Badge variant="default" className="bg-green-100 text-green-800">High ({score}%)</Badge>
    } else if (confidence >= 0.75) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Medium ({score}%)</Badge>
    } else {
      return <Badge variant="destructive" className="bg-red-100 text-red-800">Low ({score}%)</Badge>
    }
  }

  // Calculate confidence level counts for quality summary
  const calculateConfidenceCounts = () => {
    if (!config?.sections) return { high: 0, medium: 0, low: 0 }
    
    let high = 0, medium = 0, low = 0
    config.sections.forEach((section: any) => {
      if (section.multiple_instances) {
        // Handle sections with multiple instances - count all instances
        section.multiple_instances.forEach((instance: any) => {
          instance.fields?.forEach((field: any) => {
            const confidence = field.confidence || 0.85
            if (confidence >= 0.90) high++
            else if (confidence >= 0.75) medium++
            else low++
          })
        })
      } else if (section.subsections) {
        // Handle sections with subsections
        section.subsections.forEach((subsection: any) => {
          subsection.fields?.forEach((field: any) => {
            const confidence = field.confidence || 0.85
            if (confidence >= 0.90) high++
            else if (confidence >= 0.75) medium++
            else low++
          })
        })
      } else {
        // Handle regular sections
        section.fields?.forEach((field: any) => {
          const confidence = field.confidence || 0.85
          if (confidence >= 0.90) high++
          else if (confidence >= 0.75) medium++
          else low++
        })
      }
    })
    return { high, medium, low }
  }

  const confidenceCounts = calculateConfidenceCounts()

  const handleApprove = async () => {
    if (!extractedData) return
    
    toast({
      title: "Data Approved",
      description: "Jira data extraction has been approved. Continuing with workflow...",
      variant: "default",
    })
    
    onApprove(extractedData)
  }

  const handleReject = () => {
    toast({
      title: "Data Rejected",
      description: "Jira data extraction has been rejected.",
      variant: "destructive",
    })
    
    onReject("Data extraction quality insufficient")
  }

  const handleFieldClick = (field: any) => {
    if (onFieldFocus && field.source?.page && field.source?.bbox) {
      onFieldFocus({ page: field.source.page, bbox: field.source.bbox })
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading Jira data...</p>
      </div>
    )
  }

  // Show error state
  if (error) {
    console.error('[ConfigurableJiraForm] API error:', error)
    return (
      <div className="p-8 text-center text-red-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>Error loading form configuration: {error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    )
  }

  // Handle case where config is not found
  if (!config) {
    return (
      <div className="p-8 text-center text-orange-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>No configuration data available</p>
        <p className="text-sm text-gray-500 mt-2">
          Please check the configuration file or contact support.
        </p>
      </div>
    )
  }

  if (!extractedData) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Jira Data Available</h3>
              <p className="text-sm text-muted-foreground">
                No data found for session: {sessionId}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              {config.form_title || 'Data Extraction Completed - Human Review Required'}
            </CardTitle>
            <CardDescription>
              {config.form_description || 'Please review the extracted data below. You can edit any fields if needed, then approve or reject the extraction.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
          
          <div className="flex justify-end items-center">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2"
              >
                {isEditing ? (
                  <>
                    <Save className="h-4 w-4" />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Dynamic sections from configuration */}
          {config.sections?.map((section: any) => (
            <div key={section.id} className="space-y-3">
              {/* Orange collapsible section header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/15 text-orange-600 dark:text-orange-400 rounded-md transition-colors border border-orange-500/20"
              >
                <h4 className="text-sm font-semibold uppercase tracking-wide">{section.title}</h4>
                <div className="flex items-center gap-2">
                  {section.multiple_instances && !collapsedSections[section.id] && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const current = currentInstances[section.id] || 0
                          if (current > 0) setCurrentInstances(prev => ({ ...prev, [section.id]: current - 1 }))
                        }}
                        disabled={currentInstances[section.id] === 0}
                        className="px-1.5 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-40 rounded text-xs"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span className="text-xs font-medium px-2">
                        {(currentInstances[section.id] || 0) + 1} / {section.multiple_instances.length}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const current = currentInstances[section.id] || 0
                          if (current < section.multiple_instances.length - 1) setCurrentInstances(prev => ({ ...prev, [section.id]: current + 1 }))
                        }}
                        disabled={(currentInstances[section.id] || 0) >= section.multiple_instances.length - 1}
                        className="px-1.5 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-40 rounded text-xs"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="px-1.5 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 rounded text-xs ml-1"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        disabled={section.multiple_instances.length <= 1}
                        className="px-1.5 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-40 rounded text-xs"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {collapsedSections[section.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </div>
              </button>
              
              {/* Section content — hidden when collapsed */}
              {!collapsedSections[section.id] && (section.multiple_instances ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.multiple_instances[currentInstances[section.id] || 0]?.fields?.map((field: any) => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id} className="text-sm font-medium">{field.label}</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          field.type === 'textarea' ? (
                            <Textarea
                              id={field.id}
                              value={extractedData[field.id] || field.value || ''}
                              onChange={(e) => setExtractedData((prev: any) => ({ ...prev, [field.id]: e.target.value }))}
                              className="flex-1"
                              rows={3}
                            />
                          ) : field.type === 'select' ? (
                            <Select
                              value={extractedData[field.id] || field.value || ''}
                              onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder={`Select ${field.label}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={field.id}
                              type={field.type || 'text'}
                              value={extractedData[field.id] || field.value || ''}
                              onChange={(e) => setExtractedData((prev: any) => ({ ...prev, [field.id]: e.target.value }))}
                              className="flex-1"
                            />
                          )
                        ) : (
                          <div
                            className={`flex-1 p-2 bg-muted rounded-md text-sm text-foreground ${field.source?.page ? 'cursor-pointer hover:bg-orange-500/10 hover:border hover:border-orange-500/30 transition-colors' : ''}`}
                            onClick={() => handleFieldClick(field)}
                            title={field.source?.page ? `Click to jump to page ${field.source.page}` : undefined}
                          >
                            {extractedData[field.id] || field.value || 'N/A'}
                          </div>
                        )}
                        {getConfidenceBadge(field)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : section.subsections ? (
                <Tabs defaultValue={section.subsections[0]?.id} className="w-full">
                  <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${section.subsections.length}, minmax(0, 1fr))` }}>
                    {section.subsections.map((subsection: any) => (
                      <TabsTrigger key={subsection.id} value={subsection.id}>
                        {subsection.title}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {section.subsections.map((subsection: any) => (
                    <TabsContent key={subsection.id} value={subsection.id} className="mt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {subsection.fields?.map((field: any) => (
                          <div key={field.id} className="space-y-2">
                            <Label htmlFor={field.id} className="text-sm font-medium">{field.label}</Label>
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                field.type === 'textarea' ? (
                                  <Textarea
                                    id={field.id}
                                    value={extractedData[field.id] || field.value || ''}
                                    onChange={(e) => setExtractedData((prev: any) => ({ ...prev, [field.id]: e.target.value }))}
                                    className="flex-1"
                                    rows={3}
                                  />
                                ) : field.type === 'select' ? (
                                  <Select
                                    value={extractedData[field.id] || field.value || ''}
                                    onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                                  >
                                    <SelectTrigger className="flex-1">
                                      <SelectValue placeholder={`Select ${field.label}`} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                        <SelectItem key={option} value={option}>
                                          {option}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    id={field.id}
                                    type={field.type || 'text'}
                                    value={extractedData[field.id] || field.value || ''}
                                    onChange={(e) => setExtractedData((prev: any) => ({ ...prev, [field.id]: e.target.value }))}
                                    className="flex-1"
                                  />
                                )
                              ) : field.type === 'select' ? (
                                <Select
                                  value={extractedData[field.id] || field.value || ''}
                                  onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                                >
                                  <SelectTrigger className="flex-1">
                                    <SelectValue placeholder={`Select ${field.label}`} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                      <SelectItem key={option} value={option}>{option}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="flex-1 p-2 bg-muted rounded-md text-sm text-foreground">
                                  {extractedData[field.id] || field.value || 'N/A'}
                                </div>
                              )}
                              {getConfidenceBadge(field)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : section.id === 'clause_details' ? (
                /* Special two-column layout for clause details */
                <div className="space-y-3">
                  {section.fields?.map((field: any) => (
                    <div key={field.id} className="grid grid-cols-3 gap-4 items-center py-2 border-b border-border">
                      <div className="col-span-2">
                        <Label htmlFor={field.id} className="text-sm font-medium">{field.label}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Select
                            value={extractedData[field.id] || field.value || ''}
                            onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.type === 'select' ? (
                          <Select
                            value={extractedData[field.id] || field.value || ''}
                            onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder={`Select ${field.label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div
                            className={`flex-1 p-2 bg-muted rounded-md text-sm text-center text-foreground ${field.source?.page ? 'cursor-pointer hover:bg-orange-500/10 transition-colors' : ''}`}
                            onClick={() => handleFieldClick(field)}
                            title={field.source?.page ? `Click to jump to page ${field.source.page}` : undefined}
                          >
                            {extractedData[field.id] || field.value || 'N/A'}
                          </div>
                        )}
                        {getConfidenceBadge(field)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Regular section without subsections */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.fields?.map((field: any) => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id} className="text-sm font-medium">{field.label}</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          field.type === 'textarea' ? (
                            <Textarea
                              id={field.id}
                              value={extractedData[field.id] || field.value || ''}
                              onChange={(e) => setExtractedData((prev: any) => ({ ...prev, [field.id]: e.target.value }))}
                              className="flex-1"
                              rows={3}
                            />
                          ) : field.type === 'select' ? (
                            <Select
                              value={extractedData[field.id] || field.value || ''}
                              onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder={`Select ${field.label}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={field.id}
                              type={field.type || 'text'}
                              value={extractedData[field.id] || field.value || ''}
                              onChange={(e) => setExtractedData((prev: any) => ({ ...prev, [field.id]: e.target.value }))}
                              className="flex-1"
                            />
                          )
                        ) : field.type === 'select' ? (
                          <Select
                            value={extractedData[field.id] || field.value || ''}
                            onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder={`Select ${field.label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.type === 'select' ? (
                          <Select
                            value={extractedData[field.id] || field.value || ''}
                            onValueChange={(value) => setExtractedData((prev: any) => ({ ...prev, [field.id]: value }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder={`Select ${field.label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.filter((option: string) => option !== '').map((option: string) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div
                            className={`flex-1 p-2 bg-muted rounded-md text-sm text-foreground ${field.source?.page ? 'cursor-pointer hover:bg-orange-500/10 hover:border hover:border-orange-500/30 transition-colors' : ''}`}
                            onClick={() => handleFieldClick(field)}
                            title={field.source?.page ? `Click to jump to page ${field.source.page}` : undefined}
                          >
                            {extractedData[field.id] || field.value || 'N/A'}
                          </div>
                        )}
                        {getConfidenceBadge(field)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {/* Quality Summary — hidden for claim FNOL forms (replaced by Model Results) */}
          {!isClaimForm && (
            <div className="bg-muted p-4 rounded-lg border border-border">
              <h4 className="font-medium text-foreground mb-2">Quality Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{confidenceCounts.high}</div>
                  <div className="text-muted-foreground">High Confidence</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{confidenceCounts.medium}</div>
                  <div className="text-muted-foreground">Medium Confidence</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{confidenceCounts.low}</div>
                  <div className="text-muted-foreground">Low Confidence</div>
                </div>
              </div>
            </div>
          )}

          {/* Reusable gauge — used by Submission Triage and Claim Model Results */}
          {(() => {
            const CircleGauge = ({ pct, label }: { pct: number; label: string }) => {
              const r = 28;
              const circ = 2 * Math.PI * r;
              const color = pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444';
              const offset = circ * (1 - pct / 100);
              return (
                <div className="flex flex-col items-center gap-1">
                  <svg width="72" height="72" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r={r} fill="none" stroke="#E5E7EB" strokeWidth="6" />
                    <circle
                      cx="36" cy="36" r={r} fill="none"
                      stroke={color} strokeWidth="6"
                      strokeDasharray={circ}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      transform="rotate(-90 36 36)"
                    />
                    <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="bold" fill={color}>{pct}%</text>
                  </svg>
                  <span className="text-xs text-muted-foreground text-center">{label}</span>
                </div>
              );
            };

            if (showAdjusterAssignment) {
              // Claim FNOL flow:
              //   1. Adjuster dropdown (defaults to "Not selected")
              //   2. Once an adjuster is picked, the analytics model runs
              //      (~2.8s processing animation), then Model Results appears.
              return (
                <>
                  <div className="bg-muted p-4 rounded-lg border border-border">
                    <h4 className="font-medium text-foreground mb-1">Assign Adjuster</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Select the adjuster to handle this claim. Selecting an adjuster will run the analytics model and surface predicted exposure scores below.
                    </p>
                    <select
                      value={assignedAdjuster}
                      onChange={(e) => setAssignedAdjuster(e.target.value)}
                      className="w-full md:w-1/2 px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Not selected —</option>
                      <option value="Michael Brown">Michael Brown</option>
                      <option value="Rachel Green">Rachel Green</option>
                      <option value="David Lee">David Lee</option>
                      <option value="Sarah Mitchell">Sarah Mitchell</option>
                      <option value="Tom Wilson">Tom Wilson</option>
                    </select>
                  </div>

                  {/* Model Results — only after an adjuster is selected.
                      Shows a processing state for a couple of seconds, then the gauges. */}
                  {modelState === 'processing' && (
                    <div className="bg-muted p-6 rounded-lg border border-border">
                      <h4 className="font-medium text-foreground mb-1">Model Results</h4>
                      <p className="text-xs text-muted-foreground mb-4">Running analytics model for {assignedAdjuster}'s caseload…</p>
                      <div className="grid grid-cols-4 gap-2 items-end">
                        {['Severity', 'Subrogation', 'Litigation', 'SIU'].map((label, i) => (
                          <div key={label} className="flex flex-col items-center gap-1">
                            <div className="w-[72px] h-[72px] rounded-full border-4 border-muted-foreground/10 border-t-blue-500 animate-spin" style={{ animationDelay: `${i * 0.1}s`, animationDuration: '1.1s' }} />
                            <span className="text-xs text-muted-foreground text-center">{label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span>Scoring severity, subrogation potential, litigation risk, and SIU referral likelihood…</span>
                      </div>
                    </div>
                  )}

                  {modelState === 'ready' && (
                    <div className="bg-muted p-4 rounded-lg border border-border">
                      <h4 className="font-medium text-foreground mb-1">Model Results</h4>
                      <p className="text-xs text-muted-foreground mb-4">Predicted likelihood from the FNOL data — higher percentages indicate higher exposure on each dimension.</p>
                      <div className="grid grid-cols-4 gap-2 items-end">
                        <CircleGauge pct={72} label="Severity" />
                        <CircleGauge pct={18} label="Subrogation" />
                        <CircleGauge pct={35} label="Litigation" />
                        <CircleGauge pct={12} label="SIU" />
                      </div>
                    </div>
                  )}
                </>
              );
            }

            // Coverage Validation form (claim, no adjuster assignment) — render no extra panels
            if (isClaimForm) return null;

            // Submission/Jira flows keep Submission Triage
            const total = confidenceCounts.high + confidenceCounts.medium + confidenceCounts.low;
            const modelScore = total > 0 ? Math.round((confidenceCounts.high / total) * 100) : 0;
            const nonModelScore = total > 0 ? Math.round((confidenceCounts.medium / total) * 100) : 0;
            const compositeScore = Math.round((modelScore + nonModelScore) / 2);
            const ragColor = compositeScore >= 70 ? '#22C55E' : compositeScore >= 40 ? '#F59E0B' : '#EF4444';
            return (
              <div className="bg-muted p-4 rounded-lg border border-border">
                <h4 className="font-medium text-foreground mb-4">Submission Triage</h4>
                <div className="grid grid-cols-4 gap-2 items-end">
                  <CircleGauge pct={modelScore} label="Model Score" />
                  <CircleGauge pct={nonModelScore} label="Non Model Score" />
                  <CircleGauge pct={compositeScore} label="Composite Score" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-[56px] h-[56px] rounded-full" style={{ backgroundColor: ragColor }} />
                    <span className="text-xs text-muted-foreground text-center">RAG Status</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Action Buttons - matching slip form style */}
          <div className="flex gap-4 pt-4">
            <Button 
              onClick={handleApprove}
              className="flex-1 bg-green-600 hover:bg-green-700"
              data-testid="button-approve-extraction"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve & Continue
            </Button>
            <Button 
              onClick={handleReject}
              variant="destructive"
              className="flex-1"
              data-testid="button-reject-extraction"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Reject & Stop
            </Button>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}