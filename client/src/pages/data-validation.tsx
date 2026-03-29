import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft, CheckCircle, XCircle, Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import exlLogo from "@/assets/exl-logo.svg";
import ExtractionFieldsView, { type ExtractedField, groupBySection } from "@/components/extraction-fields-view";

interface ExtractionData {
  extraction_id: string;
  ticket_key: string;
  s3_uri: string;
  s3_key: string;
  status: string;
  created_at: string;
  extracted_data: ExtractedField[];
  pdfPresignedUrl?: string;
  pdfProxyUrl?: string;
}

// ── PDF Viewer ───────────────────────────────────────────────────────────────

function PdfViewer({
  url,
  highlightPage,
  highlightBbox,
}: {
  url: string;
  highlightPage: number | null;
  highlightBbox: number[] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCanvases, setPageCanvases] = useState<{ pageNum: number; width: number; height: number; dataUrl: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-worker.min.mjs";

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer } as any).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);

        const pages: typeof pageCanvases = [];
        const scale = 1.5;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          pages.push({ pageNum: i, width: viewport.width, height: viewport.height, dataUrl: canvas.toDataURL() });
        }
        if (!cancelled) { setPageCanvases(pages); setLoading(false); }
      } catch (e: any) {
        console.error("PDF load failed:", e);
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [url]);

  // Scroll to highlighted page
  useEffect(() => {
    if (highlightPage && containerRef.current) {
      const el = containerRef.current.querySelector(`[data-page="${highlightPage}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightPage, highlightBbox]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Loading PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-red-500">
        <span className="text-sm">Failed to load PDF: {error}</span>
      </div>
    );
  }

  if (pageCanvases.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No PDF preview available
      </div>
    );
  }

  const scale = 1.5;
  const hasBbox = highlightBbox && highlightBbox[2] > 0;

  return (
    <div ref={containerRef} className="overflow-auto h-full bg-gray-100 dark:bg-gray-900 p-3">
      {pageCanvases.map(({ pageNum, width, height, dataUrl }) => {
        const isHighlightedPage = highlightPage === pageNum;
        return (
          <div
            key={pageNum}
            data-page={pageNum}
            className={`relative mb-3 mx-auto shadow-md rounded overflow-hidden transition-all duration-300 ${
              isHighlightedPage ? "ring-2 ring-blue-400 shadow-lg shadow-blue-200/50" : ""
            }`}
            style={{ width, height }}
          >
            <img src={dataUrl} alt={`Page ${pageNum}`} style={{ width, height }} draggable={false} />

            {/* Bounding box highlight (when coordinates exist) */}
            {isHighlightedPage && hasBbox && highlightBbox && (
              <div
                className="absolute border-2 border-blue-500 bg-blue-400/20 rounded-sm"
                style={{
                  left: highlightBbox[0] * scale,
                  top: highlightBbox[1] * scale,
                  width: (highlightBbox[2] - highlightBbox[0]) * scale,
                  height: (highlightBbox[3] - highlightBbox[1]) * scale,
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            )}

            {/* Page-level highlight pulse (when no bounding box) */}
            {isHighlightedPage && !hasBbox && (
              <div className="absolute inset-0 border-2 border-blue-400 bg-blue-400/5 rounded animate-pulse pointer-events-none" />
            )}

            <div className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
              {pageNum} / {numPages}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DataValidation() {
  const [, params] = useRoute("/data-validation/:extractionId");
  const extractionId = params?.extractionId || "";
  const [, navigate] = useLocation();

  const [data, setData] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [highlightPage, setHighlightPage] = useState<number | null>(null);
  const [highlightBbox, setHighlightBbox] = useState<number[] | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState("");

  const urlParams = new URLSearchParams(window.location.search);
  const ticketKey = urlParams.get("ticket") || "";
  const submissionId = urlParams.get("submission") || "";
  const isSubmission = !!submissionId;

  // Fetch extraction data
  useEffect(() => {
    if (!extractionId) return;
    setLoading(true);
    const url = isSubmission
      ? `/api/submissions/${submissionId}/extractions/${extractionId}`
      : `/api/extractions/${extractionId}?ticketKey=${ticketKey}`;
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (d.s3_key) {
          const bucket = isSubmission ? `&bucket=${encodeURIComponent(d.bucket || "underwriting-app-emails")}` : "";
          d.pdfProxyUrl = `/api/pdf-proxy?key=${encodeURIComponent(d.s3_key)}${bucket}`;
        }
        setData(d);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [extractionId, ticketKey, submissionId, isSubmission]);

  const handleRowClick = useCallback((field: ExtractedField) => {
    setSelectedField(field.field_name);
    setHighlightPage(field.page);
    if (field.coordinates && field.coordinates[2] > 0) {
      setHighlightBbox(field.coordinates);
    } else {
      setHighlightBbox(null);
    }
  }, []);

  const updateField = useCallback(async (fieldName: string, action: string, correction?: string) => {
    if (!data) return;
    setSaving(true);
    try {
      const url = isSubmission
        ? `/api/submissions/${submissionId}/extractions/${extractionId}/update`
        : `/api/extractions/${extractionId}/update`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update_field",
          fieldName,
          fieldStatus: action,
          correction: correction || "",
          ticketKey: data.ticket_key || ticketKey,
        }),
      });
      const updated = await resp.json();
      if (!updated.error) setData(updated);
    } catch (e: any) { console.error(e); }
    setSaving(false);
    setEditingField(null);
    setCorrectionText("");
  }, [data, extractionId, ticketKey, submissionId, isSubmission]);

  const bulkAction = useCallback(async (action: "approve_all" | "reject_all") => {
    if (!data) return;
    setSaving(true);
    try {
      const url = isSubmission
        ? `/api/submissions/${submissionId}/extractions/${extractionId}/update`
        : `/api/extractions/${extractionId}/update`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, ticketKey: data.ticket_key || ticketKey }),
      });
      const updated = await resp.json();
      if (!updated.error) {
        setData(updated);
        if (action === "approve_all") {
          setTimeout(() => {
            if (isSubmission) {
              navigate(`/agent-testing?submission=${submissionId}&workflow=submissions`);
            } else {
              const tk = data.ticket_key || ticketKey;
              navigate(tk ? `/agent-testing?ticket=${tk}` : "/agent-testing");
            }
          }, 800);
        }
      }
    } catch (e: any) { console.error(e); }
    setSaving(false);
  }, [data, extractionId, ticketKey, submissionId, isSubmission, navigate]);

  // Loading / error states
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-muted-foreground">Loading extraction...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <p className="text-red-500">{error || "Extraction not found"}</p>
        <Button variant="outline" onClick={() => history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Go Back
        </Button>
      </div>
    );
  }

  const fields = data.extracted_data || [];
  const approved = fields.filter((f) => f.field_status === "approved").length;
  const rejected = fields.filter((f) => f.field_status === "rejected").length;
  const pending = fields.filter((f) => f.field_status === "pending").length;
  const pdfName = data.s3_key?.split("/").pop() || "Document";
  const sections = groupBySection(fields);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="h-12 border-b flex items-center justify-between px-4 bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
            if (isSubmission) {
              navigate(`/agent-testing?submission=${submissionId}&workflow=submissions`);
            } else {
              const tk = data.ticket_key || ticketKey;
              navigate(tk ? `/agent-testing?ticket=${tk}` : "/agent-testing");
            }
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <img src={exlLogo} alt="EXL" className="h-5" />
          <div className="border-l pl-3 ml-1">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">Data Validation</h1>
              {data.ticket_key && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{data.ticket_key}</Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight">{pdfName}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="w-40 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300 rounded-full"
                style={{ width: `${fields.length ? (approved / fields.length) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-medium">{approved}/{fields.length}</span>
          </div>

          <Badge variant="outline" className={`text-xs px-3 py-0.5 ${
            data.status === "approved" ? "bg-green-100 text-green-800 border-green-200" :
            data.status === "rejected" ? "bg-red-100 text-red-800 border-red-200" :
            "bg-yellow-100 text-yellow-800 border-yellow-200"
          }`}>
            {data.status === "pending_review" ? "Pending Review" : data.status?.charAt(0).toUpperCase() + data.status?.slice(1)}
          </Badge>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Fields — uses shared ExtractionFieldsView component */}
        <div className="w-[42%] flex flex-col border-r overflow-hidden">
          <div className="flex-1 overflow-auto">
            <ExtractionFieldsView
              fields={fields}
              interactive
              selectedField={selectedField}
              editingField={editingField}
              correctionText={correctionText}
              saving={saving}
              onFieldClick={(field) => {
                setSelectedField(`${field.field_name}-${field.group_index || 1}`);
                handleRowClick(field);
              }}
              onApproveField={(fieldName) => updateField(fieldName, "approved")}
              onStartEdit={(fieldKey, currentValue) => { setEditingField(fieldKey); setCorrectionText(currentValue); }}
              onSaveCorrection={(fieldName, correction) => updateField(fieldName, "rejected", correction)}
              onCancelEdit={() => { setEditingField(null); setCorrectionText(""); }}
              onCorrectionChange={setCorrectionText}
            />
          </div>

          {/* Bottom actions */}
          <div className="border-t px-4 py-3 bg-card flex-shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>{fields.length} fields · {Object.keys(sections).length} sections</span>
              <span>{approved} approved · {rejected} rejected · {pending} pending</span>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => bulkAction("approve_all")}
                disabled={saving || data.status === "approved"}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Approve & Continue
              </Button>
              <Button
                variant="destructive"
                onClick={() => bulkAction("reject_all")}
                disabled={saving || data.status === "rejected"}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-2" /> Reject & Stop
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT: PDF Viewer */}
        <div className="w-[58%] overflow-hidden flex flex-col">
          <div className="h-8 border-b flex items-center px-3 bg-muted/30 flex-shrink-0">
            <FileText className="h-3.5 w-3.5 text-red-500 mr-1.5" />
            <span className="text-xs font-medium truncate">{pdfName}</span>
            {highlightPage && (
              <Badge className="ml-auto text-[10px] h-4 bg-blue-100 text-blue-700">
                Page {highlightPage}
              </Badge>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {data.pdfProxyUrl || data.pdfPresignedUrl ? (
              <PdfViewer
                url={data.pdfProxyUrl || data.pdfPresignedUrl!}
                highlightPage={highlightPage}
                highlightBbox={highlightBbox}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                PDF preview not available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
