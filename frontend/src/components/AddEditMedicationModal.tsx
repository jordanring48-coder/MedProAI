import { useState, useEffect, useRef } from "react";
import type { Medication, MedicationFormData, ValidationError, DrugSuggestion } from "../types";
import { createMedication, updateMedication, deleteMedication, scheduleDoses, fetchMedications, searchDrugs, fetchDrugInfo, fetchDrugStrengths } from "../api";
import { useNavigate } from "react-router-dom";
import usePremium from "../hooks/usePremium";

interface Props {
  medication?: Medication | null;
  onClose: () => void;
  onSaved: () => void;
  initialValues?: Partial<MedicationFormData>;
}

const emptyForm: MedicationFormData = {
  name: "",
  dosage: "",
  quantity: "",
  frequency: "",
  prescribing_doctor: "",
  refill_date: "",
  instructions: "",
  reminder_times: null,
};

// ---- Frequency options ----
const FREQUENCY_OPTIONS = [
  { value: "", label: "Select frequency..." },
  { value: "Once daily", label: "Once daily" },
  { value: "Twice daily", label: "Twice daily" },
  { value: "Three times daily", label: "Three times daily" },
  { value: "Four times daily", label: "Four times daily" },
  { value: "As needed (PRN)", label: "As needed (PRN)" },
  { value: "Once weekly", label: "Once weekly" },
];

// ---- Dosage presets ----
const DOSAGE_PRESETS = [
  { value: "", label: "Select dosage..." },
  { value: "5mg", label: "5mg" },
  { value: "10mg", label: "10mg" },
  { value: "20mg", label: "20mg" },
  { value: "25mg", label: "25mg" },
  { value: "50mg", label: "50mg" },
  { value: "100mg", label: "100mg" },
  { value: "200mg", label: "200mg" },
  { value: "500mg", label: "500mg" },
  { value: "__other__", label: "Other..." },
];

const DOSAGE_PRESET_VALUES = DOSAGE_PRESETS.filter(p => p.value !== "__other__" && p.value !== "").map(p => p.value);

// ---- Quantity presets ----
const QUANTITY_OPTIONS = [
  { value: "", label: "Select quantity..." },
  { value: "15 tablets", label: "15 tablets" },
  { value: "30 tablets", label: "30 tablets" },
  { value: "60 tablets", label: "60 tablets" },
  { value: "90 tablets", label: "90 tablets" },
  { value: "10 capsules", label: "10 capsules" },
  { value: "30 capsules", label: "30 capsules" },
  { value: "60 capsules", label: "60 capsules" },
  { value: "100ml", label: "100ml" },
  { value: "200ml", label: "200ml" },
  { value: "__other__", label: "Other..." },
];

const QUANTITY_PRESET_VALUES = QUANTITY_OPTIONS.filter(p => p.value !== "__other__" && p.value !== "").map(p => p.value);

// Parse frequency text to determine how many reminder time inputs to show
function getReminderSlotCount(frequency: string): number {
  const f = frequency.trim();
  if (!f) return 0; // Empty → hide reminder times

  // Exact matches for dropdown options (fast path)
  if (f === "As needed (PRN)") return 0;
  if (f === "Once daily" || f === "Once weekly") return 1;
  if (f === "Twice daily") return 2;
  if (f === "Three times daily") return 3;
  if (f === "Four times daily") return 4;

  // Fallback regex for backward compatibility with old free-text values
  const fl = f.toLowerCase();
  if (/as needed|prn|when necessary|pro re nata/.test(fl)) return 0;
  if (/(three|3)\s*(x|times?)\s*(a\s*)?(day|daily)/i.test(fl) || /t\.?i\.?d/i.test(fl)) return 3;
  if (/(twice|two|2)\s*(x|times?)\s*(a\s*)?(day|daily)/i.test(fl) || /b\.?i\.?d/i.test(fl)) return 2;
  if (/(four|4)\s*(x|times?)\s*(a\s*)?(day|daily)/i.test(fl) || /q\.?i\.?d/i.test(fl)) return 4;
  if (/once|daily|1\s*(x|times?)/i.test(fl)) return 1;
  if (/weekly/i.test(fl)) return 1;
  return 0; // Unknown → no reminder time inputs
}

const DEFAULT_TIMES: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "14:00", "20:00"],
  4: ["08:00", "12:00", "16:00", "20:00"],
};

function getDefaultTimes(count: number): string[] {
  return DEFAULT_TIMES[count] || ["08:00"];
}

// Shared dark-theme select styles (reused across frequency & dosage selects)
const selectClasses =
  "w-full px-4 py-3 bg-[#1C1C1F] rounded-xl text-[17px] text-[#FAFAFA] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow appearance-none cursor-pointer";

const selectErrorClasses = "ring-2 ring-[#F87171]";

// Maps RxNorm TTY codes to human-readable labels
const TTY_LABELS: Record<string, string> = {
  SBD: "Branded Drug",
  SCD: "Clinical Drug",
  BPCK: "Brand Pack",
  GPCK: "Generic Pack",
  IN: "Ingredient",
  BN: "Brand Name",
  PIN: "Precise Ingredient",
  MIN: "Multiple Ingredient",
  DF: "Dose Form",
  DFG: "Dose Form Group",
};

export default function AddEditMedicationModal({ medication, onClose, onSaved, initialValues }: Props) {
  const isEdit = !!medication;
  const [form, setForm] = useState<MedicationFormData>(emptyForm);
  const [reminderTimes, setReminderTimes] = useState<string[]>(["08:00"]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { isPremium } = usePremium();
  const navigate = useNavigate();

  // ── Drug autocomplete state ──
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<DrugSuggestion | null>(null);
  const [drugInfo, setDrugInfo] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Strength picker state ──
  const [strengthOptions, setStrengthOptions] = useState<Array<{ name: string; rxcui: string; tty: string }>>([]);
  const [showStrengthPicker, setShowStrengthPicker] = useState(false);

  // Dosage: track whether "Other..." is selected and the custom text
  const [isCustomDosage, setIsCustomDosage] = useState(false);
  const [customDosageText, setCustomDosageText] = useState("");

  // Quantity: track whether "Other..." is selected and the custom text
  const [isCustomQuantity, setIsCustomQuantity] = useState(false);
  const [customQuantityText, setCustomQuantityText] = useState("");

  useEffect(() => {
    if (medication) {
      setForm({
        name: medication.name,
        dosage: medication.dosage,
        quantity: medication.quantity || "",
        frequency: medication.frequency,
        prescribing_doctor: medication.prescribing_doctor,
        refill_date: medication.refill_date,
        instructions: medication.instructions,
        reminder_times: medication.reminder_times,
      });

      // Determine if dosage is a custom value (not in presets)
      const dosageIsPreset = DOSAGE_PRESET_VALUES.includes(medication.dosage);
      setIsCustomDosage(!dosageIsPreset && medication.dosage !== "");
      setCustomDosageText(dosageIsPreset || !medication.dosage ? "" : medication.dosage);

      // Determine if quantity is a custom value (not in presets)
      const quantityIsPreset = QUANTITY_PRESET_VALUES.includes(medication.quantity || "");
      setIsCustomQuantity(!quantityIsPreset && (medication.quantity || "") !== "");
      setCustomQuantityText(quantityIsPreset || !medication.quantity ? "" : medication.quantity || "");

      // Parse existing reminder_times or use defaults based on frequency
      if (medication.reminder_times) {
        try {
          const parsed = JSON.parse(medication.reminder_times);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setReminderTimes(parsed);
          } else {
            setReminderTimes(getDefaultTimes(getReminderSlotCount(medication.frequency)));
          }
        } catch {
          setReminderTimes(getDefaultTimes(getReminderSlotCount(medication.frequency)));
        }
      } else {
        setReminderTimes(getDefaultTimes(getReminderSlotCount(medication.frequency)));
      }
    } else if (initialValues) {
      setForm({
        ...emptyForm,
        ...initialValues,
        reminder_times: null,
      });
      const freq = initialValues.frequency || "";
      const dosageIsPreset = DOSAGE_PRESET_VALUES.includes(initialValues.dosage || "");
      setIsCustomDosage(!dosageIsPreset && (initialValues.dosage || "") !== "");
      setCustomDosageText(dosageIsPreset || !initialValues.dosage ? "" : initialValues.dosage || "");
      const quantityIsPreset2 = QUANTITY_PRESET_VALUES.includes(initialValues.quantity || "");
      setIsCustomQuantity(!quantityIsPreset2 && (initialValues.quantity || "") !== "");
      setCustomQuantityText(quantityIsPreset2 || !initialValues.quantity ? "" : initialValues.quantity || "");
      setReminderTimes(getDefaultTimes(getReminderSlotCount(freq)));
    } else {
      setForm(emptyForm);
      setReminderTimes(["08:00"]);
      setIsCustomDosage(false);
      setCustomDosageText("");
      setIsCustomQuantity(false);
      setCustomQuantityText("");
    }
    setErrors([]);
    setShowDeleteConfirm(false);
  }, [medication, initialValues]);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  const setField = (field: keyof MedicationFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => prev.filter((e) => e.field !== field));

    // When frequency changes, adjust the number of reminder time slots
    if (field === "frequency") {
      const count = getReminderSlotCount(value);
      if (count === 0) {
        setReminderTimes([]);
      } else {
        setReminderTimes((prev) => {
          if (prev.length === count) return prev;
          const defaults = getDefaultTimes(count);
          if (prev.length < count) {
            return [...prev, ...defaults.slice(prev.length)];
          }
          return prev.slice(0, count);
        });
      }
    }
  };

  const getError = (field: string): string | null => {
    const err = errors.find((e) => e.field === field);
    return err ? err.message : null;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Premium gate: free users limited to 5 medications
    if (!isEdit && !isPremium) {
      try {
        const meds = await fetchMedications();
        if (meds.length >= 5) {
          setErrors([{ field: "name", message: "Free tier limited to 5 medications. Upgrade to Premium for unlimited." }]);
          return;
        }
      } catch {
        // If we can't check, let the save proceed — server will handle it
      }
    }

    const timesJson = reminderTimes.length > 0 ? JSON.stringify(reminderTimes) : null;
    const formWithTimes = { ...form, reminder_times: timesJson };

    setSaving(true);
    try {
      if (isEdit) {
        await updateMedication(medication!.id, formWithTimes);
      } else {
        const newMed = await createMedication(formWithTimes);
        // Auto-generate doses if frequency is set
        if (form.frequency.trim()) {
          try {
            await scheduleDoses(newMed.id, form.frequency, undefined, reminderTimes.length > 0 ? reminderTimes : undefined, -new Date().getTimezoneOffset());
          } catch {
            // Non-fatal: doses scheduling can fail silently
          }
        }
      }
      onSaved();
    } catch (err: any) {
      if (err.errors && Array.isArray(err.errors)) {
        setErrors(err.errors);
      } else {
        setErrors([{ field: "name", message: err.message || "Failed to save" }]);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMedication(medication!.id);
      onSaved();
    } catch (err: any) {
      setErrors([{ field: "name", message: err.message || "Failed to delete" }]);
    } finally {
      setDeleting(false);
    }
  };

  // ── Drug autocomplete handlers ──

  const selectSuggestion = async (suggestion: DrugSuggestion) => {
    setField("name", suggestion.name);
    setSelectedSuggestion(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setDrugInfo(null);

    // Check for strength variants before fetching drug info
    let effectiveRxcui = suggestion.rxcui;
    let effectiveName = suggestion.name;

    try {
      const result = await fetchDrugStrengths(suggestion.rxcui);
      if (result.strengths.length > 1) {
        setStrengthOptions(result.strengths);
        setShowStrengthPicker(true);
        return; // Wait for user to pick a strength
      }
      // If exactly one strength, use it as the final rxcui
      if (result.strengths.length === 1) {
        const strength = result.strengths[0];
        effectiveRxcui = strength.rxcui;
        effectiveName = strength.name;
        setSelectedSuggestion({ ...suggestion, rxcui: strength.rxcui, name: strength.name });
        // Auto-fill dosage from strength name
        const dosageMatch = strength.name.match(/(\d+\s*(MG|MCG|G|ML|%))/i);
        if (dosageMatch) {
          const extracted = dosageMatch[1].toUpperCase();
          if (DOSAGE_PRESET_VALUES.includes(extracted)) {
            setField("dosage", extracted);
            setIsCustomDosage(false);
            setCustomDosageText("");
          } else {
            setIsCustomDosage(true);
            setCustomDosageText(extracted);
            setField("dosage", extracted);
          }
        }
      }
    } catch {
      // Silently fail — proceed without strengths
    }

    // Fetch drug info from DailyMed/openFDA
    setShowStrengthPicker(false);
    try {
      const info = await fetchDrugInfo(effectiveRxcui, effectiveName);
      setDrugInfo(info);
    } catch {
      // Silently fail — drug info is non-critical
    }
  };

  const selectStrength = async (strength: { name: string; rxcui: string; tty: string }) => {
    // Parse dosage from strength name: e.g. "Advil 200 MG Oral Tablet" → "200 MG"
    const dosageMatch = strength.name.match(/(\d+\s*(MG|MCG|G|ML|%))/i);
    if (dosageMatch) {
      const extracted = dosageMatch[1].toUpperCase();
      if (DOSAGE_PRESET_VALUES.includes(extracted)) {
        setField("dosage", extracted);
        setIsCustomDosage(false);
        setCustomDosageText("");
      } else {
        setIsCustomDosage(true);
        setCustomDosageText(extracted);
        setField("dosage", extracted);
      }
    }

    // Update selection with strength-level rxcui
    setSelectedSuggestion((prev) => prev ? { ...prev, rxcui: strength.rxcui, name: strength.name } : null);

    // Close picker and fetch drug info
    setShowStrengthPicker(false);
    try {
      const info = await fetchDrugInfo(strength.rxcui, strength.name);
      setDrugInfo(info);
    } catch {
      // Silently fail
    }
  };

  const skipStrengthPicker = async () => {
    setShowStrengthPicker(false);
    // Fetch drug info with the original suggestion
    if (selectedSuggestion) {
      try {
        const info = await fetchDrugInfo(selectedSuggestion.rxcui, selectedSuggestion.name);
        setDrugInfo(info);
      } catch {
        // Silently fail
      }
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setField("name", value);

    // If user had a selection and continues typing, clear it
    if (selectedSuggestion) {
      setSelectedSuggestion(null);
      setDrugInfo(null);
      setShowStrengthPicker(false);
      setStrengthOptions([]);
    }

    // Clear previous debounce timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length >= 2) {
      setSearching(true);
      setShowSuggestions(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await searchDrugs(value.trim());
          setSuggestions(result.suggestions || []);
          setSearchError(!!result.error);
          setHighlightedIndex(-1);
        } catch {
          setSuggestions([]);
          setSearchError(true);
        } finally {
          setSearching(false);
        }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
      setSearchError(false);
      setHighlightedIndex(-1);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault();
          selectSuggestion(suggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleNameBlur = () => {
    // Delay closing to allow click on suggestion to register
    setTimeout(() => {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  const handleNameFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const dismissDrugInfo = () => {
    setDrugInfo(null);
    setSelectedSuggestion(null);
    setShowStrengthPicker(false);
    setStrengthOptions([]);
  };

  // Build frequency options dynamically: if current value isn't a preset, add it
  const frequencyOptions = [...FREQUENCY_OPTIONS];
  if (form.frequency && !FREQUENCY_OPTIONS.some(o => o.value === form.frequency)) {
    frequencyOptions.unshift({ value: form.frequency, label: `Custom: ${form.frequency}` });
  }

  // Determine which dosage select value to show
  const dosageSelectValue = isCustomDosage ? "__other__" : (DOSAGE_PRESET_VALUES.includes(form.dosage) ? form.dosage : "");

  // Determine which quantity select value to show
  const quantitySelectValue = isCustomQuantity ? "__other__" : (QUANTITY_PRESET_VALUES.includes(form.quantity) ? form.quantity : "");

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in"
    >
      <div className="bg-[#161618] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-xl animate-slide-up border border-[#27272A]">
        {/* Header */}
        <div className="sticky top-0 bg-[#161618] rounded-t-3xl px-6 pt-6 pb-4 border-b border-[#27272A] flex items-center justify-between z-10">
          <button
            onClick={onClose}
            className="text-[#2DE2A0] font-medium text-[17px] hover:opacity-80"
          >
            Cancel
          </button>
          <h2 className="text-[17px] font-semibold text-[#FAFAFA]">
            {isEdit ? "Edit Medication" : "New Medication"}
          </h2>
          <div className="w-[60px]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="px-6 py-4 space-y-5">
          {/* Name — with RxNorm autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
              Medication Name <span className="text-[#F87171]">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={form.name}
              onChange={handleNameChange}
              onKeyDown={handleNameKeyDown}
              onBlur={handleNameBlur}
              onFocus={handleNameFocus}
              placeholder="e.g. Lisinopril"
              autoComplete="off"
              className={`w-full px-4 py-3 bg-[#1C1C1F] rounded-xl text-[17px] text-[#FAFAFA] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow ${
                showSuggestions && suggestions.length > 0 ? "rounded-b-none" : ""
              } ${getError("name") ? "ring-2 ring-[#F87171]" : ""}`}
              autoFocus
            />

            {/* Autocomplete dropdown */}
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full z-20 bg-[#1C1C1F] border border-[#27272A] rounded-b-xl shadow-2xl max-h-56 overflow-y-auto">
                {searching && suggestions.length === 0 && (
                  <div className="px-4 py-3 text-sm text-[#71717A] flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching...
                  </div>
                )}
                {!searching && suggestions.length === 0 && !searchError && (
                  <div className="px-4 py-3 text-sm text-[#71717A]">
                    No matches found — enter manually
                  </div>
                )}
                {!searching && searchError && (
                  <div className="px-4 py-3 text-sm text-[#F87171]">
                    Search unavailable — try again
                  </div>
                )}
                {suggestions.map((s, idx) => (
                  <button
                    key={s.rxcui}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(s);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                      idx === highlightedIndex
                        ? "bg-[#2DE2A0]/10"
                        : "hover:bg-[#2DE2A0]/5"
                    }`}
                  >
                    <span className="text-[15px] text-[#FAFAFA] font-medium truncate mr-2">
                      {s.name}
                    </span>
                    <span className="text-xs text-[#71717A] shrink-0">
                      {TTY_LABELS[s.tty] || s.tty}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Drug info banner — shown after selecting a suggestion */}
            {drugInfo && (
              <div className="mt-2 bg-[#2DE2A0]/5 border border-[#2DE2A0]/20 rounded-xl p-3 relative">
                <button
                  type="button"
                  onClick={dismissDrugInfo}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1 1l10 10M11 1L1 11" />
                  </svg>
                </button>
                <div className="space-y-1.5 text-sm pr-6">
                  {drugInfo.drugClass && (
                    <p className="text-[#A1A1AA]">
                      <span className="text-[#FAFAFA] font-medium">Class:</span>{" "}
                      {drugInfo.drugClass}
                    </p>
                  )}
                  {drugInfo.manufacturer && (
                    <p className="text-[#A1A1AA]">
                      <span className="text-[#FAFAFA] font-medium">Manufacturer:</span>{" "}
                      {drugInfo.manufacturer}
                    </p>
                  )}
                  {drugInfo.indications && (
                    <p className="text-[#A1A1AA]">
                      <span className="text-[#FAFAFA] font-medium">Use:</span>{" "}
                      {drugInfo.indications.length > 150
                        ? drugInfo.indications.slice(0, 150) + "..."
                        : drugInfo.indications}
                    </p>
                  )}
                  {drugInfo.warnings && drugInfo.warnings.length > 0 && (
                    <div className="text-[#FBBF24]">
                      <span className="font-medium">⚠ Warnings:</span>
                      <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                        {drugInfo.warnings.slice(0, 3).map((w: string, i: number) => (
                          <li key={i} className="text-xs leading-relaxed">
                            {w.length > 120 ? w.slice(0, 120) + "..." : w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {drugInfo.source === "none" && drugInfo.error && (
                    <p className="text-[#71717A] text-xs italic">
                      Drug info unavailable — you can still add this medication
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Strength picker — shown when drug has multiple strengths */}
            {showStrengthPicker && strengthOptions.length > 0 && (
              <div className="mt-2 bg-[#1C1C1F] rounded-xl p-3 border border-[#27272A]">
                <p className="text-[#71717A] text-xs font-semibold uppercase tracking-wider mb-2">
                  Select strength
                </p>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {strengthOptions.map((s) => (
                    <button
                      key={s.rxcui}
                      type="button"
                      onClick={() => selectStrength(s)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-lg hover:bg-[#2DE2A0]/5 transition-colors group"
                    >
                      <span className="w-4 h-4 rounded-full border-2 border-[#3F3F46] flex items-center justify-center shrink-0 group-hover:border-[#2DE2A0]">
                        <span className="w-2 h-2 rounded-full bg-[#2DE2A0] opacity-0 group-hover:opacity-100" />
                      </span>
                      <span className="text-sm text-[#D4D4D8] group-hover:text-[#FAFAFA] leading-tight">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={skipStrengthPicker}
                  className="mt-2 w-full text-center text-xs text-[#71717A] hover:text-[#A1A1AA] py-1 transition-colors"
                >
                  Skip — enter manually
                </button>
              </div>
            )}

            {getError("name") && (
              <p className="mt-1 text-sm text-[#F87171]">{getError("name")}</p>
            )}
            {getError("name")?.includes("Upgrade to Premium") && (
              <button
                type="button"
                onClick={() => { onClose(); navigate("/profile"); }}
                className="mt-2 w-full bg-[#FBBF24] text-black font-semibold text-sm py-2.5 rounded-xl hover:bg-[#F59E0B] active:scale-[0.97] transition-all"
              >
                Upgrade to Premium
              </button>
            )}
          </div>

          {/* Dosage — Select + custom text input */}
          <div>
            <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">Dosage</label>
            <div className="relative">
              <select
                value={dosageSelectValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__other__") {
                    setIsCustomDosage(true);
                    setField("dosage", customDosageText);
                  } else {
                    setIsCustomDosage(false);
                    setCustomDosageText("");
                    setField("dosage", val);
                  }
                }}
                className={`${selectClasses} ${getError("dosage") ? selectErrorClasses : ""}`}
              >
                {DOSAGE_PRESETS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {/* Custom dropdown chevron */}
              <svg
                className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA] pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isCustomDosage && (
              <input
                type="text"
                value={customDosageText}
                onChange={(e) => {
                  setCustomDosageText(e.target.value);
                  setField("dosage", e.target.value);
                }}
                placeholder="Enter custom dosage..."
                className="mt-2 w-full px-4 py-3 bg-[#1C1C1F] rounded-xl text-[17px] text-[#FAFAFA] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow"
              />
            )}
            {getError("dosage") && (
              <p className="mt-1 text-sm text-[#F87171]">{getError("dosage")}</p>
            )}
          </div>

          {/* Quantity — Select dropdown */}
          <div>
            <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">Quantity</label>
            <div className="relative">
              <select
                value={quantitySelectValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__other__") {
                    setIsCustomQuantity(true);
                    setField("quantity", customQuantityText);
                  } else {
                    setIsCustomQuantity(false);
                    setCustomQuantityText("");
                    setField("quantity", val);
                  }
                }}
                style={{ colorScheme: "dark" }}
                className={`bg-[#1C1C1F] rounded-xl px-4 py-3 text-[15px] text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#2DE2A0]/40 transition-shadow appearance-none cursor-pointer w-full ${
                  getError("quantity") ? "ring-2 ring-[#F87171]" : ""
                }`}
              >
                {QUANTITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {/* Custom dropdown chevron */}
              <svg
                className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA] pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isCustomQuantity && (
              <input
                type="text"
                value={customQuantityText}
                onChange={(e) => {
                  setCustomQuantityText(e.target.value);
                  setField("quantity", e.target.value);
                }}
                placeholder="Enter custom quantity..."
                className="mt-2 w-full px-4 py-3 bg-[#1C1C1F] rounded-xl text-[17px] text-[#FAFAFA] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow"
              />
            )}
            {getError("quantity") && (
              <p className="mt-1 text-sm text-[#F87171]">{getError("quantity")}</p>
            )}
          </div>

          {/* Frequency — Select dropdown */}
          <div>
            <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
              Frequency <span className="text-[#71717A] font-normal">(needed for dose reminders)</span>
            </label>
            <div className="relative">
              <select
                value={form.frequency}
                onChange={(e) => setField("frequency", e.target.value)}
                className={`${selectClasses} ${getError("frequency") ? selectErrorClasses : ""}`}
              >
                {frequencyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {/* Custom dropdown chevron */}
              <svg
                className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA] pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {getError("frequency") && (
              <p className="mt-1 text-sm text-[#F87171]">{getError("frequency")}</p>
            )}
            {!form.frequency.trim() && (
              <p className="mt-1 text-xs text-[#71717A]">
                Set a frequency like "Once daily" to auto-generate dose reminders for your timeline
              </p>
            )}
          </div>

          {/* Reminder Times */}
          {reminderTimes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
                Reminder Times
              </label>
              <div className="flex flex-wrap gap-2">
                {reminderTimes.map((time, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => {
                        setReminderTimes((prev) => {
                          const next = [...prev];
                          next[idx] = e.target.value;
                          return next;
                        });
                      }}
                      className="w-[120px] px-3 py-2 bg-[#1C1C1F] rounded-xl text-[15px] text-[#FAFAFA] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow color-scheme-dark border border-[#27272A]"
                    />
                    {reminderTimes.length > 1 && (
                      <span className="text-xs text-[#71717A] min-w-[28px]">
                        {idx === 0 ? "AM" : idx === reminderTimes.length - 1 ? "PM" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-[#71717A]">
                Set exact reminder times for this medication. These override the auto-generated defaults.
              </p>
            </div>
          )}

          {/* Prescribing Doctor */}
          <div>
            <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
              Prescribing Doctor
            </label>
            <input
              type="text"
              value={form.prescribing_doctor}
              onChange={(e) => setField("prescribing_doctor", e.target.value)}
              placeholder="e.g. Dr. Smith"
              className={`w-full px-4 py-3 bg-[#1C1C1F] rounded-xl text-[17px] text-[#FAFAFA] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow ${
                getError("prescribing_doctor") ? "ring-2 ring-[#F87171]" : ""
              }`}
            />
            {getError("prescribing_doctor") && (
              <p className="mt-1 text-sm text-[#F87171]">{getError("prescribing_doctor")}</p>
            )}
          </div>

          {/* Refill Date */}
          <div>
            <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
              Next Refill Date
            </label>
            <input
              type="date"
              value={form.refill_date}
              onChange={(e) => setField("refill_date", e.target.value)}
              className={`w-full px-4 py-3 bg-[#1C1C1F] rounded-xl text-[17px] text-[#FAFAFA] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow color-scheme-dark ${
                getError("refill_date") ? "ring-2 ring-[#F87171]" : ""
              }`}
            />
            {getError("refill_date") && (
              <p className="mt-1 text-sm text-[#F87171]">{getError("refill_date")}</p>
            )}
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
              Instructions
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) => setField("instructions", e.target.value)}
              placeholder="e.g. Take with food, avoid alcohol..."
              rows={3}
              className={`w-full px-4 py-3 bg-[#1C1C1F] rounded-xl text-[17px] text-[#FAFAFA] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#2DE2A0] transition-shadow resize-none ${
                getError("instructions") ? "ring-2 ring-[#F87171]" : ""
              }`}
            />
            {getError("instructions") && (
              <p className="mt-1 text-sm text-[#F87171]">{getError("instructions")}</p>
            )}
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#2DE2A0] text-white font-semibold text-[17px] py-3.5 rounded-2xl shadow-sm hover:bg-[#24B882] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Medication"}
          </button>

          {/* Delete — only on edit */}
          {isEdit && (
            <div className="pt-1 pb-2">
              {showDeleteConfirm ? (
                <div className="bg-[#F87171]/5 rounded-2xl p-4 space-y-3 border border-[#F87171]/20">
                  <p className="text-sm text-[#A1A1AA] text-center">
                    Are you sure you want to delete this medication? This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 bg-[#1C1C1F] text-[#A1A1AA] font-medium py-2.5 rounded-xl border border-[#27272A] hover:bg-[#27272A] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 bg-[#F87171] text-white font-medium py-2.5 rounded-xl hover:bg-[#EF4444] transition-colors disabled:opacity-60"
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full text-[#F87171] font-medium py-3 rounded-2xl hover:bg-[#F87171]/5 transition-colors"
                >
                  Delete Medication
                </button>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-in {
          animation: fade-in 0.2s ease-out;
        }

        /* Dark theme select option styling */
        select option {
          background: #1C1C1F;
          color: #FAFAFA;
        }
      `}</style>
    </div>
  );
}
