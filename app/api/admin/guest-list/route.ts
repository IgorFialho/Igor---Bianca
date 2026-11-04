import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb, setCharacterSpacing } from 'pdf-lib';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';

type ConfirmedRow = {
  invite_code_used: string;
  responder_full_name: string | null;
  children_count: number;
  children: { full_name: string; age: number }[] | null;
};

type GuestEntry = {
  names: string[];
  childrenCount: number;
  children: { fullName: string; age: number }[];
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 64;

const INK = rgb(0.16, 0.14, 0.12);
const MUTED = rgb(0.42, 0.39, 0.36);
const ACCENT = rgb(0.54, 0.35, 0.17);
const RULE = rgb(0.86, 0.82, 0.76);

const splitNames = (raw: string | null) =>
  (raw ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/**
 * Lista de confirmados: a resposta mais recente de cada código, só quem respondeu "sim".
 * Os nomes são sempre os que o convidado digitou no RSVP (responder_full_name), nunca o nome cadastrado no código.
 */
async function loadConfirmedGuests(): Promise<GuestEntry[]> {
  const result = await db.query<ConfirmedRow>(
    `
      WITH latest AS (
        SELECT DISTINCT ON (UPPER(invite_code_used))
          id, invite_code_used, responder_full_name, attendance, children_count
        FROM rsvp_responses
        ORDER BY UPPER(invite_code_used), submitted_at DESC, id DESC
      )
      SELECT
        l.invite_code_used,
        l.responder_full_name,
        l.children_count,
        (
          SELECT json_agg(json_build_object('full_name', TRIM(c.full_name), 'age', c.age) ORDER BY c.created_at, c.id)
          FROM rsvp_children c
          WHERE c.rsvp_response_id = l.id
        ) AS children
      FROM latest l
      WHERE l.attendance = 'yes'
    `
  );

  return result.rows
    .map((row: ConfirmedRow) => ({
      names: splitNames(row.responder_full_name),
      childrenCount: Number(row.children_count) || 0,
      children: (row.children ?? []).map((child) => ({ fullName: child.full_name, age: Number(child.age) })),
    }))
    .filter((entry: GuestEntry) => entry.names.length > 0)
    .sort((a: GuestEntry, b: GuestEntry) => a.names[0].localeCompare(b.names[0], 'pt-BR', { sensitivity: 'base' }));
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    const guests = await loadConfirmedGuests();
    const pdf = await buildPdf(guests);

    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="convidados-confirmados-${date}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Falha ao gerar lista de confirmados', error);
    return NextResponse.json({ error: 'Erro ao gerar a lista de confirmados.' }, { status: 500 });
  }
}

async function buildPdf(guests: GuestEntry[]) {
  const doc = await PDFDocument.create();
  doc.setTitle('Lista de convidados confirmados');
  doc.setAuthor('Igor & Bianca');

  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  // As fontes padrão do PDF só têm o alfabeto latino (acentos inclusos); outros símbolos, como emoji, são removidos.
  const supported = new Set(sans.getCharacterSet());
  const clean = (text: string) =>
    Array.from(text.normalize('NFC'))
      .filter((char) => supported.has(char.codePointAt(0) ?? 0))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

  const wrap = (text: string, font: PDFFont, size: number, maxWidth: number) => {
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(' ')) {
      const next = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // Mesma regra do relatório do painel: filhos com mais de 12 anos contam como adultos; sem idade, como crianças.
  const olderChildren = guests.reduce((total, entry) => total + entry.children.filter((child) => child.age > 12).length, 0);
  const allChildren = guests.reduce((total, entry) => total + Math.max(entry.childrenCount, entry.children.length), 0);
  const adults = guests.reduce((total, entry) => total + entry.names.length, 0) + olderChildren;
  const children = allChildren - olderChildren;
  const generatedAt = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;
  const contentWidth = PAGE_WIDTH - MARGIN_X * 2;

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN_TOP;
    }
  };

  const text = (value: string, x: number, size: number, font: PDFFont, color = INK) => {
    page.drawText(value, { x, y, size, font, color });
  };

  // Texto centralizado na página; o espaçamento entre letras imita os títulos do site.
  const centered = (value: string, size: number, font: PDFFont, color = INK, letterSpacing = 0) => {
    const chars = Array.from(value);
    const width = font.widthOfTextAtSize(value, size) + letterSpacing * (chars.length - 1);
    const x = (PAGE_WIDTH - width) / 2;
    if (letterSpacing) page.pushOperators(setCharacterSpacing(letterSpacing));
    page.drawText(value, { x, y, size, font, color });
    if (letterSpacing) page.pushOperators(setCharacterSpacing(0));
  };

  // Cabeçalho centralizado: nomes, título, data, um enfeite e o resumo.
  y -= 30;
  centered('Igor & Bianca', 34, serifItalic, ACCENT);
  y -= 28;
  centered('LISTA DE CONVIDADOS CONFIRMADOS', 9.5, sansBold, MUTED, 2.2);
  y -= 17;
  centered(clean(`Gerada em ${generatedAt}`), 9, sans, MUTED);

  y -= 20;
  const center = PAGE_WIDTH / 2;
  page.drawLine({ start: { x: center - 70, y }, end: { x: center - 8, y }, thickness: 0.6, color: RULE });
  page.drawLine({ start: { x: center + 8, y }, end: { x: center + 70, y }, thickness: 0.6, color: RULE });
  page.drawSquare({ x: center, y: y - 3.2, size: 4.5, rotate: degrees(45), color: ACCENT });

  y -= 26;
  const summary = [
    `${adults} ${adults === 1 ? 'adulto' : 'adultos'}`,
    `${children} ${children === 1 ? 'criança' : 'crianças'}`,
    `${adults + children} ${adults + children === 1 ? 'pessoa' : 'pessoas'} no total`,
  ].join('   ·   ');
  centered(clean(summary), 10.5, sansBold, INK);
  y -= 22;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 0.8, color: RULE });
  y -= 28;

  if (guests.length === 0) {
    text('Nenhum convidado confirmou presença até agora.', MARGIN_X, 11, sans, MUTED);
  }

  const numberWidth = 26;
  const nameX = MARGIN_X + numberWidth;
  const nameWidth = contentWidth - numberWidth;

  guests.forEach((entry, index) => {
    // Monta as linhas do convite antes de desenhar, para não quebrar um convite entre duas páginas.
    const nameLines = entry.names.flatMap((name) => wrap(clean(name), sansBold, 11.5, nameWidth));
    const childLines = entry.children.flatMap((child) =>
      wrap(clean(`${child.fullName} — ${child.age} ${child.age === 1 ? 'ano' : 'anos'}`), sans, 10.5, nameWidth - 14)
    );
    const missingChildren = Math.max(0, entry.childrenCount - entry.children.length);
    const missingLine =
      missingChildren > 0
        ? `${missingChildren} ${missingChildren === 1 ? 'filho' : 'filhos'} sem nome e idade informados`
        : '';
    const hasChildren = childLines.length > 0 || missingLine !== '';

    const blockHeight =
      nameLines.length * 16 + (hasChildren ? 16 + (childLines.length + (missingLine ? 1 : 0)) * 14 : 0) + 18;
    ensureSpace(blockHeight);

    text(`${index + 1}.`, MARGIN_X, 11.5, sans, MUTED);
    nameLines.forEach((line) => {
      text(line, nameX, 11.5, sansBold, INK);
      y -= 16;
    });

    if (hasChildren) {
      y -= 2;
      text('FILHOS', nameX, 8, sansBold, ACCENT);
      y -= 14;
      childLines.forEach((line) => {
        text(line, nameX + 14, 10.5, sans, INK);
        y -= 14;
      });
      if (missingLine) {
        text(missingLine, nameX + 14, 10.5, sans, MUTED);
        y -= 14;
      }
    }

    y -= 8;
    if (index < guests.length - 1) {
      page.drawLine({ start: { x: nameX, y: y + 4 }, end: { x: PAGE_WIDTH - MARGIN_X, y: y + 4 }, thickness: 0.4, color: RULE });
    }
    y -= 10;
  });

  // Rodapé com número da página.
  const pages = doc.getPages();
  pages.forEach((current, pageIndex) => {
    const label = `${pageIndex + 1} / ${pages.length}`;
    current.drawText(label, {
      x: PAGE_WIDTH - MARGIN_X - sans.widthOfTextAtSize(label, 8.5),
      y: MARGIN_BOTTOM / 2,
      size: 8.5,
      font: sans,
      color: MUTED,
    });
    current.drawText('Igor & Bianca · Convidados confirmados', { x: MARGIN_X, y: MARGIN_BOTTOM / 2, size: 8.5, font: sans, color: MUTED });
  });

  return doc.save();
}
