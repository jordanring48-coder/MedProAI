import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Medication, DrugInfo } from "../types";
import { getRefillStatus, getRefillLabel } from "../types";
import { fetchMedication, deleteMedication, fetchMedicationInfo } from "../api";
import AddEditMedicationModal from "../components/AddEditMedicationModal";
import usePremium from "../hooks/usePremium";

const refillColors = {
  green: { dot: "bg-[#34D399]", bg: "bg-[#34D399]/10", text: "text-[#34D399]" },
  orange: { dot: "bg-[#FBBF24]", bg: "bg-[#FBBF24]/10", text: "text-[#FBBF24]" },
  red: { dot: "bg-[#F87171]", bg: "bg-[#F87171]/10", text: "text-[#F87171]" },
};

export default function MedicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [med, setMed] = useState<Medication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [drugInfo, setDrugInfo] = useState<DrugInfo | null>(null);
  const [drugInfoLoading, setDrugInfoLoading] = useState(false);
  const [drugInfoError, setDrugInfoError] = useState<string | null>(null);
  const [showDrugInfo, setShowDrugInfo] = useState(false);
  const { isPremium } = usePremium();

  const loadMed = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchMedication(id);
      setMed(data);
      setLoading(false);
      // Fetch FDA drug info in background
      loadDrugInfo(id);
    } catch (err: any) {
      setError(err.message || "Failed to load medication");
      setLoading(false);
    }
  };

  const loadDrugInfo = async (medId: string) => {
    setDrugInfoLoading(true);
    setDrugInfoError(null);
    try {
      const info = await fetchMedicationInfo(medId);
      setDrugInfo(info.fda);
    } catch (err: any) {
      setDrugInfoError(err.message || "Failed to load drug information");
    } finally {
      setDrugInfoLoading(false);
    }
  };

  useEffect(() => {
    loadMed();
  }, [id]);

  const handleDelete = async () => {
    if (!med) return;
    setDeleting(true);
    try {
      await deleteMedication(med.id);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to delete");
      setDeleting(false);
    }
  };

  const handleSaved = () => {
    setShowEdit(false);
    loadMed();
  };

  if (loading) {
    return (
      <div className="p-6 pt-12 flex items-center justify-center min-h-screen">
        <div className="animate-pulse space-y-4 w-full">
          <div className="h-6 bg-[#27272A] rounded w-1/3" />
          <div className="h-40 bg-[#27272A] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error && !med) {
    return (
      <div className="p-6 pt-12 text-center">
        <div className="bg-[#161618] rounded-2xl p-8 border border-[#27272A]">
          <p className="text-[#F87171] font-medium mb-4">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="text-[#2DE2A0] font-medium hover:underline"
          >
            Back to Medications
          </button>
        </div>
      </div>
    );
  }

  if (!med) return null;

  const refillStatus = getRefillStatus(med.refill_date);
  const colors = refillColors[refillStatus];

  return (
    <div className="p-5 pt-14 pb-24 min-h-screen">
      {/* Back button */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1.5 text-[#2DE2A0] font-medium text-[17px] mb-6 hover:opacity-80 transition-opacity duration-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Medications
      </button>

      {/* Header card */}
      <div className="bg-[#161618] rounded-2xl p-6 border border-[#27272A] mb-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-[#2DE2A0]/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2DE2A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-[#FAFAFA] mb-1 tracking-tight">{med.name}</h1>
            {med.dosage && (
              <p className="text-[17px] text-[#A1A1AA] mb-1">{med.dosage}</p>
            )}
            {med.frequency && (
              <p className="text-[15px] text-[#71717A]">{med.frequency}</p>
            )}
          </div>
        </div>
      </div>

      {/* Refill status */}
      {med.refill_date && (
        <div className={`${colors.bg} rounded-2xl p-4 mb-4 flex items-center gap-3 border border-[#27272A]`}>
          <div className={`w-3 h-3 ${colors.dot} rounded-full flex-shrink-0`} />
          <div>
            <p className={`text-[15px] font-medium ${colors.text}`}>
              {getRefillLabel(med.refill_date)}
            </p>
            <p className="text-sm text-[#71717A]">
              Next refill: {new Date(med.refill_date + "T00:00:00").toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      )}

      {/* Details card */}
      <div className="bg-[#161618] rounded-2xl border border-[#27272A] overflow-hidden mb-4">
        <div className="divide-y divide-[#27272A]">
          {med.prescribing_doctor && (
            <div className="px-6 py-4 flex justify-between items-start">
              <span className="text-sm text-[#A1A1AA]">Prescribing Doctor</span>
              <span className="text-[15px] text-[#FAFAFA] font-medium text-right max-w-[60%]">
                {med.prescribing_doctor}
              </span>
            </div>
          )}
          <div className="px-6 py-4 flex justify-between items-start">
            <span className="text-sm text-[#A1A1AA]">Added</span>
            <span className="text-[15px] text-[#FAFAFA] text-right">
              {new Date(med.created_at + "Z").toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          {med.updated_at !== med.created_at && (
            <div className="px-6 py-4 flex justify-between items-start">
              <span className="text-sm text-[#A1A1AA]">Last Updated</span>
              <span className="text-[15px] text-[#FAFAFA] text-right">
                {new Date(med.updated_at + "Z").toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      {med.instructions && (
        <div className="bg-[#161618] rounded-2xl border border-[#27272A] p-6 mb-4">
          <h3 className="text-sm font-medium text-[#A1A1AA] mb-2 uppercase tracking-wide">Instructions</h3>
          <p className="text-[15px] text-[#FAFAFA] leading-relaxed">{med.instructions}</p>
        </div>
      )}

      {/* Drug Info — FDA data */}
      <div className="bg-[#161618] rounded-2xl border border-[#27272A] overflow-hidden mb-4">
        <button
          onClick={() => setShowDrugInfo(!showDrugInfo)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#1C1C1F] transition-colors duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#22D3EE]/10 rounded-lg flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="text-left">
              <span className="text-[15px] font-medium text-[#FAFAFA]">Drug Information</span>
              {drugInfo && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-[#22D3EE]/10 rounded-full">
                  <span className="w-1.5 h-1.5 bg-[#22D3EE] rounded-full" />
                  <span className="text-[10px] font-medium text-[#22D3EE] uppercase tracking-wide">Powered by FDA</span>
                </span>
              )}
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-5 h-5 text-[#71717A] transition-transform duration-200 ${showDrugInfo ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showDrugInfo && (
          <div className="px-6 pb-5 border-t border-[#27272A]">
            {drugInfoLoading ? (
              <div className="py-6 flex items-center justify-center">
                <div className="flex items-center gap-2 text-[#71717A]">
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">Loading drug information...</span>
                </div>
              </div>
            ) : drugInfoError && !drugInfo ? (
              <div className="py-4 text-center">
                <p className="text-sm text-[#71717A]">Drug information unavailable right now</p>
              </div>
            ) : drugInfo ? (
              <div className="pt-4 space-y-4">
                {/* Brand & Generic names */}
                {(drugInfo.brandName || drugInfo.genericName) && (
                  <div>
                    <h4 className="text-xs font-medium text-[#71717A] uppercase tracking-wide mb-1.5">Names</h4>
                    <div className="space-y-1">
                      {drugInfo.brandName && drugInfo.brandName !== drugInfo.genericName && (
                        <p className="text-[15px] text-[#FAFAFA]">
                          <span className="text-[#A1A1AA]">Brand: </span>
                          {drugInfo.brandName}
                        </p>
                      )}
                      {drugInfo.genericName && (
                        <p className="text-[15px] text-[#FAFAFA]">
                          <span className="text-[#A1A1AA]">Generic: </span>
                          {drugInfo.genericName}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Active Ingredients */}
                {drugInfo.activeIngredients.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-[#71717A] uppercase tracking-wide mb-1.5">Active Ingredients</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {drugInfo.activeIngredients.map((ing, i) => (
                        <span key={i} className="px-2.5 py-1 bg-[#1C1C1F] rounded-lg text-sm text-[#FAFAFA]">
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Uses */}
                {drugInfo.uses && (
                  <div>
                    <h4 className="text-xs font-medium text-[#71717A] uppercase tracking-wide mb-1.5">What It's Used For</h4>
                    <p className="text-[15px] text-[#FAFAFA] leading-relaxed">{drugInfo.uses}</p>
                  </div>
                )}

                {/* Purpose (fallback if no uses) */}
                {!drugInfo.uses && drugInfo.purpose && (
                  <div>
                    <h4 className="text-xs font-medium text-[#71717A] uppercase tracking-wide mb-1.5">Purpose</h4>
                    <p className="text-[15px] text-[#FAFAFA] leading-relaxed">{drugInfo.purpose}</p>
                  </div>
                )}

                {/* Common Side Effects */}
                {drugInfo.commonSideEffects.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-[#71717A] uppercase tracking-wide mb-1.5">Common Side Effects</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {drugInfo.commonSideEffects.map((se, i) => (
                        <span key={i} className="px-2.5 py-1 bg-[#F87171]/10 rounded-lg text-sm text-[#F87171]">
                          {se}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {drugInfo.warnings.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-[#FBBF24] uppercase tracking-wide mb-1.5">⚠ Warnings</h4>
                    <ul className="space-y-1.5">
                      {drugInfo.warnings.map((w, i) => (
                        <li key={i} className="text-sm text-[#A1A1AA] flex gap-2">
                          <span className="text-[#FBBF24] flex-shrink-0">•</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Dosage Forms */}
                {drugInfo.dosageForms.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-[#71717A] uppercase tracking-wide mb-1.5">Available Forms</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {drugInfo.dosageForms.map((form, i) => (
                        <span key={i} className="px-2.5 py-1 bg-[#1C1C1F] rounded-lg text-sm text-[#FAFAFA]">
                          {form}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* FDA badge */}
                <div className="flex items-center gap-2 pt-1 border-t border-[#27272A]">
                  <span className="text-[10px] text-[#22D3EE] font-medium uppercase tracking-wide flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Powered by FDA
                  </span>
                  <span className="text-[10px] text-[#71717A]">Data from open.fda.gov</span>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-[#71717A]">Drug information unavailable right now</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        {isPremium ? (
          <button
            onClick={() => navigate(`/monica?explain=${med.id}&name=${encodeURIComponent(med.name)}`)}
            className="w-full bg-gradient-to-r from-[#2DE2A0] to-[#22D3EE] text-[#0A0A0B] font-semibold text-[17px] py-3.5 rounded-2xl hover:from-[#24B882] hover:to-[#06B6D4] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(45,226,160,0.3)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Explain with Monica AI
          </button>
        ) : (
          <div className="w-full bg-[#161618] border border-[#27272A] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#FBBF24]/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#FAFAFA]">AI Explain</p>
              <p className="text-xs text-[#71717A]">Premium feature — upgrade to unlock</p>
            </div>
            <button
              onClick={() => navigate("/profile")}
              className="text-xs bg-[#FBBF24] text-[#0A0A0B] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#F59E0B] active:scale-[0.97] transition-all duration-200"
            >
              Upgrade
            </button>
          </div>
        )}
        <button
          onClick={() => setShowEdit(true)}
          className="w-full bg-[#2DE2A0] text-white font-semibold text-[17px] py-3.5 rounded-2xl btn-glow hover:bg-[#24B882] active:scale-[0.98] transition-all duration-200"
        >
          Edit Medication
        </button>

        {showDeleteConfirm ? (
          <div className="bg-[#F87171]/5 rounded-2xl p-4 space-y-3 border border-[#F87171]/20">
            <p className="text-sm text-[#A1A1AA] text-center">
              Are you sure you want to delete {med.name}? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-[#1C1C1F] text-[#A1A1AA] font-medium py-2.5 rounded-xl border border-[#27272A] hover:bg-[#27272A] transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-[#F87171] text-white font-medium py-2.5 rounded-xl hover:bg-[#EF4444] transition-colors duration-200 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full text-[#F87171] font-medium py-3 rounded-2xl hover:bg-[#F87171]/5 transition-colors duration-200"
          >
            Delete Medication
          </button>
        )}
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <AddEditMedicationModal
          medication={med}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
