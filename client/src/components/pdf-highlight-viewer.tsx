import { useEffect, useRef, useState, useCallback } from 'react';
// Use the legacy build — compatible with browsers that lack Promise.try / Promise.withResolvers
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Worker served as a static public asset — no Vite transformation, always reachable
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker.min.mjs';

export interface HighlightTarget {
  page: number;       // 1-based page number
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] PDF points, origin bottom-left
}

interface PDFHighlightViewerProps {
  url: string;
  highlight: HighlightTarget | null;
  zoom?: number;
}

export function PDFHighlightViewer({ url, highlight, zoom = 100 }: PDFHighlightViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const pdfDocRef = useRef<any>(null);

  // Load PDF when url changes
  useEffect(() => {
    let cancelled = false;
    let loadingTask: any = null;
    setPdfDoc(null);
    pdfDocRef.current = null;
    setNumPages(0);
    setError(null);
    setLoading(true);

    console.log('[PDFViewer] Fetching PDF bytes from:', url);

    // Fetch bytes first — avoids all pdfjs URL-handling quirks
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);
        return res.arrayBuffer();
      })
      .then(buf => {
        if (cancelled) return;
        console.log('[PDFViewer] Fetched', buf.byteLength, 'bytes, handing to pdfjs');
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        return loadingTask.promise;
      })
      .then((doc: any) => {
        if (cancelled) return;
        console.log('[PDFViewer] PDF parsed, pages:', doc.numPages);
        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error('[PDFViewer] load error:', err);
        setError(`Failed to load PDF: ${err.message}`);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [url]);

  const renderPage = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current;
    if (!doc) return;

    const container = pageRefs.current.get(pageNum);
    if (!container) {
      console.warn('[PDFViewer] No container for page', pageNum);
      return;
    }

    // Cancel any existing render task for this page
    const existing = renderTasksRef.current.get(pageNum);
    if (existing) {
      try { existing.cancel(); } catch {}
    }

    try {
      const page = await doc.getPage(pageNum);
      const scale = zoom / 100;
      const viewport = page.getViewport({ scale });

      let canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        container.appendChild(canvas);
      }

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('[PDFViewer] Could not get 2D context for page', pageNum);
        return;
      }

      const task = page.render({ canvasContext: ctx, viewport });
      renderTasksRef.current.set(pageNum, task);

      await task.promise;
      console.log('[PDFViewer] Rendered page', pageNum);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[PDFViewer] render error page', pageNum, err);
      }
    }
  }, [zoom]);

  // Render all pages after they mount
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    console.log('[PDFViewer] Triggering render for', numPages, 'pages');

    // Use rAF to ensure DOM has settled after React's render
    const raf = requestAnimationFrame(() => {
      for (let i = 1; i <= numPages; i++) {
        renderPage(i);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [pdfDoc, numPages, renderPage]);

  // Scroll to highlighted page and draw overlay
  useEffect(() => {
    if (!highlight || !pdfDoc) return;
    const { page, bbox } = highlight;

    const container = pageRefs.current.get(page);
    if (container) {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const drawOverlay = async () => {
      const cont = pageRefs.current.get(page);
      if (!cont) return;
      const canvas = cont.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return;

      const pdfPage = await pdfDoc.getPage(page);
      const scale = zoom / 100;
      const viewport = pdfPage.getViewport({ scale });

      const [x1, y1, x2, y2] = bbox;
      const sx = canvas.offsetWidth / viewport.width;
      const sy = canvas.offsetHeight / viewport.height;

      const left   = x1 * scale * sx;
      const top    = (viewport.height - y2 * scale) * sy;
      const width  = (x2 - x1) * scale * sx;
      const height = (y2 - y1) * scale * sy;

      cont.querySelectorAll('.pdf-hl').forEach(el => el.remove());

      const hl = document.createElement('div');
      hl.className = 'pdf-hl';
      hl.style.cssText = `
        position:absolute; pointer-events:none; z-index:10;
        left:${left}px; top:${top}px;
        width:${width}px; height:${height}px;
        background:rgba(255,200,0,0.35);
        border:2px solid rgba(255,140,0,0.85);
        border-radius:3px;
        box-shadow:0 0 0 3px rgba(255,140,0,0.2);
        animation: hlpulse 1s ease-in-out 2;
      `;
      cont.style.position = 'relative';
      cont.appendChild(hl);
    };

    setTimeout(drawOverlay, 200);
  }, [highlight, pdfDoc, zoom]);

  // Remove highlights when null
  useEffect(() => {
    if (!highlight) {
      pageRefs.current.forEach(c => c.querySelectorAll('.pdf-hl').forEach(el => el.remove()));
    }
  }, [highlight]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
        <p className="text-sm text-red-500">{error}</p>
        <p className="text-xs">URL: {url}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <p className="text-sm">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-auto h-full bg-neutral-200 dark:bg-neutral-800 p-3 space-y-3">
      <style>{`@keyframes hlpulse{0%,100%{box-shadow:0 0 0 3px rgba(255,140,0,0.2)}50%{box-shadow:0 0 0 8px rgba(255,140,0,0)}}`}</style>
      {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
        <div
          key={pageNum}
          ref={el => { if (el) pageRefs.current.set(pageNum, el); else pageRefs.current.delete(pageNum); }}
          className="relative bg-white shadow-md mx-auto"
          data-page={pageNum}
        >
          <div className="absolute -top-4 left-0 text-[10px] text-neutral-500 select-none">Page {pageNum}</div>
        </div>
      ))}
    </div>
  );
}
