// Server-only export builders. Loaded from exports.functions.ts inside the handler.
import * as XLSX from "xlsx";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  RATING_LABEL,
  FRAMEWORKS,
  type QuestionRow,
  type AnswerRow,
  type FrameworkKey,
} from "./assessment";

type Meta = {
  assessment: { title: string; status: string; updated_at: string };
  client: { name?: string; sector?: string; size?: string };
  questions: QuestionRow[];
  answers: AnswerRow[];
  scores: { overall: number; answered: number; total: number; domainScores: { domain: string; score: number; total: number; answered: number }[] };
  coverage: { key: string; label: string; totalControls: number; answeredControls: number; coverage: number }[];
  gaps: { q: QuestionRow; a: AnswerRow | undefined; gap: number | null }[];
  overallLabel: { label: string; tone: string };
  generatedAt: string;
};

// ============ XLSX Crosswalk ============
export async function buildXlsx(meta: Meta): Promise<Uint8Array> {
  const answerMap = new Map(meta.answers.map((a) => [a.question_id, a]));
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summary: (string | number)[][] = [
    ["Cyber Maturity Assessment"],
    ["Client", meta.client.name ?? ""],
    ["Sector", meta.client.sector ?? ""],
    ["Size", meta.client.size ?? ""],
    ["Generated", new Date(meta.generatedAt).toLocaleString()],
    [],
    ["Overall maturity", `${Math.round(meta.scores.overall * 100)}%`, meta.overallLabel.label],
    ["Answered", `${meta.scores.answered} of ${meta.scores.total}`],
    [],
    ["Domain", "Score", "Answered", "Total"],
    ...meta.scores.domainScores.map((d) => [d.domain, `${Math.round(d.score * 100)}%`, d.answered, d.total]),
    [],
    ["Standard", "Controls covered", "Total referenced", "Coverage"],
    ...meta.coverage.map((c) => [c.label, c.answeredControls, c.totalControls, `${Math.round(c.coverage * 100)}%`]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  // Crosswalk sheet
  const header = [
    "Domain", "Code", "Question", "Rating", "Evidence", "Weight",
    ...FRAMEWORKS.map((f) => f.label),
  ];
  const rows = meta.questions.map((q) => {
    const a = answerMap.get(q.id);
    return [
      q.domain, q.code, q.text,
      a ? RATING_LABEL[a.rating] : "",
      a?.evidence ?? "",
      q.weight,
      ...FRAMEWORKS.map((f) => (q.mappings[f.key as FrameworkKey] ?? []).join(", ")),
    ];
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Crosswalk");

  // Gaps sheet
  const gapRows = meta.gaps.map(({ q, a }) => [
    q.domain, q.code, q.text, a ? RATING_LABEL[a.rating] : "Unanswered", a?.evidence ?? "", q.weight,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Domain", "Code", "Question", "Rating", "Evidence", "Weight"], ...gapRows]),
    "Priority Gaps",
  );

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}

// ============ DOCX Report ============
export async function buildDocx(meta: Meta): Promise<Uint8Array> {
  const answerMap = new Map(meta.answers.map((a) => [a.question_id, a]));
  const bord = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const cellBord = { top: bord, bottom: bord, left: bord, right: bord };

  const cell = (text: string, opts: { bold?: boolean; shade?: string; width?: number } = {}) =>
    new TableCell({
      borders: cellBord,
      width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
      shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] })],
    });

  const domainTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 1560, 1560, 1560],
    rows: [
      new TableRow({ children: [cell("Domain", { bold: true, shade: "F2EFE8", width: 4680 }), cell("Score", { bold: true, shade: "F2EFE8", width: 1560 }), cell("Answered", { bold: true, shade: "F2EFE8", width: 1560 }), cell("Total", { bold: true, shade: "F2EFE8", width: 1560 })] }),
      ...meta.scores.domainScores.map((d) => new TableRow({ children: [cell(d.domain, { width: 4680 }), cell(`${Math.round(d.score * 100)}%`, { width: 1560 }), cell(String(d.answered), { width: 1560 }), cell(String(d.total), { width: 1560 })] })),
    ],
  });

  const covTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [5000, 2000, 2360],
    rows: [
      new TableRow({ children: [cell("Standard", { bold: true, shade: "F2EFE8", width: 5000 }), cell("Coverage", { bold: true, shade: "F2EFE8", width: 2000 }), cell("Controls", { bold: true, shade: "F2EFE8", width: 2360 })] }),
      ...meta.coverage.map((c) => new TableRow({ children: [cell(c.label, { width: 5000 }), cell(`${Math.round(c.coverage * 100)}%`, { width: 2000 }), cell(`${c.answeredControls} / ${c.totalControls}`, { width: 2360 })] })),
    ],
  });

  const answersByDomain = new Map<string, QuestionRow[]>();
  for (const q of meta.questions) {
    if (!answersByDomain.has(q.domain)) answersByDomain.set(q.domain, []);
    answersByDomain.get(q.domain)!.push(q);
  }

  const detailBlocks: (Paragraph | Table)[] = [];
  for (const [domain, list] of answersByDomain) {
    detailBlocks.push(new Paragraph({ text: domain, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } }));
    detailBlocks.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [1200, 4160, 1800, 2200],
      rows: [
        new TableRow({ children: [
          cell("Code", { bold: true, shade: "F2EFE8", width: 1200 }),
          cell("Question", { bold: true, shade: "F2EFE8", width: 4160 }),
          cell("Rating", { bold: true, shade: "F2EFE8", width: 1800 }),
          cell("Evidence", { bold: true, shade: "F2EFE8", width: 2200 }),
        ]}),
        ...list.map((q) => {
          const a = answerMap.get(q.id);
          return new TableRow({ children: [
            cell(q.code, { width: 1200 }),
            cell(q.text, { width: 4160 }),
            cell(a ? RATING_LABEL[a.rating] : "—", { width: 1800 }),
            cell(a?.evidence ?? "", { width: 2200 }),
          ]});
        }),
      ],
    }));
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 40, bold: true, font: "Calibri" }, paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: "Calibri" }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
      children: [
        new Paragraph({ text: `${meta.client.name ?? "Client"} — Cyber Maturity Report`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `Generated ${new Date(meta.generatedAt).toLocaleDateString()}`, italics: true, color: "666666" })] }),
        new Paragraph({ text: "Executive summary", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [
          new TextRun({ text: `Overall maturity: `, bold: true }),
          new TextRun({ text: `${Math.round(meta.scores.overall * 100)}% (${meta.overallLabel.label})` }),
        ]}),
        new Paragraph({ children: [
          new TextRun({ text: `Questions answered: `, bold: true }),
          new TextRun({ text: `${meta.scores.answered} of ${meta.scores.total}` }),
        ]}),
        new Paragraph({ text: "Maturity by domain", heading: HeadingLevel.HEADING_2 }),
        domainTable,
        new Paragraph({ text: "Standards coverage", heading: HeadingLevel.HEADING_2 }),
        covTable,
        new Paragraph({ text: "Priority gaps", heading: HeadingLevel.HEADING_2 }),
        ...(meta.gaps.slice(0, 10).map(({ q, a }) => new Paragraph({ children: [
          new TextRun({ text: `${q.code} — ${q.domain}: `, bold: true }),
          new TextRun({ text: q.text }),
          new TextRun({ text: `  [${a ? RATING_LABEL[a.rating] : "Unanswered"}]`, italics: true, color: "B04B2F" }),
        ]}))),
        new Paragraph({ text: "Detailed responses", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }),
        ...detailBlocks,
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

// ============ PDF Report ============
export async function buildPdf(meta: Meta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.24);
  const muted = rgb(0.45, 0.45, 0.5);
  const ember = rgb(0.78, 0.42, 0.24);

  let page = pdf.addPage([595.28, 841.89]); // A4
  const margin = 48;
  let y = 800;

  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 800;
  };
  const line = (t: string, f = font, size = 10, color = ink) => {
    if (y < margin + 40) newPage();
    page.drawText(t, { x: margin, y, size, font: f, color });
    y -= size + 4;
  };
  const wrap = (t: string, size = 10, f = font, color = ink) => {
    const max = 500;
    const words = t.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(trial, size) > max) {
        line(cur, f, size, color);
        cur = w;
      } else cur = trial;
    }
    if (cur) line(cur, f, size, color);
  };

  // Title
  page.drawText(`${meta.client.name ?? "Client"}`, { x: margin, y, size: 22, font: bold, color: ink }); y -= 26;
  page.drawText("Cyber Maturity Report", { x: margin, y, size: 14, font, color: muted }); y -= 22;
  page.drawText(`Generated ${new Date(meta.generatedAt).toLocaleDateString()}`, { x: margin, y, size: 9, font, color: muted }); y -= 26;

  // Overall
  page.drawText("Overall maturity", { x: margin, y, size: 12, font: bold, color: ink }); y -= 20;
  page.drawText(`${Math.round(meta.scores.overall * 100)}%   ${meta.overallLabel.label}`, { x: margin, y, size: 28, font: bold, color: ember }); y -= 28;
  page.drawText(`${meta.scores.answered} of ${meta.scores.total} questions answered`, { x: margin, y, size: 10, font, color: muted }); y -= 26;

  // Domains
  page.drawText("Maturity by domain", { x: margin, y, size: 12, font: bold, color: ink }); y -= 16;
  for (const d of meta.scores.domainScores) {
    if (y < margin + 30) newPage();
    page.drawText(d.domain, { x: margin, y, size: 10, font, color: ink });
    page.drawText(`${Math.round(d.score * 100)}%`, { x: margin + 380, y, size: 10, font: bold, color: ink });
    // bar
    page.drawRectangle({ x: margin + 220, y: y - 2, width: 140, height: 6, color: rgb(0.94, 0.93, 0.9) });
    page.drawRectangle({ x: margin + 220, y: y - 2, width: 140 * d.score, height: 6, color: ember });
    y -= 16;
  }
  y -= 8;

  // Coverage
  if (y < margin + 100) newPage();
  page.drawText("Standards coverage", { x: margin, y, size: 12, font: bold, color: ink }); y -= 16;
  for (const c of meta.coverage) {
    if (y < margin + 30) newPage();
    page.drawText(c.label, { x: margin, y, size: 10, font, color: ink });
    page.drawText(`${Math.round(c.coverage * 100)}% (${c.answeredControls}/${c.totalControls})`, { x: margin + 340, y, size: 10, font: bold, color: ink });
    y -= 14;
  }
  y -= 8;

  // Gaps
  if (y < margin + 100) newPage();
  page.drawText("Priority gaps", { x: margin, y, size: 12, font: bold, color: ink }); y -= 16;
  for (const { q, a } of meta.gaps.slice(0, 10)) {
    if (y < margin + 60) newPage();
    page.drawText(`${q.code} — ${q.domain}`, { x: margin, y, size: 9, font: bold, color: ember }); y -= 12;
    wrap(q.text, 10, font, ink);
    line(`Rating: ${a ? RATING_LABEL[a.rating] : "Unanswered"}`, font, 9, muted);
    y -= 4;
  }

  // Detailed responses on subsequent pages
  newPage();
  page.drawText("Detailed responses", { x: margin, y, size: 16, font: bold, color: ink }); y -= 24;
  const answerMap = new Map(meta.answers.map((a) => [a.question_id, a]));
  const byDomain = new Map<string, QuestionRow[]>();
  for (const q of meta.questions) {
    if (!byDomain.has(q.domain)) byDomain.set(q.domain, []);
    byDomain.get(q.domain)!.push(q);
  }
  for (const [domain, list] of byDomain) {
    if (y < margin + 60) newPage();
    page.drawText(domain, { x: margin, y, size: 12, font: bold, color: ember }); y -= 16;
    for (const q of list) {
      if (y < margin + 60) newPage();
      const a = answerMap.get(q.id);
      wrap(`${q.code}. ${q.text}`, 10, font, ink);
      line(`Rating: ${a ? RATING_LABEL[a.rating] : "—"}`, font, 9, muted);
      if (a?.evidence) wrap(`Evidence: ${a.evidence}`, 9, font, muted);
      y -= 6;
    }
    y -= 8;
  }

  const bytes = await pdf.save();
  return bytes;
}
