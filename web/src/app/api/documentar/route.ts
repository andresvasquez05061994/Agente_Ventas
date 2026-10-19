import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ensureDb, listPortfolioContacts } from "@/lib/db";
import { documentMatrix } from "@/lib/excel-document";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta un Excel (.xlsx, .xls) o CSV." }, { status: 400 });
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      return NextResponse.json({ error: "Usa un archivo Excel (.xlsx, .xls) o CSV." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo supera 2 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "El archivo no tiene hojas." }, { status: 400 });
    }
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];

    const contacts = await listPortfolioContacts();
    const documented = documentMatrix(matrix, contacts);

    const out = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([documented.headers, ...documented.rows]);
    sheet["!cols"] = documented.headers.map((header) => ({
      wch: Math.min(48, Math.max(header.length + 2, 18)),
    }));
    XLSX.utils.book_append_sheet(out, sheet, "Documentado");
    const xlsx = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
    return NextResponse.json({
      filename: `${baseName}_documentado.xlsx`,
      stats: documented.stats,
      headers: documented.headers,
      preview: documented.preview,
      fileBase64: xlsx.toString("base64"),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo documentar el Excel";
    const status = /columna de empresa|más de|no tiene hojas/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
