import { useState, useCallback } from "react";
import {
  CheckCircle, XCircle, Edit3, RotateCcw, ChevronDown, ChevronRight, ChevronLeft, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedField {
  field_name: string;
  value: string;
  confidence: number;
  page: number;
  coordinates: number[];
  field_status: "pending" | "approved" | "rejected";
  correction: string;
  section?: string;
  group_index?: number;
}

// ── Section Grouping ─────────────────────────────────────────────────────────

const SECTION_MAP: Record<string, string> = {
  insured_name: "Parties & Contacts",
  broker_name: "Parties & Contacts",
  insured_address: "Parties & Contacts",
  applicant_name: "Parties & Contacts",
  policyholder: "Parties & Contacts",
  contact_name: "Parties & Contacts",
  contact_email: "Parties & Contacts",

  policy_number: "Policy Information",
  policy_type: "Policy Information",
  risk_description: "Policy Information",
  coverage_type: "Policy Information",
  endorsement: "Policy Information",
  line_of_business: "Policy Information",

  effective_date: "Dates",
  expiration_date: "Dates",
  inception_date: "Dates",
  renewal_date: "Dates",
  created_date: "Dates",

  premium_amount: "Financial Details",
  coverage_limit: "Coverage Details",
  deductible: "Coverage Details",
  total_insured_value: "Financial Details",
  commission: "Financial Details",
  net_premium: "Financial Details",
  gross_premium: "Financial Details",
};

const SECTION_ORDER = [
  "Policy Information",
  "Parties & Contacts",
  "Dates",
  "Financial Details",
  "Coverage Details",
  "Other Details",
];

export function getSection(field: ExtractedField): string {
  if (field.section) return field.section;
  if (SECTION_MAP[field.field_name]) return SECTION_MAP[field.field_name];
  const base = field.field_name.replace(/_\d+$/, "");
  return SECTION_MAP[base] || "Other Details";
}

export function groupBySection(fields: ExtractedField[]): Record<string, ExtractedField[]> {
  const groups: Record<string, ExtractedField[]> = {};
  for (const f of fields) {
    const sec = getSection(f);
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(f);
  }
  const sorted: Record<string, ExtractedField[]> = {};
  for (const key of SECTION_ORDER) {
    if (groups[key]) sorted[key] = groups[key];
  }
  for (const [key, val] of Object.entries(groups)) {
    if (!sorted[key]) sorted[key] = val;
  }
  return sorted;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatFieldName(name: string): string {
  const indexMatch = name.match(/^(.+)_(\d+)$/);
  if (indexMatch) {
    const base = indexMatch[1].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return `${base} #${indexMatch[2]}`;
  }
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function confidenceBadge(c: number) {
  if (c >= 0.90) return { cls: "bg-green-100 text-green-800 border-green-200", label: "High" };
  if (c >= 0.75) return { cls: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Med" };
  return { cls: "bg-red-100 text-red-800 border-red-200", label: "Low" };
}

function statusIcon(s: string) {
  if (s === "approved") return <CheckCircle className="h-4 w-4 text-emerald-600" />;
  if (s === "rejected") return <XCircle className="h-4 w-4 text-red-500" />;
  return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
}

// ── Field Row Component ──────────────────────────────────────────────────────

function FieldRow({
  field,
  isSelected,
  interactive,
  isEditing,
  correctionText,
  saving,
  onRowClick,
  onApprove,
  onStartEdit,
  onSaveCorrection,
  onCancelEdit,
  onCorrectionChange,
}: {
  field: ExtractedField;
  isSelected?: boolean;
  interactive?: boolean;
  isEditing?: boolean;
  correctionText?: string;
  saving?: boolean;
  onRowClick?: () => void;
  onApprove?: () => void;
  onStartEdit?: () => void;
  onSaveCorrection?: () => void;
  onCancelEdit?: () => void;
  onCorrectionChange?: (val: string) => void;
}) {
  const cb = confidenceBadge(field.confidence);

  return (
    <div
      onClick={onRowClick}
      className={`px-4 py-3 transition-all border-b border-border ${
        onRowClick ? "cursor-pointer" : ""
      } ${
        isSelected
          ? "bg-orange-500/5 border-l-[3px] border-l-orange-500"
          : "hover:bg-muted/40 border-l-[3px] border-l-transparent"
      }`}
    >
      {/* Field label row */}
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-foreground">
          {formatFieldName(field.field_name)}
        </label>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <Badge className={`text-[10px] h-5 px-2 border ${cb.cls}`}>
            {cb.label} ({Math.round(field.confidence * 100)}%)
          </Badge>
          {field.page > 0 && <span className="text-[10px] text-muted-foreground">p.{field.page}</span>}
        </div>
      </div>

      {/* Value row */}
      {isEditing ? (
        <div className="flex gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
          <Input
            autoFocus
            value={correctionText || ""}
            onChange={(e) => onCorrectionChange?.(e.target.value)}
            className="h-8 text-sm"
            placeholder="Enter correct value..."
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveCorrection?.();
              if (e.key === "Escape") onCancelEdit?.();
            }}
          />
          <Button size="sm" className="h-8 text-xs px-3" onClick={onSaveCorrection}>Save</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs px-3" onClick={onCancelEdit}>Cancel</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className={`flex-1 p-2 bg-muted rounded-md text-sm text-foreground ${
            isSelected ? "ring-1 ring-orange-500/30" : ""
          } ${field.field_status === "rejected" ? "line-through text-muted-foreground" : ""}`}>
            {field.correction || field.value || <span className="italic text-muted-foreground text-xs">Not found</span>}
          </div>

          <div className="flex gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {statusIcon(field.field_status)}
            {interactive && field.field_status === "pending" && (
              <>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  onClick={onApprove}
                  disabled={saving}
                  title="Approve"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 w-7 p-0 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  onClick={onStartEdit}
                  disabled={saving}
                  title="Edit"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {field.correction && field.field_status === "rejected" && (
        <div className="mt-1.5 p-2 bg-emerald-50 dark:bg-emerald-950/20 rounded-md">
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <RotateCcw className="h-3 w-3" /> Corrected: <span className="font-medium">{field.correction}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Shared Component ────────────────────────────────────────────────────

interface ExtractionFieldsViewProps {
  fields: ExtractedField[];
  /** Enable per-field approve/edit/reject actions */
  interactive?: boolean;
  /** Currently selected field key */
  selectedField?: string | null;
  /** Currently editing field key */
  editingField?: string | null;
  correctionText?: string;
  saving?: boolean;
  onFieldClick?: (field: ExtractedField) => void;
  onApproveField?: (fieldName: string) => void;
  onStartEdit?: (fieldKey: string, currentValue: string) => void;
  onSaveCorrection?: (fieldName: string, correction: string) => void;
  onCancelEdit?: () => void;
  onCorrectionChange?: (val: string) => void;
}

export default function ExtractionFieldsView({
  fields,
  interactive = false,
  selectedField,
  editingField,
  correctionText,
  saving,
  onFieldClick,
  onApproveField,
  onStartEdit,
  onSaveCorrection,
  onCancelEdit,
  onCorrectionChange,
}: ExtractionFieldsViewProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [sectionGroupPage, setSectionGroupPage] = useState<Record<string, number>>({});

  const sections = groupBySection(fields);

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {Object.entries(sections).map(([section, sectionFields]) => {
        const isCollapsed = collapsedSections.has(section);

        // Group navigation
        const groupIndices = [...new Set(sectionFields.map(f => f.group_index || 1))].sort((a, b) => a - b);
        const totalGroups = groupIndices.length;
        const currentGroupIdx = sectionGroupPage[section] || groupIndices[0] || 1;
        const visibleFields = totalGroups > 1
          ? sectionFields.filter(f => (f.group_index || 1) === currentGroupIdx)
          : sectionFields;

        const sectionApproved = sectionFields.filter(f => f.field_status === "approved").length;
        const sectionTotal = sectionFields.length;
        const currentPage = groupIndices.indexOf(currentGroupIdx) + 1;

        return (
          <div key={section}>
            {/* Section Header */}
            <button
              type="button"
              onClick={() => toggleSection(section)}
              className="sticky top-0 z-10 w-full flex items-center justify-between px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/15 text-orange-600 dark:text-orange-400 border-b border-orange-500/20 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1">
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <h4 className="text-sm font-semibold uppercase tracking-wide">{section}</h4>
              </div>
              <div className="flex items-center gap-1.5">
                {totalGroups > 1 && (
                  <div className="flex items-center gap-0.5 mr-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        const prevIdx = groupIndices[Math.max(0, currentPage - 2)];
                        setSectionGroupPage(p => ({ ...p, [section]: prevIdx }));
                      }}
                      disabled={currentPage <= 1}
                      className="px-1.5 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-40 rounded text-xs"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <span className="text-xs font-medium px-2">
                      {currentPage}/{totalGroups}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextIdx = groupIndices[Math.min(totalGroups - 1, currentPage)];
                        setSectionGroupPage(p => ({ ...p, [section]: nextIdx }));
                      }}
                      disabled={currentPage >= totalGroups}
                      className="px-1.5 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-40 rounded text-xs"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="text-xs font-medium text-orange-600/70">{sectionApproved}/{sectionTotal}</span>
                {sectionApproved === sectionTotal && sectionTotal > 0 && (
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                )}
              </div>
            </button>

            {/* Fields */}
            {!isCollapsed && visibleFields.map((field) => {
              const fieldKey = `${field.field_name}-${field.group_index || 1}`;
              return (
                <FieldRow
                  key={fieldKey}
                  field={field}
                  isSelected={selectedField === fieldKey}
                  interactive={interactive}
                  isEditing={editingField === fieldKey}
                  correctionText={correctionText}
                  saving={saving}
                  onRowClick={onFieldClick ? () => onFieldClick(field) : undefined}
                  onApprove={onApproveField ? () => onApproveField(field.field_name) : undefined}
                  onStartEdit={onStartEdit ? () => onStartEdit(fieldKey, field.value) : undefined}
                  onSaveCorrection={onSaveCorrection ? () => onSaveCorrection(field.field_name, correctionText || "") : undefined}
                  onCancelEdit={onCancelEdit}
                  onCorrectionChange={onCorrectionChange}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
