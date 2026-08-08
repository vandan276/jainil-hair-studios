import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import Webcam from "react-webcam";
import { Users, ShoppingBag, Package, IndianRupee, Trash2, ChevronDown, ChevronUp, Phone, User, Calendar, MessageSquare, Star, Search, Clock, MapPin, X, Plus, FileText, Check, Edit, TrendingUp, Bell, Briefcase, Tag, Scissors, BarChart, Percent, Settings, DollarSign, Printer, Download, Filter, Camera, RefreshCw } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import MetaIntegrationPanel from "@/components/MetaIntegrationPanel";
import { useLang } from "@/context/LanguageContext";
import { downloadOrderInvoice, printOrderInvoice, openOrderInvoiceInNewTab } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import ReceptionistPanel from "@/pages/ReceptionistPanel";

const STATUSES_BOOKING = ["pending", "confirmed", "completed", "cancelled"];
const STATUSES_ORDER = ["placed", "shipped", "delivered", "cancelled"];

const PRODUCT_CATEGORIES = [
  "Scalp Topper",
  "Volumizers & Clip Sets",
  "Side Patches",
  "Streaks - Colored Hair Extensions",
  "Wigs",
  "Bangs",
  "Buns",
  "PonyTail",
  "Permanent Hair Extensions",
  "Accessories"
];

// ─── Admin Appointments Page ─────────────────────────────────────────────────
const PAYMENT_METHODS = ["Cash", "Card", "UPI / GPay", "Razorpay", "Advance"];
const APPOINTMENT_STATUSES = ["Pending", "Confirmed", "Billed", "Cancelled"];
const TIMES_HALF = [];
for (let h = 9; h <= 21; h++) {
  TIMES_HALF.push(`${String(h).padStart(2, "0")}:00`);
  TIMES_HALF.push(`${String(h).padStart(2, "0")}:30`);
}

function AdminAppointmentsPage({ services, employees, appointments, branch, onRefresh }) {
  const today = new Date().toISOString().split("T")[0];

  // Filter employees to only service providers in the current branch
  const serviceStaff = employees.filter(e =>
    e.role === "service" && (branch === "All Branches" || !branch || e.branch === branch)
  );

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [date, setDate] = useState(today);
  const [apptStatus, setApptStatus] = useState("Confirmed");
  const [notes, setNotes] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [sendWa, setSendWa] = useState(false);
  const [advance, setAdvance] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [loading, setLoading] = useState(false);

  // Service rows
  const emptyRow = () => ({ id: Date.now() + Math.random(), service_id: "", stylist_id: "", start_time: "", end_time: "", discount: 0, price: 0 });
  const [rows, setRows] = useState([emptyRow()]);

  // List filters
  const [listSearch, setListSearch] = useState("");
  const [listDate, setListDate] = useState(today);

  const addRow = () => setRows(r => [...r, emptyRow()]);
  const removeRow = (id) => setRows(r => r.filter(x => x.id !== id));
  const updateRow = (id, field, val) => setRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));

  // When a service is picked, auto-fill price
  const pickService = (id, svcId) => {
    const svc = services.find(s => s.id === svcId);
    setRows(r => r.map(x => x.id === id ? { ...x, service_id: svcId, price: svc ? Number(svc.price) : 0 } : x));
  };

  const subtotal = rows.reduce((sum, r) => sum + (Number(r.price) - Number(r.discount || 0)), 0);
  const taxAmt = Math.round((subtotal * Number(tax || 0)) / 100);
  const total = subtotal - Number(discount || 0) + taxAmt;
  const pending = Math.max(0, total - Number(advance || 0));

  const resetForm = () => {
    setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
    setDate(today); setApptStatus("Confirmed"); setNotes("");
    setSendSms(false); setSendWa(false); setAdvance(""); setDiscount(0); setTax(0);
    setPaymentMethod("Cash");
    setRows([emptyRow()]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerName || !customerPhone) { toast.error("Client name and phone are required."); return; }
    const validRows = rows.filter(r => r.service_id);
    if (validRows.length === 0) { toast.error("Add at least one service."); return; }

    const payload = {
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      date,
      service_rows: validRows.map(r => {
        const svc = services.find(s => s.id === r.service_id);
        const emp = employees.find(e => e.id === r.stylist_id);
        return {
          service_id: r.service_id,
          service_name: svc?.name || "",
          category: svc?.category || "",
          stylist_id: r.stylist_id || null,
          stylist_name: emp?.name || "Any available",
          start_time: r.start_time,
          end_time: r.end_time,
          price: Number(r.price),
          discount: Number(r.discount || 0),
        };
      }),
      subtotal,
      discount: Number(discount || 0),
      tax: Number(tax || 0),
      total,
      advance: Number(advance || 0),
      payment_method: paymentMethod,
      pending,
      status: apptStatus,
      notes,
      send_sms: sendSms,
      send_whatsapp: sendWa,
    };

    try {
      setLoading(true);
      await api.post("/admin/appointments", payload);
      toast.success("Appointment created successfully!");
      resetForm();
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create appointment.");
    } finally {
      setLoading(false);
    }
  };

  const filteredAppts = appointments.filter(a => {
    const matchDate = listDate ? a.date === listDate : true;
    const q = listSearch.toLowerCase();
    const matchSearch = !q || (a.user_name || "").toLowerCase().includes(q) || (a.user_phone || "").toLowerCase().includes(q) || (a.service_name || "").toLowerCase().includes(q);
    return matchDate && matchSearch;
  });

  const statusColor = (s) => {
    const sl = (s || "").toLowerCase();
    if (sl === "confirmed") return "bg-emerald-100 text-emerald-700";
    if (sl === "billed") return "bg-blue-100 text-blue-700";
    if (sl === "cancelled") return "bg-red-100 text-red-700";
    return "bg-amber-100 text-amber-700";
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Booking Form ── */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-eminence-border shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-eminence-border flex items-center gap-3 bg-eminence-surface">
          <Calendar size={18} className="text-eminence-gold" />
          <div>
            <h3 className="font-serif text-base font-semibold text-gray-900">Take Appointment</h3>
            <p className="text-[10px] text-eminence-muted uppercase tracking-wider">Reception</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Client Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-1.5">Client Name *</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} required placeholder="Full name" className="w-full bg-eminence-surface border border-eminence-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-1.5">Phone *</label>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required placeholder="+91 99999 99999" className="w-full bg-eminence-surface border border-eminence-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-1.5">Email (optional)</label>
              <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="client@email.com" className="w-full bg-eminence-surface border border-eminence-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-1.5">Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required min={today} className="w-full bg-eminence-surface border border-eminence-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold" />
            </div>
          </div>

          {/* Services Table */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-2">Services</label>
            <div className="border border-eminence-border rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1.8fr_1.4fr_0.9fr_0.9fr_0.7fr_0.8fr_auto] gap-1 bg-eminence-surface px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-eminence-muted border-b border-eminence-border">
                <span>Service</span>
                <span>Provider</span>
                <span>Start</span>
                <span>End</span>
                <span>Disc.</span>
                <span>Price</span>
                <span></span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-eminence-border/50">
                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.8fr_1.4fr_0.9fr_0.9fr_0.7fr_0.8fr_auto] gap-1 items-center px-3 py-2">
                    <select
                      value={row.service_id}
                      onChange={e => pickService(row.id, e.target.value)}
                      className="w-full bg-white border border-eminence-border/60 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                    >
                      <option value="">-- Service --</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select
                      value={row.stylist_id}
                      onChange={e => updateRow(row.id, "stylist_id", e.target.value)}
                      className="w-full bg-white border border-eminence-border/60 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                    >
                      <option value="">Any</option>
                      {serviceStaff.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <select
                      value={row.start_time}
                      onChange={e => updateRow(row.id, "start_time", e.target.value)}
                      className="w-full bg-white border border-eminence-border/60 rounded-lg px-1.5 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                    >
                      <option value="">--:--</option>
                      {TIMES_HALF.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={row.end_time}
                      onChange={e => updateRow(row.id, "end_time", e.target.value)}
                      className="w-full bg-white border border-eminence-border/60 rounded-lg px-1.5 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                    >
                      <option value="">--:--</option>
                      {TIMES_HALF.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="number"
                      value={row.discount}
                      min={0}
                      onChange={e => updateRow(row.id, "discount", e.target.value)}
                      placeholder="0"
                      className="w-full bg-white border border-eminence-border/60 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                    />
                    <input
                      type="number"
                      value={row.price}
                      min={0}
                      onChange={e => updateRow(row.id, "price", e.target.value)}
                      className="w-full bg-white border border-eminence-border/60 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                    />
                    <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1} className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-20">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {/* Add row */}
              <div className="px-3 py-2 border-t border-eminence-border/50 bg-eminence-surface/40">
                <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-xs font-bold text-eminence-gold hover:text-eminence-gold/70 transition-colors">
                  <Plus size={14} /> Add Service
                </button>
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="bg-eminence-surface/50 rounded-xl border border-eminence-border/50 p-4 space-y-2">
            <div className="flex justify-between text-xs text-gray-600"><span>Subtotal</span><span className="font-bold">₹{subtotal.toFixed(2)}</span></div>
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Discount (₹)</span>
              <input type="number" min={0} value={discount} onChange={e => setDiscount(e.target.value)} className="w-24 bg-white border border-eminence-border rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-eminence-gold" />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Tax (%)</span>
              <input type="number" min={0} max={100} value={tax} onChange={e => setTax(e.target.value)} className="w-24 bg-white border border-eminence-border rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-eminence-gold" />
            </div>
            <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-eminence-border pt-2"><span>Total</span><span>₹{total.toFixed(2)}</span></div>
            <div className="flex items-center justify-between text-xs text-gray-600 pt-1">
              <div className="flex items-center gap-2">
                <span>Advance</span>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="bg-white border border-eminence-border rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:border-eminence-gold">
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <input type="number" min={0} value={advance} onChange={e => setAdvance(e.target.value)} placeholder="0" className="w-24 bg-white border border-eminence-border rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-eminence-gold" />
            </div>
            <div className="flex justify-between text-xs text-gray-600"><span>Pending Dues</span><span className="font-bold text-amber-600">₹{pending.toFixed(2)}</span></div>
          </div>

          {/* Status + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-1.5">Appointment Status</label>
              <select value={apptStatus} onChange={e => setApptStatus(e.target.value)} className="w-full bg-eminence-surface border border-eminence-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold">
                {APPOINTMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Write notes about appointment here..." className="w-full bg-eminence-surface border border-eminence-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold resize-none" />
          </div>

          {/* Send SMS / WhatsApp */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-eminence-muted mb-1.5">Send Notification On</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} className="rounded border-gray-300 accent-eminence-gold" />
                <span>SMS</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={sendWa} onChange={e => setSendWa(e.target.checked)} className="rounded border-gray-300 accent-eminence-gold" />
                <span>WhatsApp</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-60">
              <Calendar size={16} /> {loading ? "Creating…" : "Create Appointment"}
            </button>
            <button type="button" onClick={resetForm} className="px-5 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-sm rounded-xl transition-colors">
              Reset
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
// ─── End AdminAppointmentsPage ────────────────────────────────────────────────

// ─── Dashboard Scheduler ───────────────────────────────────────────────────────
function DashboardScheduler({ appointments, employees, stats, orders = [], leads = [], selectedBranch }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeCard, setActiveCard] = useState(null);
  const [salesSearch, setSalesSearch] = useState("");
  const [salesPaymentFilter, setSalesPaymentFilter] = useState("All");
  const [selectedApptDetails, setSelectedApptDetails] = useState(null);
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);

  // Use local date (not UTC) to avoid timezone off-by-one day issue
  const formattedDate = [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
  const displayDate = currentDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const nextDay = () => setCurrentDate(d => new Date(d.getTime() + 86400000));
  const prevDay = () => setCurrentDate(d => new Date(d.getTime() - 86400000));
  const goToday = () => setCurrentDate(new Date());

  // Filter employees to only service providers in the current branch
  const serviceStaff = employees.filter(e =>
    e.role === "service" && (!selectedBranch || e.branch === selectedBranch)
  );

  // Filter appointments for the current date
  const todaysAppts = appointments.filter(a => a.date === formattedDate);

  // Filter orders (bills from BillingPanel) for the selected date using local IST date
  const todaysOrders = orders.filter(o => {
    if (!o.created_at) return false;
    const d = new Date(o.created_at);
    const localDate = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    return localDate === formattedDate;
  });

  // Filter scheduled client visits (leads) for the selected date
  const todaysVisits = leads.filter(l =>
    l.status === "visit" &&
    l.follow_up_date === formattedDate
  );

  // Calculate Call Reminders (Appointments billed exactly 20 days ago)
  const twentyDaysAgo = new Date();
  twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
  const targetDateStr = [
    twentyDaysAgo.getFullYear(),
    String(twentyDaysAgo.getMonth() + 1).padStart(2, "0"),
    String(twentyDaysAgo.getDate()).padStart(2, "0"),
  ].join("-");
  const reminderCount = appointments.filter(a => (a.status || "").toLowerCase() === "billed" && a.date === targetDateStr).length;

  // Time slots from 9:00 AM to 9:00 PM (12 hours) in 1 hour blocks
  const TIME_SLOTS = [];
  for (let i = 9; i <= 21; i++) {
    const period = i >= 12 ? "pm" : "am";
    const hour = i > 12 ? i - 12 : i;
    TIME_SLOTS.push({ label: `${hour}${period}`, hour24: i });
  }

  // Helper to parse time strings like "10:30" or "09:00" into a fractional hour (e.g., 9.5)
  const parseTime = (tstr) => {
    if (!tstr) return null;
    const [h, m] = tstr.split(":");
    return parseInt(h, 10) + parseInt(m, 10) / 60;
  };

  const getStatusColor = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "pending") return "bg-yellow-400";
    if (s === "billed" || s === "completed") return "bg-emerald-600";
    if (s === "cancelled") return "bg-red-600";
    return "bg-blue-600"; // confirmed/checked-in
  };

  return (
    <div className="space-y-4">
      {/* Top Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div
          onClick={() => setActiveCard(activeCard === 'sales' ? null : 'sales')}
          className={`bg-emerald-500 rounded-lg text-white p-4 flex flex-col justify-between shadow-sm cursor-pointer hover:bg-emerald-600 transition-colors ${activeCard === 'sales' ? 'ring-4 ring-emerald-300' : ''}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-90">Today Sales</div>
          <div className="text-xl font-semibold mt-2 flex items-center justify-between">
            <DollarSign size={20} className="opacity-50" />
            <span>₹{todaysOrders.reduce((sum, o) => sum + (o.total || 0), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div
          onClick={() => setActiveCard(activeCard === 'appointments' ? null : 'appointments')}
          className={`bg-indigo-600 rounded-lg text-white p-4 flex flex-col justify-between shadow-sm cursor-pointer hover:bg-indigo-700 transition-colors ${activeCard === 'appointments' ? 'ring-4 ring-indigo-300' : ''}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-90">Today Appointments</div>
          <div className="text-xl font-semibold mt-2 flex items-center justify-between">
            <Phone size={20} className="opacity-50" />
            <span>{todaysAppts.length}</span>
          </div>
        </div>
        <div
          onClick={() => setActiveCard(activeCard === 'reminders' ? null : 'reminders')}
          className={`bg-pink-500 rounded-lg text-white p-4 flex flex-col justify-between shadow-sm cursor-pointer hover:bg-pink-600 transition-colors ${activeCard === 'reminders' ? 'ring-4 ring-pink-300' : ''}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-90">Call Reminders (20 Days)</div>
          <div className="text-xl font-semibold mt-2 flex items-center justify-between">
            <Phone size={20} className="opacity-50" />
            <span>{reminderCount}</span>
          </div>
        </div>
        <div
          onClick={() => setActiveCard(activeCard === 'visits' ? null : 'visits')}
          className={`bg-amber-500 rounded-lg text-white p-4 flex flex-col justify-between shadow-sm cursor-pointer hover:bg-amber-600 transition-colors ${activeCard === 'visits' ? 'ring-4 ring-amber-300' : ''}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-90 mb-1">Clients Visit</div>
          <div className="text-xl font-semibold flex items-center justify-between">
            <span className="opacity-50 text-2xl">☺</span>
            <span>{todaysVisits.length}</span>
          </div>
          <div className="text-[8px] font-medium mt-3 opacity-90 uppercase text-right">
            Scheduled Visits Today
          </div>
        </div>
      </div>

      {/* Expanded Detail View: Sales — shows today's bills from BillingPanel (orders) */}
      {activeCard === 'sales' && (() => {
        const filteredOrders = todaysOrders.filter(o => {
          const matchSearch = !salesSearch ||
            (o.full_name || "").toLowerCase().includes(salesSearch.toLowerCase()) ||
            (o.items || []).some(it => (it.name || "").toLowerCase().includes(salesSearch.toLowerCase()) || (it.service_provider || "").toLowerCase().includes(salesSearch.toLowerCase()));
          const matchPay = salesPaymentFilter === "All" || (o.payment_method || "").toLowerCase().includes(salesPaymentFilter.toLowerCase());
          return matchSearch && matchPay;
        });
        return (
          <div className="bg-white rounded-lg shadow-sm border border-emerald-200 overflow-hidden">
            <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex items-center justify-between">
              <h3 className="font-semibold text-emerald-800 text-sm">Today's Bills <span className="text-emerald-600 font-normal text-xs ml-2">({filteredOrders.length} bill{filteredOrders.length !== 1 ? 's' : ''})</span></h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search client, service..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  className="text-xs px-2 py-1 border border-emerald-200 rounded focus:outline-none focus:border-emerald-500 bg-white"
                />
                <select
                  value={salesPaymentFilter}
                  onChange={(e) => setSalesPaymentFilter(e.target.value)}
                  className="text-xs px-2 py-1 border border-emerald-200 rounded focus:outline-none bg-white"
                >
                  <option value="All">All Payments</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Online Payment">Online</option>
                  <option value="Credit/Debit Card">Card</option>
                </select>
              </div>
            </div>
            <div className="p-0 max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 font-semibold text-gray-600">Client</th>
                    <th className="px-4 py-2 font-semibold text-gray-600">Item(s)</th>
                    <th className="px-4 py-2 font-semibold text-gray-600">Provider</th>
                    <th className="px-4 py-2 font-semibold text-gray-600">Payment</th>
                    <th className="px-4 py-2 font-semibold text-gray-600 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    // Build employee ID → name lookup map
                    const empMap = {};
                    employees.forEach(e => { if (e.id) empMap[e.id] = e.name || e.full_name || e.email || e.id; });
                    const resolveProvider = (order) => {
                      if (order.employee_name) return order.employee_name;
                      const providers = (order.items || []).map(it => {
                        const sp = it.service_provider || it.stylist_id || "";
                        return empMap[sp] || it.stylist_name || it.service_provider_name || (sp.length > 12 ? null : sp) || null;
                      }).filter(Boolean);
                      return providers.length > 0 ? [...new Set(providers)].join(", ") : "—";
                    };
                    return filteredOrders.length === 0 ? (
                      <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">No bills generated today</td></tr>
                    ) : filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{order.full_name || order.user_name || "Walk-in"}</td>
                        <td className="px-4 py-2 text-gray-600">{(order.items || []).map(it => it.name).filter(Boolean).join(", ") || "—"}</td>
                        <td className="px-4 py-2 text-gray-600">{resolveProvider(order)}</td>
                        <td className="px-4 py-2"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">{order.payment_method || "Unknown"}</span></td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-700">₹{(order.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}


      {/* Expanded Detail View: Appointments */}
      {activeCard === 'appointments' && (
        <div className="bg-white rounded-lg shadow-sm border border-indigo-200 overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100">
            <h3 className="font-semibold text-indigo-800 text-sm">Today's Appointments</h3>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 font-semibold text-gray-600">Client</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Time</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Service(s)</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {todaysAppts.length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">No appointments today</td></tr>
                ) : todaysAppts.map(appt => (
                  <tr key={appt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{appt.user_name || "Walk-in"}</td>
                    <td className="px-4 py-2 text-gray-600">{appt.services ? appt.services.map(s => s.start_time).filter(Boolean).join(", ") || appt.time : appt.time}</td>
                    <td className="px-4 py-2 text-gray-600">{appt.services ? appt.services.map(s => s.service_name).join(", ") : appt.service_name}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getStatusColor(appt.status)} text-white`}>{appt.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expanded Detail View: Reminders */}
      {activeCard === 'reminders' && (
        <div className="bg-white rounded-lg shadow-sm border border-pink-200 overflow-hidden">
          <div className="bg-pink-50 px-4 py-3 border-b border-pink-100">
            <h3 className="font-semibold text-pink-800 text-sm">Call Reminders (Billed exactly 20 days ago)</h3>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 font-semibold text-gray-600">Client</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Phone</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Previous Service</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {appointments.filter(a => (a.status || "").toLowerCase() === "billed" && a.date === targetDateStr).length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">No reminders for today</td></tr>
                ) : appointments.filter(a => (a.status || "").toLowerCase() === "billed" && a.date === targetDateStr).map(appt => (
                  <tr key={appt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{appt.user_name || "Unknown"}</td>
                    <td className="px-4 py-2 font-medium text-pink-600">{appt.user_phone || "No Phone"}</td>
                    <td className="px-4 py-2 text-gray-600">{appt.services ? appt.services.map(s => s.service_name).join(", ") : appt.service_name}</td>
                    <td className="px-4 py-2"><button className="bg-pink-100 text-pink-700 px-3 py-1 rounded hover:bg-pink-200 font-medium">Log Call</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expanded Detail View: Visits */}
      {activeCard === 'visits' && (
        <div className="bg-white rounded-lg shadow-sm border border-amber-200 overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-100">
            <h3 className="font-semibold text-amber-800 text-sm">Today's Scheduled Lead Visits <span className="text-amber-600 font-normal text-xs ml-2">({todaysVisits.length} client{todaysVisits.length !== 1 ? 's' : ''})</span></h3>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 font-semibold text-gray-600">Client Name</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Phone</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Scheduled Time</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Assigned To</th>
                  <th className="px-4 py-2 font-semibold text-gray-600">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {todaysVisits.length === 0 ? (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">No scheduled visits today</td></tr>
                ) : todaysVisits.map(lead => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{lead.name}</td>
                    <td className="px-4 py-2 text-gray-600">{lead.phone || "—"}</td>
                    <td className="px-4 py-2 text-gray-700 font-bold">{lead.follow_up_time || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{lead.assigned_to_name || "Unassigned"}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {lead.grade || "No Grade"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Date Navigation */}
      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-eminence-border shadow-sm">
        <div className="flex gap-1">
          <button onClick={prevDay} className="px-3 py-1 bg-gray-800 text-white text-xs font-bold rounded-l hover:bg-gray-700">&lt;</button>
          <button onClick={nextDay} className="px-3 py-1 bg-gray-800 text-white text-xs font-bold rounded-r hover:bg-gray-700">&gt;</button>
          <button onClick={goToday} className="px-4 py-1 bg-gray-800 text-white text-xs font-bold rounded hover:bg-gray-700 ml-2">Today</button>
        </div>
        <h2 className="text-lg font-serif text-gray-900 absolute left-1/2 -translate-x-1/2">{displayDate}</h2>
        <div className="flex gap-1 bg-gray-800 rounded p-0.5">
          <button className="px-3 py-1 bg-gray-700 text-white text-[10px] font-bold rounded shadow">Day</button>
          <button className="px-3 py-1 text-gray-300 hover:text-white text-[10px] font-bold rounded">Week</button>
          <button className="px-3 py-1 text-gray-300 hover:text-white text-[10px] font-bold rounded">Month</button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="bg-white border border-eminence-border rounded-lg shadow-sm overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header Row (Employees + Consultancy) */}
          <div className="flex border-b border-gray-200">
            <div className="w-16 flex-shrink-0 bg-gray-50 border-r border-gray-200 p-2 text-[10px] font-bold text-gray-500 uppercase flex items-center justify-center">All-Day</div>
            {serviceStaff.map(emp => (
              <div key={emp.id} className="flex-1 min-w-[120px] p-2 text-[10px] font-bold text-gray-700 text-center border-r border-gray-200 truncate bg-gray-50/50">
                {emp.name}
              </div>
            ))}
            <div className="flex-1 min-w-[120px] p-2 text-[10px] font-bold text-amber-800 text-center border-r border-gray-200 truncate bg-amber-50/50">
              Consultancy (Leads)
            </div>
          </div>

          {/* Time Rows */}
          <div className="relative">
            {TIME_SLOTS.map((slot, idx) => (
              <div key={slot.hour24} className="flex border-b border-gray-100 h-16 group hover:bg-gray-50/30">
                <div className="w-16 flex-shrink-0 border-r border-gray-200 p-2 text-[10px] text-gray-500 text-right bg-gray-50">
                  {slot.label}
                </div>
                {serviceStaff.map(emp => (
                  <div key={emp.id} className="flex-1 border-r border-gray-100 relative">
                    {/* Background grid lines for half hours could go here */}
                  </div>
                ))}
                <div className="flex-1 border-r border-gray-100 bg-amber-50/5 relative"></div>
              </div>
            ))}

            {/* Plotted Appointments Overlay */}
            {todaysAppts.map(appt => {
              return (appt.services || [{ stylist_id: appt.stylist_id, start_time: appt.time, service_name: appt.service_name, status: appt.status }]).map((svc, sIdx) => {
                if (!svc.stylist_id || !svc.start_time) return null;
                const empIdx = serviceStaff.findIndex(e => e.id === svc.stylist_id);
                if (empIdx === -1) return null; // Stylist not found in current list

                const startH = parseTime(svc.start_time);
                let endH = parseTime(svc.end_time);
                if (startH === null) return null;

                // Default block size is 30 mins if end time missing or invalid
                if (endH === null || endH <= startH) {
                  endH = startH + 0.5;
                }

                // If appointment starts before our grid (e.g. 8 AM), clamp to grid start
                const gridStart = 9; // 9 AM
                if (endH <= gridStart) return null; // completely out of grid

                const renderStartH = Math.max(startH, gridStart);
                const durationH = endH - renderStartH;

                const topOffset = (renderStartH - gridStart) * 64; // 64px per hour (h-16 class)
                const height = durationH * 64;
                const totalCols = serviceStaff.length + 1;
                const colWidth = `calc((100% - 64px) / ${totalCols})`;
                const leftOffset = `calc(64px + (${colWidth} * ${empIdx}))`;

                const showBelow = startH < 12;
                const isFirstCol = empIdx === 0;
                let tooltipPositionClass = "";
                let arrowPositionClass = "";
                let arrowBorderClass = showBelow ? "border-b" : "border-t";

                if (isFirstCol) {
                  tooltipPositionClass = `left-0 ${showBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`;
                  arrowPositionClass = `left-4 ${showBelow ? 'bottom-full' : 'top-full'}`;
                } else if (empIdx === serviceStaff.length - 1 && serviceStaff.length > 2) {
                  tooltipPositionClass = `right-0 ${showBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`;
                  arrowPositionClass = `right-4 ${showBelow ? 'bottom-full' : 'top-full'}`;
                } else {
                  tooltipPositionClass = `left-1/2 -translate-x-1/2 ${showBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`;
                  arrowPositionClass = `left-1/2 -translate-x-1/2 ${showBelow ? 'bottom-full' : 'top-full'}`;
                }

                return (
                  <div
                    key={`${appt.id}-${sIdx}`}
                    onClick={() => setSelectedApptDetails({ appt, svc, emp })}
                    className={`absolute rounded shadow-sm overflow-visible text-[9px] text-white p-1 leading-tight flex flex-col ${getStatusColor(appt.status || svc.status)} hover:opacity-90 transition-opacity cursor-pointer border border-white/20 group hover:z-20`}
                    style={{
                      top: `${topOffset}px`,
                      height: `${height}px`,
                      left: leftOffset,
                      width: colWidth,
                    }}
                  >
                    <span className="font-bold truncate">{svc.start_time} - {appt.user_name || "Walk-in"}</span>
                    <span className="truncate opacity-90">{svc.service_name}</span>

                    {/* Hover Tooltip Box */}
                    <div className={`hidden group-hover:block absolute ${tooltipPositionClass} w-64 bg-white text-gray-800 p-3 rounded-xl border border-gray-200 shadow-xl z-50 pointer-events-none text-[10px] leading-relaxed`}>
                      <div className="font-bold text-gray-900 border-b pb-1 mb-1.5 flex justify-between items-center text-[10px]">
                        <span>Appointment Info</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold text-white ${getStatusColor(appt.status || svc.status)}`}>{appt.status}</span>
                      </div>
                      <div className="space-y-1 text-left">
                        <div><span className="font-bold text-gray-400">Client Name:</span> <span className="font-semibold text-gray-900">{appt.user_name || "Walk-in"}</span></div>
                        <div><span className="font-bold text-gray-400">Appointment Date:</span> {appt.date}</div>
                        <div><span className="font-bold text-gray-400">Provider Name:</span> {emp.name}</div>
                        <div><span className="font-bold text-gray-400">Services:</span> {svc.service_name}</div>
                        <div><span className="font-bold text-gray-400">Appointment Time:</span> {svc.start_time} To {svc.end_time || "—"}</div>
                        <div><span className="font-bold text-gray-400">Notes:</span> {appt.notes || "—"}</div>
                      </div>
                      {/* Small tooltip pointer arrow */}
                      <div className={`absolute ${arrowPositionClass} border-8 border-transparent ${arrowBorderClass}-white z-50`}></div>
                      <div className={`absolute ${arrowPositionClass} border-[9px] border-transparent ${arrowBorderClass}-gray-200 -z-10`}></div>
                    </div>
                  </div>
                );
              });
            })}

            {/* Plotted Lead Visits in the Consultancy Column */}
            {todaysVisits.map((lead, idx) => {
              if (!lead.follow_up_time) return null;

              const startH = parseTime(lead.follow_up_time);
              if (startH === null) return null;

              const gridStart = 9; // 9 AM
              const endH = startH + 0.5; // Default 30-minute block for visits

              if (endH <= gridStart) return null;

              const renderStartH = Math.max(startH, gridStart);
              const durationH = endH - renderStartH;

              const topOffset = (renderStartH - gridStart) * 64; // 64px per hour
              const height = durationH * 64;

              const totalCols = serviceStaff.length + 1;
              const colWidth = `calc((100% - 64px) / ${totalCols})`;
              const leftOffset = `calc(64px + (${colWidth} * ${serviceStaff.length}))`;

              const showBelow = startH < 12;
              const tooltipPositionClass = `right-0 ${showBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`;
              const arrowPositionClass = `right-4 ${showBelow ? 'bottom-full' : 'top-full'}`;
              const arrowBorderClass = showBelow ? "border-b" : "border-t";

              return (
                <div
                  key={`lead-visit-${lead.id}-${idx}`}
                  onClick={() => setSelectedLeadDetails(lead)}
                  className="absolute rounded shadow-sm overflow-visible text-[9px] text-white p-1 leading-tight flex flex-col bg-amber-600 hover:opacity-90 transition-opacity cursor-pointer border border-white/20 group hover:z-20"
                  style={{
                    top: `${topOffset}px`,
                    height: `${height}px`,
                    left: leftOffset,
                    width: colWidth,
                  }}
                >
                  <span className="font-bold truncate">{lead.follow_up_time} - {lead.name}</span>
                  <span className="truncate opacity-90">Consultation ({lead.grade || "—"})</span>

                  {/* Hover Tooltip Box */}
                  <div className={`hidden group-hover:block absolute ${tooltipPositionClass} w-64 bg-white text-gray-800 p-3 rounded-xl border border-gray-200 shadow-xl z-50 pointer-events-none text-[10px] leading-relaxed`}>
                    <div className="font-bold text-gray-900 border-b pb-1 mb-1.5 flex justify-between items-center text-[10px]">
                      <span>Consultation Info</span>
                      <span className="text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 font-bold">{lead.status}</span>
                    </div>
                    <div className="space-y-1 text-left">
                      <div><span className="font-bold text-gray-400">Client Name:</span> <span className="font-semibold text-gray-900">{lead.name}</span></div>
                      <div><span className="font-bold text-gray-400">Scheduled Date:</span> {lead.follow_up_date}</div>
                      <div><span className="font-bold text-gray-400">Scheduled Time:</span> {lead.follow_up_time || "—"}</div>
                      <div><span className="font-bold text-gray-400">Contact Number:</span> {lead.phone || "—"}</div>
                      <div><span className="font-bold text-gray-400">Grade:</span> {lead.grade || "No Grade"}</div>
                      <div><span className="font-bold text-gray-400">Assigned To:</span> {lead.assigned_to_name || "Unassigned"}</div>
                      <div><span className="font-bold text-gray-400">Notes:</span> {lead.notes && lead.notes.length > 0 ? lead.notes[lead.notes.length - 1].text : "—"}</div>
                    </div>
                    {/* Small tooltip pointer arrow */}
                    <div className={`absolute ${arrowPositionClass} border-8 border-transparent ${arrowBorderClass}-white z-50`}></div>
                    <div className={`absolute ${arrowPositionClass} border-[9px] border-transparent ${arrowBorderClass}-gray-200 -z-10`}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Appointment Details Modal */}
      {selectedApptDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 transform scale-100 transition-all p-6 relative">
            <button
              onClick={() => setSelectedApptDetails(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors text-xl font-bold"
            >
              &times;
            </button>

            <h2 className="text-lg font-serif text-gray-900 border-b pb-3 mb-4">Appointment Details</h2>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Client Name</span>
                <span className="w-2/3 font-bold text-gray-900">{selectedApptDetails.appt.user_name || "Walk-in"}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Appointment Date</span>
                <span className="w-2/3 text-gray-700">{selectedApptDetails.appt.date}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Appointment Time</span>
                <span className="w-2/3 text-gray-700 font-bold">{selectedApptDetails.svc.start_time} To {selectedApptDetails.svc.end_time || "—"}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Service</span>
                <span className="w-2/3 text-gray-700 font-semibold">{selectedApptDetails.svc.service_name}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Beautician Name</span>
                <span className="w-2/3 text-gray-700">{selectedApptDetails.emp.name}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Status</span>
                <span className={`w-2/3 uppercase text-[9px] font-bold px-2 py-0.5 rounded text-white inline-block w-fit ${getStatusColor(selectedApptDetails.appt.status || selectedApptDetails.svc.status)}`}>
                  {selectedApptDetails.appt.status}
                </span>
              </div>
              <div className="flex pb-2">
                <span className="w-1/3 text-gray-400 font-bold">Notes</span>
                <span className="w-2/3 text-gray-600 italic">{selectedApptDetails.appt.notes || "—"}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => {
                  toast.success("Checked in successfully");
                  setSelectedApptDetails(null);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-3.5 py-2 rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1"
              >
                ✓ Check In
              </button>
              <button
                onClick={() => {
                  setSelectedApptDetails(null);
                  toast.info("Please go to the Appointments tab to edit.");
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] px-3.5 py-2 rounded-lg shadow-md transition-all active:scale-95"
              >
                ✏ Edit
              </button>
              <button
                onClick={() => {
                  setSelectedApptDetails(null);
                  window.location.href = `/billing?clientName=${encodeURIComponent(selectedApptDetails.appt.user_name || "")}&phone=${encodeURIComponent(selectedApptDetails.appt.user_phone || "")}`;
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3.5 py-2 rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1"
              >
                💳 Create bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead (Consultancy) Details Modal */}
      {selectedLeadDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 transform scale-100 transition-all p-6 relative">
            <button
              onClick={() => setSelectedLeadDetails(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors text-xl font-bold"
            >
              &times;
            </button>

            <h2 className="text-lg font-serif text-gray-900 border-b pb-3 mb-4">Consultation Details</h2>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Client Name</span>
                <span className="w-2/3 font-bold text-gray-900">{selectedLeadDetails.name}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Scheduled Date</span>
                <span className="w-2/3 text-gray-700">{selectedLeadDetails.follow_up_date}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Scheduled Time</span>
                <span className="w-2/3 text-gray-700 font-bold">{selectedLeadDetails.follow_up_time || "—"}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Contact Number</span>
                <span className="w-2/3 text-gray-700 font-semibold">{selectedLeadDetails.phone || "—"}</span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Grade</span>
                <span className="w-2/3 text-gray-700">
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded font-bold border border-amber-200 text-[10px]">
                    {selectedLeadDetails.grade || "No Grade"}
                  </span>
                </span>
              </div>
              <div className="flex border-b pb-2 border-gray-100">
                <span className="w-1/3 text-gray-400 font-bold">Assigned To</span>
                <span className="w-2/3 text-gray-700">{selectedLeadDetails.assigned_to_name || "Unassigned"}</span>
              </div>
              <div className="flex pb-2">
                <span className="w-1/3 text-gray-400 font-bold">Discussion Notes</span>
                <span className="w-2/3 text-gray-600 italic">
                  {selectedLeadDetails.notes && selectedLeadDetails.notes.length > 0
                    ? selectedLeadDetails.notes[selectedLeadDetails.notes.length - 1].text
                    : "—"}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => {
                  setSelectedLeadDetails(null);
                  window.location.href = `/sales-panel?tab=All`;
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] px-4 py-2 rounded-lg shadow-md transition-all active:scale-95"
              >
                Go to Sales Panel
              </button>
              <button
                onClick={() => setSelectedLeadDetails(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[10px] px-4 py-2 rounded-lg transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
// ─── End Dashboard Scheduler ───────────────────────────────────────────────────

const getReportTitle = (tabKey) => {
  const reportItems = [
    { k: "reports-finance", label: "Finance Page", desc: "Detailed breakdown of income, expenses, and net profit margins." },
    { k: "reports-daily", label: "Daily Reports", desc: "Day-by-day operations, sales, services, and guest details." },
    { k: "reports-summary", label: "Day Summary", desc: "Consolidated register summary of payment methods, service sales, and product sales." },
    { k: "reports-billing", label: "Billing Reports", desc: "Track, audit, print, and manage generated salon invoices." },
    { k: "reports-enquiry", label: "Enquiry Reports", desc: "Review customer consultations, treatments, and recommendations." },
    { k: "reports-provider", label: "Service Provider Reports", desc: "Performance, sales volume, commission, and services per stylist." },
    { k: "reports-sales-employee", label: "Sales Employee Reports", desc: "Detailed sales performance and metrics for consulting/sales team." },
    { k: "reports-pending", label: "Received Pending Payments", desc: "Track and confirm pending split payments or post-dated bills." },
    { k: "reports-history", label: "History", desc: "Audit trail of orders, service updates, and historical operations." },
    { k: "reports-balance", label: "Balance Reports", desc: "Outstanding client credit, wallet usage, and balance sheets." },
    { k: "reports-advance", label: "Advance Reports", desc: "Advanced operational ledger, inventory logs, salary trackers, and transfers." },
    { k: "reports-attendance", label: "Attendance Report", desc: "Stylist and team check-in times, working hours, and log records." },
    { k: "reports-sms", label: "SMS History", desc: "Log history of automated campaign alerts and transactional SMS." }
  ];
  return reportItems.find(item => item.k === tabKey) || { label: "Reports", desc: "Business report statements and metrics tracker." };
};

export const getLocalDateString = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

function InlineEditInput({ value, onSave, placeholder, type = "text", className = "" }) {
  const [val, setVal] = useState(value || "");

  useEffect(() => {
    setVal(value || "");
  }, [value]);

  const handleBlur = () => {
    if (val !== (value || "")) {
      onSave(val);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.target.blur();
    }
  };

  return (
    <input
      type={type}
      placeholder={placeholder}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`bg-transparent border border-eminence-border rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-eminence-gold ${className}`}
    />
  );
}

export default function Admin() {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.email === "superadmin@eminence.com" || user?.role === "super_admin" || user?.is_super_admin === true;
  const [selectedBranch, setSelectedBranch] = useState(isSuperAdmin ? "" : (user?.branch || "Baroda"));
  const [isRefreshing, setIsRefreshing] = useState(false);


  useEffect(() => {
    if (!isSuperAdmin && user?.branch) {
      setSelectedBranch(user.branch);
    }
  }, [user, isSuperAdmin]);

  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [leads, setLeads] = useState([]);
  const [products, setProducts] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [appointmentRefresh, setAppointmentRefresh] = useState(0);
  const [memberships, setMemberships] = useState([]);
  const [packages, setPackages] = useState([]);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [usages, setUsages] = useState([]);
  const [stockLogs, setStockLogs] = useState([]);
  const [productsDropdownOpen, setProductsDropdownOpen] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [reportsDropdownOpen, setReportsDropdownOpen] = useState(false);
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const [hrDropdownOpen, setHrDropdownOpen] = useState(false);
  const [opsDropdownOpen, setOpsDropdownOpen] = useState(false);
  const [reportsData, setReportsData] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [branches, setBranches] = useState(["Surat", "Baroda"]);
  const [adminPermissions, setAdminPermissions] = useState("__ALL__"); // "__ALL__" or array of tab keys
  const [offers, setOffers] = useState([
    { id: "o1", title: "Summer Hair Extension Special", discount: "20% OFF", description: "Get premium extensions at discount", expires: "2026-07-31", active: true },
    { id: "o2", title: "Weekday Pampering", discount: "Flat ₹500 OFF", description: "Applicable on any hair spa session", expires: "2026-06-30", active: true }
  ]);
  const [smsLogs, setSmsLogs] = useState([
    { id: "s1", recipient: "9876543210", text: "Hi Priya! Your hair spa session is scheduled for tomorrow at 2 PM. See you at Eminence Salon!", status: "Delivered", date: "2026-06-01 10:15" },
    { id: "s2", recipient: "9123456789", text: "Hey Rohan, we noticed it has been 30 days since your hair cut. Book today and get 10% off!", status: "Delivered", date: "2026-05-30 14:00" },
    { id: "s3", recipient: "9988776655", text: "Eminence Salon: Enjoy our 20% discount on packages this summer. Code: SUMMER20.", status: "Sent", date: "2026-05-28 09:30" }
  ]);
  const [productStockSearch, setProductStockSearch] = useState("");

  const [selectedHistoryProduct, setSelectedHistoryProduct] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const handleViewProductHistory = async (product) => {
    setSelectedHistoryProduct(product);
    setProductHistory([]);
    setIsLoadingHistory(true);
    try {
      const res = await api.get(`/admin/products/${product.id}/history`);
      setProductHistory(res.data.history || []);
    } catch (err) {
      toast.error("Failed to load product history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const refresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const promises = [];

      const keys = [];

      const branchQuery = selectedBranch ? `branch=${encodeURIComponent(selectedBranch)}` : "";
      const addParam = (url, param) => {
        if (!param) return url;
        return url.includes("?") ? `${url}&${param}` : `${url}?${param}`;
      };

      if (tab === "overview" || tab === "dashboard") {
        promises.push(api.get(addParam("/admin/stats", branchQuery))); keys.push("stats");
        promises.push(api.get(addParam("/products?all_products=true", branchQuery))); keys.push("products");
        promises.push(api.get(addParam("/leads?all=true", branchQuery))); keys.push("leads");
        if (tab === "dashboard") {
          promises.push(api.get("/services")); keys.push("services");
          promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
          promises.push(api.get("/admin/appointments")); keys.push("appointments");
          promises.push(api.get(addParam("/admin/orders?limit=1000", branchQuery))); keys.push("orders");
        }
        promises.push(api.get("/maintenance")); keys.push("maintenance");
        // Fetch leave requests on overview so the notification popup can detect pending requests
        promises.push(api.get("/admin/leaves")); keys.push("leaveRequests");
        // Note: /admin/permissions are fetched once on mount
      } else if (tab === "analysis") {
        promises.push(api.get(addParam("/admin/stats", branchQuery))); keys.push("stats");
        promises.push(api.get(addParam("/products?all_products=true", branchQuery))); keys.push("products");
        promises.push(api.get(addParam("/admin/orders", branchQuery))); keys.push("orders");
      } else if (tab === "orders" || tab === "reports-finance" || tab === "reports-billing" || tab === "reports-pending" || tab === "reports-history" || tab === "reports-balance" || tab === "reports-advance" || tab === "reports-daily" || tab === "reports-summary" || tab === "reports-provider" || tab === "reports-sales-employee") {
        promises.push(api.get(addParam("/admin/orders?limit=1000", branchQuery))); keys.push("orders");
        promises.push(api.get(addParam("/admin/expenses", branchQuery))); keys.push("expenses");
        if (tab === "reports-provider" || tab === "reports-sales-employee" || tab === "reports-advance" || tab === "reports-daily" || tab === "reports-summary" || tab === "reports-billing") {
          promises.push(api.get(addParam("/admin/reports", branchQuery))); keys.push("reportsData");
          promises.push(api.get(addParam("/admin/products/usages", branchQuery))); keys.push("usages");
          promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
          promises.push(api.get("/admin/vendors")); keys.push("vendors");
          promises.push(api.get(addParam("/admin/products/stock-logs", branchQuery))); keys.push("stockLogs");
          promises.push(api.get(addParam("/products?all_products=true", branchQuery))); keys.push("products");
          promises.push(api.get("/services")); keys.push("services");
        }
      } else if (tab === "products" || tab === "products-stock" || tab === "products-list") {
        promises.push(api.get(addParam("/products?all_products=true", branchQuery))); keys.push("products");
        promises.push(api.get("/admin/product-categories")); keys.push("productCategories");
      } else if (tab === "products-transfer" || tab === "add-transfers") {
        promises.push(api.get(addParam("/products?all_products=true", branchQuery))); keys.push("products");
        promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
      } else if (tab === "products-transferred") {
        promises.push(api.get(addParam("/admin/products/transfers", branchQuery))); keys.push("transfers");
      } else if (tab === "products-add-stock") {
        promises.push(api.get(addParam("/products?all_products=true", branchQuery))); keys.push("products");
        promises.push(api.get("/admin/vendors")); keys.push("vendors");
      } else if (tab === "products-vendors") {
        promises.push(api.get("/admin/vendors")); keys.push("vendors");
      } else if (tab === "products-use") {
        promises.push(api.get(addParam("/products?all_products=true", branchQuery))); keys.push("products");
        promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
        promises.push(api.get(addParam("/admin/products/usages", branchQuery))); keys.push("usages");
      } else if (tab === "consultations" || tab === "reports-enquiry" || tab === "add-assessment") {
        promises.push(api.get("/admin/consultations")); keys.push("consultations");
      } else if (tab === "users") {
        promises.push(api.get("/admin/users")); keys.push("users");
      } else if (tab === "employees" || tab === "add-staff" || tab === "add-salary" || tab === "add-providers" || tab === "add-branches") {
        promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
      } else if (tab === "services" || tab === "add-services") {
        promises.push(api.get("/services")); keys.push("services");
      } else if (tab === "memberships" || tab === "add-membership") {
        promises.push(api.get("/memberships")); keys.push("memberships");
      } else if (tab === "packages" || tab === "add-packages") {
        promises.push(api.get("/packages")); keys.push("packages");
        promises.push(api.get("/services")); keys.push("services");
      } else if (tab === "add-expenses") {
        promises.push(api.get(addParam("/admin/expenses", branchQuery))); keys.push("expenses");
      } else if (tab === "add-coupons") {
        promises.push(api.get("/admin/coupons")); keys.push("coupons");
      } else if (tab === "reports-attendance" || tab === "add-attendance" || tab === "add-kiosk") {
        promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
        promises.push(api.get("/admin/attendance")); keys.push("attendanceLogs");
      } else if (tab === "clients") {
        promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
        promises.push(api.get(addParam("/admin/orders?limit=1000", branchQuery))); keys.push("orders");
      } else if (tab === "appointments") {
        promises.push(api.get("/services")); keys.push("services");
        promises.push(api.get(addParam("/admin/employees", branchQuery))); keys.push("employees");
        promises.push(api.get("/admin/appointments")); keys.push("appointments");
      } else if (tab === "approve-leaves") {
        promises.push(api.get("/admin/leaves")); keys.push("leaveRequests");
      }

      if (promises.length === 0) return;

      const results = await Promise.allSettled(promises);
      results.forEach((res, idx) => {
        if (res.status === "fulfilled") {
          const key = keys[idx];
          const val = res.value.data;
          if (key === "stats") setStats(val);
          else if (key === "products") setProducts(val);
          else if (key === "productCategories") setProductCategories(val);
          else if (key === "maintenance") setMaintenanceEnabled(!!val?.enabled);
          else if (key === "adminPermissions") {
            const perms = val?.allowed_tabs;
            setAdminPermissions(perms || "__ALL__");
          }
          else if (key === "orders") {
            const mappedOrders = val.map(o => ({
              ...o,
              items: o.items?.map(it => ({
                ...it,
                type: it.type || (it.is_service ? "service" : (it.is_package ? "package" : "product"))
              }))
            }));
            setOrders(mappedOrders);
          }
          else if (key === "consultations") setConsultations(val);
          else if (key === "users") setUsers(val);
          else if (key === "employees") setEmployees(val);
          else if (key === "services") setServices(val);
          else if (key === "memberships") setMemberships(val);
          else if (key === "packages") setPackages(val);
          else if (key === "vendors") setVendors(val);
          else if (key === "transfers") setTransfers(val);
          else if (key === "stockLogs") setStockLogs(val);
          else if (key === "usages") setUsages(val);
          else if (key === "expenses") setExpenses(val);
          else if (key === "coupons") setCoupons(val);
          else if (key === "reportsData") setReportsData(val);
          else if (key === "attendanceLogs") setAttendanceLogs(val);
          else if (key === "appointments") setAppointments(val);
          else if (key === "leads") setLeads(val);
          else if (key === "leaveRequests") setLeaveRequests(val);
        } else {
          console.error(`Failed to refresh ${keys[idx]}:`, res.reason);
        }
      });
    } catch (err) {
      console.error("Refresh error:", err);
      toast.error(t("noRecords"));
    } finally {
      setIsRefreshing(false);
    }
  }, [t, tab, selectedBranch]);

  useEffect(() => { refresh(); }, [refresh, tab]);

  // Fetch permissions ONCE on mount — they rarely change
  useEffect(() => {
    api.get("/admin/permissions")
      .then(r => {
        const perms = r.data?.allowed_tabs;
        setAdminPermissions(perms || "__ALL__");
      })
      .catch(() => { });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch branches ONCE on mount
  useEffect(() => {
    api.get("/admin/branches")
      .then(r => {
        // If data is list of objects, map to names
        if (Array.isArray(r.data)) {
          setBranches(r.data);
        }
      })
      .catch(() => { });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const updateOrder = async (id, status) => {
    await api.patch(`/admin/orders/${id}`, { status });
    toast.success(t("update"));
    refresh();
  };

  const updateOrderField = async (id, field, value) => {
    try {
      await api.patch(`/admin/orders/${id}`, { [field]: value });
      toast.success(t("update") || "Order updated successfully!");
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
    } catch (err) {
      toast.error("Failed to update order");
    }
  };

  const handleAddCategory = async (name) => {
    try {
      await api.post("/admin/product-categories", { name });
      toast.success("Category added successfully");
      const res = await api.get("/admin/product-categories");
      setProductCategories(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add category");
    }
  };

  const handleDeleteCategory = async (id) => {
    try {
      await api.delete(`/admin/product-categories/${id}`);
      toast.success("Category deleted");
      const res = await api.get("/admin/product-categories");
      setProductCategories(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete category");
    }
  };

  useEffect(() => {
    if (isSuperAdmin && tab === "add-kiosk") {
      setTab("overview");
      return;
    }
    if (isSuperAdmin) return; // Super admin always has full access
    // Redirect if current tab is not accessible
    if (tab !== "overview" && !canAccess(tab)) {
      setTab("overview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isSuperAdmin, adminPermissions]);

  // canAccess: Super Admins can always access everything (except kiosk/appointments/dashboard which are branch-admin-only).
  // Regular/branch admins always get dashboard, appointments & kiosk.
  // All other tabs respect saved permissions (__ALL__ or specific array).
  const canAccess = (tabKey) => {
    if (isSuperAdmin) {
      if (tabKey === "add-kiosk" || tabKey === "appointments" || tabKey === "dashboard") return false;
      return true;
    }
    // Core tabs always accessible to branch admins — never blocked by permissions
    if (tabKey === "add-kiosk" || tabKey === "appointments" || tabKey === "dashboard") return true;
    if (adminPermissions === "__ALL__") return true;
    if (Array.isArray(adminPermissions)) {
      return adminPermissions.includes(tabKey);
    }
    return false;
  };

  const isProductsActive = tab.startsWith("products");
  const isReportsActive = tab.startsWith("reports") || tab === "analysis";
  const isServicesActive = ["add-services", "add-packages", "add-membership", "add-coupons", "add-offers"].includes(tab);
  const isHrActive = ["add-staff", "add-providers", "add-salary", "add-attendance", "add-kiosk", "approve-leaves"].includes(tab);
  const isOpsActive = ["add-expenses", "add-transfers", "add-branches", "add-reminders", "add-software", "add-gallery", "add-assessment", "add-permissions"].includes(tab);

  const closeAllDropdowns = () => {
    setProductsDropdownOpen(false);
    setReportsDropdownOpen(false);
    setServicesDropdownOpen(false);
    setHrDropdownOpen(false);
    setOpsDropdownOpen(false);
  };

  return (
    <div className="max-w-[1500px] mx-auto px-6 lg:px-12 py-20" data-testid="admin-page">
      <p className="overline mb-4">{isSuperAdmin ? "Super Admin" : t("operations")}</p>
      <h1 className="font-serif text-5xl mb-2">{isSuperAdmin ? "Super Admin Dashboard" : t("adminDashboard")}</h1>
      <p className="text-eminence-muted mb-10">{isSuperAdmin ? "Full System Control & Settings" : t("adminSub")}</p>

      <div className="flex gap-2 flex-wrap mb-12 bg-gray-100/50 p-1.5 rounded-full w-fit backdrop-blur-md border border-gray-200 relative z-30">

        {/* DASHBOARD SCHEDULER */}
        {canAccess("dashboard") && (
          <button
            onClick={() => {
              setTab("dashboard");
              closeAllDropdowns();
            }}
            className={`pill-tab ${tab === "dashboard" ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            Dashboard
          </button>
        )}

        {/* OVERVIEW */}
        <button
          onClick={() => {
            setTab("overview");
            closeAllDropdowns();
          }}
          className={`pill-tab ${tab === "overview" ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
        >
          {t("overview")}
        </button>

        {/* ORDERS */}
        {canAccess("orders") && (
          <button
            onClick={() => {
              setTab("orders");
              closeAllDropdowns();
            }}
            className={`pill-tab ${tab === "orders" ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            {t("orders")}
          </button>
        )}

        {/* APPOINTMENTS */}
        {canAccess("appointments") && (
          <button
            onClick={() => {
              setTab("appointments");
              closeAllDropdowns();
            }}
            className={`pill-tab ${tab === "appointments" ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            Appointments
          </button>
        )}

        {/* PRODUCTS DROPDOWN */}
        <div className="relative">
          <button
            onClick={() => {
              setProductsDropdownOpen(!productsDropdownOpen);
              setReportsDropdownOpen(false);
            }}
            className={`pill-tab flex items-center gap-1 ${isProductsActive ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            Products <ChevronDown size={14} />
          </button>
          {productsDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40 cursor-default" onClick={closeAllDropdowns} />
              <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden text-left py-1 text-sm font-normal text-gray-700 animate-in fade-in slide-in-from-top-1">
                {[
                  { k: "products-stock", label: "Current stock" },
                  { k: "products-list", label: "Product list" },
                  { k: "products-transfer", label: "Transfer products" },
                  { k: "products-transferred", label: "Transferred products" },
                  { k: "products-add-stock", label: "Add stock" },
                  { k: "products-vendors", label: "Product vendor(s)" },
                  { k: "products-use", label: "Use product in salon", border: true }
                ].filter(item => canAccess(item.k)).map((item) => (
                  <button
                    key={item.k}
                    onClick={() => {
                      setTab(item.k);
                      closeAllDropdowns();
                    }}
                    className={`w-full px-4 py-2 text-left block transition-colors ${item.border ? "border-t border-gray-100" : ""} ${tab === item.k ? "bg-gray-100 font-bold text-gray-900" : "hover:bg-gray-50 text-gray-700"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* REPORTS DROPDOWN */}
        {(isSuperAdmin || [
          "reports-finance", "reports-daily", "reports-summary", "reports-billing",
          "reports-enquiry", "reports-provider", "reports-sales-employee",
          "reports-pending", "reports-history", "reports-balance", "reports-advance",
          "reports-attendance", "reports-sms"
        ].some(k => canAccess(k))) && (
            <div className="relative">
              <button
                onClick={() => {
                  setReportsDropdownOpen(!reportsDropdownOpen);
                  setProductsDropdownOpen(false);
                }}
                className={`pill-tab flex items-center gap-1 ${isReportsActive ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
              >
                REPORTS <ChevronDown size={14} />
              </button>
              {reportsDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={closeAllDropdowns} />
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden text-left py-1 text-sm font-normal text-gray-700 animate-in fade-in slide-in-from-top-1 max-h-[400px] overflow-y-auto">
                    {[
                      { k: "reports-finance", label: "Finance Page" },
                      { k: "analysis", label: "Business Analysis" },
                      { k: "reports-daily", label: "Daily Reports" },
                      { k: "reports-summary", label: "Day Summary" },
                      { k: "reports-billing", label: "Billing Reports" },
                      { k: "reports-enquiry", label: "Enquiry Reports" },
                      { k: "reports-provider", label: "Service Provider Reports" },
                      { k: "reports-sales-employee", label: "Sales Employee Reports" },
                      { k: "reports-pending", label: "Received Pending Payments" },
                      { k: "reports-history", label: "History" },
                      { k: "reports-balance", label: "Balance Reports" },
                      { k: "reports-advance", label: "Advance Reports" },
                      { k: "reports-attendance", label: "Attendance Report" },
                      { k: "reports-sms", label: "SMS History" }
                    ].filter(item => canAccess(item.k)).map((item) => (
                      <button
                        key={item.k}
                        onClick={() => {
                          setTab(item.k);
                          closeAllDropdowns();
                        }}
                        className={`w-full px-4 py-2 text-left block transition-colors ${tab === item.k ? "bg-gray-100 font-bold text-gray-900" : "hover:bg-gray-50 text-gray-700"}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        {/* SERVICES & OFFERS DROPDOWN */}
        <div className="relative">
          <button
            onClick={() => {
              setServicesDropdownOpen(!servicesDropdownOpen);
              setProductsDropdownOpen(false);
              setReportsDropdownOpen(false);
              setHrDropdownOpen(false);
              setOpsDropdownOpen(false);
            }}
            className={`pill-tab flex items-center gap-1 ${isServicesActive ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            SERVICES & OFFERS <ChevronDown size={14} />
          </button>
          {servicesDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40 cursor-default" onClick={closeAllDropdowns} />
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden text-left py-1 text-sm font-normal text-gray-700 animate-in fade-in slide-in-from-top-1 max-h-[400px] overflow-y-auto">
                {[
                  { k: "add-services", label: "Services" },
                  { k: "add-packages", label: "Packages" },
                  { k: "add-membership", label: "Membership" },
                  { k: "add-coupons", label: "Coupons" },
                  { k: "add-offers", label: "Offers" }
                ].filter(item => canAccess(item.k)).map((item) => (
                  <button
                    key={item.k}
                    onClick={() => {
                      setTab(item.k);
                      closeAllDropdowns();
                    }}
                    className={`w-full px-4 py-2 text-left block transition-colors ${tab === item.k ? "bg-gray-100 font-bold text-gray-900" : "hover:bg-gray-50 text-gray-700"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* HR & STAFF DROPDOWN */}
        <div className="relative">
          <button
            onClick={() => {
              setHrDropdownOpen(!hrDropdownOpen);
              setProductsDropdownOpen(false);
              setReportsDropdownOpen(false);
              setServicesDropdownOpen(false);
              setOpsDropdownOpen(false);
            }}
            className={`pill-tab flex items-center gap-1 ${isHrActive ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            HR & STAFF <ChevronDown size={14} />
          </button>
          {hrDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40 cursor-default" onClick={closeAllDropdowns} />
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden text-left py-1 text-sm font-normal text-gray-700 animate-in fade-in slide-in-from-top-1 max-h-[400px] overflow-y-auto">
                {[
                  { k: "add-staff", label: "Sales Staff" },
                  { k: "add-providers", label: "Service providers" },
                  { k: "add-salary", label: "Employee salary" },
                  { k: "add-attendance", label: "Mark attendance" },
                  { k: "approve-leaves", label: "Approve Leaves" },
                  { k: "add-kiosk", label: "Check-in Kiosk", hideForSuperAdmin: true }
                ].filter(item => (canAccess(item.k) || item.k === "add-kiosk") && !(item.hideForSuperAdmin && isSuperAdmin)).map((item) => (
                  <button
                    key={item.k}
                    onClick={() => {
                      setTab(item.k);
                      closeAllDropdowns();
                    }}
                    className={`w-full px-4 py-2 text-left block transition-colors ${tab === item.k ? "bg-gray-100 font-bold text-gray-900" : "hover:bg-gray-50 text-gray-700"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* OPERATIONS DROPDOWN */}
        <div className="relative">
          <button
            onClick={() => {
              setOpsDropdownOpen(!opsDropdownOpen);
              setProductsDropdownOpen(false);
              setReportsDropdownOpen(false);
              setServicesDropdownOpen(false);
              setHrDropdownOpen(false);
            }}
            className={`pill-tab flex items-center gap-1 ${isOpsActive ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            OPERATIONS <ChevronDown size={14} />
          </button>
          {opsDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40 cursor-default" onClick={closeAllDropdowns} />
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden text-left py-1 text-sm font-normal text-gray-700 animate-in fade-in slide-in-from-top-1 max-h-[400px] overflow-y-auto">
                {[
                  { k: "add-expenses", label: "Expenses" },
                  { k: "add-transfers", label: "Transfer options" },
                  { k: "add-branches", label: "All branches", superOnly: true },
                  { k: "add-reminders", label: "Automatic service reminder" },
                  { k: "add-software", label: "Software setting", superOnly: true },
                  { k: "add-gallery", label: "Photo Gallery" },
                  { k: "add-assessment", label: "Self assessment data" },
                  { k: "add-permissions", label: "Admin Access Control", superOnly: true, border: true }
                ].filter(item => {
                  if (item.superOnly) return isSuperAdmin || canAccess(item.k);
                  return canAccess(item.k);
                }).map((item) => (
                  <button
                    key={item.k}
                    onClick={() => {
                      setTab(item.k);
                      closeAllDropdowns();
                    }}
                    className={`w-full px-4 py-2 text-left block transition-colors ${item.border ? "border-t border-gray-100 mt-1" : ""
                      } ${tab === item.k ? "bg-gray-100 font-bold text-gray-900" : "hover:bg-gray-50 text-gray-700"}`}
                  >
                    {item.label}
                    {item.superOnly && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-eminence-gold">Super Admin</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* USERS */}
        {canAccess("users") && (
          <button
            onClick={() => {
              setTab("users");
              closeAllDropdowns();
            }}
            className={`pill-tab ${tab === "users" ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            {t("users")}
          </button>
        )}

        {/* CONSULTATIONS */}
        {canAccess("consultations") && (
          <button
            onClick={() => {
              setTab("consultations");
              closeAllDropdowns();
            }}
            className={`pill-tab ${tab === "consultations" ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            Consultancy Records
          </button>
        )}

        {/* CLIENTS */}
        {canAccess("clients") && (
          <button
            onClick={() => {
              setTab("clients");
              closeAllDropdowns();
            }}
            className={`pill-tab ${tab === "clients" ? "bg-gray-950 text-white shadow-lg" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"}`}
          >
            Clients
          </button>
        )}

      </div>

      {/* ── Persistent Leave Request Notification Banner ── */}
      <LeaveRequestNotificationBanner
        leaveRequests={leaveRequests}
        isSuperAdmin={isSuperAdmin}
        onGoToLeaves={() => setTab("approve-leaves")}
      />

      {tab === "dashboard" && (
        <DashboardScheduler appointments={appointments} employees={employees} stats={stats} orders={orders} leads={leads} selectedBranch={selectedBranch} />
      )}


      {tab === "overview" && stats && (
        <Overview
          stats={stats}
          products={products}
          leads={leads}
          employees={employees}
          t={t}
          maintenanceEnabled={maintenanceEnabled}
          onToggleMaintenance={async () => {
            try {
              const newStatus = !maintenanceEnabled;
              await api.post("/admin/maintenance", { enabled: newStatus });
              setMaintenanceEnabled(newStatus);
              toast.success(newStatus ? "Maintenance Mode enabled" : "Maintenance Mode disabled");
            } catch {
              toast.error("Failed to update maintenance mode");
            }
          }}
          selectedBranch={selectedBranch}
          setSelectedBranch={setSelectedBranch}
          branches={branches}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {tab === "analysis" && stats && (
        <Analysis
          stats={stats}
          products={products}
          orders={orders}
          t={t}
          selectedBranch={selectedBranch}
          setSelectedBranch={setSelectedBranch}
          branches={branches}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {tab === "orders" && (
        <Table testid="admin-orders-table" rows={orders.filter(o => o.address !== "In-store")} t={t} cols={[
          { h: t("order"), k: (r) => `#${r.id.slice(0, 8)}` },
          { h: t("date") || "Date/Time", k: (r) => r.created_at ? new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—" },
          { h: t("customer"), k: (r) => r.full_name || r.user_name },
          { h: t("employee") || "Employee", k: (r) => r.employee_name || "—" },
          {
            h: t("items"),
            k: (r) => (
              <div className="flex flex-col gap-0.5 min-w-[120px] max-w-[220px]">
                <span className="font-semibold text-gray-800">{r.items?.length || 0} items</span>
                <span className="text-[11px] text-gray-500 line-clamp-2" title={r.items?.map(it => `${it.name} (x${it.quantity || 1})`).join(", ")}>
                  {r.items?.map(it => `${it.name} (x${it.quantity || 1})`).join(", ") || "—"}
                </span>
              </div>
            )
          },
          { h: t("total"), k: (r) => `₹${r.total.toLocaleString("en-IN")}` },
          { h: t("address"), k: (r) => `${r.city} · ${r.pincode}` },
          { h: "Shipment Date", k: (r) => <InlineEditInput type="date" value={r.shipment_date} onSave={(val) => updateOrderField(r.id, "shipment_date", val)} /> },
          { h: "Shipped Date", k: (r) => <InlineEditInput type="date" value={r.shipped_date} onSave={(val) => updateOrderField(r.id, "shipped_date", val)} /> },
          { h: "Courier", k: (r) => <InlineEditInput type="text" placeholder="Courier..." value={r.courier_name} onSave={(val) => updateOrderField(r.id, "courier_name", val)} className="w-24" /> },
          { h: "Tracking No.", k: (r) => <InlineEditInput type="text" placeholder="Tracking..." value={r.tracking_number} onSave={(val) => updateOrderField(r.id, "tracking_number", val)} className="w-28" /> },
          {
            h: t("status"), k: (r) => (
              <select value={r.status} onChange={(e) => updateOrder(r.id, e.target.value)} data-testid={`order-status-${r.id}`}
                className="bg-transparent border border-eminence-border px-2 py-1 text-xs uppercase tracking-wider">
                {STATUSES_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )
          },
        ]} />
      )}


      {tab === "products-stock" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm gap-4">
            <div>
              <h2 className="font-serif text-2xl text-gray-800">Current Stock Levels</h2>
              <p className="text-xs text-eminence-muted">Real-time status of salon physical products and stock levels.</p>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              {isSuperAdmin && (
                <div className="flex items-center gap-2 bg-white/80 border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <span className="text-[10px] font-bold text-eminence-gold uppercase tracking-wider">Branch:</span>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer"
                  >
                    <option value="">All Branches</option>
                    {branches.map(b => {
                      const name = typeof b === "string" ? b : b.name;
                      return <option key={name} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
              )}
              <div className="relative flex-1 md:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-eminence-gold" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={productStockSearch}
                  onChange={e => setProductStockSearch(e.target.value)}
                  className="w-full bg-eminence-surface border border-eminence-border pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-xl bg-gray-50"
                />
              </div>
              <button onClick={refresh} className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase rounded-lg whitespace-nowrap">
                Refresh Stock
              </button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase bg-gray-50/80 border-b border-gray-100 font-bold tracking-widest">
                  <th className="px-6 py-4">Image</th>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Stock</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-center">History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products
                  .filter(p =>
                    (p.name || "").toLowerCase().includes(productStockSearch.toLowerCase()) ||
                    (p.category || "").toLowerCase().includes(productStockSearch.toLowerCase())
                  )
                  .map((p) => {
                    const stock = p.stock || 0;
                    let statusBadge = (
                      <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-full">
                        In Stock
                      </span>
                    );
                    if (stock === 0) {
                      statusBadge = (
                        <span className="text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100 px-2 py-1 rounded-full">
                          Out of Stock
                        </span>
                      );
                    } else if (stock <= 5) {
                      statusBadge = (
                        <span className="text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-full">
                          Low Stock
                        </span>
                      );
                    }
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <img
                            src={p.image_url || "https://placehold.co/100x100?text=Product"}
                            alt={p.name}
                            className="w-12 h-12 object-cover rounded-lg border border-gray-100"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{p.name}</div>
                          {(p.volume || p.measurement_unit) && (
                            <div className="text-[10px] text-eminence-muted mt-0.5 font-semibold uppercase tracking-wider">
                              {p.volume ? `${p.volume} ` : ""}{p.measurement_unit || ""}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-500">{p.category}</td>
                        <td className="px-6 py-4 text-gray-700 font-semibold">₹{(p.price || 0).toLocaleString("en-IN")}</td>
                        <td className="px-6 py-4 font-bold text-gray-900">{stock}</td>
                        <td className="px-6 py-4">{statusBadge}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleViewProductHistory(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-eminence-gold bg-eminence-surface hover:bg-eminence-gold/10 border border-eminence-border/10 rounded-lg shadow-sm hover:shadow transition-all"
                            title="View product history log"
                          >
                            <Clock size={13} />
                            History
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(tab === "products" || tab === "products-list") && (
        <CrudPanel
          title={t("product")} testid="products" items={products} t={t}
          fields={[
            { k: "name", label: t("productName"), type: "text" },
            { k: "category", label: t("category"), type: "category_manager", options: productCategories, onAddCategory: handleAddCategory, onDeleteCategory: handleDeleteCategory, default: "" },
            { k: "description", label: t("description"), type: "textarea" },
            { k: "price", label: `${t("total")} (₹)`, type: "number" },
            { k: "stock", label: t("stock_label"), type: "number" },
            { k: "target_audience", label: t("targetAudience"), type: "select", options: ["Women", "Men", "Unisex", "Accessories"], default: "Women" },
            { k: "measurement_unit", label: "Measurement Unit", type: "select", options: ["L", "ml", "Grm", "pcs", "pkt"], default: "pcs" },
            { k: "volume", label: "Volume / Capacity (e.g. 500, 1)", type: "text" },
            { k: "length_inches", label: "Length (inches)", type: "text" },
            { k: "colour", label: "Colour", type: "text" },
            { k: "size", label: "Size Options", type: "text" },
            { k: "image_url", label: t("mainImg"), type: "media_upload" },
            { k: "video_url", label: t("videoUrl"), type: "media_upload" },
            { k: "images", label: t("extraImages"), type: "text" },
            { k: "show_in_online_shop", label: "Show in Online Shop", type: "checkbox", default: false },
            { k: "in_saloon", label: "In saloon", type: "checkbox", default: false },
            { k: "is_retail", label: "Retail product", type: "checkbox", default: true },
            ...(isSuperAdmin ? [{ k: "branch", label: "Branch Scoped", type: "select", options: branches.map(b => typeof b === "string" ? b : b.name), default: selectedBranch || "Baroda" }] : []),
          ]}
          create={(d) => api.post("/admin/products", d)}
          update={(id, d) => api.patch(`/admin/products/${id}`, d)}
          remove={(id) => api.delete(`/admin/products/${id}`)}
          onViewHistory={handleViewProductHistory}
          onChange={refresh}
        />
      )}

      {tab === "products-transfer" && (
        <ProductTransferPanel
          products={products}
          employees={employees}
          onComplete={refresh}
          branches={branches}
        />
      )}

      {tab === "products-transferred" && (
        <ProductTransferredLogPanel
          transfers={transfers}
          refreshData={refresh}
        />
      )}

      {tab === "products-add-stock" && (
        <ProductAddStockPanel
          products={products}
          vendors={vendors}
          onComplete={refresh}
        />
      )}

      {tab === "products-vendors" && (
        <CrudPanel
          title="Vendor" testid="vendors" items={vendors} t={t}
          fields={[
            { k: "name", label: "Vendor Name", type: "text" },
            { k: "contact_person", label: "Contact Person", type: "text" },
            { k: "phone", label: "Phone Number", type: "text" },
            { k: "email", label: "Email Address", type: "email" },
            { k: "gst_no", label: "GST Number", type: "text" },
            { k: "address", label: "Address", type: "textarea" },
          ]}
          create={(d) => api.post("/admin/vendors", d)}
          update={(id, d) => api.patch(`/admin/vendors/${id}`, d)}
          remove={(id) => api.delete(`/admin/vendors/${id}`)}
          onChange={refresh}
        />
      )}

      {tab === "products-use" && (
        <ProductUsePanel
          products={products}
          employees={employees}
          usages={usages}
          onComplete={refresh}
        />
      )}

      {tab === "consultations" && (
        <ConsultationsPanel consultations={consultations} orders={orders} refresh={refresh} t={t} branches={branches} />
      )}

      {tab === "clients" && (
        <ClientsSegmentationPanel employees={employees} appointments={appointments} refreshAll={refresh} t={t} branches={branches} />
      )}

      {tab === "users" && (
        <Table testid="admin-users-table" rows={users} t={t} cols={[
          { h: t("fullName"), k: (r) => r.name },
          { h: t("email"), k: (r) => r.email },
          { h: t("phone"), k: (r) => r.phone || "—" },
          { h: t("role"), k: (r) => <span className="uppercase text-xs tracking-wider text-eminence-gold">{r.role}</span> },
          { h: t("joined"), k: (r) => new Date(r.created_at).toLocaleDateString() },
        ]} />
      )}

      {/* REPORTS dropdown panels */}
      {tab.startsWith("reports-") && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h2 className="font-serif text-2xl text-gray-800">{getReportTitle(tab).label}</h2>
            <p className="text-xs text-eminence-muted">{getReportTitle(tab).desc}</p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2 bg-white/80 border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
              <span className="text-[10px] font-bold text-eminence-gold uppercase tracking-wider">Branch:</span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer"
              >
                <option value="">All Branches</option>
                {branches.map(b => {
                  const name = typeof b === "string" ? b : b.name;
                  return <option key={name} value={name}>{name}</option>;
                })}
              </select>
            </div>
          )}
        </div>
      )}
      {tab.startsWith("reports-") && isRefreshing ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-gray-100 shadow-sm animate-pulse my-6">
          <svg className="animate-spin h-10 w-10 text-eminence-gold mb-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm font-semibold text-gray-600">Loading reports for {selectedBranch || "All Branches"}...</p>
        </div>
      ) : (
        <>
          {tab === "reports-finance" && (
            <FinanceReportsPanel orders={orders} expenses={expenses} leads={leads} stats={stats} t={t} />
          )}
          {tab === "reports-daily" && (
            <DailyReportsPanel stats={stats} orders={orders} reportsData={reportsData} expenses={expenses} t={t} />
          )}
          {tab === "reports-summary" && (
            <DaySummaryPanel stats={stats} orders={orders} reportsData={reportsData} expenses={expenses} employees={employees} products={products} services={services} t={t} />
          )}
          {tab === "reports-billing" && (
            <BillingReportsPanel orders={orders} employees={employees} products={products} services={services} t={t} onComplete={refresh} />
          )}
          {tab === "reports-enquiry" && (
            <EnquiryReportsPanel consultations={consultations} t={t} />
          )}
          {tab === "reports-provider" && (
            <ServiceProviderReportsPanel reportsData={reportsData} employees={employees} orders={orders} t={t} />
          )}
          {tab === "reports-sales-employee" && (
            <SalesEmployeeReportsPanel reportsData={reportsData} employees={employees} t={t} />
          )}
          {tab === "reports-pending" && (
            <PendingPaymentsPanel orders={orders} refresh={refresh} t={t} />
          )}
          {tab === "reports-history" && (
            <HistoryReportsPanel orders={orders} expenses={expenses} t={t} />
          )}
          {tab === "reports-balance" && (
            <BalanceReportsPanel orders={orders} expenses={expenses} t={t} />
          )}
          {tab === "reports-advance" && (
            <AdvanceReportsPanel stats={stats} orders={orders} employees={employees} expenses={expenses} usages={usages} reportsData={reportsData} t={t} refresh={refresh} vendors={vendors} stockLogs={stockLogs} products={products} services={services} />
          )}
          {tab === "reports-attendance" && (
            <AttendanceReportPanel attendanceLogs={attendanceLogs} employees={employees} t={t} />
          )}
          {tab === "reports-sms" && (
            <SMSHistoryPanel smsLogs={smsLogs} t={t} />
          )}
        </>
      )}

      {/* ADD & MANAGE dropdown panels */}
      {tab === "add-expenses" && (
        <ExpensesPanel expenses={expenses} employees={employees} refresh={refresh} t={t} isSuperAdmin={isSuperAdmin} />
      )}
      {tab === "add-services" && (
        <AdminServicesPanel services={services} refresh={refresh} t={t} isSuperAdmin={isSuperAdmin} />
      )}
      {tab === "add-packages" && (
        <AdminPackagesPanel packages={packages} services={services} refresh={refresh} t={t} />
      )}
      {tab === "add-coupons" && (
        <CouponsPanel coupons={coupons} refresh={refresh} t={t} />
      )}
      {tab === "add-salary" && (
        <EmployeeManager key={tab} defaultSubTab="payroll" employees={employees} refresh={refresh} t={t} isSuperAdmin={isSuperAdmin} />
      )}
      {tab === "add-providers" && (
        <EmployeeManager key={tab} defaultSubTab="service providers" employees={employees} refresh={refresh} t={t} isSuperAdmin={isSuperAdmin} />
      )}
      {tab === "add-reminders" && (
        <ReminderSettingsPanel services={services} orders={orders} t={t} />
      )}
      {tab === "add-staff" && (
        <EmployeeManager key={tab} defaultSubTab="sales staff" employees={employees} refresh={refresh} t={t} isSuperAdmin={isSuperAdmin} />
      )}
      {tab === "add-membership" && (
        <AdminMembershipPanel memberships={memberships} refresh={refresh} t={t} />
      )}
      {tab === "add-branches" && (
        <BranchesPanel branches={branches} setBranches={setBranches} employees={employees} t={t} />
      )}
      {tab === "approve-leaves" && (
        <ApproveLeavesPanel leaveRequests={leaveRequests} refresh={refresh} isSuperAdmin={isSuperAdmin} employees={employees} />
      )}
      {tab === "add-transfers" && (
        <ProductTransferPanel products={products} employees={employees} onComplete={refresh} branches={branches} />
      )}
      {tab === "add-software" && (
        <MetaIntegrationPanel />
      )}
      {tab === "add-offers" && (
        <OffersPanel offers={offers} setOffers={setOffers} t={t} />
      )}
      {tab === "add-gallery" && (
        <GalleryPanel t={t} />
      )}
      {tab === "add-assessment" && (
        <AssessmentPanel consultations={consultations} t={t} />
      )}

      {tab === "add-attendance" && (
        <EmployeeManager key={tab} defaultSubTab="attendance" employees={employees} refresh={refresh} t={t} isSuperAdmin={isSuperAdmin} />
      )}

      {tab === "add-kiosk" && (
        <EmployeeManager key={tab} defaultSubTab="kiosk" employees={employees} refresh={refresh} t={t} isSuperAdmin={isSuperAdmin} />
      )}

      {tab === "appointments" && (
        <AdminAppointmentsPage
          services={services}
          employees={employees.filter(e => e.role === "service")}
          appointments={appointments}
          branch={selectedBranch}
          onRefresh={() => { setAppointmentRefresh(p => p + 1); refresh(); }}
        />
      )}

      {tab === "add-permissions" && (isSuperAdmin || canAccess("add-permissions")) && (
        <AdminPermissionsPanel
          currentPermissions={adminPermissions}
          onSaved={(newPerms) => setAdminPermissions(newPerms)}
        />
      )}

      {/* Product History Modal */}
      {selectedHistoryProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col animate-fade-in">
            <div className="p-6 bg-eminence-surface border-b border-gray-100 flex justify-between items-center">
              <div>
                <h4 className="font-serif text-xl text-gray-900 flex items-center gap-2">
                  <Clock className="text-eminence-gold" size={20} /> Product History Log
                </h4>
                <p className="text-xs text-eminence-muted">
                  Detailed sale, salon usage, and stock log for <strong className="text-gray-900">{selectedHistoryProduct.name}</strong>
                </p>
              </div>
              <button onClick={() => setSelectedHistoryProduct(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={18} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Product Stats Quick Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-eminence-surface/40 p-4 rounded-xl border border-eminence-border/10 text-xs">
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Product ID</span>
                  <span className="font-mono font-bold text-gray-900">{selectedHistoryProduct.id}</span>
                </div>
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Category</span>
                  <span className="font-bold text-gray-900">{selectedHistoryProduct.category || "—"}</span>
                </div>
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Selling Price</span>
                  <span className="font-serif font-bold text-eminence-gold text-sm">₹{Number(selectedHistoryProduct.price || 0).toLocaleString("en-IN")}</span>
                </div>
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Current Stock</span>
                  <span className={`font-bold text-sm ${selectedHistoryProduct.stock <= 5 ? "text-red-500" : "text-emerald-600"}`}>
                    {selectedHistoryProduct.stock} units
                  </span>
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-eminence-gold" />
                  <p className="text-xs text-eminence-muted">Fetching usage and sale logs...</p>
                </div>
              ) : productHistory.length === 0 ? (
                <div className="text-center py-16 bg-eminence-surface/20 border border-dashed border-eminence-border rounded-xl">
                  <Clock className="mx-auto text-gray-300 mb-2" size={32} />
                  <p className="text-sm font-semibold text-gray-700">No History Logs Found</p>
                  <p className="text-xs text-eminence-muted mt-1">This product has no recorded stock logs, salon usages, or sales.</p>
                </div>
              ) : (
                <div className="border border-eminence-border/10 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-eminence-surface border-b border-eminence-border/20 text-eminence-muted uppercase font-bold text-[9px] tracking-wider">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Activity</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3">Transaction Details</th>
                        <th className="px-4 py-3">Handled By / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {productHistory.map((item, idx) => {
                        let badgeClass = "";
                        let label = "";
                        let qtySign = "";

                        if (item.event_type === "sale") {
                          badgeClass = "text-emerald-700 bg-emerald-50 border-emerald-200";
                          label = "Sold";
                          qtySign = "-";
                        } else if (item.event_type === "usage") {
                          badgeClass = "text-amber-700 bg-amber-50 border-amber-200";
                          label = "Used in Salon";
                          qtySign = "-";
                        } else if (item.event_type === "transfer") {
                          badgeClass = "text-blue-700 bg-blue-50 border-blue-200";
                          label = "Transferred";
                          qtySign = "";
                        } else if (item.event_type === "stock_addition") {
                          badgeClass = "text-purple-700 bg-purple-50 border-purple-200";
                          label = "Stock Added";
                          qtySign = "+";
                        }

                        return (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                              {item.created_at ? new Date(item.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${badgeClass}`}>
                                {label}
                              </span>
                            </td>
                            <td className={`px-4 py-3.5 text-right font-bold font-mono whitespace-nowrap ${qtySign === "+" ? "text-emerald-600" : qtySign === "-" ? "text-rose-500" : "text-gray-700"}`}>
                              {qtySign}{item.quantity} units
                            </td>
                            <td className="px-4 py-3.5 text-gray-700 max-w-[250px] truncate" title={item.details}>
                              {item.details}
                            </td>
                            <td className="px-4 py-3.5 text-gray-500">
                              <div className="font-semibold text-gray-700">{item.employee_name}</div>
                              {item.remarks && <div className="text-[10px] text-eminence-muted mt-0.5 italic">"{item.remarks}"</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-6 bg-eminence-surface border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedHistoryProduct(null)}
                className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-xs uppercase tracking-widest font-bold rounded-lg transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ADMIN PERMISSIONS PANEL (Super Admin only)
// ==========================================

const ALL_CONTROLLABLE_TABS = [
  {
    group: "General",
    tabs: [
      { k: "dashboard", label: "Dashboard" },
      { k: "overview", label: "Overview" },
      { k: "appointments", label: "Appointments" },
      { k: "orders", label: "Orders" },
      { k: "users", label: "Users" },
      { k: "consultations", label: "Consultancy Records" },
      { k: "clients", label: "Clients" },
    ]
  },
  {
    group: "Products",
    tabs: [
      { k: "products-stock", label: "Current Stock" },
      { k: "products-list", label: "Product List" },
      { k: "products-transfer", label: "Transfer Products" },
      { k: "products-transferred", label: "Transferred Products" },
      { k: "products-add-stock", label: "Add Stock" },
      { k: "products-vendors", label: "Product Vendors" },
      { k: "products-use", label: "Use Product in Salon" },
    ]
  },
  {
    group: "Reports",
    tabs: [
      { k: "reports-finance", label: "Finance Page" },
      { k: "analysis", label: "Business Analysis" },
      { k: "reports-daily", label: "Daily Reports" },
      { k: "reports-summary", label: "Day Summary" },
      { k: "reports-billing", label: "Billing Reports" },
      { k: "reports-enquiry", label: "Enquiry Reports" },
      { k: "reports-provider", label: "Service Provider Reports" },
      { k: "reports-sales-employee", label: "Sales Employee Reports" },
      { k: "reports-pending", label: "Received Pending Payments" },
      { k: "reports-history", label: "History" },
      { k: "reports-balance", label: "Balance Reports" },
      { k: "reports-advance", label: "Advance Reports" },
      { k: "reports-attendance", label: "Attendance Report" },
      { k: "reports-sms", label: "SMS History" },
    ]
  },
  {
    group: "Services & Offers",
    tabs: [
      { k: "add-services", label: "Services" },
      { k: "add-packages", label: "Packages" },
      { k: "add-membership", label: "Membership" },
      { k: "add-coupons", label: "Coupons" },
      { k: "add-offers", label: "Offers" },
    ]
  },
  {
    group: "HR & Staff",
    tabs: [
      { k: "add-staff", label: "Sales Staff" },
      { k: "add-providers", label: "Service Providers" },
      { k: "add-salary", label: "Employee Salary" },
      { k: "add-attendance", label: "Mark Attendance" },
      { k: "approve-leaves", label: "Approve Leaves" },
      { k: "add-kiosk", label: "Check-in Kiosk", hideForSuperAdmin: true },
    ]
  },
  {
    group: "Operations",
    tabs: [
      { k: "add-expenses", label: "Expenses" },
      { k: "add-transfers", label: "Transfer Options" },
      { k: "add-branches", label: "All branches" },
      { k: "add-software", label: "Software setting" },
      { k: "add-reminders", label: "Automatic Service Reminder" },
      { k: "add-gallery", label: "Photo Gallery" },
      { k: "add-assessment", label: "Self Assessment Data" },
      { k: "add-permissions", label: "Admin Access Control" },
    ]
  },
];

function AdminPermissionsPanel({ currentPermissions, onSaved }) {
  const allTabKeys = ALL_CONTROLLABLE_TABS.flatMap(g => g.tabs.map(t => t.k));

  // Build initial checked state from currentPermissions
  const buildChecked = (perms) => {
    if (perms === "__ALL__") {
      return Object.fromEntries(allTabKeys.map(k => [k, true]));
    }
    if (Array.isArray(perms)) {
      return Object.fromEntries(allTabKeys.map(k => [k, perms.includes(k)]));
    }
    return Object.fromEntries(allTabKeys.map(k => [k, true]));
  };

  const [checked, setChecked] = useState(() => buildChecked(currentPermissions));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync if parent permissions change (e.g. on re-fetch)
  useEffect(() => {
    setChecked(buildChecked(currentPermissions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPermissions]);

  const toggleTab = (key) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleGroup = (groupTabs) => {
    const keys = groupTabs.map(t => t.k);
    const allOn = keys.every(k => checked[k]);
    setChecked(prev => ({
      ...prev,
      ...Object.fromEntries(keys.map(k => [k, !allOn]))
    }));
  };

  const toggleAll = () => {
    const allOn = allTabKeys.every(k => checked[k]);
    setChecked(Object.fromEntries(allTabKeys.map(k => [k, !allOn])));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const allowedTabs = allTabKeys.filter(k => checked[k]);
      // If all are checked, store __ALL__ for cleanliness
      const payload = allowedTabs.length === allTabKeys.length
        ? "__ALL__"
        : allowedTabs;
      await api.post("/admin/permissions", { allowed_tabs: payload });
      onSaved(payload);
      setSaved(true);
      toast.success("Admin permissions saved successfully!");
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const checkedCount = allTabKeys.filter(k => checked[k]).length;
  const totalCount = allTabKeys.length;
  const allOn = checkedCount === totalCount;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-eminence-gold/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-eminence-gold/20 border border-eminence-gold/40 flex items-center justify-center">
              <Settings size={20} className="text-eminence-gold" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-eminence-gold/80">Super Admin</p>
              <h2 className="font-serif text-2xl text-white">Admin Access Control</h2>
            </div>
          </div>
          <p className="text-sm text-gray-300 max-w-xl">
            Configure which dashboard sections and features regular Admins can access. The <strong className="text-white">Overview tab</strong> is always accessible. Super Admins always have full unrestricted access regardless of these settings.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="bg-white/10 border border-white/20 px-4 py-2 rounded-full text-xs font-bold text-white">
              {checkedCount} / {totalCount} tabs enabled
            </div>
            <div className="w-32 bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-eminence-gold h-full transition-all duration-300"
                style={{ width: `${(checkedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={toggleAll}
          className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
        >
          {allOn ? "Uncheck All" : "Check All"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider transition-all shadow-md ${saved
            ? "bg-emerald-500 text-white"
            : "bg-eminence-gold hover:bg-[#c5a030] text-black"
            } disabled:opacity-60`}
        >
          {saving ? (
            <span className="animate-spin w-4 h-4 border-2 border-black/30 border-t-black rounded-full" />
          ) : saved ? (
            <Check size={16} />
          ) : (
            <Settings size={16} />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Permissions"}
        </button>
      </div>

      {/* Grouped Permission Checklists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ALL_CONTROLLABLE_TABS.map(group => {
          const groupCheckedCount = group.tabs.filter(t => checked[t.k]).length;
          const groupAllOn = groupCheckedCount === group.tabs.length;
          return (
            <div key={group.group} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              {/* Group Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupAllOn}
                      onChange={() => toggleGroup(group.tabs)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-eminence-gold" />
                  </label>
                  <span className="font-bold text-sm text-gray-800 uppercase tracking-wider">{group.group}</span>
                </div>
                <span className="text-[10px] text-eminence-muted font-bold bg-eminence-surface px-2 py-0.5 rounded-full border border-eminence-border">
                  {groupCheckedCount}/{group.tabs.length}
                </span>
              </div>
              {/* Tab Items */}
              <div className="divide-y divide-gray-50">
                {group.tabs.map(tabItem => (
                  <label
                    key={tabItem.k}
                    className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/60 cursor-pointer transition-colors group"
                  >
                    <span className={`text-sm transition-colors ${checked[tabItem.k] ? "text-gray-800 font-medium" : "text-gray-400"}`}>
                      {tabItem.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-mono uppercase tracking-wider ${checked[tabItem.k] ? "text-emerald-600" : "text-gray-300"}`}>
                        {checked[tabItem.k] ? "ON" : "OFF"}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!checked[tabItem.k]}
                          onChange={() => toggleTab(tabItem.k)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                      </label>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm">
        <Bell size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-amber-800">
          <strong>Note:</strong> Changes take effect the next time the Admin refreshes or logs into their dashboard. The <strong>Overview</strong> tab and all Super-Admin-only items (branches, software settings, admin permissions) are always locked and not configurable here.
        </p>
      </div>
    </div>
  );
}

// ==========================================
// REPORTS DROPDOWN PANELS
// ==========================================

function DailyReportsPanel({ stats, orders, reportsData, expenses }) {
  const today = new Date();
  const past30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(() => past30Days.toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(() => today.toISOString().split("T")[0]);

  const formatNumber = (num) => {
    return Number(num || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const filteredOrders = React.useMemo(() => {
    return orders.filter(o => {
      if (o.status === "cancelled") return false;
      const dateStr = o.created_at ? getLocalDateString(o.created_at) : "";
      if (!dateStr) return false;
      return dateStr >= fromDate && dateStr <= toDate;
    });
  }, [orders, fromDate, toDate]);

  const dailyReportRows = React.useMemo(() => {
    const grouped = {};

    filteredOrders.forEach(o => {
      const dateStr = o.created_at ? getLocalDateString(o.created_at) : "Unknown";
      let displayDate = dateStr;
      try {
        const [y, m, d] = dateStr.split("-");
        if (y && m && d) displayDate = `${d}-${m}-${y}`;
      } catch (e) { }

      if (!grouped[dateStr]) {
        grouped[dateStr] = {
          dateKey: dateStr,
          displayDate: displayDate,
          service_amount: 0,
          product_amount: 0,
          website_sales: 0,
          package_amount: 0,
          membership_amount: 0,
          wallet_amount: 0,
          pending_received: 0,
          appointment_advance: 0,
          pending_payment: 0,
          total_invoice_amount: 0,
          discount: 0,
          net_sale: 0,
          tax: 0,
          tax_inclusive: 0,
          grand_sale: 0,
          total_collection: 0,
          cash: 0,
          card: 0,
          cheque: 0,
          online: 0,
          upi: 0,
          ewallet: 0,
          reward: 0
        };
      }

      const day = grouped[dateStr];

      // Website Sales vs CRM Salon Sales
      const isWebsiteSale = !o.notes?.includes("SERVICE BILLING") && !o.notes?.includes("COMBINED BILLING") && !o.notes?.includes("SALES BILLING");

      if (isWebsiteSale) {
        day.website_sales += o.total || 0;
      } else {
        // Salon CRM order - breakdown items
        o.items?.forEach(it => {
          const price = (it.price || 0) * (it.quantity || 1);
          const type = it.type || (it.is_service ? "service" : (it.is_package ? "package" : "product"));

          if (type === "product") {
            day.product_amount += price;
          } else if (type === "package") {
            day.package_amount += price;
          } else if (type === "membership") {
            day.membership_amount += price;
          } else {
            day.service_amount += price;
          }
        });
      }

      // Wallet accrued change logic:
      if (o.add_to_wallet) {
        const totalPaid = o.split_payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || o.total || 0;
        if (totalPaid > o.total) {
          day.wallet_amount += (totalPaid - o.total);
        }
      }

      // Discount & Tax parsing:
      let discountVal = 0;
      let taxExclusive = 0;
      let taxInclusive = (o.total || 0) * 0.18;

      if (o.notes) {
        const discMatch = o.notes.match(/Discount:\s*₹?\s*([0-9.]+)/i);
        if (discMatch) {
          discountVal = parseFloat(discMatch[1]) || 0;
        }

        const taxMatch = o.notes.match(/Tax:\s*([0-9.]+)\s*(%|INR)/i);
        if (taxMatch) {
          const taxRate = parseFloat(taxMatch[1]) || 0;
          const taxType = taxMatch[2];
          if (taxRate > 0) {
            if (taxType === "%") {
              taxExclusive = o.total - (o.total / (1 + taxRate / 100));
            } else {
              taxExclusive = taxRate;
            }
          }
        }
      }

      const discount = discountVal || o.discount || 0;
      let paid = 0;
      if (o.split_payments && o.split_payments.length > 0) {
        paid = o.split_payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      } else {
        if (o.status !== "placed" && o.status !== "pending") {
          paid = o.total || 0;
        }
      }
      const unpaid = Math.max(0, (o.total || 0) - discount - paid);

      // Status-based pending/delivered totals:
      if (o.status === "delivered" || o.status === "completed") {
        day.pending_received += paid;
      } else if (o.status === "placed" || o.status === "pending") {
        day.pending_payment += unpaid;
      }

      day.discount += discount;
      day.tax += taxExclusive;
      day.tax_inclusive += taxInclusive;
      day.grand_sale += (o.total || 0) - discount;

      // Payment Modes
      if (o.split_payments && o.split_payments.length > 0) {
        o.split_payments.forEach(p => {
          const method = p.method?.toLowerCase() || "";
          const amt = Number(p.amount) || 0;
          if (method === "cash") day.cash += amt;
          else if (method === "card" || method === "credit/debit card") day.card += amt;
          else if (method === "cheque") day.cheque += amt;
          else if (method === "online" || method === "online payment") day.online += amt;
          else if (["upi", "gpay", "g-pay", "g pay", "phonepe", "paytm"].includes(method)) day.upi += amt;
          else if (method === "e-wallet" || method === "ewallet") day.ewallet += amt;
          else if (method === "reward" || method === "reward points") day.reward += amt;
          else day.online += amt;
        });
      } else {
        const method = o.payment_method?.toLowerCase() || "";
        const amt = Number(o.total) || 0;
        if (method === "cash") day.cash += amt;
        else if (method === "card" || method === "credit/debit card") day.card += amt;
        else if (method === "cheque") day.cheque += amt;
        else if (method === "online" || method === "online payment") day.online += amt;
        else if (["upi", "gpay", "g-pay", "g pay", "phonepe", "paytm"].includes(method)) day.upi += amt;
        else if (method === "e-wallet" || method === "ewallet") day.ewallet += amt;
        else if (method === "reward" || method === "reward points") day.reward += amt;
        else day.online += amt;
      }
    });

    return Object.values(grouped).map(day => {
      day.total_invoice_amount = day.service_amount + day.product_amount + day.website_sales + day.package_amount + day.membership_amount;
      day.net_sale = day.total_invoice_amount - day.discount;
      day.total_collection = day.cash + day.card + day.cheque + day.online + day.upi + day.ewallet + day.reward;
      return day;
    }).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredOrders]);

  const sums = React.useMemo(() => {
    const total = {
      service_amount: 0,
      product_amount: 0,
      website_sales: 0,
      package_amount: 0,
      membership_amount: 0,
      wallet_amount: 0,
      pending_received: 0,
      appointment_advance: 0,
      pending_payment: 0,
      total_invoice_amount: 0,
      discount: 0,
      net_sale: 0,
      tax: 0,
      tax_inclusive: 0,
      grand_sale: 0,
      total_collection: 0,
      cash: 0,
      card: 0,
      cheque: 0,
      online: 0,
      upi: 0,
      ewallet: 0,
      reward: 0
    };

    dailyReportRows.forEach(row => {
      total.service_amount += row.service_amount;
      total.product_amount += row.product_amount;
      total.website_sales += row.website_sales;
      total.package_amount += row.package_amount;
      total.membership_amount += row.membership_amount;
      total.wallet_amount += row.wallet_amount;
      total.pending_received += row.pending_received;
      total.appointment_advance += row.appointment_advance;
      total.pending_payment += row.pending_payment;
      total.total_invoice_amount += row.total_invoice_amount;
      total.discount += row.discount;
      total.net_sale += row.net_sale;
      total.tax += row.tax;
      total.tax_inclusive += row.tax_inclusive;
      total.grand_sale += row.grand_sale;
      total.total_collection += row.total_collection;
      total.cash += row.cash;
      total.card += row.card;
      total.cheque += row.cheque;
      total.online += row.online;
      total.upi += row.upi;
      total.ewallet += row.ewallet;
      total.reward += row.reward;
    });

    return total;
  }, [dailyReportRows]);

  const handleExport = () => {
    const headers = [
      "Sr. No.",
      "Bill Date",
      "Service Amount",
      "Product Amount",
      "Website Sales",
      "Package Amount",
      "Membership Amount",
      "Wallet Amount (Accrued Change)",
      "Pending Amount Received",
      "Appointment Advance",
      "Pending Payment",
      "Total Invoice Amount",
      "Discount",
      "Net Sale",
      "Tax (Exclusive)",
      "Tax (Inclusive)",
      "Grand Sale",
      "Total Collection",
      "Cash",
      "Credit/Debit Card",
      "Cheque",
      "Online Payment",
      "UPI",
      "E-wallet",
      "Reward Points"
    ];

    const csvRows = [headers.join(",")];

    dailyReportRows.forEach((row, idx) => {
      const line = [
        idx + 1,
        row.displayDate,
        row.service_amount.toFixed(2),
        row.product_amount.toFixed(2),
        row.website_sales.toFixed(2),
        row.package_amount.toFixed(2),
        row.membership_amount.toFixed(2),
        row.wallet_amount.toFixed(2),
        row.pending_received.toFixed(2),
        row.appointment_advance.toFixed(2),
        row.pending_payment.toFixed(2),
        row.total_invoice_amount.toFixed(2),
        row.discount.toFixed(2),
        row.net_sale.toFixed(2),
        row.tax.toFixed(2),
        row.tax_inclusive.toFixed(2),
        row.grand_sale.toFixed(2),
        row.total_collection.toFixed(2),
        row.cash.toFixed(2),
        row.card.toFixed(2),
        row.cheque.toFixed(2),
        row.online.toFixed(2),
        row.upi.toFixed(2),
        row.ewallet.toFixed(2),
        row.reward.toFixed(2)
      ];
      csvRows.push(line.map(val => `"${val}"`).join(","));
    });

    const footerLine = [
      "Total",
      "",
      sums.service_amount.toFixed(2),
      sums.product_amount.toFixed(2),
      sums.website_sales.toFixed(2),
      sums.package_amount.toFixed(2),
      sums.membership_amount.toFixed(2),
      sums.wallet_amount.toFixed(2),
      sums.pending_received.toFixed(2),
      sums.appointment_advance.toFixed(2),
      sums.pending_payment.toFixed(2),
      sums.total_invoice_amount.toFixed(2),
      sums.discount.toFixed(2),
      sums.net_sale.toFixed(2),
      sums.tax.toFixed(2),
      sums.tax_inclusive.toFixed(2),
      sums.grand_sale.toFixed(2),
      sums.total_collection.toFixed(2),
      sums.cash.toFixed(2),
      sums.card.toFixed(2),
      sums.cheque.toFixed(2),
      sums.online.toFixed(2),
      sums.upi.toFixed(2),
      sums.ewallet.toFixed(2),
      sums.reward.toFixed(2)
    ];
    csvRows.push(footerLine.map(val => `"${val}"`).join(","));

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `daily_operations_report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in text-gray-800">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-serif text-3xl text-gray-900">Daily Operations Report</h2>
          <p className="text-xs text-gray-500">Grouped financial overview by date</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">From Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-eminence-gold" size={16} />
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="bg-white border border-gray-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:border-eminence-gold text-gray-800 rounded cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-eminence-gold" size={16} />
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="bg-white border border-gray-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:border-eminence-gold text-gray-800 rounded cursor-pointer"
              />
            </div>
          </div>
          <button
            onClick={() => {
              setFromDate(past30Days.toISOString().split("T")[0]);
              setToDate(today.toISOString().split("T")[0]);
            }}
            className="mt-5 px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded text-xs text-gray-600 transition-all duration-200"
          >
            Clear
          </button>
        </div>
        <div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm px-4 py-2.5 rounded-lg transition-all duration-200 shadow-md"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="eminence-card p-6">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs text-left text-gray-700">
            <thead className="bg-[#0b1f3c] text-white border-b border-eminence-border/50 uppercase tracking-wider text-[10px]">
              <tr>
                <th rowSpan="2" className="px-3 py-4 text-center border-r border-eminence-border/30">Sr. no</th>
                <th rowSpan="2" className="px-3 py-4 border-r border-eminence-border/30 whitespace-nowrap">Bill Date</th>
                <th colSpan="9" className="px-3 py-2 text-center border-b border-eminence-border/30 border-r border-eminence-border/30">Sales Breakdown</th>
                <th rowSpan="2" className="px-3 py-4 text-right border-r border-eminence-border/30 whitespace-nowrap">Total Invoice Amount</th>
                <th rowSpan="2" className="px-3 py-4 text-right border-r border-eminence-border/30 whitespace-nowrap">Discount</th>
                <th rowSpan="2" className="px-3 py-4 text-right border-r border-eminence-border/30 whitespace-nowrap">Net Sale</th>
                <th rowSpan="2" className="px-3 py-4 text-left border-r border-eminence-border/30 whitespace-nowrap">Tax (Inc / Exc)</th>
                <th rowSpan="2" className="px-3 py-4 text-right border-r border-eminence-border/30 whitespace-nowrap">Grand Sale</th>
                <th rowSpan="2" className="px-3 py-4 text-right border-r border-eminence-border/30 whitespace-nowrap font-bold text-eminence-gold">Total Collection</th>
                <th colSpan="9" className="px-3 py-2 text-center border-b border-eminence-border/30">Collections Mode Breakdown</th>
              </tr>
              <tr className="bg-[#0b1f3c]/80 text-[9px]">
                <th className="px-2 py-2 text-right">Service Amt</th>
                <th className="px-2 py-2 text-right">Product Amt</th>
                <th className="px-2 py-2 text-right">Website Sales</th>
                <th className="px-2 py-2 text-right">Package Amt</th>
                <th className="px-2 py-2 text-right">Membership Amt</th>
                <th className="px-2 py-2 text-right">Wallet Amt (Accrued)</th>
                <th className="px-2 py-2 text-right">Pending Received</th>
                <th className="px-2 py-2 text-right">Appointment Advance</th>
                <th className="px-2 py-2 text-right border-r border-eminence-border/30">Pending Payment</th>

                <th className="px-2 py-2 text-right">Cash</th>
                <th className="px-2 py-2 text-right">Card</th>
                <th className="px-2 py-2 text-right">Cheque</th>
                <th className="px-2 py-2 text-right">Online</th>
                <th className="px-2 py-2 text-right">UPI</th>
                <th className="px-2 py-2 text-right">E-Wallet</th>
                <th className="px-2 py-2 text-right">Reward Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
              {dailyReportRows.map((row, idx) => (
                <tr key={row.dateKey} className="hover:bg-amber-50/20 transition-colors duration-150 even:bg-gray-50/40">
                  <td className="px-3 py-3 text-center border-r border-gray-100 font-medium">{idx + 1}</td>
                  <td className="px-3 py-3 font-semibold border-r border-gray-100 whitespace-nowrap text-gray-900">{row.displayDate}</td>

                  <td className="px-2 py-3 text-right">{formatNumber(row.service_amount)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.product_amount)}</td>
                  <td className="px-2 py-3 text-right text-emerald-700 font-semibold">{formatNumber(row.website_sales)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.package_amount)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.membership_amount)}</td>
                  <td className="px-2 py-3 text-right text-amber-700">{formatNumber(row.wallet_amount)}</td>
                  <td className="px-2 py-3 text-right text-emerald-700 font-semibold">{formatNumber(row.pending_received)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.appointment_advance)}</td>
                  <td className="px-2 py-3 text-right text-red-600 font-semibold border-r border-gray-100">{formatNumber(row.pending_payment)}</td>

                  <td className="px-3 py-3 text-right font-medium text-gray-900 border-r border-gray-100">{formatNumber(row.total_invoice_amount)}</td>
                  <td className="px-3 py-3 text-right text-red-600 font-medium border-r border-gray-100">-{formatNumber(row.discount)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-gray-900 border-r border-gray-100">{formatNumber(row.net_sale)}</td>
                  <td className="px-3 py-3 text-left text-[10px] text-gray-500 border-r border-gray-100 whitespace-nowrap leading-relaxed">
                    <div>Inc: {formatNumber(row.tax_inclusive)}</div>
                    <div>Exc: {formatNumber(row.tax)}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900 border-r border-gray-100">{formatNumber(row.grand_sale)}</td>
                  <td className="px-3 py-3 text-right font-bold text-amber-700 border-r border-gray-100">{formatNumber(row.total_collection)}</td>

                  <td className="px-2 py-3 text-right">{formatNumber(row.cash)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.card)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.cheque)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.online)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.upi)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.ewallet)}</td>
                  <td className="px-2 py-3 text-right">{formatNumber(row.reward)}</td>
                </tr>
              ))}
              {dailyReportRows.length === 0 && (
                <tr>
                  <td colSpan="24" className="text-center py-12 text-gray-500 italic">No transactions found in this date range.</td>
                </tr>
              )}
            </tbody>
            {dailyReportRows.length > 0 && (
              <tfoot className="bg-[#0b1f3c] font-bold text-white border-t border-eminence-border/50">
                <tr className="align-middle">
                  <td colSpan="2" className="px-3 py-4 text-center border-r border-eminence-border/30 text-white font-serif uppercase tracking-wider">Total</td>

                  <td className="px-2 py-4 text-right">{formatNumber(sums.service_amount)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.product_amount)}</td>
                  <td className="px-2 py-4 text-right text-emerald-400">{formatNumber(sums.website_sales)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.package_amount)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.membership_amount)}</td>
                  <td className="px-2 py-4 text-right text-amber-300">{formatNumber(sums.wallet_amount)}</td>
                  <td className="px-2 py-4 text-right text-emerald-400">{formatNumber(sums.pending_received)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.appointment_advance)}</td>
                  <td className="px-2 py-4 text-right text-rose-400 border-r border-eminence-border/30">{formatNumber(sums.pending_payment)}</td>

                  <td className="px-3 py-4 text-right text-white border-r border-eminence-border/30">{formatNumber(sums.total_invoice_amount)}</td>
                  <td className="px-3 py-4 text-right text-rose-300 border-r border-eminence-border/30">-{formatNumber(sums.discount)}</td>
                  <td className="px-3 py-4 text-right text-white border-r border-eminence-border/30">{formatNumber(sums.net_sale)}</td>
                  <td className="px-3 py-4 text-left text-[10px] text-eminence-muted border-r border-eminence-border/30 leading-relaxed whitespace-nowrap">
                    <div>Inc: {formatNumber(sums.tax_inclusive)}</div>
                    <div>Exc: {formatNumber(sums.tax)}</div>
                  </td>
                  <td className="px-3 py-4 text-right text-white border-r border-eminence-border/30">{formatNumber(sums.grand_sale)}</td>
                  <td className="px-3 py-4 text-right text-eminence-gold border-r border-eminence-border/30 font-extrabold">{formatNumber(sums.total_collection)}</td>

                  <td className="px-2 py-4 text-right">{formatNumber(sums.cash)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.card)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.cheque)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.online)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.upi)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.ewallet)}</td>
                  <td className="px-2 py-4 text-right">{formatNumber(sums.reward)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function DaySummaryPanel({ stats, orders = [], reportsData = [], expenses = [], employees = [], products = [], services = [], t }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);

  const getDiscount = (o) => {
    let discountVal = parseFloat(o.discount) || 0;
    if (o.notes && !discountVal) {
      const discMatch = o.notes.match(/Discount:\s*₹?\s*([0-9.]+)/i);
      if (discMatch) {
        discountVal = parseFloat(discMatch[1]) || 0;
      }
    }
    return discountVal;
  };

  const formatNumber = (num) => {
    return Number(num || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const filteredOrders = React.useMemo(() => {
    return orders.filter(o => {
      if (o.status === "cancelled") return false;
      const dateStr = o.created_at ? getLocalDateString(o.created_at) : "";
      return dateStr >= fromDate && dateStr <= toDate;
    });
  }, [orders, fromDate, toDate]);

  const filteredExpenses = React.useMemo(() => {
    return expenses.filter(e => {
      const dateStr = e.date ? e.date.split("T")[0] : "";
      return dateStr >= fromDate && dateStr <= toDate;
    });
  }, [expenses, fromDate, toDate]);

  // Derived stats
  const statsSummary = React.useMemo(() => {
    let totalInvoiceAmount = 0;
    let pendingPayableByClients = 0;
    let productSales = 0;
    let serviceSales = 0;
    let pendingPaymentReceived = 0;
    let appointmentAdvance = 0;
    let walletRecharged = 0;

    let cash = 0;
    let onlinePayment = 0;
    let card = 0;
    let cheque = 0;
    let walletPaid = 0;
    let upi = 0;
    let rewardPaid = 0;

    let totalDiscountGiven = 0;
    let inclusiveTax = 0;
    let exclusiveTax = 0;
    let totalCommissions = 0;

    filteredOrders.forEach(o => {
      const total = o.total || 0;
      const discount = getDiscount(o);
      totalInvoiceAmount += total;
      totalDiscountGiven += discount;

      // Unpaid balance
      let paid = 0;
      if (o.split_payments && o.split_payments.length > 0) {
        paid = o.split_payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      } else {
        if (o.status !== "placed" && o.status !== "pending") {
          paid = total;
        }
      }
      const unpaid = Math.max(0, total - discount - paid);
      pendingPayableByClients += unpaid;

      // Product vs Service Sales
      const isWebsiteSale = !o.notes?.includes("SERVICE BILLING") && !o.notes?.includes("COMBINED BILLING") && !o.notes?.includes("SALES BILLING");
      if (isWebsiteSale) {
        productSales += total;
      } else {
        o.items?.forEach(it => {
          const type = it.type || (it.is_service ? "service" : (it.is_package ? "package" : "product"));
          const price = (it.price || 0) * (it.quantity || 1);
          if (type === "product") {
            productSales += price;
          } else if (type === "service") {
            serviceSales += price;
          } else {
            // Packages/Memberships counted as services
            serviceSales += price;
          }
        });
      }

      // Pending payment received
      if (o.status === "delivered" || o.status === "completed") {
        pendingPaymentReceived += paid;
      }

      // Wallet recharged
      if (o.add_to_wallet) {
        const totalPaid = o.split_payments?.reduce((s, p) => s + (Number(p.amount) || 0), 0) || total;
        if (totalPaid > total) {
          walletRecharged += (totalPaid - total);
        }
      }

      // Taxes
      const taxInclusive = total * 0.18;
      let taxExclusive = 0;
      if (o.notes) {
        const taxMatch = o.notes.match(/Tax:\s*([0-9.]+)\s*(%|INR)/i);
        if (taxMatch) {
          const taxRate = parseFloat(taxMatch[1]) || 0;
          const taxType = taxMatch[2];
          if (taxRate > 0) {
            if (taxType === "%") {
              taxExclusive = total - (total / (1 + taxRate / 100));
            } else {
              taxExclusive = taxRate;
            }
          }
        }
      }
      inclusiveTax += taxInclusive;
      exclusiveTax += taxExclusive;

      // Commissions (Estimated Stylist Payout)
      o.items?.forEach(it => {
        const provId = it.service_provider;
        const emp = employees.find(e => e.id === provId);
        const rate = emp?.commission_rate !== undefined ? emp.commission_rate : 0.05;
        totalCommissions += (it.price || 0) * (it.quantity || 1) * rate;
      });

      // Collections mode breakdown
      if (o.split_payments && o.split_payments.length > 0) {
        o.split_payments.forEach(p => {
          const method = p.method?.toLowerCase() || "";
          const amt = Number(p.amount) || 0;
          if (method === "cash") cash += amt;
          else if (method === "card" || method === "credit/debit card") card += amt;
          else if (method === "cheque") cheque += amt;
          else if (method === "online" || method === "online payment") onlinePayment += amt;
          else if (["upi", "gpay", "g-pay", "g pay", "phonepe", "paytm"].includes(method)) upi += amt;
          else if (method === "e-wallet" || method === "ewallet") walletPaid += amt;
          else if (method === "reward" || method === "reward points") rewardPaid += amt;
          else onlinePayment += amt;
        });
      } else {
        const method = o.payment_method?.toLowerCase() || "";
        const amt = total;
        if (method === "cash") cash += amt;
        else if (method === "card" || method === "credit/debit card") card += amt;
        else if (method === "cheque") cheque += amt;
        else if (method === "online" || method === "online payment") onlinePayment += amt;
        else if (["upi", "gpay", "g-pay", "g pay", "phonepe", "paytm"].includes(method)) upi += amt;
        else if (method === "e-wallet" || method === "ewallet") walletPaid += amt;
        else if (method === "reward" || method === "reward points") rewardPaid += amt;
        else onlinePayment += amt;
      }
    });

    const totalCollection = cash + onlinePayment + card + cheque + walletPaid + upi + rewardPaid;

    // Unique clients in current period
    const uniqueClients = new Set(filteredOrders.map(o => o.phone || o.full_name).filter(Boolean)).size;

    // Today's new clients count
    const currentClients = new Set(filteredOrders.map(o => o.phone).filter(Boolean));
    let newClientsCount = 0;
    currentClients.forEach(phone => {
      const hasPastOrder = orders.some(o => o.phone === phone && o.created_at && o.created_at.split("T")[0] < fromDate);
      if (!hasPastOrder) newClientsCount++;
    });

    const expensesToday = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return {
      totalInvoiceAmount,
      pendingPayableByClients,
      totalCollection,
      productSales,
      serviceSales,
      pendingPaymentReceived,
      appointmentAdvance,
      walletRecharged,
      cash,
      onlinePayment,
      card,
      cheque,
      walletPaid,
      upi,
      rewardPaid,
      totalDiscountGiven,
      inclusiveTax,
      exclusiveTax,
      totalCommissions,
      uniqueClients,
      newClientsCount,
      expensesToday
    };
  }, [filteredOrders, filteredExpenses, orders, fromDate, employees]);

  const upiTotal = statsSummary.upi + statsSummary.onlinePayment;
  const cashTotal = statsSummary.cash;
  const cardTotal = statsSummary.card;

  const summaryRows = [
    { label: "Total invoice amount", value: statsSummary.totalInvoiceAmount, isAmount: true },
    { label: "Pending payable by clients", value: statsSummary.pendingPayableByClients, isAmount: true, valueClass: "text-red-600 font-semibold" },
    { label: "Total Collection", value: statsSummary.totalCollection, isAmount: true, valueClass: "text-emerald-700 font-semibold" },
    { label: "Product Sales", value: statsSummary.productSales, isAmount: true },
    { label: "Service Sales", value: statsSummary.serviceSales, isAmount: true },
    { label: "Pending payment received", value: statsSummary.pendingPaymentReceived, isAmount: true },
    { label: "Appointment advance", value: statsSummary.appointmentAdvance, isAmount: true },
    { label: "Wallet re-charged", value: statsSummary.walletRecharged, isAmount: true },
    { label: "Cash", value: statsSummary.cash, isAmount: true },
    { label: "Online payment", value: statsSummary.onlinePayment, isAmount: true },
    { label: "Credit/Debit Card", value: statsSummary.card, isAmount: true },
    { label: "Cheque", value: statsSummary.cheque, isAmount: true },
    { label: "Paid by wallet", value: statsSummary.walletPaid, isAmount: true },
    { label: "UPI", value: statsSummary.upi, isAmount: true },
    { label: "Paid by Reward points", value: statsSummary.rewardPaid, isAmount: true },
    { label: "Total Discount given", value: statsSummary.totalDiscountGiven, isAmount: true, valueClass: "text-red-600 font-semibold" },
    {
      label: "Total TAX",
      value: `Inclusive tax : ₹${formatNumber(statsSummary.inclusiveTax)}\nExclusive tax : ₹${formatNumber(statsSummary.exclusiveTax)}`,
      isCustomText: true
    },
    { label: "Total commissions payable", value: statsSummary.totalCommissions, isAmount: true },
    { label: "Today's Clients", value: statsSummary.uniqueClients, isAmount: false },
    { label: "Today's new clients", value: statsSummary.newClientsCount, isAmount: false },
    { label: "Expenses Today", value: statsSummary.expensesToday, isAmount: true, valueClass: "text-rose-600 font-semibold" },
  ];

  return (
    <div className="space-y-6 animate-fade-in text-gray-800">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-serif text-3xl text-gray-900">Day Collection Summary</h2>
          <p className="text-xs text-gray-500">Detailed collection and sales split by payment modes</p>
        </div>
      </div>

      {/* Date Filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">From Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-eminence-gold" size={16} />
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="bg-white border border-gray-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:border-eminence-gold text-gray-800 rounded cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-eminence-gold" size={16} />
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="bg-white border border-gray-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:border-eminence-gold text-gray-800 rounded cursor-pointer"
              />
            </div>
          </div>
          <button
            onClick={() => {
              setFromDate(todayStr);
              setToDate(todayStr);
            }}
            className="mt-5 px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded text-xs text-gray-600 transition-all duration-200"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-emerald-500 bg-white">
          <p className="overline mb-1 text-emerald-600 font-bold">UPI Collection</p>
          <p className="text-3xl font-serif text-emerald-800">₹{upiTotal.toLocaleString("en-IN")}</p>
        </div>
        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-amber-500 bg-white">
          <p className="overline mb-1 text-amber-600 font-bold">Cash Collection</p>
          <p className="text-3xl font-serif text-amber-800">₹{cashTotal.toLocaleString("en-IN")}</p>
        </div>
        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-sky-500 bg-white">
          <p className="overline mb-1 text-sky-600 font-bold">Card Collection</p>
          <p className="text-3xl font-serif text-sky-800">₹{cardTotal.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="eminence-card p-6 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <h3 className="font-serif text-lg text-gray-900 mb-4 px-1">Detailed Breakdown</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm text-left text-gray-700">
            <thead className="bg-[#0b1f3c] text-white border-b border-gray-200 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Sales Type</th>
                <th className="px-6 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaryRows.map((row, idx) => (
                <tr key={row.label} className="hover:bg-amber-50/10 transition-colors duration-150 even:bg-gray-50/20">
                  <td className="px-6 py-4 font-medium text-gray-800">{row.label}</td>
                  <td className={`px-6 py-4 text-right whitespace-pre-line ${row.valueClass || 'text-gray-900'}`}>
                    {row.isCustomText
                      ? row.value
                      : (row.isAmount ? `₹${formatNumber(row.value)}` : row.value)
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BillingReportsPanel({ orders, employees = [], products = [], services = [], onComplete }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; })();

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [serviceProvider, setServiceProvider] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [viewOrder, setViewOrder] = useState(null);

  const [editingOrder, setEditingOrder] = useState(null);
  const [editForm, setEditForm] = useState({ split_payments: [] });
  const [saving, setSaving] = useState(false);

  const catalogItems = React.useMemo(() => [
    ...products.map(p => ({ ...p, type: "Product" })),
    ...services.map(s => ({ ...s, type: "Service" }))
  ], [products, services]);

  const handleEditClick = (o) => {
    navigate("/billing", { state: { editOrder: o } });
  };

  const handleDeleteClick = async (o) => {
    if (window.confirm(`Are you sure you want to delete bill #${o.id?.slice(0, 8)}? This action cannot be undone.`)) {
      try {
        await api.delete(`/admin/orders/${o.id}`);
        toast.success("Bill deleted successfully!");
        if (onComplete) onComplete();
      } catch (err) {
        toast.error("Failed to delete bill.");
      }
    }
  };

  const handleItemChange = (idx, key, val) => {
    setEditForm(prev => {
      const updatedItems = (prev.items || []).map((it, i) => {
        if (i !== idx) return it;
        let updatedItem = { ...it, [key]: val };
        if (key === "name") {
          const match = catalogItems.find(c => c.name.toLowerCase() === val.toLowerCase());
          if (match) {
            updatedItem.price = match.price || 0;
            updatedItem.is_service = match.type === "Service";
          }
        }
        const q = Number(updatedItem.quantity) || 0;
        const p = Number(updatedItem.price) || 0;
        updatedItem.line_total = q * p;
        return updatedItem;
      });
      const newTotal = updatedItems.reduce((sum, it) => sum + (it.line_total || 0), 0);
      return {
        ...prev,
        items: updatedItems,
        total: newTotal
      };
    });
  };

  const handleAddItem = () => {
    setEditForm(prev => ({
      ...prev,
      items: [
        ...(prev.items || []),
        { name: "", is_service: true, quantity: 1, price: 0, line_total: 0, service_provider: "", service_provider_2: "" }
      ]
    }));
  };

  const handleRemoveItem = (idx) => {
    setEditForm(prev => {
      const updatedItems = (prev.items || []).filter((_, i) => i !== idx);
      const newTotal = updatedItems.reduce((sum, it) => sum + (it.line_total || 0), 0);
      return {
        ...prev,
        items: updatedItems,
        total: newTotal
      };
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        full_name: editForm.full_name,
        phone: editForm.phone,
        total: Number(editForm.total),
        discount: Number(editForm.discount) || 0,
        notes: editForm.notes,
        split_payments: editForm.split_payments.map(p => ({
          method: p.method,
          amount: Number(p.amount)
        })),
        items: editForm.items.map(it => ({
          name: it.name,
          is_service: !!it.is_service,
          type: it.is_service ? "service" : "product",
          quantity: Number(it.quantity),
          price: Number(it.price),
          line_total: Number(it.line_total),
          discount: Number(it.discount) || 0,
          discount_type: it.discount_type || "INR",
          service_provider: it.service_provider || null,
          service_provider_2: it.service_provider_2 || null
        }))
      };
      await api.patch(`/admin/orders/${editingOrder.id}`, payload);
      toast.success("Bill updated successfully!");
      setEditingOrder(null);
      if (onComplete) onComplete();
    } catch (err) {
      toast.error("Failed to update bill.");
    } finally {
      setSaving(false);
    }
  };

  // Derived filter options from orders
  const allProviders = [...new Set(
    orders.flatMap(o => (o.items || []).flatMap(it => [it.service_provider, it.service_provider_2].filter(Boolean)))
  )].map(id => {
    const emp = employees.find(e => e.id === id);
    return { id, name: emp?.name || id };
  });

  const allServices = [...new Set(
    orders.flatMap(o => (o.items || []).map(it => it.name).filter(Boolean))
  )].sort();

  const applyFilter = () => setPage(1);
  const clearFilter = () => {
    setFromDate(thirtyDaysAgo);
    setToDate(today);
    setServiceProvider("");
    setServiceFilter("");
    setSearch("");
    setPage(1);
  };

  const filtered = orders.filter(o => {
    const date = getLocalDateString(o.created_at);
    const matchDate = date >= fromDate && date <= toDate;
    const matchSearch = !search || (o.full_name || o.user_name || "").toLowerCase().includes(search.toLowerCase())
      || o.id?.toLowerCase().includes(search.toLowerCase())
      || o.phone?.includes(search);
    const matchProvider = !serviceProvider || (o.items || []).some(it =>
      it.service_provider === serviceProvider || it.service_provider_2 === serviceProvider
    );
    const matchService = !serviceFilter || (o.items || []).some(it =>
      it.name?.toLowerCase().includes(serviceFilter.toLowerCase())
    );
    return matchDate && matchSearch && matchProvider && matchService;
  });

  const getDiscount = (o) => {
    let discountVal = parseFloat(o.discount) || 0;
    if (o.notes && !discountVal) {
      const discMatch = o.notes.match(/Discount:\s*₹?\s*([0-9.]+)/i);
      if (discMatch) {
        discountVal = parseFloat(discMatch[1]) || 0;
      }
    }
    return discountVal;
  };

  const totalFiltered = filtered.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalDiscount = filtered.reduce((sum, o) => sum + getDiscount(o), 0);
  const totalPaid = filtered.reduce((sum, o) => {
    if (o.split_payments?.length) return sum + o.split_payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    return sum + (o.total || 0);
  }, 0);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const getPaymentDetail = (o) => {
    if (o.split_payments?.length > 1) {
      return o.split_payments.map(p => `${p.method} - ${parseFloat(p.amount).toFixed(2)}`).join(", ");
    }
    return o.payment_method || "Cash";
  };

  const getPaid = (o) => {
    if (o.split_payments?.length) return o.split_payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    return o.total || 0;
  };

  const getPending = (o) => {
    const discountVal = getDiscount(o);
    const paid = getPaid(o);
    return Math.max(0, (o.total || 0) - discountVal - paid);
  };

  const getProductsServices = (o) => {
    return (o.items || []).map(it => {
      const type = it.is_service ? "Service" : "Product";
      const provName = employees.find(e => e.id === it.service_provider)?.name || it.service_provider || "";
      return `${it.name}(${type})${provName ? ` - ${provName}` : ""}`;
    }).join(", ");
  };

  const exportCSV = () => {
    const headers = ["Date of Bill", "Bill Id", "Client", "Contact", "Total", "Discount", "Paid", "Payment Detail", "Pending", "Type", "Products/Services - Service Provider", "Remarks", "User"];
    const rows = filtered.map(o => [
      getLocalDateString(o.created_at),
      o.id?.slice(0, 8) || "",
      o.full_name || o.user_name || "",
      o.phone || "",
      o.total || 0,
      getDiscount(o).toFixed(2),
      getPaid(o).toFixed(2),
      getPaymentDetail(o),
      getPending(o).toFixed(2),
      "Bill",
      getProductsServices(o),
      o.notes || "",
      o.employee_name || o.user_name || "Admin"
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `billing_report_${fromDate}_to_${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex justify-between items-start mb-5">
          <h2 className="font-serif text-2xl text-gray-900">Billing Reports</h2>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-eminence-gold text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg hover:bg-eminence-gold/90 transition-colors shadow-sm"
          >
            <Download size={14} />
            Export
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Select Date</label>
            <div className="flex gap-2 items-center">
              <input
                type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold bg-white"
              />
              <span className="text-gray-400 text-xs">–</span>
              <input
                type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold bg-white"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Service Provider</label>
            <select
              value={serviceProvider} onChange={e => setServiceProvider(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold bg-white text-gray-500"
            >
              <option value="">Autocomplete (Service provider name)</option>
              {allProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Service</label>
            <select
              value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold bg-white text-gray-500"
            >
              <option value="">Autocomplete (Service name)</option>
              {allServices.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={applyFilter}
            className="flex items-center gap-2 bg-purple-600 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Filter size={13} />
            Filter
          </button>
          <button
            onClick={clearFilter}
            className="flex items-center gap-2 bg-red-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            <X size={13} />
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Show</span>
            <select
              value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border border-gray-200 rounded px-2 py-1 text-sm bg-white"
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Search:</span>
            <input
              type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-eminence-gold w-48"
              placeholder=""
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                {["Date of Bill", "Bill Id", "Client", "Contact", "Total", "Discount", "Paid", "Payment Detail", "Pending", "Type", "Products/Services – Service Provider", "Remarks", "User", "Manage"].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((o, idx) => {
                const paid = getPaid(o);
                const pending = getPending(o);
                const discount = getDiscount(o);
                const prodSvc = getProductsServices(o);
                return (
                  <tr key={o.id} className={`border-b border-gray-100 hover:bg-amber-50/30 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{o.created_at ? getLocalDateString(o.created_at).split("-").reverse().join("-") : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{o.id?.slice(0, 8) || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{o.full_name || o.user_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.phone || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{(o.total || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {discount > 0 ? (
                        <span className="text-red-600 font-semibold">{discount.toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-400">0.00</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-emerald-700 font-semibold whitespace-nowrap">{paid.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{getPaymentDetail(o)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {pending > 0 ? (
                        <span className="text-red-600 font-semibold">{pending.toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-400">0.00</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">Bill</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px]">
                      <div className="line-clamp-2">{prodSvc || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px]">
                      <div className="line-clamp-2">{o.notes || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">{o.employee_name || o.user_name || "Admin"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => setViewOrder(o)}
                          className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded transition-colors"
                        >
                          <FileText size={10} /> View
                        </button>
                        <button
                          onClick={() => handleEditClick(o)}
                          className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded transition-colors"
                        >
                          <Edit size={10} /> Edit
                        </button>
                        <button
                          onClick={() => downloadOrderInvoice(api, o.id)}
                          className="flex items-center gap-1 bg-eminence-gold hover:bg-eminence-gold/90 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded transition-colors"
                        >
                          <Printer size={10} /> Invoice
                        </button>
                        <button
                          onClick={() => handleDeleteClick(o)}
                          className="flex items-center gap-1 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded transition-colors"
                        >
                          <Trash2 size={10} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan="14" className="text-center py-16 text-gray-400 italic">No invoices found matching criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: pagination + summary */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="text-xs text-gray-500">
            Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
            &nbsp;·&nbsp;
            <span className="font-semibold text-gray-700">Total: ₹{totalFiltered.toLocaleString("en-IN")}</span>
            &nbsp;·&nbsp;
            <span className="text-red-600 font-semibold">Discount: ₹{totalDiscount.toLocaleString("en-IN")}</span>
            &nbsp;·&nbsp;
            <span className="text-emerald-700 font-semibold">Paid: ₹{totalPaid.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex gap-1 items-center">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 transition"
            >‹ Prev</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return p <= totalPages ? (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 text-xs border rounded transition ${p === page ? "bg-eminence-gold text-white border-eminence-gold" : "border-gray-200 hover:bg-white"}`}
                >{p}</button>
              ) : null;
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-40 transition"
            >Next ›</button>
          </div>
        </div>
      </div>

      {/* View Order Modal */}
      {viewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setViewOrder(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-serif text-xl text-gray-900">Invoice Detail</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">#{viewOrder.id?.slice(0, 8)}</p>
              </div>
              <button onClick={() => setViewOrder(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400 text-xs">Client</span><p className="font-semibold">{viewOrder.full_name || viewOrder.user_name}</p></div>
              <div><span className="text-gray-400 text-xs">Contact</span><p className="font-semibold">{viewOrder.phone || "—"}</p></div>
              <div><span className="text-gray-400 text-xs">Date</span><p className="font-semibold">{viewOrder.created_at ? getLocalDateString(viewOrder.created_at).split("-").reverse().join("-") : "—"}</p></div>
              <div><span className="text-gray-400 text-xs">Billed by</span><p className="font-semibold">{viewOrder.employee_name || "Admin"}</p></div>
              <div><span className="text-gray-400 text-xs">Total</span><p className="font-semibold text-gray-800">₹{(viewOrder.total || 0).toLocaleString("en-IN")}</p></div>
              <div><span className="text-gray-400 text-xs">Payment</span><p className="font-semibold">{getPaymentDetail(viewOrder)}</p></div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Items</p>
              <div className="space-y-1.5">
                {(viewOrder.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between items-center border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{it.name}</p>
                      <p className="text-[10px] text-gray-400">{it.is_service ? "Service" : "Product"} × {it.quantity}</p>
                    </div>
                    <span className="text-sm font-bold text-eminence-gold">₹{it.line_total?.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </div>
            {viewOrder.notes && <div><p className="text-xs text-gray-400">Remarks</p><p className="text-sm">{viewOrder.notes}</p></div>}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { downloadOrderInvoice(api, viewOrder.id); setViewOrder(null); }}
                className="flex-1 flex items-center justify-center gap-2 bg-eminence-gold text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-lg hover:bg-eminence-gold/90 transition"
              >
                <Printer size={13} /> Print Invoice
              </button>
              <button onClick={() => setViewOrder(null)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition">Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Bill Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-fade-in">
            <div className="p-6 bg-eminence-surface border-b border-gray-100 flex justify-between items-center">
              <div>
                <h4 className="font-serif text-xl text-gray-900">Edit Bill Details</h4>
                <p className="text-xs text-eminence-muted">Bill ID: #{editingOrder.id.slice(0, 8)}</p>
              </div>
              <button onClick={() => setEditingOrder(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Client Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.full_name}
                    onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Contact Phone</label>
                  <input
                    type="text"
                    required
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Total Amount (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editForm.total}
                    onChange={e => setEditForm({ ...editForm, total: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Remarks / Notes</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                  />
                </div>
              </div>

              {/* Line Items Section */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-bold text-gray-700 uppercase">Items / Services</h5>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-eminence-gold hover:text-black font-bold uppercase tracking-wider flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Item
                  </button>
                </div>

                <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1">
                  {(editForm.items || []).map((it, idx) => (
                    <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50 space-y-2 relative">
                      <div className="flex gap-2">
                        {/* Name */}
                        <input
                          type="text"
                          list={`edit-items-list-${idx}`}
                          required
                          placeholder="Search & select item..."
                          value={it.name || ""}
                          onChange={e => handleItemChange(idx, "name", e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-white"
                        />
                        <datalist id={`edit-items-list-${idx}`}>
                          {catalogItems.map(i => (
                            <option key={i.id} value={i.name}>
                              ₹{i.price} {i.category ? `(${i.category})` : ""}
                            </option>
                          ))}
                        </datalist>
                        {/* Type */}
                        <select
                          value={it.is_service ? "service" : "product"}
                          onChange={e => handleItemChange(idx, "is_service", e.target.value === "service")}
                          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-white"
                        >
                          <option value="service">Service</option>
                          <option value="product">Product</option>
                        </select>
                      </div>

                      <div className="flex gap-2 items-center">
                        {/* Quantity */}
                        <div className="w-16">
                          <label className="text-[9px] text-gray-400 font-bold uppercase block mb-0.5">Qty</label>
                          <input
                            type="number"
                            required
                            min="1"
                            value={it.quantity || 1}
                            onChange={e => handleItemChange(idx, "quantity", Number(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-white text-right font-mono"
                          />
                        </div>
                        {/* Price */}
                        <div className="w-24">
                          <label className="text-[9px] text-gray-400 font-bold uppercase block mb-0.5">Price</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={it.price || 0}
                            onChange={e => handleItemChange(idx, "price", Number(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-white text-right font-mono"
                          />
                        </div>
                        {/* Service Provider */}
                        <div className="flex-1">
                          <label className="text-[9px] text-gray-400 font-bold uppercase block mb-0.5">Staff Provider</label>
                          <select
                            value={it.service_provider || ""}
                            onChange={e => handleItemChange(idx, "service_provider", e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-white"
                          >
                            <option value="">-- None --</option>
                            {employees.filter(emp => emp.role === "service").map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        </div>
                        {/* Delete row */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-red-500 hover:bg-red-100 p-1.5 rounded self-end mb-0.5"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!editForm.items || editForm.items.length === 0) && (
                    <p className="text-xs text-gray-400 italic">No items on this bill.</p>
                  )}
                </div>
              </div>

              {/* Payments Section */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-bold text-gray-700 uppercase">Payments Split</h5>
                  <button
                    type="button"
                    onClick={() => setEditForm({
                      ...editForm,
                      split_payments: [...editForm.split_payments, { method: "Cash", amount: 0 }]
                    })}
                    className="text-xs text-eminence-gold hover:text-black font-bold uppercase tracking-wider flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Payment
                  </button>
                </div>

                <div className="space-y-2">
                  {editForm.split_payments.map((p, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={p.method}
                        onChange={e => {
                          const updated = [...editForm.split_payments];
                          updated[idx].method = e.target.value;
                          setEditForm({ ...editForm, split_payments: updated });
                        }}
                        className="flex-1 border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-gray-50"
                      >
                        {["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Credit"].map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        placeholder="Amount"
                        value={p.amount}
                        onChange={e => {
                          const updated = [...editForm.split_payments];
                          updated[idx].amount = e.target.value;
                          setEditForm({ ...editForm, split_payments: updated });
                        }}
                        className="w-32 border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-gray-50 font-mono text-right"
                      />
                      {editForm.split_payments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEditForm({
                            ...editForm,
                            split_payments: editForm.split_payments.filter((_, i) => i !== idx)
                          })}
                          className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-eminence-gold hover:bg-eminence-gold/95 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EnquiryReportsPanel({ consultations }) {
  const totalEnquiries = consultations.length;
  const instagramLeads = consultations.filter(c => c.source?.toLowerCase() === "instagram").length;
  const websiteLeads = consultations.filter(c => c.source?.toLowerCase() === "website" || !c.source).length;
  const manualLeads = totalEnquiries - instagramLeads - websiteLeads;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard icon={MessageSquare} label="Total Enquiries" value={totalEnquiries} />
        <StatCard icon={Star} label="Instagram Leads" value={instagramLeads} />
        <StatCard icon={Calendar} label="Website Leads" value={websiteLeads} />
        <StatCard icon={User} label="Manual/Walk-In" value={manualLeads} />
      </div>

      <div className="eminence-card p-6">
        <h3 className="font-serif text-xl mb-6">Recent Consultations & Enquiries</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-eminence-border py-2 text-left overline text-eminence-muted">
                <th className="py-3">Date</th>
                <th>Client</th>
                <th>Phone</th>
                <th>Recommended Service</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {consultations.slice(0, 10).map((c) => (
                <tr key={c.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                  <td className="py-3">{c.created_at?.split("T")[0] || new Date(c.timestamp).toISOString().split("T")[0]}</td>
                  <td className="font-bold">{c.name}</td>
                  <td>{c.phone || "—"}</td>
                  <td className="text-eminence-gold font-medium">{c.recommended_service || "Consultation"}</td>
                  <td>
                    <span className="uppercase text-[9px] font-bold tracking-widest border border-eminence-border/50 px-2 py-0.5 rounded bg-eminence-surface">
                      {c.source || "Website"}
                    </span>
                  </td>
                </tr>
              ))}
              {consultations.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-eminence-muted italic">No enquiries logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ServiceProviderReportsPanel({ reportsData, employees, orders = [] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const allTransactions = React.useMemo(() => {
    let txs = [];
    orders.forEach(order => {
      const oDate = order.created_at ? order.created_at.split("T")[0] : "";
      const oPhone = order.phone || order.client_phone || "-";
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item, idx) => {
          if (item.service_provider) {
            const emp = employees.find(e => e.id === item.service_provider);
            const empName = emp ? emp.name : "Unknown";
            const price = (item.price || 0) * (item.quantity || 1);

            let rate = emp?.commission_rate !== undefined ? emp.commission_rate : 0.05;
            let fixedInr = emp?.service_commission_inr || 0;
            let isService = true;
            if (item.type === "product") {
              rate = emp?.product_commission_rate !== undefined ? emp.product_commission_rate : 0.02;
              fixedInr = emp?.product_commission_inr || 0;
              isService = false;
            } else if (item.type === "package" || item.is_package) {
              rate = emp?.package_commission_rate !== undefined ? emp.package_commission_rate : 0;
              fixedInr = emp?.package_commission_inr || 0;
              isService = false;
            } else if (item.type === "membership") {
              rate = emp?.member_commission_rate !== undefined ? emp.member_commission_rate : 0;
              fixedInr = emp?.member_commission_inr || 0;
              isService = false;
            }

            let commission = fixedInr > 0 ? (fixedInr * (item.quantity || 1)) : (price * rate);

            let typeStr = "Product";
            if (item.type) {
              typeStr = item.type.charAt(0).toUpperCase() + item.type.slice(1);
            } else if (item.is_service) {
              typeStr = "Service";
            } else if (item.is_package) {
              typeStr = "Package";
            }

            // Apply monthly target logic for service commissions
            if (isService && emp) {
              const target = emp.monthly_target || 0;
              if (target > 0) {
                // Calculate total service amount for this employee across all orders
                const totalServiceAmount = orders.reduce((sum, o) => {
                  let amt = 0;
                  if (o.items && Array.isArray(o.items)) {
                    o.items.forEach(it => {
                      if (it.service_provider === emp.id && (!it.type || it.type === "service" || it.is_service)) {
                        amt += (it.price || 0) * (it.quantity || 1);
                      }
                    });
                  }
                  return sum + amt;
                }, 0);
                if (totalServiceAmount < target) {
                  commission = 0;
                }
              }
            }

            txs.push({
              id: `${order.id}-${idx}`,
              date: oDate,
              providerId: item.service_provider,
              providerName: empName,
              contact: oPhone,
              itemName: `(${typeStr}) ${item.name || "Unknown"}`,
              type: typeStr,
              price: price,
              commission: commission
            });
          }
        });
      }
    });
    return txs.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [orders, employees]);

  const filteredTxs = React.useMemo(() => {
    return allTransactions.filter(tx => {
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      if (selectedProvider && tx.providerId !== selectedProvider) return false;
      if (selectedType && tx.type !== selectedType) return false;
      return true;
    });
  }, [allTransactions, dateFrom, dateTo, selectedProvider, selectedType]);

  const totalPrice = filteredTxs.reduce((sum, tx) => sum + tx.price, 0);
  const totalCommission = filteredTxs.reduce((sum, tx) => sum + tx.commission, 0);

  const totalPages = Math.ceil(filteredTxs.length / pageSize) || 1;
  const paginatedTxs = filteredTxs.slice((page - 1) * pageSize, page * pageSize);

  const serviceEmployees = employees.filter(e => e.role === "service");

  const handleExport = () => {
    const csvHeader = "Date,Service Provider,Contact,Item Name,Price,Commission\n";
    const csvRows = filteredTxs.map(t => `${t.date},"${t.providerName}","${t.contact}","${t.itemName}",${t.price},${t.commission}`).join("\n");
    const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Commission_Report_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-serif text-2xl text-gray-800">Service Provider Reports</h2>
          <p className="text-xs text-eminence-muted">Detailed transaction log and stylist payouts.</p>
        </div>
        <button
          onClick={handleExport}
          className="bg-eminence-gold/10 text-eminence-gold hover:bg-eminence-gold hover:text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-4 items-end shadow-sm">
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eminence-gold bg-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eminence-gold bg-white"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Service Provider</label>
          <select
            value={selectedProvider}
            onChange={e => { setSelectedProvider(e.target.value); setPage(1); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eminence-gold bg-white"
          >
            <option value="">-- All Providers --</option>
            {serviceEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Type</label>
          <select
            value={selectedType}
            onChange={e => { setSelectedType(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eminence-gold bg-white"
          >
            <option value="">-- All Types --</option>
            <option value="Service">Service</option>
            <option value="Product">Product</option>
            <option value="Package">Package</option>
            <option value="Membership">Membership</option>
          </select>
        </div>
        <button
          onClick={() => { setDateFrom(""); setDateTo(""); setSelectedProvider(""); setSelectedType(""); setPage(1); }}
          className="text-xs font-bold text-gray-500 hover:text-gray-900 underline px-2 py-2"
        >
          Clear
        </button>
      </div>

      <div className="eminence-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-eminence-border py-3 text-left overline text-eminence-muted">
                <th className="px-6 py-4">Date</th>
                <th>Service Provider</th>
                <th>Contact</th>
                <th>Item Name</th>
                <th className="text-right">Price</th>
                <th className="text-right px-6">Commission</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTxs.map(tx => (
                <tr key={tx.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                  <td className="px-6 py-4 text-gray-500">{tx.date}</td>
                  <td className="font-bold text-gray-900">{tx.providerName}</td>
                  <td className="text-gray-600">{tx.contact}</td>
                  <td className="text-gray-800">{tx.itemName}</td>
                  <td className="text-right font-medium">₹{tx.price.toLocaleString("en-IN")}</td>
                  <td className="text-right px-6 font-serif text-emerald-600 font-bold">₹{tx.commission.toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {paginatedTxs.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-eminence-muted italic">No transactions found for the selected filters.</td>
                </tr>
              )}
            </tbody>
            {filteredTxs.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-right font-bold text-gray-800">Total</td>
                  <td className="text-right font-bold text-gray-900 text-base">₹{totalPrice.toLocaleString("en-IN")}</td>
                  <td className="text-right px-6 font-serif font-bold text-emerald-700 text-lg">₹{totalCommission.toLocaleString("en-IN")}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
            <span className="text-xs text-gray-500">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredTxs.length)} of {filteredTxs.length} entries
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-200 text-xs font-bold disabled:opacity-50 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-xs font-bold bg-eminence-gold/10 text-eminence-gold rounded">
                {page}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded border border-gray-200 text-xs font-bold disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SalesEmployeeReportsPanel({ reportsData, employees }) {
  const salesData = reportsData.filter(emp => emp.role === "sales" || emp.role === "employee");

  // Summaries
  const totalLeads = salesData.reduce((sum, emp) => sum + (emp.assigned_leads || 0), 0);
  const totalConversions = salesData.reduce((sum, emp) => sum + (emp.converted_leads || 0), 0);
  const avgConversion = totalLeads ? Math.round((totalConversions / totalLeads) * 100) : 0;
  const totalSales = salesData.reduce((sum, emp) => sum + (emp.total_sales || 0), 0);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center">
        <div>
          <h2 className="font-serif text-2xl text-gray-800">Sales Employee Performance Analysis</h2>
          <p className="text-xs text-eminence-muted">Real-time analysis of leads, conversion rates, and sales targets for the sales team.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <p className="overline mb-1 text-eminence-gold font-bold text-[10px]">Total Assigned Leads</p>
          <p className="text-3xl font-serif text-gray-950 mt-1">{totalLeads}</p>
        </div>
        <div className="glass-card p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <p className="overline mb-1 text-emerald-600 font-bold text-[10px]">Total Conversions</p>
          <p className="text-3xl font-serif text-emerald-850 mt-1">{totalConversions}</p>
        </div>
        <div className="glass-card p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <p className="overline mb-1 text-purple-600 font-bold text-[10px]">Avg. Conversion Rate</p>
          <p className="text-3xl font-serif text-purple-850 mt-1">{avgConversion}%</p>
        </div>
        <div className="glass-card p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <p className="overline mb-1 text-sky-600 font-bold text-[10px]">Total Sales Vol.</p>
          <p className="text-3xl font-serif text-sky-850 mt-1">₹{totalSales.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="eminence-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-eminence-border py-3 text-left overline text-eminence-muted">
                <th className="px-6 py-4">Employee Name</th>
                <th>Branch / Section</th>
                <th>Assigned Leads</th>
                <th>Calls Made</th>
                <th>Visited Clients</th>
                <th>Conversions</th>
                <th>Conversion Rate</th>
                <th>Visited to Conversion</th>
                <th>Sales Volume</th>
                <th>Target Achievement</th>
              </tr>
            </thead>
            <tbody>
              {salesData.map((emp) => {
                const target = emp.monthly_target || 100000;
                const achievement = Math.round((emp.monthly_sales / target) * 100);
                const progressWidth = Math.min(achievement, 100);
                const visitedToConvRate = emp.visited_leads ? ((emp.converted_leads / emp.visited_leads) * 100).toFixed(1) : "0.0";

                return (
                  <tr key={emp.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-950">{emp.name}</div>
                      <div className="text-[10px] text-eminence-muted uppercase">{emp.email}</div>
                    </td>
                    <td>
                      <div className="text-xs font-semibold text-gray-700">{emp.branch}</div>
                      <div className="text-[10px] text-eminence-muted">{emp.section}</div>
                    </td>
                    <td className="font-semibold text-gray-950">{emp.assigned_leads}</td>
                    <td className="text-gray-600">{emp.total_calls}</td>
                    <td className="text-indigo-700 font-bold">{emp.visited_leads || 0}</td>
                    <td className="text-emerald-700 font-bold">{emp.converted_leads}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{emp.conversion_rate}%</span>
                        <div className="w-16 bg-gray-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
                          <div className="bg-purple-600 h-full" style={{ width: `${emp.conversion_rate}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-800">{visitedToConvRate}%</span>
                        <div className="w-16 bg-emerald-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                          <div className="bg-emerald-600 h-full" style={{ width: `${Math.min(Number(visitedToConvRate), 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="font-bold text-gray-950">₹{emp.total_sales.toLocaleString("en-IN")}</td>
                    <td>
                      <div className="space-y-1 py-1 pr-4 min-w-[140px]">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span>₹{emp.monthly_sales.toLocaleString("en-IN")} / ₹{target.toLocaleString("en-IN")}</span>
                          <span className={achievement >= 100 ? "text-emerald-600" : "text-eminence-gold"}>{achievement}%</span>
                        </div>
                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${achievement >= 100 ? "bg-emerald-600" : "bg-eminence-gold"}`}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {salesData.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center py-10 text-eminence-muted italic">No sales employee statistics computed yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PendingPaymentsPanel({ orders, refresh }) {
  const pendingOrders = orders.filter(o => o.status === "placed" || o.status === "pending");

  const markPaid = async (id) => {
    try {
      await api.patch(`/admin/orders/${id}`, { status: "delivered" });
      toast.success("Payment verified and order status updated to delivered!");
      refresh();
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h2 className="font-serif text-2xl text-gray-800">Unpaid / Pending Collections</h2>
        <p className="text-xs text-eminence-muted">Track salon bookings and orders with outstanding balances.</p>
      </div>

      <div className="eminence-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-eminence-border text-left overline text-eminence-muted">
              <th className="px-6 py-4">Order ID</th>
              <th>Customer</th>
              <th>Contact</th>
              <th>Total Amount</th>
              <th>Date Placed</th>
              <th className="text-right px-6">Action</th>
            </tr>
          </thead>
          <tbody>
            {pendingOrders.map(o => (
              <tr key={o.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                <td className="px-6 py-4 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                <td className="font-bold">{o.full_name || o.user_name}</td>
                <td>{o.phone || "—"}</td>
                <td className="font-semibold text-rose-600">₹{o.total.toLocaleString("en-IN")}</td>
                <td>{o.created_at?.split("T")[0]}</td>
                <td className="text-right px-6">
                  <button onClick={() => markPaid(o.id)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors">
                    Confirm Receipt
                  </button>
                </td>
              </tr>
            ))}
            {pendingOrders.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-12 text-eminence-muted italic">All accounts are settled! No pending payments.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryReportsPanel({ orders, expenses }) {
  const combined = [
    ...orders.map(o => ({ id: o.id, type: "Bill", title: `Bill created for ${o.full_name}`, amount: o.total, date: o.created_at?.split("T")[0] || "" })),
    ...expenses.map(e => ({ id: e.id, type: "Expense", title: `Expense recorded: ${e.description}`, amount: -e.amount, date: e.date }))
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="eminence-card p-6">
        <h3 className="font-serif text-2xl mb-4">Operations Chronology</h3>
        <p className="text-xs text-eminence-muted mb-6">Audited historical ledger of revenue actions and expenses in chronological order.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-eminence-border py-2 text-left overline text-eminence-muted">
                <th className="py-3">Date</th>
                <th>Type</th>
                <th>Event Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {combined.slice(0, 50).map(item => (
                <tr key={item.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                  <td className="py-3">{item.date}</td>
                  <td>
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${item.type === "Bill" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"
                      }`}>
                      {item.type}
                    </span>
                  </td>
                  <td>{item.title}</td>
                  <td className={`font-semibold ${item.amount > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {item.amount > 0 ? "+" : ""}₹{item.amount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FinanceReportsPanel({ orders = [], expenses = [], leads = [], stats = null, t }) {
  const [filterPeriod, setFilterPeriod] = useState("THIS_MONTH");
  const [customFromDate, setCustomFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [customToDate, setCustomToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState("ALL");
  const [selectedDailyDetail, setSelectedDailyDetail] = useState(null);

  const todayStr = new Date().toISOString().split("T")[0];

  const getRange = () => {
    let start = "";
    let end = todayStr;
    const now = new Date();

    if (filterPeriod === "THIS_MONTH") {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      start = `${y}-${m}-01`;
      end = todayStr;
    } else if (filterPeriod === "LAST_MONTH") {
      let y = now.getFullYear();
      let m = now.getMonth(); // previous month (0-11)
      if (m === 0) {
        m = 12;
        y -= 1;
      }
      const mStr = String(m).padStart(2, "0");
      start = `${y}-${mStr}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      end = `${y}-${mStr}-${String(lastDay).padStart(2, "0")}`;
    } else if (filterPeriod === "LAST_30_DAYS") {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      start = d30.toISOString().split("T")[0];
      end = todayStr;
    } else if (filterPeriod === "LAST_90_DAYS") {
      const d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      start = d90.toISOString().split("T")[0];
      end = todayStr;
    } else if (filterPeriod === "CUSTOM") {
      start = customFromDate || "1970-01-01";
      end = customToDate || todayStr;
    }
    return { start, end };
  };

  const { start, end } = getRange();

  const isWithinFilterRange = (dateStr) => {
    if (filterPeriod === "ALL_TIME") return true;
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    return d >= start && d <= end;
  };

  const filteredOrders = orders.filter(o => o.status !== "cancelled" && isWithinFilterRange(o.created_at));
  const filteredExpenses = expenses.filter(e => isWithinFilterRange(e.date || e.created_at));

  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalExpense = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpense;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const averageOrder = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
  const averageExpense = filteredExpenses.length > 0 ? totalExpense / filteredExpenses.length : 0;

  // Breakdown of Revenue (Services/Packages vs Salon Products vs E-Commerce Website Orders)
  let serviceRevenue = 0;
  let salesRevenue = 0;
  let websiteRevenue = 0;

  filteredOrders.forEach(o => {
    const total = Number(o.total) || 0;
    if (total <= 0) return;

    const notes = (o.notes || "").toUpperCase();
    const isWebsiteOrder = o.source === "website" || o.order_type === "website" || notes.includes("WEBSITE") || (!o.branch && !o.created_by && !o.stylist_name && !notes.includes("BILLING"));

    if (isWebsiteOrder) {
      websiteRevenue += total;
      return;
    }

    const items = o.items || [];
    let productItemsTotal = 0;
    let serviceItemsTotal = 0;

    items.forEach(it => {
      const itype = (it.type || it.item_type || "").toLowerCase();
      const price = Number(it.price || it.total || it.item_price || 0);
      const qty = Number(it.qty || it.quantity || 1);
      const itemSubtotal = price * qty;

      if (itype === "product") {
        productItemsTotal += itemSubtotal;
      } else if (itype === "service" || itype === "package") {
        serviceItemsTotal += itemSubtotal;
      }
    });

    if (productItemsTotal > 0 || serviceItemsTotal > 0) {
      const itemsSum = productItemsTotal + serviceItemsTotal;
      if (itemsSum > 0) {
        salesRevenue += (productItemsTotal / itemsSum) * total;
        serviceRevenue += (serviceItemsTotal / itemsSum) * total;
      } else {
        serviceRevenue += total;
      }
    } else {
      if (notes.includes("SALES BILLING")) {
        salesRevenue += total;
      } else {
        serviceRevenue += total;
      }
    }
  });

  // Group expenses by category
  const expenseByCat = {};
  filteredExpenses.forEach(e => {
    const cat = e.category || "Other";
    expenseByCat[cat] = (expenseByCat[cat] || 0) + (e.amount || 0);
  });
  const sortedExpensesByCat = Object.entries(expenseByCat)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  // Group payment methods
  const paymentModeTotals = {};
  filteredOrders.forEach(o => {
    if (o.split_payments && o.split_payments.length > 0) {
      o.split_payments.forEach(p => {
        const modeName = p.method || "Unknown";
        const amt = Number(p.amount) || 0;
        paymentModeTotals[modeName] = (paymentModeTotals[modeName] || 0) + amt;
      });
    } else {
      let mode = "Website Order";
      if (o.payment_method) {
        mode = o.payment_method;
      } else if (o.notes) {
        const match = o.notes.match(/Payment:\s*([^|(\n\r]+)/i);
        if (match) {
          mode = match[1].split("(")[0].trim();
        } else if (o.notes.includes("SERVICE BILLING") || o.notes.includes("COMBINED BILLING") || o.notes.includes("SALES BILLING")) {
          mode = "Other Salon Payment";
        }
      }
      paymentModeTotals[mode] = (paymentModeTotals[mode] || 0) + (o.total || 0);
    }
  });
  const sortedPaymentModes = Object.entries(paymentModeTotals)
    .map(([mode, amount]) => ({
      mode,
      amount,
      percentage: totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  // Group last 6 months cash flow
  const getTrendData = () => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString("en-US", { month: "short", year: "numeric" });
      const yearMonth = d.toISOString().slice(0, 7);
      months.push({ yearMonth, monthName, revenue: 0, expenses: 0 });
    }
    orders.forEach(o => {
      if (o.status === "cancelled") return;
      const yMonth = o.created_at?.slice(0, 7);
      const mObj = months.find(m => m.yearMonth === yMonth);
      if (mObj) mObj.revenue += o.total || 0;
    });
    expenses.forEach(e => {
      const yMonth = (e.date || e.created_at)?.slice(0, 7);
      const mObj = months.find(m => m.yearMonth === yMonth);
      if (mObj) mObj.expenses += e.amount || 0;
    });
    return months;
  };
  const trendData = getTrendData();

  const getTodayDateStr = () => {
    // Use IST (UTC+5:30) to match server-side date calculations
    const d = new Date();
    const istOffset = 5 * 60 + 30; // minutes
    const utcMs = d.getTime() + (d.getTimezoneOffset() * 60 * 1000);
    const istMs = utcMs + (istOffset * 60 * 1000);
    return new Date(istMs).toISOString().slice(0, 10);
  };
  const todayDateStr = getTodayDateStr();
  const todayLeads = leads.filter(l => l.created_at?.slice(0, 10) === todayDateStr);
  const dailyLeadsCount = todayLeads.length;

  // Combine into unified transaction ledger
  const ledger = [
    ...filteredOrders.map(o => {
      let subType = "E-commerce Order";
      if (o.notes?.includes("SERVICE BILLING") || o.notes?.includes("COMBINED BILLING")) subType = "Service Billing";
      else if (o.notes?.includes("SALES BILLING")) subType = "Salon Product Sale";
      return {
        id: o.id,
        date: o.created_at?.slice(0, 10) || "",
        timestamp: o.created_at || "",
        type: "Revenue",
        subType,
        description: `Billing client ${o.full_name || o.user_name || "Guest User"}`,
        amount: o.total || 0
      };
    }),
    ...filteredExpenses.map(e => ({
      id: e.id,
      date: e.date || e.created_at?.slice(0, 10) || "",
      timestamp: e.created_at || "",
      type: "Expense",
      subType: e.category || "Other",
      description: e.description?.trim() || "Salon operating cost",
      amount: e.amount || 0
    }))
  ].sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

  const filteredLedger = ledger.filter(item => {
    const matchType = ledgerTypeFilter === "ALL" ||
      (ledgerTypeFilter === "REVENUE" && item.type === "Revenue") ||
      (ledgerTypeFilter === "EXPENSE" && item.type === "Expense");
    const matchSearch = searchQuery === "" ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(item.amount).includes(searchQuery);
    return matchType && matchSearch;
  });

  const downloadCSV = () => {
    const headers = ["Date", "Type", "Category", "Description", "Amount (₹)", "Flow"];
    const rows = ledger.map(item => [
      item.date,
      item.type,
      item.subType,
      item.description.replace(/,/g, " "),
      item.amount,
      item.type === "Revenue" ? "Inflow" : "Outflow"
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `finance_ledger_${filterPeriod}_${start}_to_${end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const periodPill = (type, label) => (
    <button
      onClick={() => setFilterPeriod(type)}
      className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${filterPeriod === type
        ? "bg-eminence-gold text-white shadow-md scale-105"
        : "bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-gray-100"
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-serif text-2xl text-gray-900">Financial Analytics</h2>
        <p className="text-xs text-eminence-muted">Track salon revenue, operating expenses, cash flow trends, and transaction history.</p>
      </div>

      {/* Date Filtering Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {periodPill("THIS_MONTH", "This Month")}
          {periodPill("LAST_MONTH", "Last Month")}
          {periodPill("LAST_30_DAYS", "Last 30 Days")}
          {periodPill("LAST_90_DAYS", "Last 90 Days")}
          {periodPill("ALL_TIME", "All Time")}
          {periodPill("CUSTOM", "Custom Range")}
        </div>

        {filterPeriod === "CUSTOM" && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-1 duration-200">
            <input
              type="date"
              value={customFromDate}
              onChange={e => setCustomFromDate(e.target.value)}
              className="bg-eminence-surface border border-eminence-border rounded-lg px-3 py-1.5 text-xs text-eminence-text focus:outline-none focus:border-eminence-gold"
            />
            <span className="text-xs text-eminence-muted font-bold">TO</span>
            <input
              type="date"
              value={customToDate}
              onChange={e => setCustomToDate(e.target.value)}
              className="bg-eminence-surface border border-eminence-border rounded-lg px-3 py-1.5 text-xs text-eminence-text focus:outline-none focus:border-eminence-gold"
            />
          </div>
        )}
      </div>

      {/* KPI Stats Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-eminence-gold flex flex-col justify-between bg-white shadow-sm border border-gray-100 relative overflow-hidden group">
          <div>
            <p className="overline text-[10px] text-eminence-gold font-bold mb-1">Gross Revenue</p>
            <h3 className="font-serif text-3xl text-gray-900">₹{totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="mt-4 pt-4 border-t border-eminence-border/10 flex justify-between items-center text-xs text-eminence-muted">
            <span>Orders count: {filteredOrders.length}</span>
            <span>Avg: ₹{averageOrder.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-rose-500 flex flex-col justify-between bg-white shadow-sm border border-gray-100 relative overflow-hidden group">
          <div>
            <p className="overline text-[10px] text-rose-500 font-bold mb-1">Total Operating Expenses</p>
            <h3 className="font-serif text-3xl text-rose-700">₹{totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="mt-4 pt-4 border-t border-eminence-border/10 flex justify-between items-center text-xs text-eminence-muted">
            <span>Vouchers count: {filteredExpenses.length}</span>
            <span>Avg: ₹{averageExpense.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        <div className={`glass-card p-6 rounded-2xl border-l-4 flex flex-col justify-between bg-white shadow-sm border border-gray-100 relative overflow-hidden group ${netProfit >= 0 ? "border-l-emerald-500" : "border-l-red-600 bg-rose-50/10"}`}>
          <div>
            <p className={`overline text-[10px] font-bold mb-1 ${netProfit >= 0 ? "text-emerald-600" : "text-red-700"}`}>
              {netProfit >= 0 ? "Net Profit" : "Net Operating Loss"}
            </p>
            <h3 className={`font-serif text-3xl ${netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              ₹{netProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-eminence-border/10 flex justify-between items-center text-xs text-eminence-muted">
            <span>Operating balance</span>
            <span className={`font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {netProfit >= 0 ? "PROFITABLE" : "OVER SPENT"}
            </span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl border-l-4 border-l-indigo-500 flex flex-col justify-between bg-white shadow-sm border border-gray-100 relative overflow-hidden group">
          <div>
            <p className="overline text-[10px] text-indigo-500 font-bold mb-1">Profit Margin</p>
            <h3 className="font-serif text-3xl text-indigo-700">{profitMargin.toFixed(1)}%</h3>
          </div>
          <div className="mt-4 pt-4 border-t border-eminence-border/10 flex justify-between items-center text-xs text-eminence-muted">
            <span>Net / Gross ratio</span>
            <div className="w-16 bg-gray-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full"
                style={{ width: `${Math.min(100, Math.max(0, profitMargin))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Cash Flow Trend Chart */}
      <div className="eminence-card p-8 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-eminence-border/10 pb-4">
          <div>
            <h3 className="font-serif text-2xl text-gray-800">Monthly Cash Flow Trend</h3>
            <p className="text-xs text-eminence-muted">Comparative view of revenue vs operating expenses over the last 6 months</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-emerald-500 rounded" />
              <span className="text-eminence-muted">Revenue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-rose-500 rounded" />
              <span className="text-eminence-muted">Expenses</span>
            </div>
          </div>
        </div>

        <div className="pt-6 flex justify-between items-end h-[240px] px-4 md:px-10 gap-2 overflow-x-auto">
          {trendData.map(month => {
            const maxVal = Math.max(...trendData.map(m => Math.max(m.revenue, m.expenses)), 1);
            const revHeight = (month.revenue / maxVal) * 100;
            const expHeight = (month.expenses / maxVal) * 100;
            const mProfit = month.revenue - month.expenses;

            return (
              <div key={month.yearMonth} className="flex-1 flex flex-col items-center min-w-[80px] group">
                <div className="w-full flex items-end justify-center gap-1.5 h-[160px] relative pb-2 border-b border-eminence-border/15">
                  {/* Revenue Bar */}
                  <div
                    className="w-5 bg-emerald-500 hover:bg-emerald-600 rounded-t-sm transition-all duration-500 relative cursor-pointer"
                    style={{ height: `${revHeight}%` }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-md">
                      Rev: ₹{month.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </div>
                  </div>

                  {/* Expense Bar */}
                  <div
                    className="w-5 bg-rose-500 hover:bg-rose-600 rounded-t-sm transition-all duration-500 relative cursor-pointer"
                    style={{ height: `${expHeight}%` }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-md">
                      Exp: ₹{month.expenses.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>

                <span className="text-[10px] text-gray-800 font-bold mt-2">{month.monthName}</span>
                <span className={`text-[10px] font-mono font-bold mt-0.5 ${mProfit >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                  {mProfit >= 0 ? "+" : "-"}₹{Math.abs(mProfit).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Analytics Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Stream Analysis */}
        <div className="eminence-card p-8 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-eminence-border/10 pb-4">
            <h3 className="font-serif text-2xl text-gray-800">Revenue Streams</h3>
            <span className="text-[10px] font-bold text-eminence-gold border border-eminence-gold/30 px-2 py-0.5 rounded-full uppercase">Inflow</span>
          </div>

          <div className="space-y-6 pt-2">
            {[
              { label: "Service Billing", amount: serviceRevenue, color: "bg-emerald-500" },
              { label: "Salon Product Sales", amount: salesRevenue, color: "bg-eminence-gold" },
              { label: "E-commerce Orders", amount: websiteRevenue, color: "bg-indigo-500" }
            ].map(item => {
              const pct = totalRevenue > 0 ? (item.amount / totalRevenue) * 100 : 0;
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700 text-xs">{item.label}</span>
                    <span className="font-serif text-gray-900 font-bold text-xs">
                      ₹{item.amount.toLocaleString("en-IN")} <span className="text-[10px] text-eminence-muted font-sans font-normal">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`${item.color} h-full transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {totalRevenue === 0 && (
              <p className="text-xs italic text-eminence-muted text-center py-6">No revenue logs in this date range.</p>
            )}
          </div>
        </div>

        {/* Payment Method Distribution */}
        <div className="eminence-card p-8 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-eminence-border/10 pb-4">
            <h3 className="font-serif text-2xl text-gray-800">Payment Methods</h3>
            <span className="text-[10px] font-bold text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full uppercase bg-emerald-50/50">Receipts</span>
          </div>

          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
            {sortedPaymentModes.map(item => (
              <div key={item.mode} className="space-y-1">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-xs uppercase tracking-wider text-eminence-muted font-bold">{item.mode}</span>
                  <span className="font-serif text-gray-900 font-bold text-xs">
                    ₹{item.amount.toLocaleString("en-IN")} <span className="text-[10px] text-eminence-muted font-sans font-normal">({item.percentage.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-700"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {sortedPaymentModes.length === 0 && (
              <p className="text-xs italic text-eminence-muted text-center py-10">No payments registered in this range.</p>
            )}
          </div>
        </div>

        {/* Expense Category Analysis */}
        <div className="eminence-card p-8 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-eminence-border/10 pb-4">
            <h3 className="font-serif text-2xl text-gray-800">Expenses</h3>
            <span className="text-[10px] font-bold text-red-500 border border-red-200 px-2 py-0.5 rounded-full uppercase bg-red-50/50">Outflow</span>
          </div>

          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
            {sortedExpensesByCat.map(item => (
              <div key={item.category} className="space-y-1">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-xs uppercase tracking-wider text-eminence-muted font-bold">{item.category}</span>
                  <span className="font-serif text-gray-900 font-bold text-xs">
                    ₹{item.amount.toLocaleString("en-IN")} <span className="text-[10px] text-eminence-muted font-sans font-normal">({item.percentage.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-500 h-full transition-all duration-700"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {sortedExpensesByCat.length === 0 && (
              <p className="text-xs italic text-eminence-muted text-center py-10">No expenses logged in this date range.</p>
            )}
          </div>
        </div>
      </div>

      {/* Combined Transaction History Ledger */}
      <div className="eminence-card bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Ledger Toolbar */}
        <div className="p-6 border-b border-eminence-border/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="font-serif text-2xl text-gray-800">Unified Transaction Ledger</h3>
            <p className="text-xs text-eminence-muted">Chronological cash flow list showing all salon revenues and expense bills</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search description, code..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-eminence-border rounded-lg text-xs bg-eminence-surface focus:outline-none focus:border-eminence-gold min-w-[200px]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
              )}
            </div>

            {/* Type Filters */}
            <div className="flex bg-eminence-surface rounded-lg p-0.5 border border-eminence-border">
              {["ALL", "REVENUE", "EXPENSE"].map(mode => (
                <button
                  key={mode}
                  onClick={() => setLedgerTypeFilter(mode)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${ledgerTypeFilter === mode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-eminence-muted hover:text-gray-800"
                    }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Export CSV Button */}
            <button
              onClick={downloadCSV}
              className="flex items-center gap-1.5 border border-eminence-border bg-white hover:bg-eminence-surface px-3 py-2 rounded-lg text-xs font-bold text-gray-700 transition-all"
            >
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-[10px] text-eminence-muted uppercase tracking-wider bg-eminence-surface/30 border-b border-eminence-border/10">
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Description</th>
                <th className="px-6 py-3.5 text-right">Flow</th>
                <th className="px-6 py-3.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((item, index) => {
                const isRevenue = item.type === "Revenue";
                return (
                  <tr key={`${item.id}-${index}`} className="border-b border-eminence-border/10 hover:bg-eminence-surface/10 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{item.date}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-bold ${isRevenue ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-100"}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700 text-xs">{item.subType}</td>
                    <td className="px-6 py-4 text-xs text-gray-500 max-w-sm truncate">{item.description}</td>
                    <td className="px-6 py-4 text-right">
                      {isRevenue ? (
                        <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Inflow</span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Outflow</span>
                      )}
                    </td>
                    <td className={`px-6 py-4 text-right font-serif font-bold text-sm ${isRevenue ? "text-emerald-700" : "text-red-700"}`}>
                      {isRevenue ? "+" : "-"} ₹{item.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {filteredLedger.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-20 text-sm italic text-eminence-muted bg-eminence-surface/5">
                    No transactions match search criteria or selected date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BalanceReportsPanel({ orders, expenses }) {
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const netBalance = totalRevenue - totalExpense;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-8 rounded-2xl bg-white border border-gray-100">
          <p className="overline mb-1 text-eminence-gold font-bold">Total Salon Revenue</p>
          <p className="text-4xl font-serif text-gray-900">₹{totalRevenue.toLocaleString("en-IN")}</p>
        </div>
        <div className="glass-card p-8 rounded-2xl bg-white border border-gray-100">
          <p className="overline mb-1 text-red-500 font-bold">Total Operating Expenses</p>
          <p className="text-4xl font-serif text-red-700">₹{totalExpense.toLocaleString("en-IN")}</p>
        </div>
        <div className="glass-card p-8 rounded-2xl bg-white border border-gray-100">
          <p className="overline mb-1 text-emerald-600 font-bold">Net Operating Balance</p>
          <p className="text-4xl font-serif text-emerald-800">₹{netBalance.toLocaleString("en-IN")}</p>
        </div>
      </div>
    </div>
  );
}

function AdvanceReportsPanel({ stats, orders, employees, expenses, usages, reportsData, refresh, vendors = [], stockLogs = [], products = [], services = [] }) {
  const [advanceTab, setAdvanceTab] = useState("REPORTS");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");

  // Job Card Specific State
  const [jobCardProviderId, setJobCardProviderId] = useState("");

  // Expense Report Specific States
  const [expenseTypeFilter, setExpenseTypeFilter] = useState("");
  const [expensePayModeFilter, setExpensePayModeFilter] = useState("");

  // GST Report State
  const [taxTypeFilter, setTaxTypeFilter] = useState("");

  // Service Sales Report States
  const [itemTypeFilter, setItemTypeFilter] = useState("");
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState("");

  // Product Purchase State
  const [vendorFilter, setVendorFilter] = useState("");

  // Product Usage States
  const [usageClientFilter, setUsageClientFilter] = useState("");
  const [usageProductFilter, setUsageProductFilter] = useState("");
  const [usageEmployeeFilter, setUsageEmployeeFilter] = useState("");
  const [usageUsedFromFilter, setUsageUsedFromFilter] = useState("");

  // Membership Report States
  const [membershipFilter, setMembershipFilter] = useState("");
  const [membershipClientFilter, setMembershipClientFilter] = useState("");
  const [membershipTypeFilter, setMembershipTypeFilter] = useState("");

  // Upsell Report States
  const [upsellClientFilter, setUpsellClientFilter] = useState("");
  const [upsellProviderFilter, setUpsellProviderFilter] = useState("");

  // Product Sales Specific States
  const [productSalesProductFilter, setProductSalesProductFilter] = useState("");
  const [productSalesClientFilter, setProductSalesClientFilter] = useState("");

  const ADVANCE_TABS = [
    "REPORTS", "SALES REPORT", "EMPLOYEE", "JOB CARD", "COLLECTION",
    "EXPENSE", "GST REPORT", "SERVICE SALES", "PRODUCT PURCHASE",
    "PRODUCT SALES", "PRODUCT USAGE", "MEMBERSHIP", "UPSELL", "WALLET RECHARGE"
  ];

  // Helper date filter
  const filterByDate = (dateStr) => {
    if (!dateStr) return false;
    const cleanDate = dateStr.split("T")[0];
    return cleanDate >= fromDate && cleanDate <= toDate;
  };

  const filteredOrders = orders.filter(o => filterByDate(o.created_at) &&
    ((o.full_name || o.user_name || "").toLowerCase().includes(search.toLowerCase()) || o.id?.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredExpenses = expenses.filter(e => {
    const matchesDate = filterByDate(e.date);
    const matchesSearch = search ? e.description?.toLowerCase().includes(search.toLowerCase()) : true;
    const matchesType = expenseTypeFilter ? e.category === expenseTypeFilter : true;
    const matchesPayMode = expensePayModeFilter ? e.payment_mode === expensePayModeFilter : true;
    return matchesDate && matchesSearch && matchesType && matchesPayMode;
  });

  const uniqueUpsellClients = React.useMemo(() => {
    const clientsSet = new Set();
    orders.forEach(o => {
      const name = o.full_name || o.user_name;
      if (name) clientsSet.add(name);
    });
    return Array.from(clientsSet).sort();
  }, [orders]);

  const upsellRecords = React.useMemo(() => {
    const records = [];
    orders.forEach(o => {
      if (!filterByDate(o.created_at)) return;
      if (search && !((o.full_name || o.user_name || "").toLowerCase().includes(search.toLowerCase()) || o.id?.toLowerCase().includes(search.toLowerCase()))) {
        return;
      }
      o.items?.forEach(it => {
        const isProd = it.type === "product" || (!it.is_service && !it.is_package);
        if (isProd) {
          records.push({
            orderId: o.id,
            date: o.created_at ? o.created_at.split("T")[0] : "Unknown",
            clientName: o.full_name || o.user_name || "Unknown",
            contactNumber: o.phone || "—",
            productName: it.name,
            providerId: it.service_provider || o.employee_id || "—",
            amount: (it.price || 0) * (it.quantity || 1),
            quantity: it.quantity || 1
          });
        }
      });
    });
    return records;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, fromDate, toDate, search]);

  const filteredUpsellRecords = React.useMemo(() => {
    return upsellRecords.filter(item => {
      const emp = employees.find(e => e.id === item.providerId);
      item.providerName = emp ? emp.name : item.providerId;

      const matchesClient = upsellClientFilter ? item.clientName === upsellClientFilter : true;
      const matchesProvider = upsellProviderFilter ? item.providerId === upsellProviderFilter : true;
      return matchesClient && matchesProvider;
    });
  }, [upsellRecords, upsellClientFilter, upsellProviderFilter, employees]);

  const filteredGstOrders = React.useMemo(() => {
    return filteredOrders.filter(o => {
      if (taxTypeFilter) {
        if (taxTypeFilter === "Exclusive") return false;
      }
      return true;
    });
  }, [filteredOrders, taxTypeFilter]);

  const serviceSalesRecords = React.useMemo(() => {
    const records = [];
    filteredOrders.forEach(o => {
      o.items?.forEach(it => {
        const currentType = it.type || (it.is_service ? "service" : (it.is_package ? "package" : "product"));
        if (itemTypeFilter) {
          if (itemTypeFilter.toLowerCase() !== currentType.toLowerCase()) return;
        } else {
          if (currentType !== "service") return;
        }
        if (serviceCategoryFilter && serviceCategoryFilter !== "--All--") {
          const itemCategory = it.category || services.find(s => s.name === it.name)?.category || products.find(p => p.name === it.name)?.category || "—";
          if (itemCategory !== serviceCategoryFilter) return;
        }
        records.push({
          date: o.created_at ? o.created_at.split("T")[0] : "—",
          name: it.name,
          category: it.category || services.find(s => s.name === it.name)?.category || "—",
          packageServices: it.package_deducted ? "Yes" : "No",
          totalServices: it.quantity || 1,
          price: it.price || 0,
          discount: it.discount || 0,
          revenue: (it.price || 0) * (it.quantity || 1) - (it.discount || 0)
        });
      });
    });
    return records;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, itemTypeFilter, serviceCategoryFilter, services, products]);

  const filteredStockLogs = React.useMemo(() => {
    return stockLogs.filter(log => {
      if (!filterByDate(log.created_at)) return false;
      if (vendorFilter && log.vendor_name !== vendorFilter && log.vendor_id !== vendorFilter) return false;
      if (search && !(log.product_name?.toLowerCase().includes(search.toLowerCase()) || log.invoice_no?.toLowerCase().includes(search.toLowerCase()))) {
        return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockLogs, fromDate, toDate, vendorFilter, search]);

  const uniqueProductNames = React.useMemo(() => {
    const names = new Set();
    orders.forEach(o => {
      o.items?.forEach(it => {
        if (it.type === "product") names.add(it.name);
      });
    });
    return Array.from(names).sort();
  }, [orders]);

  const productSalesRecords = React.useMemo(() => {
    const records = [];
    filteredOrders.forEach(o => {
      o.items?.forEach(it => {
        if (it.type !== "product") return;
        if (productSalesProductFilter && it.name !== productSalesProductFilter) return;
        if (productSalesClientFilter && (o.full_name || o.user_name) !== productSalesClientFilter) return;
        records.push({
          date: o.created_at ? o.created_at.split("T")[0] : "—",
          orderId: o.id,
          clientName: o.full_name || o.user_name || "Unknown",
          productName: it.name,
          unit: "Pcs",
          unitPrice: it.price || 0,
          qty: it.quantity || 1,
          total: (it.price || 0) * (it.quantity || 1),
          discount: it.discount || 0,
          subtotal: (it.price || 0) * (it.quantity || 1) - (it.discount || 0),
          tax: ((it.price || 0) * (it.quantity || 1) - (it.discount || 0)) * 0.18,
          grandTotal: ((it.price || 0) * (it.quantity || 1) - (it.discount || 0)) * 1.18,
          paymentMethod: o.payment_method || "—",
          soldBy: it.service_provider || o.employee_name || "—"
        });
      });
    });
    return records;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, productSalesProductFilter, productSalesClientFilter]);

  const uniqueUsageProducts = React.useMemo(() => {
    return Array.from(new Set(usages.map(u => u.product_name).filter(Boolean))).sort();
  }, [usages]);

  const uniqueUsageClients = React.useMemo(() => {
    return Array.from(new Set(usages.map(u => u.client_name || u.employee_name).filter(Boolean))).sort();
  }, [usages]);

  const uniqueUsageEmployees = React.useMemo(() => {
    return Array.from(new Set(usages.map(u => u.employee_name).filter(Boolean))).sort();
  }, [usages]);

  const filteredUsages = React.useMemo(() => {
    return usages.filter(u => {
      if (!filterByDate(u.timestamp || u.created_at)) return false;
      if (usageClientFilter && u.client_name !== usageClientFilter && u.employee_name !== usageClientFilter) return false;
      if (usageProductFilter && u.product_name !== usageProductFilter) return false;
      if (usageEmployeeFilter && u.employee_name !== usageEmployeeFilter) return false;
      if (usageUsedFromFilter && u.remarks !== usageUsedFromFilter) return false;
      if (search && !(u.product_name?.toLowerCase().includes(search.toLowerCase()) || u.employee_name?.toLowerCase().includes(search.toLowerCase()))) {
        return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usages, fromDate, toDate, usageClientFilter, usageProductFilter, usageEmployeeFilter, usageUsedFromFilter, search]);

  const handleClearFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setFromDate(d.toISOString().split("T")[0]);
    setToDate(new Date().toISOString().split("T")[0]);
    setSearch("");
    setJobCardProviderId("");
    setExpenseTypeFilter("");
    setExpensePayModeFilter("");
    setTaxTypeFilter("");
    setItemTypeFilter("");
    setServiceCategoryFilter("");
    setVendorFilter("");
    setUsageClientFilter("");
    setUsageProductFilter("");
    setUsageEmployeeFilter("");
    setUsageUsedFromFilter("");
    setMembershipFilter("");
    setMembershipClientFilter("");
    setMembershipTypeFilter("");
    setUpsellClientFilter("");
    setUpsellProviderFilter("");
    setProductSalesProductFilter("");
    setProductSalesClientFilter("");
  };

  const handleExport = () => {
    toast.success("Report data exported successfully to CSV!");
  };

  const handlePrint = () => {
    window.print();
  };

  const formatNumber = (num) => {
    if (num === undefined || num === null || isNaN(num)) return "0.00";
    return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const renderDateRangePickerInline = () => {
    return (
      <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded px-2.5 py-1.5 shadow-sm text-gray-700 font-medium">
        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="focus:outline-none border-none p-0 text-xs text-gray-700 bg-transparent w-[115px] cursor-pointer"
        />
        <span className="text-gray-400 font-semibold px-0.5">-</span>
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="focus:outline-none border-none p-0 text-xs text-gray-700 bg-transparent w-[115px] cursor-pointer"
        />
      </div>
    );
  };

  // 1. SALES REPORT - Grouped by Date (Ascending to match image)
  const salesByDate = {};
  filteredOrders.forEach(o => {
    const dateStr = o.created_at ? o.created_at.split("T")[0] : "Unknown";
    let displayDate = dateStr;
    try {
      const [y, m, d] = dateStr.split("-");
      if (y && m && d) displayDate = `${d}-${m}-${y}`;
    } catch (e) { }

    if (!salesByDate[displayDate]) {
      salesByDate[displayDate] = {
        date: displayDate,
        rawDate: dateStr,
        service_amount: 0,
        product_amount: 0,
        package_amount: 0,
        membership_amount: 0,
        wallet_amount: 0,
        appointment_advance: 0,
        tax_inclusive: 0,
        tax_exclusive: 0,
        discount: 0,
        total: 0
      };
    }

    let serviceAmt = 0;
    let productAmt = 0;
    let packageAmt = 0;
    let membershipAmt = 0;

    o.items?.forEach(it => {
      const price = (it.price || 0) * (it.quantity || 1);
      if (it.type === "product") {
        productAmt += price;
      } else if (it.type === "package") {
        packageAmt += price;
      } else if (it.type === "membership") {
        membershipAmt += price;
      } else {
        serviceAmt += price;
      }
    });

    salesByDate[displayDate].service_amount += serviceAmt;
    salesByDate[displayDate].product_amount += productAmt;
    salesByDate[displayDate].package_amount += packageAmt;
    salesByDate[displayDate].membership_amount += membershipAmt;

    if (o.payment_method?.toLowerCase() === "wallet") {
      salesByDate[displayDate].wallet_amount += o.total || 0;
    }

    salesByDate[displayDate].tax_inclusive += (o.total || 0) * 0.18;
    salesByDate[displayDate].discount += (o.discount || 0);
    salesByDate[displayDate].total += (o.total || 0);
  });

  const salesReportRows = Object.values(salesByDate).sort((a, b) => {
    return a.rawDate.localeCompare(b.rawDate);
  });

  // 2. EMPLOYEE REPORT - Stylist metrics
  const employeeSummary = {};
  employees.forEach(emp => {
    employeeSummary[emp.id] = {
      id: emp.id,
      name: emp.name,
      phone: emp.phone || emp.phone_numbers?.[0] || "",
      total_clients: 0,
      total_services: 0,
      service_amount: 0,
      service_commission: 0,
      total_products: 0,
      product_amount: 0,
      product_commission: 0,
      total_membership: 0,
      membership_amount: 0,
      total_packages: 0,
      package_amount: 0,
      actual_amount: 0,
      discount: 0,
      total_amount: 0
    };
  });

  filteredOrders.forEach(o => {
    const empId = o.employee_id || o.stylist_id;
    if (!empId) return;

    if (!employeeSummary[empId]) {
      employeeSummary[empId] = {
        id: empId,
        name: o.employee_name || o.stylist_name || "Unknown Stylist",
        phone: "",
        total_clients: 0,
        total_services: 0,
        service_amount: 0,
        service_commission: 0,
        total_products: 0,
        product_amount: 0,
        product_commission: 0,
        package_commission: 0,
        member_commission: 0,
        total_membership: 0,
        membership_amount: 0,
        total_packages: 0,
        package_amount: 0,
        actual_amount: 0,
        discount: 0,
        total_amount: 0
      };
    }

    const summary = employeeSummary[empId];
    summary.total_clients += 1;
    summary.discount += (o.discount || 0);
    summary.total_amount += (o.total || 0);

    o.items?.forEach(it => {
      const price = (it.price || 0) * (it.quantity || 1);
      if (it.type === "product") {
        summary.total_products += (it.quantity || 1);
        summary.product_amount += price;
      } else if (it.type === "package") {
        summary.total_packages += (it.quantity || 1);
        summary.package_amount += price;
      } else if (it.type === "membership") {
        summary.total_membership += (it.quantity || 1);
        summary.membership_amount += price;
      } else {
        summary.total_services += (it.quantity || 1);
        summary.service_amount += price;
      }
    });
  });

  const employeeReportRows = Object.values(employeeSummary).map(emp => {
    const matchedEmp = employees.find(e => e.id === emp.id);
    const sCommRate = matchedEmp?.commission_rate !== undefined ? matchedEmp.commission_rate : 0.05;
    const sCommInr = matchedEmp?.service_commission_inr || 0;
    const pCommRate = matchedEmp?.product_commission_rate !== undefined ? matchedEmp.product_commission_rate : 0.02;
    const pCommInr = matchedEmp?.product_commission_inr || 0;
    const pkgCommRate = matchedEmp?.package_commission_rate !== undefined ? matchedEmp.package_commission_rate : 0;
    const pkgCommInr = matchedEmp?.package_commission_inr || 0;
    const memCommRate = matchedEmp?.member_commission_rate !== undefined ? matchedEmp.member_commission_rate : 0;
    const memCommInr = matchedEmp?.member_commission_inr || 0;

    const target = matchedEmp?.monthly_target || 0;

    if (target > 0 && emp.service_amount < target) {
      emp.service_commission = 0;
    } else {
      emp.service_commission = sCommInr > 0 ? (sCommInr * emp.total_services) : (emp.service_amount * sCommRate);
    }

    emp.product_commission = pCommInr > 0 ? (pCommInr * emp.total_products) : (emp.product_amount * pCommRate);
    emp.package_commission = pkgCommInr > 0 ? (pkgCommInr * emp.total_packages) : (emp.package_amount * pkgCommRate);
    emp.member_commission = memCommInr > 0 ? (memCommInr * emp.total_membership) : (emp.membership_amount * memCommRate);
    emp.actual_amount = emp.service_amount + emp.product_amount + emp.package_amount + emp.membership_amount;

    return emp;
  });

  // 3. JOB CARD REPORT
  const jobCardOrders = filteredOrders.filter(o => {
    if (!jobCardProviderId) return true;
    return (o.employee_id === jobCardProviderId) || (o.stylist_id === jobCardProviderId);
  });

  let jServicesQty = 0; let jServicesPrice = 0;
  let jProductsQty = 0; let jProductsPrice = 0;
  let jPackagesQty = 0; let jPackagesPrice = 0;
  let jMembershipsQty = 0; let jMembershipsPrice = 0;

  const serviceListItems = [];
  jobCardOrders.forEach(o => {
    o.items?.forEach(it => {
      const price = (it.price || 0) * (it.quantity || 1);
      if (it.type === "product") {
        jProductsQty += (it.quantity || 1);
        jProductsPrice += price;
      } else if (it.type === "package") {
        jPackagesQty += (it.quantity || 1);
        jPackagesPrice += price;
      } else if (it.type === "membership") {
        jMembershipsQty += (it.quantity || 1);
        jMembershipsPrice += price;
      } else {
        jServicesQty += (it.quantity || 1);
        jServicesPrice += price;
      }

      serviceListItems.push({
        client: o.full_name || o.user_name || "Walk-In Client",
        item: it.name || "Hair Treatment",
        price: price
      });
    });
  });

  const totalRevenueCollected = jServicesPrice + jProductsPrice + jPackagesPrice + jMembershipsPrice;

  // 4. COLLECTION REPORTS
  const collectionRows = filteredOrders.map(o => {
    const dateStr = o.created_at ? o.created_at.split("T")[0] : "Unknown";
    let displayDate = dateStr;
    try {
      const [y, m, d] = dateStr.split("-");
      if (y && m && d) displayDate = `${d}-${m}-${y}`;
    } catch (e) { }

    let serviceAmt = 0;
    let productAmt = 0;
    let packageAmt = 0;
    let membershipAmt = 0;

    o.items?.forEach(it => {
      const price = (it.price || 0) * (it.quantity || 1);
      if (it.type === "product") productAmt += price;
      else if (it.type === "package") packageAmt += price;
      else if (it.type === "membership") membershipAmt += price;
      else serviceAmt += price;
    });

    const tax = o.total * 0.18;
    const netSale = o.total - (o.discount || 0) - tax;
    const payMode = o.payment_method?.toLowerCase() || "";

    return {
      id: o.id,
      date: displayDate,
      type: "Invoice",
      invoice_id: o.id.slice(0, 8),
      client_name: o.full_name || o.user_name || "Walk-In",
      client_number: o.phone || "—",
      service_amount: serviceAmt,
      product_amount: productAmt,
      package_amount: packageAmt,
      membership_amount: membershipAmt,
      wallet_amount: payMode === "wallet" ? o.total : 0,
      pending_received: o.status === "delivered" ? o.total : 0,
      appointment_advance: 0,
      pending_payment: o.status === "placed" ? o.total : 0,
      discount: o.discount || 0,
      tax: tax,
      net_sale: netSale,
      grand_sale: o.total,
      total_collection: o.total,
      cash: payMode === "cash" ? o.total : 0,
      card: payMode === "card" || payMode === "credit/debit card" ? o.total : 0,
      cheque: payMode === "cheque" ? o.total : 0,
      online: payMode === "online" || payMode === "online payment" ? o.total : 0,
      upi: ["upi", "gpay", "g-pay", "g pay", "phonepe", "paytm"].includes(payMode) ? o.total : 0,
      ewallet: payMode === "e-wallet" || payMode === "ewallet" ? o.total : 0,
      reward: payMode === "reward" || payMode === "reward points" ? o.total : 0
    };
  });

  return (
    <div className="space-y-6 animate-fade-in text-gray-800">
      {/* Styled Inner Tabs Header - Matching User's Image */}
      <div className="bg-[#0b1f3c] text-white p-3 rounded-lg shadow-md border border-gray-700">
        <div className="flex flex-wrap items-center justify-start text-[11px] font-bold uppercase tracking-wider divide-x divide-gray-600/50">
          {ADVANCE_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setAdvanceTab(t)}
              className={`px-3 py-1 hover:text-white transition-colors pb-0.5 ${advanceTab === t ? "text-eminence-gold" : "text-gray-300"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Nested Tab Rendering */}
      <div className="eminence-card p-6 bg-white border border-gray-200 rounded-xl">
        {advanceTab === "REPORTS" && (() => {
          const totalRev = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
          const totalExp = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
          const aov = filteredOrders.length ? (totalRev / filteredOrders.length) : 0;
          return (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4 items-center justify-between border-b pb-3 mb-4">
                <h3 className="font-serif text-xl">Financial Performance Indicators</h3>
                <div className="flex flex-wrap gap-2 items-center text-xs">
                  <span className="text-gray-500 font-medium">Select dates :</span>
                  {renderDateRangePickerInline()}
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                  <p className="text-[10px] text-eminence-muted uppercase font-bold block mb-1">Turnover</p>
                  <p className="text-2xl font-serif text-eminence-gold">₹{totalRev.toLocaleString("en-IN")}</p>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                  <p className="text-[10px] text-eminence-muted uppercase font-bold block mb-1">Gross Margin</p>
                  <p className="text-2xl font-serif text-emerald-700">₹{(totalRev - totalExp).toLocaleString("en-IN")}</p>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                  <p className="text-[10px] text-eminence-muted uppercase font-bold block mb-1">Average Order Value</p>
                  <p className="text-2xl font-serif text-gray-950">₹{aov.toFixed(0)}</p>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                  <p className="text-[10px] text-eminence-muted uppercase font-bold block mb-1">GST Collected (18%)</p>
                  <p className="text-2xl font-serif text-indigo-700">₹{(totalRev * 0.18).toLocaleString("en-IN")}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {advanceTab === "SALES REPORT" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-700">Sales report</h3>
              <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                <Download size={12} />
                Export
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
              <span className="text-gray-500 font-medium">Select dates :</span>
              {renderDateRangePickerInline()}
              <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                <Filter size={12} />
                Filter
              </button>
              <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                <X size={12} />
                Clear
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-[11px]">
                    <th className="px-4 py-3">Sr. no</th>
                    <th className="px-4 py-3">Bill date</th>
                    <th className="px-4 py-3 text-right">Service amount</th>
                    <th className="px-4 py-3 text-right">Product amount</th>
                    <th className="px-4 py-3 text-right">Package amount</th>
                    <th className="px-4 py-3 text-right">Membership amount</th>
                    <th className="px-4 py-3 text-right">Wallet amount</th>
                    <th className="px-4 py-3 text-right">Appointment advance</th>
                    <th className="px-4 py-3 text-left">Tax</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {salesReportRows.map((row, idx) => (
                    <tr key={row.date} className="hover:bg-gray-50/50 even:bg-gray-50/20">
                      <td className="px-4 py-3">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold">{row.date}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.service_amount)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.product_amount)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.package_amount)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.membership_amount)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.wallet_amount)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.appointment_advance)}</td>
                      <td className="px-4 py-3 text-left whitespace-pre-line text-[10px] text-gray-500 font-normal">
                        <div>Inclusive : {formatNumber(row.tax_inclusive)}</div>
                        <div>Exclusive : {formatNumber(row.tax_exclusive)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.discount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formatNumber(row.total)}</td>
                    </tr>
                  ))}
                  {salesReportRows.length === 0 && (
                    <tr>
                      <td colSpan="11" className="text-center py-10 italic text-gray-400">No records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {advanceTab === "EMPLOYEE" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-700">Employees Report</h3>
              <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                <Download size={12} />
                Export
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
              <span className="text-gray-500 font-medium">Select date :</span>
              {renderDateRangePickerInline()}
              <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                <Filter size={12} />
                Filter
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
              <table className="w-full text-[11px] text-left">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-[11px]">
                    <th className="px-3 py-3">Sr. no</th>
                    <th className="px-3 py-3">Service provider</th>
                    <th className="px-3 py-3 text-center">Total clients</th>
                    <th className="px-3 py-3 text-center">Total services</th>
                    <th className="px-3 py-3 text-right">Service amount</th>
                    <th className="px-3 py-3 text-right">Service commission</th>
                    <th className="px-3 py-3 text-center">Total products</th>
                    <th className="px-3 py-3 text-right">Product amount</th>
                    <th className="px-3 py-3 text-right">Product commission</th>
                    <th className="px-3 py-3 text-center">Total membership</th>
                    <th className="px-3 py-3 text-right">Membership amount</th>
                    <th className="px-3 py-3 text-right">Membership commission</th>
                    <th className="px-3 py-3 text-center">Total packages</th>
                    <th className="px-3 py-3 text-right">Package amount</th>
                    <th className="px-3 py-3 text-right">Package commission</th>
                    <th className="px-3 py-3 text-right">Actual amount</th>
                    <th className="px-3 py-3 text-right">Discount</th>
                    <th className="px-3 py-3 text-right font-bold">Total amount</th>
                    <th className="px-3 py-3 text-right">Average Bill Value (ABV)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {employeeReportRows.map((row, idx) => {
                    const abv = row.total_clients > 0 ? formatNumber(row.total_amount / row.total_clients) : "nan";
                    return (
                      <tr key={row.id} className="hover:bg-gray-50/50 even:bg-gray-50/20">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2 font-bold whitespace-nowrap text-gray-900">
                          {row.name} {row.phone ? `(${row.phone})` : ""}
                        </td>
                        <td className="px-3 py-2 text-center">{row.total_clients}</td>
                        <td className="px-3 py-2 text-center">{row.total_services}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.service_amount)}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{formatNumber(row.service_commission)}</td>
                        <td className="px-3 py-2 text-center">{row.total_products}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.product_amount)}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{formatNumber(row.product_commission)}</td>
                        <td className="px-3 py-2 text-center">{row.total_membership}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.membership_amount)}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{formatNumber(row.member_commission)}</td>
                        <td className="px-3 py-2 text-center">{row.total_packages}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.package_amount)}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{formatNumber(row.package_commission)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.actual_amount)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(row.discount)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{formatNumber(row.total_amount)}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{abv}</td>
                      </tr>
                    );
                  })}
                  {/* Total Row */}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-200">
                    <td colSpan="2" className="px-3 py-3 text-right">Total</td>
                    <td className="px-3 py-3 text-center">{employeeReportRows.reduce((a, b) => a + b.total_clients, 0)}</td>
                    <td className="px-3 py-3 text-center">{employeeReportRows.reduce((a, b) => a + b.total_services, 0)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.service_amount, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.service_commission, 0))}</td>
                    <td className="px-3 py-3 text-center">{employeeReportRows.reduce((a, b) => a + b.total_products, 0)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.product_amount, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.product_commission, 0))}</td>
                    <td className="px-3 py-3 text-center">{employeeReportRows.reduce((a, b) => a + b.total_membership, 0)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.membership_amount, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.member_commission, 0))}</td>
                    <td className="px-3 py-3 text-center">{employeeReportRows.reduce((a, b) => a + b.total_packages, 0)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.package_amount, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.package_commission, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.actual_amount, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(employeeReportRows.reduce((a, b) => a + b.discount, 0))}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{formatNumber(employeeReportRows.reduce((a, b) => a + b.total_amount, 0))}</td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {(() => {
                        const totalClients = employeeReportRows.reduce((a, b) => a + b.total_clients, 0);
                        const totalAmount = employeeReportRows.reduce((a, b) => a + b.total_amount, 0);
                        return totalClients > 0 ? formatNumber(totalAmount / totalClients) : "nan";
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {advanceTab === "JOB CARD" && (
          <div className="space-y-4">
            <div className="border-b pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-700">Job card report</h3>
            </div>

            <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">Select date :</span>
                {renderDateRangePickerInline()}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">Service provider :</span>
                <select value={jobCardProviderId} onChange={e => setJobCardProviderId(e.target.value)} className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none">
                  <option value="">All Providers</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                  <Filter size={12} />
                  Filter
                </button>
                <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                  <X size={12} />
                  Clear
                </button>
                <button onClick={handlePrint} className="bg-[#ec971f] hover:bg-[#d58512] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                  <Printer size={12} />
                  Print
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Total Revenue Collected Box */}
              <div className="lg:col-span-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="p-4 bg-gray-100 border-b border-gray-200">
                  <span className="font-bold text-xs text-gray-700 block">Total Revenue Collected : {formatNumber(totalRevenueCollected)}</span>
                </div>
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-500">
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2 text-center">Quantity</th>
                      <th className="px-4 py-2 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    <tr>
                      <td className="px-4 py-2 font-medium">Services</td>
                      <td className="px-4 py-2 text-center">{jServicesQty}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(jServicesPrice)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">Products</td>
                      <td className="px-4 py-2 text-center">{jProductsQty}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(jProductsPrice)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">Packages</td>
                      <td className="px-4 py-2 text-center">{jPackagesQty}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(jPackagesPrice)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-medium">Memberships</td>
                      <td className="px-4 py-2 text-center">{jMembershipsQty}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(jMembershipsPrice)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Right Service List Table */}
              <div className="lg:col-span-2 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="p-4 bg-gray-100 border-b border-gray-200">
                  <span className="font-bold text-xs text-gray-700 block">Service List</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-500">
                        <th className="px-4 py-2">Client</th>
                        <th className="px-4 py-2">Item</th>
                        <th className="px-4 py-2 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {serviceListItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2 font-bold">{item.client}</td>
                          <td className="px-4 py-2">{item.item}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatNumber(item.price)}</td>
                        </tr>
                      ))}
                      {serviceListItems.length === 0 && (
                        <tr>
                          <td colSpan="3" className="text-center py-10 text-gray-400 italic">No record found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {advanceTab === "COLLECTION" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="text-lg font-bold text-gray-700">Collection reports</h3>
              <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                <Download size={12} />
                Export
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
              <span className="text-gray-500 font-medium">Select dates :</span>
              {renderDateRangePickerInline()}
              <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                <Filter size={12} />
                Filter
              </button>
              <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                <X size={12} />
                Clear
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm max-w-full bg-white">
              <table className="w-full text-[10px] text-left table-auto">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 whitespace-nowrap">
                    <th className="px-2 py-3">Bill date</th>
                    <th className="px-2 py-3">Type</th>
                    <th className="px-2 py-3">Invoice id</th>
                    <th className="px-2 py-3">Client name</th>
                    <th className="px-2 py-3">Client number</th>
                    <th className="px-2 py-3 text-right">Service amount</th>
                    <th className="px-2 py-3 text-right">Product amount</th>
                    <th className="px-2 py-3 text-right">Package amount</th>
                    <th className="px-2 py-3 text-right">Membership amount</th>
                    <th className="px-2 py-3 text-right">Wallet amount</th>
                    <th className="px-2 py-3 text-right">Pending amount received</th>
                    <th className="px-2 py-3 text-right">Appointment advance</th>
                    <th className="px-2 py-3 text-right">Pending payment</th>
                    <th className="px-2 py-3 text-right">Discount</th>
                    <th className="px-2 py-3 text-right">Tax</th>
                    <th className="px-2 py-3 text-right font-bold">Net sale</th>
                    <th className="px-2 py-3 text-right font-bold">Grand sale</th>
                    <th className="px-2 py-3 text-right font-bold">Total collection</th>
                    <th className="px-2 py-3 text-right">Cash</th>
                    <th className="px-2 py-3 text-right">Credit/Debit card</th>
                    <th className="px-2 py-3 text-right">Cheque</th>
                    <th className="px-2 py-3 text-right">Online payment</th>
                    <th className="px-2 py-3 text-right">UPI</th>
                    <th className="px-2 py-3 text-right">E-wallet</th>
                    <th className="px-2 py-3 text-right">Reward points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 whitespace-nowrap font-medium">
                  {collectionRows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 even:bg-gray-50/20">
                      <td className="px-2 py-2">{row.date}</td>
                      <td className="px-2 py-2">{row.type}</td>
                      <td className="px-2 py-2 font-mono text-[9px]">#{row.invoice_id}</td>
                      <td className="px-2 py-2 font-bold text-gray-900">{row.client_name}</td>
                      <td className="px-2 py-2">{row.client_number}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.service_amount)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.product_amount)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.package_amount)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.membership_amount)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.wallet_amount)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.pending_received)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.appointment_advance)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.pending_payment)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.discount)}</td>
                      <td className="px-2 py-2 text-left whitespace-pre-line text-[9px] text-gray-500 font-normal">
                        <div>Inclusive : {formatNumber(row.tax)}</div>
                        <div>Exclusive : 0.00</div>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{formatNumber(row.net_sale)}</td>
                      <td className="px-2 py-2 text-right font-bold text-gray-900">{formatNumber(row.grand_sale)}</td>
                      <td className="px-2 py-2 text-right font-bold text-gray-900">{formatNumber(row.total_collection)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.cash)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.card)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.cheque)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.online)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.upi)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.ewallet)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(row.reward)}</td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="bg-gray-100 font-bold border-t border-gray-200 whitespace-nowrap">
                    <td colSpan="5" className="px-2 py-3 text-right">Total</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.service_amount, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.product_amount, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.package_amount, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.membership_amount, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.wallet_amount, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.pending_received, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.appointment_advance, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.pending_payment, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.discount, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.tax, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.net_sale, 0))}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{formatNumber(collectionRows.reduce((a, b) => a + b.grand_sale, 0))}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{formatNumber(collectionRows.reduce((a, b) => a + b.total_collection, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.cash, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.card, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.cheque, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.online, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.upi, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.ewallet, 0))}</td>
                    <td className="px-2 py-3 text-right">{formatNumber(collectionRows.reduce((a, b) => a + b.reward, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {advanceTab === "EXPENSE" && (() => {
          const expenseCategories = ["Rent", "Supplies", "Tea & Snacks", "Electricity", "Marketing", "Salaries", "Maintenance", "Other"];
          const expensePayModes = ["Cash", "UPI", "Card", "Bank Transfer"];
          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-lg font-bold text-gray-700">Expense report</h3>
                <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                  <Download size={12} />
                  Export
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Select dates :</span>
                  {renderDateRangePickerInline()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Expense type :</span>
                  <select value={expenseTypeFilter} onChange={e => setExpenseTypeFilter(e.target.value)} className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none">
                    <option value="">--Select--</option>
                    {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Payment method :</span>
                  <select value={expensePayModeFilter} onChange={e => setExpensePayModeFilter(e.target.value)} className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none">
                    <option value="">--Select--</option>
                    {expensePayModes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Id</th>
                      <th className="px-4 py-3">Type of expense</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Payment mode</th>
                      <th className="px-4 py-3">Recipient name</th>
                      <th className="px-4 py-3">Paid by</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {filteredExpenses.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50/50 even:bg-gray-50/20">
                        <td className="px-4 py-3 font-semibold">{e.date?.split("-").reverse().join("-")}</td>
                        <td className="px-4 py-3 font-mono text-[10px]">#{e.id?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-indigo-700 font-bold">{e.category}</td>
                        <td className="px-4 py-3 text-right text-gray-900 font-bold">{formatNumber(e.amount)}</td>
                        <td className="px-4 py-3 text-left">{e.payment_mode || "Cash"}</td>
                        <td className="px-4 py-3">{e.recipient_name || "—"}</td>
                        <td className="px-4 py-3">{e.paid_by_name || "Admin"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs italic font-normal">{e.description}</td>
                      </tr>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <tr>
                        <td colSpan="8" className="text-center py-10 text-gray-400 italic">No data found!</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {advanceTab === "GST REPORT" && (() => {
          // Helper: parse tax info from order notes
          const parseTaxInfo = (o) => {
            const notes = o.notes || "";
            let rate = 0, inclusive = false;
            if (notes.includes("Tax: ")) {
              const parts = notes.split("Tax: ");
              if (parts.length > 1) {
                const taxPart = parts[1].split(" | ")[0];
                if (taxPart.includes("Inclusive")) inclusive = true;
                if (taxPart.includes("18%")) rate = 18;
                else if (taxPart.includes("5%")) rate = 5;
              }
            }
            const grand = o.total || 0;
            let incTax = 0, excTax = 0;
            if (rate > 0) {
              if (inclusive) {
                incTax = grand - grand / (1 + rate / 100);
              } else {
                excTax = grand * rate / (100 + rate);
              }
            }
            return { incTax, excTax, rate, inclusive };
          };

          const totalAmount = filteredGstOrders.reduce((sum, o) => sum + (o.total || 0), 0);
          const totalInclusiveTax = filteredGstOrders.reduce((sum, o) => sum + parseTaxInfo(o).incTax, 0);
          const totalExclusiveTax = filteredGstOrders.reduce((sum, o) => sum + parseTaxInfo(o).excTax, 0);
          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-lg font-bold text-gray-700">GST report</h3>
                <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                  <Download size={12} />
                  Export
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select dates</span>
                  {renderDateRangePickerInline()}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Tax type</span>
                  <select
                    value={taxTypeFilter}
                    onChange={e => setTaxTypeFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    <option value="Inclusive">Inclusive</option>
                    <option value="Exclusive">Exclusive</option>
                  </select>
                </div>
                <div className="flex gap-2 self-end">
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-eminence-muted uppercase text-[10px] tracking-wider font-bold bg-gray-50 whitespace-nowrap">
                      <th className="px-4 py-3">Bill date</th>
                      <th>Invoice id</th>
                      <th>Client name</th>
                      <th>Client number</th>
                      <th>Bill amount</th>
                      <th>Payment mode</th>
                      <th>Inclusive Tax</th>
                      <th>Exclusive Tax</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium whitespace-nowrap">
                    {filteredGstOrders.map(o => {
                      const grand = o.total || 0;
                      const { incTax, excTax } = parseTaxInfo(o);
                      let displayDate = o.created_at ? o.created_at.split("T")[0] : "—";
                      try {
                        const [y, m, d] = displayDate.split("-");
                        if (y && m && d) displayDate = `${d}-${m}-${y}`;
                      } catch (e) { }
                      return (
                        <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3">{displayDate}</td>
                          <td className="font-mono text-xs">#{o.id.slice(0, 8)}</td>
                          <td>{o.full_name || o.user_name || "—"}</td>
                          <td>{o.phone || "—"}</td>
                          <td>{formatNumber(grand)}</td>
                          <td>{o.payment_method || "—"}</td>
                          <td>{formatNumber(incTax)}</td>
                          <td>{formatNumber(excTax)}</td>
                          <td className="capitalize text-xs text-eminence-muted">{o.status}</td>
                        </tr>
                      );
                    })}
                    {filteredGstOrders.length === 0 && (
                      <tr>
                        <td colSpan="9" className="text-center py-8 text-eminence-muted italic">No data found!</td>
                      </tr>
                    )}
                    <tr className="bg-gray-100 font-bold border-t border-gray-200 whitespace-nowrap">
                      <td colSpan="4" className="px-4 py-3 text-right">Total</td>
                      <td>{formatNumber(totalAmount)}</td>
                      <td></td>
                      <td>{formatNumber(totalInclusiveTax)}</td>
                      <td>{formatNumber(totalExclusiveTax)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}



        {advanceTab === "SERVICE SALES" && (() => {
          const totalQty = serviceSalesRecords.reduce((sum, r) => sum + r.totalServices, 0);
          const totalPrice = serviceSalesRecords.reduce((sum, r) => sum + r.price, 0);
          const totalDiscount = serviceSalesRecords.reduce((sum, r) => sum + r.discount, 0);
          const totalRevenue = serviceSalesRecords.reduce((sum, r) => sum + r.revenue, 0);
          const serviceCategories = Array.from(new Set(services.map(s => s.category).filter(Boolean))).sort();
          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-lg font-bold text-gray-700">Service sales report</h3>
                <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                  <Download size={12} />
                  Export
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select dates</span>
                  {renderDateRangePickerInline()}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select type</span>
                  <select
                    value={itemTypeFilter}
                    onChange={e => setItemTypeFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    <option value="Service">Service</option>
                    <option value="Product">Product</option>
                    <option value="Package">Package</option>
                    <option value="Membership">Membership</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Service Category</span>
                  <select
                    value={serviceCategoryFilter}
                    onChange={e => setServiceCategoryFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--All--</option>
                    {serviceCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 self-end">
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-eminence-muted uppercase text-[10px] tracking-wider font-bold bg-gray-50 whitespace-nowrap">
                      <th className="px-4 py-3">Date</th>
                      <th>Service name</th>
                      <th>Category</th>
                      <th>Package services</th>
                      <th>Total services</th>
                      <th>Service price</th>
                      <th>Discount</th>
                      <th className="text-right pr-4">Total revenue</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium whitespace-nowrap">
                    {serviceSalesRecords.map((r, idx) => {
                      let displayDate = r.date;
                      try {
                        const [y, m, d] = displayDate.split("-");
                        if (y && m && d) displayDate = `${d}-${m}-${y}`;
                      } catch (e) { }
                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3">{displayDate}</td>
                          <td className="font-bold">{r.name}</td>
                          <td>{r.category}</td>
                          <td>{r.packageServices}</td>
                          <td>{r.totalServices}</td>
                          <td>{formatNumber(r.price)}</td>
                          <td>{formatNumber(r.discount)}</td>
                          <td className="text-right pr-4">{formatNumber(r.revenue)}</td>
                        </tr>
                      );
                    })}
                    {serviceSalesRecords.length === 0 && (
                      <tr>
                        <td colSpan="8" className="text-center py-8 text-eminence-muted italic">No service sales in filter range.</td>
                      </tr>
                    )}
                    <tr className="bg-gray-100 font-bold border-t border-gray-200 whitespace-nowrap">
                      <td colSpan="4" className="px-4 py-3 text-right">Total</td>
                      <td>{totalQty}</td>
                      <td>{formatNumber(totalPrice)}</td>
                      <td>{formatNumber(totalDiscount)}</td>
                      <td className="text-right pr-4 text-gray-900">{formatNumber(totalRevenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {advanceTab === "PRODUCT PURCHASE" && (() => {
          const totalQty = filteredStockLogs.reduce((sum, r) => sum + (r.quantity || 0), 0);
          const totalAmount = filteredStockLogs.reduce((sum, r) => sum + ((r.cost_price || 0) * (r.quantity || 0)), 0);
          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-lg font-bold text-gray-700">Product purchase report</h3>
                <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                  <Download size={12} />
                  Export
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select dates</span>
                  {renderDateRangePickerInline()}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select vendor</span>
                  <select
                    value={vendorFilter}
                    onChange={e => setVendorFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 self-end">
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-eminence-muted uppercase text-[10px] tracking-wider font-bold bg-gray-50 whitespace-nowrap">
                      <th className="px-4 py-3">Purchase date</th>
                      <th>Invoice</th>
                      <th>Vendor name</th>
                      <th>Product name</th>
                      <th>Unit</th>
                      <th>Price</th>
                      <th>Quantity</th>
                      <th>Amount</th>
                      <th>Discount</th>
                      <th>Tax</th>
                      <th>Net amount</th>
                      <th>Shipping charges</th>
                      <th>Total price</th>
                      <th>Paid</th>
                      <th>Due</th>
                      <th>Payment method</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium whitespace-nowrap">
                    {filteredStockLogs.map((r, idx) => {
                      const amount = (r.cost_price || 0) * (r.quantity || 0);
                      let displayDate = r.created_at ? r.created_at.split("T")[0] : "—";
                      try {
                        const [y, m, d] = displayDate.split("-");
                        if (y && m && d) displayDate = `${d}-${m}-${y}`;
                      } catch (e) { }
                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3">{displayDate}</td>
                          <td className="font-mono text-xs">#{r.invoice_no || r.id?.slice(0, 8)}</td>
                          <td>{r.vendor_name || "—"}</td>
                          <td className="font-bold">{r.product_name}</td>
                          <td>Pcs</td>
                          <td>{formatNumber(r.cost_price)}</td>
                          <td>{r.quantity}</td>
                          <td>{formatNumber(amount)}</td>
                          <td>0.00</td>
                          <td>0.00</td>
                          <td>{formatNumber(amount)}</td>
                          <td>0.00</td>
                          <td>{formatNumber(amount)}</td>
                          <td>{formatNumber(amount)}</td>
                          <td>0.00</td>
                          <td>Cash</td>
                        </tr>
                      );
                    })}
                    {filteredStockLogs.length === 0 && (
                      <tr>
                        <td colSpan="16" className="text-center py-8 text-eminence-muted italic">No record found!!</td>
                      </tr>
                    )}
                    <tr className="bg-gray-100 font-bold border-t border-gray-200">
                      <td colSpan="6" className="px-4 py-3 text-right">Total</td>
                      <td>{totalQty}</td>
                      <td>{formatNumber(totalAmount)}</td>
                      <td>0.00</td>
                      <td>0.00</td>
                      <td>{formatNumber(totalAmount)}</td>
                      <td>0.00</td>
                      <td>{formatNumber(totalAmount)}</td>
                      <td>{formatNumber(totalAmount)}</td>
                      <td>0.00</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {advanceTab === "PRODUCT SALES" && (() => {
          const totalQty = productSalesRecords.reduce((sum, r) => sum + r.qty, 0);
          const totalAmount = productSalesRecords.reduce((sum, r) => sum + r.total, 0);
          const totalDiscount = productSalesRecords.reduce((sum, r) => sum + r.discount, 0);
          const totalSubtotal = productSalesRecords.reduce((sum, r) => sum + r.subtotal, 0);
          const totalTax = productSalesRecords.reduce((sum, r) => sum + r.tax, 0);
          const totalGrandTotal = productSalesRecords.reduce((sum, r) => sum + r.grandTotal, 0);
          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-lg font-bold text-gray-700">Product sales report</h3>
                <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                  <Download size={12} />
                  Export
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select dates</span>
                  {renderDateRangePickerInline()}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select product</span>
                  <select
                    value={productSalesProductFilter}
                    onChange={e => setProductSalesProductFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {uniqueProductNames.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select client</span>
                  <select
                    value={productSalesClientFilter}
                    onChange={e => setProductSalesClientFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {uniqueUpsellClients.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 self-end">
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-eminence-muted uppercase text-[10px] tracking-wider font-bold bg-gray-50 whitespace-nowrap">
                      <th className="px-4 py-3">Bill date</th>
                      <th>Invoice id</th>
                      <th>Client name</th>
                      <th>Product name</th>
                      <th>Unit</th>
                      <th>Unit price</th>
                      <th>Qty</th>
                      <th>Total</th>
                      <th>Discount</th>
                      <th>Subtotal</th>
                      <th>Tax</th>
                      <th>Grand total</th>
                      <th>Payment method</th>
                      <th>Sold by</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium whitespace-nowrap">
                    {productSalesRecords.map((r, idx) => {
                      let displayDate = r.date;
                      try {
                        const [y, m, d] = displayDate.split("-");
                        if (y && m && d) displayDate = `${d}-${m}-${y}`;
                      } catch (e) { }
                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3">{displayDate}</td>
                          <td className="font-mono text-xs">#{r.orderId.slice(0, 8)}</td>
                          <td>{r.clientName}</td>
                          <td className="font-bold">{r.productName}</td>
                          <td>{r.unit}</td>
                          <td>{formatNumber(r.unitPrice)}</td>
                          <td>{r.qty}</td>
                          <td>{formatNumber(r.total)}</td>
                          <td>{formatNumber(r.discount)}</td>
                          <td>{formatNumber(r.subtotal)}</td>
                          <td>{formatNumber(r.tax)}</td>
                          <td>{formatNumber(r.grandTotal)}</td>
                          <td>{r.paymentMethod}</td>
                          <td>{r.soldBy}</td>
                        </tr>
                      );
                    })}
                    {productSalesRecords.length === 0 && (
                      <tr>
                        <td colSpan="14" className="text-center py-8 text-eminence-muted italic">No retail product sales in filter range.</td>
                      </tr>
                    )}
                    <tr className="bg-gray-100 font-bold border-t border-gray-200">
                      <td colSpan="6" className="px-4 py-3 text-right">Total</td>
                      <td>{totalQty}</td>
                      <td>{formatNumber(totalAmount)}</td>
                      <td>{formatNumber(totalDiscount)}</td>
                      <td>{formatNumber(totalSubtotal)}</td>
                      <td>{formatNumber(totalTax)}</td>
                      <td>{formatNumber(totalGrandTotal)}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {advanceTab === "PRODUCT USAGE" && (() => {
          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-lg font-bold text-gray-700">Product usage report</h3>
                <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                  <Download size={12} />
                  Export
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select dates</span>
                  {renderDateRangePickerInline()}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Client</span>
                  <select
                    value={usageClientFilter}
                    onChange={e => setUsageClientFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {uniqueUsageClients.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Product</span>
                  <select
                    value={usageProductFilter}
                    onChange={e => setUsageProductFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {uniqueUsageProducts.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Service provider</span>
                  <select
                    value={usageEmployeeFilter}
                    onChange={e => setUsageEmployeeFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {uniqueUsageEmployees.map(emp => (
                      <option key={emp} value={emp}>{emp}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Used from</span>
                  <select
                    value={usageUsedFromFilter}
                    onChange={e => setUsageUsedFromFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    <option value="Salon">Salon</option>
                    <option value="In-store">In-store</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="flex gap-2 self-end">
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-eminence-muted uppercase text-[10px] tracking-wider font-bold bg-gray-50 whitespace-nowrap">
                      <th className="px-4 py-3">Bill date</th>
                      <th>Invoice id</th>
                      <th>Client name</th>
                      <th>Service name</th>
                      <th>Product name</th>
                      <th>Quantity</th>
                      <th>Unit</th>
                      <th>Stock id</th>
                      <th>Service provider</th>
                      <th>Used From</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium whitespace-nowrap">
                    {filteredUsages.map((u, idx) => {
                      let displayDate = u.timestamp || u.created_at ? (u.timestamp || u.created_at).split("T")[0] : "—";
                      try {
                        const [y, m, d] = displayDate.split("-");
                        if (y && m && d) displayDate = `${d}-${m}-${y}`;
                      } catch (e) { }
                      return (
                        <tr key={u.id || idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3">{displayDate}</td>
                          <td className="font-mono text-xs">#{u.id?.slice(0, 8) || "—"}</td>
                          <td>{u.client_name || "—"}</td>
                          <td>{u.service_name || "—"}</td>
                          <td className="font-bold">{u.product_name}</td>
                          <td>{u.quantity}</td>
                          <td>Pcs</td>
                          <td className="font-mono text-xs">#{u.product_id?.slice(0, 8)}</td>
                          <td>{u.employee_name}</td>
                          <td className="text-xs text-eminence-muted">{u.remarks || "Salon"}</td>
                        </tr>
                      );
                    })}
                    {filteredUsages.length === 0 && (
                      <tr>
                        <td colSpan="10" className="text-center py-8 text-eminence-muted italic">No record found!!</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {advanceTab === "MEMBERSHIP" && (
          <div className="space-y-4">
            <h3 className="font-serif text-xl border-b pb-2">Membership Sales Log</h3>
            <div className="text-center py-6 text-eminence-muted italic text-sm">No new membership enrollments in the selected filter range.</div>
          </div>
        )}

        {advanceTab === "UPSELL" && (() => {
          const totalAmount = filteredUpsellRecords.reduce((sum, item) => sum + item.amount, 0);
          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-lg font-bold text-gray-700">Upsell Report</h3>
                <button onClick={handleExport} className="bg-[#ec971f] hover:bg-[#d58512] text-white text-xs font-semibold px-4 py-2 rounded shadow flex items-center gap-1 transition-colors">
                  <Download size={12} />
                  Export
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center text-xs py-3 bg-gray-50/70 p-4 rounded-xl mb-4 border border-gray-200">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Select dates</span>
                  {renderDateRangePickerInline()}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Client</span>
                  <select
                    value={upsellClientFilter}
                    onChange={e => setUpsellClientFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {uniqueUpsellClients.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 font-medium">Service provider</span>
                  <select
                    value={upsellProviderFilter}
                    onChange={e => setUpsellProviderFilter(e.target.value)}
                    className="bg-white border border-gray-300 px-3 py-1.5 rounded text-gray-700 text-xs focus:outline-none min-w-[150px]"
                  >
                    <option value="">--Select--</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 self-end">
                  <button onClick={refresh} className="bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <Filter size={12} />
                    Filter
                  </button>
                  <button onClick={handleClearFilters} className="bg-[#d9534f] hover:bg-[#c9302c] text-white font-bold px-4 py-1.5 rounded shadow flex items-center gap-1 transition-colors">
                    <X size={12} />
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-eminence-muted uppercase text-[10px] tracking-wider font-bold bg-gray-50">
                      <th className="px-4 py-3">Date</th>
                      <th>Invoice id</th>
                      <th>Client name</th>
                      <th>Contact number</th>
                      <th>Service name</th>
                      <th>Service provider</th>
                      <th className="text-right pr-4">Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium">
                    {filteredUpsellRecords.map((item, idx) => {
                      // Date display formatting
                      let displayDate = item.date;
                      try {
                        const [y, m, d] = item.date.split("-");
                        if (y && m && d) displayDate = `${d}-${m}-${y}`;
                      } catch (e) { }
                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3">{displayDate}</td>
                          <td className="font-mono text-xs">#{item.orderId.slice(0, 8)}</td>
                          <td>{item.clientName}</td>
                          <td>{item.contactNumber}</td>
                          <td>{item.productName}</td>
                          <td>{item.providerName}</td>
                          <td className="text-right pr-4">{formatNumber(item.amount)}</td>
                          <td>
                            <button
                              onClick={() => toast.success(`Viewing invoice: ${item.orderId}`)}
                              className="text-eminence-gold hover:text-eminence-muted transition-colors text-xs font-bold"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUpsellRecords.length === 0 && (
                      <tr>
                        <td colSpan="8" className="text-center py-8 text-eminence-muted italic">No upsell records logged in the selected range.</td>
                      </tr>
                    )}
                    <tr className="bg-gray-100 font-bold border-t border-gray-200 whitespace-nowrap">
                      <td colSpan="6" className="px-4 py-3 text-right">Total</td>
                      <td className="text-right pr-4 text-gray-900">{formatNumber(totalAmount)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {advanceTab === "WALLET RECHARGE" && (
          <div className="space-y-4">
            <h3 className="font-serif text-xl border-b pb-2">Client Wallet Transactions</h3>
            <div className="text-center py-6 text-eminence-muted italic text-sm">No wallet credit additions registered during this period.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function AttendanceReportPanel({ attendanceLogs, employees }) {
  const [search, setSearch] = useState("");

  const filtered = attendanceLogs.filter(log => {
    const emp = employees.find(e => e.id === log.user_id);
    return emp ? emp.name?.toLowerCase().includes(search.toLowerCase()) : log.user_name?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="eminence-card p-6 flex justify-between items-center bg-white border border-gray-200">
        <div>
          <h2 className="font-serif text-2xl text-gray-800">Staff Attendance Report</h2>
          <p className="text-xs text-eminence-muted">Detailed check-in logs, geolocations, and face checks.</p>
        </div>
        <div>
          <input type="text" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} className="bg-eminence-surface border border-eminence-border px-3 py-1.5 text-xs focus:outline-none" />
        </div>
      </div>

      <div className="eminence-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-eminence-border text-left overline text-eminence-muted">
              <th className="px-6 py-4">Employee</th>
              <th>Date</th>
              <th>Check-In</th>
              <th>Check-Out</th>
              <th>Type</th>
              <th>Verification Photo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => (
              <tr key={log.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                <td className="px-6 py-4 font-bold">{log.user_name}</td>
                <td>{log.date}</td>
                <td className="text-emerald-700 font-medium font-serif">{log.time}</td>
                <td className="font-serif text-eminence-gold font-medium">{log.checkout_time || "Active"}</td>
                <td>
                  <span className={`text-[9px] uppercase tracking-wider border px-2 py-0.5 rounded font-bold ${log.is_manual ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                    {log.is_manual ? "Manual" : "Camera Verify"}
                  </span>
                </td>
                <td>
                  {log.photo_url ? (
                    <a href={`/api/files/${log.photo_url}`} target="_blank" rel="noreferrer" className="text-xs text-eminence-gold hover:underline">
                      View photo
                    </a>
                  ) : (
                    <span className="text-xs text-eminence-muted italic">No photo</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-10 text-eminence-muted italic">No attendance records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SMSHistoryPanel({ smsLogs }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h2 className="font-serif text-2xl text-gray-800">SMS Reminders & Broadcast Logs</h2>
        <p className="text-xs text-eminence-muted">Log of all system-sent text notifications, service reminders, and custom campaigns.</p>
      </div>

      <div className="eminence-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-eminence-border text-left overline text-eminence-muted">
              <th className="px-6 py-4">Recipient</th>
              <th>Message Content</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {smsLogs.map(log => (
              <tr key={log.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                <td className="px-6 py-4 font-semibold">{log.recipient}</td>
                <td className="text-xs text-eminence-text">{log.text}</td>
                <td>
                  <span className="text-[9px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded font-bold">
                    {log.status}
                  </span>
                </td>
                <td className="text-xs text-eminence-muted font-mono">{log.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// ADD & MANAGE DROPDOWN PANELS
// ==========================================

const SearchableServiceCategorySelect = ({ value, onChange, placeholder = "Select or type new category", allowAdd = true }) => {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchCategories = async () => {
    try {
      const res = await api.get("/admin/service-categories");
      setCategories(res.data || []);
    } catch (err) {
      console.error("Failed to load service categories:", err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  const filtered = Array.isArray(categories)
    ? categories.filter((c) => {
      if (!search.trim()) return true;
      return c.toLowerCase().includes(search.toLowerCase());
    })
    : [];

  const handleSelect = (cat) => {
    onChange(cat);
    setSearch(cat);
    setIsOpen(false);
  };

  const handleAddCategory = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (Array.isArray(categories) && categories.includes(trimmed)) {
      handleSelect(trimmed);
      return;
    }
    try {
      await api.post("/admin/service-categories", { name: trimmed });
      toast.success(`Category "${trimmed}" added!`);
      await fetchCategories();
      handleSelect(trimmed);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add category");
    }
  };

  const handleDeleteCategory = async (e, cat) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete category "${cat}"?`)) return;
    try {
      await api.delete(`/admin/service-categories/${cat}`);
      toast.success(`Category "${cat}" deleted!`);
      if (value === cat) {
        onChange("");
        setSearch("");
      }
      fetchCategories();
    } catch (err) {
      toast.error("Failed to delete category");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
        <input
          type="text"
          value={search}
          onFocus={(e) => {
            setIsOpen(true);
            const target = e.target;
            setTimeout(() => {
              try {
                target.select();
              } catch (err) { }
            }, 50);
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2.5 text-sm focus:outline-none text-gray-800"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onChange("");
            }}
            className="px-2 text-gray-400 hover:text-gray-600 text-xs bg-transparent focus:outline-none"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 bg-transparent border-l border-eminence-border/30 text-gray-500 hover:text-eminence-gold flex items-center focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-eminence-border rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto py-1">
          {allowAdd && search.trim() && !categories.some(c => c.toLowerCase() === search.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={handleAddCategory}
              className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1 border-b border-emerald-100/50"
            >
              <span>+ Add New Category:</span>
              <span className="italic">"{search.trim()}"</span>
            </button>
          )}

          {filtered.map((cat) => (
            <div
              key={cat}
              onMouseDown={() => handleSelect(cat)}
              className="flex justify-between items-center px-4 py-2.5 hover:bg-eminence-gold/10 hover:text-eminence-gold cursor-pointer text-sm text-gray-700 transition-colors"
            >
              <span>{cat}</span>
              <button
                type="button"
                onMouseDown={(e) => handleDeleteCategory(e, cat)}
                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                title="Delete category"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}

          {filtered.length === 0 && !search.trim() && (
            <p className="text-center py-4 text-xs text-gray-400 italic">No categories available</p>
          )}
        </div>
      )}
    </div>
  );
};

const SearchableProductCategorySelect = ({ value, onChange, options, onAddCategory, onDeleteCategory, placeholder = "Select or type category", allowAdd = true }) => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value !== search) {
      setSearch(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const categories = Array.isArray(options) ? options : [];

  const filtered = categories.filter((c) => {
    if (!search.trim()) return true;
    return (c.name || "").toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (catName) => {
    onChange(catName);
    setSearch(catName);
    setIsOpen(false);
  };

  const handleAdd = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (categories.some(c => (c.name || "").toLowerCase() === trimmed.toLowerCase())) {
      handleSelect(trimmed);
      return;
    }
    onAddCategory(trimmed);
    handleSelect(trimmed);
    setIsOpen(false);
  };

  const handleDelete = (e, cat) => {
    e.stopPropagation();
    onDeleteCategory(cat.id || cat.name);
    if (value === cat.name) {
      onChange("");
      setSearch("");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
        <input
          type="text"
          value={search}
          onFocus={(e) => {
            setIsOpen(true);
            const target = e.target;
            setTimeout(() => {
              try {
                target.select();
              } catch (err) { }
            }, 50);
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2.5 text-sm focus:outline-none text-gray-800"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onChange("");
            }}
            className="px-2 text-gray-400 hover:text-gray-600 text-xs bg-transparent focus:outline-none"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 bg-transparent border-l border-eminence-border/30 text-gray-500 hover:text-eminence-gold flex items-center focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-eminence-border rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto py-1">
          {allowAdd && search.trim() && !categories.some(c => (c.name || "").toLowerCase() === search.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={handleAdd}
              className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1 border-b border-emerald-100/50"
            >
              <span>+ Add New Category:</span>
              <span className="italic">"{search.trim()}"</span>
            </button>
          )}

          {filtered.map((cat) => (
            <div
              key={cat.id || cat.name}
              onMouseDown={() => handleSelect(cat.name)}
              className="flex justify-between items-center px-4 py-2.5 hover:bg-eminence-gold/10 hover:text-eminence-gold cursor-pointer text-sm text-gray-700 transition-colors"
            >
              <span>{cat.name}</span>
              <button
                type="button"
                onMouseDown={(e) => handleDelete(e, cat)}
                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                title="Delete category"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}

          {filtered.length === 0 && !search.trim() && (
            <p className="text-center py-4 text-xs text-gray-400 italic">No categories available</p>
          )}
        </div>
      )}
    </div>
  );
};

const SearchableCategorySelect = ({ value, onChange, placeholder = "Enter Category", allowAdd = true }) => {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchCategories = async () => {
    try {
      const res = await api.get("/admin/expense-categories");
      setCategories(res.data || []);
    } catch (err) {
      console.error("Failed to load expense categories:", err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value !== search) {
      setSearch(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = Array.isArray(categories)
    ? categories.filter((c) => {
      if (!search.trim()) return true;
      return c.toLowerCase().includes(search.toLowerCase());
    })
    : [];

  const handleSelect = (cat) => {
    onChange(cat);
    setSearch(cat);
    setIsOpen(false);
  };

  const handleAddCategory = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (Array.isArray(categories) && categories.includes(trimmed)) {
      handleSelect(trimmed);
      return;
    }
    try {
      await api.post("/admin/expense-categories", { name: trimmed });
      toast.success(`Category "${trimmed}" added!`);
      await fetchCategories();
      handleSelect(trimmed);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add category");
    }
  };

  const handleDeleteCategory = async (e, cat) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete category "${cat}"?`)) return;
    try {
      await api.delete(`/admin/expense-categories/${cat}`);
      toast.success(`Category "${cat}" deleted!`);
      if (value === cat) {
        onChange("");
        setSearch("");
      }
      fetchCategories();
    } catch (err) {
      toast.error("Failed to delete category");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
        <input
          type="text"
          value={search}
          onFocus={(e) => {
            setIsOpen(true);
            const target = e.target;
            setTimeout(() => {
              try {
                target.select();
              } catch (err) { }
            }, 50);
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2.5 text-sm focus:outline-none text-gray-800"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onChange("");
            }}
            className="px-2 text-gray-400 hover:text-gray-600 text-xs bg-transparent focus:outline-none"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 bg-transparent border-l border-eminence-border/30 text-gray-500 hover:text-eminence-gold flex items-center focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-eminence-border rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto py-1">
          {allowAdd && search.trim() && !categories.some(c => c.toLowerCase() === search.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={handleAddCategory}
              className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1 border-b border-emerald-100/50"
            >
              <span>+ Add New Category:</span>
              <span className="italic">"{search.trim()}"</span>
            </button>
          )}

          {filtered.map((cat) => (
            <div
              key={cat}
              onMouseDown={() => handleSelect(cat)}
              className="flex justify-between items-center px-4 py-2.5 hover:bg-eminence-gold/10 hover:text-eminence-gold cursor-pointer text-sm text-gray-700 transition-colors"
            >
              <span>{cat}</span>
              <button
                type="button"
                onMouseDown={(e) => handleDeleteCategory(e, cat)}
                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                title="Delete category"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}

          {filtered.length === 0 && !search.trim() && (
            <p className="text-center py-4 text-xs text-gray-400 italic">No categories available</p>
          )}
        </div>
      )}
    </div>
  );
};

const SearchableRecipientSelect = ({ value, onChange, options, placeholder = "Enter Recipient name" }) => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value !== search) {
      setSearch(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const recipients = Array.isArray(options) ? options : [];

  const filtered = recipients.filter((r) => {
    if (!search.trim()) return true;
    return r.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (rec) => {
    onChange(rec);
    setSearch(rec);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
        <input
          type="text"
          value={search}
          onFocus={(e) => {
            setIsOpen(true);
            const target = e.target;
            setTimeout(() => {
              try {
                target.select();
              } catch (err) { }
            }, 50);
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2.5 text-sm focus:outline-none text-gray-800"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onChange("");
            }}
            className="px-2 text-gray-400 hover:text-gray-600 text-xs bg-transparent focus:outline-none"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 bg-transparent border-l border-eminence-border/30 text-gray-500 hover:text-eminence-gold flex items-center focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-eminence-border rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto py-1">
          {filtered.map((rec) => (
            <div
              key={rec}
              onMouseDown={() => handleSelect(rec)}
              className="flex justify-between items-center px-4 py-2.5 hover:bg-eminence-gold/10 hover:text-eminence-gold cursor-pointer text-sm text-gray-700 transition-colors"
            >
              <span>{rec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function ExpensesPanel({ expenses, employees, refresh, isSuperAdmin }) {
  const PAYMENT_MODES = ["Cash", "Gpay", "Card", "Bank Transfer", "UPI", "Other"];

  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], category: "", amount: "", description: "", paid_to: "", payment_mode: "Cash" });
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [entriesPerPage, setEntriesPerPage] = useState(10);

  // Filter states
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPaymentMode, setFilterPaymentMode] = useState("");
  const [filterRecipient, setFilterRecipient] = useState("");

  const uniqueCategories = React.useMemo(() => {
    const cats = expenses.map(e => e.category).filter(Boolean);
    return [...new Set(cats)].sort();
  }, [expenses]);

  const uniquePaymentModes = React.useMemo(() => {
    const modes = expenses.map(e => e.payment_mode).filter(Boolean);
    return [...new Set(modes)].sort();
  }, [expenses]);

  const uniqueRecipients = React.useMemo(() => {
    const recipients = expenses.map(e => e.paid_to).filter(Boolean);
    return [...new Set(recipients)].sort();
  }, [expenses]);

  // Date range filter - default to last 7 days
  const today = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const [dateFrom, setDateFrom] = useState(weekAgo.toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(today.toISOString().split("T")[0]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/admin/expenses/${editingId}`, { ...form, amount: Number(form.amount) });
        toast.success("Expense updated!");
        setEditingId(null);
      } else {
        await api.post("/admin/expenses", { ...form, amount: Number(form.amount) });
        toast.success("Expense added successfully!");
      }
      setForm({ date: new Date().toISOString().split("T")[0], category: "", amount: "", description: "", paid_to: "", payment_mode: "Cash" });
      refresh();
    } catch {
      toast.error("Failed to save expense.");
    }
  };

  const startEdit = (exp) => {
    setEditingId(exp.id);
    setForm({ date: exp.date || "", category: exp.category || "", amount: exp.amount || "", description: exp.description || "", paid_to: exp.paid_to || "", payment_mode: exp.payment_mode || "Cash" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ date: new Date().toISOString().split("T")[0], category: "", amount: "", description: "", paid_to: "", payment_mode: "Cash" });
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this expense item?")) return;
    try {
      await api.delete(`/admin/expenses/${id}`);
      toast.success("Expense deleted.");
      refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  // Filtered expenses
  const filtered = expenses.filter(e => {
    const d = e.date || "";
    const inRange = d >= dateFrom && d <= dateTo;
    const matchCategory = !filterCategory || e.category === filterCategory;
    const matchPaymentMode = !filterPaymentMode || e.payment_mode === filterPaymentMode;
    const matchRecipient = !filterRecipient || (e.paid_to || "").toLowerCase() === filterRecipient.toLowerCase();
    const matchSearch = search === "" ||
      (e.category || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.paid_to || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.payment_mode || "").toLowerCase().includes(search.toLowerCase()) ||
      String(e.amount || "").includes(search);
    return inRange && matchCategory && matchPaymentMode && matchRecipient && matchSearch;
  });

  const displayed = filtered.slice(0, entriesPerPage);
  const totalFiltered = filtered.reduce((sum, e) => sum + (e.amount || 0), 0);

  const exportCSV = () => {
    const headers = ["Date", "Category", "Amount", "Payment Mode", "Recipient", "Paid By", "Description"];
    const rows = filtered.map(e => [e.date, e.category, e.amount, e.payment_mode || "", e.paid_to || "", e.paid_by || "Admin", e.description || ""]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `expenses_${dateFrom}_to_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Add / Edit Expense Form ── */}
      <div className="bg-white rounded-2xl border border-eminence-border shadow-sm overflow-visible">
        <div className="bg-gray-800 text-white px-6 py-3 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-semibold text-sm">{editingId ? "Edit expense" : "Add new expense"}</h3>
          {editingId && <button onClick={cancelEdit} className="text-xs bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded">Cancel Edit</button>}
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Date *</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Type of expense *</label>
              <SearchableCategorySelect
                value={form.category}
                onChange={(val) => setForm({ ...form, category: val })}
                allowAdd={isSuperAdmin}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Amount paid *</label>
              <input type="number" required placeholder="Enter Amount paid" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Mode of payment *</label>
              <select required value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold">
                <option value="">Select payment mode</option>
                {PAYMENT_MODES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Recipient name *</label>
              <SearchableRecipientSelect
                value={form.paid_to}
                onChange={(val) => setForm({ ...form, paid_to: val })}
                options={uniqueRecipients}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Description *</label>
              <input type="text" required placeholder="Enter Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold" />
            </div>
            <div className="flex justify-end">
              <button type="submit" className={`px-5 py-2 text-sm font-bold text-white rounded shadow-sm ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} transition-colors`}>
                {editingId ? "✏ Update Expense" : "+ Add Expense"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Manage Expenses Table ── */}
      <div className="bg-white rounded-2xl border border-eminence-border shadow-sm overflow-hidden">
        <div className="bg-gray-800 text-white px-6 py-3">
          <h3 className="font-semibold text-sm">Manage expense(s)</h3>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              Show
              <select value={entriesPerPage} onChange={e => setEntriesPerPage(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              entries
            </div>
            <div className="flex-1 flex items-center justify-center gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs bg-white" />
              <span className="text-gray-400 text-xs">-</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs bg-white" />
            </div>
            <button onClick={() => refresh()} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded text-xs font-bold flex items-center gap-1">
              <Filter size={12} /> Filter
            </button>
            <button onClick={exportCSV} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded text-xs font-bold flex items-center gap-1">
              <Download size={12} /> Export
            </button>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search:" value={search} onChange={e => setSearch(e.target.value)} className="border border-gray-300 rounded pl-7 pr-3 py-1.5 text-xs bg-white focus:outline-none focus:border-eminence-gold w-40" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Type:</span>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-eminence-gold min-w-[120px] text-gray-700">
                <option value="">All Categories</option>
                {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Payment Mode:</span>
              <select value={filterPaymentMode} onChange={e => setFilterPaymentMode(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-eminence-gold min-w-[120px] text-gray-700">
                <option value="">All Modes</option>
                {uniquePaymentModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Recipient:</span>
              <select value={filterRecipient} onChange={e => setFilterRecipient(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-eminence-gold min-w-[120px] text-gray-700">
                <option value="">All Recipients</option>
                {uniqueRecipients.map(rec => <option key={rec} value={rec}>{rec}</option>)}
              </select>
            </div>
            {(filterCategory || filterPaymentMode || filterRecipient) && (
              <button
                type="button"
                onClick={() => { setFilterCategory(""); setFilterPaymentMode(""); setFilterRecipient(""); }}
                className="text-[10px] text-red-600 hover:text-red-800 font-bold uppercase tracking-wider bg-transparent border-none focus:outline-none"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">Showing {displayed.length} of {filtered.length} entries</span>
          <span className="text-sm font-bold text-red-600">Total: ₹{totalFiltered.toLocaleString("en-IN")}</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px]">Date</th>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px]">Type</th>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px]">Amount</th>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px]">Payment mode</th>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px]">Recipient</th>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px]">Paid by</th>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px]">Description</th>
                <th className="px-4 py-3 font-bold text-gray-600 uppercase text-[10px] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-10 text-gray-400 italic">No expenses found for this date range.</td>
                </tr>
              ) : displayed.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{e.date}</td>
                  <td className="px-4 py-3 text-gray-700">{e.category}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{Number(e.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-gray-700">{e.payment_mode || "Cash"}</td>
                  <td className="px-4 py-3 text-gray-700">{e.paid_to || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{e.paid_by || "Admin"}</td>
                  <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">{e.description || "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(e)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[10px] font-bold mr-1">
                      Edit
                    </button>
                    <button onClick={() => remove(e.id)} className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded text-[10px] font-bold">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CouponsPanel({ coupons, refresh }) {
  const [form, setForm] = useState({ code: "", discount_type: "percentage", discount_value: "", expiry_date: "", active: true });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/coupons", {
        ...form,
        discount_value: Number(form.discount_value)
      });
      toast.success("Coupon code created!");
      setForm({ code: "", discount_type: "percentage", discount_value: "", expiry_date: "", active: true });
      refresh();
    } catch {
      toast.error("Failed to create coupon code.");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Permanently delete this coupon?")) return;
    try {
      await api.delete(`/admin/coupons/${id}`);
      toast.success("Coupon deleted.");
      refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      <form onSubmit={submit} className="eminence-card p-6 space-y-4 lg:col-span-1 h-fit sticky top-24">
        <p className="overline text-eminence-gold">Add Salon Discount Coupon</p>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Coupon Code</label>
          <input type="text" required placeholder="E.g. WELCOME10" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Discount Type</label>
          <select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none">
            <option value="percentage">Percentage (%)</option>
            <option value="flat">Flat Cash Discount (₹)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Discount Value</label>
          <input type="number" required placeholder="E.g. 10" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Expiry Date</label>
          <input type="date" required value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>

        <button type="submit" className="btn-gold w-full mt-4">Create Coupon</button>
      </form>

      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <h3 className="font-serif text-2xl text-gray-800">Coupon Configurations</h3>
          <p className="text-xs text-eminence-muted">Active promotional and reward campaigns currently valid on checkout.</p>
        </div>

        <div className="eminence-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-eminence-border text-left overline text-eminence-muted">
                <th className="px-6 py-4">Coupon Code</th>
                <th>Type</th>
                <th>Value</th>
                <th>Expiry</th>
                <th className="text-right px-6">Action</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                  <td className="px-6 py-4 font-mono font-bold text-gray-900">{c.code}</td>
                  <td className="uppercase text-xs font-semibold text-indigo-700">{c.discount_type}</td>
                  <td className="font-bold text-emerald-600">{c.discount_type === "percentage" ? `${c.discount_value}%` : `₹${c.discount_value}`}</td>
                  <td className="text-xs font-mono">{c.expiry_date}</td>
                  <td className="text-right px-6">
                    <button onClick={() => remove(c.id)} className="text-eminence-muted hover:text-red-500"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-eminence-muted italic">No active coupons created.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const SearchableServiceSelect = ({ value, onChange, options, placeholder = "Select Service" }) => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value !== search) {
      setSearch(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const serviceList = Array.isArray(options) ? options : [];

  const filtered = serviceList.filter((s) => {
    const sName = s.name || "";
    if (!search.trim()) return true;
    return sName.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (sName) => {
    onChange(sName);
    setSearch(sName);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
        <input
          type="text"
          value={search}
          onFocus={(e) => {
            setIsOpen(true);
            const target = e.target;
            setTimeout(() => {
              try {
                target.select();
              } catch (err) { }
            }, 50);
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none text-gray-800"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onChange("");
            }}
            className="px-2 text-gray-400 hover:text-gray-600 text-xs bg-transparent focus:outline-none"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 bg-transparent border-l border-eminence-border/30 text-gray-500 hover:text-eminence-gold flex items-center focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-eminence-border rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto py-1">
          {filtered.map((s) => {
            const sName = s.name || "";
            return (
              <div
                key={s.id || sName}
                onMouseDown={() => handleSelect(sName)}
                className="flex justify-between items-center px-4 py-2 hover:bg-eminence-gold/10 hover:text-eminence-gold cursor-pointer text-sm text-gray-700 transition-colors"
              >
                <span>{sName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function ReminderSettingsPanel({ services }) {
  const [reminders, setReminders] = useState([]);
  const [form, setForm] = useState({ service_name: "", interval_days: 0, message: "" });
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [entriesPerPage, setEntriesPerPage] = useState(10);

  const fetchReminders = async () => {
    try {
      const res = await api.get("/admin/service-reminders");
      setReminders(res.data || []);
    } catch (err) {
      console.error("Failed to load service reminders:", err);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.service_name.trim()) {
      toast.error("Please select or enter a service name");
      return;
    }
    try {
      const payload = {
        service_name: form.service_name.trim(),
        interval_days: Number(form.interval_days) || 0,
        message: form.message.trim(),
        status: "active"
      };

      if (editingId) {
        await api.put(`/admin/service-reminders/${editingId}`, payload);
        toast.success("Service reminder updated successfully!");
        setEditingId(null);
      } else {
        await api.post("/admin/service-reminders", payload);
        toast.success("Service reminder added successfully!");
      }
      setForm({ service_name: "", interval_days: 0, message: "" });
      fetchReminders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save service reminder");
    }
  };

  const toggleStatus = async (reminder) => {
    const newStatus = reminder.status === "active" ? "inactive" : "active";
    try {
      await api.put(`/admin/service-reminders/${reminder.id}`, {
        service_name: reminder.service_name,
        interval_days: reminder.interval_days,
        message: reminder.message,
        status: newStatus
      });
      toast.success(`Reminder set to ${newStatus}`);
      fetchReminders();
    } catch (err) {
      toast.error("Failed to update reminder status");
    }
  };

  const startEdit = (rem) => {
    setEditingId(rem.id);
    setForm({
      service_name: rem.service_name,
      interval_days: rem.interval_days,
      message: rem.message
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ service_name: "", interval_days: 0, message: "" });
  };

  const filtered = reminders.filter((r) => {
    const sName = r.service_name || "";
    const msg = r.message || "";
    return sName.toLowerCase().includes(search.toLowerCase()) || msg.toLowerCase().includes(search.toLowerCase());
  });

  const displayed = filtered.slice(0, entriesPerPage);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Form Card ── */}
      <div className="bg-white rounded-2xl border border-eminence-border shadow-sm overflow-visible">
        <div className="bg-gray-800 text-white px-6 py-3 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-semibold text-sm">{editingId ? "Edit automatic service reminder" : "Manage automatic service reminder"}</h3>
          {editingId && (
            <button onClick={cancelEdit} className="text-xs bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-white font-semibold">
              Cancel Edit
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Service *</label>
              <SearchableServiceSelect
                value={form.service_name}
                onChange={(val) => setForm({ ...form, service_name: val })}
                options={services}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Interval days *</label>
              <input
                type="number"
                required
                min="0"
                placeholder="0"
                value={form.interval_days}
                onChange={(e) => setForm({ ...form, interval_days: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold text-gray-800"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Message *</label>
              <textarea
                required
                rows="3"
                placeholder="Enter reminder template message..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold text-gray-800"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Client name : <span className="font-mono">{`{name}`}</span> , Salon name : <span className="font-mono">{`{salon_name}`}</span>
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className={`px-5 py-2 text-sm font-bold text-white rounded shadow-sm transition-colors ${editingId ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
            >
              {editingId ? "✏ Update reminder" : "+ Add reminder"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Table Card ── */}
      <div className="bg-white rounded-2xl border border-eminence-border shadow-sm overflow-hidden">
        <div className="bg-gray-800 text-white px-6 py-3">
          <h3 className="font-semibold text-sm">Active service reminder's</h3>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            Show
            <select
              value={entriesPerPage}
              onChange={(e) => setEntriesPerPage(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            entries
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-600">
            Search:
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-eminence-gold bg-white w-48 text-gray-800"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-gray-800">
            <thead className="bg-gray-100 border-b border-gray-200 text-gray-600 uppercase text-[10px] font-bold">
              <tr>
                <th className="px-4 py-3 w-1/4">Service name</th>
                <th className="px-4 py-3 w-1/12 text-center">Days interval</th>
                <th className="px-4 py-3 w-1/2">SMS content</th>
                <th className="px-4 py-3 w-1/6 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-400 italic">
                    No service reminders configured
                  </td>
                </tr>
              ) : (
                displayed.map((rem) => {
                  const isActive = rem.status !== "inactive";
                  return (
                    <tr key={rem.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5 font-medium">{rem.service_name}</td>
                      <td className="px-4 py-3.5 text-center font-mono">{rem.interval_days}</td>
                      <td className="px-4 py-3.5 whitespace-pre-wrap leading-relaxed text-gray-600">{rem.message}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(rem)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded text-[10px] flex items-center gap-1 font-bold shadow-sm transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Edit
                          </button>
                          <button
                            onClick={() => toggleStatus(rem)}
                            className={`px-2 py-1.5 rounded text-[10px] flex items-center gap-1 font-bold shadow-sm transition-colors text-white ${isActive ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                              }`}
                          >
                            {isActive ? (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Inactive
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                Active
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="px-6 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-500">
          <span>Showing {displayed.length} of {filtered.length} entries</span>
        </div>
      </div>
    </div>
  );
}

function BranchesPanel({ branches, setBranches }) {
  const [newBranch, setNewBranch] = useState("");

  const add = async (e) => {
    e.preventDefault();
    if (!newBranch.trim()) return;
    if (branches.some(b => (b.name || b)?.toLowerCase() === newBranch.trim().toLowerCase())) {
      toast.error("Branch already exists!"); return;
    }
    try {
      const res = await api.post("/admin/branches", { name: newBranch.trim() });
      setBranches([...branches, res.data]);
      setNewBranch("");
      toast.success("New branch configuration added successfully!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save branch");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      <form onSubmit={add} className="eminence-card p-6 space-y-4 lg:col-span-1 h-fit">
        <p className="overline text-eminence-gold">Add Salon Branch</p>
        <div>
          <label className="text-xs text-eminence-muted block mb-1">Branch City/Name</label>
          <input type="text" required placeholder="E.g. Ahmedabad" value={newBranch} onChange={e => setNewBranch(e.target.value)} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>
        <button type="submit" className="btn-gold w-full mt-4">Save Branch</button>
      </form>

      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <h3 className="font-serif text-2xl text-gray-800">Salon Outlets</h3>
          <p className="text-xs text-eminence-muted">Active branches managed across Gujarat regional network.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {branches.map(b => (
            <div key={b.id || (typeof b === "string" ? b : b.name)} className="glass-card p-5 rounded-2xl bg-white border border-gray-100 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-lg text-gray-900">{(b.name || b)} Branch</h4>
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Active Operations</p>
              </div>
              {b.admin_email && (
                <div className="bg-gray-50 p-2 rounded border text-xs font-mono space-y-1 text-gray-700 select-all">
                  <div><strong>Admin ID:</strong> {b.admin_email}</div>
                  <div><strong>Password:</strong> {b.admin_password}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OffersPanel({ offers, setOffers }) {
  const [form, setForm] = useState({ title: "", discount: "", description: "", expires: "", active: true });

  const add = (e) => {
    e.preventDefault();
    const offerItem = {
      ...form,
      id: "o_" + Math.random().toString(36).substr(2, 9)
    };
    setOffers([offerItem, ...offers]);
    setForm({ title: "", discount: "", description: "", expires: "", active: true });
    toast.success("Offer promotional configuration published!");
  };

  const remove = (id) => {
    setOffers(offers.filter(o => o.id !== id));
    toast.success("Offer deleted.");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      <form onSubmit={add} className="eminence-card p-6 space-y-4 lg:col-span-1 h-fit">
        <p className="overline text-eminence-gold">Publish Promotional Offer</p>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Offer Title</label>
          <input type="text" required placeholder="E.g. Monsoon Hair Care Promo" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Discount Tag</label>
          <input type="text" required placeholder="E.g. 15% OFF" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Offer Summary description</label>
          <input type="text" required placeholder="E.g. Valid on all styling sessions" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>

        <div>
          <label className="text-xs text-eminence-muted block mb-1">Validity Expires</label>
          <input type="date" required value={form.expires} onChange={e => setForm({ ...form, expires: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none" />
        </div>

        <button type="submit" className="btn-gold w-full mt-4">Publish Banner</button>
      </form>

      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <h3 className="font-serif text-2xl text-gray-800">Seasonal Offers</h3>
          <p className="text-xs text-eminence-muted">Promotional banners displayed to clients visiting user website.</p>
        </div>

        <div className="space-y-4">
          {offers.map(o => (
            <div key={o.id} className="eminence-card p-6 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 mb-2 inline-block">
                  {o.discount}
                </span>
                <h4 className="font-serif text-xl">{o.title}</h4>
                <p className="text-xs text-eminence-muted">{o.description}</p>
                <p className="text-[10px] font-mono text-eminence-muted mt-2">Expires: {o.expires}</p>
              </div>
              <button onClick={() => remove(o.id)} className="text-eminence-muted hover:text-red-500"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GalleryPanel() {
  const [gallery, setGallery] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadType, setUploadType] = useState("before");
  const [uploadGender, setUploadGender] = useState("men");
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    api.get("/consultation-media")
      .then(res => {
        setGallery(res.data.gallery || []);
      })
      .catch(() => setGallery([]))
      .finally(() => setLoading(false));
  }, []);

  const addPhoto = async (url) => {
    if (!url) return;
    const relativeUrl = url.replace(/http:\/\/localhost:\d+/i, "").replace(/https?:\/\/[^\/]+/i, "");
    const newItem = { url: relativeUrl, type: uploadType, gender: uploadGender, media_type: "image" };
    const updated = [newItem, ...gallery];
    setGallery(updated);
    setSaving(true);
    try {
      await api.post("/admin/consultation-media", { gallery: updated });
      toast.success("Photo added to gallery!");
    } catch (err) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async (idx) => {
    const updated = gallery.filter((_, i) => i !== idx);
    setGallery(updated);
    setSaving(true);
    try {
      await api.post("/admin/consultation-media", { gallery: updated });
      toast.success("Photo removed.");
    } catch (err) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const CATEGORIES = [
    { key: "all", label: "All Photos" },
    { key: "before_men", label: "Before — Men" },
    { key: "after_men", label: "After — Men" },
    { key: "before_women", label: "Before — Women" },
    { key: "after_women", label: "After — Women" },
    { key: "review_men", label: "Reviews — Men" },
    { key: "review_women", label: "Reviews — Women" },
    { key: "before_unisex", label: "Before — Unisex" },
    { key: "after_unisex", label: "After — Unisex" },
  ];

  const TYPE_LABELS = { before: "Before", after: "After", review: "Review" };
  const GENDER_LABELS = { men: "Men", women: "Women", unisex: "Unisex" };
  const TYPE_COLORS = { before: "bg-blue-100 text-blue-700", after: "bg-emerald-100 text-emerald-700", review: "bg-amber-100 text-amber-700" };
  const GENDER_COLORS = { men: "bg-indigo-100 text-indigo-700", women: "bg-pink-100 text-pink-700", unisex: "bg-gray-100 text-gray-700" };

  const filteredGallery = activeFilter === "all"
    ? gallery
    : gallery.filter(item => {
        const [type, gender] = activeFilter.split("_");
        return item.type === type && item.gender === gender;
      });

  const resolveUrl = (src) => {
    if (!src) return "";
    if (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:")) return src;
    return `${api.defaults.baseURL?.replace(/\/api$/, "") || ""}${src.startsWith("/") ? "" : "/"}${src}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload Card */}
      <div className="eminence-card p-6">
        <p className="overline text-eminence-gold mb-4">Upload Photo to Consultation Gallery</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-eminence-muted uppercase tracking-widest mb-1.5">Image Type</label>
            <select
              value={uploadType}
              onChange={e => setUploadType(e.target.value)}
              className="w-full border border-eminence-border bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-eminence-gold"
            >
              <option value="before">Before Image</option>
              <option value="after">After Image</option>
              <option value="review">Client Review</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-eminence-muted uppercase tracking-widest mb-1.5">Gender</label>
            <select
              value={uploadGender}
              onChange={e => setUploadGender(e.target.value)}
              className="w-full border border-eminence-border bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-eminence-gold"
            >
              <option value="men">Men</option>
              <option value="women">Women</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>
        </div>
        <div className="bg-gray-50 border border-dashed border-eminence-border/60 rounded-xl p-4">
          <p className="text-[10px] text-eminence-muted uppercase font-bold mb-2">
            Adding as: <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mr-1 ${TYPE_COLORS[uploadType]}`}>{TYPE_LABELS[uploadType]}</span>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${GENDER_COLORS[uploadGender]}`}>{GENDER_LABELS[uploadGender]}</span>
          </p>
          <ImageUpload value="" onChange={addPhoto} testId="gallery-uploader" />
        </div>
        {saving && <p className="text-xs text-eminence-gold mt-2 animate-pulse">Saving...</p>}
      </div>

      {/* Filter Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-serif text-xl text-gray-800">Consultation Photo Gallery</h3>
            <p className="text-xs text-eminence-muted">Photos shown to clients in the consultation form, organized by category.</p>
          </div>
          <span className="text-xs font-bold text-eminence-muted bg-gray-100 px-3 py-1 rounded-full">{gallery.length} photos</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(cat.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                activeFilter === cat.key
                  ? "bg-eminence-gold text-white shadow"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {cat.label}
              {cat.key !== "all" && (
                <span className="ml-1 opacity-70">
                  ({gallery.filter(item => {
                    const [t, g] = cat.key.split("_");
                    return item.type === t && item.gender === g;
                  }).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="text-center py-12 text-eminence-muted text-sm">Loading gallery...</div>
      ) : filteredGallery.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <div className="w-14 h-14 rounded-2xl bg-eminence-gold/10 flex items-center justify-center text-eminence-gold mx-auto mb-4">
            <Camera size={24} />
          </div>
          <p className="text-sm font-bold text-gray-700 mb-1">No photos in this category</p>
          <p className="text-xs text-eminence-muted">Upload a photo above and assign it to this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredGallery.map((item, idx) => {
            const origIdx = gallery.findIndex((g, i) => g.url === item.url && gallery.indexOf(g) === (activeFilter === "all" ? idx : gallery.findIndex(x => x.url === item.url && x.type === item.type && x.gender === item.gender)));
            const realIdx = gallery.indexOf(item);
            return (
              <div key={`${item.url}-${realIdx}`} className="relative group rounded-xl overflow-hidden shadow border border-gray-100 aspect-square bg-gray-50">
                <img
                  src={resolveUrl(item.url)}
                  alt={`${item.type} ${item.gender}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm ${TYPE_COLORS[item.type] || "bg-gray-100 text-gray-700"}`}>
                    {TYPE_LABELS[item.type] || item.type}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm ${GENDER_COLORS[item.gender] || "bg-gray-100 text-gray-700"}`}>
                    {GENDER_LABELS[item.gender] || item.gender}
                  </span>
                </div>
                {/* Remove button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-end justify-center pb-3 transition-opacity">
                  <button
                    onClick={() => removePhoto(realIdx)}
                    className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssessmentPanel({ consultations }) {
  const [selectedAssessment, setSelectedAssessment] = useState(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h2 className="font-serif text-2xl text-gray-800">Self Assessment Records</h2>
        <p className="text-xs text-eminence-muted">Online hair quality and scalp concern checklists submitted by clients.</p>
      </div>

      <div className="eminence-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-eminence-border text-left overline text-eminence-muted">
              <th className="px-6 py-4">Client Name</th>
              <th>Phone</th>
              <th>Concerns</th>
              <th>Assessment Date</th>
              <th className="text-right px-6">Action</th>
            </tr>
          </thead>
          <tbody>
            {consultations.map(c => (
              <tr key={c.id} className="border-b border-eminence-border/30 hover:bg-eminence-surface/30">
                <td className="px-6 py-4 font-bold">{c.name}</td>
                <td>{c.phone || "—"}</td>
                <td>
                  <span className="text-xs font-semibold text-eminence-gold truncate max-w-[200px] block">
                    {c.scalp_type ? `${c.scalp_type} scalp · ${c.hair_quality || "standard"}` : "General Assessment"}
                  </span>
                </td>
                <td>{c.created_at?.split("T")[0] || "2026-06-01"}</td>
                <td className="text-right px-6">
                  <button onClick={() => setSelectedAssessment(c)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-gray-800">
                    Inspect Report
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Overlay Modal */}
      {selectedAssessment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-xl overflow-hidden max-h-[85vh] overflow-y-auto">
            <div className="p-6 bg-eminence-surface border-b border-gray-100 flex justify-between items-center">
              <div>
                <h4 className="font-serif text-2xl text-gray-900">Self Assessment Report</h4>
                <p className="text-xs text-eminence-muted">{selectedAssessment.name} · {selectedAssessment.phone}</p>
              </div>
              <button onClick={() => setSelectedAssessment(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-eminence-muted block">Scalp Type</span>
                  <span className="font-semibold text-sm">{selectedAssessment.scalp_type || "Oily"}</span>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-eminence-muted block">Hair Quality</span>
                  <span className="font-semibold text-sm">{selectedAssessment.hair_quality || "Dry"}</span>
                </div>
              </div>

              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-eminence-muted block mb-1">Key Concerns</span>
                <p className="text-sm bg-gray-50 p-3 rounded-lg leading-relaxed text-gray-800">
                  {selectedAssessment.concerns || "Hair fall, thinning at crown region, dryness."}
                </p>
              </div>

              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-eminence-muted block mb-1">Customer Notes</span>
                <p className="text-sm bg-gray-50 p-3 rounded-lg leading-relaxed text-gray-800 italic">
                  "{selectedAssessment.notes || "Looking for premium natural human hair toppers."}"
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// SYSTEM STATS CARD & ANALYSIS COMPONENT
// ==========================================

function StatCard({ icon: Icon, label, value }) {

  return (
    <div className="glass-card p-6 rounded-2xl group hover:premium-gradient transition-all duration-500" data-testid={`stat-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="overline group-hover:text-gray-400 transition-colors">{label}</p>
        <div className="p-2 rounded-lg bg-eminence-surface group-hover:bg-gray-800 transition-colors">
          <Icon size={18} className="text-eminence-gold" />
        </div>
      </div>
      <p className="font-serif text-2xl sm:text-3xl lg:text-4xl group-hover:text-white transition-colors break-all">{value}</p>
    </div>
  );
}

function Analysis({ stats, products, orders, t, selectedBranch, setSelectedBranch, branches = [], isSuperAdmin }) {
  const [filterPeriod, setFilterPeriod] = useState("MONTHLY"); // WEEKLY, MONTHLY, QUARTERLY, CUSTOM
  const [customFromDate, setCustomFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [customToDate, setCustomToDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Inventory Analysis
  const totalStockValue = products.reduce((acc, p) => acc + (p.price * (p.stock || 0)), 0);
  const outOfStock = products.filter(p => (p.stock || 0) === 0).length;
  const lowStock = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 5).length;

  const getRange = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    let start = "";
    let end = todayStr;

    if (filterPeriod === "WEEKLY") {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 7);
      start = d7.toISOString().split("T")[0];
    } else if (filterPeriod === "MONTHLY") {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      start = d30.toISOString().split("T")[0];
    } else if (filterPeriod === "QUARTERLY") {
      const d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      start = d90.toISOString().split("T")[0];
    } else if (filterPeriod === "CUSTOM") {
      start = customFromDate;
      end = customToDate;
    }
    return { start, end };
  };

  const { start, end } = getRange();

  const filteredOrdersForPopularity = orders.filter(o => {
    if (o.status === "cancelled") return false;
    const date = o.created_at?.split("T")[0] || "";
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });

  // Product and Service Popularity (from filtered orders)
  const productSales = {};
  const serviceSales = {};
  filteredOrdersForPopularity.forEach(o => {
    o.items?.forEach(it => {
      const name = it.name || it.product_id;
      const isService = it.is_service || it.type === "service" || it.type === "Service";
      if (isService) {
        serviceSales[name] = (serviceSales[name] || 0) + (it.quantity || 1);
      } else {
        productSales[name] = (productSales[name] || 0) + (it.quantity || 1);
      }
    });
  });
  const topProducts = Object.entries(productSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topServices = Object.entries(serviceSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Category Distribution
  const catDist = products.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  const periodPill = (type, label) => (
    <button
      onClick={() => setFilterPeriod(type)}
      className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${filterPeriod === type
        ? "bg-eminence-gold text-white shadow-md scale-105"
        : "bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-gray-100"
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-gray-800">Business Analytics</h2>
          <p className="text-xs text-eminence-muted">Analyze inventory values, stock levels, category distribution, and service popularity.</p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2 bg-white/80 border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <span className="text-[10px] font-bold text-eminence-gold uppercase tracking-wider">Branch Filter:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer"
            >
              <option value="">All Branches</option>
              {branches.map(b => {
                const name = typeof b === "string" ? b : b.name;
                return <option key={name} value={name}>{name}</option>;
              })}
            </select>
          </div>
        )}
      </div>

      {/* Date Filtering Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {periodPill("WEEKLY", "Weekly")}
          {periodPill("MONTHLY", "Monthly")}
          {periodPill("QUARTERLY", "Quarterly")}
          {periodPill("CUSTOM", "Custom Range")}
        </div>

        {filterPeriod === "CUSTOM" && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-1 duration-200">
            <input
              type="date"
              value={customFromDate}
              onChange={e => setCustomFromDate(e.target.value)}
              className="bg-eminence-surface border border-eminence-border rounded-lg px-3 py-1.5 text-xs text-eminence-text focus:outline-none focus:border-eminence-gold"
            />
            <span className="text-xs text-eminence-muted font-bold">TO</span>
            <input
              type="date"
              value={customToDate}
              onChange={e => setCustomToDate(e.target.value)}
              className="bg-eminence-surface border border-eminence-border rounded-lg px-3 py-1.5 text-xs text-eminence-text focus:outline-none focus:border-eminence-gold"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-8 rounded-2xl border-l-4 border-l-eminence-gold">
          <p className="overline mb-2">Inventory Valuation</p>
          <p className="text-4xl font-serif text-eminence-gold">₹{totalStockValue.toLocaleString("en-IN")}</p>
          <p className="text-xs text-eminence-muted mt-3">Total value of all stock items in current inventory</p>
        </div>
        <div className="glass-card p-8 rounded-2xl border-l-4 border-l-red-500">
          <p className="overline mb-2 text-red-600 font-bold">Stock Health</p>
          <div className="flex justify-between items-end mt-2">
            <div>
              <p className="text-4xl font-serif text-red-700">{outOfStock}</p>
              <p className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Out of Stock</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-serif text-orange-700">{lowStock}</p>
              <p className="text-[10px] uppercase font-bold text-orange-500 tracking-wider">Low Stock</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-8 rounded-2xl border-l-4 border-l-gray-900">
          <p className="overline mb-2">Total Units</p>
          <p className="text-4xl font-serif text-gray-900">{products.reduce((acc, p) => acc + (p.stock || 0), 0)}</p>
          <p className="text-xs text-eminence-muted mt-3">Total pieces currently across all categories</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* TOP PRODUCTS */}
        <div className="eminence-card p-8">
          <h3 className="font-serif text-2xl mb-8">Best Selling Products</h3>
          <div className="space-y-6">
            {topProducts.map(([name, qty], idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-eminence-surface flex items-center justify-center font-serif text-eminence-gold border border-eminence-gold/20">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium line-clamp-1">{name}</p>
                  <div className="w-full bg-eminence-border/30 h-1.5 mt-2 rounded-full overflow-hidden">
                    <div
                      className="bg-eminence-gold h-full transition-all duration-1000"
                      style={{ width: topProducts[0] ? `${(qty / topProducts[0][1]) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
                <p className="text-sm font-bold text-eminence-muted">{qty} Sold</p>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-eminence-muted italic text-sm">No sales data yet.</p>}
          </div>
        </div>

        {/* TOP SERVICES */}
        <div className="eminence-card p-8">
          <h3 className="font-serif text-2xl mb-8">Most Given Services</h3>
          <div className="space-y-6">
            {topServices.map(([name, qty], idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-eminence-surface flex items-center justify-center font-serif text-eminence-gold border border-eminence-gold/20">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium line-clamp-1">{name}</p>
                  <div className="w-full bg-eminence-border/30 h-1.5 mt-2 rounded-full overflow-hidden">
                    <div
                      className="bg-eminence-gold h-full transition-all duration-1000"
                      style={{ width: topServices[0] ? `${(qty / topServices[0][1]) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
                <p className="text-sm font-bold text-eminence-muted">{qty} Sessions</p>
              </div>
            ))}
            {topServices.length === 0 && <p className="text-eminence-muted italic text-sm">No service data yet.</p>}
          </div>
        </div>
      </div>

      {/* CATEGORY ANALYSIS */}
      <div className="eminence-card p-8">
        <h3 className="font-serif text-2xl mb-8">Stock by Category</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(catDist).map(([cat, count]) => (
            <div key={cat} className="flex justify-between items-center py-3 border-b border-eminence-border/50">
              <span className="text-xs uppercase tracking-widest text-eminence-muted">{cat}</span>
              <span className="font-serif text-lg">{count} <span className="text-[10px] text-eminence-muted uppercase font-sans">SKUs</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Overview({ stats, products, leads = [], employees = [], t, maintenanceEnabled, onToggleMaintenance, selectedBranch, setSelectedBranch, branches = [], isSuperAdmin }) {
  const [selectedDailyDetail, setSelectedDailyDetail] = useState(null);
  const [leadsPeriod, setLeadsPeriod] = useState("today");
  const [leadsSalesPerson, setLeadsSalesPerson] = useState("all");
  const [leadsSearchQuery, setLeadsSearchQuery] = useState("");

  const getTodayDateStr = () => {
    // Use IST (UTC+5:30) to match server-side date calculations
    const d = new Date();
    const istOffset = 5 * 60 + 30; // minutes
    const utcMs = d.getTime() + (d.getTimezoneOffset() * 60 * 1000);
    const istMs = utcMs + (istOffset * 60 * 1000);
    return new Date(istMs).toISOString().slice(0, 10);
  };
  const todayDateStr = getTodayDateStr();

  const uniqueSalesPersons = React.useMemo(() => {
    const names = new Set(leads.map(l => l.assigned_to_name).filter(Boolean));
    return Array.from(names).sort();
  }, [leads]);

  const filteredLeads = React.useMemo(() => {
    const getFilterStartDate = (filterType) => {
      const d = new Date();
      if (filterType === "today") {
        return todayDateStr;
      }
      if (filterType === "weekly") {
        d.setDate(d.getDate() - 7);
      } else if (filterType === "monthly") {
        d.setDate(d.getDate() - 30);
      } else if (filterType === "quarterly") {
        d.setDate(d.getDate() - 90);
      } else if (filterType === "yearly") {
        d.setDate(d.getDate() - 365);
      } else if (filterType === "all") {
        return null;
      }
      return d.toISOString().slice(0, 10);
    };

    let result = leads;

    if (leadsPeriod === "today") {
      result = result.filter(l => l.created_at?.slice(0, 10) === todayDateStr);
    } else {
      const startLimit = getFilterStartDate(leadsPeriod);
      if (startLimit) {
        result = result.filter(l => l.created_at && l.created_at.slice(0, 10) >= startLimit);
      }
    }

    if (leadsSalesPerson !== "all") {
      if (leadsSalesPerson === "unassigned") {
        result = result.filter(l => !l.assigned_to_name);
      } else {
        result = result.filter(l => l.assigned_to_name === leadsSalesPerson);
      }
    }

    if (leadsSearchQuery.trim()) {
      const q = leadsSearchQuery.toLowerCase().trim();
      result = result.filter(l =>
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q))
      );
    }

    return result;
  }, [leads, leadsPeriod, leadsSalesPerson, leadsSearchQuery, todayDateStr]);

  const todayLeads = React.useMemo(() => leads.filter(l => l.created_at?.slice(0, 10) === todayDateStr), [leads, todayDateStr]);
  const dailyLeadsCount = todayLeads.length;

  return (
    <div className="space-y-10">

      {/* Today's Operations Tracker (Live Operations Monitor) */}
      <div className="space-y-6 bg-eminence-surface/30 p-6 rounded-3xl border border-eminence-border/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <h3 className="font-serif text-2xl text-gray-800">Today's Operations Tracker</h3>
              <p className="text-xs text-eminence-muted">Real-time overview of salon traffic, sales, and lead generation for today ({todayDateStr})</p>
            </div>
            {isSuperAdmin && (
              <div className="flex items-center gap-2 bg-white/80 border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
                <span className="text-[10px] font-bold text-eminence-gold uppercase tracking-wider">Branch Filter:</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer"
                >
                  <option value="">All Branches</option>
                  {branches.map(b => {
                    const name = typeof b === "string" ? b : b.name;
                    return <option key={name} value={name}>{name}</option>;
                  })}
                </select>
              </div>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 animate-pulse bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 w-fit">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> LIVE MONITOR
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Daily CRM & Lead Sales Card */}
          <div
            onClick={() => setSelectedDailyDetail(selectedDailyDetail === "SALES" ? null : "SALES")}
            className={`glass-card p-6 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:translate-y-[-2px] ${selectedDailyDetail === "SALES"
              ? "border-eminence-gold bg-eminence-gold/5 shadow-[0_4px_20px_rgba(212,175,55,0.15)] scale-102"
              : "border-gray-100 bg-white hover:border-eminence-gold/40 shadow-sm"
              }`}
          >
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="overline text-[10px] text-eminence-gold font-bold">Daily CRM & Lead Sales</span>
                <span className="text-[9px] font-bold text-eminence-muted uppercase">Today</span>
              </div>
              <h4 className="font-serif text-2xl text-gray-900">₹{(stats?.daily_sales || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h4>
            </div>
            <div className="mt-4 pt-3 border-t border-eminence-border/10 flex justify-between items-center text-[10px] text-eminence-muted font-bold">
              <span>{stats?.daily_sales_details?.length || 0} Transactions</span>
              <span className="text-eminence-gold uppercase tracking-wider">View Details</span>
            </div>
          </div>

          {/* Daily Service Billing Card */}
          <div
            onClick={() => setSelectedDailyDetail(selectedDailyDetail === "SERVICES" ? null : "SERVICES")}
            className={`glass-card p-6 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:translate-y-[-2px] ${selectedDailyDetail === "SERVICES"
              ? "border-emerald-600 bg-emerald-50/20 shadow-[0_4px_20px_rgba(16,185,129,0.15)] scale-102"
              : "border-gray-100 bg-white hover:border-emerald-600/40 shadow-sm"
              }`}
          >
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="overline text-[10px] text-emerald-600 font-bold">Daily Service Revenue</span>
                <span className="text-[9px] font-bold text-eminence-muted uppercase">Today</span>
              </div>
              <h4 className="font-serif text-2xl text-emerald-700">₹{(stats?.daily_services || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h4>
            </div>
            <div className="mt-4 pt-3 border-t border-eminence-border/10 flex justify-between items-center text-[10px] text-eminence-muted font-bold">
              <span>{stats?.daily_services_details?.length || 0} Bills</span>
              <span className="text-emerald-600 uppercase tracking-wider">View Details</span>
            </div>
          </div>

          {/* Daily Online Product Sales Card */}
          <div
            onClick={() => setSelectedDailyDetail(selectedDailyDetail === "ONLINE_PRODUCTS" ? null : "ONLINE_PRODUCTS")}
            className={`glass-card p-6 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:translate-y-[-2px] ${selectedDailyDetail === "ONLINE_PRODUCTS"
              ? "border-indigo-500 bg-indigo-50/10 shadow-[0_4px_20px_rgba(99,102,241,0.15)] scale-102"
              : "border-gray-100 bg-white hover:border-indigo-500/40 shadow-sm"
              }`}
          >
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="overline text-[10px] text-indigo-500 font-bold">Daily Online Product Sales</span>
                <span className="text-[9px] font-bold text-eminence-muted uppercase">Today</span>
              </div>
              <h4 className="font-serif text-2xl text-indigo-700">₹{(stats?.daily_website_products || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h4>
            </div>
            <div className="mt-4 pt-3 border-t border-eminence-border/10 flex justify-between items-center text-[10px] text-eminence-muted font-bold">
              <span>{stats?.daily_website_products_details?.length || 0} Orders</span>
              <span className="text-indigo-500 uppercase tracking-wider">View Details</span>
            </div>
          </div>

          {/* Daily Leads Count Card */}
          <div
            onClick={() => setSelectedDailyDetail(selectedDailyDetail === "LEADS" ? null : "LEADS")}
            className={`glass-card p-6 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:translate-y-[-2px] ${selectedDailyDetail === "LEADS"
              ? "border-teal-500 bg-teal-50/10 shadow-[0_4px_20px_rgba(20,184,166,0.15)] scale-102"
              : "border-gray-100 bg-white hover:border-teal-500/40 shadow-sm"
              }`}
          >
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="overline text-[10px] text-teal-600 font-bold">
                  {leadsPeriod === "today" ? "Daily" : leadsPeriod === "weekly" ? "Weekly" : leadsPeriod === "monthly" ? "Monthly" : leadsPeriod === "quarterly" ? "Quarterly" : leadsPeriod === "yearly" ? "Yearly" : "All"} Leads Count
                </span>
                <span className="text-[9px] font-bold text-eminence-muted uppercase">
                  {leadsPeriod === "today" ? "Today" : leadsPeriod === "weekly" ? "7 Days" : leadsPeriod === "monthly" ? "30 Days" : leadsPeriod === "quarterly" ? "90 Days" : leadsPeriod === "yearly" ? "365 Days" : "All Time"}
                </span>
              </div>
              <h4 className="font-serif text-2xl text-teal-700">{filteredLeads.length} Leads</h4>
            </div>
            <div className="mt-4 pt-3 border-t border-eminence-border/10 flex justify-between items-center text-[10px] text-eminence-muted font-bold">
              <span>{leadsPeriod === "today" ? "Fresh inquiries" : `Filtered (${leadsPeriod})`}</span>
              <span className="text-teal-600 uppercase tracking-wider">View Details</span>
            </div>
          </div>
        </div>

        {/* Selected Details Expansion Area */}
        {selectedDailyDetail && (
          <div className="eminence-card p-6 bg-white border border-gray-200 rounded-2xl shadow-md animate-in fade-in slide-in-from-top-2 duration-300 relative">
            <button
              onClick={() => setSelectedDailyDetail(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
            >
              ✕
            </button>

            {/* Details for Sales */}
            {selectedDailyDetail === "SALES" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-serif text-lg text-gray-800">Daily CRM Lead Sales & Manual Sales Records</h4>
                  <p className="text-xs text-eminence-muted">Detailed transactions logged today via CRM conversion or manual entry</p>
                </div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-[10px] uppercase text-eminence-muted tracking-wider bg-eminence-surface/50 border-b border-eminence-border/10">
                        <th className="px-4 py-2.5">Date/Time</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Client / Lead Name</th>
                        <th className="px-4 py-2.5">Transaction Details</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.daily_sales_details?.map((item, idx) => (
                        <tr key={idx} className="border-b border-eminence-border/10 hover:bg-eminence-surface/10">
                          <td className="px-4 py-3 font-mono text-[10px] text-gray-500">
                            {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "N/A"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              {item.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 text-gray-600">{item.details}</td>
                          <td className="px-4 py-3 text-right font-serif font-bold text-emerald-700">+₹{item.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      {(!stats?.daily_sales_details || stats.daily_sales_details.length === 0) && (
                        <tr>
                          <td colSpan="5" className="text-center py-8 text-eminence-muted italic">No sales transactions logged today.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Details for Services */}
            {selectedDailyDetail === "SERVICES" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-serif text-lg text-gray-800">Daily Service Billing Records</h4>
                  <p className="text-xs text-eminence-muted">Service checkout invoices generated in the salon today</p>
                </div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-[10px] uppercase text-eminence-muted tracking-wider bg-eminence-surface/50 border-b border-eminence-border/10">
                        <th className="px-4 py-2.5">Billing Time</th>
                        <th className="px-4 py-2.5">Invoice ID</th>
                        <th className="px-4 py-2.5">Client Name</th>
                        <th className="px-4 py-2.5">Services</th>
                        <th className="px-4 py-2.5">Service Provider</th>
                        <th className="px-4 py-2.5">Payment Mode</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.daily_services_details?.map((item, idx) => {
                        const serviceItems = item.items?.filter(it => it.is_service || it.type === "service") || [];
                        const serviceNames = serviceItems.map(it => `${it.name} (x${it.quantity})`).join(", ") || "—";
                        const providerNames = serviceItems.map(it => {
                          const emp = employees.find(e => e.id === it.service_provider);
                          return emp ? emp.name : (it.service_provider || "—");
                        }).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "—";

                        const getPaymentMode = (notes) => {
                          if (!notes) return "—";
                          const match = notes.match(/Payment:\s*([^|]+)/i);
                          return match ? match[1].trim() : "—";
                        };
                        const paymentMode = getPaymentMode(item.notes);

                        return (
                          <tr key={idx} className="border-b border-eminence-border/10 hover:bg-eminence-surface/10">
                            <td className="px-4 py-3 font-mono text-[10px] text-gray-500">
                              {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "N/A"}
                            </td>
                            <td className="px-4 py-3 font-mono text-[10px] text-gray-600 truncate max-w-[100px]">{item.id}</td>
                            <td className="px-4 py-3 font-bold text-gray-800">{item.name}</td>
                            <td className="px-4 py-3 text-gray-600 font-medium">{serviceNames}</td>
                            <td className="px-4 py-3 text-gray-600 font-medium">{providerNames}</td>
                            <td className="px-4 py-3 text-gray-600">
                              <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {paymentMode}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-serif font-bold text-emerald-700">+₹{item.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                      {(!stats?.daily_services_details || stats.daily_services_details.length === 0) && (
                        <tr>
                          <td colSpan="7" className="text-center py-8 text-eminence-muted italic">No service bills generated today.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Details for Online Products */}
            {selectedDailyDetail === "ONLINE_PRODUCTS" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-serif text-lg text-gray-800">Daily Website Online Product Sales</h4>
                  <p className="text-xs text-eminence-muted">E-commerce store orders placed online by guests or users today</p>
                </div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-[10px] uppercase text-eminence-muted tracking-wider bg-eminence-surface/50 border-b border-eminence-border/10">
                        <th className="px-4 py-2.5">Order Time</th>
                        <th className="px-4 py-2.5">Order ID</th>
                        <th className="px-4 py-2.5">Client Name</th>
                        <th className="px-4 py-2.5">Summary / Notes</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.daily_website_products_details?.map((item, idx) => (
                        <tr key={idx} className="border-b border-eminence-border/10 hover:bg-eminence-surface/10">
                          <td className="px-4 py-3 font-mono text-[10px] text-gray-500">
                            {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "N/A"}
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-gray-600 truncate max-w-[100px]">{item.id}</td>
                          <td className="px-4 py-3 font-bold text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 text-gray-600">{item.details}</td>
                          <td className="px-4 py-3 text-right font-serif font-bold text-indigo-700">+₹{item.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      {(!stats?.daily_website_products_details || stats.daily_website_products_details.length === 0) && (
                        <tr>
                          <td colSpan="5" className="text-center py-8 text-eminence-muted italic">No online product orders placed today.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Details for Leads */}
            {selectedDailyDetail === "LEADS" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-eminence-border/10 pb-3">
                  <div>
                    <h4 className="font-serif text-lg text-gray-800">Leads Count Details ({leadsPeriod === "all" ? "All" : leadsPeriod.toUpperCase()})</h4>
                    <p className="text-xs text-eminence-muted">Client lead inquiries registered in the selected period</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-eminence-muted">Search:</span>
                      <input
                        type="text"
                        placeholder="Search name or mobile..."
                        value={leadsSearchQuery}
                        onChange={(e) => setLeadsSearchQuery(e.target.value)}
                        className="bg-eminence-surface border border-eminence-border px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:border-eminence-gold transition-colors w-44"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-eminence-muted">Sales Person:</span>
                      <select
                        value={leadsSalesPerson}
                        onChange={(e) => setLeadsSalesPerson(e.target.value)}
                        className="bg-eminence-surface border border-eminence-border px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:border-eminence-gold transition-colors"
                      >
                        <option value="all">All</option>
                        {uniqueSalesPersons.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value="unassigned">Unassigned</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-eminence-muted">Period:</span>
                      <select
                        value={leadsPeriod}
                        onChange={(e) => setLeadsPeriod(e.target.value)}
                        className="bg-eminence-surface border border-eminence-border px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:border-eminence-gold transition-colors"
                      >
                        <option value="today">Today</option>
                        <option value="weekly">Weekly (Last 7 Days)</option>
                        <option value="monthly">Monthly (Last 30 Days)</option>
                        <option value="quarterly">Quarterly (Last 90 Days)</option>
                        <option value="yearly">Yearly (Last 365 Days)</option>
                        <option value="all">All Time</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-[10px] uppercase text-eminence-muted tracking-wider bg-eminence-surface/50 border-b border-eminence-border/10">
                        <th className="px-4 py-2.5">Date/Time</th>
                        <th className="px-4 py-2.5">Name</th>
                        <th className="px-4 py-2.5">Phone Number</th>
                        <th className="px-4 py-2.5">Branch</th>
                        <th className="px-4 py-2.5">Source</th>
                        <th className="px-4 py-2.5">Sales Person</th>
                        <th className="px-4 py-2.5">Call Time</th>
                        <th className="px-4 py-2.5">Lead Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((item, idx) => (
                        <tr key={idx} className="border-b border-eminence-border/10 hover:bg-eminence-surface/10">
                          <td className="px-4 py-3 font-mono text-[10px] text-gray-500 font-bold">
                            {item.created_at ? new Date(item.created_at).toLocaleString() : "N/A"}
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 font-mono text-xs">{item.phone}</td>
                          <td className="px-4 py-3 font-bold text-gray-600">{item.branch || "—"}</td>
                          <td className="px-4 py-3 text-gray-500">{item.source || "—"}</td>
                          <td className="px-4 py-3 text-gray-700 font-medium">{item.assigned_to_name || "—"}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {(() => {
                              const sec = item.talk_time;
                              if (!sec || sec <= 0) return "—";
                              const m = Math.floor(sec / 60);
                              const s = sec % 60;
                              return m > 0 ? `${m}m ${s}s` : `${s}s`;
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold bg-teal-50 text-teal-700 border border-teal-200">
                              {item.status || "new"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredLeads.length === 0 && (
                        <tr>
                          <td colSpan="8" className="text-center py-8 text-eminence-muted italic">No leads found in this period.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SALES TEAM OVERVIEW ── */}
      {isSuperAdmin && (
        <SalesTeamOverview leads={leads} employees={employees} todayDateStr={todayDateStr} selectedBranch={selectedBranch} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="eminence-card p-6 border-l-4 border-red-500 flex flex-col justify-between">
          <div>
            <p className="overline mb-4 text-red-500">{t("stock")} Alerts</p>
            <div className="space-y-3">
              {products.filter(p => p.stock <= 5).map((p) => (
                <div key={p.id} className="flex justify-between text-sm items-center bg-red-50 p-3 rounded">
                  <div>
                    <p className="font-bold text-red-900">{p.name}</p>
                    <p className="text-xs text-red-700">{t("category")}: {p.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-lg text-red-600">{p.stock} {t("units")}</p>
                    <p className="text-[10px] uppercase font-bold text-red-400">Critical</p>
                  </div>
                </div>
              ))}
              {products.filter(p => p.stock <= 5).length === 0 && <p className="text-eminence-muted text-sm italic">All items are sufficiently stocked.</p>}
            </div>
          </div>
        </div>

        <div className="eminence-card p-6 flex flex-col justify-between">
          <div>
            <p className="overline mb-4">{t("recentOrders")}</p>
            <div className="space-y-2">
              {stats.recent_orders.map((o) => (
                <div key={o.id} className="flex justify-between text-sm border-b border-eminence-border py-2">
                  <span>{o.full_name || o.user_name} · <span className="text-eminence-muted">#{o.id.slice(0, 8)}</span></span>
                  <span className="text-eminence-gold">₹{o.total.toLocaleString("en-IN")}</span>
                </div>
              ))}
              {stats.recent_orders.length === 0 && <p className="text-eminence-muted text-sm">{t("noOrders")}</p>}
            </div>
          </div>
        </div>

        <div className="eminence-card p-6 border-l-4 border-eminence-gold flex flex-col justify-between">
          <div>
            <p className="overline mb-4 text-eminence-gold">Atelier Status</p>
            <h3 className="text-lg font-bold mb-2">Maintenance Mode</h3>
            <p className="text-xs text-eminence-muted leading-relaxed">
              When enabled, regular customers visiting the site will see a premium "Under Maintenance" page. Staff can still bypass this to manage orders, bookings, and test changes.
            </p>
          </div>
          <div className="mt-6">
            <button
              onClick={onToggleMaintenance}
              className={`w-full py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${maintenanceEnabled
                ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md font-semibold"
                : "bg-eminence-gold text-black hover:bg-[#c5a030] shadow-md font-semibold"
                }`}
            >
              {maintenanceEnabled ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
            </button>
          </div>
        </div>
      </div>


    </div>
  );
}



function SalesTeamOverview({ leads = [], employees = [], todayDateStr, selectedBranch }) {
  const [openPerson, setOpenPerson] = useState(null);
  const [personLeadFilter, setPersonLeadFilter] = useState({});

  // Build per-salesperson stats from leads
  const salesPersons = React.useMemo(() => {
    const map = {};
    const filteredLeads = selectedBranch ? leads.filter(l => l.branch === selectedBranch) : leads;
    filteredLeads.forEach(lead => {
      const name = lead.assigned_to_name;
      if (!name) return;
      if (!map[name]) {
        map[name] = {
          name,
          branch: lead.branch || "—",
          section: lead.section || "—",
          total: 0,
          new: 0,
          in_process: 0,
          visit: 0,
          visited: 0,
          token_received: 0,
          converted: 0,
          dead: 0,
          recycled: 0,
          hot: 0,
          warm: 0,
          cold: 0,
          overdue: 0,
          due_today: 0,
          follow_up_set: 0,
          total_sale_amount: 0,
        };
      }
      const p = map[name];
      p.total++;
      const s = (lead.status || "").toLowerCase();
      if (s === "new") p.new++;
      else if (s === "in process") p.in_process++;
      else if (s === "visit") p.visit++;
      else if (s === "visited") p.visited++;
      else if (s === "token received") p.token_received++;
      else if (s === "converted") p.converted++;
      else if (s === "dead") p.dead++;
      else if (s === "recycled") p.recycled++;

      const g = (lead.grade || "").toLowerCase();
      if (g === "hot") p.hot++;
      else if (g === "warm") p.warm++;
      else if (g === "cold") p.cold++;

      if (lead.follow_up_date) {
        p.follow_up_set++;
        if (lead.follow_up_date < todayDateStr && !["converted", "dead"].includes(s)) p.overdue++;
        if (lead.follow_up_date === todayDateStr) p.due_today++;
      }

      if (lead.total_sale_amount) p.total_sale_amount += parseFloat(lead.total_sale_amount) || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [leads, selectedBranch, todayDateStr]);

  if (salesPersons.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-2xl text-gray-800">Sales Team Overview</h3>
          <p className="text-xs text-eminence-muted mt-1">Click on a salesperson to expand their detailed panel</p>
        </div>
        <span className="text-xs font-bold text-eminence-gold bg-eminence-gold/10 px-3 py-1 rounded-full border border-eminence-gold/20">
          {salesPersons.length} Sales Members
        </span>
      </div>

      <div className="space-y-3">
        {salesPersons.map(person => {
          const isOpen = openPerson === person.name;
          const convRate = person.total > 0 ? ((person.converted / person.total) * 100).toFixed(1) : "0.0";
          return (
            <div key={person.name} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
              {/* Header Row - Clickable */}
              <button
                onClick={() => setOpenPerson(isOpen ? null : person.name)}
                className="w-full flex items-center justify-between md:grid md:grid-cols-12 px-6 py-4 hover:bg-gray-50/70 transition-colors"
              >
                <div className="flex items-center gap-4 md:col-span-4 text-left">
                  <div className="w-10 h-10 rounded-full bg-eminence-gold/10 text-eminence-gold flex items-center justify-center font-bold text-lg border border-eminence-gold/20 flex-shrink-0">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-900 text-sm">{person.name}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">{person.branch} · {person.section}</p>
                  </div>
                </div>

                {/* Quick Stats Row */}
                <div className="hidden md:grid md:grid-cols-6 md:col-span-7 gap-4">
                  <div className="text-center">
                    <p className="text-xs font-bold text-gray-900">{person.total}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-emerald-600">{person.converted}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Converted</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-red-500">{person.overdue}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Overdue</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-amber-600">{person.due_today}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Due Today</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-blue-600">{convRate}%</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Conv. Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-eminence-gold">₹{person.total_sale_amount.toLocaleString("en-IN")}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Sales</p>
                  </div>
                </div>

                <div className={`ml-4 text-gray-400 transition-transform duration-300 md:col-span-1 md:flex md:justify-end ${isOpen ? "rotate-180" : ""}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </button>

              {/* Expanded Detail Panel */}
              {isOpen && (
                <div className="border-t border-gray-100 px-6 py-5 bg-gray-50/50 animate-fade-in">
                  {/* 3-column dashboard like SalesPanel */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                    {/* Open Panel */}
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                      <div className="px-4 py-3 bg-blue-50/80 border-b border-blue-100">
                        <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                          Open Panel
                        </h4>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-3">
                        <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                          <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Overdues</p>
                          <p className="text-xl font-bold text-red-700">{person.overdue}</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                          <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Due Today</p>
                          <p className="text-xl font-bold text-amber-800">{person.due_today}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Assigned</p>
                          <p className="text-xl font-bold text-gray-900">{person.total}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Hot / Warm</p>
                          <p className="text-xl font-bold text-blue-800">{person.hot + person.warm}</p>
                        </div>
                      </div>
                    </div>

                    {/* Pipeline Status Panel */}
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                      <div className="px-4 py-3 bg-purple-50/80 border-b border-purple-100">
                        <h4 className="text-[10px] font-bold text-purple-700 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                          Pipeline Status
                        </h4>
                      </div>
                      <div className="p-4 space-y-2">
                        {[
                          { label: "New", val: person.new, color: "bg-blue-500" },
                          { label: "In Process", val: person.in_process, color: "bg-amber-500" },
                          { label: "Visit Scheduled", val: person.visit, color: "bg-purple-500" },
                          { label: "Visited", val: person.visited, color: "bg-indigo-500" },
                          { label: "Token Received", val: person.token_received, color: "bg-teal-500" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="flex justify-between mb-0.5">
                                <span className="text-[10px] text-gray-600">{label}</span>
                                <span className="text-[10px] font-bold text-gray-900">{val}</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full ${color} rounded-full`} style={{ width: person.total > 0 ? `${(val / person.total) * 100}%` : "0%" }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Result Panel */}
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                      <div className="px-4 py-3 bg-emerald-50/80 border-b border-emerald-100">
                        <h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          Results
                        </h4>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-3">
                        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                          <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Converted</p>
                          <p className="text-xl font-bold text-emerald-700">{person.converted}</p>
                        </div>
                        <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wider">Dead</p>
                          <p className="text-xl font-bold text-rose-700">{person.dead}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Recycled</p>
                          <p className="text-xl font-bold text-gray-700">{person.recycled}</p>
                        </div>
                        <div className="p-3 bg-eminence-gold/10 rounded-lg border border-eminence-gold/20">
                          <p className="text-[9px] font-bold text-eminence-gold uppercase tracking-wider">Conv. Rate</p>
                          <p className="text-xl font-bold text-gray-900">{convRate}%</p>
                        </div>
                        <div className="col-span-2 p-3 bg-gray-900 rounded-lg">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total Sales</p>
                          <p className="text-lg font-bold text-eminence-gold">₹{person.total_sale_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Grade breakdown */}
                  <div className="mt-4 flex items-center gap-3 flex-wrap">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Lead Grades:</span>
                    <span className="px-3 py-1 bg-red-500 text-white text-[10px] font-bold rounded-full">🔥 Hot: {person.hot}</span>
                    <span className="px-3 py-1 bg-orange-400 text-white text-[10px] font-bold rounded-full">🌡 Warm: {person.warm}</span>
                    <span className="px-3 py-1 bg-blue-400 text-white text-[10px] font-bold rounded-full">❄ Cold: {person.cold}</span>
                    <span className="px-3 py-1 bg-gray-200 text-gray-700 text-[10px] font-bold rounded-full">📅 Follow-ups Set: {person.follow_up_set}</span>
                  </div>

                  {/* Individual Leads Table */}
                  {(() => {
                    const allPersonLeads = leads.filter(l => l.assigned_to_name === person.name);
                    if (allPersonLeads.length === 0) return null;

                    const currentFilter = personLeadFilter[person.name] || "all";
                    const getFilterDate = (f) => {
                      const d = new Date();
                      if (f === "today") return todayDateStr;
                      if (f === "weekly") { d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
                      if (f === "monthly") { d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
                      if (f === "quarterly") { d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); }
                      return null;
                    };

                    let personLeads = allPersonLeads;
                    if (currentFilter === "today") {
                      personLeads = allPersonLeads.filter(l => l.created_at?.slice(0, 10) === todayDateStr);
                    } else if (currentFilter !== "all") {
                      const startDate = getFilterDate(currentFilter);
                      if (startDate) personLeads = allPersonLeads.filter(l => l.created_at && l.created_at.slice(0, 10) >= startDate);
                    }

                    const filterLabel = { all: "All Time", today: "Today", weekly: "Last 7 Days", monthly: "Last 30 Days", quarterly: "Last 90 Days" };

                    return (
                      <div className="mt-5 bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <h4 className="text-[10px] font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
                            Leads ({personLeads.length})
                            {currentFilter !== "all" && <span className="text-[9px] font-normal text-gray-400 ml-1">· {filterLabel[currentFilter]}</span>}
                          </h4>
                          <div className="flex items-center gap-1.5">
                            {["all", "today", "weekly", "monthly", "quarterly"].map(f => (
                              <button
                                key={f}
                                onClick={(e) => { e.stopPropagation(); setPersonLeadFilter(prev => ({ ...prev, [person.name]: f })); }}
                                className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${currentFilter === f
                                  ? "bg-gray-800 text-white shadow-sm"
                                  : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-100"
                                  }`}
                              >
                                {f === "all" ? "All" : f === "today" ? "Today" : f === "weekly" ? "Weekly" : f === "monthly" ? "Monthly" : "Quarterly"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="text-[9px] uppercase text-gray-400 tracking-wider bg-gray-50/80 border-b border-gray-100 sticky top-0">
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Phone</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Grade</th>
                                <th className="px-3 py-2">Source</th>
                                <th className="px-3 py-2">Follow-up</th>
                                <th className="px-3 py-2 text-right">Sale ₹</th>
                              </tr>
                            </thead>
                            <tbody>
                              {personLeads.length === 0 && (
                                <tr><td colSpan="8" className="text-center py-6 text-gray-400 italic text-xs">No leads found for this period.</td></tr>
                              )}
                              {personLeads.map((ld, idx) => {
                                const statusColors = {
                                  "new": "bg-blue-50 text-blue-700 border-blue-200",
                                  "in process": "bg-amber-50 text-amber-700 border-amber-200",
                                  "visit": "bg-purple-50 text-purple-700 border-purple-200",
                                  "visited": "bg-indigo-50 text-indigo-700 border-indigo-200",
                                  "token received": "bg-teal-50 text-teal-700 border-teal-200",
                                  "converted": "bg-emerald-50 text-emerald-700 border-emerald-200",
                                  "dead": "bg-rose-50 text-rose-700 border-rose-200",
                                  "recycled": "bg-gray-100 text-gray-600 border-gray-200",
                                };
                                const gradeIcons = { hot: "🔥", warm: "🌡", cold: "❄" };
                                const st = (ld.status || "new").toLowerCase();
                                const gr = (ld.grade || "").toLowerCase();
                                const isOverdue = ld.follow_up_date && ld.follow_up_date < todayDateStr && !["converted", "dead"].includes(st);
                                return (
                                  <tr key={ld.id || idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                                    <td className="px-3 py-2 text-[10px] text-gray-400 font-mono">{idx + 1}</td>
                                    <td className="px-3 py-2 font-bold text-gray-800">{ld.name || "—"}</td>
                                    <td className="px-3 py-2 font-mono text-gray-600">{ld.phone || "—"}</td>
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold border ${statusColors[st] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                                        {ld.status || "New"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {gr ? <span className="text-sm" title={gr}>{gradeIcons[gr] || gr}</span> : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">{ld.source || "—"}</td>
                                    <td className={`px-3 py-2 font-mono text-[10px] ${isOverdue ? "text-red-600 font-bold" : "text-gray-500"}`}>
                                      {ld.follow_up_date || "—"}
                                      {isOverdue && <span className="ml-1 text-[8px] text-red-500">⚠</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-700">
                                      {ld.sale_amount ? `₹${parseFloat(ld.sale_amount).toLocaleString("en-IN")}` : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function ClientsSegmentationPanel({ employees = [], appointments = [], refreshAll, t, branches = [] }) {
  const [segments, setSegments] = useState({
    all: [],
    clients: [],
    active: [],
    lapse: [],
    dormant: [],
    churn: [],
    one_time: []
  });
  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [searchParams, setSearchParams] = useState({
    id: "",
    name: "",
    phone: "",
    email: "",
    service: "",
    gender: "All",
    source: "All",
    salesperson: "All"
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedClientIds, setSelectedClientIds] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileClient, setSelectedProfileClient] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState("info");
  const [newNoteText, setNewNoteText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [profileEditForm, setProfileEditForm] = useState({
    name: "",
    phone: "",
    secondary_phone: "",
    email: "",
    gender: "—",
    points: 0,
    wallet: 0,
    branch: "Baroda",
    section: "Men",
    source: "manual",
    grade: "Cold",
    hair_condition: "",
    dob: "",
    anniversary: "",
    address: ""
  });

  const [newClientForm, setNewClientForm] = useState({
    name: "",
    phone: "",
    secondary_phone: "",
    email: "",
    gender: "—",
    points: 0,
    branch: "Baroda",
    section: "Men",
    source: "manual",
    grade: "Cold",
    city: "",
    hair_condition: "",
    notes: "",
    dob: "",
    anniversary: "",
    address: ""
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/clients/segmentation");
      setSegments(res.data);
    } catch (err) {
      toast.error("Failed to load clients segmentation data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getInviteCode = (c) => {
    if (c.invite_code) return c.invite_code;
    const nameClean = (c.name || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
    const namePart = nameClean.slice(0, 4).padEnd(4, "X");
    const idClean = (c.id || "").toUpperCase();
    const idPart = idClean.slice(-4).padEnd(4, "0");
    return `${namePart}_${idPart}`;
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = sortedClients.map(c => c.id);
      setSelectedClientIds(new Set(allIds));
    } else {
      setSelectedClientIds(new Set());
    }
  };

  const handleSelectClient = (id) => {
    const next = new Set(selectedClientIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedClientIds(next);
  };

  const handleAddClientSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newClientForm,
        is_client: true,
        status: "client"
      };
      await api.post("/leads", payload);
      toast.success("Client added successfully!");
      setShowAddModal(false);
      setNewClientForm({
        name: "",
        phone: "",
        secondary_phone: "",
        email: "",
        gender: "—",
        points: 0,
        branch: "Baroda",
        section: "Men",
        source: "manual",
        grade: "Cold",
        city: "",
        hair_condition: "",
        notes: ""
      });
      fetchData();
      if (refreshAll) refreshAll();
    } catch (err) {
      toast.error("Failed to add client. Make sure phone number is unique.");
    }
  };

  const handleViewProfile = async (client) => {
    setIsLoadingProfile(true);
    setShowProfileModal(true);
    setActiveProfileTab("info");
    setIsEditingProfile(false);
    try {
      const res = await api.get(`/leads/${client.id}`);
      setSelectedProfileClient({ ...client, ...res.data });
      setProfileEditForm({
        name: res.data.name || "",
        phone: res.data.phone || "",
        secondary_phone: res.data.secondary_phone || "",
        email: res.data.email || "",
        gender: res.data.gender || "—",
        points: res.data.points || 0,
        wallet: res.data.wallet || 0,
        branch: res.data.branch || "Baroda",
        section: res.data.section || "Men",
        source: res.data.source || "manual",
        grade: res.data.grade || "Cold",
        hair_condition: res.data.hair_condition || "",
        dob: res.data.dob || "",
        anniversary: res.data.anniversary || "",
        address: res.data.address || ""
      });
    } catch (err) {
      toast.error("Failed to load client details");
      setShowProfileModal(false);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await api.patch(`/leads/${selectedProfileClient.id}`, profileEditForm);
      toast.success("Client profile updated!");
      setIsEditingProfile(false);
      // Reload details
      const res = await api.get(`/leads/${selectedProfileClient.id}`);
      setSelectedProfileClient(prev => ({ ...prev, ...res.data }));
      fetchData();
      if (refreshAll) refreshAll();
    } catch (err) {
      toast.error("Failed to save changes");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    setIsSavingNote(true);
    try {
      await api.post(`/leads/${selectedProfileClient.id}/notes`, { text: newNoteText });
      toast.success("Note added!");
      setNewNoteText("");
      // Reload details
      const res = await api.get(`/leads/${selectedProfileClient.id}`);
      setSelectedProfileClient(prev => ({ ...prev, ...res.data }));
    } catch (err) {
      toast.error("Failed to add note");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleExportCSV = (listToExport) => {
    if (listToExport.length === 0) {
      toast.error("No client records to export.");
      return;
    }
    const headers = ["ID", "Name", "Phone", "Email", "Invite Code", "First Visit", "Last Visit", "Last Service", "Last Service Provider", "Last Bill Amount", "Gender", "Points", "Wallet", "Source", "Salesperson"];
    const csvRows = [headers.join(",")];
    listToExport.forEach(c => {
      const row = [
        c.id || "",
        c.name || "",
        c.phone || "",
        c.email || "",
        getInviteCode(c),
        c.first_visit || "—",
        c.last_visit || "—",
        c.last_service || "—",
        c.last_service_provider || "—",
        c.last_bill_amount || 0,
        c.gender || "—",
        c.points || 0,
        c.wallet || 0,
        c.source || "manual",
        c.assigned_to_name || "—"
      ];
      csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `clients_${selectedSegment}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV file exported successfully!");
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) {
          toast.error("CSV file is empty or missing headers");
          setIsImporting(false);
          return;
        }

        const parseCSVLine = (line) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result.map(v => v.replace(/^["']|["']$/g, ""));
        };

        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
        let nameIdx = headers.findIndex(h => h.includes("name"));
        let phoneIdx = headers.findIndex(h => h.includes("phone") || h.includes("contact") || h.includes("number") || h.includes("mobile"));
        let emailIdx = headers.findIndex(h => h.includes("email") || h.includes("mail"));
        let genderIdx = headers.findIndex(h => h.includes("gender") || h.includes("sex"));
        let pointsIdx = headers.findIndex(h => h.includes("points") || h.includes("reward") || h.includes("wallet"));
        let sourceIdx = headers.findIndex(h => h.includes("source"));

        // Fallbacks
        if (nameIdx === -1) nameIdx = 0;
        if (phoneIdx === -1) phoneIdx = 1;

        let successCount = 0;
        let failCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length === 0 || !cols[nameIdx] || !cols[phoneIdx]) {
            failCount++;
            continue;
          }

          const clientData = {
            name: cols[nameIdx],
            phone: cols[phoneIdx],
            email: emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx] : "—",
            gender: genderIdx !== -1 && cols[genderIdx] ? cols[genderIdx] : "—",
            points: pointsIdx !== -1 && cols[pointsIdx] ? parseInt(cols[pointsIdx]) || 0 : 0,
            source: sourceIdx !== -1 && cols[sourceIdx] ? cols[sourceIdx] : "CSV Import",
            is_client: true,
            status: "client",
            branch: "Baroda",
            section: "Men",
            grade: "Cold"
          };

          try {
            await api.post("/leads", clientData);
            successCount++;
          } catch (err) {
            failCount++;
          }
        }

        toast.success(`Import completed: ${successCount} clients imported, ${failCount} skipped/failed.`);
        fetchData();
        if (refreshAll) refreshAll();
      } catch (err) {
        toast.error("Error parsing CSV file");
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
  };

  const sortedClients = React.useMemo(() => {
    let list = segments[selectedSegment] || [];

    // Apply client-side filters
    list = list.filter(c => {
      const matchId = !searchParams.id || (c.id || "").toLowerCase().includes(searchParams.id.toLowerCase());
      const matchName = !searchParams.name || (c.name || "").toLowerCase().includes(searchParams.name.toLowerCase());
      const matchPhone = !searchParams.phone || (c.phone || "").replace(/[^0-9]/g, "").includes(searchParams.phone.replace(/[^0-9]/g, ""));
      const matchEmail = !searchParams.email || (c.email || "").toLowerCase().includes(searchParams.email.toLowerCase());
      const matchService = !searchParams.service || (c.last_service || "").toLowerCase().includes(searchParams.service.toLowerCase());
      const matchGender = searchParams.gender === "All" || (c.gender || "—") === searchParams.gender;
      const matchSource = searchParams.source === "All" || (c.source || "").toLowerCase() === searchParams.source.toLowerCase();
      const matchSales = searchParams.salesperson === "All" || c.assigned_to === searchParams.salesperson || c.assigned_to_name === searchParams.salesperson;
      return matchId && matchName && matchPhone && matchEmail && matchService && matchGender && matchSource && matchSales;
    });

    if (sortConfig.key) {
      return [...list].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'invite_code') {
          aVal = getInviteCode(a);
          bVal = getInviteCode(b);
        }

        if (aVal === undefined || aVal === null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (bVal === undefined || bVal === null) return sortConfig.direction === 'asc' ? -1 : 1;

        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        } else {
          return sortConfig.direction === 'asc'
            ? aVal - bVal
            : bVal - aVal;
        }
      });
    }
    return list;
  }, [segments, selectedSegment, searchParams, sortConfig]);

  const getFormattedDateString = (isoStr) => {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr.slice(0, 10);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return isoStr.slice(0, 10);
    }
  };

  const clientAppointments = React.useMemo(() => {
    if (!selectedProfileClient) return [];
    const phone = selectedProfileClient.phone || "";
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone) return [];
    const phoneKey = cleanPhone.slice(-10);
    return (appointments || []).filter(a => {
      const aPhone = a.customer_phone || a.user_phone || "";
      const aClean = aPhone.replace(/[^0-9]/g, "");
      return aClean.slice(-10) === phoneKey;
    });
  }, [appointments, selectedProfileClient]);

  const renderProfileTabContent = () => {
    if (activeProfileTab === "info") {
      return (
        <form onSubmit={handleSaveProfile} className="space-y-6 animate-fade-in">
          <div className="bg-gray-50/50 border border-gray-150 p-5 rounded-2xl">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">{selectedProfileClient.name} - client since {getFormattedDateString(selectedProfileClient.created_at || selectedProfileClient.first_visit)}</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Client name *</label>
                <input
                  required
                  type="text"
                  value={profileEditForm.name}
                  onChange={e => setProfileEditForm({ ...profileEditForm, name: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Contact number</label>
                <input
                  required
                  type="tel"
                  value={profileEditForm.phone}
                  onChange={e => setProfileEditForm({ ...profileEditForm, phone: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Email ID</label>
                <input
                  type="email"
                  placeholder="Email"
                  value={profileEditForm.email}
                  onChange={e => setProfileEditForm({ ...profileEditForm, email: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Gender</label>
                <select
                  value={profileEditForm.gender}
                  onChange={e => setProfileEditForm({ ...profileEditForm, gender: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="—">Unspecified</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Date of birth</label>
                <input
                  type="date"
                  value={profileEditForm.dob}
                  onChange={e => setProfileEditForm({ ...profileEditForm, dob: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Anniversary</label>
                <input
                  type="date"
                  value={profileEditForm.anniversary}
                  onChange={e => setProfileEditForm({ ...profileEditForm, anniversary: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Address</label>
                <input
                  type="text"
                  placeholder="Address"
                  value={profileEditForm.address}
                  onChange={e => setProfileEditForm({ ...profileEditForm, address: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Source of client</label>
                <select
                  value={profileEditForm.source}
                  onChange={e => setProfileEditForm({ ...profileEditForm, source: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                >
                  <option value="—">-- Select A Type --</option>
                  <option value="manual">Manual</option>
                  <option value="Billing">Billing</option>
                  <option value="Website">Website</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Call">Call</option>
                  <option value="Walk-in">Walk-in</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-gray-50/50 border border-gray-150 p-5 rounded-2xl mt-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Advanced Salon Accounts & Scalp Conditions</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Secondary Contact</label>
                <input
                  type="tel"
                  value={profileEditForm.secondary_phone}
                  onChange={e => setProfileEditForm({ ...profileEditForm, secondary_phone: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Reward Points</label>
                <input
                  type="number"
                  value={profileEditForm.points}
                  onChange={e => setProfileEditForm({ ...profileEditForm, points: parseInt(e.target.value) || 0 })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Wallet Balance (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={profileEditForm.wallet}
                  onChange={e => setProfileEditForm({ ...profileEditForm, wallet: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Lead Grade</label>
                <select
                  value={profileEditForm.grade}
                  onChange={e => setProfileEditForm({ ...profileEditForm, grade: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                >
                  <option value="Hot">Hot</option>
                  <option value="Warm">Warm</option>
                  <option value="Cold">Cold</option>
                </select>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Hair & Scalp Condition</label>
                <input
                  type="text"
                  value={profileEditForm.hair_condition}
                  onChange={e => setProfileEditForm({ ...profileEditForm, hair_condition: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Salon Branch</label>
                <select
                  value={profileEditForm.branch}
                  onChange={e => setProfileEditForm({ ...profileEditForm, branch: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                >
                  {branches.map(b => {
                    const bName = typeof b === "string" ? b : (b?.name || "Unknown");
                    return <option key={bName} value={bName}>{bName}</option>;
                  })}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 tracking-wider">Section</label>
                <select
                  value={profileEditForm.section}
                  onChange={e => setProfileEditForm({ ...profileEditForm, section: e.target.value })}
                  className="w-full border border-gray-200 bg-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                >
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="bg-[#1e293b] hover:bg-slate-800 text-white font-bold text-xs uppercase px-5 py-3 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Check size={14} />
              {isSavingProfile ? "Updating..." : "Update profile"}
            </button>
          </div>
        </form>
      );
    }

    if (activeProfileTab === "appointments") {
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Appointment history</h4>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Appointment ID</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Amount payable</th>
                  <th className="px-4 py-3">Advance paid</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Services</th>
                  <th className="px-4 py-3">Providers</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {clientAppointments.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                  </tr>
                ) : (
                  clientAppointments.map(appt => (
                    <tr key={appt.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">{appt.date} {appt.time}</td>
                      <td className="px-4 py-3">{appt.branch || "—"}</td>
                      <td className="px-4 py-3 font-mono">{appt.id ? appt.id.slice(-8).toUpperCase() : "—"}</td>
                      <td className="px-4 py-3">{appt.source || "Manual"}</td>
                      <td className="px-4 py-3 font-bold">₹{appt.service_price || appt.total || 0}</td>
                      <td className="px-4 py-3">₹{appt.advance_paid || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${appt.status === "Confirmed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          appt.status === "Cancelled" ? "bg-rose-50 text-rose-700 border border-rose-200" :
                            "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                          {appt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[150px] truncate">{appt.service_name || "—"}</td>
                      <td className="px-4 py-3">{appt.stylist_name || "—"}</td>
                      <td className="px-4 py-3 max-w-[150px] truncate">{appt.notes || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeProfileTab === "billing") {
      const ordersList = selectedProfileClient.orders || [];
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Billing history</h4>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Bill id</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Advance</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Pending</th>
                  <th className="px-4 py-3">Installment paid</th>
                  <th className="px-4 py-3">Earned points</th>
                  <th className="px-4 py-3">Services</th>
                  <th className="px-4 py-3">Providers</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {ordersList.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                  </tr>
                ) : (
                  ordersList.map(order => {
                    const services = (order.items || []).filter(it => it.is_service || it.type === "service").map(it => it.name).join(", ");
                    const providers = (order.items || []).map(it => it.service_provider).filter(Boolean).join(", ");
                    const earnedPoints = order.earned_points ?? Math.round((order.total || 0) / 2);
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">{order.created_at ? getLocalDateString(order.created_at) : "—"}</td>
                        <td className="px-4 py-3">{order.branch || "—"}</td>
                        <td className="px-4 py-3 font-mono">#{order.id ? order.id.slice(-8).toUpperCase() : "—"}</td>
                        <td className="px-4 py-3 font-bold">₹{(order.total || 0).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">₹0.00</td>
                        <td className="px-4 py-3">₹{(order.total || 0).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">₹{(order.pending || 0).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">₹0.00</td>
                        <td className="px-4 py-3 text-emerald-600 font-bold">+{earnedPoints}</td>
                        <td className="px-4 py-3 max-w-[150px] truncate">{services || "—"}</td>
                        <td className="px-4 py-3 max-w-[150px] truncate">{providers || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Paid</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeProfileTab === "points") {
      const ordersList = selectedProfileClient.orders || [];
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Reward point history</h4>
            <div className="text-right text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2">
              Pending Points {selectedProfileClient.points || 0}
            </div>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Bill / Appointment ID</th>
                  <th className="px-4 py-3">Point on</th>
                  <th className="px-4 py-3">Transaction type</th>
                  <th className="px-4 py-3">Points</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {ordersList.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                  </tr>
                ) : (
                  ordersList.map(order => {
                    const services = (order.items || []).map(it => it.name).join(", ");
                    const earnedPoints = order.earned_points ?? Math.round((order.total || 0) / 2);
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">{order.created_at ? getLocalDateString(order.created_at) : "—"}</td>
                        <td className="px-4 py-3">{order.branch || "—"}</td>
                        <td className="px-4 py-3 font-mono">#{order.id ? order.id.slice(-8).toUpperCase() : "—"}</td>
                        <td className="px-4 py-3 max-w-[200px] truncate">{services || "—"}</td>
                        <td className="px-4 py-3 text-emerald-600 font-semibold">Credit</td>
                        <td className="px-4 py-3 font-bold text-emerald-700">+{earnedPoints}</td>
                        <td className="px-4 py-3">—</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeProfileTab === "payments") {
      const ordersList = selectedProfileClient.orders || [];
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Payment history</h4>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Bill / Appointment id</th>
                  <th className="px-4 py-3">Total amount</th>
                  <th className="px-4 py-3">Advance</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Pending</th>
                  <th className="px-4 py-3">Appointment id</th>
                  <th className="px-4 py-3">Payment mode</th>
                  <th className="px-4 py-3">Bill type</th>
                  <th className="px-4 py-3">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {ordersList.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                  </tr>
                ) : (
                  ordersList.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">{order.created_at ? getLocalDateString(order.created_at) : "—"}</td>
                      <td className="px-4 py-3">{order.branch || "—"}</td>
                      <td className="px-4 py-3 font-mono">#{order.id ? order.id.slice(-8).toUpperCase() : "—"}</td>
                      <td className="px-4 py-3 font-bold">₹{order.total || 0}</td>
                      <td className="px-4 py-3">₹0.00</td>
                      <td className="px-4 py-3">₹{order.total || 0}</td>
                      <td className="px-4 py-3">₹0.00</td>
                      <td className="px-4 py-3">—</td>
                      <td className="px-4 py-3">{order.payment_method || "Cash"}</td>
                      <td className="px-4 py-3">Bill</td>
                      <td className="px-4 py-3">{order.branch || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeProfileTab === "packages") {
      const packageList = selectedProfileClient.packages || [];
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Package history</h4>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Package name</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Valid upto</th>
                  <th className="px-4 py-3">Package price</th>
                  <th className="px-4 py-3">Total services</th>
                  <th className="px-4 py-3">Services availed</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {packageList.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                  </tr>
                ) : (
                  packageList.map((pkg, idx) => {
                    const totalServices = pkg.services?.length || 0;
                    const availedCount = (pkg.services || []).reduce((sum, s) => sum + ((s.total_quantity || 1) - (s.remaining_quantity ?? 0)), 0);
                    const totalQuantity = (pkg.services || []).reduce((sum, s) => sum + (s.total_quantity || 1), 0);
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold">{pkg.name}</td>
                        <td className="px-4 py-3">{selectedProfileClient.branch || "Baroda"}</td>
                        <td className="px-4 py-3">{pkg.valid_upto || "—"}</td>
                        <td className="px-4 py-3">₹{pkg.price || "—"}</td>
                        <td className="px-4 py-3">{totalServices} services</td>
                        <td className="px-4 py-3 font-semibold text-indigo-600">{availedCount} / {totalQuantity}</td>
                        <td className="px-4 py-3">
                          <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Active</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeProfileTab === "membership") {
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Membership history</h4>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Membership name</th>
                  <th className="px-4 py-3">Valid upto</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Service discount</th>
                  <th className="px-4 py-3">Product discount</th>
                  <th className="px-4 py-3">Package discount</th>
                  <th className="px-4 py-3">Reward boost</th>
                  <th className="px-4 py-3">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeProfileTab === "wallet") {
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Wallet history</h4>
            <div className="text-right text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2">
              Wallet Balance INR {(selectedProfileClient.wallet || 0).toLocaleString("en-IN")}/-
            </div>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date/Time</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Transaction type</th>
                  <th className="px-4 py-3">Amount paid</th>
                  <th className="px-4 py-3">Wallet amount</th>
                  <th className="px-4 py-3">Payment method</th>
                  <th className="px-4 py-3">Amount received from</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Bill id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeProfileTab === "reviews") {
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-serif text-lg text-gray-900">Feedback & rating</h4>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3">Overall experience</th>
                  <th className="px-4 py-3">Timely response</th>
                  <th className="px-4 py-3">Support</th>
                  <th className="px-4 py-3">Overall satisfaction</th>
                  <th className="px-4 py-3">Service rating</th>
                  <th className="px-4 py-3">Suggestion</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-400 italic">No data available in table</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return null;
  };

  if (selectedProfileClient) {
    const profileTabs = [
      { k: "info", label: `Profile - ${selectedProfileClient.name}` },
      { k: "appointments", label: "Appointment" },
      { k: "billing", label: "Billing" },
      { k: "points", label: "Reward point" },
      { k: "payments", label: "Payment" },
      { k: "packages", label: "Package" },
      { k: "membership", label: "Membership" },
      { k: "wallet", label: "Wallet" },
      { k: "reviews", label: "Feedback & rating" },
    ];
    return (
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in p-6 space-y-6">
        <div className="flex justify-between items-center bg-gray-50 border border-gray-200 p-4 rounded-2xl">
          <div>
            <span className="text-[11px] uppercase tracking-wider bg-[#1e293b]/10 text-[#1e293b] px-2 py-0.5 rounded font-bold">Client Ledger Profile</span>
            <h3 className="text-xl font-serif font-bold text-gray-900 mt-1">
              {selectedProfileClient.name} - client since {getFormattedDateString(selectedProfileClient.created_at || selectedProfileClient.first_visit)}
            </h3>
          </div>
          <button
            onClick={() => {
              setSelectedProfileClient(null);
              setShowProfileModal(false);
            }}
            className="bg-[#1e293b] hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            ← Back to Client List
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-gray-150 pb-3">
          {profileTabs.map(tabItem => (
            <button
              key={tabItem.k}
              onClick={() => setActiveProfileTab(tabItem.k)}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold border transition-all ${activeProfileTab === tabItem.k
                ? "bg-[#1e293b] text-white border-[#1e293b] shadow-sm animate-pulse-once"
                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div className="p-2">
          {renderProfileTabContent()}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 border-4 border-eminence-gold border-t-transparent rounded-full animate-spin" />
        <p className="text-eminence-muted font-medium text-sm">Aggregating checkout metrics & segmenting customer ledger...</p>
      </div>
    );
  }

  // Calculate statistics for the colored cards at the top
  const totalCount = segments.all?.length || 0;
  const activeCount = segments.active?.length || 0;
  const lapseCount = segments.lapse?.length || 0;
  const doormatCount = segments.dormant?.length || 0;
  const defectedCount = segments.churn?.length || 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 5 COLORED METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-indigo-900 to-violet-950 text-white shadow-xl hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] uppercase font-bold tracking-widest text-indigo-200">Existing Clients</span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-indigo-300">
              <Users size={16} />
            </div>
          </div>
          <h2 className="text-3xl font-serif font-bold leading-none">{totalCount}</h2>
          <p className="text-[10px] text-indigo-200/80 mt-2 font-medium">Total customer database entries</p>
        </div>

        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-emerald-800 to-teal-950 text-white shadow-xl hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] uppercase font-bold tracking-widest text-emerald-200">Active</span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-emerald-300">
              <Check size={16} />
            </div>
          </div>
          <h2 className="text-3xl font-serif font-bold leading-none">{activeCount}</h2>
          <p className="text-[10px] text-emerald-200/80 mt-2 font-medium">Billed within last 30 days</p>
        </div>

        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-xl hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] uppercase font-bold tracking-widest text-amber-200">Lapse</span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-amber-300">
              <Clock size={16} />
            </div>
          </div>
          <h2 className="text-3xl font-serif font-bold leading-none">{lapseCount}</h2>
          <p className="text-[10px] text-amber-200/80 mt-2 font-medium">Billed 30 to 60 days ago</p>
        </div>

        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-yellow-700 to-amber-900 text-white shadow-xl hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] uppercase font-bold tracking-widest text-yellow-200">Doormat</span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-yellow-300">
              <Calendar size={16} />
            </div>
          </div>
          <h2 className="text-3xl font-serif font-bold leading-none">{doormatCount}</h2>
          <p className="text-[10px] text-yellow-200/80 mt-2 font-medium">Billed 60 to 365 days ago</p>
        </div>

        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-rose-800 to-red-950 text-white shadow-xl hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] uppercase font-bold tracking-widest text-rose-200">Defected Clients</span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-rose-300">
              <Trash2 size={16} />
            </div>
          </div>
          <h2 className="text-3xl font-serif font-bold leading-none">{defectedCount}</h2>
          <p className="text-[10px] text-rose-200/80 mt-2 font-medium">No checkouts for > 365 days</p>
        </div>
      </div>

      {/* SEGMENTS TAB PILLS AND OPERATIONAL ACTIONS BAR */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white/60 p-4 rounded-2xl border border-eminence-border/30 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {[
            { k: "all", label: "All", count: segments.all?.length || 0 },
            { k: "active", label: "Active", count: segments.active?.length || 0 },
            { k: "lapse", label: "Lapse", count: segments.lapse?.length || 0 },
            { k: "dormant", label: "Doormat", count: segments.dormant?.length || 0 },
            { k: "churn", label: "Churn", count: segments.churn?.length || 0 },
            { k: "one_time", label: "One-Time", count: segments.one_time?.length || 0 },
          ].map(tabItem => (
            <button
              key={tabItem.k}
              onClick={() => {
                setSelectedSegment(tabItem.k);
                setSelectedClientIds(new Set());
              }}
              className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${selectedSegment === tabItem.k
                ? "bg-gray-950 text-white shadow-md scale-[1.03]"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-100"
                }`}
            >
              <span>{tabItem.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] ${selectedSegment === tabItem.k ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{tabItem.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <label className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors flex items-center gap-2 cursor-pointer flex-1 lg:flex-initial justify-center">
            {isImporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-eminence-gold border-t-transparent rounded-full animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <TrendingUp size={14} className="rotate-180" />
                <span>Upload CSV</span>
              </>
            )}
            <input type="file" accept=".csv" onChange={handleCsvUpload} disabled={isImporting} className="hidden" />
          </label>

          <button
            onClick={() => handleExportCSV(sortedClients)}
            className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors flex items-center gap-2 flex-1 lg:flex-initial justify-center"
          >
            <Download size={14} /> Export CSV
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="bg-eminence-gold text-black font-semibold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider hover:bg-[#c5a030] transition-colors flex items-center gap-2 flex-1 lg:flex-initial justify-center shadow-sm"
          >
            <Plus size={14} /> Add Client
          </button>
        </div>
      </div>

      {/* MANAGE CLIENTS FILTERS CARD */}
      <div className="eminence-card p-6 bg-white rounded-3xl border border-eminence-border/40 shadow-sm space-y-4">
        <div className="border-b border-eminence-border/30 pb-3 flex items-center gap-2">
          <Filter size={16} className="text-eminence-gold" />
          <h3 className="font-serif text-lg text-eminence-text">Manage clients</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Client ID</label>
            <input
              type="text"
              value={searchParams.id}
              onChange={e => setSearchParams({ ...searchParams, id: e.target.value })}
              placeholder="Filter by lead ID"
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Client Name</label>
            <input
              type="text"
              value={searchParams.name}
              onChange={e => setSearchParams({ ...searchParams, name: e.target.value })}
              placeholder="Search by name"
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Contact Number</label>
            <input
              type="tel"
              value={searchParams.phone}
              onChange={e => setSearchParams({ ...searchParams, phone: e.target.value })}
              placeholder="Search contact"
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Email Address</label>
            <input
              type="email"
              value={searchParams.email}
              onChange={e => setSearchParams({ ...searchParams, email: e.target.value })}
              placeholder="Search email"
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Last Service Name</label>
            <input
              type="text"
              value={searchParams.service}
              onChange={e => setSearchParams({ ...searchParams, service: e.target.value })}
              placeholder="Filter by checkout service"
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Gender</label>
            <select
              value={searchParams.gender}
              onChange={e => setSearchParams({ ...searchParams, gender: e.target.value })}
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            >
              <option value="All">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="—">Unspecified</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Acquisition Source</label>
            <select
              value={searchParams.source}
              onChange={e => setSearchParams({ ...searchParams, source: e.target.value })}
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            >
              <option value="All">All Sources</option>
              <option value="Billing">Billing (Auto)</option>
              <option value="manual">Manual Entry</option>
              <option value="facebook">Facebook Webhook</option>
              <option value="whatsapp">WhatsApp webhook</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-widest">Assigned Salesperson</label>
            <select
              value={searchParams.salesperson}
              onChange={e => setSearchParams({ ...searchParams, salesperson: e.target.value })}
              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
            >
              <option value="All">All Salespersons</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={() => setSearchParams({
              id: "",
              name: "",
              phone: "",
              email: "",
              service: "",
              gender: "All",
              source: "All",
              salesperson: "All"
            })}
            className="text-xs text-eminence-gold hover:text-[#c5a030] font-bold uppercase tracking-wider"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      <div className="eminence-card rounded-3xl overflow-hidden border border-eminence-border/30 shadow-sm bg-white">
        {selectedClientIds.size > 0 && (
          <div className="bg-gray-950 text-white px-6 py-4 flex justify-between items-center animate-fade-in">
            <span className="text-xs font-bold tracking-widest">{selectedClientIds.size} Selected Clients</span>
            <button
              onClick={() => {
                const clientsList = sortedClients.filter(c => selectedClientIds.has(c.id));
                handleExportCSV(clientsList);
              }}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/25 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
            >
              Export Selected
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-eminence-border bg-gray-50/50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                <th className="px-4 py-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={sortedClients.length > 0 && selectedClientIds.size === sortedClients.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 accent-gray-950 rounded cursor-pointer"
                  />
                </th>
                {[
                  { k: "id", label: "Id" },
                  { k: "name", label: "Name" },
                  { k: "phone", label: "Contact number" },
                  { k: "invite_code", label: "Your Invite Code" },
                  { k: "first_visit", label: "First visit" },
                  { k: "last_visit", label: "Last visit" },
                  { k: "last_service", label: "Last service" },
                  { k: "last_service_provider", label: "Last service provider" },
                  { k: "last_bill_amount", label: "Last bill amount" },
                  { k: "gender", label: "Gender" },
                  { k: "points", label: "Points" },
                ].map(col => (
                  <th
                    key={col.k}
                    onClick={() => handleSort(col.k)}
                    className="px-4 py-4 cursor-pointer hover:bg-gray-100 hover:text-gray-900 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      {sortConfig.key === col.k && (
                        <span>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {sortedClients.map(client => {
                const inviteCode = getInviteCode(client);
                const isSelected = selectedClientIds.has(client.id);
                return (
                  <tr
                    key={client.id}
                    className={`hover:bg-eminence-surface/30 transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`}
                  >
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectClient(client.id)}
                        className="w-4 h-4 accent-gray-950 rounded cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-eminence-muted">
                      {client.id?.slice(0, 8) || "—"}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                      {client.name || "—"}
                    </td>
                    <td className="px-4 py-3.5 font-medium whitespace-nowrap">
                      {client.phone || "—"}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-eminence-gold whitespace-nowrap">
                      {inviteCode}
                    </td>
                    <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                      {client.first_visit || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                      {client.last_visit || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs whitespace-nowrap max-w-[150px] truncate">
                      {client.last_service || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs whitespace-nowrap max-w-[120px] truncate">
                      {client.last_service_provider || "—"}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-gray-900 text-xs">
                      ₹{(client.last_bill_amount || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {client.gender || "—"}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-eminence-gold text-xs">
                      {client.points || 0}
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewProfile(client)}
                          className="bg-gray-100 hover:bg-gray-900 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                        >
                          View Profile
                        </button>
                        <a
                          href={`https://wa.me/91${(client.phone || "").replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white flex items-center justify-center text-emerald-600 transition-all border border-emerald-100"
                          title="WhatsApp Message"
                        >
                          <MessageSquare size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedClients.length === 0 && (
                <tr>
                  <td colSpan="13" className="text-center py-12 text-eminence-muted italic">
                    No clients found matching the filters or active segment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD NEW CLIENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-20 overflow-y-auto bg-black/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-white/20">
            <div className="bg-gray-950 px-8 py-6 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-serif font-bold text-white">Add New Client</h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Manual Client Registration</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddClientSubmit} className="p-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Full Name *</label>
                  <input
                    required
                    type="text"
                    value={newClientForm.name}
                    onChange={e => setNewClientForm({ ...newClientForm, name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Phone Number *</label>
                  <input
                    required
                    type="tel"
                    value={newClientForm.phone}
                    onChange={e => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Secondary Phone</label>
                  <input
                    type="tel"
                    value={newClientForm.secondary_phone}
                    onChange={e => setNewClientForm({ ...newClientForm, secondary_phone: e.target.value })}
                    placeholder="Alternative contact"
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Email Address</label>
                  <input
                    type="email"
                    value={newClientForm.email}
                    onChange={e => setNewClientForm({ ...newClientForm, email: e.target.value })}
                    placeholder="e.g. john@example.com"
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Gender</label>
                  <select
                    value={newClientForm.gender}
                    onChange={e => setNewClientForm({ ...newClientForm, gender: e.target.value })}
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  >
                    <option value="—">Choose gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Starting Points</label>
                  <input
                    type="number"
                    value={newClientForm.points}
                    onChange={e => setNewClientForm({ ...newClientForm, points: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Branch</label>
                  <select
                    value={newClientForm.branch}
                    onChange={e => setNewClientForm({ ...newClientForm, branch: e.target.value })}
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  >
                    {branches.map(b => {
                      const bName = typeof b === "string" ? b : (b?.name || "Unknown");
                      return <option key={bName} value={bName}>{bName}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Grade</label>
                  <select
                    value={newClientForm.grade}
                    onChange={e => setNewClientForm({ ...newClientForm, grade: e.target.value })}
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  >
                    <option value="Hot">Hot</option>
                    <option value="Warm">Warm</option>
                    <option value="Cold">Cold</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Initial Notes / Profile Description</label>
                  <textarea
                    rows={3}
                    value={newClientForm.notes}
                    onChange={e => setNewClientForm({ ...newClientForm, notes: e.target.value })}
                    placeholder="Enter any initial notes about client, hair history or preferences..."
                    className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-6 py-3 border border-gray-200 text-gray-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gray-950 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-black transition-all shadow-md"
                >
                  Create Client Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLIENT DETAIL & PROFILE DIALOG */}
      {false && showProfileModal && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-16 overflow-y-auto bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 flex flex-col my-4">
            <div className="bg-gray-950 px-8 py-6 flex justify-between items-center text-white">
              <div>
                <span className="text-[11px] uppercase tracking-wider bg-eminence-gold/15 text-eminence-gold px-2 py-0.5 rounded font-bold">Client Ledger Profile</span>
                <h3 className="text-2xl font-serif font-bold mt-1 text-white">{selectedProfileClient?.name || "Loading..."}</h3>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {isLoadingProfile ? (
              <div className="p-20 flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-eminence-gold border-t-transparent rounded-full animate-spin" />
                <p className="text-eminence-muted font-medium text-xs">Retrieving database aggregates for {selectedProfileClient?.name || "client"}...</p>
              </div>
            ) : selectedProfileClient && (
              <div className="grid grid-cols-1 md:grid-cols-4 min-h-[480px]">
                {/* Left panel tabs navigation */}
                <div className="bg-gray-50 border-r border-gray-100 p-4 space-y-1">
                  {[
                    { k: "info", label: "Personal Information" },
                    { k: "packages", label: "Active Packages" },
                    { k: "history", label: "Visit & Bills Log" },
                    { k: "notes", label: "Timeline Notes" },
                  ].map(tabItem => (
                    <button
                      key={tabItem.k}
                      onClick={() => setActiveProfileTab(tabItem.k)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeProfileTab === tabItem.k
                        ? "bg-white text-gray-900 border border-gray-100 shadow-sm"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                    >
                      {tabItem.label}
                    </button>
                  ))}
                  <div className="pt-8 px-4 text-center">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Ledger Balance</p>
                    <p className="text-2xl font-serif font-bold text-gray-900 mt-1">₹{(selectedProfileClient.wallet || 0).toLocaleString("en-IN")}</p>
                    <p className="text-[11px] text-eminence-gold font-semibold uppercase mt-0.5">{selectedProfileClient.points || 0} Reward Points</p>
                  </div>
                </div>

                {/* Right panel display panel content */}
                <div className="col-span-3 p-8">
                  {activeProfileTab === "info" && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h4 className="font-serif text-lg text-gray-900">Personal & Salon Accounts</h4>
                        <button
                          type="button"
                          onClick={() => setIsEditingProfile(!isEditingProfile)}
                          className="text-xs bg-gray-100 hover:bg-gray-900 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-all"
                        >
                          {isEditingProfile ? "Cancel Edit" : "Edit Profile"}
                        </button>
                      </div>

                      {isEditingProfile ? (
                        <form onSubmit={handleSaveProfile} className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Full Name</label>
                            <input
                              required
                              type="text"
                              value={profileEditForm.name}
                              onChange={e => setProfileEditForm({ ...profileEditForm, name: e.target.value })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Phone Number</label>
                            <input
                              required
                              type="tel"
                              value={profileEditForm.phone}
                              onChange={e => setProfileEditForm({ ...profileEditForm, phone: e.target.value })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Secondary Contact</label>
                            <input
                              type="tel"
                              value={profileEditForm.secondary_phone}
                              onChange={e => setProfileEditForm({ ...profileEditForm, secondary_phone: e.target.value })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Email Address</label>
                            <input
                              type="email"
                              value={profileEditForm.email}
                              onChange={e => setProfileEditForm({ ...profileEditForm, email: e.target.value })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Gender</label>
                            <select
                              value={profileEditForm.gender}
                              onChange={e => setProfileEditForm({ ...profileEditForm, gender: e.target.value })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            >
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                              <option value="—">Unspecified</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Points Balance</label>
                            <input
                              type="number"
                              value={profileEditForm.points}
                              onChange={e => setProfileEditForm({ ...profileEditForm, points: parseInt(e.target.value) || 0 })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Wallet Balance (₹)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={profileEditForm.wallet}
                              onChange={e => setProfileEditForm({ ...profileEditForm, wallet: parseFloat(e.target.value) || 0 })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Lead Grade</label>
                            <select
                              value={profileEditForm.grade}
                              onChange={e => setProfileEditForm({ ...profileEditForm, grade: e.target.value })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            >
                              <option value="Hot">Hot</option>
                              <option value="Warm">Warm</option>
                              <option value="Cold">Cold</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Hair & Scalp condition</label>
                            <input
                              type="text"
                              value={profileEditForm.hair_condition}
                              onChange={e => setProfileEditForm({ ...profileEditForm, hair_condition: e.target.value })}
                              className="w-full border border-gray-100 bg-gray-50/50 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                            />
                          </div>
                          <div className="col-span-2 flex justify-end gap-2 mt-4">
                            <button
                              type="button"
                              onClick={() => setIsEditingProfile(false)}
                              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold uppercase"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingProfile}
                              className="px-4 py-2 bg-gray-950 text-white rounded-lg text-xs font-bold uppercase shadow-sm"
                            >
                              {isSavingProfile ? "Saving..." : "Save Changes"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                          {[
                            { l: "Invite Code", v: getInviteCode(selectedProfileClient) },
                            { l: "Contact phone", v: selectedProfileClient.phone || "—" },
                            { l: "Secondary contact", v: selectedProfileClient.secondary_phone || "—" },
                            { l: "Email address", v: selectedProfileClient.email || "—" },
                            { l: "Gender", v: selectedProfileClient.gender || "—" },
                            { l: "First checkout date", v: selectedProfileClient.first_visit || "—" },
                            { l: "Latest checkout date", v: selectedProfileClient.last_visit || "—" },
                            { l: "Last service checkout", v: selectedProfileClient.last_service || "—" },
                            { l: "Stylist provider", v: selectedProfileClient.last_service_provider || "—" },
                            { l: "Acquisition source", v: selectedProfileClient.source || "manual" },
                            { l: "Assigned salesperson", v: selectedProfileClient.assigned_to_name || "—" },
                            { l: "Salon branch", v: selectedProfileClient.branch || "Baroda" },
                            { l: "Lead Grade status", v: selectedProfileClient.grade || "Cold" },
                            { l: "Hair & Scalp condition", v: selectedProfileClient.hair_condition || "Normal" },
                          ].map((field, idx) => (
                            <div key={idx} className="border-b border-gray-100 pb-2">
                              <p className="text-[11px] uppercase font-bold text-gray-400 tracking-wider">{field.l}</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">{field.v}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeProfileTab === "packages" && (
                    <div className="space-y-6">
                      <h4 className="font-serif text-lg text-gray-900 border-b border-gray-100 pb-3">Active Purchased Packages</h4>
                      {!selectedProfileClient.packages || selectedProfileClient.packages.length === 0 ? (
                        <div className="text-center py-10 text-eminence-muted italic text-sm">
                          No active package purchases registered on this client profile.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {selectedProfileClient.packages.map((pkg, idx) => (
                            <div key={idx} className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-4">
                              <div className="flex justify-between items-center">
                                <h5 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full bg-eminence-gold" />
                                  {pkg.name}
                                </h5>
                                <span className="text-[10px] font-mono text-gray-400 bg-white border px-2 py-0.5 rounded">ID: {pkg.id || "—"}</span>
                              </div>

                              <div className="space-y-3">
                                {pkg.services?.map((s, sIdx) => {
                                  const total = s.total_quantity || 1;
                                  const rem = s.remaining_quantity ?? 0;
                                  const used = total - rem;
                                  const pct = (rem / total) * 100;
                                  return (
                                    <div key={sIdx} className="space-y-1">
                                      <div className="flex justify-between text-xs font-medium">
                                        <span className="text-gray-800">{s.service_name}</span>
                                        <span className="font-bold text-gray-950">{rem} / {total} remaining</span>
                                      </div>
                                      <div className="w-full bg-gray-200/50 h-2.5 rounded-full overflow-hidden border">
                                        <div
                                          className={`h-full transition-all duration-500 rounded-full ${pct > 50 ? "bg-emerald-600" : pct > 20 ? "bg-amber-500" : "bg-rose-500"
                                            }`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeProfileTab === "history" && (
                    <div className="space-y-6">
                      <h4 className="font-serif text-lg text-gray-900 border-b border-gray-100 pb-3">Checkout Visit Log</h4>
                      <div className="max-h-[360px] overflow-y-auto pr-2 space-y-3">
                        {(!selectedProfileClient.orders || selectedProfileClient.orders.length === 0) ? (
                          <p className="text-center py-10 text-eminence-muted italic text-sm">No billing records found under client contact phone.</p>
                        ) : selectedProfileClient.orders.map((o) => (
                          <div key={o.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl flex justify-between items-center">
                            <div>
                              <p className="text-xs font-bold text-gray-950">{(o.created_at || "—").replace("T", " ").slice(0, 16)}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">Order ID: <span className="font-mono">#{o.id.slice(-8).toUpperCase()}</span></p>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {o.items?.map((it, itIdx) => (
                                  <span key={itIdx} className="text-[10px] bg-white border border-gray-200/80 px-2 py-0.5 rounded-md font-medium text-gray-700">
                                    {it.name} ({it.service_provider || "—"})
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-900">₹{(o.total || 0).toLocaleString("en-IN")}</p>
                              <p className="text-[9px] uppercase tracking-wider text-eminence-gold font-bold mt-1 bg-eminence-gold/10 px-2 py-0.5 rounded">{o.payment_method || "Paid"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeProfileTab === "notes" && (
                    <div className="space-y-6">
                      <h4 className="font-serif text-lg text-gray-900 border-b border-gray-100 pb-3">Timeline Activity & Notes</h4>

                      <form onSubmit={handleAddNote} className="flex gap-2">
                        <input
                          required
                          type="text"
                          value={newNoteText}
                          onChange={e => setNewNoteText(e.target.value)}
                          placeholder="Type a new activity note here..."
                          className="flex-1 border border-gray-200 rounded-xl p-3 text-xs focus:ring-1 focus:ring-gray-900 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={isSavingNote}
                          className="bg-gray-900 text-white hover:bg-black font-semibold px-5 py-3 rounded-xl text-xs uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap"
                        >
                          {isSavingNote ? "..." : "Add Note"}
                        </button>
                      </form>

                      <div className="max-h-[260px] overflow-y-auto pr-2 space-y-4 pt-2">
                        {(!selectedProfileClient.notes || selectedProfileClient.notes.length === 0) ? (
                          <p className="text-center py-6 text-eminence-muted italic text-xs">No notes recorded on this client profile.</p>
                        ) : [...selectedProfileClient.notes].reverse().map((n, idx) => (
                          <div key={idx} className="relative pl-6 border-l border-gray-200 py-1 space-y-1">
                            <div className="absolute -left-1.5 top-2 w-3 h-3 rounded-full bg-eminence-gold border-2 border-white" />
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                              <span className="font-bold text-gray-600">{n.author || "System"}</span>
                              <span>·</span>
                              <span>{(n.timestamp || "").replace("T", " ").slice(0, 16)}</span>
                            </div>
                            <p className="text-xs text-gray-700 font-medium leading-relaxed">{n.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Table({ rows, cols, testid, t }) {
  return (
    <div className="eminence-card overflow-x-auto" data-testid={testid}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-eminence-border">
            {cols.map((c) => <th key={c.h} className="text-left px-4 py-3 overline">{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-eminence-border/50 hover:bg-eminence-surface/50">
              {cols.map((c, i) => <td key={i} className="px-4 py-3">{c.k(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-eminence-muted text-center py-10">{t("noRecords")}</p>}
    </div>
  );
}


function CrudPanel({ title, items, fields, create, update, remove, onChange, onViewHistory, testid, t }) {
  const empty = Object.fromEntries(fields.map((f) => [f.k, f.default ?? (f.type === "number" ? 0 : (f.type === "checkbox" ? false : ""))]));
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedVendorId, setExpandedVendorId] = useState(null);
  const [vendorHistory, setVendorHistory] = useState(null);
  const [loadingVendorHistory, setLoadingVendorHistory] = useState(false);
  const [showCategoryDrop, setShowCategoryDrop] = useState(false);
  const [editingStockLogId, setEditingStockLogId] = useState(null);
  const [editStockLogForm, setEditStockLogForm] = useState({ amount_paid: 0, payment_mode: "Cash", payment_status: "Pending" });

  const toggleVendorHistory = async (vendorId) => {
    if (expandedVendorId === vendorId) {
      setExpandedVendorId(null);
      return;
    }
    setExpandedVendorId(vendorId);
    setLoadingVendorHistory(true);
    try {
      const res = await api.get(`/admin/vendors/${vendorId}/history`);
      setVendorHistory(res.data);
    } catch (err) {
      toast.error("Failed to load vendor history.");
    } finally {
      setLoadingVendorHistory(false);
    }
  };

  const handleSaveStockLogPayment = async (logId) => {
    try {
      const payload = {
        amount_paid: Number(editStockLogForm.amount_paid),
        payment_mode: editStockLogForm.payment_mode,
        payment_status: editStockLogForm.payment_status,
      };
      await api.patch(`/admin/stock-logs/${logId}/payment`, payload);
      toast.success("Payment details updated!");
      if (expandedVendorId) {
        const res = await api.get(`/admin/vendors/${expandedVendorId}/history`);
        setVendorHistory(res.data);
      }
      setEditingStockLogId(null);
    } catch (err) {
      toast.error("Failed to update payment details.");
    }
  };

  const set = (k, v) => setForm({ ...form, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form };
    fields.forEach((f) => {
      if (f.type === "number") payload[f.k] = Number(payload[f.k]);
      if (f.k === "images" && typeof payload[f.k] === "string") {
        payload[f.k] = payload[f.k].split(",").map(s => s.trim()).filter(Boolean);
      }
    });
    try {
      if (editId) await update(editId, payload);
      else await create(payload);
      toast.success(t("update"));
      setForm(empty); setEditId(null);
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("saveFailed"));
    }
  };

  const startEdit = (item) => {
    const f = {};
    fields.forEach((field) => {
      let val = item[field.k] ?? field.default ?? (field.type === "number" ? 0 : (field.type === "checkbox" ? false : ""));
      if (field.k === "images" && Array.isArray(val)) val = val.join(", ");
      f[field.k] = val;
    });
    setForm(f); setEditId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const del = async (id) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    await remove(id); toast.success(t("deleted")); onChange();
  };

  const getColSpan = (field) => {
    if (testid !== "products") return "";
    if (field.k === "description" || field.k === "image_url" || field.k === "video_url" || field.k === "images" || field.k === "category") {
      return "sm:col-span-2";
    }
    return "";
  };

  const filteredItems = items.filter((it) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = (it.name || "").toLowerCase().includes(query);
    const categoryMatch = (it.category || "").toLowerCase().includes(query);
    const descMatch = (it.description || "").toLowerCase().includes(query);
    const contactMatch = (it.contact_person || "").toLowerCase().includes(query);
    return nameMatch || categoryMatch || descMatch || contactMatch;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h2 className="font-serif text-2xl text-gray-800">
          {testid === "products" ? "Product Catalog" : "Product Vendors"}
        </h2>
        <p className="text-xs text-eminence-muted">
          {testid === "products"
            ? "Manage and edit physical products, pricing, stock levels, and digital assets."
            : "Manage external suppliers, contact details, and procurement histories."}
        </p>
      </div>

      <div className={testid === "products" ? "flex flex-col gap-6" : "grid grid-cols-1 lg:grid-cols-3 gap-6"} data-testid={`crud-${testid}`}>
        <form onSubmit={submit} className={testid === "products" ? "w-full eminence-card p-6" : "eminence-card p-6 space-y-4 lg:col-span-1 h-fit sticky top-24"}>
          <p className="overline mb-4">{editId ? `${t("edit")} ${title}` : `${t("add")} ${title}`}</p>

          <div className={testid === "products" ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" : "space-y-4"}>
            {fields.map((f) => (
              <div key={f.k} className={getColSpan(f)}>
                <label className="text-xs text-eminence-muted block mb-1">{f.label}</label>
                {f.type === "media_upload" ? (
                  <ImageUpload value={form[f.k]} onChange={(v) => set(f.k, v)} testId={`crud-${f.k}`} />
                ) : f.type === "category_manager" ? (
                  <SearchableProductCategorySelect
                    value={form[f.k]}
                    onChange={(val) => set(f.k, val)}
                    options={f.options}
                    onAddCategory={f.onAddCategory}
                    onDeleteCategory={f.onDeleteCategory}
                    placeholder="Select or type category"
                  />
                ) : f.type === "select" ? (
                  <select value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} data-testid={`crud-${f.k}`}
                    className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 focus:outline-none focus:border-eminence-gold text-sm">
                    <option value="">{t("explore")} {f.label}</option>
                    {f.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea rows={testid === "products" ? 2 : 4} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} data-testid={`crud-${f.k}`}
                    className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 focus:outline-none focus:border-eminence-gold text-sm" />
                ) : f.type === "checkbox" ? (
                  <div className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={!!form[f.k]} onChange={(e) => set(f.k, e.target.checked)} data-testid={`crud-${f.k}`}
                      className="w-4 h-4 rounded border-gray-300 text-eminence-gold focus:ring-eminence-gold accent-eminence-gold" />
                    <span className="text-xs text-eminence-muted">{f.label === "Show in Online Shop" ? "Yes, list in online shop" : f.label}</span>
                  </div>
                ) : (
                  <input type={f.type} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} data-testid={`crud-${f.k}`}
                    className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 focus:outline-none focus:border-eminence-gold text-sm" />
                )}
              </div>
            ))}

            <div className={testid === "products" ? "flex gap-2 sm:col-span-2 md:col-span-3 lg:col-span-4 justify-end mt-2" : "flex gap-2"}>
              <button type="submit" className={testid === "products" ? "btn-gold px-8 py-2 w-auto" : "btn-gold flex-1"} data-testid="crud-save">{editId ? t("update") : t("create")}</button>
              {editId && <button type="button" onClick={() => { setForm(empty); setEditId(null); }} className={testid === "products" ? "btn-outline-gold px-8 py-2 w-auto" : "btn-outline-gold"}>{t("accountWelcome")}</button>}
            </div>
          </div>
        </form>

        <div className={testid === "products" ? "w-full space-y-4" : "lg:col-span-2 space-y-4"}>
          {/* Real-time search bar */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-eminence-gold" />
            <input
              type="text"
              placeholder={testid === "products" ? "Search products by name or category..." : "Search vendors..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-eminence-surface border border-eminence-border pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-eminence-gold rounded-xl"
            />
          </div>

          <div className="space-y-2">
            {filteredItems.map((it) => (
              <div key={it.id} className="eminence-card p-4 flex flex-col gap-3" data-testid={`crud-row-${it.id}`}>
                <div className="flex items-center gap-4">
                  {it.video_url ? (
                    <video src={it.video_url} className="w-16 h-16 object-cover rounded-lg" autoPlay muted loop playsInline />
                  ) : it.image_url ? (
                    <img src={it.image_url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                  ) : (
                    // Do not render empty box for vendors
                    !(it.contact_person || it.phone || it.email || it.address) && <div className="w-16 h-16 bg-eminence-surface rounded-lg" />
                  )}
                  <div className="flex-1">
                    {it.category && <p className="overline mb-1">{it.category}</p>}
                    <h4 className="font-serif text-lg">{it.name}</h4>
                    {(it.volume || it.measurement_unit) && (
                      <p className="text-xs text-eminence-gold font-bold uppercase tracking-wider mt-0.5">
                        {it.volume ? `${it.volume} ` : ""}{it.measurement_unit || ""}
                      </p>
                    )}
                    {it.description && <p className="text-xs text-eminence-muted line-clamp-1">{it.description}</p>}

                    {/* Vendor details */}
                    {(it.contact_person || it.phone || it.email || it.gst_no || it.address) && (
                      <div className="text-xs text-eminence-muted space-y-1 mt-2 bg-eminence-surface/30 p-2.5 rounded-lg border border-eminence-border/10">
                        {it.contact_person && <p><span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider block">Contact Person</span> {it.contact_person}</p>}
                        {it.phone && <p><span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider block">Phone Number</span> {it.phone}</p>}
                        {it.email && <p><span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider block">Email Address</span> {it.email}</p>}
                        {it.gst_no && <p><span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider block">GST Number</span> {it.gst_no}</p>}
                        {it.address && <p><span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider block">Address</span> {it.address}</p>}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    {it.price !== undefined && (
                      <p className="text-eminence-gold font-serif text-xl">₹{it.price.toLocaleString("en-IN")}</p>
                    )}
                    {it.stock !== undefined && (
                      <p className={`text-[10px] font-bold uppercase mt-1 ${it.stock <= 5 ? "text-red-500" : "text-eminence-muted"}`}>
                        {it.stock} {t("units")} {it.stock <= 5 ? "· Low Stock" : ""}
                      </p>
                    )}
                    {it.show_in_online_shop !== undefined && (
                      <div className="mt-1">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${it.show_in_online_shop ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-gray-500 bg-gray-50 border-gray-200"}`}>
                          {it.show_in_online_shop ? "Online & Salon" : "Salon Only"}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-2 justify-end">
                      {testid === "vendors" && (
                        <button
                          type="button"
                          onClick={() => toggleVendorHistory(it.id)}
                          className="text-xs uppercase tracking-wider text-eminence-muted hover:text-eminence-gold flex items-center gap-1"
                        >
                          <Clock size={12} /> History
                        </button>
                      )}
                      {onViewHistory && (
                        <button
                          onClick={() => onViewHistory(it)}
                          className="text-xs uppercase tracking-wider text-eminence-muted hover:text-eminence-gold flex items-center gap-1"
                        >
                          <Clock size={12} /> History
                        </button>
                      )}
                      <button onClick={() => startEdit(it)} className="text-xs uppercase tracking-wider text-eminence-muted hover:text-eminence-gold" data-testid={`edit-${it.id}`}>{t("edit")}</button>
                      <button onClick={() => del(it.id)} className="text-eminence-muted hover:text-red-400" data-testid={`delete-${it.id}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Vendor Purchase History Section */}
                {testid === "vendors" && expandedVendorId === it.id && (
                  <div className="mt-2 bg-eminence-surface/30 p-4 rounded-xl border border-eminence-border/10 space-y-3 text-left">
                    {loadingVendorHistory ? (
                      <div className="flex items-center justify-center py-6 gap-2 text-xs text-eminence-muted">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-eminence-gold" />
                        <span>Fetching purchase logs...</span>
                      </div>
                    ) : !vendorHistory || vendorHistory.history.length === 0 ? (
                      <p className="text-xs text-eminence-muted italic text-center py-4">No purchase logs found for this vendor.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white p-3 rounded-lg border border-eminence-border/10 font-bold uppercase tracking-wider text-eminence-muted">
                          <div>
                            <span className="text-[10px] text-gray-400 block font-normal">Purchased Qty</span>
                            <span>{vendorHistory.total_purchased_quantity} units</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 block font-normal">Total Bill</span>
                            <span className="text-gray-900">₹{vendorHistory.total_purchased_amount.toLocaleString("en-IN")}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 block font-normal">Total Paid</span>
                            <span className="text-emerald-600">₹{(vendorHistory.total_paid_amount || 0).toLocaleString("en-IN")}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 block font-normal">Total Pending</span>
                            <span className="text-red-500">₹{(vendorHistory.total_pending_amount || 0).toLocaleString("en-IN")}</span>
                          </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto border border-eminence-border/10 rounded-lg bg-white">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-eminence-surface/60 border-b border-eminence-border/10 text-eminence-muted uppercase font-bold text-[9px] tracking-wider">
                                <th className="px-3 py-2.5">Date</th>
                                <th className="px-3 py-2.5">Invoice No</th>
                                <th className="px-3 py-2.5">Product Name</th>
                                <th className="px-3 py-2.5 text-right">Qty</th>
                                <th className="px-3 py-2.5 text-right">Cost Price</th>
                                <th className="px-3 py-2.5 text-right">Total Cost</th>
                                <th className="px-3 py-2.5 text-right">Paid</th>
                                <th className="px-3 py-2.5 text-right">Pending</th>
                                <th className="px-3 py-2.5">Mode</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="px-3 py-2.5 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {vendorHistory.history.map((hLog) => {
                                const isEditing = editingStockLogId === hLog.id;
                                return (
                                  <tr key={hLog.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                                      {hLog.created_at ? new Date(hLog.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—"}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-gray-600 font-bold whitespace-nowrap">
                                      {hLog.invoice_no || "—"}
                                    </td>
                                    <td className="px-3 py-2.5 font-medium text-gray-950 truncate max-w-[160px]" title={hLog.product_name}>
                                      {hLog.product_name}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-700 whitespace-nowrap">
                                      {hLog.quantity} units
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-gray-600 font-semibold whitespace-nowrap">
                                      ₹{Number(hLog.cost_price || 0).toLocaleString("en-IN")}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-bold text-emerald-600 whitespace-nowrap">
                                      ₹{Number(hLog.total_cost || 0).toLocaleString("en-IN")}
                                    </td>

                                    {/* Paid Column */}
                                    <td className="px-3 py-2 text-right">
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          min="0"
                                          value={editStockLogForm.amount_paid}
                                          onChange={(e) => {
                                            const val = Number(e.target.value);
                                            let status = "Pending";
                                            if (val >= hLog.total_cost) status = "Paid";
                                            else if (val > 0) status = "Partial";
                                            setEditStockLogForm({
                                              ...editStockLogForm,
                                              amount_paid: e.target.value,
                                              payment_status: status
                                            });
                                          }}
                                          className="w-20 border border-gray-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-eminence-gold bg-white font-mono"
                                        />
                                      ) : (
                                        <span className="font-bold text-blue-600 whitespace-nowrap">
                                          ₹{Number(hLog.amount_paid || 0).toLocaleString("en-IN")}
                                        </span>
                                      )}
                                    </td>

                                    {/* Pending Column */}
                                    <td className="px-3 py-2 text-right">
                                      {isEditing ? (
                                        <span className="font-bold font-mono text-red-500 whitespace-nowrap">
                                          ₹{Number(hLog.total_cost - (Number(editStockLogForm.amount_paid) || 0)).toLocaleString("en-IN")}
                                        </span>
                                      ) : (
                                        <span className={`font-bold whitespace-nowrap ${Number(hLog.pending_amount || 0) > 0 ? "text-red-500" : "text-gray-400"}`}>
                                          ₹{Number(hLog.pending_amount || 0).toLocaleString("en-IN")}
                                        </span>
                                      )}
                                    </td>

                                    {/* Mode Column */}
                                    <td className="px-3 py-2 text-left">
                                      {isEditing ? (
                                        <select
                                          value={editStockLogForm.payment_mode}
                                          onChange={(e) => setEditStockLogForm({ ...editStockLogForm, payment_mode: e.target.value })}
                                          className="border border-gray-300 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-eminence-gold"
                                        >
                                          <option>Cash</option>
                                          <option>UPI</option>
                                          <option>Card</option>
                                          <option>Bank Transfer</option>
                                          <option>Cheque</option>
                                          <option>Credit</option>
                                        </select>
                                      ) : (
                                        <span className="text-gray-600 whitespace-nowrap text-[10px]">
                                          {hLog.payment_mode || "—"}
                                        </span>
                                      )}
                                    </td>

                                    {/* Status Column */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      {isEditing ? (
                                        <select
                                          value={editStockLogForm.payment_status}
                                          onChange={(e) => setEditStockLogForm({ ...editStockLogForm, payment_status: e.target.value })}
                                          className="border border-gray-300 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-eminence-gold"
                                        >
                                          <option>Pending</option>
                                          <option>Partial</option>
                                          <option>Paid</option>
                                        </select>
                                      ) : (
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${hLog.payment_status === "Paid"
                                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                          : hLog.payment_status === "Partial"
                                            ? "text-amber-700 bg-amber-50 border-amber-200"
                                            : "text-red-600 bg-red-50 border-red-200"
                                          }`}>
                                          {hLog.payment_status || "Pending"}
                                        </span>
                                      )}
                                    </td>

                                    {/* Actions Column */}
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      {isEditing ? (
                                        <div className="flex gap-1.5 justify-center">
                                          <button
                                            onClick={() => handleSaveStockLogPayment(hLog.id)}
                                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] uppercase font-bold"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setEditingStockLogId(null)}
                                            className="px-2 py-0.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-[10px] uppercase font-bold"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setEditingStockLogId(hLog.id);
                                            setEditStockLogForm({
                                              amount_paid: hLog.amount_paid || 0,
                                              payment_mode: hLog.payment_mode || "Cash",
                                              payment_status: hLog.payment_status || "Pending"
                                            });
                                          }}
                                          className="px-2 py-0.5 bg-eminence-gold hover:bg-eminence-gold/90 text-white rounded text-[10px] uppercase font-bold transition-all"
                                        >
                                          Edit
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {filteredItems.length === 0 && (
              <p className="text-eminence-muted text-center py-10">{t("noRecords")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeManager({ defaultSubTab = "sales staff", employees, refresh, t, isSuperAdmin }) {
  const [subTab, setSubTab] = useState(defaultSubTab);
  const [form, setForm] = useState({ name: "", email: "", phones: [""], password: "", branch: "Surat", section: "Men", role: "sales", pancard: "", adhaar_card: "", bank_details: "", commission_rate: 5, base_salary: "", pancard_image: "", adhaar_card_image: "" });
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [payrollData, setPayrollData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState(null);
  const [payrollForm, setPayrollForm] = useState({ base_salary: 0, commission_rate: 0 });
  const [payrollFilterMonth, setPayrollFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isEditingAttendance, setIsEditingAttendance] = useState(false);
  const [editAttendanceForm, setEditAttendanceForm] = useState({ time: "10:00", checkout_time: "", status: "present" });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (subTab === "attendance") {
          const res = await api.get("/admin/attendance");
          setAttendanceData(res.data);
        } else if (subTab === "payroll") {
          const res = await api.get(`/admin/payroll?month=${payrollFilterMonth}`);
          setPayrollData(res.data);
        }
      } catch (err) {
        toast.error("Failed to load " + subTab + " data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [subTab, payrollFilterMonth]);

  const handleSaveAttendance = async () => {
    try {
      await api.post("/admin/attendance/manual", {
        user_id: selectedEmployeeId,
        date: selectedDateStr,
        time: editAttendanceForm.time,
        checkout_time: editAttendanceForm.checkout_time || null,
        status: editAttendanceForm.status
      });
      toast.success("Attendance updated successfully!");
      setIsEditingAttendance(false);
      // Refresh attendance logs
      const res = await api.get("/admin/attendance");
      setAttendanceData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save attendance");
    }
  };

  const handleUpdatePayroll = async (uid) => {
    try {
      await api.patch(`/admin/employees/${uid}`, {
        base_salary: Number(payrollForm.base_salary),
        commission_rate: Number(payrollForm.commission_rate) / 100, // Convert percentage back to decimal
        allowed_weekoffs: payrollForm.allowed_weekoffs ? Number(payrollForm.allowed_weekoffs) : 0
      });
      toast.success("Payroll configuration updated!");
      setEditingPayroll(null);
      // Refresh payroll data
      const res = await api.get(`/admin/payroll?month=${payrollFilterMonth}`);
      setPayrollData(res.data);
    } catch (err) {
      toast.error("Failed to update payroll configuration");
    }
  };

  const toggleActive = async (emp) => {
    try {
      await api.patch(`/admin/employees/${emp.id}`, { is_active: !emp.is_active });
      toast.success(`Employee ${emp.is_active ? "deactivated" : "activated"} successfully`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to toggle activation status");
    }
  };

  const handleDeleteEmployee = async (empId) => {
    if (!window.confirm("Are you sure you want to permanently delete this employee? This action cannot be undone.")) return;
    try {
      await api.delete(`/admin/employees/${empId}`);
      toast.success("Employee deleted successfully");
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete employee");
    }
  };

  const startEditEmployee = (emp) => {
    const phones = (emp.phone_numbers && emp.phone_numbers.length > 0)
      ? [...emp.phone_numbers]
      : [emp.phone || ""];

    setForm({
      name: emp.name || "",
      email: emp.email || "",
      phones: phones,
      password: "",
      branch: emp.branch || "Surat",
      section: emp.section || "Men",
      role: emp.role || "sales",
      pancard: emp.pancard || "",
      adhaar_card: emp.adhaar_card || "",
      bank_details: emp.bank_details || "",
      commission_rate: emp.commission_rate !== undefined ? Math.round(emp.commission_rate * 100) : 5,
      base_salary: emp.base_salary || "",
      pancard_image: emp.pancard_image || "",
      adhaar_card_image: emp.adhaar_card_image || ""
    });
    setEditingEmpId(emp.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setForm({ name: "", email: "", phones: [""], password: "", branch: "Surat", section: "Men", role: "sales", pancard: "", adhaar_card: "", bank_details: "", commission_rate: 5, base_salary: "", pancard_image: "", adhaar_card_image: "" });
    setEditingEmpId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const activePhones = form.phones.filter(p => p.trim() !== "");
      const { phones, ...rest } = form;
      const payload = {
        ...rest,
        phone: activePhones[0] || "",
        phone_numbers: activePhones,
        commission_rate: Number(form.commission_rate) / 100,
        base_salary: Number(form.base_salary) || 0
      };

      if (editingEmpId) {
        if (!payload.password) {
          delete payload.password;
        }
        await api.patch(`/admin/employees/${editingEmpId}`, payload);
        toast.success("Employee details updated");
        setEditingEmpId(null);
      } else {
        await api.post("/admin/employees", payload);
        toast.success("Employee account created");
      }

      setForm({ name: "", email: "", phones: [""], password: "", branch: "Surat", section: "Men", role: "sales", pancard: "", adhaar_card: "", bank_details: "", commission_rate: 5, base_salary: "", pancard_image: "", adhaar_card_image: "" });
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${editingEmpId ? "update" : "create"} employee`);
    }
  };

  return (
    <div className="space-y-6">
      {defaultSubTab !== "kiosk" && (
        <div className="flex gap-2 mb-6">
          {["sales staff", "service providers", "attendance", "payroll", "kiosk"]
            .filter(t => t !== "kiosk" || !isSuperAdmin)
            .map(t => (
              <button
                key={t}
                onClick={() => setSubTab(t)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-colors ${subTab === t ? "bg-eminence-gold text-white" : "bg-white text-gray-500 hover:bg-gray-100"}`}
              >
                {t === "kiosk" ? "Check-in Kiosk" : t}
              </button>
            ))}
        </div>
      )}

      {subTab === "kiosk" && (
        <AttendanceKiosk employees={employees} refresh={refresh} />
      )}

      {subTab === "sales staff" && (
        <SalesStaffPanel employees={employees} refresh={refresh} t={t} branches={branches} />
      )}

      {subTab === "attendance" && (() => {
        // If selectedEmployeeId is null, display the Employee Directory Grid
        if (!selectedEmployeeId) {
          return (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="font-serif text-2xl text-eminence-gold">Staff Attendance Directory</h3>
                  <p className="text-xs text-eminence-muted">Select a team member to view their interactive monthly attendance calendar</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {employees.map((emp) => {
                  const logsCount = attendanceData.filter((log) => log.user_id === emp.id).length;
                  const initials = emp.name ? emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "EE";

                  return (
                    <div
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmployeeId(emp.id);
                        // Also reset calendar state to current month
                        setCurrentMonth(new Date());
                        // Default selected day in details view to today
                        setSelectedDateStr(new Date().toISOString().split('T')[0]);
                      }}
                      className="glass-card p-6 rounded-2xl border border-eminence-border/35 hover:border-eminence-gold/60 transition-all duration-300 cursor-pointer group hover:translate-y-[-4px] hover:shadow-[0_8px_30px_rgb(212,175,55,0.08)] bg-white/70 backdrop-blur-md"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-eminence-surface border border-eminence-border flex items-center justify-center font-bold text-eminence-gold group-hover:bg-eminence-gold group-hover:text-white transition-colors duration-300">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif text-lg truncate group-hover:text-eminence-gold transition-colors">{emp.name}</h4>
                          <p className="text-xs text-eminence-muted truncate">{emp.role === "sales" ? "Sales Team" : emp.role === "receptionist" ? "Receptionist" : "Service Team"}</p>
                          <p className="text-[10px] text-eminence-muted truncate mt-0.5">{emp.email}</p>
                        </div>
                      </div>
                      <div className="mt-6 pt-4 border-t border-eminence-border/20 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-eminence-gold border border-eminence-gold/40 px-2.5 py-0.5 rounded-full bg-eminence-gold/5">
                          {emp.role === "sales" ? "Sales" : emp.role === "receptionist" ? "Reception" : "Service"}
                        </span>
                        <span className="text-xs font-medium text-eminence-muted">
                          {logsCount} {logsCount === 1 ? "log" : "logs"} recorded
                        </span>
                      </div>
                    </div>
                  );
                })}
                {employees.length === 0 && (
                  <div className="col-span-full eminence-card p-12 text-center text-eminence-muted">
                    No employees registered. Go to "Add Employee" in the Staff tab to add one.
                  </div>
                )}
              </div>
            </div>
          );
        }

        // Otherwise, an employee is selected - render the calendar & detail view
        const emp = employees.find((e) => e.id === selectedEmployeeId);
        const filteredAttendance = attendanceData.filter((log) => log.user_id === selectedEmployeeId);

        // Helper calculations for calendar
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth(); // 0-11
        const monthNames = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];

        const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
        const totalDays = new Date(year, month + 1, 0).getDate();

        const prevMonth = () => {
          setCurrentMonth(new Date(year, month - 1, 1));
        };
        const nextMonth = () => {
          setCurrentMonth(new Date(year, month + 1, 1));
        };

        // Create an array of cells: blank cells then day cells
        const calendarCells = [];
        for (let i = 0; i < firstDayIndex; i++) {
          calendarCells.push({ day: null, dateStr: null });
        }
        for (let d = 1; d <= totalDays; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          calendarCells.push({ day: d, dateStr });
        }

        // Get the log for the currently selected day to show in details
        const selectedDayLog = filteredAttendance.find(log => log.date === selectedDateStr);

        return (
          <div className="space-y-6">
            {/* Header & Quick switcher */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedEmployeeId(null)}
                  className="px-4 py-2 border border-eminence-border rounded-xl text-xs uppercase tracking-wider hover:bg-eminence-surface hover:text-eminence-gold transition-all bg-white"
                >
                  ← Back to Staff List
                </button>
                <div>
                  <h3 className="font-serif text-2xl text-eminence-gold">{emp?.name}'s Attendance</h3>
                  <p className="text-xs text-eminence-muted">{emp?.role === "sales" ? "Sales Team" : "Service Team"} · {emp?.email}</p>
                </div>
              </div>

              {/* Quick Switcher dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-eminence-muted">Select Staff:</span>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => {
                    setSelectedEmployeeId(e.target.value);
                    setCurrentMonth(new Date());
                    setSelectedDateStr(new Date().toISOString().split('T')[0]);
                  }}
                  className="bg-white border border-eminence-border px-3 py-1.5 focus:outline-none focus:border-eminence-gold rounded-xl text-xs uppercase tracking-wider"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Calendar Card */}
              <div className="lg:col-span-2 eminence-card overflow-hidden">
                <div className="p-6 border-b border-eminence-border/40 bg-eminence-surface/30 flex items-center justify-between">
                  <h4 className="font-serif text-lg text-eminence-gold">
                    {monthNames[month]} {year}
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={prevMonth}
                      className="w-8 h-8 rounded-full border border-eminence-border flex items-center justify-center hover:bg-eminence-surface text-sm font-semibold hover:text-eminence-gold transition-all bg-white"
                    >
                      ‹
                    </button>
                    <button
                      onClick={nextMonth}
                      className="w-8 h-8 rounded-full border border-eminence-border flex items-center justify-center hover:bg-eminence-surface text-sm font-semibold hover:text-eminence-gold transition-all bg-white"
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  {/* Days of week */}
                  <div className="grid grid-cols-7 gap-2 mb-2 text-center">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                      <div key={day} className="text-[10px] font-bold uppercase tracking-wider text-eminence-muted py-2">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar days grid */}
                  <div className="grid grid-cols-7 gap-2">
                    {calendarCells.map((cell, idx) => {
                      if (!cell.day) {
                        return <div key={`empty-${idx}`} className="aspect-square bg-transparent"></div>;
                      }

                      // Find attendance log for this day
                      const dayLog = filteredAttendance.find(log => log.date === cell.dateStr);
                      const isSelected = cell.dateStr === selectedDateStr;
                      const todayStr = new Date().toISOString().split('T')[0];
                      const isToday = cell.dateStr === todayStr;
                      const isPast = cell.dateStr < todayStr;

                      let statusClass = "bg-eminence-surface/20 border-eminence-border/45 text-gray-500 hover:bg-eminence-surface/40";
                      let indicatorColor = "";
                      let isAbsent = false;
                      let forgotCheckout = false;

                      if (dayLog) {
                        if (dayLog.status === "absent") {
                          statusClass = "bg-rose-500/10 border-rose-500/30 text-rose-800 hover:bg-rose-500/15";
                          indicatorColor = "bg-rose-500";
                          isAbsent = true;
                        } else if (dayLog.checkout_time) {
                          statusClass = "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 hover:bg-emerald-500/15";
                          indicatorColor = "bg-emerald-500";
                        } else if (isPast) {
                          // Past day check-in with no checkout = Forgot Checkout / Absent
                          statusClass = "bg-rose-500/10 border-rose-500/30 text-rose-800 hover:bg-rose-500/15";
                          indicatorColor = "bg-rose-500";
                          isAbsent = true;
                          forgotCheckout = true;
                        } else {
                          // Current day check-in (active shift)
                          statusClass = "bg-amber-500/10 border-amber-500/30 text-amber-800 hover:bg-amber-500/15";
                          indicatorColor = "bg-amber-500 animate-pulse";
                        }
                      } else if (isPast) {
                        // Past day with no check-in = Absent
                        statusClass = "bg-rose-500/10 border-rose-500/30 text-rose-800 hover:bg-rose-500/15";
                        indicatorColor = "bg-rose-500";
                        isAbsent = true;
                      }

                      return (
                        <button
                          key={cell.dateStr}
                          onClick={() => {
                            setSelectedDateStr(cell.dateStr);
                            setIsEditingAttendance(false); // Reset edit state
                          }}
                          className={`aspect-square p-2 border rounded-xl flex flex-col justify-between transition-all text-left bg-white ${statusClass} ${isSelected ? "ring-2 ring-eminence-gold border-eminence-gold/60" : ""
                            } ${isToday && !isSelected ? "border-dashed border-eminence-gold/80" : ""}`}
                        >
                          <div className="flex justify-between items-start w-full">
                            <span className={`text-xs font-bold ${isToday ? "text-eminence-gold" : ""}`}>{cell.day}</span>
                            {indicatorColor && <span className={`w-1.5 h-1.5 rounded-full ${indicatorColor}`}></span>}
                          </div>

                          {/* Mini info for larger screens */}
                          {dayLog && !isAbsent && (
                            <div className="hidden md:block text-[8px] leading-tight font-medium mt-1 uppercase tracking-tighter truncate w-full text-eminence-muted">
                              <div>IN: {dayLog.time.split(":")[0] + ":" + dayLog.time.split(":")[1]}</div>
                              {dayLog.checkout_time && (
                                <div>OUT: {dayLog.checkout_time.split(":")[0] + ":" + dayLog.checkout_time.split(":")[1]}</div>
                              )}
                            </div>
                          )}
                          {isAbsent && (
                            <div className="hidden md:block text-[8px] leading-tight font-bold mt-1 uppercase tracking-tighter truncate w-full text-rose-600">
                              {forgotCheckout ? "Forgot Out" : "Absent"}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 bg-eminence-surface/10 border-t border-eminence-border/30 flex items-center justify-between text-xs text-eminence-muted">
                  <div className="flex gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Present
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Active Shift
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Absent / Forgot Out
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded border border-dashed border-eminence-gold/80"></span> Today
                    </span>
                  </div>
                </div>
              </div>

              {/* Day Details Card */}
              <div className="lg:col-span-1 eminence-card overflow-hidden sticky top-24">
                <div className="p-6 border-b border-eminence-border/40 bg-eminence-surface/30 flex justify-between items-center">
                  <div>
                    <h4 className="font-serif text-lg text-eminence-gold">Verification Details</h4>
                    <p className="text-xs text-eminence-muted">
                      {(() => {
                        try {
                          const parts = selectedDateStr.split('-');
                          const parsedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                          return parsedDate.toLocaleDateString(undefined, {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                          });
                        } catch (e) {
                          return selectedDateStr;
                        }
                      })()}
                    </p>
                  </div>
                  {!isEditingAttendance && (
                    <button
                      onClick={() => {
                        setIsEditingAttendance(true);
                        setEditAttendanceForm({
                          time: selectedDayLog?.time || "10:00",
                          checkout_time: selectedDayLog?.checkout_time || "",
                          status: selectedDayLog?.status || "present"
                        });
                      }}
                      className="text-[10px] uppercase font-bold tracking-wider text-eminence-gold border border-eminence-gold/40 px-3 py-1.5 rounded-lg hover:bg-eminence-gold hover:text-white transition-colors"
                    >
                      {selectedDayLog ? "Edit Log" : "Log Manual"}
                    </button>
                  )}
                </div>

                {isEditingAttendance ? (
                  <div className="p-6 space-y-4">
                    <p className="text-xs font-bold text-eminence-gold uppercase tracking-widest">Edit Attendance Log</p>

                    <div>
                      <label className="text-xs text-eminence-muted block mb-1">Status</label>
                      <select
                        value={editAttendanceForm.status}
                        onChange={(e) => setEditAttendanceForm({ ...editAttendanceForm, status: e.target.value })}
                        className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 focus:outline-none focus:border-eminence-gold text-sm rounded-lg text-gray-900"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                      </select>
                    </div>

                    {editAttendanceForm.status === "present" && (
                      <>
                        <div>
                          <label className="text-xs text-eminence-muted block mb-1">Check-In Time</label>
                          <input
                            type="time"
                            value={editAttendanceForm.time}
                            onChange={(e) => setEditAttendanceForm({ ...editAttendanceForm, time: e.target.value })}
                            className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 focus:outline-none focus:border-eminence-gold text-sm rounded-lg text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-eminence-muted block mb-1">Check-Out Time (Optional)</label>
                          <input
                            type="time"
                            value={editAttendanceForm.checkout_time}
                            onChange={(e) => setEditAttendanceForm({ ...editAttendanceForm, checkout_time: e.target.value })}
                            className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 focus:outline-none focus:border-eminence-gold text-sm rounded-lg text-gray-900"
                          />
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveAttendance}
                        className="flex-1 bg-eminence-gold text-white text-xs font-bold py-2 rounded-lg uppercase tracking-wider hover:bg-black transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingAttendance(false)}
                        className="flex-1 border border-eminence-border text-xs font-bold py-2 rounded-lg uppercase tracking-wider hover:bg-eminence-surface transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : selectedDayLog && selectedDayLog.status !== "absent" ? (
                  <div className="p-6 space-y-6">
                    {/* Time Records */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                        <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Check-In</p>
                        <p className="font-serif text-lg font-bold mt-1 text-emerald-800">{selectedDayLog.time}</p>
                      </div>
                      <div className="p-3 bg-eminence-surface border border-eminence-border/50 rounded-xl">
                        <p className="text-[10px] text-eminence-muted font-bold uppercase tracking-wider">Check-Out</p>
                        {selectedDayLog.checkout_time ? (
                          <p className="font-serif text-lg font-bold mt-1 text-eminence-gold">{selectedDayLog.checkout_time}</p>
                        ) : (
                          <span className="inline-block mt-2 px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] uppercase font-bold tracking-wider rounded border border-amber-200 animate-pulse">
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Photos */}
                    <div>
                      <p className="text-[10px] text-eminence-muted font-bold uppercase tracking-wider mb-2">Verification Photos</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col items-center">
                          {selectedDayLog.photo_url ? (
                            <div className="relative group/photo w-full">
                              <img
                                src={`/api/files/${selectedDayLog.photo_url}`}
                                alt="Check-In"
                                className="w-full h-32 object-cover rounded-xl border border-eminence-border/80 shadow-sm cursor-zoom-in hover:scale-105 transition-all duration-300"
                              />
                              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                                Check-In
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-32 bg-eminence-surface border border-dashed border-eminence-border/60 rounded-xl flex items-center justify-center text-xs text-eminence-muted">
                              No Check-In photo
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-center">
                          {selectedDayLog.checkout_photo_url ? (
                            <div className="relative group/photo w-full">
                              <img
                                src={`/api/files/${selectedDayLog.checkout_photo_url}`}
                                alt="Check-Out"
                                className="w-full h-32 object-cover rounded-xl border border-eminence-border/80 shadow-sm cursor-zoom-in hover:scale-105 transition-all duration-300"
                              />
                              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                                Check-Out
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-32 bg-eminence-surface/40 border border-dashed border-eminence-border/40 rounded-xl flex flex-col items-center justify-center text-xs text-eminence-muted">
                              <span className="text-[20px] font-light">-</span>
                              <span className="text-[9px] uppercase tracking-wider">Active Shift</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Geolocation Links */}
                    <div className="pt-2 border-t border-eminence-border/20 space-y-3">
                      <p className="text-[10px] text-eminence-muted font-bold uppercase tracking-wider">Verification Locations</p>

                      <div className="flex flex-col gap-2">
                        {selectedDayLog.latitude && selectedDayLog.longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${selectedDayLog.latitude},${selectedDayLog.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-3 bg-eminence-surface/50 hover:bg-eminence-surface border border-eminence-border/40 rounded-xl flex items-center justify-between text-xs text-eminence-muted hover:text-eminence-gold transition-colors duration-200"
                          >
                            <span className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-700 text-[9px] font-bold border border-emerald-500/25 rounded">IN</span>
                              <span>Map Pin Location</span>
                            </span>
                            <MapPin size={14} className="text-eminence-gold" />
                          </a>
                        ) : (
                          <div className="p-3 bg-eminence-surface/30 border border-dashed border-eminence-border/30 rounded-xl text-xs text-eminence-muted">
                            In Location: N/A
                          </div>
                        )}

                        {selectedDayLog.checkout_latitude && selectedDayLog.checkout_longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${selectedDayLog.checkout_latitude},${selectedDayLog.checkout_longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-3 bg-eminence-surface/50 hover:bg-eminence-surface border border-eminence-border/40 rounded-xl flex items-center justify-between text-xs text-eminence-muted hover:text-eminence-gold transition-colors duration-200"
                          >
                            <span className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-eminence-gold/10 text-eminence-gold text-[9px] font-bold border border-eminence-gold/25 rounded">OUT</span>
                              <span>Map Pin Location</span>
                            </span>
                            <MapPin size={14} className="text-eminence-gold" />
                          </a>
                        ) : selectedDayLog.checkout_time ? (
                          <div className="p-3 bg-eminence-surface/30 border border-dashed border-eminence-border/30 rounded-xl text-xs text-eminence-muted">
                            Out Location: N/A
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-eminence-muted space-y-3">
                    <div className="w-12 h-12 rounded-full border border-dashed border-eminence-border/60 flex items-center justify-center mx-auto text-lg text-eminence-muted font-serif">
                      {selectedDayLog?.status === "absent" ? "A" : "?"}
                    </div>
                    <p className="text-sm italic">
                      {selectedDayLog?.status === "absent" ? "Employee marked as Absent for this date." : "No attendance records found for this date."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {subTab === "service providers" && (
        <ServiceProviderPanel employees={employees} refresh={refresh} t={t} branches={branches} />
      )}

      {subTab === "payroll" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <input
              type="month"
              value={payrollFilterMonth}
              onChange={(e) => setPayrollFilterMonth(e.target.value)}
              className="bg-white border border-eminence-border px-4 py-2 text-sm focus:outline-none focus:border-eminence-gold"
            />
          </div>
          <div className="eminence-card overflow-hidden">
            {loading ? (
              <div className="p-20 text-center animate-pulse text-eminence-muted uppercase tracking-[0.3em] text-xs">Loading Payroll...</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-eminence-border bg-eminence-surface/50">
                    <th className="text-left px-6 py-4 overline">Employee</th>
                    <th className="text-left px-6 py-4 overline">Base Salary</th>
                    <th className="text-left px-6 py-4 overline">Monthly Sales</th>
                    <th className="text-left px-6 py-4 overline">Service Comm</th>
                    <th className="text-left px-6 py-4 overline">Product Comm</th>
                    <th className="text-left px-6 py-4 overline">Package Comm</th>
                    <th className="text-left px-6 py-4 overline">Member Comm</th>
                    <th className="text-left px-6 py-4 overline">Attendance & Leaves</th>
                    <th className="text-left px-6 py-4 overline text-eminence-gold">Total Payout</th>
                    <th className="text-left px-6 py-4 overline">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-eminence-border/50">
                  {payrollData.map((emp) => (
                    <tr key={emp.id} className="hover:bg-eminence-surface/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold font-serif text-lg">{emp.name}</div>
                        <div className="text-[10px] text-eminence-muted uppercase">{emp.role} • {emp.branch}</div>
                      </td>
                      <td className="px-6 py-4">
                        {editingPayroll === emp.id ? (
                          <input
                            type="number"
                            value={payrollForm.base_salary}
                            onChange={(e) => setPayrollForm({ ...payrollForm, base_salary: e.target.value })}
                            className="w-24 bg-white border border-eminence-border px-2 py-1 text-sm focus:outline-none"
                          />
                        ) : (
                          `₹${emp.base_salary.toLocaleString("en-IN")}`
                        )}
                      </td>
                      <td className="px-6 py-4">₹{emp.monthly_sales.toLocaleString("en-IN")}</td>
                      {/* Service Comm */}
                      <td className="px-6 py-4 text-emerald-600">
                        {editingPayroll === emp.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              value={payrollForm.commission_rate}
                              onChange={(e) => setPayrollForm({ ...payrollForm, commission_rate: e.target.value })}
                              className="w-16 bg-white border border-eminence-border px-2 py-1 text-sm focus:outline-none"
                            />
                            <span>%</span>
                          </div>
                        ) : (
                          <div>
                            <span>₹{(emp.service_commission || 0).toLocaleString("en-IN")}</span>
                            <span className="text-[10px] ml-1.5 text-eminence-muted">({((emp.service_commission_rate || 0) * 100).toFixed(0)}%)</span>
                          </div>
                        )}
                      </td>
                      {/* Product Comm */}
                      <td className="px-6 py-4 text-emerald-600 font-serif">
                        ₹{(emp.product_commission || 0).toLocaleString("en-IN")}
                        <span className="text-[10px] ml-1.5 text-eminence-muted font-sans">({((emp.product_commission_rate || 0) * 100).toFixed(0)}%)</span>
                      </td>
                      {/* Package Comm */}
                      <td className="px-6 py-4 text-emerald-600 font-serif">
                        ₹{(emp.package_commission || 0).toLocaleString("en-IN")}
                        <span className="text-[10px] ml-1.5 text-eminence-muted font-sans">({((emp.package_commission_rate || 0) * 100).toFixed(0)}%)</span>
                      </td>
                      {/* Member Comm */}
                      <td className="px-6 py-4 text-emerald-600 font-serif">
                        ₹{(emp.membership_commission || 0).toLocaleString("en-IN")}
                        <span className="text-[10px] ml-1.5 text-eminence-muted font-sans">({((emp.membership_commission_rate || 0) * 100).toFixed(0)}%)</span>
                      </td>
                      <td className="px-6 py-4">
                        {editingPayroll === emp.id ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min="0" max="31"
                                value={payrollForm.allowed_weekoffs}
                                onChange={(e) => setPayrollForm({ ...payrollForm, allowed_weekoffs: e.target.value })}
                                className="w-16 bg-white border border-eminence-border px-2 py-1 text-sm focus:outline-none"
                              />
                              <span className="text-[11px] uppercase tracking-widest text-eminence-muted">Weekoffs allowed</span>
                            </div>
                          </div>
                        ) : emp.attendance_details ? (
                          <div className="flex flex-col gap-1 text-sm">
                            <div>
                              <span className="font-medium text-red-600">{emp.attendance_details.unpaid_leaves}</span> Unpaid Leaves
                              {emp.attendance_details.weekoffs_taken > 0 && ` • ${emp.attendance_details.weekoffs_taken} / ${emp.allowed_weekoffs} Weekoffs taken`}
                            </div>
                            {emp.attendance_details.weekoffs_cancelled ? (
                              <div className="text-red-500 text-[11px] font-bold">Weekoffs Cancelled (≥5 unpaid)</div>
                            ) : (
                              <div className="text-emerald-500 text-[11px]">Weekoffs Active</div>
                            )}
                            {emp.late_penalty > 0 && (
                              <div className="text-orange-500 text-[11px] font-bold mt-1" title="Late arrival past 10 min grace period (>3 days)">
                                -₹{emp.late_penalty} (Late {emp.attendance_details.late_days} days)
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-400 italic">No Data</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-serif">
                        <div className="text-xl text-eminence-gold">₹{emp.total_payout ? Math.round(emp.total_payout).toLocaleString("en-IN") : 0}</div>
                        {(emp.attendance_deduction > 0 || emp.late_penalty > 0) && (
                          <div className="text-red-500 text-xs font-bold mt-1">
                            -₹{Math.round((emp.attendance_deduction || 0) + (emp.late_penalty || 0)).toLocaleString("en-IN")} deduction
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingPayroll === emp.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdatePayroll(emp.id)}
                              className="text-[10px] uppercase tracking-widest border border-eminence-border px-3 py-1 bg-eminence-gold text-white hover:bg-black transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingPayroll(null)}
                              className="text-[10px] uppercase tracking-widest border border-eminence-border px-3 py-1 hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingPayroll(emp.id);
                                setPayrollForm({
                                  base_salary: emp.base_salary,
                                  commission_rate: emp.commission_rate * 100,
                                  allowed_weekoffs: emp.allowed_weekoffs !== undefined ? emp.allowed_weekoffs : 2
                                });
                              }}
                              className="text-[10px] uppercase tracking-widest text-eminence-muted hover:text-eminence-gold transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toast.success(`Payslip generated for ${emp.name}`)}
                              className="text-[10px] uppercase tracking-widest border border-eminence-border px-3 py-1 hover:bg-eminence-gold hover:text-white transition-colors"
                            >
                              Slip
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && payrollData.length === 0 && <p className="text-center py-20 text-eminence-muted italic text-sm">No payroll records found.</p>}
          </div>
        </div>
      )}
    </div>
  );
}


function AdminMembershipPanel({ memberships, refresh, t }) {
  const emptyForm = {
    name: "", price: "", duration_days: "", reward_points_on_purchase: "",
    discount_on_services: "", discount_on_services_type: "%",
    discount_on_products: "", discount_on_products_type: "%",
    discount_on_packages: "", discount_on_packages_type: "%",
    reward_points_boost: "1X", min_reward_points_earned: "",
    condition: "AND", min_billed_amount: ""
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [showEntries, setShowEntries] = useState(10);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const inputCls = "w-full bg-eminence-surface border border-eminence-border px-3 py-2.5 focus:outline-none focus:border-eminence-gold text-sm rounded-lg transition-colors";

  const startEdit = (m) => {
    setForm({
      name: m.name || "", price: m.price || "", duration_days: m.duration_days || "",
      reward_points_on_purchase: m.reward_points_on_purchase || "",
      discount_on_services: m.discount_on_services || "", discount_on_services_type: m.discount_on_services_type || "%",
      discount_on_products: m.discount_on_products || "", discount_on_products_type: m.discount_on_products_type || "%",
      discount_on_packages: m.discount_on_packages || "", discount_on_packages_type: m.discount_on_packages_type || "%",
      reward_points_boost: m.reward_points_boost || "1X", min_reward_points_earned: m.min_reward_points_earned || "",
      condition: m.condition || "AND", min_billed_amount: m.min_billed_amount || ""
    });
    setEditingId(m.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name, price: Number(form.price), duration_days: Number(form.duration_days),
        reward_points_on_purchase: Number(form.reward_points_on_purchase) || 0,
        discount_on_services: Number(form.discount_on_services) || 0, discount_on_services_type: form.discount_on_services_type,
        discount_on_products: Number(form.discount_on_products) || 0, discount_on_products_type: form.discount_on_products_type,
        discount_on_packages: Number(form.discount_on_packages) || 0, discount_on_packages_type: form.discount_on_packages_type,
        reward_points_boost: form.reward_points_boost,
        min_reward_points_earned: Number(form.min_reward_points_earned) || 0,
        condition: form.condition, min_billed_amount: Number(form.min_billed_amount) || 0
      };
      if (editingId) {
        await api.patch(`/admin/memberships/${editingId}`, payload);
        toast.success("Membership updated");
        setEditingId(null);
      } else {
        await api.post("/admin/memberships", payload);
        toast.success("Membership created");
      }
      setForm(emptyForm);
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to save membership"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this membership plan?")) return;
    try { await api.delete(`/admin/memberships/${id}`); toast.success("Membership deleted"); refresh(); }
    catch { toast.error("Delete failed"); }
  };

  const filtered = memberships.filter(m => {
    if (!search) return true;
    return m.name?.toLowerCase().includes(search.toLowerCase());
  });
  const displayed = filtered.slice(0, showEntries);

  const DiscountField = ({ label, valueKey, typeKey }) => (
    <div>
      <label className="text-xs text-eminence-muted block mb-1">{label} <span className="text-rose-500">*</span></label>
      <div className="flex gap-1">
        <input type="number" min={0} value={form[valueKey]} onChange={e => set(valueKey, e.target.value)} className={`${inputCls} flex-1`} placeholder="0" />
        <select value={form[typeKey]} onChange={e => set(typeKey, e.target.value)} className="bg-eminence-surface border border-eminence-border px-2 py-2 text-xs rounded-lg focus:outline-none focus:border-eminence-gold w-16">
          <option value="%">%</option>
          <option value="₹">₹</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <form onSubmit={submit} className="eminence-card p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="overline text-eminence-gold">{editingId ? "Edit Membership" : "Create Membership"}</p>
            {editingId && <p className="text-[10px] text-eminence-muted mt-1">Editing existing membership. Cancel to discard.</p>}
          </div>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs font-bold uppercase tracking-widest text-eminence-muted border border-eminence-border px-4 py-2 rounded-xl hover:bg-eminence-surface transition-colors">Cancel</button>
          )}
        </div>

        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Membership Type Name <span className="text-rose-500">*</span></label>
            <input type="text" required value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} placeholder="Membership name" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Membership Price <span className="text-rose-500">*</span></label>
            <input type="number" required min={0} value={form.price} onChange={e => set("price", e.target.value)} className={inputCls} placeholder="Membership price" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Duration (days from purchase) <span className="text-rose-500">*</span></label>
            <input type="number" required min={1} value={form.duration_days} onChange={e => set("duration_days", e.target.value)} className={inputCls} placeholder="0" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Reward Points on Purchase <span className="text-rose-500">*</span></label>
            <input type="number" min={0} value={form.reward_points_on_purchase} onChange={e => set("reward_points_on_purchase", e.target.value)} className={inputCls} placeholder="0" />
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DiscountField label="Discount on Services" valueKey="discount_on_services" typeKey="discount_on_services_type" />
          <DiscountField label="Discount on Products" valueKey="discount_on_products" typeKey="discount_on_products_type" />
          <DiscountField label="Discount on Packages" valueKey="discount_on_packages" typeKey="discount_on_packages_type" />
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Reward Points Boost <span className="text-rose-500">*</span></label>
            <select value={form.reward_points_boost} onChange={e => set("reward_points_boost", e.target.value)} className={inputCls}>
              <option value="1X">1X</option>
              <option value="1.5X">1.5X</option>
              <option value="2X">2X</option>
              <option value="3X">3X</option>
              <option value="5X">5X</option>
            </select>
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Min. Reward Points Earned <span className="text-rose-500">*</span></label>
            <input type="number" min={0} value={form.min_reward_points_earned} onChange={e => set("min_reward_points_earned", e.target.value)} className={inputCls} placeholder="0" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Condition</label>
            <select value={form.condition} onChange={e => set("condition", e.target.value)} className={inputCls}>
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Min. Billed Amount <span className="text-rose-500">*</span></label>
            <input type="number" min={0} value={form.min_billed_amount} onChange={e => set("min_billed_amount", e.target.value)} className={inputCls} placeholder="0" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-gold px-8 py-3 text-sm whitespace-nowrap">
              {editingId ? "Update Membership" : "➕ Add Membership"}
            </button>
          </div>
        </div>
      </form>

      {/* Manage Table */}
      <div className="eminence-card overflow-hidden">
        <div className="px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-eminence-border/20">
          <p className="overline">Manage Membership ({filtered.length})</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-eminence-muted">
              Show
              <select value={showEntries} onChange={e => setShowEntries(Number(e.target.value))} className="bg-eminence-surface border border-eminence-border px-2 py-1 text-xs rounded">
                {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-eminence-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 bg-eminence-surface border border-eminence-border text-xs rounded-lg w-48 focus:outline-none focus:border-eminence-gold"
                placeholder="Search..." />
            </div>
          </div>
        </div>

        {displayed.length === 0 ? (
          <p className="text-center py-16 text-eminence-muted italic text-sm">No data available in table</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-eminence-border/20 text-left">
                  {["Membership Name", "Price", "Min. Reward Pts", "Min. Billed", "Disc. Services", "Disc. Products", "Disc. Packages", "Pts Boost", "Pts on Purchase", "Validity", "Action"].map(h => (
                    <th key={h} className="px-4 py-3 text-[9px] text-eminence-muted uppercase tracking-wider font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(m => (
                  <tr key={m.id} className="border-b border-eminence-border/10 hover:bg-eminence-surface/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3 font-serif">₹{Number(m.price || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-xs">{m.min_reward_points_earned || 0}</td>
                    <td className="px-4 py-3 text-xs">₹{Number(m.min_billed_amount || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-xs">{m.discount_on_services || 0}{m.discount_on_services_type || "%"}</td>
                    <td className="px-4 py-3 text-xs">{m.discount_on_products || 0}{m.discount_on_products_type || "%"}</td>
                    <td className="px-4 py-3 text-xs">{m.discount_on_packages || 0}{m.discount_on_packages_type || "%"}</td>
                    <td className="px-4 py-3 text-xs font-bold text-eminence-gold">{m.reward_points_boost || "1X"}</td>
                    <td className="px-4 py-3 text-xs">{m.reward_points_on_purchase || 0}</td>
                    <td className="px-4 py-3 text-xs">{m.duration_days || 0} days</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEdit(m)}
                          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border rounded-lg transition-all ${editingId === m.id ? "bg-eminence-gold text-white border-eminence-gold" : "border-eminence-gold/40 text-eminence-gold hover:bg-eminence-gold hover:text-white"}`}>
                          {editingId === m.id ? "Editing..." : "Edit"}
                        </button>
                        <button type="button" onClick={() => handleDelete(m.id)}
                          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border border-rose-500/30 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > showEntries && (
          <p className="text-center py-4 text-xs text-eminence-muted">
            Showing {displayed.length} of {filtered.length} entries.{" "}
            <button type="button" onClick={() => setShowEntries(prev => prev + 10)} className="text-eminence-gold hover:underline font-bold">Show more</button>
          </p>
        )}
      </div>
    </div>
  );
}

function AdminPackagesPanel({ packages, services, refresh, t }) {
  const emptyForm = {
    name: "",
    duration_days: "",
    valid_till: "",
    price: "",
    services: [
      { category: "", service_name: "", quantity: 1, price: 0 }
    ]
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [showEntries, setShowEntries] = useState(10);

  const categories = Array.from(new Set(services.map(s => s.category).filter(Boolean)));

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const addServiceRow = () => {
    setForm(prev => ({
      ...prev,
      services: [...prev.services, { category: "", service_name: "", quantity: 1, price: 0 }]
    }));
  };

  const removeServiceRow = (index) => {
    setForm(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }));
  };

  const updateServiceRow = (index, field, value) => {
    setForm(prev => {
      const updated = [...prev.services];
      updated[index] = { ...updated[index], [field]: value };

      if (field === "category") {
        updated[index].service_name = "";
        updated[index].price = 0;
      }

      if (field === "service_name") {
        const found = services.find(s => s.name === value);
        updated[index].price = found ? found.price : 0;
      }

      return { ...prev, services: updated };
    });
  };

  const startEdit = (p) => {
    setForm({
      name: p.name || "",
      duration_days: p.duration_days || "",
      valid_till: p.valid_till || "",
      price: p.price || "",
      services: p.services && p.services.length > 0 ? p.services.map(s => ({
        category: s.category || "",
        service_name: s.service_name || "",
        quantity: s.quantity || 1,
        price: s.price || 0
      })) : [{ category: "", service_name: "", quantity: 1, price: 0 }]
    });
    setEditingId(p.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const packageWorth = form.services.reduce((sum, item) => {
    const originalService = services.find(s => s.name === item.service_name);
    const originalPrice = originalService ? originalService.price : 0;
    return sum + (originalPrice * (Number(item.quantity) || 0));
  }, 0);

  const packagePrice = Number(form.price) || 0;
  const totalSavingsInr = Math.max(0, packageWorth - packagePrice);
  const totalSavingsPct = packageWorth > 0 ? Math.round((totalSavingsInr / packageWorth) * 100) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (form.services.some(s => !s.category || !s.service_name)) {
      toast.error("Please fill in category and service for all service items");
      return;
    }
    try {
      const payload = {
        name: form.name,
        duration_days: Number(form.duration_days),
        valid_till: form.valid_till,
        price: Number(form.price),
        services: form.services.map(item => ({
          category: item.category,
          service_name: item.service_name,
          quantity: Number(item.quantity),
          price: Number(item.price)
        }))
      };
      if (editingId) {
        await api.patch(`/admin/packages/${editingId}`, payload);
        toast.success("Package updated successfully");
        setEditingId(null);
      } else {
        await api.post("/admin/packages", payload);
        toast.success("Package created successfully");
      }
      setForm(emptyForm);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save package");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this package?")) return;
    try {
      await api.delete(`/admin/packages/${id}`);
      toast.success("Package deleted successfully");
      refresh();
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const filtered = (packages || []).filter(p => {
    if (!search) return true;
    return p.name?.toLowerCase().includes(search.toLowerCase());
  });
  const displayed = filtered.slice(0, showEntries);

  const inputCls = "w-full bg-eminence-surface border border-eminence-border px-3 py-2.5 focus:outline-none focus:border-eminence-gold text-sm rounded-lg transition-colors";

  return (
    <div className="space-y-8 animate-fade-in">
      <form onSubmit={submit} className="eminence-card p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="overline text-eminence-gold">{editingId ? "Edit Package" : "Create Package"}</p>
            {editingId && <p className="text-[10px] text-eminence-muted mt-1">Editing existing package. Cancel to discard.</p>}
          </div>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs font-bold uppercase tracking-widest text-eminence-muted border border-eminence-border px-4 py-2 rounded-xl hover:bg-eminence-surface transition-colors">Cancel</button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Name of Package <span className="text-rose-500">*</span></label>
            <input type="text" required value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} placeholder="e.g. Bridal Bliss" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Duration (in days) <span className="text-rose-500">*</span></label>
            <input type="number" required min={1} value={form.duration_days} onChange={e => set("duration_days", e.target.value)} className={inputCls} placeholder="e.g. 30" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Package validity till <span className="text-rose-500">*</span></label>
            <input type="date" required value={form.valid_till} onChange={e => set("valid_till", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Package price (₹) <span className="text-rose-500">*</span></label>
            <input type="number" required min={0} value={form.price} onChange={e => set("price", e.target.value)} className={inputCls} placeholder="e.g. 5000" />
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-eminence-gold">Services included in package</p>
          <div className="overflow-x-auto border border-eminence-border/10 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-eminence-surface/50 border-b border-eminence-border/20 text-left">
                  <th className="px-4 py-3 text-[10px] text-eminence-muted uppercase font-bold">Category</th>
                  <th className="px-4 py-3 text-[10px] text-eminence-muted uppercase font-bold">Service</th>
                  <th className="px-4 py-3 text-[10px] text-eminence-muted uppercase font-bold w-24">Quantity</th>
                  <th className="px-4 py-3 text-[10px] text-eminence-muted uppercase font-bold w-32">Price (Single)</th>
                  <th className="px-4 py-3 text-[10px] text-eminence-muted uppercase font-bold w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eminence-border/10">
                {form.services.map((item, index) => {
                  const availableServices = services.filter(s => s.category === item.category);
                  return (
                    <tr key={index} className="hover:bg-eminence-surface/10 transition-colors">
                      <td className="px-3 py-2">
                        <select
                          required
                          value={item.category}
                          onChange={e => updateServiceRow(index, "category", e.target.value)}
                          className="w-full bg-eminence-surface border border-eminence-border/60 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                        >
                          <option value="">Select Category</option>
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          required
                          disabled={!item.category}
                          value={item.service_name}
                          onChange={e => updateServiceRow(index, "service_name", e.target.value)}
                          className="w-full bg-eminence-surface border border-eminence-border/60 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold disabled:opacity-50"
                        >
                          <option value="">Select Service</option>
                          {availableServices.map(s => <option key={s.id} value={s.name}>{s.name} (₹{s.price})</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          required
                          min={1}
                          value={item.quantity}
                          onChange={e => updateServiceRow(index, "quantity", e.target.value)}
                          className="w-full bg-eminence-surface border border-eminence-border/60 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          readOnly
                          value={item.price}
                          className="w-full bg-eminence-surface border border-eminence-border/40 rounded px-2 py-1.5 text-xs text-eminence-muted"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          disabled={form.services.length <= 1}
                          onClick={() => removeServiceRow(index)}
                          className="text-red-500 hover:text-red-700 disabled:opacity-30 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addServiceRow}
            className="text-xs font-bold text-eminence-gold hover:text-eminence-gold/80 transition-colors flex items-center gap-1 mt-2"
          >
            ➕ Add more service
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-eminence-surface/30 p-6 rounded-2xl border border-eminence-border/10">
          <div className="space-y-1">
            <span className="text-xs text-eminence-muted block">Package worth</span>
            <span className="text-xl font-serif font-semibold text-eminence-text">₹{packageWorth.toLocaleString("en-IN")}</span>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-eminence-muted block">Total Savings in INR</span>
            <span className="text-xl font-serif font-semibold text-green-600">₹{totalSavingsInr.toLocaleString("en-IN")}</span>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-eminence-muted block">Total Savings in %</span>
            <span className="text-xl font-serif font-semibold text-green-600">{totalSavingsPct}%</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-gold px-10 py-3.5 text-sm font-semibold tracking-wider rounded-xl shadow-lg">
            {editingId ? "Update package" : "Create package"}
          </button>
        </div>
      </form>

      <div className="eminence-card overflow-hidden">
        <div className="px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-eminence-border/20">
          <p className="overline">Manage Packages ({filtered.length})</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-eminence-muted">
              Show
              <select value={showEntries} onChange={e => setShowEntries(Number(e.target.value))} className="bg-eminence-surface border border-eminence-border px-2 py-1 text-xs rounded">
                {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-eminence-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 bg-eminence-surface border border-eminence-border text-xs rounded-lg w-48 focus:outline-none focus:border-eminence-gold"
                placeholder="Search..." />
            </div>
          </div>
        </div>

        {displayed.length === 0 ? (
          <p className="text-center py-16 text-eminence-muted italic text-sm">No data available in table</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-eminence-border/20 text-left">
                  {["Package", "Duration (In Days)", "Valid upto", "Price", "Manage"].map(h => (
                    <th key={h} className="px-6 py-4 text-xs text-eminence-muted uppercase tracking-wider font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(p => (
                  <tr key={p.id} className="border-b border-eminence-border/10 hover:bg-eminence-surface/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-eminence-text">{p.name}</div>
                      <div className="text-[10px] text-eminence-muted mt-1">
                        {p.services?.map((s, idx) => `${s.service_name} (x${s.quantity})`).join(", ")}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">{p.duration_days} Days</td>
                    <td className="px-6 py-4 text-sm font-medium">{p.valid_till || "—"}</td>
                    <td className="px-6 py-4 font-serif text-sm">₹{Number(p.price || 0).toLocaleString("en-IN")}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEdit(p)}
                          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border rounded-lg transition-all ${editingId === p.id ? "bg-eminence-gold text-white border-eminence-gold" : "border-eminence-gold/40 text-eminence-gold hover:bg-eminence-gold hover:text-white"}`}>
                          {editingId === p.id ? "Editing..." : "Edit"}
                        </button>
                        <button type="button" onClick={() => handleDelete(p.id)}
                          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border border-rose-500/40 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > showEntries && (
          <p className="text-center py-4 text-xs text-eminence-muted">
            Showing {displayed.length} of {filtered.length} entries.{" "}
            <button type="button" onClick={() => setShowEntries(prev => prev + 10)} className="text-eminence-gold hover:underline font-bold">Show more</button>
          </p>
        )}
      </div>
    </div>
  );
}

function AdminServicesPanel({ services, refresh, t, isSuperAdmin }) {
  const emptyForm = {
    name: "", category: "", duration_min: "",
    price: "", membership_price: "", reward_points: "",
    service_for: "Men & Women", hide_on_website: false, description: ""
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [showEntries, setShowEntries] = useState(10);

  // Dynamically compute categories from existing services
  const existingCategories = [...new Set(services.map(s => s.category).filter(Boolean))].sort();

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const inputCls = "w-full bg-eminence-surface border border-eminence-border px-3 py-2.5 focus:outline-none focus:border-eminence-gold text-sm rounded-lg transition-colors";

  const startEdit = (svc) => {
    setForm({
      name: svc.name || "",
      category: svc.category || SERVICE_CATEGORIES[0],
      duration_min: svc.duration_min || "",
      price: svc.price || "",
      membership_price: svc.membership_price || "",
      reward_points: svc.reward_points || "",
      service_for: svc.service_for || "Men & Women",
      hide_on_website: svc.hide_on_website || false,
      description: svc.description || ""
    });
    setEditingId(svc.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        category: form.category,
        duration_min: Number(form.duration_min),
        price: Number(form.price),
        membership_price: Number(form.membership_price) || 0,
        reward_points: Number(form.reward_points) || 0,
        service_for: form.service_for,
        hide_on_website: form.hide_on_website,
        description: form.description
      };

      if (editingId) {
        await api.patch(`/admin/services/${editingId}`, payload);
        toast.success("Service updated");
        setEditingId(null);
      } else {
        await api.post("/admin/services", payload);
        toast.success("Service created");
      }
      setForm(emptyForm);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${editingId ? "update" : "create"} service`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this service?")) return;
    try {
      await api.delete(`/admin/services/${id}`);
      toast.success("Service deleted");
      refresh();
    } catch (err) { toast.error("Delete failed"); }
  };

  const filtered = services.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q);
  });
  const displayed = filtered.slice(0, showEntries);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Add Service Form */}
      <form onSubmit={submit} className="eminence-card p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="overline text-eminence-gold">{editingId ? "Edit Service" : "Add Service"}</p>
            {editingId && <p className="text-[10px] text-eminence-muted mt-1">Editing existing service. Cancel to discard changes.</p>}
          </div>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs font-bold uppercase tracking-widest text-eminence-muted border border-eminence-border px-4 py-2 rounded-xl hover:bg-eminence-surface transition-colors">
              Cancel
            </button>
          )}
        </div>

        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Service Name <span className="text-rose-500">*</span></label>
            <input type="text" required value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} placeholder="Service name" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Category <span className="text-rose-500">*</span></label>
            <SearchableServiceCategorySelect
              value={form.category}
              onChange={(val) => set("category", val)}
              allowAdd={isSuperAdmin}
            />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Duration <span className="text-rose-500">*</span></label>
            <input type="number" required min={1} value={form.duration_min} onChange={e => set("duration_min", e.target.value)} className={inputCls} placeholder="In minutes" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Price (Excl. Taxes) <span className="text-rose-500">*</span></label>
            <input type="number" required min={0} value={form.price} onChange={e => set("price", e.target.value)} className={inputCls} placeholder="500" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Membership Price <span className="text-rose-500">*</span></label>
            <input type="number" min={0} value={form.membership_price} onChange={e => set("membership_price", e.target.value)} className={inputCls} placeholder="500" />
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Reward Point(s)</label>
            <input type="number" min={0} value={form.reward_points} onChange={e => set("reward_points", e.target.value)} className={inputCls} placeholder="500" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Service For</label>
            <select value={form.service_for} onChange={e => set("service_for", e.target.value)} className={inputCls}>
              <option value="Men & Women">Men & Women</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-gold px-8 py-3 text-sm whitespace-nowrap">
              {editingId ? "Update Service" : "➕ Add New Service"}
            </button>
          </div>
        </div>
      </form>

      {/* Manage Services Table */}
      <div className="eminence-card overflow-hidden">
        <div className="px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-eminence-border/20">
          <p className="overline">Manage Service(s) ({filtered.length})</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-eminence-muted">
              Show
              <select value={showEntries} onChange={e => setShowEntries(Number(e.target.value))} className="bg-eminence-surface border border-eminence-border px-2 py-1 text-xs rounded">
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-eminence-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 bg-eminence-surface border border-eminence-border text-xs rounded-lg w-48 focus:outline-none focus:border-eminence-gold"
                placeholder="Search..." />
            </div>
          </div>
        </div>

        {displayed.length === 0 ? (
          <p className="text-center py-16 text-eminence-muted italic text-sm">No services found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-eminence-border/20 text-left">
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Name</th>
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Service For</th>
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Category</th>
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Duration</th>
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Price</th>
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Membership Price</th>
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Reward Point</th>
                  <th className="px-6 py-4 text-[10px] text-eminence-muted uppercase tracking-wider font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(svc => (
                  <tr key={svc.id} className={`border-b border-eminence-border/10 hover:bg-eminence-surface/30 transition-colors ${svc.hide_on_website ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4 font-medium">{svc.name}</td>
                    <td className="px-6 py-4 text-xs">{svc.service_for || "Men & Women"}</td>
                    <td className="px-6 py-4 text-xs">{svc.category}</td>
                    <td className="px-6 py-4 text-xs">{svc.duration_min} Min</td>
                    <td className="px-6 py-4 font-serif font-medium">₹{Number(svc.price || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 font-serif font-medium">₹{Number(svc.membership_price || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-xs">{svc.reward_points || 0}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEdit(svc)}
                          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border rounded-lg transition-all ${editingId === svc.id ? "bg-eminence-gold text-white border-eminence-gold" : "border-eminence-gold/40 text-eminence-gold hover:bg-eminence-gold hover:text-white"}`}>
                          {editingId === svc.id ? "Editing..." : "Edit"}
                        </button>
                        <button type="button" onClick={() => handleDelete(svc.id)}
                          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border border-rose-500/30 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > showEntries && (
          <p className="text-center py-4 text-xs text-eminence-muted">
            Showing {displayed.length} of {filtered.length} entries.{" "}
            <button type="button" onClick={() => setShowEntries(prev => prev + 10)} className="text-eminence-gold hover:underline font-bold">Show more</button>
          </p>
        )}
      </div>
    </div>
  );
}

const SERVICE_PROVIDER_TYPES = [
  "Hair Dresser",
  "Beautician",
  "Nail Artist",
  "Makeup Artist",
  "Skin Care Specialist",
  "Hair Colorist",
  "Barber",
  "Spa Therapist",
  "Other"
];

const SALES_STAFF_TYPES = [
  "Sales Consultant",
  "Sales Manager",
  "Sales Representative",
  "Other"
];

function ServiceProviderPanel({ employees, refresh, t, branches = [] }) {
  const emptyForm = {
    name: "", email: "", username: "", password: "", confirmPassword: "",
    phone: "", phones: [""],
    service_commission: "", service_commission_inr: "", service_commission_type: "%",
    product_commission: "", product_commission_inr: "", product_commission_type: "%",
    package_commission: "", package_commission_inr: "", package_commission_type: "%",
    member_commission: "", member_commission_inr: "", member_commission_type: "%",
    monthly_target: "",
    date_of_birth: "", working_hours_from: "10:00", working_hours_to: "19:00",
    base_salary: "", service_provider_type: "Hair Dresser",
    emergency_contact_number: "", emergency_contact_person: "",
    address: "", gender: "Male", branch: "Surat",
    date_of_joining: new Date().toISOString().split("T")[0],
    id_proof_image: "", photo: ""
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const serviceEmployees = employees.filter(e => e.role === "service");

  const startEdit = (emp) => {
    const phones = (emp.phone_numbers && emp.phone_numbers.length > 0) ? [...emp.phone_numbers] : [emp.phone || ""];
    setForm({
      name: emp.name || "",
      email: emp.email || "",
      username: emp.username || "",
      password: "", confirmPassword: "",
      phone: emp.phone || "",
      phones,
      service_commission: emp.commission_rate !== undefined ? Math.round(emp.commission_rate * 100) : "",
      service_commission_inr: emp.service_commission_inr || "",
      service_commission_type: emp.service_commission_inr > 0 ? "₹" : "%",
      product_commission: emp.product_commission_rate !== undefined ? Math.round(emp.product_commission_rate * 100) : "",
      product_commission_inr: emp.product_commission_inr || "",
      product_commission_type: emp.product_commission_inr > 0 ? "₹" : "%",
      package_commission: emp.package_commission_rate !== undefined ? Math.round(emp.package_commission_rate * 100) : "",
      package_commission_inr: emp.package_commission_inr || "",
      package_commission_type: emp.package_commission_inr > 0 ? "₹" : "%",
      member_commission: emp.member_commission_rate !== undefined ? Math.round(emp.member_commission_rate * 100) : "",
      member_commission_inr: emp.member_commission_inr || "",
      member_commission_type: emp.member_commission_inr > 0 ? "₹" : "%",
      monthly_target: emp.monthly_target || "",
      date_of_birth: emp.date_of_birth || "",
      working_hours_from: emp.working_hours_from || "10:00",
      working_hours_to: emp.working_hours_to || "19:00",
      base_salary: emp.base_salary || "",
      service_provider_type: emp.service_provider_type || "Hair Dresser",
      emergency_contact_number: emp.emergency_contact_number || "",
      emergency_contact_person: emp.emergency_contact_person || "",
      address: emp.address || "",
      gender: emp.gender || "Male",
      branch: emp.branch || "Surat",
      date_of_joining: emp.date_of_joining || "",
      id_proof_image: emp.id_proof_image || "",
      photo: emp.photo || ""
    });
    setEditingId(emp.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this service provider?")) return;
    try {
      await api.delete(`/admin/employees/${id}`);
      toast.success("Service provider deleted");
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || "Delete failed"); }
  };

  const toggleActive = async (emp) => {
    try {
      await api.patch(`/admin/employees/${emp.id}`, { is_active: !emp.is_active });
      toast.success(`Account ${emp.is_active ? "deactivated" : "activated"}`);
      refresh();
    } catch (err) { toast.error("Failed to toggle status"); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!editingId && form.password !== form.confirmPassword) {
      toast.error("Passwords do not match"); return;
    }
    if (!editingId && form.password.length < 6) {
      toast.error("Password must be at least 6 characters"); return;
    }

    try {
      const activePhones = form.phones.filter(p => p.trim() !== "");
      const payload = {
        name: form.name,
        email: form.email,
        username: form.username,
        phone: activePhones[0] || form.phone,
        phone_numbers: activePhones,
        role: "service",
        commission_rate: form.service_commission ? Number(form.service_commission) / 100 : 0,
        service_commission_inr: Number(form.service_commission_inr) || 0,
        product_commission_rate: form.product_commission ? Number(form.product_commission) / 100 : 0,
        product_commission_inr: Number(form.product_commission_inr) || 0,
        package_commission_rate: form.package_commission ? Number(form.package_commission) / 100 : 0,
        package_commission_inr: Number(form.package_commission_inr) || 0,
        member_commission_rate: form.member_commission ? Number(form.member_commission) / 100 : 0,
        member_commission_inr: Number(form.member_commission_inr) || 0,
        monthly_target: Number(form.monthly_target) || 0,
        date_of_birth: form.date_of_birth,
        working_hours_from: form.working_hours_from,
        working_hours_to: form.working_hours_to,
        base_salary: Number(form.base_salary) || 0,
        service_provider_type: form.service_provider_type,
        emergency_contact_number: form.emergency_contact_number,
        emergency_contact_person: form.emergency_contact_person,
        address: form.address,
        gender: form.gender,
        branch: form.branch,
        date_of_joining: form.date_of_joining,
        id_proof_image: form.id_proof_image,
        photo: form.photo,
      };

      if (editingId) {
        if (form.password) payload.password = form.password;
        await api.patch(`/admin/employees/${editingId}`, payload);
        toast.success("Service provider updated");
        setEditingId(null);
      } else {
        payload.password = form.password;
        await api.post("/admin/employees", payload);
        toast.success("Service provider created");
      }
      setForm(emptyForm);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${editingId ? "update" : "create"} service provider`);
    }
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const inputCls = "w-full bg-eminence-surface border border-eminence-border px-3 py-2.5 focus:outline-none focus:border-eminence-gold text-sm rounded-lg transition-colors";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Form Card */}
      <form onSubmit={submit} className="eminence-card p-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="overline text-eminence-gold">{editingId ? "Edit Service Provider" : "Add New Service Provider"}</p>
            {editingId && <p className="text-[10px] text-eminence-muted mt-1">Leave password blank to keep current password</p>}
          </div>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs font-bold uppercase tracking-widest text-eminence-muted border border-eminence-border px-4 py-2 rounded-xl hover:bg-eminence-surface transition-colors">
              Cancel
            </button>
          )}
        </div>

        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Enter Name <span className="text-rose-500">*</span></label>
            <input type="text" required value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} placeholder="Service provider name" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Service Commission</label>
            <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
              <select
                value={form.service_commission_type}
                onChange={(e) => {
                  const t = e.target.value;
                  set("service_commission_type", t);
                  if (t === "%") {
                    set("service_commission", form.service_commission_inr);
                    set("service_commission_inr", "");
                  } else {
                    set("service_commission_inr", form.service_commission);
                    set("service_commission", "");
                  }
                }}
                className="bg-transparent border-r border-eminence-border px-3 py-2.5 text-sm text-eminence-muted focus:outline-none cursor-pointer hover:bg-black/5"
              >
                <option value="%">%</option>
                <option value="₹">₹</option>
              </select>
              <input
                type="number"
                min={0}
                max={form.service_commission_type === "%" ? 100 : undefined}
                value={form.service_commission_type === "%" ? form.service_commission : form.service_commission_inr}
                onChange={(e) => {
                  if (form.service_commission_type === "%") set("service_commission", e.target.value);
                  else set("service_commission_inr", e.target.value);
                }}
                className="w-full bg-transparent px-3 py-2.5 focus:outline-none text-sm"
                placeholder={form.service_commission_type === "%" ? "Percentage" : "Fixed INR"}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Product Commission</label>
            <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
              <select
                value={form.product_commission_type}
                onChange={(e) => {
                  const t = e.target.value;
                  set("product_commission_type", t);
                  if (t === "%") {
                    set("product_commission", form.product_commission_inr);
                    set("product_commission_inr", "");
                  } else {
                    set("product_commission_inr", form.product_commission);
                    set("product_commission", "");
                  }
                }}
                className="bg-transparent border-r border-eminence-border px-3 py-2.5 text-sm text-eminence-muted focus:outline-none cursor-pointer hover:bg-black/5"
              >
                <option value="%">%</option>
                <option value="₹">₹</option>
              </select>
              <input
                type="number"
                min={0}
                max={form.product_commission_type === "%" ? 100 : undefined}
                value={form.product_commission_type === "%" ? form.product_commission : form.product_commission_inr}
                onChange={(e) => {
                  if (form.product_commission_type === "%") set("product_commission", e.target.value);
                  else set("product_commission_inr", e.target.value);
                }}
                className="w-full bg-transparent px-3 py-2.5 focus:outline-none text-sm"
                placeholder={form.product_commission_type === "%" ? "Percentage" : "Fixed INR"}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Package Commission</label>
            <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
              <select
                value={form.package_commission_type}
                onChange={(e) => {
                  const t = e.target.value;
                  set("package_commission_type", t);
                  if (t === "%") {
                    set("package_commission", form.package_commission_inr);
                    set("package_commission_inr", "");
                  } else {
                    set("package_commission_inr", form.package_commission);
                    set("package_commission", "");
                  }
                }}
                className="bg-transparent border-r border-eminence-border px-3 py-2.5 text-sm text-eminence-muted focus:outline-none cursor-pointer hover:bg-black/5"
              >
                <option value="%">%</option>
                <option value="₹">₹</option>
              </select>
              <input
                type="number"
                min={0}
                max={form.package_commission_type === "%" ? 100 : undefined}
                value={form.package_commission_type === "%" ? form.package_commission : form.package_commission_inr}
                onChange={(e) => {
                  if (form.package_commission_type === "%") set("package_commission", e.target.value);
                  else set("package_commission_inr", e.target.value);
                }}
                className="w-full bg-transparent px-3 py-2.5 focus:outline-none text-sm"
                placeholder={form.package_commission_type === "%" ? "Percentage" : "Fixed INR"}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Member Commission</label>
            <div className="flex bg-eminence-surface border border-eminence-border rounded-lg overflow-hidden focus-within:border-eminence-gold transition-colors">
              <select
                value={form.member_commission_type}
                onChange={(e) => {
                  const t = e.target.value;
                  set("member_commission_type", t);
                  if (t === "%") {
                    set("member_commission", form.member_commission_inr);
                    set("member_commission_inr", "");
                  } else {
                    set("member_commission_inr", form.member_commission);
                    set("member_commission", "");
                  }
                }}
                className="bg-transparent border-r border-eminence-border px-3 py-2.5 text-sm text-eminence-muted focus:outline-none cursor-pointer hover:bg-black/5"
              >
                <option value="%">%</option>
                <option value="₹">₹</option>
              </select>
              <input
                type="number"
                min={0}
                max={form.member_commission_type === "%" ? 100 : undefined}
                value={form.member_commission_type === "%" ? form.member_commission : form.member_commission_inr}
                onChange={(e) => {
                  if (form.member_commission_type === "%") set("member_commission", e.target.value);
                  else set("member_commission_inr", e.target.value);
                }}
                className="w-full bg-transparent px-3 py-2.5 focus:outline-none text-sm"
                placeholder={form.member_commission_type === "%" ? "Percentage" : "Fixed INR"}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Monthly Target (₹)</label>
            <input type="number" min={0} value={form.monthly_target} onChange={e => set("monthly_target", e.target.value)} className={inputCls} placeholder="e.g. 50000" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Date of Birth</label>
            <input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Working Hours, Salary, Type, Contacts, Address */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-xs text-eminence-muted block mb-1">Working Hours <span className="text-rose-500">*</span></label>
            <div className="flex gap-2 items-center">
              <input type="time" required value={form.working_hours_from} onChange={e => set("working_hours_from", e.target.value)} className={`${inputCls} flex-1`} />
              <span className="text-eminence-muted text-xs font-bold">TO</span>
              <input type="time" required value={form.working_hours_to} onChange={e => set("working_hours_to", e.target.value)} className={`${inputCls} flex-1`} />
            </div>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Monthly Salary <span className="text-rose-500">*</span></label>
            <input type="number" required min={0} value={form.base_salary} onChange={e => set("base_salary", e.target.value)} className={inputCls} placeholder="Monthly salary" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Service Provider Type <span className="text-rose-500">*</span></label>
            <select required value={form.service_provider_type} onChange={e => set("service_provider_type", e.target.value)} className={inputCls}>
              {SERVICE_PROVIDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-eminence-muted block">Contact Number <span className="text-rose-500">*</span></label>
            {form.phones.map((p, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input type="text" required={idx === 0} value={p}
                  onChange={e => { const c = [...form.phones]; c[idx] = e.target.value; set("phones", c); }}
                  className={`${inputCls} flex-1`}
                  placeholder={idx === 0 ? "Primary contact" : `Alt. ${idx + 1}`}
                />
                {form.phones.length > 1 && (
                  <button type="button" onClick={() => set("phones", form.phones.filter((_, i) => i !== idx))}
                    className="text-eminence-muted hover:text-red-500 text-xs px-1">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => set("phones", [...form.phones, ""])} className="text-xs text-eminence-gold hover:underline font-bold">+ Add Number</button>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Email Address</label>
            <input type="email" required value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} placeholder="Email" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Emergency Contact Number</label>
            <input type="text" value={form.emergency_contact_number} onChange={e => set("emergency_contact_number", e.target.value)} className={inputCls} placeholder="Emergency contact" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Emergency Contact Person</label>
            <input type="text" value={form.emergency_contact_person} onChange={e => set("emergency_contact_person", e.target.value)} className={inputCls} placeholder="Emergency contact person" />
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <label className="text-xs text-eminence-muted block mb-1">Address</label>
            <input type="text" value={form.address} onChange={e => set("address", e.target.value)} className={inputCls} placeholder="Address" />
          </div>
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Username</label>
            <input type="text" value={form.username} onChange={e => set("username", e.target.value)} className={inputCls} placeholder="Username" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">{editingId ? "New Password (optional)" : "Password"} <span className="text-rose-500">{editingId ? "" : "*"}</span></label>
            <input type="password" required={!editingId} value={form.password} onChange={e => set("password", e.target.value)} className={inputCls}
              placeholder={editingId ? "Leave blank to keep current" : "Password"} />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">{editingId ? "Confirm New Password" : "Confirm Password"} <span className="text-rose-500">{editingId ? "" : "*"}</span></label>
            <input type="password" required={!editingId} value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} className={inputCls}
              placeholder="Confirm password" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Gender <span className="text-rose-500">*</span></label>
            <div className="flex gap-6 items-center h-[42px]">
              {["Male", "Female"].map(g => (
                <label key={g} className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${form.gender === g ? "border-eminence-gold" : "border-eminence-border group-hover:border-eminence-gold/50"}`}>
                    {form.gender === g && <div className="w-2 h-2 rounded-full bg-eminence-gold" />}
                  </div>
                  <input type="radio" name="gender" value={g} checked={form.gender === g} onChange={e => set("gender", e.target.value)} className="sr-only" />
                  <span className={`text-sm ${form.gender === g ? "text-eminence-gold font-bold" : "text-eminence-muted"}`}>{g}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Branch <span className="text-rose-500">*</span></label>
            <select required value={form.branch} onChange={e => set("branch", e.target.value)} className={inputCls}>
              {branches.map(b => {
                const bName = typeof b === "string" ? b : (b?.name || "Unknown");
                return <option key={bName} value={bName}>{bName}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Row 5 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Date of Joining <span className="text-rose-500">*</span></label>
            <input type="date" required value={form.date_of_joining} onChange={e => set("date_of_joining", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Upload ID Proof</label>
            <ImageUpload value={form.id_proof_image} onChange={val => set("id_proof_image", val)} testId="sp-id-proof" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Upload Photo</label>
            <ImageUpload value={form.photo} onChange={val => set("photo", val)} testId="sp-photo" />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-gold px-10 py-3 text-sm">
            {editingId ? "Update Service Provider" : "➕ Add New Service Provider"}
          </button>
        </div>
      </form>

      {/* List of existing service providers */}
      <div>
        <p className="overline mb-4">Registered Service Providers ({serviceEmployees.length})</p>
        {serviceEmployees.length === 0 && (
          <div className="eminence-card p-12 text-center text-eminence-muted italic text-sm">
            No service providers registered yet. Use the form above to add one.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {serviceEmployees.map(emp => {
            const inactive = emp.is_active === false;
            return (
              <div key={emp.id} className={`eminence-card p-6 space-y-4 transition-all ${inactive ? "opacity-60 border-red-500/30 bg-red-500/[0.02]" : ""}`}>
                {/* Header */}
                <div className="flex items-start gap-4">
                  {emp.photo ? (
                    <img src={emp.photo} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-eminence-gold/30" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-eminence-surface border-2 border-eminence-border flex items-center justify-center font-bold text-eminence-gold text-lg">
                      {emp.name ? emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "SP"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif text-lg truncate">{emp.name}</h4>
                      {inactive && <span className="text-[9px] uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/25 px-2 py-0.5 rounded font-bold">Inactive</span>}
                    </div>
                    <p className="text-xs text-eminence-muted truncate">{emp.email}</p>
                    <p className="text-xs text-eminence-muted">{emp.phone_numbers && emp.phone_numbers.length > 0 ? emp.phone_numbers.join(" / ") : (emp.phone || "No phone")}</p>
                  </div>
                  <span className="uppercase text-[10px] tracking-wider text-eminence-gold border border-eminence-gold/40 px-2.5 py-0.5 rounded-full bg-eminence-gold/5 font-bold whitespace-nowrap">
                    {emp.service_provider_type || "Service"}
                  </span>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-3 border-t border-b border-eminence-border/20 text-xs">
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Service Comm.</span>
                    <span className="font-medium text-emerald-600 font-serif">{emp.commission_rate !== undefined ? `${(emp.commission_rate * 100).toFixed(0)}%` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Product Comm.</span>
                    <span className="font-medium text-emerald-600 font-serif">{emp.product_commission_rate !== undefined ? `${(emp.product_commission_rate * 100).toFixed(0)}%` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Monthly Salary</span>
                    <span className="font-medium font-serif">₹{(emp.base_salary || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Working Hours</span>
                    <span className="font-medium">{emp.working_hours_from || "—"} – {emp.working_hours_to || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Gender</span>
                    <span className="font-medium">{emp.gender || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Joined</span>
                    <span className="font-medium">{emp.date_of_joining || (emp.created_at ? new Date(emp.created_at).toLocaleDateString() : "—")}</span>
                  </div>
                </div>

                {/* Emergency & Address */}
                {(emp.emergency_contact_number || emp.address) && (
                  <div className="text-xs bg-eminence-surface/20 p-3 rounded-lg border border-eminence-border/10 space-y-1">
                    {emp.emergency_contact_number && (
                      <p><span className="text-[9px] text-eminence-muted uppercase font-bold tracking-wider">Emergency:</span> {emp.emergency_contact_person ? `${emp.emergency_contact_person} — ` : ""}{emp.emergency_contact_number}</p>
                    )}
                    {emp.address && (
                      <p><span className="text-[9px] text-eminence-muted uppercase font-bold tracking-wider">Address:</span> {emp.address}</p>
                    )}
                  </div>
                )}

                {/* Document images */}
                <div className="grid grid-cols-2 gap-4">
                  {emp.id_proof_image && (
                    <div>
                      <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-1">ID Proof</span>
                      <div className="relative group/doc w-24 h-16 overflow-hidden rounded-lg border border-eminence-border/30">
                        <img src={emp.id_proof_image} alt="ID Proof" className="w-full h-full object-cover transition-transform duration-300 group-hover/doc:scale-105" />
                        <a href={emp.id_proof_image} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/40 opacity-0 group-hover/doc:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">View</a>
                      </div>
                    </div>
                  )}
                  {emp.photo && (
                    <div>
                      <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-1">Photo</span>
                      <div className="relative group/doc w-24 h-16 overflow-hidden rounded-lg border border-eminence-border/30">
                        <img src={emp.photo} alt="Photo" className="w-full h-full object-cover transition-transform duration-300 group-hover/doc:scale-105" />
                        <a href={emp.photo} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/40 opacity-0 group-hover/doc:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">View</a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-eminence-border/10 flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(emp)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 border rounded-xl transition-all border-eminence-gold/40 text-eminence-gold hover:bg-eminence-gold hover:text-white ${editingId === emp.id ? "bg-eminence-gold text-white" : ""}`}>
                    {editingId === emp.id ? "✎ Currently Editing" : "Edit Details"}
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => toggleActive(emp)}
                      className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 border rounded-xl transition-all ${inactive ? "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/5" : "border-rose-500/30 text-rose-500 hover:bg-rose-500/5"}`}>
                      {inactive ? "Activate" : "Deactivate"}
                    </button>
                    <button type="button" onClick={() => handleDelete(emp.id)}
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest border border-rose-500/30 text-rose-500 px-4 py-2 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttendanceKiosk({ employees, refresh }) {
  const webcamRef = useRef(null);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [isCheckout, setIsCheckout] = useState(false);
  const [imgSrc, setImgSrc] = useState(null);
  const [loading, setLoading] = useState(false);

  const videoConstraints = {
    width: 720,
    height: 720,
    facingMode: "user"
  };

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImgSrc(imageSrc);
    } else {
      toast.error("Failed to capture photo. Please check camera connection.");
    }
  }, [webcamRef]);

  const retake = () => {
    setImgSrc(null);
  };

  const handleSubmit = async () => {
    if (!selectedEmpId) {
      toast.error("Please select an employee.");
      return;
    }
    if (!imgSrc) {
      toast.error("Please capture a photo first.");
      return;
    }

    setLoading(true);

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await api.post("/admin/attendance/kiosk", {
            user_id: selectedEmpId,
            is_checkout: isCheckout,
            photo_base64: imgSrc,
            latitude,
            longitude
          });
          toast.success(res.data.message || "Attendance recorded successfully!");
          setSelectedEmpId("");
          setImgSrc(null);
          refresh();
        } catch (err) {
          toast.error(err.response?.data?.detail || "Failed to submit attendance.");
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error(err);
        toast.error("Geolocation is required to submit kiosk attendance.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="eminence-card p-8 max-w-xl mx-auto space-y-6 animate-fade-in bg-white shadow-lg rounded-3xl border border-eminence-border/30">
      <div className="text-center">
        <p className="overline text-eminence-gold">Attendance Verification Kiosk</p>
        <h3 className="font-serif text-2xl text-gray-900 mt-1">Staff Check-in Station</h3>
        <p className="text-xs text-eminence-muted mt-2">
          Verify and check-in / check-out employees arriving at the salon one by one.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-eminence-muted block mb-1 font-bold uppercase tracking-wider">Select Employee</label>
          <select
            value={selectedEmpId}
            onChange={(e) => {
              setSelectedEmpId(e.target.value);
              setImgSrc(null);
            }}
            className="w-full bg-eminence-surface border border-eminence-border px-3 py-2.5 focus:outline-none focus:border-eminence-gold text-sm rounded-lg"
          >
            <option value="">-- Choose Employee --</option>
            {employees.filter(e => e.role !== "sales").map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.role?.toUpperCase()})</option>
            ))}
          </select>
        </div>

        <div className="flex gap-4">
          <label className="flex-1 flex items-center justify-center gap-2 border border-eminence-border p-3 rounded-xl cursor-pointer hover:bg-eminence-surface/40 transition-colors">
            <input
              type="radio"
              name="kiosk-type"
              checked={!isCheckout}
              onChange={() => setIsCheckout(false)}
              className="accent-eminence-gold"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">Check-In</span>
          </label>
          <label className="flex-1 flex items-center justify-center gap-2 border border-eminence-border p-3 rounded-xl cursor-pointer hover:bg-eminence-surface/40 transition-colors">
            <input
              type="radio"
              name="kiosk-type"
              checked={isCheckout}
              onChange={() => setIsCheckout(true)}
              className="accent-eminence-gold"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">Check-Out</span>
          </label>
        </div>

        {selectedEmpId && (
          <div className="relative w-full aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-eminence-border/60 flex items-center justify-center shadow-inner">
            {!imgSrc ? (
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className="object-cover w-full h-full"
                onUserMediaError={() => toast.error("Camera access denied or unavailable.")}
              />
            ) : (
              <img src={imgSrc} alt="Captured preview" className="object-cover w-full h-full" />
            )}
          </div>
        )}

        {selectedEmpId && (
          <div className="flex gap-4 justify-center font-bold">
            {!imgSrc ? (
              <button
                type="button"
                onClick={capture}
                className="flex items-center gap-2 bg-eminence-gold text-white px-6 py-2.5 rounded-xl uppercase tracking-widest text-[10px] hover:bg-black transition-colors"
              >
                <Camera size={14} /> Capture Photo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={retake}
                  className="flex items-center gap-2 border border-eminence-border px-6 py-2.5 rounded-xl uppercase tracking-widest text-[10px] hover:bg-eminence-surface transition-colors"
                >
                  <RefreshCw size={14} /> Retake
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-xl uppercase tracking-widest text-[10px] hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Verifying..." : "Verify & Submit"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SalesStaffPanel({ employees, refresh, t, branches = [] }) {
  const emptyForm = {
    name: "", email: "", username: "", password: "", confirmPassword: "",
    phone: "", phones: [""],
    commission: "",
    date_of_birth: "", working_hours_from: "10:00", working_hours_to: "19:00",
    base_salary: "", sales_staff_type: "Sales Consultant",
    emergency_contact_number: "", emergency_contact_person: "",
    address: "", gender: "Male",
    date_of_joining: new Date().toISOString().split("T")[0],
    id_proof_image: "", photo: "",
    branch: "Surat", section: "Men",
    monthly_target: ""
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const salesEmployees = employees.filter(e => e.role === "sales");

  const startEdit = (emp) => {
    const phones = (emp.phone_numbers && emp.phone_numbers.length > 0) ? [...emp.phone_numbers] : [emp.phone || ""];
    setForm({
      name: emp.name || "",
      email: emp.email || "",
      username: emp.username || "",
      password: "", confirmPassword: "",
      phone: emp.phone || "",
      phones,
      commission: emp.commission_rate !== undefined ? Math.round(emp.commission_rate * 100) : "",
      date_of_birth: emp.date_of_birth || "",
      working_hours_from: emp.working_hours_from || "10:00",
      working_hours_to: emp.working_hours_to || "19:00",
      base_salary: emp.base_salary || "",
      sales_staff_type: emp.service_provider_type || "Sales Consultant",
      emergency_contact_number: emp.emergency_contact_number || "",
      emergency_contact_person: emp.emergency_contact_person || "",
      address: emp.address || "",
      gender: emp.gender || "Male",
      date_of_joining: emp.date_of_joining || "",
      id_proof_image: emp.id_proof_image || "",
      photo: emp.photo || "",
      branch: emp.branch || "Surat",
      section: emp.section || "Men",
      monthly_target: emp.monthly_target || ""
    });
    setEditingId(emp.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this sales staff?")) return;
    try {
      await api.delete(`/admin/employees/${id}`);
      toast.success("Sales staff deleted");
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || "Delete failed"); }
  };

  const toggleActive = async (emp) => {
    try {
      await api.patch(`/admin/employees/${emp.id}`, { is_active: !emp.is_active });
      toast.success(`Account ${emp.is_active ? "deactivated" : "activated"}`);
      refresh();
    } catch (err) { toast.error("Failed to toggle status"); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!editingId && form.password !== form.confirmPassword) {
      toast.error("Passwords do not match"); return;
    }
    if (!editingId && form.password.length < 6) {
      toast.error("Password must be at least 6 characters"); return;
    }

    try {
      const activePhones = form.phones.filter(p => p.trim() !== "");
      const payload = {
        name: form.name,
        email: form.email,
        username: form.username,
        phone: activePhones[0] || form.phone,
        phone_numbers: activePhones,
        role: "sales",
        commission_rate: form.commission ? Number(form.commission) / 100 : 0.05,
        product_commission_rate: form.commission ? Number(form.commission) / 100 : 0.05,
        date_of_birth: form.date_of_birth,
        working_hours_from: form.working_hours_from,
        working_hours_to: form.working_hours_to,
        base_salary: Number(form.base_salary) || 0,
        service_provider_type: form.sales_staff_type,
        emergency_contact_number: form.emergency_contact_number,
        emergency_contact_person: form.emergency_contact_person,
        address: form.address,
        gender: form.gender,
        date_of_joining: form.date_of_joining,
        id_proof_image: form.id_proof_image,
        photo: form.photo,
        branch: form.branch,
        section: form.section,
        monthly_target: Number(form.monthly_target) || 0
      };

      if (editingId) {
        if (form.password) payload.password = form.password;
        await api.patch(`/admin/employees/${editingId}`, payload);
        toast.success("Sales staff updated");
        setEditingId(null);
      } else {
        payload.password = form.password;
        await api.post("/admin/employees", payload);
        toast.success("Sales staff created");
      }
      setForm(emptyForm);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${editingId ? "update" : "create"} sales staff`);
    }
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const inputCls = "w-full bg-eminence-surface border border-eminence-border px-3 py-2.5 focus:outline-none focus:border-eminence-gold text-sm rounded-lg transition-colors";

  return (
    <div className="space-y-8 animate-fade-in">
      <form onSubmit={submit} className="eminence-card p-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="overline text-eminence-gold">{editingId ? "Edit Sales Staff" : "Add New Sales Staff"}</p>
            {editingId && <p className="text-[10px] text-eminence-muted mt-1">Leave password blank to keep current password</p>}
          </div>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs font-bold uppercase tracking-widest text-eminence-muted border border-eminence-border px-4 py-2 rounded-xl hover:bg-eminence-surface transition-colors">
              Cancel
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs text-eminence-muted block mb-1">Enter Name <span className="text-rose-500">*</span></label>
            <input type="text" required value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} placeholder="Sales staff name" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Commission %</label>
            <input type="number" min={0} max={100} value={form.commission} onChange={e => set("commission", e.target.value)} className={inputCls} placeholder="Commission" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Date of Birth</label>
            <input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-xs text-eminence-muted block mb-1">Working Hours <span className="text-rose-500">*</span></label>
            <div className="flex gap-2 items-center">
              <input type="time" required value={form.working_hours_from} onChange={e => set("working_hours_from", e.target.value)} className={`${inputCls} flex-1`} />
              <span className="text-eminence-muted text-xs font-bold">TO</span>
              <input type="time" required value={form.working_hours_to} onChange={e => set("working_hours_to", e.target.value)} className={`${inputCls} flex-1`} />
            </div>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Monthly Salary <span className="text-rose-500">*</span></label>
            <input type="number" required min={0} value={form.base_salary} onChange={e => set("base_salary", e.target.value)} className={inputCls} placeholder="Monthly salary" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Monthly Target</label>
            <input type="number" min={0} value={form.monthly_target} onChange={e => set("monthly_target", e.target.value)} className={inputCls} placeholder="Monthly target" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Sales Staff Type <span className="text-rose-500">*</span></label>
            <select required value={form.sales_staff_type} onChange={e => set("sales_staff_type", e.target.value)} className={inputCls}>
              {SALES_STAFF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-eminence-muted block">Contact Number <span className="text-rose-500">*</span></label>
            {form.phones.map((p, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input type="text" required={idx === 0} value={p}
                  onChange={e => { const c = [...form.phones]; c[idx] = e.target.value; set("phones", c); }}
                  className={`${inputCls} flex-1`}
                  placeholder={idx === 0 ? "Primary contact" : `Alt. ${idx + 1}`}
                />
                {form.phones.length > 1 && (
                  <button type="button" onClick={() => set("phones", form.phones.filter((_, i) => i !== idx))}
                    className="text-eminence-muted hover:text-red-500 text-xs px-1">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => set("phones", [...form.phones, ""])} className="text-xs text-eminence-gold hover:underline font-bold">+ Add Number</button>
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Email Address</label>
            <input type="email" required value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} placeholder="Email" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Emergency Contact Number</label>
            <input type="text" value={form.emergency_contact_number} onChange={e => set("emergency_contact_number", e.target.value)} className={inputCls} placeholder="Emergency contact" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Emergency Contact Person</label>
            <input type="text" value={form.emergency_contact_person} onChange={e => set("emergency_contact_person", e.target.value)} className={inputCls} placeholder="Emergency contact person" />
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-xs text-eminence-muted block mb-1">Branch <span className="text-rose-500">*</span></label>
            <select required value={form.branch} onChange={e => set("branch", e.target.value)} className={inputCls}>
              {branches.map(b => {
                const bName = typeof b === "string" ? b : (b?.name || "Unknown");
                return <option key={bName} value={bName}>{bName}</option>;
              })}
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-xs text-eminence-muted block mb-1">Section <span className="text-rose-500">*</span></label>
            <select required value={form.section} onChange={e => set("section", e.target.value)} className={inputCls}>
              <option value="Men">Men</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <label className="text-xs text-eminence-muted block mb-1">Address</label>
            <input type="text" value={form.address} onChange={e => set("address", e.target.value)} className={inputCls} placeholder="Address" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Username</label>
            <input type="text" value={form.username} onChange={e => set("username", e.target.value)} className={inputCls} placeholder="Username" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">{editingId ? "New Password (optional)" : "Password"} <span className="text-rose-500">{editingId ? "" : "*"}</span></label>
            <input type="password" required={!editingId} value={form.password} onChange={e => set("password", e.target.value)} className={inputCls}
              placeholder={editingId ? "Leave blank to keep current" : "Password"} />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">{editingId ? "Confirm New Password" : "Confirm Password"} <span className="text-rose-500">{editingId ? "" : "*"}</span></label>
            <input type="password" required={!editingId} value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} className={inputCls}
              placeholder="Confirm password" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Gender <span className="text-rose-500">*</span></label>
            <div className="flex gap-6 items-center h-[42px]">
              {["Male", "Female"].map(g => (
                <label key={g} className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${form.gender === g ? "border-eminence-gold" : "border-eminence-border group-hover:border-eminence-gold/50"}`}>
                    {form.gender === g && <div className="w-2 h-2 rounded-full bg-eminence-gold" />}
                  </div>
                  <input type="radio" name="gender" value={g} checked={form.gender === g} onChange={e => set("gender", e.target.value)} className="sr-only" />
                  <span className={`text-sm ${form.gender === g ? "text-eminence-gold font-bold" : "text-eminence-muted"}`}>{g}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Date of Joining <span className="text-rose-500">*</span></label>
            <input type="date" required value={form.date_of_joining} onChange={e => set("date_of_joining", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Upload ID Proof</label>
            <ImageUpload value={form.id_proof_image} onChange={val => set("id_proof_image", val)} testId="ss-id-proof" />
          </div>
          <div>
            <label className="text-xs text-eminence-muted block mb-1">Upload Photo</label>
            <ImageUpload value={form.photo} onChange={val => set("photo", val)} testId="ss-photo" />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-gold px-10 py-3 text-sm">
            {editingId ? "Update Sales Staff" : "➕ Add New Sales Staff"}
          </button>
        </div>
      </form>

      <div>
        <p className="overline mb-4">Registered Sales Staff ({salesEmployees.length})</p>
        {salesEmployees.length === 0 && (
          <div className="eminence-card p-12 text-center text-eminence-muted italic text-sm">
            No sales staff registered yet. Use the form above to add one.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {salesEmployees.map(emp => {
            const inactive = emp.is_active === false;
            return (
              <div key={emp.id} className={`eminence-card p-6 space-y-4 transition-all ${inactive ? "opacity-60 border-red-500/30 bg-red-500/[0.02]" : ""}`}>
                <div className="flex items-start gap-4">
                  {emp.photo ? (
                    <img src={emp.photo} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-eminence-gold/30" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-eminence-surface border-2 border-eminence-border flex items-center justify-center font-bold text-eminence-gold text-lg">
                      {emp.name ? emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "SS"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif text-lg truncate">{emp.name}</h4>
                      {inactive && <span className="text-[9px] uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/25 px-2 py-0.5 rounded font-bold">Inactive</span>}
                    </div>
                    <p className="text-xs text-eminence-muted truncate">{emp.email}</p>
                    <p className="text-xs text-eminence-muted">{emp.phone_numbers && emp.phone_numbers.length > 0 ? emp.phone_numbers.join(" / ") : (emp.phone || "No phone")}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="uppercase text-[10px] tracking-wider text-eminence-gold border border-eminence-gold/40 px-2.5 py-0.5 rounded-full bg-eminence-gold/5 font-bold whitespace-nowrap">
                      {emp.service_provider_type || "Sales"}
                    </span>
                    <span className="text-[10px] font-medium text-eminence-muted">
                      {emp.branch} {emp.section ? `• ${emp.section}` : ""}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-3 border-t border-b border-eminence-border/20 text-xs">
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Commission</span>
                    <span className="font-medium text-emerald-600 font-serif">{emp.commission_rate !== undefined ? `${(emp.commission_rate * 100).toFixed(0)}%` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Monthly Salary</span>
                    <span className="font-medium font-serif">₹{(emp.base_salary || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Working Hours</span>
                    <span className="font-medium">{emp.working_hours_from || "—"} – {emp.working_hours_to || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Gender</span>
                    <span className="font-medium">{emp.gender || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-0.5">Joined</span>
                    <span className="font-medium">{emp.date_of_joining || (emp.created_at ? new Date(emp.created_at).toLocaleDateString() : "—")}</span>
                  </div>
                </div>

                {(emp.emergency_contact_number || emp.address) && (
                  <div className="text-xs bg-eminence-surface/20 p-3 rounded-lg border border-eminence-border/10 space-y-1">
                    {emp.emergency_contact_number && (
                      <p><span className="text-[9px] text-eminence-muted uppercase font-bold tracking-wider">Emergency:</span> {emp.emergency_contact_person ? `${emp.emergency_contact_person} — ` : ""}{emp.emergency_contact_number}</p>
                    )}
                    {emp.address && (
                      <p><span className="text-[9px] text-eminence-muted uppercase font-bold tracking-wider">Address:</span> {emp.address}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {emp.id_proof_image && (
                    <div>
                      <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-1">ID Proof</span>
                      <div className="relative group/doc w-24 h-16 overflow-hidden rounded-lg border border-eminence-border/30">
                        <img src={emp.id_proof_image} alt="ID Proof" className="w-full h-full object-cover transition-transform duration-300 group-hover/doc:scale-105" />
                        <a href={emp.id_proof_image} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/40 opacity-0 group-hover/doc:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">View</a>
                      </div>
                    </div>
                  )}
                  {emp.photo && (
                    <div>
                      <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block mb-1">Photo</span>
                      <div className="relative group/doc w-24 h-16 overflow-hidden rounded-lg border border-eminence-border/30">
                        <img src={emp.photo} alt="Photo" className="w-full h-full object-cover transition-transform duration-300 group-hover/doc:scale-105" />
                        <a href={emp.photo} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/40 opacity-0 group-hover/doc:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">View</a>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-eminence-border/10 flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(emp)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 border rounded-xl transition-all border-eminence-gold/40 text-eminence-gold hover:bg-eminence-gold hover:text-white ${editingId === emp.id ? "bg-eminence-gold text-white" : ""}`}>
                    {editingId === emp.id ? "✎ Currently Editing" : "Edit Details"}
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => toggleActive(emp)}
                      className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 border rounded-xl transition-all ${inactive ? "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/5" : "border-rose-500/30 text-rose-500 hover:bg-rose-500/5"}`}>
                      {inactive ? "Activate" : "Deactivate"}
                    </button>
                    <button type="button" onClick={() => handleDelete(emp.id)}
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest border border-rose-500/30 text-rose-500 px-4 py-2 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}



function ConsultationsPanel({ consultations, orders = [], refresh, t, branches = [] }) {
  const [expandedId, setExpandedId] = useState(null);
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [isMediaManagerExpanded, setIsMediaManagerExpanded] = useState(false);
  const [selectedSalesPerson, setSelectedSalesPerson] = useState("");

  // States for edit modal
  const [editingConsultation, setEditingConsultation] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [updating, setUpdating] = useState(false);

  const getInvoiceForConsultation = (consultation) => {
    if (!orders || orders.length === 0) return null;
    const normalizePhone = (p) => {
      if (!p) return "";
      return p.replace(/[^0-9]/g, "").slice(-10);
    };
    const cPhone = normalizePhone(consultation.phone);
    if (!cPhone) return null;
    const matchingOrders = orders.filter(o => normalizePhone(o.phone) === cPhone);
    if (matchingOrders.length === 0) return null;
    matchingOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return matchingOrders[0];
  };

  const handleUpdateConsultation = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const payload = { ...editForm };
      if (payload.revenue !== undefined && payload.revenue !== "") {
        payload.revenue = Number(payload.revenue);
      }
      await api.patch(`/admin/consultations/${editingConsultation.id}`, payload);
      toast.success("Consultation record updated successfully!");
      setEditingConsultation(null);
      if (refresh) refresh();
    } catch (err) {
      toast.error("Failed to update consultation: " + (err.response?.data?.detail || err.message));
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    api.get("/consultation-media")
      .then(res => {
        setImages(res.data.images || []);
        setVideos(res.data.videos || []);
      })
      .catch(err => console.error("Failed to load consultation gallery media:", err));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/admin/consultation-media", { images, videos });
      toast.success("Consultation gallery updated successfully!");
    } catch (err) {
      toast.error("Failed to update consultation gallery: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Get unique salespersons
  const salesPersons = Array.from(
    new Set(
      consultations
        .map(c => c.consulted_by)
        .filter(name => name && name.trim() !== "")
    )
  ).sort();

  // Filter consultations based on selected salesperson
  const filteredConsultations = consultations.filter(c => {
    if (!selectedSalesPerson) return true;
    return c.consulted_by === selectedSalesPerson;
  });

  return (
    <div className="space-y-6">
      {/* Gallery Media Manager Accordion */}
      <div className="eminence-card bg-white border border-eminence-border rounded-xl overflow-hidden shadow-sm">
        <div
          onClick={() => setIsMediaManagerExpanded(!isMediaManagerExpanded)}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-eminence-gold/10 flex items-center justify-center text-eminence-gold">
              <ShoppingBag size={18} />
            </div>
            <div>
              <h3 className="font-serif text-lg text-gray-800">Consultation Form Gallery Media</h3>
              <p className="text-xs text-eminence-muted">Manage the photos and videos shown in the client-facing consultation form.</p>
            </div>
          </div>
          <button className="text-xs uppercase tracking-widest text-eminence-gold font-bold flex items-center gap-1">
            {isMediaManagerExpanded ? "Collapse" : "Manage Media"}
            {isMediaManagerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {isMediaManagerExpanded && (
          <div className="border-t border-eminence-border/50 bg-gray-50/30 p-6 space-y-6 animate-in slide-in-from-top-2">
            {/* Photos */}
            <div>
              <p className="text-xs uppercase tracking-widest text-eminence-muted mb-3 font-bold">Photos ({images.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 mb-4">
                {images.map((src, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-eminence-border/40 bg-white">
                    <img src={src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:") ? src : `${api.defaults.baseURL?.replace(/\/api$/, "") || ""}${src.startsWith("/") ? "" : "/"}${src}`} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages(images.filter((_, i) => i !== idx))}
                      className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-md transition-transform hover:scale-110"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-white p-4 border border-dashed border-eminence-border/60 rounded-xl">
                <p className="text-[10px] font-bold text-eminence-muted uppercase mb-1.5">Add Photo Link / File</p>
                <ImageUpload
                  value=""
                  onChange={(url) => {
                    if (url) {
                      const relativeUrl = url.replace(/http:\/\/localhost:\d+/i, "").replace(/https?:\/\/[^\/]+/i, "");
                      setImages([...images, relativeUrl]);
                    }
                  }}
                />
              </div>
            </div>

            {/* Videos */}
            <div>
              <p className="text-xs uppercase tracking-widest text-eminence-muted mb-3 font-bold">Videos ({videos.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
                {videos.map((src, idx) => (
                  <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-eminence-border/40 bg-black">
                    <video src={src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:") ? src : `${api.defaults.baseURL?.replace(/\/api$/, "") || ""}${src.startsWith("/") ? "" : "/"}${src}`} className="w-full h-full object-cover" muted />
                    <button
                      type="button"
                      onClick={() => setVideos(videos.filter((_, i) => i !== idx))}
                      className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-md transition-transform hover:scale-110"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-white p-4 border border-dashed border-eminence-border/60 rounded-xl">
                <p className="text-[10px] font-bold text-eminence-muted uppercase mb-1.5">Add Video Link / File</p>
                <ImageUpload
                  value=""
                  onChange={(url) => {
                    if (url) {
                      const relativeUrl = url.replace(/http:\/\/localhost:\d+/i, "").replace(/https?:\/\/[^\/]+/i, "");
                      setVideos([...videos, relativeUrl]);
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-eminence-border/40">
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="px-6 py-3 bg-eminence-gold hover:bg-eminence-gold/90 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-md transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Gallery Changes"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Consultancy Records Filter Section */}
      <div className="eminence-card bg-white p-5 border border-eminence-border rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg text-gray-800">Consultation Records</h3>
          <p className="text-xs text-eminence-muted">List of styling and diagnostic consult forms filled by users.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Filter by Consulted By:</span>
          <select
            value={selectedSalesPerson}
            onChange={e => setSelectedSalesPerson(e.target.value)}
            className="bg-eminence-surface border border-eminence-border rounded px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-eminence-gold"
          >
            <option value="">All Salespersons</option>
            {salesPersons.map(sp => (
              <option key={sp} value={sp}>{sp}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredConsultations.map((c) => (
          <div key={c.id} className="eminence-card bg-white border border-eminence-border rounded-lg overflow-hidden transition-all duration-300">
            <div className="p-5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">

              <div className="flex items-center gap-4 min-w-[250px]">
                <div className="w-10 h-10 rounded-full bg-eminence-gold/10 flex items-center justify-center text-eminence-gold">
                  <User size={18} />
                </div>
                <div>
                  <p className="font-serif text-lg leading-tight text-gray-800">{c.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone size={12} className="text-eminence-muted" />
                    <span className="text-xs text-eminence-muted">{c.phone}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 flex-1">
                <div className="min-w-[100px]">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-eminence-muted mb-1">Date</p>
                  <p className="text-sm font-medium text-gray-800">{c.date || "N/A"}</p>
                </div>

                <div className="min-w-[90px]">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-eminence-muted mb-1">Location</p>
                  <p className="text-sm font-medium flex items-center gap-1 text-gray-800">
                    <MapPin size={12} className="text-eminence-gold shrink-0" />
                    {c.location || "N/A"}
                  </p>
                </div>

                <div className="min-w-[130px]">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-eminence-muted mb-1">Consulted By</p>
                  <p className="text-sm font-medium text-gray-800">{c.consulted_by || "Unknown"}</p>
                </div>

                <div className="min-w-[90px]">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-eminence-muted mb-1">Status</p>
                  <span className={`text-xs uppercase tracking-wider font-bold px-2.5 py-1 rounded-full border ${c.status === "Closed"
                    ? "text-red-600 bg-red-50 border-red-100"
                    : c.status === "HOT" || c.status === "hot"
                      ? "text-orange-600 bg-orange-50 border-orange-100"
                      : c.status === "TOKEN" || c.status === "token"
                        ? "text-violet-600 bg-violet-50 border-violet-100"
                        : c.status === "WARM" || c.status === "warm"
                          ? "text-yellow-600 bg-yellow-50 border-yellow-100"
                          : "text-emerald-600 bg-emerald-50 border-emerald-100"
                    }`}>
                    {c.status || "New"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingConsultation(c);
                    setEditForm({ ...c });
                  }}
                  className="text-xs uppercase tracking-widest text-eminence-gold hover:text-black transition-colors flex items-center gap-1 px-4 py-2 border border-eminence-border rounded-full hover:bg-gray-50"
                >
                  <Edit size={12} />
                  Edit
                </button>

                {c.status === "Closed" && (() => {
                  const matchingOrder = getInvoiceForConsultation(c);
                  if (matchingOrder) {
                    return (
                      <button
                        onClick={async () => {
                          try {
                            await downloadOrderInvoice(api, matchingOrder.id);
                            toast.success("Invoice downloaded successfully!");
                          } catch (err) {
                            toast.error("Failed to download invoice: " + err.message);
                          }
                        }}
                        className="text-xs uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1 px-4 py-2 border border-emerald-200 rounded-full bg-emerald-50 hover:bg-emerald-100/50"
                      >
                        <Download size={12} />
                        Invoice
                      </button>
                    );
                  } else {
                    return (
                      <button
                        disabled
                        title="No matching billing record found for this client"
                        className="text-xs uppercase tracking-widest text-gray-400 flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-full bg-gray-50 cursor-not-allowed"
                      >
                        <Download size={12} />
                        Invoice Pending
                      </button>
                    );
                  }
                })()}

                <button
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  className="text-xs uppercase tracking-widest text-eminence-gold hover:text-black transition-colors flex items-center gap-1 px-4 py-2 border border-eminence-border rounded-full hover:bg-gray-50"
                >
                  {expandedId === c.id ? "Hide Details" : "View Details"}
                  {expandedId === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {/* Expanded Details Section */}
            {expandedId === c.id && (
              <div className="border-t border-eminence-border/50 bg-gray-50/50 p-6 animate-in slide-in-from-top-2">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] uppercase font-bold tracking-widest text-eminence-gold mb-1">Expected Look</h4>
                      <p className="text-sm text-gray-700">{c.expected_look || "Not Specified"}</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase font-bold tracking-widest text-eminence-gold mb-1">Lifestyle</h4>
                      <p className="text-sm text-gray-700">{c.lifestyle || "Not Specified"}</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase font-bold tracking-widest text-eminence-gold mb-1">Reason for Visit</h4>
                      <p className="text-sm text-gray-700">{c.reason || "Not Specified"}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] uppercase font-bold tracking-widest text-eminence-gold mb-1">Past Treatments</h4>
                      {c.past_treatments && c.past_treatments.length > 0 ? (
                        <ul className="list-disc pl-4 text-sm text-gray-700">
                          {c.past_treatments.map((pt, i) => <li key={i}>{pt}</li>)}
                        </ul>
                      ) : <p className="text-sm text-gray-500 italic">None reported</p>}
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase font-bold tracking-widest text-eminence-gold mb-1">Additional Queries</h4>
                      {c.additional_questions && c.additional_questions.length > 0 ? (
                        <ul className="list-disc pl-4 text-sm text-gray-700">
                          {c.additional_questions.map((aq, i) => <li key={i}>{aq}</li>)}
                        </ul>
                      ) : <p className="text-sm text-gray-500 italic">None reported</p>}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white p-4 border border-eminence-border rounded shadow-sm">
                      <h4 className="text-[10px] uppercase font-bold tracking-widest text-eminence-muted mb-2 border-b border-eminence-border pb-1">Internal Details</h4>
                      <div className="space-y-2 mt-2">
                        <div className="flex justify-between">
                          <span className="text-xs text-eminence-muted">Budget Range:</span>
                          <span className="text-xs font-bold">{c.budget_range || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-eminence-muted">Expected Rev:</span>
                          <span className="text-xs font-bold text-emerald-600">₹{c.revenue || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-eminence-muted">Source:</span>
                          <span className="text-xs font-bold">{c.source || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-eminence-muted">Size / Color:</span>
                          <span className="text-xs font-bold">{c.size_color || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-eminence-muted">Follow Up:</span>
                          <span className="text-xs font-bold text-eminence-gold">{c.follow_up_date || "None"}</span>
                        </div>
                      </div>
                    </div>

                    {c.notes && (
                      <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                        <h4 className="text-[10px] uppercase font-bold tracking-widest text-yellow-800 mb-1 flex items-center gap-1">
                          <MessageSquare size={10} /> Notes
                        </h4>
                        <p className="text-xs text-yellow-900 leading-relaxed">{c.notes}</p>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {consultations.length === 0 && (
        <div className="py-20 text-center text-eminence-muted">
          <p className="italic">{t("noRecords") || "No consultancy records found."}</p>
        </div>
      )}

      {/* Consultation Edit Modal */}
      {editingConsultation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 bg-eminence-surface border-b border-gray-100 flex justify-between items-center shrink-0">
              <div>
                <h4 className="font-serif text-2xl text-gray-900">Edit Consultation Record</h4>
                <p className="text-xs text-eminence-muted">Updating record for {editingConsultation.name}</p>
              </div>
              <button onClick={() => setEditingConsultation(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={18} /></button>
            </div>

            <form onSubmit={handleUpdateConsultation} className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Client Name</label>
                  <input type="text" required value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">WhatsApp Number</label>
                  <input type="tel" required value={editForm.phone || ""} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Location</label>
                  <select value={editForm.location || "Baroda"} onChange={e => setEditForm({ ...editForm, location: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg">
                    {branches.map(b => {
                      const bName = typeof b === "string" ? b : (b?.name || "Unknown");
                      return <option key={bName} value={bName}>{bName}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Date</label>
                  <input type="date" value={editForm.date || ""} onChange={e => setEditForm({ ...editForm, date: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Expected Look</label>
                  <select value={editForm.expected_look || ""} onChange={e => setEditForm({ ...editForm, expected_look: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg">
                    <option value="">Select Look</option>
                    <option value="Natural (Daily Use)">Natural (Daily Use)</option>
                    <option value="Professional (Formal)">Professional (Formal)</option>
                    <option value="Stylish (Fashionable)">Stylish (Fashionable)</option>
                    <option value="Not Sure (Please Guide)">Not Sure (Please Guide)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Lifestyle</label>
                  <select value={editForm.lifestyle || ""} onChange={e => setEditForm({ ...editForm, lifestyle: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg">
                    <option value="">Select Lifestyle</option>
                    <option value="Office / Business">Office / Business</option>
                    <option value="Travelling / Outdoor">Travelling / Outdoor</option>
                    <option value="Fitness / Gym">Fitness / Gym</option>
                    <option value="Casual / Home Use">Casual / Home Use</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Reason for Visit</label>
                  <select value={editForm.reason || ""} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg">
                    <option value="">Select Reason</option>
                    <option value="Confidence Boost Karne Ke Liye">Confidence Boost</option>
                    <option value="Job / Business Growth Ke Liye">Job / Business Growth</option>
                    <option value="Special Event (Wedding, Party)">Special Event</option>
                    <option value="Medical Reason">Medical Reason</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Budget Range</label>
                  <select value={editForm.budget_range || ""} onChange={e => setEditForm({ ...editForm, budget_range: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg">
                    <option value="">Select Budget</option>
                    <option value="Basic">Basic (₹10,000 to ₹18,000)</option>
                    <option value="Recommended Standard">Standard (₹23,000 to ₹30,000)</option>
                    <option value="Premium">Premium (More Than ₹30,000)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Consulted By</label>
                  <input type="text" value={editForm.consulted_by || ""} onChange={e => setEditForm({ ...editForm, consulted_by: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Source</label>
                  <select value={editForm.source || "Direct"} onChange={e => setEditForm({ ...editForm, source: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg">
                    <option value="Direct">Direct</option>
                    <option value="DMT">DMT</option>
                    <option value="Repeat">Repeat</option>
                    <option value="Reference">Reference</option>
                    <option value="Facebook Ads">Facebook Ads</option>
                    <option value="WhatsApp Ads">WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Status</label>
                  <select value={editForm.status || "Warm"} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg">
                    <option value="Hot">Hot</option>
                    <option value="Warm">Warm</option>
                    <option value="Cold">Cold</option>
                    <option value="Token">Token</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Revenue / Expected Revenue (₹)</label>
                  <input type="number" value={editForm.revenue || ""} onChange={e => setEditForm({ ...editForm, revenue: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Follow-up Date</label>
                  <input type="date" value={editForm.follow_up_date || ""} onChange={e => setEditForm({ ...editForm, follow_up_date: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Size & Color</label>
                  <input type="text" value={editForm.size_color || ""} onChange={e => setEditForm({ ...editForm, size_color: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" placeholder="Size x Size | Color" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Token Amount (₹)</label>
                  <input type="number" value={editForm.token_amount || ""} onChange={e => setEditForm({ ...editForm, token_amount: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" placeholder="Enter token amount" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Comment for Token Received</label>
                  <input type="text" value={editForm.token_comment || ""} onChange={e => setEditForm({ ...editForm, token_comment: e.target.value })} className="w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold rounded-lg" placeholder="Token comments..." />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-1">Notes</label>
                <textarea value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows="3" className="w-full border border-eminence-border p-3 focus:outline-none focus:border-eminence-gold bg-transparent resize-none rounded-lg text-sm" placeholder="Notes..."></textarea>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setEditingConsultation(null)} className="px-5 py-2.5 border border-eminence-border text-eminence-muted hover:bg-gray-50 rounded-lg text-xs uppercase tracking-widest font-bold">Cancel</button>
                <button type="submit" disabled={updating} className="px-6 py-2.5 bg-eminence-gold hover:bg-eminence-gold/90 text-white rounded-lg text-xs uppercase tracking-widest font-bold disabled:opacity-50 flex items-center gap-2">
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductTransferPanel({ products, employees, onComplete, branches = [] }) {
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductDrop, setShowProductDrop] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [source, setSource] = useState("Main Warehouse");

  const branchList = branches.map(b => typeof b === "string" ? b : b.name);
  const [destination, setDestination] = useState(branchList[0] || "Surat");
  const [employeeId, setEmployeeId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branches && branches.length > 0) {
      const firstBranch = typeof branches[0] === "string" ? branches[0] : branches[0].name;
      setDestination(firstBranch);
    }
  }, [branches]);

  const filteredTransferProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleTransferProductSelect = (p) => {
    setProductId(p.id);
    setProductSearch(p.name);
    setShowProductDrop(false);
  };

  const selectedProduct = products.find(p => p.id === productId);
  const currentStock = selectedProduct ? (selectedProduct.stock || 0) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId) return toast.error("Please select a product");
    if (!quantity || Number(quantity) <= 0) return toast.error("Please enter a valid quantity");
    if (Number(quantity) > currentStock) return toast.error("Insufficient stock available");
    if (!employeeId) return toast.error("Please select an employee");
    if (source === destination) return toast.error("Source and destination must be different");

    setLoading(true);
    try {
      const emp = employees.find(e => e.id === employeeId);
      await api.post("/admin/products/transfer", {
        product_id: productId,
        quantity: Number(quantity),
        source,
        destination,
        employee_id: employeeId,
        employee_name: emp ? emp.name : "Unknown",
        remarks
      });
      toast.success("Product transferred successfully!");
      setProductId("");
      setQuantity("");
      setRemarks("");
      onComplete();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-8 space-y-6">
      <div>
        <h2 className="font-serif text-2xl text-gray-800">Transfer Products</h2>
        <p className="text-xs text-eminence-muted">Transfer inventory stock between branches or hand over products to staff.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Select Product</label>
          <input
            type="text"
            placeholder="Search product by name..."
            value={productSearch}
            onChange={e => { setProductSearch(e.target.value); setProductId(""); setShowProductDrop(true); }}
            onFocus={() => setShowProductDrop(true)}
            onBlur={() => setTimeout(() => setShowProductDrop(false), 200)}
            className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
            autoComplete="off"
          />
          {showProductDrop && filteredTransferProducts.length > 0 && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
              {filteredTransferProducts.map(p => (
                <div
                  key={p.id}
                  onMouseDown={() => handleTransferProductSelect(p)}
                  className="px-4 py-2.5 hover:bg-eminence-gold/10 cursor-pointer text-sm flex justify-between items-center"
                >
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <span className="text-xs text-gray-400 ml-2">Stock: {p.stock || 0}</span>
                </div>
              ))}
            </div>
          )}
          {showProductDrop && productSearch && filteredTransferProducts.length === 0 && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-3 text-xs text-gray-400 italic">
              No products match "{productSearch}"
            </div>
          )}
        </div>

        {productId && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800">
            Current Stock: <strong>{currentStock}</strong> items available in Main stock.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Quantity to Transfer</label>
            <input
              type="number"
              min="1"
              max={currentStock}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Handed Over To (Staff)</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
            >
              <option value="">-- Choose Staff --</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">From Location</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
            >
              <option value="Main Warehouse">Main Warehouse</option>
              {branches.map(b => {
                const name = typeof b === "string" ? b : b.name;
                return <option key={name} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">To Location</label>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
            >
              {branches.map(b => {
                const name = typeof b === "string" ? b : b.name;
                return <option key={name} value={name}>{name}</option>;
              })}
              <option value="Main Warehouse">Main Warehouse</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Remarks / Notes</label>
          <textarea
            rows="3"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
            placeholder="Reason for transfer..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-gray-900 hover:bg-black text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
        >
          {loading ? "Processing..." : "Execute Stock Transfer"}
        </button>
      </form>
    </div>
  );
}

function ProductTransferredLogPanel({ transfers, refreshData }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="font-serif text-2xl text-gray-800">Transferred Products History</h2>
          <p className="text-xs text-eminence-muted">Log of all branch-to-branch or staff inventory stock transfers.</p>
        </div>
        <button onClick={refreshData} className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase rounded-lg">
          Refresh Logs
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
        {transfers.length === 0 ? (
          <div className="p-20 text-center text-eminence-muted italic">
            No transfer records found.
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase bg-gray-50/80 border-b border-gray-100 font-bold tracking-widest">
                <th className="px-6 py-4">Date/Time</th>
                <th className="px-6 py-4">Product Name</th>
                <th className="px-6 py-4">Quantity</th>
                <th className="px-6 py-4">From</th>
                <th className="px-6 py-4">To</th>
                <th className="px-6 py-4">Handed Over To</th>
                <th className="px-6 py-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {t.created_at ? new Date(t.created_at).toLocaleString() : "N/A"}
                  </td>
                  <td className="px-6 py-4 font-bold text-gray-900">{t.product_name}</td>
                  <td className="px-6 py-4 text-gray-700 font-semibold">{t.quantity}</td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-medium">{t.source}</span></td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100 font-medium">{t.destination}</span></td>
                  <td className="px-6 py-4 text-gray-600">{t.employee_name}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">{t.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ProductAddStockPanel({ products, vendors, onComplete }) {
  const { t } = useLang();
  const { user } = useAuth();
  const isSuperAdmin = user?.email === "superadmin@eminence.com" || user?.role === "super_admin" || user?.is_super_admin === true;

  const makeEmptyRow = () => ({
    id: Date.now() + Math.random(),
    productId: "",
    productSearch: "",
    showDrop: false,
    quantity: "",
    costPrice: "",
    sellingPrice: "",
    expiryDate: ""
  });

  const [rows, setRows] = useState([makeEmptyRow()]);
  const [vendorId, setVendorId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [branch, setBranch] = useState(isSuperAdmin ? "Baroda" : (user?.branch || "Baroda"));
  const [amountPaid, setAmountPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paymentStatus, setPaymentStatus] = useState("Pending");
  const [loading, setLoading] = useState(false);

  const updateRow = (idx, patch) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const addRow = () => setRows(prev => [...prev, makeEmptyRow()]);

  const removeRow = (idx) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleProductSelect = (idx, p) => {
    updateRow(idx, {
      productId: p.id,
      productSearch: p.name,
      showDrop: false,
      sellingPrice: p.price !== undefined ? p.price.toString() : ""
    });
  };

  const overallTotal = rows.reduce((sum, r) => sum + ((Number(r.quantity) || 0) * (Number(r.costPrice) || 0)), 0);
  const grandTotal = Math.max(0, overallTotal - (Number(discount) || 0));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) return toast.error("Please select a vendor");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.productId) return toast.error(`Row ${i + 1}: Please select a product`);
      if (!r.quantity || Number(r.quantity) <= 0) return toast.error(`Row ${i + 1}: Enter a valid quantity`);
      if (!r.costPrice || Number(r.costPrice) <= 0) return toast.error(`Row ${i + 1}: Enter a valid cost price`);
      if (!r.sellingPrice || Number(r.sellingPrice) <= 0) return toast.error(`Row ${i + 1}: Enter a valid selling price`);
    }

    setLoading(true);
    try {
      const v = vendors.find(vend => vend.id === vendorId);
      const discountVal = Number(discount) || 0;
      const amountPaidVal = Number(amountPaid) || 0;

      await Promise.all(rows.map(r => {
        const rowCost = Number(r.costPrice || 0) * Number(r.quantity || 0);
        const ratio = overallTotal > 0 ? (rowCost / overallTotal) : (1 / rows.length);
        const rowDiscount = Number((discountVal * ratio).toFixed(2));
        const rowAmountPaid = Number((amountPaidVal * ratio).toFixed(2));

        return api.post("/admin/products/add-stock", {
          product_id: r.productId,
          quantity: Number(r.quantity),
          vendor_id: vendorId,
          vendor_name: v ? v.name : "Unknown",
          invoice_no: invoiceNo,
          cost_price: Number(r.costPrice),
          selling_price: Number(r.sellingPrice),
          expiry_date: r.expiryDate,
          remarks,
          discount: rowDiscount,
          amount_paid: rowAmountPaid,
          payment_mode: paymentMode,
          payment_status: paymentStatus,
          branch: branch
        });
      }));

      toast.success(`${rows.length} stock entr${rows.length > 1 ? "ies" : "y"} added successfully!`);
      setRows([makeEmptyRow()]);
      setVendorId("");
      setInvoiceNo("");
      setRemarks("");
      setAmountPaid("");
      setDiscount("");
      setPaymentMode("Cash");
      setPaymentStatus("Pending");
      onComplete();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add stock");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-8 space-y-6">
      <div className="flex justify-between items-center border-b pb-4 border-gray-100">
        <div>
          <h2 className="font-serif text-2xl text-gray-800">Add Product Stock</h2>
          <p className="text-xs text-eminence-muted">Log new physical product inventory incoming from external vendors.</p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 bg-eminence-gold text-white text-xs font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl hover:bg-yellow-600 transition-colors whitespace-nowrap shadow-sm"
        >
          <Plus size={14} /> Add Row
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Shared Invoice/Vendor Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Select Vendor *</label>
            <select
              value={vendorId}
              onChange={e => setVendorId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-white"
            >
              <option value="">- Choose Vendor -</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Invoice / Bill Number</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-white"
              placeholder="e.g. INV-1002"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Remarks / Notes</label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-white"
              placeholder="e.g. regular stock replenishment"
            />
          </div>
        </div>

        {/* Payment Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50/60 rounded-2xl p-4 border border-amber-100">
          <div>
            <label className="block text-xs font-bold text-amber-600 uppercase mb-2">Amount Paid (₹)</label>
            <input
              type="number"
              min="0"
              value={amountPaid}
              onChange={e => {
                setAmountPaid(e.target.value);
                const paid = Number(e.target.value);
                if (paid <= 0) setPaymentStatus("Pending");
                else if (paid >= grandTotal) setPaymentStatus("Paid");
                else setPaymentStatus("Partial");
              }}
              className="w-full border border-amber-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-amber-600 uppercase mb-2">Payment Mode</label>
            <select
              value={paymentMode}
              onChange={e => setPaymentMode(e.target.value)}
              className="w-full border border-amber-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
            >
              <option>Cash</option>
              <option>UPI</option>
              <option>Card</option>
              <option>Bank Transfer</option>
              <option>Cheque</option>
              <option>Credit</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-amber-600 uppercase mb-2">Payment Status</label>
            <select
              value={paymentStatus}
              onChange={e => setPaymentStatus(e.target.value)}
              className="w-full border border-amber-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
            >
              <option>Pending</option>
              <option>Partial</option>
              <option>Paid</option>
            </select>
          </div>
        </div>

        {/* Product Rows Table Headers */}
        <div className="space-y-3">
          <div className="hidden md:grid md:grid-cols-12 gap-3 px-4 py-2 bg-eminence-surface border border-eminence-border/10 rounded-lg text-left text-eminence-muted uppercase font-bold text-[9px] tracking-wider font-sans">
            <div className="col-span-3">Select Product *</div>
            <div className="col-span-2">Expiry Date</div>
            <div className="col-span-1 text-right">Qty *</div>
            <div className="col-span-2 text-right">Cost (₹) *</div>
            <div className="col-span-2 text-right">Selling (₹) *</div>
            <div className="col-span-1 text-right font-mono">Total (₹)</div>
            <div className="col-span-1 text-center">Action</div>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const filtered = products.filter(p =>
                p.name.toLowerCase().includes(row.productSearch.toLowerCase())
              );
              return (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border border-gray-200 md:border-transparent rounded-2xl md:rounded-none p-4 md:p-0 bg-white md:bg-transparent shadow-sm md:shadow-none relative">
                  {/* Select Product */}
                  <div className="relative col-span-1 md:col-span-3 text-left">
                    <label className="block md:hidden text-xs font-bold text-gray-400 uppercase mb-1">Select Product *</label>
                    <input
                      type="text"
                      placeholder="Search product..."
                      value={row.productSearch}
                      onChange={e => updateRow(idx, { productSearch: e.target.value, productId: "", showDrop: true })}
                      onFocus={() => updateRow(idx, { showDrop: true })}
                      onBlur={() => updateRow(idx, { showDrop: false })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                      autoComplete="off"
                    />
                    {row.productId && (() => {
                      const selectedP = products.find(p => p.id === row.productId);
                      if (selectedP && (selectedP.volume || selectedP.measurement_unit)) {
                        return (
                          <div className="text-[10px] text-eminence-gold font-bold uppercase tracking-wider mt-1 px-1">
                            {selectedP.volume ? `${selectedP.volume} ` : ""}{selectedP.measurement_unit || ""}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {row.showDrop && filtered.length > 0 && (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {filtered.map(p => (
                          <div
                            key={p.id}
                            onMouseDown={() => handleProductSelect(idx, p)}
                            className="px-4 py-2 hover:bg-eminence-gold/10 cursor-pointer text-xs flex flex-col text-left"
                          >
                            <div className="flex justify-between items-center w-full">
                              <span className="font-medium text-gray-900">{p.name}</span>
                              <span className="text-[10px] text-gray-400 ml-2">Stock: {p.stock || 0}</span>
                            </div>
                            {(p.volume || p.measurement_unit) && (
                              <span className="text-[9px] text-eminence-gold uppercase tracking-wider font-semibold mt-0.5">
                                {p.volume ? `${p.volume} ` : ""}{p.measurement_unit || ""}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {row.showDrop && row.productSearch && filtered.length === 0 && (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-2.5 text-xs text-gray-400 italic">
                        No products match "{row.productSearch}"
                      </div>
                    )}
                  </div>

                  {/* Expiry Date */}
                  <div className="col-span-1 md:col-span-2 text-left">
                    <label className="block md:hidden text-xs font-bold text-gray-400 uppercase mb-1">Expiry Date</label>
                    <input type="date" value={row.expiryDate}
                      onChange={e => updateRow(idx, { expiryDate: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50 font-mono" />
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1 md:col-span-1 text-left">
                    <label className="block md:hidden text-xs font-bold text-gray-400 uppercase mb-1">Quantity *</label>
                    <input type="number" min="1" value={row.quantity}
                      onChange={e => updateRow(idx, { quantity: e.target.value })}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50 font-mono" />
                  </div>

                  {/* Cost Price */}
                  <div className="col-span-1 md:col-span-2 text-left">
                    <label className="block md:hidden text-xs font-bold text-gray-400 uppercase mb-1">Cost Price *</label>
                    <input type="number" min="0" step="0.01" value={row.costPrice}
                      onChange={e => updateRow(idx, { costPrice: e.target.value })}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50 font-mono" />
                  </div>

                  {/* Selling Price */}
                  <div className="col-span-1 md:col-span-2 text-left">
                    <label className="block md:hidden text-xs font-bold text-gray-400 uppercase mb-1">Selling Price *</label>
                    <input type="number" min="0" step="0.01" value={row.sellingPrice}
                      onChange={e => updateRow(idx, { sellingPrice: e.target.value })}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50 font-mono" />
                  </div>

                  {/* Row Total */}
                  <div className="col-span-1 md:col-span-1 text-left md:text-right font-mono text-xs font-bold text-gray-700 bg-gray-50 md:bg-transparent px-3 py-2 md:p-0 rounded-lg md:rounded-none">
                    <label className="block md:hidden text-xs font-bold text-gray-400 uppercase mb-1">Total</label>
                    ₹{((Number(row.quantity) || 0) * (Number(row.costPrice) || 0)).toLocaleString("en-IN")}
                  </div>

                  {/* Delete Button */}
                  <div className="col-span-1 md:col-span-1 text-center mt-2 md:mt-0">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-red-400 hover:text-red-600 transition-colors p-2 md:p-1 hover:bg-red-50 rounded"
                        title="Remove row"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Overall Summary at the Bottom */}
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm mt-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <span className="text-[10px] text-eminence-muted block font-bold uppercase tracking-wider mb-1">Items Total</span>
              <span className="font-serif font-bold text-gray-900 text-lg">₹{overallTotal.toLocaleString("en-IN")}</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Overall Discount (₹)</label>
              <input
                type="number"
                min="0"
                max={overallTotal}
                value={discount}
                onChange={e => {
                  setDiscount(e.target.value);
                  const disc = Number(e.target.value) || 0;
                  const finalTotal = Math.max(0, overallTotal - disc);
                  const paid = Number(amountPaid) || 0;
                  if (paid <= 0) setPaymentStatus("Pending");
                  else if (paid >= finalTotal) setPaymentStatus("Paid");
                  else setPaymentStatus("Partial");
                }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-32 focus:ring-1 focus:ring-eminence-gold focus:outline-none bg-white font-mono text-right"
                placeholder="0"
              />
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-eminence-muted block font-bold uppercase tracking-wider mb-1">Grand Total</span>
            <span className="font-serif font-bold text-eminence-gold text-2xl">₹{grandTotal.toLocaleString("en-IN")}</span>
          </div>
        </div>

        {/* Add Row Button (bottom) */}
        <button
          type="button"
          onClick={addRow}
          className="w-full py-3 border-2 border-dashed border-eminence-gold/40 text-eminence-gold hover:border-eminence-gold hover:bg-eminence-gold/5 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
        >
          <Plus size={14} /> Add Another Product Row
        </button>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-gray-900 hover:bg-black text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Adding stock...</>
          ) : (
            <><Package size={14} /> Add {rows.length > 1 ? `${rows.length} Products` : "Stock"} to Inventory</>
          )}
        </button>
      </form>
    </div>
  );
}

function ProductUsePanel({ products = [], employees = [], usages = [], onComplete }) {
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductDrop, setShowProductDrop] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [employeeId, setEmployeeId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);

  const [providerFilter, setProviderFilter] = useState("");
  const [usageSearchQuery, setUsageSearchQuery] = useState("");
  const [editingUsage, setEditingUsage] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [updating, setUpdating] = useState(false);

  const [selectedHistoryProduct, setSelectedHistoryProduct] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const handleViewProductHistory = async (product) => {
    setSelectedHistoryProduct(product);
    setProductHistory([]);
    setIsLoadingHistory(true);
    try {
      const res = await api.get(`/admin/products/${product.id}/history`);
      setProductHistory(res.data.history || []);
    } catch (err) {
      toast.error("Failed to load product history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeUsages = Array.isArray(usages) ? usages : [];

  const selectedProduct = safeProducts.find(p => p.id === productId);
  const currentStock = selectedProduct ? (selectedProduct.stock || 0) : 0;

  const filteredUseProducts = safeProducts.filter(p =>
    (p.name || "").toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleUseProductSelect = (p) => {
    setProductId(p.id);
    setProductSearch(p.name);
    setShowProductDrop(false);
  };

  const handleUpdateUsage = async (e) => {
    e.preventDefault();
    if (!editForm.employee_id) return toast.error("Please select a service provider");
    if (!editForm.quantity || Number(editForm.quantity) <= 0) return toast.error("Please enter a valid quantity");

    setUpdating(true);
    try {
      const payload = {
        employee_id: editForm.employee_id,
        employee_name: editForm.employee_name,
        quantity: Number(editForm.quantity),
        remarks: editForm.remarks
      };
      await api.patch(`/admin/products/use/${editingUsage.id}`, payload);
      toast.success("Usage log updated successfully!");
      setEditingUsage(null);
      onComplete();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update usage record");
    } finally {
      setUpdating(false);
    }
  };

  const serviceProviders = Array.from(new Set(safeUsages.map(u => u.employee_name).filter(Boolean))).sort();

  const filteredUsages = safeUsages.filter(u => {
    const matchesProvider = !providerFilter || u.employee_name === providerFilter;
    const matchesSearch = !usageSearchQuery || (u.product_name || "").toLowerCase().includes(usageSearchQuery.toLowerCase());
    return matchesProvider && matchesSearch;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId) return toast.error("Please select a product");
    if (!quantity || Number(quantity) <= 0) return toast.error("Please enter a valid quantity");
    if (Number(quantity) > currentStock) return toast.error("Insufficient stock available in salon");
    if (!employeeId) return toast.error("Please select a service provider");

    setLoading(true);
    try {
      const emp = safeEmployees.find(e => e.id === employeeId);
      await api.post("/admin/products/use", {
        product_id: productId,
        quantity: Number(quantity),
        employee_id: employeeId,
        employee_name: emp ? emp.name : "Unknown",
        remarks
      });
      toast.success("Product usage recorded successfully!");
      setProductId("");
      setQuantity("1");
      setRemarks("");
      onComplete();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to record product usage");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-8 space-y-6">
        <div>
          <h2 className="font-serif text-2xl text-gray-800">Use Product in Salon</h2>
          <p className="text-xs text-eminence-muted">Record in-house consumption of products (shampoo, styling gel, treatment dyes) during client services.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Select Product</label>
              <input
                type="text"
                placeholder="Search product by name..."
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setProductId(""); setShowProductDrop(true); }}
                onFocus={() => setShowProductDrop(true)}
                onBlur={() => setTimeout(() => setShowProductDrop(false), 200)}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                autoComplete="off"
              />
              {productId && (() => {
                const selectedP = safeProducts.find(p => p.id === productId);
                if (selectedP && (selectedP.volume || selectedP.measurement_unit)) {
                  return (
                    <div className="text-[10px] text-eminence-gold font-bold uppercase tracking-wider mt-1 px-1">
                      {selectedP.volume ? `${selectedP.volume} ` : ""}{selectedP.measurement_unit || ""}
                    </div>
                  );
                }
                return null;
              })()}
              {showProductDrop && filteredUseProducts.length > 0 && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                  {filteredUseProducts.map(p => (
                    <div
                      key={p.id}
                      onMouseDown={() => handleUseProductSelect(p)}
                      className="px-4 py-2.5 hover:bg-eminence-gold/10 cursor-pointer text-sm flex flex-col text-left"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-400 ml-2">Stock: {p.stock || 0}</span>
                      </div>
                      {(p.volume || p.measurement_unit) && (
                        <span className="text-[10px] text-eminence-gold uppercase tracking-wider font-semibold mt-0.5">
                          {p.volume ? `${p.volume} ` : ""}{p.measurement_unit || ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {showProductDrop && productSearch && filteredUseProducts.length === 0 && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-3 text-xs text-gray-400 italic">
                  No products match "{productSearch}"
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Service Provider (Staff)</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
              >
                <option value="">-- Choose Staff --</option>
                {safeEmployees.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Quantity Used</label>
              <input
                type="number"
                min="1"
                max={currentStock}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Remarks / Notes</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                placeholder="e.g. used for hair wash treatment"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gray-900 hover:bg-black text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? "Recording usage..." : "Record Product Consumption"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
          <h3 className="font-bold text-gray-800 text-xs uppercase tracking-widest">Salon Consumption Logs</h3>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Search Product:</span>
              <input
                type="text"
                placeholder="Search..."
                value={usageSearchQuery}
                onChange={e => setUsageSearchQuery(e.target.value)}
                className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-eminence-gold w-48"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Filter by Staff:</span>
              <select
                value={providerFilter}
                onChange={e => setProviderFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-eminence-gold"
              >
                <option value="">All Staff</option>
                {serviceProviders.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {filteredUsages.length === 0 ? (
          <div className="p-12 text-center text-eminence-muted italic">
            No consumption records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase bg-gray-50/80 border-b border-gray-100 font-bold tracking-widest">
                  <th className="px-6 py-4">Date/Time</th>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4">Quantity Used</th>
                  <th className="px-6 py-4">Service Provider</th>
                  <th className="px-6 py-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsages.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {u.created_at ? new Date(u.created_at).toLocaleString() : "N/A"}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">{u.product_name}</td>
                    <td className="px-6 py-4 text-gray-700 font-semibold">{u.quantity}</td>
                    <td className="px-6 py-4 text-gray-600">{u.employee_name}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      <div className="flex items-center justify-between gap-4">
                        <span>{u.remarks || "—"}</span>
                        <button
                          onClick={() => {
                            setEditingUsage(u);
                            setEditForm({ ...u });
                          }}
                          className="p-1 hover:bg-gray-100 rounded text-eminence-gold hover:text-black transition-colors"
                          title="Edit Usage Log"
                        >
                          <Edit size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Usage Edit Modal */}
      {editingUsage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-fade-in">
            <div className="p-6 bg-eminence-surface border-b border-gray-100 flex justify-between items-center">
              <div>
                <h4 className="font-serif text-xl text-gray-900">Edit Product Consumption Log</h4>
                <p className="text-xs text-eminence-muted">Updating log for {editingUsage.product_name}</p>
              </div>
              <button onClick={() => setEditingUsage(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={18} /></button>
            </div>

            <form onSubmit={handleUpdateUsage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Service Provider (Staff)</label>
                <select
                  value={editForm.employee_id || ""}
                  onChange={(e) => {
                    const emp = safeEmployees.find(emp => emp.id === e.target.value);
                    setEditForm({
                      ...editForm,
                      employee_id: e.target.value,
                      employee_name: emp ? emp.name : "Unknown"
                    });
                  }}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                >
                  <option value="">-- Choose Staff --</option>
                  {safeEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Quantity Used</label>
                <input
                  type="number"
                  min="1"
                  value={editForm.quantity || ""}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Remarks / Notes</label>
                <input
                  type="text"
                  value={editForm.remarks || ""}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:outline-none bg-gray-50"
                  placeholder="e.g. used for hair wash treatment"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingUsage(null)} className="px-5 py-2.5 border border-eminence-border text-eminence-muted hover:bg-gray-50 rounded-lg text-xs uppercase tracking-widest font-bold">Cancel</button>
                <button type="submit" disabled={updating} className="px-6 py-2.5 bg-eminence-gold hover:bg-eminence-gold/90 text-white rounded-lg text-xs uppercase tracking-widest font-bold disabled:opacity-50 flex items-center gap-2">
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product History Modal */}
      {selectedHistoryProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col animate-fade-in">
            <div className="p-6 bg-eminence-surface border-b border-gray-100 flex justify-between items-center">
              <div>
                <h4 className="font-serif text-xl text-gray-900 flex items-center gap-2">
                  <Clock className="text-eminence-gold" size={20} /> Product History Log
                </h4>
                <p className="text-xs text-eminence-muted">
                  Detailed sale, salon usage, and stock log for <strong className="text-gray-900">{selectedHistoryProduct.name}</strong>
                </p>
              </div>
              <button onClick={() => setSelectedHistoryProduct(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={18} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Product Stats Quick Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-eminence-surface/40 p-4 rounded-xl border border-eminence-border/10 text-xs">
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Product ID</span>
                  <span className="font-mono font-bold text-gray-900">{selectedHistoryProduct.id}</span>
                </div>
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Category</span>
                  <span className="font-bold text-gray-900">{selectedHistoryProduct.category || "—"}</span>
                </div>
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Selling Price</span>
                  <span className="font-serif font-bold text-eminence-gold text-sm">₹{Number(selectedHistoryProduct.price || 0).toLocaleString("en-IN")}</span>
                </div>
                <div>
                  <span className="text-eminence-muted block font-medium uppercase tracking-wider text-[9px] mb-1">Current Stock</span>
                  <span className={`font-bold text-sm ${selectedHistoryProduct.stock <= 5 ? "text-red-500" : "text-emerald-600"}`}>
                    {selectedHistoryProduct.stock} units
                  </span>
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-eminence-gold" />
                  <p className="text-xs text-eminence-muted">Fetching usage and sale logs...</p>
                </div>
              ) : productHistory.length === 0 ? (
                <div className="text-center py-16 bg-eminence-surface/20 border border-dashed border-eminence-border rounded-xl">
                  <Clock className="mx-auto text-gray-300 mb-2" size={32} />
                  <p className="text-sm font-semibold text-gray-700">No History Logs Found</p>
                  <p className="text-xs text-eminence-muted mt-1">This product has no recorded stock logs, salon usages, or sales.</p>
                </div>
              ) : (
                <div className="border border-eminence-border/10 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-eminence-surface border-b border-eminence-border/20 text-eminence-muted uppercase font-bold text-[9px] tracking-wider">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Activity</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3">Transaction Details</th>
                        <th className="px-4 py-3">Handled By / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {productHistory.map((item, idx) => {
                        let badgeClass = "";
                        let label = "";
                        let qtySign = "";

                        if (item.event_type === "sale") {
                          badgeClass = "text-emerald-700 bg-emerald-50 border-emerald-200";
                          label = "Sold";
                          qtySign = "-";
                        } else if (item.event_type === "usage") {
                          badgeClass = "text-amber-700 bg-amber-50 border-amber-200";
                          label = "Used in Salon";
                          qtySign = "-";
                        } else if (item.event_type === "transfer") {
                          badgeClass = "text-blue-700 bg-blue-50 border-blue-200";
                          label = "Transferred";
                          qtySign = "";
                        } else if (item.event_type === "stock_addition") {
                          badgeClass = "text-purple-700 bg-purple-50 border-purple-200";
                          label = "Stock Added";
                          qtySign = "+";
                        }

                        return (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                              {item.created_at ? new Date(item.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${badgeClass}`}>
                                {label}
                              </span>
                            </td>
                            <td className={`px-4 py-3.5 text-right font-bold font-mono whitespace-nowrap ${qtySign === "+" ? "text-emerald-600" : qtySign === "-" ? "text-rose-500" : "text-gray-700"}`}>
                              {qtySign}{item.quantity} units
                            </td>
                            <td className="px-4 py-3.5 text-gray-700 max-w-[250px] truncate" title={item.details}>
                              {item.details}
                            </td>
                            <td className="px-4 py-3.5 text-gray-500">
                              <div className="font-semibold text-gray-700">{item.employee_name}</div>
                              {item.remarks && <div className="text-[10px] text-eminence-muted mt-0.5 italic">"{item.remarks}"</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-6 bg-eminence-surface border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedHistoryProduct(null)}
                className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-xs uppercase tracking-widest font-bold rounded-lg transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// LEAVE REQUEST NOTIFICATION BANNER
// ==========================================

const LeaveRequestNotificationBanner = ({ leaveRequests, isSuperAdmin, onGoToLeaves }) => {
  const [dismissed, setDismissed] = useState(false);

  // Super Admin sees "pending" requests needing their first-pass approval
  // Branch Admin sees "super_approved" requests needing their final approval
  const actionable = Array.isArray(leaveRequests)
    ? leaveRequests.filter(r =>
      isSuperAdmin ? r.status === "pending" : r.status === "super_approved"
    )
    : [];

  // Stable key from sorted IDs — used to detect new requests after dismiss
  const actionableKey = actionable.map(r => r.id).sort().join(",");
  const storageKey = `leave_notif_dismissed_${isSuperAdmin ? "super" : "branch"}`;

  useEffect(() => {
    const savedKey = localStorage.getItem(storageKey);
    if (actionableKey && savedKey !== actionableKey) {
      setDismissed(false);
    }
    if (!actionableKey) {
      setDismissed(false);
    }
  }, [actionableKey, storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, actionableKey);
    setDismissed(true);
  };

  if (dismissed || actionable.length === 0) return null;

  const label = isSuperAdmin ? "Super Admin Approval" : "Branch Approval";

  // Use hardcoded class sets per role so Tailwind JIT detects them correctly
  const styles = isSuperAdmin
    ? {
      border: "border-amber-400",
      stripe: "from-amber-400 to-amber-500",
      iconBg: "bg-amber-50 border-amber-200",
      title: "text-amber-600",
      chip: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
      btn: "bg-amber-500 hover:bg-amber-600",
    }
    : {
      border: "border-orange-400",
      stripe: "from-orange-400 to-orange-500",
      iconBg: "bg-orange-50 border-orange-200",
      title: "text-orange-600",
      chip: "bg-orange-50 text-orange-700 border-orange-200",
      dot: "bg-orange-500",
      btn: "bg-orange-500 hover:bg-orange-600",
    };

  return (
    <div
      className="fixed bottom-6 right-6 z-[200] max-w-sm w-full animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="alert"
    >
      <div className={`bg-white border-2 ${styles.border} rounded-2xl shadow-2xl overflow-hidden`}>
        {/* Top accent stripe */}
        <div className={`h-1.5 bg-gradient-to-r ${styles.stripe}`} />

        <div className="p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${styles.iconBg} border flex items-center justify-center flex-shrink-0`}>
                <span className="text-xl">🕐</span>
              </div>
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest ${styles.title}`}>
                  Leave Request{actionable.length > 1 ? "s" : ""} Pending
                </p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">
                  {actionable.length} request{actionable.length > 1 ? "s" : ""} awaiting {label}
                </p>
              </div>
            </div>

            {/* Close / dismiss button */}
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Dismiss — will reappear if new requests arrive"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Employee chips — up to 3 shown */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {actionable.slice(0, 3).map(r => (
              <span
                key={r.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${styles.chip} border`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} animate-pulse`} />
                {r.user_name || "Employee"} · {r.date}
              </span>
            ))}
            {actionable.length > 3 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                +{actionable.length - 3} more
              </span>
            )}
          </div>

          {/* CTA button */}
          <button
            onClick={onGoToLeaves}
            className={`mt-4 w-full py-2.5 rounded-xl text-sm font-bold ${styles.btn} text-white transition-colors flex items-center justify-center gap-2`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Review Leave Requests
          </button>
        </div>
      </div>
    </div>
  );
};

const ApproveLeavesPanel = ({ leaveRequests, refresh, isSuperAdmin, employees }) => {
  const [actioning, setActioning] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLeaveEmp, setNewLeaveEmp] = useState("");
  const [newLeaveDate, setNewLeaveDate] = useState("");

  const handleAddRequest = async (e) => {
    e.preventDefault();
    if (!newLeaveEmp || !newLeaveDate) return toast.error("Please fill all fields");
    try {
      await api.post("/admin/leaves/request", {
        employee_id: newLeaveEmp,
        date: newLeaveDate
      });
      toast.success("Leave request created successfully");
      setShowAddModal(false);
      setNewLeaveEmp("");
      setNewLeaveDate("");
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create leave request");
    }
  };

  const handleApprove = async (rid) => {
    setActioning(rid);
    try {
      await api.post(`/admin/leaves/${rid}/approve`);
      toast.success("Leave request approved successfully");
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to approve leave request");
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (rid) => {
    setActioning(rid);
    try {
      await api.post(`/admin/leaves/${rid}/reject`);
      toast.success("Leave request rejected");
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to reject leave request");
    } finally {
      setActioning(null);
    }
  };

  // Stats computation
  const pendingBranchCount = leaveRequests.filter(r => r.status === "pending").length;
  const pendingSuperCount = leaveRequests.filter(r => r.status === "branch_approved").length;
  const approvedCount = leaveRequests.filter(r => r.status === "approved").length;
  const rejectedCount = leaveRequests.filter(r => r.status === "rejected").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-serif text-3xl text-gray-900">Leave Approvals</h2>
          <p className="text-sm text-eminence-muted">Manage and approve employee leave applications</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-eminence-gold text-white text-sm font-bold uppercase tracking-widest px-5 py-3 rounded-xl hover:bg-yellow-600 transition-colors shadow-sm"
        >
          <Plus size={16} /> Add Leave Request
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Pending Branch</p>
          <p className="text-2xl font-serif text-amber-500 font-bold mt-1">{pendingBranchCount}</p>
        </div>
        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Pending Super</p>
          <p className="text-2xl font-serif text-orange-500 font-bold mt-1">{pendingSuperCount}</p>
        </div>
        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Fully Approved</p>
          <p className="text-2xl font-serif text-emerald-600 font-bold mt-1">{approvedCount}</p>
        </div>
        <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Rejected</p>
          <p className="text-2xl font-serif text-rose-500 font-bold mt-1">{rejectedCount}</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold uppercase text-gray-500 tracking-wider">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4">Requested Date</th>
                <th className="px-6 py-4">Current Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leaveRequests.map((req) => {
                const isPending = req.status === "pending";
                const isBranchApproved = req.status === "branch_approved";
                const isApproved = req.status === "approved";
                const isRejected = req.status === "rejected";

                return (
                  <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-800">{req.user_name}</p>
                      <p className="text-xs text-gray-400">ID: {req.user_id}</p>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700 capitalize">{req.branch}</td>
                    <td className="px-6 py-4 font-mono font-bold text-gray-900">
                      {new Date(req.date).toLocaleDateString("en-IN", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Pending Branch
                        </span>
                      )}
                      {isBranchApproved && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          Pending Super
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Approved
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {isSuperAdmin ? (
                          <>
                            {isBranchApproved && (
                              <>
                                <button
                                  onClick={() => handleApprove(req.id)}
                                  disabled={actioning !== null}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                                >
                                  Super Approve
                                </button>
                                <button
                                  onClick={() => handleReject(req.id)}
                                  disabled={actioning !== null}
                                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {isPending && (
                              <span className="text-xs text-gray-400 font-medium">Awaiting Branch Admin approval</span>
                            )}
                            {isApproved && (
                              <span className="text-xs text-emerald-600 font-medium">Approved</span>
                            )}
                          </>
                        ) : (
                          <>
                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleApprove(req.id)}
                                  disabled={actioning !== null}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                                >
                                  Branch Approve
                                </button>
                                <button
                                  onClick={() => handleReject(req.id)}
                                  disabled={actioning !== null}
                                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {isBranchApproved && (
                              <span className="text-xs text-gray-400 font-medium">Awaiting Super Admin approval</span>
                            )}
                            {isApproved && (
                              <span className="text-xs text-emerald-600 font-medium">Approved</span>
                            )}
                            {isRejected && (
                              <span className="text-xs text-gray-400 font-medium">No actions</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {leaveRequests.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-gray-400 italic">
                    No leave requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-800 transition-colors"
            >
              <X size={24} />
            </button>
            <h3 className="font-serif text-2xl text-gray-900 mb-6">Request Leave</h3>

            <form onSubmit={handleAddRequest} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Employee *</label>
                <select
                  value={newLeaveEmp}
                  onChange={(e) => setNewLeaveEmp(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:border-eminence-gold transition-shadow bg-gray-50"
                  required
                >
                  <option value="">- Choose Employee -</option>
                  {employees?.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.branch})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Leave Date *</label>
                <input
                  type="date"
                  value={newLeaveDate}
                  onChange={(e) => setNewLeaveDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-eminence-gold focus:border-eminence-gold transition-shadow bg-gray-50"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-eminence-gold text-white text-sm font-bold uppercase tracking-widest px-6 py-4 rounded-xl hover:bg-yellow-600 transition-colors mt-4"
              >
                Submit Request
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
