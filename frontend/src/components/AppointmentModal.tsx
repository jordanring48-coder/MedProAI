import { useState, useEffect, useRef } from "react";
import type { Appointment, AppointmentFormData, ValidationError } from "../types";
import { createAppointment, updateAppointment } from "../api";

interface Props {
  appointment?: Appointment | null;
  onClose: () => void;
  onSaved: () => void;
  initialValues?: Partial<AppointmentFormData>;
}

const emptyForm: AppointmentFormData = {
  title: "",
  doctor_name: "",
  location: "",
  date: new Date().toISOString().slice(0, 10),
  time: "",
  notes: "",
};

export default function AppointmentModal({ appointment, onClose, onSaved, initialValues }: Props) {
  const isEdit = !!appointment;
  const [form, setForm] = useState<AppointmentFormData>(emptyForm);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appointment) {
      setForm({
        title: appointment.title || "",
        doctor_name: appointment.doctor_name || "",
        location: appointment.location || "",
        date: appointment.date || new Date().toISOString().slice(0, 10),
        time: appointment.time || "",
        notes: appointment.notes || "",
      });
    } else if (initialValues) {
      setForm({
        ...emptyForm,
        ...initialValues,
      });
    } else {
      setForm(emptyForm);
    }
    setErrors([]);
  }, [appointment, initialValues]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  const setField = (field: keyof AppointmentFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const getError = (field: string): string | null => {
    const err = errors.find((e) => e.field === field);
    return err ? err.message : null;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      setErrors([{ field: "title", message: "Title is required" }]);
      return;
    }
    if (!form.date) {
      setErrors([{ field: "date", message: "Date is required" }]);
      return;
    }

    setSaving(true);
    try {
      if (isEdit && appointment) {
        await updateAppointment(appointment.id, form);
      } else {
        await createAppointment(form);
      }
      onSaved();
    } catch (err: any) {
      if (err.errors && Array.isArray(err.errors)) {
        setErrors(err.errors);
      } else {
        setErrors([{ field: "title", message: err.message || "Failed to save" }]);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-xl animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-3xl px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between z-10">
          <button
            onClick={onClose}
            className="text-[#007AFF] font-medium text-[17px] hover:opacity-80"
          >
            Cancel
          </button>
          <h2 className="text-[17px] font-semibold text-gray-900">
            {isEdit ? "Edit Appointment" : "New Appointment"}
          </h2>
          <div className="w-[60px]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="px-6 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">
              Title <span className="text-[#FF3B30]">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. Annual Checkup"
              className={`w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[17px] text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#007AFF] transition-shadow ${
                getError("title") ? "ring-2 ring-[#FF3B30]" : ""
              }`}
              autoFocus
            />
            {getError("title") && (
              <p className="mt-1 text-sm text-[#FF3B30]">{getError("title")}</p>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Doctor</label>
            <input
              type="text"
              value={form.doctor_name}
              onChange={(e) => setField("doctor_name", e.target.value)}
              placeholder="e.g. Dr. Smith"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[17px] text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#007AFF] transition-shadow"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setField("location", e.target.value)}
              placeholder="e.g. City Medical Center"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[17px] text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#007AFF] transition-shadow"
            />
          </div>

          {/* Date & Time row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                Date <span className="text-[#FF3B30]">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className={`w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[17px] text-gray-900 outline-none focus:ring-2 focus:ring-[#007AFF] transition-shadow ${
                  getError("date") ? "ring-2 ring-[#FF3B30]" : ""
                }`}
              />
              {getError("date") && (
                <p className="mt-1 text-sm text-[#FF3B30]">{getError("date")}</p>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-500 mb-1.5">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setField("time", e.target.value)}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[17px] text-gray-900 outline-none focus:ring-2 focus:ring-[#007AFF] transition-shadow"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Any preparation notes or questions to ask..."
              rows={3}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[17px] text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#007AFF] transition-shadow resize-none"
            />
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#007AFF] text-white font-semibold text-[17px] py-3.5 rounded-2xl shadow-sm hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Appointment"}
          </button>
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
      `}</style>
    </div>
  );
}
