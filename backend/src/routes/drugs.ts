import { Router, Request, Response } from "express";

const router = Router();

// ── GET /api/drugs/search?q=<search_term> ──
// Proxies to RxNorm approximateTerm endpoint
router.get("/drugs/search", async (req: Request, res: Response) => {
  const q = (req.query.q as string) || "";

  if (q.length < 2) {
    res.json({ suggestions: [], error: "Query must be at least 2 characters" });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=8`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`RxNorm returned ${response.status}`);
    }

    const data = await response.json();
    const candidates: any[] = data?.approximateGroup?.candidate || [];
    const mapped = Array.isArray(candidates)
      ? candidates
          .filter((c: any) => c.name && c.rxcui)
          .map((c: any) => ({
            name: c.name,
            rxcui: c.rxcui,
            tty: c.tty || c.source || "RXNORM",
          }))
      : [];

    // Deduplicate by case-insensitive name, keeping first rxcui
    const seen = new Set<string>();
    const suggestions = mapped.filter((s) => {
      const key = s.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ suggestions });
  } catch (err: any) {
    console.error("RxNorm search error:", err.message);
    res.json({ suggestions: [], error: "unavailable" });
  }
});

// ── GET /api/drugs/strengths?rxcui=<rxcui> ──
// Returns SCD/SBD (Semantic Clinical Drug / Semantic Branded Drug) strength variants
router.get("/drugs/strengths", async (req: Request, res: Response) => {
  const rxcui = (req.query.rxcui as string) || "";

  if (!rxcui) {
    res.status(400).json({ error: "rxcui is required" });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://rxnav.nlm.nih.gov/REST/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=SCD+SBD`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`RxNorm returned ${response.status}`);
    }

    const data = await response.json();
    const conceptGroups = data?.relatedGroup?.conceptGroup || [];

    const strengths: Array<{ name: string; rxcui: string; tty: string }> = [];
    for (const group of conceptGroups) {
      const props = group?.conceptProperties;
      if (Array.isArray(props)) {
        for (const p of props) {
          if (p.name && p.rxcui) {
            strengths.push({
              name: p.name,
              rxcui: p.rxcui,
              tty: p.tty || group.tty || "SCD",
            });
          }
        }
      }
    }

    res.json({ strengths });
  } catch (err: any) {
    console.error("RxNorm strengths error:", err.message);
    res.json({ strengths: [] });
  }
});

// ── GET /api/drugs/info?rxcui=<rxcui>&name=<name> ──
// Proxies to DailyMed (SPL metadata) + openFDA (drug label) in parallel
router.get("/drugs/info", async (req: Request, res: Response) => {
  const rxcui = (req.query.rxcui as string) || "";
  const name = (req.query.name as string) || "";

  if (!rxcui) {
    res.status(400).json({ error: "rxcui is required" });
    return;
  }

  const result: any = { rxcui, name, source: "none" };

  // Fetch DailyMed and openFDA in parallel (with individual timeouts)
  const dailyMedPromise = fetch(
    `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?rxcui=${encodeURIComponent(rxcui)}`,
    { signal: AbortSignal.timeout(8000) }
  )
    .then((r) => r.json())
    .catch((err) => {
      console.error("DailyMed fetch error:", err.message);
      return null;
    });

  const openFDAPromise = fetch(
    `https://api.fda.gov/drug/label.json?search=openfda.rxcui:${encodeURIComponent(rxcui)}&limit=1`,
    { signal: AbortSignal.timeout(8000) }
  )
    .then((r) => r.json())
    .catch((err) => {
      console.error("openFDA fetch error:", err.message);
      return null;
    });

  const [dailyMedData, openFDAData] = await Promise.all([dailyMedPromise, openFDAPromise]);

  let hasDailyMed = false;
  let hasOpenFDA = false;

  // Parse DailyMed SPL metadata
  if (dailyMedData?.data && dailyMedData.data.length > 0) {
    const spl = dailyMedData.data[0];
    if (spl.manufacturer_name) {
      result.manufacturer = spl.manufacturer_name;
    }
    // Try to extract drug class from product data elements
    if (spl.spl_product_data_elements && Array.isArray(spl.spl_product_data_elements)) {
      const classElement = spl.spl_product_data_elements.find(
        (e: string) =>
          e.toLowerCase().includes("drug class") ||
          e.toLowerCase().includes("pharmacologic class") ||
          e.toLowerCase().includes("established pharmacologic")
      );
      if (classElement) {
        result.drugClass = classElement;
      }
    }
    hasDailyMed = true;
  }

  // Parse openFDA drug label
  if (openFDAData?.results && openFDAData.results.length > 0) {
    const label = openFDAData.results[0];

    // Collect warnings from boxed_warning and warnings sections
    const warnings: string[] = [];
    if (label.boxed_warning && Array.isArray(label.boxed_warning)) {
      warnings.push(...label.boxed_warning);
    }
    if (label.warnings && Array.isArray(label.warnings)) {
      warnings.push(...label.warnings);
    }
    // Deduplicate and limit to 5
    if (warnings.length > 0) {
      result.warnings = [...new Set(warnings)].slice(0, 5);
    }

    if (label.indications_and_usage && Array.isArray(label.indications_and_usage)) {
      result.indications = label.indications_and_usage[0];
    }

    hasOpenFDA = true;
  }

  // Determine source label
  if (hasDailyMed && hasOpenFDA) {
    result.source = "dailymed+openfda";
  } else if (hasDailyMed) {
    result.source = "dailymed";
  } else if (hasOpenFDA) {
    result.source = "openfda";
  }

  if (!hasDailyMed && !hasOpenFDA) {
    result.error = "external APIs unavailable";
  }

  res.json(result);
});

export default router;
