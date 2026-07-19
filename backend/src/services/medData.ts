// Medication data lookup service — queries OpenFDA and RxNorm APIs
// Both are free, keyless public APIs. Be respectful: 250ms delay between calls, 5s timeout.

export interface DrugInfo {
  brandName: string;
  genericName: string;
  activeIngredients: string[];
  purpose: string;
  uses: string;
  warnings: string[];
  commonSideEffects: string[];
  dosageForms: string[];
  source: string; // "fda" or "fallback"
}

// In-memory rate limiter: track last request timestamp
let lastRequestTime = 0;
const MIN_DELAY_MS = 250;

async function rateLimitedFetch(url: string, timeoutMs = 5000): Promise<Response | null> {
  // Enforce minimum delay between requests
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - timeSinceLast));
  }
  lastRequestTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn(`Timeout fetching ${url}`);
    } else {
      console.warn(`Fetch error for ${url}:`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface OpenFDAResult {
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    route?: string[];
    substance_name?: string[];
  };
  active_ingredient?: string[];
  purpose?: string[];
  indications_and_usage?: string[];
  warnings?: string[];
  dosage_and_administration?: string[];
  adverse_reactions?: string[];
  spl_product_data_elements?: string[];
}

interface OpenFDAResponse {
  results?: OpenFDAResult[];
  error?: { message: string };
}

function extractSideEffects(data: OpenFDAResult): string[] {
  const sideEffects: string[] = [];

  // Try adverse_reactions first
  if (data.adverse_reactions && data.adverse_reactions.length > 0) {
    const text = data.adverse_reactions.join(" ").toLowerCase();
    // Extract common side effects from the text (simple phrase matching)
    const commonTerms = [
      "nausea", "headache", "dizziness", "drowsiness", "fatigue",
      "constipation", "diarrhea", "vomiting", "dry mouth", "insomnia",
      "rash", "itching", "stomach pain", "blurred vision", "muscle pain",
      "joint pain", "anxiety", "weight gain", "appetite loss",
    ];
    for (const term of commonTerms) {
      if (text.includes(term)) {
        // Capitalize first letter
        sideEffects.push(term.charAt(0).toUpperCase() + term.slice(1));
      }
    }
  }

  // If no side effects found, try warnings
  if (sideEffects.length === 0 && data.warnings && data.warnings.length > 0) {
    const text = data.warnings.join(" ").toLowerCase();
    if (text.includes("nausea")) sideEffects.push("Nausea");
    if (text.includes("headache")) sideEffects.push("Headache");
    if (text.includes("dizziness")) sideEffects.push("Dizziness");
    if (text.includes("drowsiness")) sideEffects.push("Drowsiness");
  }

  // Deduplicate and limit
  return [...new Set(sideEffects)].slice(0, 10);
}

function extractWarnings(data: OpenFDAResult): string[] {
  const warnings: string[] = [];
  if (data.warnings && data.warnings.length > 0) {
    // Take first warning section, split into sentences
    const text = data.warnings[0];
    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
      .slice(0, 5);

    for (const s of sentences) {
      // Look for warning-like sentences
      if (
        s.toLowerCase().includes("do not") ||
        s.toLowerCase().includes("warning") ||
        s.toLowerCase().includes("caution") ||
        s.toLowerCase().includes("risk") ||
        s.toLowerCase().includes("may cause") ||
        s.toLowerCase().includes("should not") ||
        s.toLowerCase().includes("before taking") ||
        s.toLowerCase().includes("tell your doctor")
      ) {
        warnings.push(s + ".");
      }
    }

    // If no warnings extracted, take first few sentences as-is
    if (warnings.length === 0) {
      warnings.push(...sentences.slice(0, 3).map((s) => s + "."));
    }
  }
  return warnings.slice(0, 5);
}

function extractUses(data: OpenFDAResult): string {
  if (data.indications_and_usage && data.indications_and_usage.length > 0) {
    // Take first paragraph, clean it up
    const raw = data.indications_and_usage[0];
    // Remove "1 INDICATIONS AND USAGE" type headers
    const cleaned = raw
      .replace(/^\d+(\.\d+)?\s+(INDICATIONS\s+AND\s+USAGE|INDICATIONS)/i, "")
      .trim();
    // Take first 300 chars
    return cleaned.length > 400 ? cleaned.slice(0, 400) + "..." : cleaned;
  }
  if (data.purpose && data.purpose.length > 0) {
    return data.purpose.join(". ") + ".";
  }
  return "";
}

function extractDosageForms(data: OpenFDAResult): string[] {
  const forms: string[] = [];
  if (data.openfda?.route) {
    forms.push(...data.openfda.route);
  }
  if (data.dosage_and_administration && data.dosage_and_administration.length > 0) {
    const text = data.dosage_and_administration.join(" ").toLowerCase();
    const formPatterns = ["tablet", "capsule", "injection", "suspension", "solution",
      "cream", "ointment", "syrup", "inhaler", "spray", "patch", "drops"];
    for (const form of formPatterns) {
      if (text.includes(form)) {
        forms.push(form.charAt(0).toUpperCase() + form.slice(1));
      }
    }
  }
  return [...new Set(forms)];
}

async function fetchFromOpenFDA(name: string): Promise<DrugInfo | null> {
  const encodedName = encodeURIComponent(name.trim());
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodedName}"+OR+openfda.generic_name:"${encodedName}"&limit=1`;

  const response = await rateLimitedFetch(url);
  if (!response || !response.ok) {
    if (response && response.status === 429) {
      console.warn("OpenFDA rate limited");
    }
    return null;
  }

  try {
    const json = (await response.json()) as OpenFDAResponse;
    if (!json.results || json.results.length === 0) {
      return null;
    }

    const data = json.results[0];

    return {
      brandName: data.openfda?.brand_name?.[0] || name,
      genericName: data.openfda?.generic_name?.[0] || "",
      activeIngredients: data.active_ingredient || data.openfda?.substance_name || [],
      purpose: data.purpose?.[0] || "",
      uses: extractUses(data),
      warnings: extractWarnings(data),
      commonSideEffects: extractSideEffects(data),
      dosageForms: extractDosageForms(data),
      source: "fda",
    };
  } catch (err) {
    console.error("Error parsing OpenFDA response:", err);
    return null;
  }
}

/**
 * Lookup a medication by name using OpenFDA and RxNorm APIs.
 * Returns structured drug info or null if APIs are unavailable.
 */
export async function lookupMedication(name: string): Promise<DrugInfo | null> {
  if (!name || name.trim().length === 0) {
    return null;
  }

  // Try OpenFDA first
  const drugInfo = await fetchFromOpenFDA(name);
  if (drugInfo) {
    return drugInfo;
  }

  // OpenFDA didn't find it — could try RxNorm for name resolution
  // but RxNorm just gives RXCUIs and we'd need another API for full data
  // Just return null (caller should fall back)
  return null;
}

/**
 * Format drug info into a readable text block for use in LLM prompts.
 */
export function formatDrugInfoForPrompt(info: DrugInfo): string {
  const parts: string[] = [];

  if (info.brandName && info.brandName !== info.genericName) {
    parts.push(`Brand name: ${info.brandName}`);
  }
  if (info.genericName) {
    parts.push(`Generic name: ${info.genericName}`);
  }
  if (info.activeIngredients.length > 0) {
    parts.push(`Active ingredients: ${info.activeIngredients.join(", ")}`);
  }
  if (info.purpose) {
    parts.push(`Purpose: ${info.purpose}`);
  }
  if (info.uses) {
    parts.push(`Uses (from FDA label): ${info.uses}`);
  }
  if (info.commonSideEffects.length > 0) {
    parts.push(`Common side effects: ${info.commonSideEffects.join(", ")}`);
  }
  if (info.warnings.length > 0) {
    parts.push(`Key warnings: ${info.warnings.join(" ")}`);
  }
  if (info.dosageForms.length > 0) {
    parts.push(`Available forms: ${info.dosageForms.join(", ")}`);
  }

  parts.push(`\n(Source: FDA drug label database)`);

  return parts.join("\n");
}
