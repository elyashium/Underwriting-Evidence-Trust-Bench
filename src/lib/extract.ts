import type {
  Fact,
  FieldId,
  NormalizedValue,
  Packet,
  SourceSpan,
  SubmissionDocument,
} from './types';
import {
  normalizeAddress,
  normalizeCount,
  normalizeDate,
  normalizeLimit,
  normalizeMoney,
  normalizeText,
  normalizeVin,
} from './normalize';

/**
 * Deterministic extraction.
 *
 * Two rules govern this file.
 *
 * 1. **Spans are derived, never authored.** Every fact carries character offsets
 *    into the document it came from, computed while parsing. Nothing in the
 *    packet files pre-marks where a value lives, so a citation that points at
 *    the wrong text is a bug the tests can catch rather than a fiction the data
 *    quietly supports.
 *
 * 2. **Parsing strategy is chosen from document *shape*, not `documentKind`.**
 *    Whether a block is a pipe table or a `LABEL: value` worksheet is a
 *    formatting question, so reading it off the layout is fair. But a real
 *    intake queue guesses document types from filenames and attachments, so
 *    letting adjudication depend on a trusted `kind` label would make this
 *    bench easier than the problem it claims to model. `kind` is used for
 *    display and for nothing else.
 */

// ---------------------------------------------------------------------------
// Line and cell geometry
// ---------------------------------------------------------------------------

interface Line {
  text: string;
  start: number;
}

interface Cell {
  value: string;
  start: number;
  end: number;
}

function toLines(content: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  for (const text of content.split('\n')) {
    lines.push({ text, start: offset });
    offset += text.length + 1;
  }
  return lines;
}

/** Splits a pipe-delimited line into trimmed cells with absolute offsets. */
function splitCells(line: Line): Cell[] {
  const cells: Cell[] = [];
  let cursor = 0;
  for (const part of line.text.split('|')) {
    const leading = part.length - part.trimStart().length;
    const value = part.trim();
    const start = line.start + cursor + leading;
    cells.push({ value, start, end: start + value.length });
    cursor += part.length + 1;
  }
  return cells;
}

const isTableLine = (text: string): boolean => (text.match(/\|/g)?.length ?? 0) >= 3;

/** `-----+------+-----` rules carry no pipes but still belong to the block. */
const isRuleLine = (text: string): boolean => /^[\s\-+=|]{5,}$/.test(text) && /[-=]/.test(text);

const letters = (s: string): string => s.replace(/[^A-Za-z]/g, '').toUpperCase();

// ---------------------------------------------------------------------------
// Fact construction
// ---------------------------------------------------------------------------

const CHANGE_VERB =
  /\b(add|adds|adding|added|revise|revises|revised|revision|amend|amends|amended|replace|replaces|replaced|remove|removes|removed|delete|deletes|deleted|correct|corrects|corrected|endorse|endorsed|endorsement)\b/gi;

/**
 * Looks backwards from a fact for explicit change language.
 *
 * Backwards only, and deliberately: change language governs what follows it
 * ("Please REVISE the stated value on Unit 5 ... to $119,500"). A verb that
 * appears after a value is describing something else. This is the only signal
 * the classifier will accept as grounds for supersession — being the newest
 * document is not enough, or PKT-007's conflicting inception dates would be
 * silently "resolved" in favour of whichever email happened to land second.
 */
function detectChangeIntent(
  content: string,
  factStart: number,
): 'add' | 'remove' | 'revise' | undefined {
  const window = content.slice(Math.max(0, factStart - 500), factStart);
  CHANGE_VERB.lastIndex = 0;
  let last: string | undefined;
  for (const m of window.matchAll(CHANGE_VERB)) last = m[1].toLowerCase();
  if (!last) return undefined;
  if (last.startsWith('add')) return 'add';
  if (last.startsWith('remove') || last.startsWith('delete')) return 'remove';
  return 'revise';
}

interface FactInput {
  doc: SubmissionDocument;
  entityKey: string;
  field: FieldId;
  raw: string;
  value: NormalizedValue;
  start: number;
  end: number;
  confidence: number;
}

function makeFact(input: FactInput): Fact {
  const { doc, entityKey, field, raw, value, start, end, confidence } = input;
  const span: SourceSpan = {
    documentId: doc.id,
    start,
    end,
    quote: doc.content.slice(start, end),
  };
  return {
    id: `${doc.id}:${entityKey}:${field}:${start}`,
    entityKey,
    field,
    raw,
    value,
    span,
    confidence,
    extractor: 'rule',
    documentId: doc.id,
    documentKind: doc.kind,
    receivedAt: doc.receivedAt,
    changeIntent: detectChangeIntent(doc.content, start),
  };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

type TableKind = 'vehicle' | 'loss';

const VIN_HEADERS = new Set(['VIN', 'VLN', 'V1N', 'VN']);

function classifyHeader(cells: Cell[]): TableKind | null {
  const heads = cells.map((c) => letters(c.value));
  if (heads.includes('UNIT') && heads.some((h) => VIN_HEADERS.has(h))) return 'vehicle';
  if (heads.some((h) => h.startsWith('CLAIM')) && heads.includes('INCURRED')) return 'loss';
  return null;
}

function columnIndex(cells: Cell[], test: (head: string) => boolean): number {
  return cells.findIndex((c) => test(letters(c.value)));
}

export interface VehicleTable {
  documentId: string;
  documentTitle: string;
  documentKind: SubmissionDocument['kind'];
  receivedAt: string;
  span: SourceSpan;
  units: number[];
  /** True when the header itself is garbled, i.e. the page is a degraded scan. */
  degraded: boolean;
}

interface TableParseResult {
  facts: Fact[];
  vehicleTables: VehicleTable[];
  consumed: Set<number>;
}

function parseTables(doc: SubmissionDocument, lines: Line[]): TableParseResult {
  const facts: Fact[] = [];
  const vehicleTables: VehicleTable[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i += 1) {
    if (!isTableLine(lines[i].text)) continue;
    const header = splitCells(lines[i]);
    const kind = classifyHeader(header);
    if (!kind) continue;

    // A header that reads "VlN" rather than "VIN" is itself evidence that the
    // page came off a scanner, so every reading taken from it is discounted.
    const degraded =
      kind === 'vehicle' && !header.some((c) => letters(c.value) === 'VIN');
    const cellConfidence = degraded ? 0.9 : 0.97;

    consumed.add(i);
    const units: number[] = [];
    let end = lines[i].start + lines[i].text.length;

    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const line = lines[j];
      if (!isTableLine(line.text) && !isRuleLine(line.text)) break;
      consumed.add(j);
      end = line.start + line.text.length;
      if (isRuleLine(line.text) || !isTableLine(line.text)) continue;

      const row = splitCells(line);
      if (kind === 'vehicle') {
        const unit = emitVehicleRow(doc, header, row, cellConfidence, facts);
        if (unit !== null) units.push(unit);
      } else {
        emitLossRow(doc, header, row, cellConfidence, facts);
      }
    }

    if (kind === 'vehicle') {
      const start = lines[i].start;
      vehicleTables.push({
        documentId: doc.id,
        documentTitle: doc.title,
        documentKind: doc.kind,
        receivedAt: doc.receivedAt,
        span: { documentId: doc.id, start, end, quote: doc.content.slice(start, end) },
        units,
        degraded,
      });
    }
    i = j - 1;
  }

  return { facts, vehicleTables, consumed };
}

function emitVehicleRow(
  doc: SubmissionDocument,
  header: Cell[],
  row: Cell[],
  confidence: number,
  out: Fact[],
): number | null {
  const iUnit = columnIndex(header, (h) => h === 'UNIT');
  if (iUnit < 0 || !row[iUnit] || !/^\d+$/.test(row[iUnit].value)) return null;

  const unit = Number(row[iUnit].value);
  const entityKey = `vehicle:unit-${unit}`;

  const push = (
    index: number,
    field: FieldId,
    normalize: (raw: string) => NormalizedValue | null,
    confidenceOverride?: number,
  ) => {
    const cell = row[index];
    if (index < 0 || !cell || !cell.value) return;
    const value = normalize(cell.value);
    if (!value) return;
    out.push(
      makeFact({
        doc,
        entityKey,
        field,
        raw: cell.value,
        value,
        start: cell.start,
        end: cell.end,
        confidence: confidenceOverride ?? confidence,
      }),
    );
  };

  const iVin = columnIndex(header, (h) => VIN_HEADERS.has(h));
  const iYear = columnIndex(header, (h) => h === 'YEAR');
  const iModel = columnIndex(header, (h) => h.startsWith('MAKE'));
  const iAddress = columnIndex(header, (h) => h.includes('ADDRESS') || h.includes('GARAGING'));
  const iValue = columnIndex(header, (h) => h.includes('VALUE'));

  push(iVin, 'vin', (raw) => normalizeVin(raw));
  push(iAddress, 'garaging_address', (raw) => normalizeAddress(raw));
  push(iValue, 'stated_value', normalizeMoney);

  if (iYear >= 0 && iModel >= 0 && row[iYear] && row[iModel]) {
    const combined = `${row[iYear].value} ${row[iModel].value}`.trim();
    out.push(
      makeFact({
        doc,
        entityKey,
        field: 'year_make_model',
        raw: combined,
        value: normalizeText(combined),
        start: row[iYear].start,
        end: row[iModel].end,
        confidence,
      }),
    );
  }

  return unit;
}

function emitLossRow(
  doc: SubmissionDocument,
  header: Cell[],
  row: Cell[],
  confidence: number,
  out: Fact[],
): void {
  const iClaim = columnIndex(header, (h) => h.startsWith('CLAIM'));
  const iCause = columnIndex(header, (h) => h.startsWith('CAUSE'));
  const iIncurred = columnIndex(header, (h) => h === 'INCURRED');
  if (iClaim < 0 || !row[iClaim] || !/^[A-Z]{2}-\d+$/i.test(row[iClaim].value)) return;

  const entityKey = `loss:${row[iClaim].value}`;

  if (iIncurred >= 0 && row[iIncurred]) {
    const money = normalizeMoney(row[iIncurred].value);
    if (money) {
      out.push(
        makeFact({
          doc,
          entityKey,
          field: 'loss_incurred',
          raw: row[iIncurred].value,
          value: money,
          start: row[iIncurred].start,
          end: row[iIncurred].end,
          confidence,
        }),
      );
    }
  }

  if (iCause >= 0 && row[iCause] && row[iCause].value) {
    out.push(
      makeFact({
        doc,
        entityKey,
        field: 'loss_cause',
        raw: row[iCause].value,
        value: normalizeText(row[iCause].value),
        start: row[iCause].start,
        end: row[iCause].end,
        confidence,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Worksheet fields
// ---------------------------------------------------------------------------

/** Uppercase label lines only — email headers like `Subject:` are not fields. */
const FIELD_LINE = /^([A-Z][A-Z0-9 ()/&.'-]*?)\s*:\s*(\S.*?)\s*$/;

interface FieldRule {
  match: RegExp;
  field: FieldId;
  /** Some values only make sense with their label — "(CSL): $1,000,000". */
  useLabel?: boolean;
  normalize: (raw: string) => NormalizedValue | null;
}

const FIELD_RULES: FieldRule[] = [
  { match: /EFFECTIVE DATE/, field: 'effective_date', normalize: (raw) => normalizeDate(raw) },
  { match: /POWER UNITS|NUMBER OF VEHICLES/, field: 'stated_vehicle_count', normalize: normalizeCount },
  { match: /LIABILITY LIMIT/, field: 'liability_limit', useLabel: true, normalize: normalizeLimit },
  { match: /TOTAL SCHEDULED VALUE/, field: 'total_scheduled_value', normalize: normalizeMoney },
  { match: /GARAGING LOCATIONS/, field: 'garaging_location_count', normalize: normalizeCount },
];

function parseFields(
  doc: SubmissionDocument,
  lines: Line[],
  consumed: Set<number>,
): { facts: Fact[]; consumed: Set<number> } {
  const facts: Fact[] = [];
  const used = new Set<number>();

  lines.forEach((line, index) => {
    if (consumed.has(index)) return;
    const match = line.text.match(FIELD_LINE);
    if (!match) return;

    const [, label, raw] = match;
    const rule = FIELD_RULES.find((r) => r.match.test(label));
    if (!rule) return;

    const value = rule.normalize(rule.useLabel ? `${label} ${raw}` : raw);
    if (!value) return;

    const start = line.start + line.text.lastIndexOf(raw);
    used.add(index);
    facts.push(
      makeFact({
        doc,
        entityKey: 'policy',
        field: rule.field,
        raw,
        value,
        start,
        end: start + raw.length,
        confidence: 0.95,
      }),
    );
  });

  return { facts, consumed: used };
}

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

/**
 * Blanks out every line already claimed by a table or a worksheet field,
 * replacing it with spaces of equal length. Offsets therefore stay identical to
 * the original document, so prose matches cite real positions and nothing is
 * extracted twice.
 */
function maskClaimedLines(content: string, lines: Line[], claimed: Set<number>): string {
  const chars = content.split('');
  claimed.forEach((index) => {
    const line = lines[index];
    for (let i = 0; i < line.text.length; i += 1) chars[line.start + i] = ' ';
  });
  return chars.join('');
}

/**
 * A gap of spaces, or exactly one line wrap. Broker prose wraps mid-phrase
 * ("They operate 12\ntrucks out of Duluth"), so a space-only gap would miss
 * real assertions; allowing arbitrary whitespace instead would let a phrase
 * match across a blank line, or across a masked-out table, and cite nonsense.
 */
const GAP = '(?:[ \\t]+|[ \\t]*\\n[ \\t]*)';

const COUNT_PHRASE = new RegExp(
  `(\\b[A-Za-z]+\\b|\\b\\d{1,3}\\b)(?:[ \\t]*\\([ \\t]*\\d{1,3}[ \\t]*\\))?${GAP}(?:[a-z]+${GAP}){0,2}?(?:power${GAP}units?|units?|trucks?|tractors?)\\b`,
  'gi',
);

const EFFECTIVE_DATE_PATTERNS: RegExp[] = [
  /\beffective(?:\s+date)?\s*:?\s+((?:\d{1,2}\/\d{1,2}\/\d{2,4})|(?:[A-Za-z]{3,9}\.?\s+\d{1,2}(?:,\s*\d{4})?))/gi,
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\s+effective\s+date\b/gi,
  /\bfor\s+(?:an?\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi,
  /\bincept(?:ion|ing)?\s+(?:on\s+)?((?:[A-Za-z]{3,9}\.?\s+\d{1,2}(?:,\s*\d{4})?)|(?:\d{1,2}\/\d{1,2}\/\d{2,4}))\b/gi,
];

const TOTAL_VALUE_PATTERNS: RegExp[] = [
  /\btotal\s+(?:scheduled|insured)\s+value\s*(?:of|:)?\s*(\$?\s?[\d.,]+\s*(?:MM|M|K|million|thousand)?)/gi,
];

const VIN_IN_PROSE = /\bVIN[:\s]+([A-HJ-NPR-Z0-9]{17})\b/i;

/**
 * True when an `effective <date>` phrase is enacting a change rather than
 * stating policy inception. "Please ADD the following unit effective 06/15"
 * says when the *endorsement* bites; reading it as the policy's inception date
 * would invent a conflict with the submission that no underwriter would see.
 */
function datePhraseIsEnactingChange(content: string, at: number): boolean {
  const window = content.slice(Math.max(0, at - 150), at);
  CHANGE_VERB.lastIndex = 0;
  return CHANGE_VERB.test(window);
}

function parseProse(doc: SubmissionDocument, prose: string): Fact[] {
  const facts: Fact[] = [];
  const contextYear = new Date(doc.receivedAt).getUTCFullYear();

  const add = (
    entityKey: string,
    field: FieldId,
    raw: string,
    value: NormalizedValue | null,
    start: number,
    confidence: number,
  ) => {
    if (!value) return;
    facts.push({
      ...makeFact({
        doc,
        entityKey,
        field,
        raw,
        value,
        start,
        end: start + raw.length,
        confidence,
      }),
    });
  };

  // --- fleet counts asserted in prose ------------------------------------
  for (const m of prose.matchAll(COUNT_PHRASE)) {
    const value = normalizeCount(m[0]);
    if (!value || value.numeric === undefined) continue;
    if (value.numeric < 1 || value.numeric > 300) continue;
    add('policy', 'stated_vehicle_count', m[0], value, m.index!, 0.86);
  }

  // --- effective dates ----------------------------------------------------
  const seenDateAt = new Set<number>();
  for (const pattern of EFFECTIVE_DATE_PATTERNS) {
    for (const m of prose.matchAll(pattern)) {
      if (datePhraseIsEnactingChange(prose, m.index!)) continue;
      const raw = m[1];
      const start = m.index! + m[0].lastIndexOf(raw);
      if (seenDateAt.has(start)) continue;
      const value = normalizeDate(raw, contextYear);
      if (!value) continue;
      seenDateAt.add(start);
      // A date whose year had to be inferred is a weaker reading than one
      // written out, and the calibration curve should see that difference.
      add('policy', 'effective_date', raw, value, start, value.note ? 0.72 : 0.88);
    }
  }

  // --- totals -------------------------------------------------------------
  for (const pattern of TOTAL_VALUE_PATTERNS) {
    for (const m of prose.matchAll(pattern)) {
      const raw = m[1].trim();
      const start = m.index! + m[0].lastIndexOf(raw);
      add('policy', 'total_scheduled_value', raw, normalizeMoney(raw), start, 0.85);
    }
  }

  // --- liability limits ---------------------------------------------------
  const LIMIT_PATTERN =
    /(\$?\s?[\d.,]+\s*(?:MM|M|K|million)?)\s*(?:combined single limit|CSL)\b/gi;
  for (const m of prose.matchAll(LIMIT_PATTERN)) {
    add('policy', 'liability_limit', m[0], normalizeLimit(m[0]), m.index!, 0.85);
  }

  facts.push(...parseLossNarrative(doc, prose));
  facts.push(...parseEndorsementIntents(doc, prose));
  facts.push(...parseUnitStatus(doc, prose));

  return facts;
}

// ---------------------------------------------------------------------------
// Loss narrative
// ---------------------------------------------------------------------------

/**
 * Narrative loss summaries are turned into checkable assertions. A broker who
 * writes "two losses in the past three years, both minor" has made three
 * separate claims — a count, a window and a severity ceiling — and the loss run
 * can falsify any of them independently.
 */
function parseLossNarrative(doc: SubmissionDocument, prose: string): Fact[] {
  const facts: Fact[] = [];

  const push = (raw: string, canonical: string, start: number, note: string) => {
    facts.push(
      makeFact({
        doc,
        entityKey: 'policy',
        field: 'loss_summary_claim',
        raw,
        value: { kind: 'text', canonical, note },
        start,
        end: start + raw.length,
        confidence: 0.74,
      }),
    );
  };

  const COUNT_CLAIM = /\b([A-Za-z]+|\d{1,3})\s+(?:reported\s+)?(?:losses|claims)\b[^.\n]{0,70}/gi;
  for (const m of prose.matchAll(COUNT_CLAIM)) {
    const leading = normalizeCount(m[1]);
    if (!leading || leading.numeric === undefined) continue;
    push(m[0].trim(), `count=${leading.numeric}`, m.index!, `narrative asserts ${leading.numeric} losses`);
  }

  const SEVERITY_CAP =
    /\bno\s+(?:claims?|losses?)\s+(?:over|above|greater\s+than|exceeding)\s+(\$?[\d.,]+\s*(?:MM|M|K|million|thousand)?)/gi;
  for (const m of prose.matchAll(SEVERITY_CAP)) {
    const cap = normalizeMoney(m[1]);
    if (!cap || cap.numeric === undefined) continue;
    push(m[0].trim(), `cap=${cap.numeric}`, m.index!, `narrative asserts no loss above ${cap.numeric}`);
  }

  const QUALIFIER = /\b(?:both|all)\s+(minor|small)\b/gi;
  for (const m of prose.matchAll(QUALIFIER)) {
    push(m[0].trim(), 'qualifier=minor', m.index!, 'narrative characterises all losses as minor');
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Endorsement intents
// ---------------------------------------------------------------------------

function parseEndorsementIntents(doc: SubmissionDocument, prose: string): Fact[] {
  const facts: Fact[] = [];

  // "Please ADD the following unit ...  Unit 13 | ... | VIN ... Stated value $X"
  const ADD = /\bADD\b[\s\S]{0,240}?\bUnit\s+(\d+)\b([\s\S]{0,260})/gi;
  for (const m of prose.matchAll(ADD)) {
    const unit = Number(m[1]);
    const entityKey = `vehicle:unit-${unit}`;
    const tail = m[2];
    const tailStart = m.index! + m[0].length - tail.length;

    facts.push(
      makeFact({
        doc,
        entityKey,
        field: 'endorsement_add_unit',
        raw: `Unit ${unit}`,
        value: { kind: 'count', canonical: String(unit), numeric: unit },
        start: m.index! + m[0].indexOf(`Unit ${m[1]}`),
        end: m.index! + m[0].indexOf(`Unit ${m[1]}`) + `Unit ${unit}`.length,
        confidence: 0.92,
      }),
    );

    const vin = tail.match(VIN_IN_PROSE);
    if (vin) {
      const start = tailStart + tail.indexOf(vin[1]);
      facts.push(
        makeFact({
          doc,
          entityKey,
          field: 'vin',
          raw: vin[1],
          value: normalizeVin(vin[1]),
          start,
          end: start + vin[1].length,
          confidence: 0.92,
        }),
      );
    }

    const stated = tail.match(/\bStated\s+value\s+(\$[\d,]+)/i);
    if (stated) {
      const start = tailStart + tail.indexOf(stated[1]);
      facts.push(
        makeFact({
          doc,
          entityKey,
          field: 'stated_value',
          raw: stated[1],
          value: normalizeMoney(stated[1])!,
          start,
          end: start + stated[1].length,
          confidence: 0.92,
        }),
      );
    }
  }

  // "Please REVISE the stated value on Unit 5 (... VIN ...) from $86,000 to $119,500"
  const REVISE =
    /\bREVISE\b[\s\S]{0,200}?\bUnit\s+(\d+)\b([\s\S]{0,140}?)\bfrom\s+(\$[\d,]+)\s+to\s+(\$[\d,]+)/gi;
  for (const m of prose.matchAll(REVISE)) {
    const unit = Number(m[1]);
    const entityKey = `vehicle:unit-${unit}`;
    const revised = m[4];
    const start = m.index! + m[0].lastIndexOf(revised);
    facts.push(
      makeFact({
        doc,
        entityKey,
        field: 'stated_value',
        raw: revised,
        value: normalizeMoney(revised)!,
        start,
        end: start + revised.length,
        confidence: 0.93,
      }),
    );

    const vin = m[2].match(VIN_IN_PROSE);
    if (vin) {
      const vinStart = m.index! + m[0].indexOf(vin[1]);
      facts.push(
        makeFact({
          doc,
          entityKey,
          field: 'vin',
          raw: vin[1],
          value: normalizeVin(vin[1]),
          start: vinStart,
          end: vinStart + vin[1].length,
          confidence: 0.93,
        }),
      );
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Unit status
// ---------------------------------------------------------------------------

/**
 * Out-of-service annotations are what make PKT-016 a hard negative rather than
 * a count conflict, so they are extracted as first-class facts with their own
 * citation instead of being inferred from the surrounding prose later.
 */
function parseUnitStatus(doc: SubmissionDocument, prose: string): Fact[] {
  const facts: Fact[] = [];
  const PATTERN =
    /\bUnit\s+(\d+)\b([\s\S]{0,220}?)\b(OUT OF SERVICE|OUT-OF-SERVICE|laid up|taken out of service)\b/gi;

  for (const m of prose.matchAll(PATTERN)) {
    const unit = Number(m[1]);
    const entityKey = `vehicle:unit-${unit}`;
    const start = m.index!;
    const raw = m[0].trim();

    // Was it merely reported, or actually pulled off the schedule?
    // Every gap is \s+ rather than a literal space: this phrase is being read
    // out of wrapped prose, so "removed from the\nactive vehicle schedule" is
    // the normal case, not the exception.
    const after = prose.slice(m.index! + m[0].length, m.index! + m[0].length + 300);
    const removed = /\bremoved\s+from\s+the\s+active(?:\s+vehicle)?\s+schedule\b/i.test(after);

    facts.push(
      makeFact({
        doc,
        entityKey,
        field: 'unit_status',
        raw,
        value: {
          kind: 'text',
          canonical: removed ? 'out_of_service;removed_from_schedule' : 'out_of_service',
          note: removed
            ? 'reported out of service and removed from the active schedule'
            : 'reported out of service',
        },
        start,
        end: start + raw.length,
        confidence: removed ? 0.88 : 0.8,
      }),
    );

    const vin = m[2].match(VIN_IN_PROSE);
    if (vin) {
      const vinStart = m.index! + m[0].indexOf(vin[1]);
      facts.push(
        makeFact({
          doc,
          entityKey,
          field: 'vin',
          raw: vin[1],
          value: normalizeVin(vin[1]),
          start: vinStart,
          end: vinStart + vin[1].length,
          confidence: 0.88,
        }),
      );
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  facts: Fact[];
  /** Every vehicle table found, for citation by the reconciliation rules. */
  vehicleTables: VehicleTable[];
  /**
   * Distinct unit numbers across every vehicle table in the packet.
   *
   * Distinct *unit numbers*, not rows: PKT-015 re-sends one page, so the same
   * unit appears twice and a row count would invent a fifteenth vehicle. And
   * counting rows rather than distinct VINs keeps the duplicate-VIN packets
   * from tripping this rule as well as the one they were authored for — two
   * findings for one planted fault would corrupt the false-positive metric.
   */
  scheduleUnits: number[];
}

/**
 * Mail headers, i.e. the `From:`/`Subject:` block before the first blank line.
 *
 * These are routing metadata, not assertions of record: a subject reading
 * "endorsement request, add one unit" is the author labelling a thread, and
 * reading it as a fleet size of one puts a phantom value into the evidence
 * graph that no underwriter would ever have cited. The body carries the claim.
 */
const MAIL_HEADER = /^(From|To|Cc|Bcc|Date|Sent|Subject|Reply-To)\s*:/i;

function mailHeaderLines(lines: Line[]): Set<number> {
  const headers = new Set<number>();
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].text.trim() === '') break;
    if (MAIL_HEADER.test(lines[i].text)) headers.add(i);
    else if (i > 0 && headers.size === 0) break;
  }
  return headers;
}

export function extractDocument(doc: SubmissionDocument): {
  facts: Fact[];
  vehicleTables: VehicleTable[];
} {
  const lines = toLines(doc.content);
  const tables = parseTables(doc, lines);
  const fields = parseFields(doc, lines, tables.consumed);

  const claimed = new Set<number>([
    ...tables.consumed,
    ...fields.consumed,
    ...mailHeaderLines(lines),
  ]);
  const prose = maskClaimedLines(doc.content, lines, claimed);

  return {
    facts: [...tables.facts, ...fields.facts, ...parseProse(doc, prose)],
    vehicleTables: tables.vehicleTables,
  };
}

export function extractPacket(packet: Packet): ExtractionResult {
  const facts: Fact[] = [];
  const vehicleTables: VehicleTable[] = [];

  const documents = [...packet.documents].sort(
    (a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt),
  );

  for (const doc of documents) {
    const result = extractDocument(doc);
    facts.push(...result.facts);
    vehicleTables.push(...result.vehicleTables);
  }

  const units = new Set<number>();
  vehicleTables.forEach((t) => t.units.forEach((u) => units.add(u)));

  return {
    facts,
    vehicleTables,
    scheduleUnits: [...units].sort((a, b) => a - b),
  };
}
