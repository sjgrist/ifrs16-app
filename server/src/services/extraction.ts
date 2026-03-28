import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_SYSTEM = `You are an expert IFRS 16 lease accountant. Extract structured lease data from lease agreement text.
Return ONLY valid JSON matching the schema below. If a field cannot be determined, use null.
Be precise with dates (YYYY-MM-DD format), amounts (numbers only, no currency symbols), and rates (as decimals, e.g. 0.05 for 5%).`;

const EXTRACTION_PROMPT = (text: string) => `Extract IFRS 16 lease data from this lease agreement text.

Return a JSON object with these exact fields:
{
  "lessor_name": string | null,
  "asset_description": string | null,
  "asset_class": "property" | "vehicle" | "equipment" | "other" | null,
  "commencement_date": "YYYY-MM-DD" | null,
  "term_months": number | null,
  "extension_option_months": number | null,
  "extension_reasonably_certain": boolean | null,
  "currency": "GBP" | "EUR" | "USD" | "SEK" | "NOK" | "DKK" | "CHF" | "other" | null,
  "payment_amount": number | null,
  "payment_frequency": "monthly" | "quarterly" | "annual" | null,
  "payment_timing": "advance" | "arrears" | null,
  "rent_free_months": number | null,
  "initial_direct_costs": number | null,
  "lease_incentives_receivable": number | null,
  "prepaid_payments": number | null,
  "residual_value_guarantee": number | null,
  "country": string | null,
  "notes": string | null
}

LEASE AGREEMENT TEXT:
${text.slice(0, 15000)}`;

export interface ExtractedLease {
  lessor_name: string | null;
  asset_description: string | null;
  asset_class: "property" | "vehicle" | "equipment" | "other" | null;
  commencement_date: string | null;
  term_months: number | null;
  extension_option_months: number | null;
  extension_reasonably_certain: boolean | null;
  currency: string | null;
  payment_amount: number | null;
  payment_frequency: "monthly" | "quarterly" | "annual" | null;
  payment_timing: "advance" | "arrears" | null;
  rent_free_months: number | null;
  initial_direct_costs: number | null;
  lease_incentives_receivable: number | null;
  prepaid_payments: number | null;
  residual_value_guarantee: number | null;
  country: string | null;
  notes: string | null;
}

export async function extractLeaseData(pdfText: string): Promise<ExtractedLease> {
  const stream = await client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thinking: { type: "adaptive" } as any,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: EXTRACTION_PROMPT(pdfText) }],
  });

  const response = await stream.finalMessage();

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Extract JSON from response (may be wrapped in markdown code blocks)
  const raw = textBlock.text;
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
  const jsonStr = jsonMatch[1]?.trim() || raw.trim();

  try {
    return JSON.parse(jsonStr) as ExtractedLease;
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${jsonStr.slice(0, 200)}`);
  }
}
