import { analyzePacket } from './classify';
import type {
  Classification,
  EvidenceGroup,
  Fact,
  Packet,
  PacketAnalysis,
} from './types';
import type { ExternalFinding, ExternalRun } from './external';

export const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const ADJUDICATED: Classification[] = [
  'conflict',
  'supersession',
  'benign_variant',
  'unresolved',
  'consistent',
];

export interface Adjudication {
  classification: Classification;
  confidence: number;
  reason: string;
}

/**
 * One evidence group, serialized for an outside adjudicator.
 *
 * Everything the reference engine's rules would see is in the prompt: the raw
 * quotes, what each one normalises to, which domain rule fired, and whether
 * the document's own text marks a deliberate change. Nothing else is — no
 * packet-level context, no ground truth, no hint of what the rules say.
 */
export function buildAdjudicationPrompt(
  packetTitle: string,
  group: EvidenceGroup,
  titles: Map<string, string>,
): string {
  const lines = group.facts.map((fact: Fact) => {
    const bits = [
      `- [${fact.documentKind.replace(/_/g, ' ')}] "${titles.get(fact.documentId) ?? fact.documentId}"`,
      `received ${fact.receivedAt}, quote: "${fact.span.quote}"`,
      `reads as: ${fact.value.canonical}`,
    ];
    if (fact.value.domainRule) bits.push(`domain rule used while reading: ${fact.value.domainRule}`);
    if (fact.value.ambiguous) bits.push('reading flagged AMBIGUOUS by normalisation');
    if (fact.changeIntent) bits.push(`document marks a deliberate change (${fact.changeIntent})`);
    return bits.join('; ');
  });

  return [
    `Packet: ${packetTitle}.`,
    `Field under review: ${group.label} (entity ${group.entityKey}).`,
    group.derived
      ? 'This group was derived by cross-document arithmetic, not stated directly.'
      : 'These are every value the packet ever asserted for this field, in arrival order.',
    ...lines,
    '',
    'Classify the group with exactly one label:',
    '- conflict: the values genuinely disagree and nothing reconciles them.',
    '- supersession: a later document deliberately replaces an earlier value, and its own text says so. Recency alone is never enough.',
    '- benign_variant: different words, same underlying fact.',
    '- unresolved: materially different, but the evidence does not justify a call either way.',
    '- consistent: everything resolves to one value with no meaningful difference.',
    'Reply with JSON only, no other text: {"classification": "<label>", "confidence": <0..1 that the label is correct>, "reason": "<one sentence>"}.',
  ].join('\n');
}

/**
 * Strict parse of a model reply. A reply that is not JSON, names no known
 * label, or asserts a confidence outside 0..1 throws — a grading harness that
 * coerces model slop into a scored answer would be laundering the result.
 */
export function parseAdjudicationResponse(text: string): Adjudication {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model reply contained no JSON object: ${text.slice(0, 120)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error(`Model reply was not valid JSON: ${text.slice(0, 120)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Model reply JSON was not an object.');
  }
  const { classification, confidence, reason } = parsed as Record<string, unknown>;
  if (!ADJUDICATED.includes(classification as Classification)) {
    throw new Error(`Model named unknown label ${JSON.stringify(classification)}.`);
  }
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Model confidence ${JSON.stringify(confidence)} is not in 0..1.`);
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error('Model gave no reason string.');
  }
  return { classification: classification as Classification, confidence, reason: reason.trim() };
}

/** A text-in/text-out model call, injected so tests never touch a network. */
export type ModelCall = (prompt: string) => Promise<string>;

/** The live Groq call. Reads GROQ_API_KEY from the environment, never a file. */
export async function groqCallModel(prompt: string, model = GROQ_MODEL): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error('Set GROQ_API_KEY in the environment to run the LLM adjudicator.');
  }
  // Free-tier keys rate-limit aggressively; back off rather than failing the run.
  // Empty replies are retried too: reasoning models sometimes spend the whole
  // budget thinking and emit nothing, which is transient, not a verdict.
  const attempts = 6;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You adjudicate cross-document evidence groups. Reply with JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0,
      }),
    });
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs =
        (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0) +
        3000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Groq request failed with status ${response.status}.`);
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }
    return content;
  }
  throw new Error(
    'Groq kept rate-limiting or replying empty after retries — try again later or lower LLM_CONCURRENCY.',
  );
}

/**
 * The LLM adjudicator engine: this repo's extractor, linker, and derived-group
 * structure, with a language model in place of the rule-based adjudication.
 *
 * Single-assertion groups are marked consistent without a model call — there
 * is nothing to adjudicate, and spending inference on them would buy nothing
 * but variance. Everything with two or more asserted facts goes to the model,
 * including derived groups (their evidence is real spans, serialized the same
 * way). A model failure fails the run rather than silently degrading to the
 * rules, which would mix two engines' judgements into one column.
 */
export async function analyzeWithLLM(
  packet: Packet,
  callModel: ModelCall,
  concurrency = 4,
): Promise<PacketAnalysis> {
  const reference = analyzePacket(packet);
  const titles = new Map(packet.documents.map((d) => [d.id, d.title]));

  const adjudicated = new Map<string, Adjudication>();
  const queue = reference.groups.filter((g) => g.facts.length > 1);
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, queue.length)) },
    async () => {
      while (queue.length > 0) {
        const group = queue.pop()!;
        const reply = await callModel(buildAdjudicationPrompt(packet.title, group, titles));
        adjudicated.set(group.key, parseAdjudicationResponse(reply));
      }
    },
  );
  await Promise.all(workers);

  return {
    packetId: packet.id,
    engine: 'external',
    facts: reference.facts,
    groups: reference.groups,
    findings: reference.groups.map((group) => {
      const ruling = adjudicated.get(group.key);
      if (!ruling) {
        return {
          groupKey: group.key,
          label: group.label,
          entityKey: group.entityKey,
          classification: 'consistent' as const,
          confidence: 0.99,
          rationale: 'A single assertion with nothing to compare against.',
          signals: ['llm.single-assertion'],
          evidence: [...group.facts],
        };
      }
      return {
        groupKey: group.key,
        label: group.label,
        entityKey: group.entityKey,
        classification: ruling.classification,
        confidence: ruling.confidence,
        rationale: `[model] ${ruling.reason}`,
        signals: ['llm.adjudicated'],
        evidence: [...group.facts],
      };
    }),
  };
}

/** Pack LLM findings into the external-run shape the grader accepts. */
export function llmAnalysesToRun(engineLabel: string, analyses: PacketAnalysis[]): ExternalRun {
  return {
    engineLabel,
    packets: analyses.map((analysis) => ({
      packetId: analysis.packetId,
      findings: analysis.findings
        .filter((f) => f.classification !== 'consistent')
        .map((f): ExternalFinding => ({
          groupKey: f.groupKey,
          classification: f.classification,
          confidence: f.confidence,
          rationale: f.rationale,
        })),
    })),
  };
}
