/**
 * PDF Export Engine — Markdown-to-PDF renderer for Ad Intelligence Reports.
 *
 * Architecture:
 *   1. Parse raw markdown into typed blocks (heading, paragraph, table, list, blockquote, hr).
 *   2. Walk the block list and render each block into a jsPDF document
 *      using proper font metrics, page breaks, and jspdf-autotable for tables.
 *   3. Add branded header/footer to every page.
 *
 * Light-mode only — PDFs are designed for sharing/printing where
 * white backgrounds and dark text are the professional standard.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Theme Constants ───────────────────────────────────────────────────────

const COLORS = {
  primary: [109, 40, 217] as [number, number, number],       // violet-600
  primaryLight: [139, 92, 246] as [number, number, number],   // violet-500
  accent: [37, 99, 235] as [number, number, number],          // blue-600
  text: [17, 24, 39] as [number, number, number],             // gray-900
  textMuted: [107, 114, 128] as [number, number, number],     // gray-500
  textLight: [156, 163, 175] as [number, number, number],     // gray-400
  border: [229, 231, 235] as [number, number, number],        // gray-200
  bg: [255, 255, 255] as [number, number, number],
  bgMuted: [249, 250, 251] as [number, number, number],       // gray-50
  tableHeader: [245, 243, 255] as [number, number, number],   // violet-50
  blockquoteBg: [245, 243, 255] as [number, number, number],
  blockquoteBorder: [139, 92, 246] as [number, number, number],
};

const MARGIN = { top: 28, bottom: 28, left: 24, right: 24 };
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN.left - MARGIN.right;
const HEADER_HEIGHT = 16;
const FOOTER_HEIGHT = 12;

// ─── Block Types ───────────────────────────────────────────────────────────

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "blockquote"; text: string }
  | { type: "hr" };

// ─── Markdown Parser ───────────────────────────────────────────────────────

function parseMarkdownToBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) { i++; continue; }

    // Horizontal rule
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ type: "heading", level, text: stripInlineMarkdown(headingMatch[2]) });
      i++;
      continue;
    }

    // Table: look for a header row followed by a separator row
    if (trimmed.startsWith("|") && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1]?.trim() || "";
      if (nextTrimmed.startsWith("|") && /^[\s|:\-]+$/.test(nextTrimmed)) {
        const tableBlock = parseTable(lines, i);
        if (tableBlock) {
          blocks.push(tableBlock);
          i = tableBlock._endLine!;
          continue;
        }
      }
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", text: stripInlineMarkdown(quoteLines.join(" ")) });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(stripInlineMarkdown(lines[i].trim().replace(/^\d+\.\s+/, "")));
        i++;
        // Absorb blank lines between items but keep going if next is numbered
        while (i < lines.length && !lines[i].trim()) i++;
        if (i < lines.length && !/^\d+\.\s/.test(lines[i].trim())) break;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(stripInlineMarkdown(lines[i].trim().replace(/^[-*+]\s+/, "")));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    // Paragraph: collect non-special consecutive lines
    {
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().startsWith("#") &&
        !lines[i].trim().startsWith(">") &&
        !lines[i].trim().startsWith("|") &&
        !/^-{3,}$|^\*{3,}$|^_{3,}$/.test(lines[i].trim()) &&
        !/^\d+\.\s/.test(lines[i].trim()) &&
        !/^[-*+]\s/.test(lines[i].trim())
      ) {
        paraLines.push(lines[i].trim());
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push({ type: "paragraph", text: stripInlineMarkdown(paraLines.join(" ")) });
      }
    }
  }

  return blocks;
}

function parseTable(lines: string[], startIdx: number): (Block & { _endLine?: number }) | null {
  const headerCells = parseTableRow(lines[startIdx]);
  if (!headerCells) return null;

  // Skip separator row
  let idx = startIdx + 2;
  const rows: string[][] = [];

  while (idx < lines.length && lines[idx].trim().startsWith("|")) {
    const row = parseTableRow(lines[idx]);
    if (row) rows.push(row);
    idx++;
  }

  return {
    type: "table",
    headers: headerCells,
    rows,
    _endLine: idx,
  };
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const cells = trimmed
    .split("|")
    .slice(1, -1) // remove leading/trailing empty from | split
    .map((c) => stripInlineMarkdown(c.trim()));
  return cells.length > 0 ? cells : null;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")   // bold
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")       // italic
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")         // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links → just text
    .replace(/~~(.+?)~~/g, "$1")       // strikethrough
    .replace(/✓/g, "✓")               // keep check marks
    .trim();
}

// ─── Bold Detection for Mixed Rendering ────────────────────────────────────

interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

function parseInlineFormatting(raw: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Pattern: **bold**, *italic*, ***both***
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match[2]) {
      segments.push({ text: match[2], bold: true, italic: true });
    } else if (match[3]) {
      segments.push({ text: match[3], bold: true, italic: false });
    } else if (match[4]) {
      segments.push({ text: match[4], bold: false, italic: true });
    } else if (match[5]) {
      segments.push({ text: match[5], bold: false, italic: false });
    }
  }

  return segments.length > 0 ? segments : [{ text: raw, bold: false, italic: false }];
}

// ─── PDF Renderer ──────────────────────────────────────────────────────────

function addBrandedHeader(doc: jsPDF, brandName: string) {
  const pageW = doc.internal.pageSize.getWidth();
  // Subtle top line
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.8);
  doc.line(MARGIN.left, 8, pageW - MARGIN.right, 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.primaryLight);
  const headerBrand = "TheHookLab.in";
  doc.text(headerBrand, MARGIN.left, 14);
  const headerBrandW = doc.getTextWidth(headerBrand);
  doc.link(MARGIN.left, 10, headerBrandW, 6, { url: "https://thehooklab.in/" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.textMuted);
  const subtitle = `Ad Intelligence Report — ${brandName}`;
  doc.text(subtitle, pageW - MARGIN.right, 14, { align: "right" });
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const y = pageH - 10;

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN.left, y - 4, pageW - MARGIN.right, y - 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text("Generated by TheHookLab.in — AI-Powered Competitive Intelligence", MARGIN.left, y);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageW - MARGIN.right, y, { align: "right" });
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - MARGIN.bottom - FOOTER_HEIGHT) {
    doc.addPage();
    return MARGIN.top + HEADER_HEIGHT;
  }
  return y;
}

function renderRichText(
  doc: jsPDF,
  rawText: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  color: [number, number, number],
  lineHeight: number = 1.5,
): number {
  // Simple approach: split into words, handle bold segments inline
  doc.setFontSize(fontSize);
  const segments = parseInlineFormatting(rawText);
  const spaceWidth = doc.getTextWidth(" ");

  let curX = x;
  let curY = y;
  const lineStep = fontSize * lineHeight * 0.352778; // pt to mm

  for (const seg of segments) {
    const style = seg.bold ? (seg.italic ? "bolditalic" : "bold") : seg.italic ? "italic" : "normal";
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    doc.setFontSize(fontSize);

    const words = seg.text.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const wordW = doc.getTextWidth(word);
      if (curX + wordW > x + maxWidth && curX > x) {
        // Wrap to next line
        curX = x;
        curY += lineStep;
        curY = ensureSpace(doc, curY, lineStep);
      }
      doc.text(word, curX, curY);
      curX += wordW + spaceWidth;
    }
  }

  doc.setFont("helvetica", "normal"); // reset
  return curY + lineStep; // return Y after the last line
}

// ─── Main Export Function ──────────────────────────────────────────────────

export interface PdfExportOptions {
  markdown: string;
  brandName: string;
  generatedAt: string;
  isMock?: boolean;
}

export function exportReportAsPdf(options: PdfExportOptions): void {
  const { markdown, brandName, generatedAt, isMock } = options;
  const blocks = parseMarkdownToBlocks(markdown);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  let y = MARGIN.top;

  // ──── Cover Header ─────────────────────────────────────────────────────
  // Violet gradient bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageW, 44, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const coverBrand = "TheHookLab.in";
  doc.text(coverBrand, MARGIN.left, 16);
  const coverBrandW = doc.getTextWidth(coverBrand);
  doc.link(MARGIN.left, 12, coverBrandW, 6, { url: "https://thehooklab.in/" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Competitor Ad Intelligence Report", MARGIN.left, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 255);
  const metaLine = `${brandName}  |  ${generatedAt}${isMock ? "  |  ⚠ MOCK REPORT" : ""}`;
  doc.text(metaLine, MARGIN.left, 38);

  y = 56;

  // ──── Render Blocks ────────────────────────────────────────────────────
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];

    switch (block.type) {
      case "hr": {
        y = ensureSpace(doc, y, 8);
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.4);
        doc.line(MARGIN.left, y, pageW - MARGIN.right, y);
        y += 6;
        break;
      }

      case "heading": {
        const config = {
          1: { size: 15, color: COLORS.text, spacing: 10, after: 4, underline: true },
          2: { size: 12, color: COLORS.primary, spacing: 8, after: 3, underline: false },
          3: { size: 10.5, color: COLORS.accent, spacing: 6, after: 2, underline: false },
          4: { size: 9.5, color: COLORS.text, spacing: 5, after: 2, underline: false },
        }[block.level];

        y = ensureSpace(doc, y, config.spacing + config.size * 0.4);
        y += config.spacing;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(config.size);
        doc.setTextColor(...config.color);

        const headingLines = doc.splitTextToSize(block.text, CONTENT_WIDTH);
        doc.text(headingLines, MARGIN.left, y);

        const lineStep = config.size * 1.3 * 0.352778;
        y += headingLines.length * lineStep;

        if (config.underline && block.level === 1) {
          doc.setDrawColor(...COLORS.primary);
          doc.setLineWidth(0.5);
          doc.line(MARGIN.left, y + 1, MARGIN.left + 40, y + 1);
          y += 3;
        }

        y += config.after;
        break;
      }

      case "paragraph": {
        y = ensureSpace(doc, y, 10);
        y = renderRichText(doc, block.text, MARGIN.left, y, CONTENT_WIDTH, 9, COLORS.text);
        y += 2;
        break;
      }

      case "list": {
        const bullet = block.ordered;
        for (let li = 0; li < block.items.length; li++) {
          y = ensureSpace(doc, y, 8);
          const prefix = bullet ? `${li + 1}.` : "•";

          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(...COLORS.primary);
          doc.text(prefix, MARGIN.left + 2, y);

          y = renderRichText(
            doc,
            block.items[li],
            MARGIN.left + 10,
            y,
            CONTENT_WIDTH - 10,
            9,
            COLORS.text,
          );
          y += 1;
        }
        y += 2;
        break;
      }

      case "blockquote": {
        y = ensureSpace(doc, y, 16);

        // Calculate height needed
        doc.setFontSize(8.5);
        const quoteLines = doc.splitTextToSize(block.text, CONTENT_WIDTH - 16);
        const quoteH = quoteLines.length * 4.5 + 8;

        // Background
        doc.setFillColor(...COLORS.blockquoteBg);
        doc.roundedRect(MARGIN.left, y - 2, CONTENT_WIDTH, quoteH, 2, 2, "F");

        // Left border
        doc.setFillColor(...COLORS.blockquoteBorder);
        doc.rect(MARGIN.left, y - 2, 2.5, quoteH, "F");

        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.setTextColor(...COLORS.textMuted);
        doc.text(quoteLines, MARGIN.left + 8, y + 4);

        y += quoteH + 4;
        break;
      }

      case "table": {
        y = ensureSpace(doc, y, 20);

        autoTable(doc, {
          startY: y,
          head: [block.headers],
          body: block.rows,
          margin: { left: MARGIN.left, right: MARGIN.right },
          styles: {
            font: "helvetica",
            fontSize: 7.5,
            cellPadding: { top: 3, right: 3.5, bottom: 3, left: 3.5 },
            lineColor: COLORS.border,
            lineWidth: 0.25,
            textColor: COLORS.text,
            overflow: "linebreak",
            minCellHeight: 8,
          },
          headStyles: {
            fillColor: COLORS.tableHeader,
            textColor: COLORS.primary,
            fontStyle: "bold",
            fontSize: 7,
            halign: "left",
          },
          bodyStyles: {
            fillColor: COLORS.bg,
          },
          alternateRowStyles: {
            fillColor: COLORS.bgMuted,
          },
          columnStyles: (() => {
            // Auto-size: give first column more width for labels
            const styles: Record<number, { cellWidth?: number | "auto" }> = {};
            if (block.headers.length > 3) {
              // Let autotable handle complex tables
            } else if (block.headers.length <= 2) {
              styles[0] = { cellWidth: CONTENT_WIDTH * 0.4 };
            }
            return styles;
          })(),
          didDrawPage: () => {
            // Tables can span pages — header/footer are added at the end
          },
          tableLineColor: COLORS.border,
          tableLineWidth: 0.25,
        });

        // Get the final Y from autotable
        y = (doc as any).lastAutoTable?.finalY ?? y + 20;
        y += 5;
        break;
      }
    }
  }

  // ──── Add Headers & Footers to All Pages ───────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) {
      // Don't add header to first page (has the cover)
      addBrandedHeader(doc, brandName);
    }
    addFooter(doc, p, totalPages);
  }

  // ──── Save ─────────────────────────────────────────────────────────────
  // Clean brand name for filename safety but allow spaces
  const cleanBrand = brandName.replace(/[\\/:"*?<>|]/g, "").substring(0, 50);
  doc.save(`${cleanBrand} by THL Analysis Report.pdf`);
}
