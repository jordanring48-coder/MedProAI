import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { ChatMessage, Medication } from "../types";
import type { DetectedAction, ActionMedicationData, ActionSymptomData, ActionAppointmentData } from "../types";
import {
  aiChat,
  aiExplain,
  aiSummary,
  aiDoctorReport,
  aiSymptomInsights,
  fetchMedications,
  detectAction,
  createMedication,
  createSymptom,
  createAppointment,
  scheduleDoses,
} from "../api";
import PremiumGate from "../components/PremiumGate";
import AddEditMedicationModal from "../components/AddEditMedicationModal";
import LogSymptomModal from "../components/LogSymptomModal";
import AppointmentModal from "../components/AppointmentModal";
import UserAvatar from "../components/UserAvatar";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Simple markdown-like rendering
function renderMarkdown(text: string): string {
  let html = text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");

  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      if (inList) { result.push("</ul>"); inList = false; }
      const level = headingMatch[1].length;
      const sizes = ["text-lg", "text-base", "text-sm", "text-xs"];
      const weights = ["font-bold", "font-semibold", "font-medium", "font-medium"];
      result.push(
        `<p class="${sizes[level - 1] || "text-base"} ${weights[level - 1] || "font-bold"} mt-3 mb-1">${headingMatch[2]}</p>`
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      if (!inList) { result.push('<ul class="list-disc pl-4 space-y-0.5 mt-1 mb-2">'); inList = true; }
      result.push(`<li class="text-sm">${bulletMatch[1]}</li>`);
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numberedMatch) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push(`<p class="pl-4 text-sm mb-0.5"><span class="font-medium">${trimmed.match(/^\d+/)?.[0]}.</span> ${numberedMatch[1]}</p>`);
      continue;
    }

    if (inList) { result.push("</ul>"); inList = false; }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      result.push('<hr class="my-2 border-[#27272A]" />');
      continue;
    }

    if (trimmed.length > 0) {
      result.push(`<p class="text-sm mb-1.5">${trimmed}</p>`);
    } else {
      result.push('<div class="h-1"></div>');
    }
  }

  if (inList) { result.push("</ul>"); }
  return result.join("\n");
}

interface PendingAction {
  intent: DetectedAction["intent"];
  data: DetectedAction["data"];
  messageId: string;
  confirmed: boolean;
}

// Convert AI severity (1-10) to app severity (1-5)
function convertSeverity(aiSeverity: number): number {
  if (!aiSeverity || aiSeverity < 1) return 3;
  return Math.max(1, Math.min(5, Math.round(aiSeverity / 2)));
}

// Render severity dots
function SeverityDots({ severity }: { severity: number }) {
  const appSeverity = convertSeverity(severity);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((level) => {
        const active = level <= appSeverity;
        let color = "";
        if (active) {
          if (level <= 2) color = "bg-[#34D399]";
          else if (level === 3) color = "bg-[#FBBF24]";
          else if (level === 4) color = "bg-[#F97316]";
          else color = "bg-[#F87171]";
        }
        return (
          <div
            key={level}
            className={`w-2.5 h-2.5 rounded-full ${active ? color : "bg-[#3F3F46]"}`}
          />
        );
      })}
      <span className="text-xs text-[#A1A1AA] ml-1">{appSeverity}/5</span>
    </div>
  );
}

export default function AssistantPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [medicationContext, setMedicationContext] = useState<string>("");
  const [medications, setMedications] = useState<Medication[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Modal state for Edit flow
  const [editMedicationModal, setEditMedicationModal] = useState<Partial<{
    name: string; dosage: string; frequency: string; instructions: string;
  }> | null>(null);
  const [editSymptomModal, setEditSymptomModal] = useState<{
    name: string; severity: number; notes: string;
  } | null>(null);
  const [editAppointmentModal, setEditAppointmentModal] = useState<Partial<{
    title: string; doctor_name: string; date: string; time: string; location: string; notes: string;
  }> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchMedications()
      .then((meds) => {
        setMedications(meds);
        if (meds.length > 0) {
          const ctx = meds
            .map(
              (m) =>
                `- ${m.name} ${m.dosage || ""} (${m.frequency || "no frequency set"})${m.instructions ? `. ${m.instructions}` : ""}`
            )
            .join("\n");
          setMedicationContext(ctx);
        }
      })
      .catch(() => {});
  }, []);

  // Handle auto-trigger from medication detail page
  useEffect(() => {
    const explainMedId = searchParams.get("explain");
    const explainMedName = searchParams.get("name");
    if (explainMedId && explainMedName && messages.length === 0) {
      setSearchParams({}, { replace: true });
      handleQuickAction("explain", Number(explainMedId), explainMedName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const addMessage = (role: "user" | "assistant", content: string) => {
    const msg: ChatMessage = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const updateMessageContent = (messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
    );
  };

  // ── Confirmation handlers ──

  const handleConfirm = async () => {
    if (!pendingAction || pendingAction.confirmed) return;

    const { intent, data, messageId } = pendingAction;
    setPendingAction((prev) => prev ? { ...prev, confirmed: true } : null);

    try {
      switch (intent) {
        case "add_medication": {
          const medData = data as ActionMedicationData;
          const med = await createMedication({
            name: (medData.name || "New Medication").trim(),
            dosage: (medData.dosage || "").trim(),
            quantity: "",
            frequency: (medData.frequency || "Once daily").trim(),
            prescribing_doctor: "",
            refill_date: "",
            instructions: (medData.instructions || "").trim(),
          });
          // Schedule doses for the new medication
          await scheduleDoses(med.id, med.frequency);
          updateMessageContent(messageId, `✅ Added **${med.name}** to your tracker. [View medication →](/medications/${med.id})`);
          // Refresh medications list
          fetchMedications().then(setMedications).catch(() => {});
          break;
        }
        case "add_symptom": {
          const symData = data as ActionSymptomData;
          await createSymptom({
            name: (symData.name || "Unknown symptom").trim(),
            severity: convertSeverity(symData.severity || 3),
            notes: (symData.notes || "").trim() || undefined,
          });
          updateMessageContent(messageId, `✅ Logged **${symData.name || "symptom"}** to your tracker. [View timeline →](/timeline)`);
          break;
        }
        case "add_appointment": {
          const apptData = data as ActionAppointmentData;
          await createAppointment({
            title: (apptData.title || "Appointment").trim(),
            doctor_name: (apptData.doctor_name || "").trim(),
            location: (apptData.location || "").trim(),
            date: (apptData.date || new Date().toISOString().slice(0, 10)).trim(),
            time: (apptData.time || "").trim(),
            notes: (apptData.notes || "").trim(),
          });
          updateMessageContent(messageId, `✅ Added **${apptData.title || "appointment"}** to your tracker. [View appointments →](/appointments)`);
          break;
        }
      }
    } catch (err: any) {
      updateMessageContent(messageId, `❌ Couldn't save: ${err.message || "Something went wrong."}`);
    }
  };

  const handleEdit = () => {
    if (!pendingAction) return;

    const { intent, data } = pendingAction;
    switch (intent) {
      case "add_medication": {
        const medData = data as ActionMedicationData;
        setEditMedicationModal({
          name: medData.name || "",
          dosage: medData.dosage || "",
          frequency: medData.frequency || "",
          instructions: medData.instructions || "",
        });
        break;
      }
      case "add_symptom": {
        const symData = data as ActionSymptomData;
        setEditSymptomModal({
          name: symData.name || "",
          severity: convertSeverity(symData.severity || 3),
          notes: symData.notes || "",
        });
        break;
      }
      case "add_appointment": {
        const apptData = data as ActionAppointmentData;
        setEditAppointmentModal({
          title: apptData.title || "",
          doctor_name: apptData.doctor_name || "",
          date: apptData.date || "",
          time: apptData.time || "",
          location: apptData.location || "",
          notes: apptData.notes || "",
        });
        break;
      }
    }
  };

  const handleCancel = () => {
    if (!pendingAction) return;
    updateMessageContent(pendingAction.messageId, "_Okay, cancelled._");
    setPendingAction(null);
  };

  const handleEditSaved = () => {
    if (!pendingAction) return;
    const messageId = pendingAction.messageId;
    setPendingAction(null);
    setEditMedicationModal(null);
    setEditSymptomModal(null);
    setEditAppointmentModal(null);
    updateMessageContent(messageId, "✅ Saved to your tracker.");
    // Refresh medications
    fetchMedications().then(setMedications).catch(() => {});
  };

  // ── Send handler with intent detection ──

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    addMessage("user", text);
    setLoading(true);

    try {
      // First, detect if this is an "add" intent
      const detection = await detectAction(text, medicationContext || undefined);

      if (detection.action) {
        // Add intent detected — show confirmation card
        const cardMsg = addMessage("assistant", "__CONFIRM_CARD__");
        setPendingAction({
          intent: detection.action.intent,
          data: detection.action.data,
          messageId: cardMsg.id,
          confirmed: false,
        });
        setLoading(false);
        return;
      }

      // No add intent — proceed with normal aiChat
      const res = await aiChat(text, medicationContext || undefined);
      const answer = res.answer || "Sorry, I couldn't process that. Please try again.";
      addMessage("assistant", answer);
    } catch (err: any) {
      addMessage("assistant", err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = async (
    action: "explain" | "summary" | "doctor-report" | "symptoms",
    medId?: number,
    medName?: string
  ) => {
    if (loading) return;
    setLoading(true);

    let userLabel = "";
    let responseText = "";

    try {
      switch (action) {
        case "explain": {
          if (!medId) {
            const meds = await fetchMedications();
            if (meds.length === 0) {
              responseText = "You don't have any medications saved yet. Add a medication first, then I can explain it!";
              break;
            }
            medId = meds[0].id;
            medName = meds[0].name;
          }
          userLabel = `Explain ${medName || "my medication"}`;
          const explainRes = await aiExplain(medId);
          responseText = explainRes.answer;
          break;
        }
        case "summary": {
          userLabel = "Summary this month";
          const summaryRes = await aiSummary(30);
          responseText = summaryRes.answer;
          break;
        }
        case "doctor-report": {
          userLabel = "Doctor visit report";
          const reportRes = await aiDoctorReport(30);
          responseText = reportRes.answer;
          break;
        }
        case "symptoms": {
          userLabel = "Symptom insights";
          const insightsRes = await aiSymptomInsights(60);
          responseText = insightsRes.answer;
          break;
        }
      }
    } catch (err: any) {
      responseText = err.message || "Sorry, I couldn't complete this request. Please try again.";
    }

    addMessage("user", userLabel);
    addMessage("assistant", responseText || "I couldn't generate a response. Please try again.");
    setLoading(false);
  };

  const handleDynamicPrompt = async (prompt: string) => {
    if (loading) return;
    setLoading(true);
    addMessage("user", prompt);
    try {
      const res = await aiChat(prompt, medicationContext || undefined);
      const answer = res.answer || "Sorry, I couldn't process that. Please try again.";
      addMessage("assistant", answer);
    } catch (err: any) {
      addMessage("assistant", err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleMedExplain = async (medId: number, medName: string) => {
    if (loading) return;
    setLoading(true);
    addMessage("user", `Explain ${medName}`);
    try {
      const res = await aiExplain(medId);
      const answer = res.answer || "Sorry, I couldn't explain that medication.";
      addMessage("assistant", answer);
    } catch (err: any) {
      addMessage("assistant", err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render confirmation card ──

  const renderConfirmationCard = (action: PendingAction) => {
    const { intent, data, confirmed } = action;

    if (confirmed) {
      return (
        <div className="text-sm text-[#A1A1AA] italic">Saving...</div>
      );
    }

    const getIcon = () => {
      switch (intent) {
        case "add_medication":
          return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
            </svg>
          );
        case "add_symptom":
          return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          );
        case "add_appointment":
          return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          );
      }
    };

    const getTitle = () => {
      switch (intent) {
        case "add_medication": return "New Medication";
        case "add_symptom": return "Log Symptom";
        case "add_appointment": return "New Appointment";
      }
    };

    const renderDetails = () => {
      switch (intent) {
        case "add_medication": {
          const d = data as ActionMedicationData;
          return (
            <div className="space-y-2">
              {d.name ? (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Name</span>
                  <p className="text-sm font-medium text-[#FAFAFA]">{d.name}</p>
                </div>
              ) : (
                <p className="text-sm text-[#FBBF24]">⚠ Name missing — please edit to add one.</p>
              )}
              {d.dosage && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Dosage</span>
                  <p className="text-sm text-[#A1A1AA]">{d.dosage}</p>
                </div>
              )}
              {d.frequency && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Frequency</span>
                  <p className="text-sm text-[#A1A1AA]">{d.frequency}</p>
                </div>
              )}
              {d.instructions && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Instructions</span>
                  <p className="text-sm text-[#A1A1AA]">{d.instructions}</p>
                </div>
              )}
            </div>
          );
        }
        case "add_symptom": {
          const d = data as ActionSymptomData;
          return (
            <div className="space-y-2">
              {d.name ? (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Symptom</span>
                  <p className="text-sm font-medium text-[#FAFAFA]">{d.name}</p>
                </div>
              ) : (
                <p className="text-sm text-[#FBBF24]">⚠ Name missing — please edit to add one.</p>
              )}
              {d.severity ? (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Severity</span>
                  <SeverityDots severity={d.severity} />
                </div>
              ) : null}
              {d.notes && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Notes</span>
                  <p className="text-sm text-[#A1A1AA]">{d.notes}</p>
                </div>
              )}
            </div>
          );
        }
        case "add_appointment": {
          const d = data as ActionAppointmentData;
          return (
            <div className="space-y-2">
              {d.title ? (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Title</span>
                  <p className="text-sm font-medium text-[#FAFAFA]">{d.title}</p>
                </div>
              ) : (
                <p className="text-sm text-[#FBBF24]">⚠ Title missing — please edit to add one.</p>
              )}
              {d.doctor_name && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Doctor</span>
                  <p className="text-sm text-[#A1A1AA]">{d.doctor_name}</p>
                </div>
              )}
              <div className="flex gap-4">
                {d.date && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Date</span>
                    <p className="text-sm text-[#A1A1AA]">{d.date}</p>
                  </div>
                )}
                {d.time && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Time</span>
                    <p className="text-sm text-[#A1A1AA]">{d.time}</p>
                  </div>
                )}
              </div>
              {d.location && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Location</span>
                  <p className="text-sm text-[#A1A1AA]">{d.location}</p>
                </div>
              )}
              {d.notes && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#71717A]">Notes</span>
                  <p className="text-sm text-[#A1A1AA]">{d.notes}</p>
                </div>
              )}
            </div>
          );
        }
      }
    };

    return (
      <div className="bg-[#1C1C1F] rounded-2xl border border-[#2DE2A0]/30 p-4 w-full">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[#2DE2A0]">{getIcon()}</span>
          <span className="text-sm font-semibold text-[#2DE2A0]">I'll add: {getTitle()}</span>
        </div>

        {/* Edit hint */}
        <p className="text-xs text-[#A1A1AA] mb-3">
          Here's what I understood — confirm or edit:
        </p>

        {/* Data preview */}
        <div className="mb-4">
          {renderDetails()}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirm}
            className="flex-1 bg-[#2DE2A0] text-[#0A0A0B] font-semibold text-sm py-2.5 rounded-xl hover:bg-[#24B882] active:scale-[0.97] transition-all"
          >
            Confirm
          </button>
          <button
            onClick={handleEdit}
            className="flex-1 bg-transparent border border-[#3F3F46] text-[#A1A1AA] font-medium text-sm py-2.5 rounded-xl hover:border-[#71717A] hover:text-[#FAFAFA] active:scale-[0.97] transition-all"
          >
            Edit
          </button>
          <button
            onClick={handleCancel}
            className="px-4 text-[#71717A] text-sm font-medium hover:text-[#A1A1AA] active:scale-[0.97] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const quickActions = useMemo(() => {
    const actions: Array<{ label: string; action: () => void; icon: ReactNode }> = [];
    const hasMeds = medications.length > 0;

    // Pill icon (reusable)
    const pillIcon = (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
      </svg>
    );

    // Medication-specific prompts
    if (hasMeds) {
      actions.push({
        label: `What does ${medications[0].name} interact with?`,
        action: () => handleDynamicPrompt(`What does ${medications[0].name} interact with?`),
        icon: pillIcon,
      });
    }

    if (medications.length >= 2) {
      actions.push({
        label: `Explain ${medications[1].name}`,
        action: () => handleMedExplain(medications[1].id, medications[1].name),
        icon: pillIcon,
      });
    } else if (hasMeds) {
      actions.push({
        label: `Explain ${medications[0].name}`,
        action: () => handleMedExplain(medications[0].id, medications[0].name),
        icon: pillIcon,
      });
    }

    // General prompts (always shown)
    actions.push({
      label: "Monthly Summary",
      action: () => handleQuickAction("summary"),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    });

    actions.push({
      label: hasMeds ? "Doctor Visit Report" : "Symptom Insights",
      action: () => handleQuickAction(hasMeds ? "doctor-report" : "symptoms"),
      icon: hasMeds ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M12 20V10" />
          <path d="M18 20V4" />
          <path d="M6 20v-4" />
        </svg>
      ),
    });

    // Cap at 4 max
    return actions.slice(0, 4);
  }, [medications]);

  return (
    <PremiumGate featureName="AI Assistant">
    <div className="flex flex-col h-[calc(100dvh-5rem)] bg-[#0A0A0B]">
      {/* Monica Header */}
      <div className="relative border-b border-[#27272A] px-5 pt-12 pb-4 safe-top flex-shrink-0">
        <div className="absolute right-5 top-3">
          <UserAvatar />
        </div>
        <div className="flex items-center gap-3">
          <img src="/monica-icon.png" alt="Monica AI" className="w-11 h-11 rounded-2xl object-cover shadow-[0_0_20px_rgba(45,226,160,0.2)]" />
          <div>
            <h1 className="text-xl font-bold text-[#FAFAFA] tracking-tight">Monica</h1>
            <p className="text-xs text-[#A1A1AA]">Your AI health assistant</p>
          </div>
        </div>
      </div>

      {/* Medical disclaimer */}
      <div className="flex-shrink-0 bg-[#FBBF24]/5 border-b border-[#FBBF24]/10 px-5 py-2 text-center">
        <p className="text-[11px] text-[#FBBF24]/70 leading-relaxed">
          Monica is an AI assistant and does not provide medical advice. Always consult your doctor or pharmacist.
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            {/* Monica avatar */}
            <img src="/monica-icon.png" alt="Monica AI" className="w-20 h-20 rounded-3xl object-cover mb-5 shadow-[0_0_40px_rgba(45,226,160,0.2)]" />
            <h2 className="text-lg font-bold text-[#FAFAFA] mb-1.5 tracking-tight">
              Hi, I'm Monica
            </h2>
            <p className="text-sm text-[#A1A1AA] mb-8 max-w-[260px] leading-relaxed">
              Your personal health assistant. I can explain medications, spot patterns, and help you prepare for doctor visits.
            </p>

            {/* Quick action chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  onClick={qa.action}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#161618] rounded-xl border border-[#27272A] text-sm text-[#A1A1AA] hover:border-[#2DE2A0]/40 hover:text-[#2DE2A0] hover:bg-[#2DE2A0]/5 transition-all active:scale-[0.97] duration-200"
                >
                  <span className="text-[#2DE2A0]">{qa.icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <img src="/monica-icon.png" alt="Monica" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mr-2 mt-1" />
            )}
            <div
              className={`${
                msg.role === "user" ? "max-w-[80%]" : (pendingAction && msg.id === pendingAction.messageId ? "max-w-[90%]" : "max-w-[80%]")
              } rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-[#2DE2A0] to-[#24B882] text-[#0A0A0B] rounded-br-md shadow-[0_4px_12px_rgba(45,226,160,0.2)]"
                  : "bg-[#161618] text-[#FAFAFA] rounded-bl-md border border-[#27272A]"
              }`}
            >
              {msg.role === "assistant" && pendingAction && msg.id === pendingAction.messageId
                ? renderConfirmationCard(pendingAction)
                : msg.role === "assistant" ? (
                <div
                  className="assistant-message"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              ) : (
                <p className="text-sm font-medium whitespace-pre-wrap">{msg.content}</p>
              )}
              <p
                className={`text-[10px] mt-1.5 ${
                  msg.role === "user" ? "text-[#0A0A0B]/50" : "text-[#71717A]"
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <img src="/monica-icon.png" alt="Monica" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mr-2 mt-1" />
            <div className="bg-[#161618] rounded-2xl rounded-bl-md px-4 py-3 border border-[#27272A]">
              <div className="flex gap-1.5 py-1">
                <div className="w-2 h-2 bg-[#2DE2A0] rounded-full animate-bounce [animation-delay:0ms]" />
                <div className="w-2 h-2 bg-[#2DE2A0] rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-2 h-2 bg-[#2DE2A0] rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick action chips (when messages exist) */}
      {messages.length > 0 && !loading && (
        <div className="flex-shrink-0 px-4 pb-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                onClick={qa.action}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#161618] rounded-full border border-[#27272A] text-xs text-[#A1A1AA] hover:border-[#2DE2A0]/40 hover:text-[#2DE2A0] transition-all active:scale-[0.97]"
              >
                <span className="text-[#2DE2A0]">{qa.icon}</span>
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[#27272A] px-4 py-3 safe-bottom">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Monica anything..."
            rows={1}
            className="flex-1 resize-none bg-[#161618] rounded-2xl px-4 py-3 text-sm text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#2DE2A0]/30 min-h-[44px] max-h-32 transition-shadow"
            disabled={loading}
          />
          {/* Voice button (placeholder) */}
          <button
            className="w-[44px] h-[44px] flex items-center justify-center bg-[#1C1C1F] text-[#71717A] rounded-2xl hover:bg-[#27272A] active:scale-[0.95] transition-all flex-shrink-0"
            aria-label="Voice input"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-[44px] h-[44px] flex items-center justify-center bg-[#2DE2A0] text-[#0A0A0B] rounded-2xl hover:bg-[#24B882] active:scale-[0.95] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-[0_4px_12px_rgba(45,226,160,0.3)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Edit medication modal (pre-filled from AI data) */}
      {editMedicationModal && (
        <AddEditMedicationModal
          initialValues={{
            name: editMedicationModal.name,
            dosage: editMedicationModal.dosage,
            frequency: editMedicationModal.frequency,
            instructions: editMedicationModal.instructions,
            prescribing_doctor: "",
            refill_date: "",
          }}
          onClose={() => {
            setEditMedicationModal(null);
            // Go back to pending card (don't cancel)
          }}
          onSaved={handleEditSaved}
        />
      )}

      {/* Edit symptom modal (pre-filled from AI data) */}
      {editSymptomModal && (
        <LogSymptomModal
          initialValues={{
            name: editSymptomModal.name,
            severity: editSymptomModal.severity,
            notes: editSymptomModal.notes,
          }}
          onClose={() => {
            setEditSymptomModal(null);
          }}
          onSaved={handleEditSaved}
        />
      )}

      {/* Edit appointment modal (pre-filled from AI data) */}
      {editAppointmentModal && (
        <AppointmentModal
          initialValues={{
            title: editAppointmentModal.title,
            doctor_name: editAppointmentModal.doctor_name,
            date: editAppointmentModal.date,
            time: editAppointmentModal.time,
            location: editAppointmentModal.location,
            notes: editAppointmentModal.notes,
          }}
          onClose={() => {
            setEditAppointmentModal(null);
          }}
          onSaved={handleEditSaved}
        />
      )}
    </div>
    </PremiumGate>
  );
}
