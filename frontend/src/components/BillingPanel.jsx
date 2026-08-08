import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

import { Search, Plus, Trash2, IndianRupee, FileText, Clock, User, Gift, CreditCard, X, Download, Printer, MessageSquare } from "lucide-react";
import { downloadOrderInvoice, printOrderInvoice } from "@/lib/utils";

const PAYMENT_METHODS = [
  "Cash", "Credit/Debit Card", "Cheque", "Online Payment",
  "UPI", "E-wallet", "Reward Points", "Razorpay"
];

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const TAX_OPTIONS = [
  { key: "", label: "Select Taxes", rate: 0, inclusive: false },
  // Inclusive
  { key: "inc_prod_18", label: "Gst on Products (18%) – Inclusive", rate: 18, inclusive: true, group: "Inclusive Taxes" },
  { key: "inc_prod_5", label: "Gst on Products (5%) – Inclusive", rate: 5, inclusive: true, group: "Inclusive Taxes" },
  { key: "inc_svc_18", label: "Gst on Service (18%) – Inclusive", rate: 18, inclusive: true, group: "Inclusive Taxes" },
  { key: "inc_svc_5", label: "Gst on Service (5%) – Inclusive", rate: 5, inclusive: true, group: "Inclusive Taxes" },
  // Exclusive
  { key: "exc_prod_18", label: "Gst on Products (18%) – Exclusive", rate: 18, inclusive: false, group: "Exclusive Taxes" },
  { key: "exc_prod_5", label: "Gst on Products (5%) – Exclusive", rate: 5, inclusive: false, group: "Exclusive Taxes" },
  { key: "exc_svc_18", label: "Gst on Service (18%) – Exclusive", rate: 18, inclusive: false, group: "Exclusive Taxes" },
  { key: "exc_svc_5", label: "Gst on Service (5%) – Exclusive", rate: 5, inclusive: false, group: "Exclusive Taxes" },
];

const SERVICE_FOR_OPTS = ["Men", "Women", "Men & Women"];

export default function BillingPanel({ leads, initialClientName = "", initialContactNumber = "", editOrder = null }) {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);

  const [services, setServices] = useState([]);
  const [serviceEmployees, setServiceEmployees] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [searchLead, setSearchLead] = useState("");
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);

  // Bill Header
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [billTime, setBillTime] = useState(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  const [contactNumber, setContactNumber] = useState(initialContactNumber || "");
  const [clientName, setClientName] = useState(initialClientName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [serviceFor, setServiceFor] = useState("Men & Women");

  // Financials
  const [couponCode, setCouponCode] = useState("");
  const [discountAmt, setDiscountAmt] = useState(0);
  const [selectedTax, setSelectedTax] = useState("");

  // Extra fields
  const [referralCode, setReferralCode] = useState("");
  const [referredByClient, setReferredByClient] = useState(null);
  const [searchReferredBy, setSearchReferredBy] = useState("");
  const [showReferredDropdown, setShowReferredDropdown] = useState(false);
  const [giveRewardPoints, setGiveRewardPoints] = useState("");
  const [advanceReceived, setAdvanceReceived] = useState("No");
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [splitPayments, setSplitPayments] = useState([
    { method: "Cash", amount: 0, txnId: "" }
  ]);
  const [notes, setNotes] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");

  // Client 360
  const [clientData, setClientData] = useState(null);
  const [addToWallet, setAddToWallet] = useState(false);
  const [lastOrderId, setLastOrderId] = useState(null);
  const [lastOrderPhone, setLastOrderPhone] = useState("");
  const [lastOrderClientName, setLastOrderClientName] = useState("");


  // Package Integration States
  const [localLeads, setLocalLeads] = useState(leads || []);
  const [availablePackages, setAvailablePackages] = useState([]);
  const [pkgToAssign, setPkgToAssign] = useState("");
  const [appliedPackageId, setAppliedPackageId] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/products?all_products=true"),
      api.get("/services"),
      api.get("/packages").catch(() => ({ data: [] }))
    ]).then(([p, s, pkg]) => {
      setProducts((p.data || []).filter(prod => prod.is_retail !== false));
      setServices(s.data || []);
      setAvailablePackages(pkg.data || []);
    }).catch(() => toast.error("Failed to load catalog"));

    // Try to load service employees
    api.get("/admin/employees").then(r => {
      let svcEmps = (r.data || []).filter(e =>
        (e.role === "service" || e.role === "sales" || e.role === "employee") &&
        e.is_active !== false &&
        e.status !== "inactive" &&
        e.status !== "deactivated"
      );
      const isSuper = user?.email === "superadmin@eminence.com" || user?.role === "super_admin" || user?.is_super_admin === true;
      if (!isSuper && user?.branch) {
        svcEmps = svcEmps.filter(e => e.branch === user.branch);
      }
      setServiceEmployees(svcEmps);
    }).catch(() => { });
  }, [user]);

  useEffect(() => {
    if (leads) setLocalLeads(leads);
  }, [leads]);

  useEffect(() => {
    if (editOrder) {
      setClientName(editOrder.full_name || editOrder.user_name || "");
      setContactNumber(editOrder.phone || "");
      setNotes(editOrder.notes || "");
      if (editOrder.created_at) {
        setBillDate(editOrder.created_at.slice(0, 10));
      }

      let globalDisc = editOrder.discount || 0;
      if (editOrder.notes && !globalDisc) {
        const discMatch = editOrder.notes.match(/Discount:\s*₹?\s*([0-9.]+)/i);
        if (discMatch) {
          globalDisc = parseFloat(discMatch[1]) || 0;
        }
      }
      const itemDiscs = (editOrder.items || []).reduce((sum, it) => {
        const qty = it.quantity || 1;
        const price = it.price || 0;
        const lineTotal = price * qty;
        const disc = it.discount_type === "%" ? (lineTotal * (it.discount || 0) / 100) : (it.discount || 0);
        return sum + disc;
      }, 0);
      setDiscountAmt(Math.max(0, globalDisc - itemDiscs));

      if (editOrder.split_payments && editOrder.split_payments.length > 0) {
        setSplitPayments(editOrder.split_payments.map(p => ({
          method: p.method,
          amount: p.amount,
          txnId: p.txn_id || ""
        })));
      } else {
        setSplitPayments([{ method: editOrder.payment_method || "Cash", amount: editOrder.total || 0, txnId: "" }]);
      }

      if (editOrder.employee_id) {
        setSelectedEmployee(editOrder.employee_id);
      }

      if (editOrder.items && editOrder.items.length > 0) {
        setLineItems(editOrder.items.map((it, idx) => ({
          id: idx + Date.now(),
          category: it.category || "",
          item_id: it.product_id || it.item_id || it.id || "",
          item_name: it.name || "",
          search_query: it.name || "",
          qty: it.quantity || 1,
          discount: it.discount || 0,
          discount_type: it.discount_type || "INR",
          service_provider: it.service_provider || "",
          extra_providers: it.extra_providers || [],
          start_time: it.start_time || billTime,
          end_time: it.end_time || "",
          price: it.price || 0,
          type: (it.is_service || it.type === "service") ? "Service" : "Product",
          package_id: it.package_id || null,
          deducted_from_package: !!it.package_id
        })));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOrder]);

  const refreshLeads = async () => {
    try {
      const res = await api.get("/leads?all=true");
      setLocalLeads(res.data || []);
      if (contactNumber) {
        const found = res.data?.find(l => l.phone?.includes(contactNumber));
        if (found) {
          setClientName(found.name || "");
          setClientData({
            name: found.name, phone: found.phone,
            branch: found.branch || "—",
            total_visits: found.visit_count || 0,
            total_spendings: found.total_sale_amount || 0,
            membership: "—", reward_points: 0,
            gender: found.gender || "—",
            source: found.source || "—",
            city: found.city || "—",
            packages: found.packages || [],
            wallet: found.wallet || 0
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const assignPackageToClient = async () => {
    if (!pkgToAssign) return toast.error("Please select a package");
    const selectedLead = localLeads.find(l => l.phone?.includes(contactNumber));
    if (!selectedLead) return toast.error("Selected client not found in leads");
    const pkgTemplate = availablePackages.find(p => p.id === pkgToAssign);
    if (!pkgTemplate) return toast.error("Selected package not found");

    try {
      const duration = pkgTemplate.duration_days || 180;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + duration);
      const pkgServices = pkgTemplate.services.map(s => ({
        category: s.category || "",
        service_name: s.service_name || "",
        total_quantity: Number(s.quantity) || 1,
        remaining_quantity: Number(s.quantity) || 1,
        price: Number(s.price) || 0
      }));
      const newActivePkg = {
        id: Math.random().toString(36).substring(2, 9),
        package_id: pkgTemplate.id,
        name: pkgTemplate.name,
        purchased_at: new Date().toISOString().split("T")[0],
        expires_at: expiresAt.toISOString().split("T")[0],
        services: pkgServices,
        status: "active"
      };
      const currentPkgs = selectedLead.packages || [];
      const updatedPkgs = [...currentPkgs, newActivePkg];
      await api.patch(`/leads/${selectedLead.id}`, { packages: updatedPkgs });
      toast.success("Package assigned successfully");
      setPkgToAssign("");
      await refreshLeads();
    } catch (err) {
      toast.error("Failed to assign package");
    }
  };

  // Auto-lookup client when phone changes
  useEffect(() => {
    if (contactNumber.length >= 10) {
      const found = localLeads?.find(l => l.phone?.includes(contactNumber));
      if (found) {
        setClientName(found.name || "");
        setClientData({
          name: found.name, phone: found.phone,
          branch: found.branch || "—",
          total_visits: found.visit_count || 0,
          total_spendings: found.total_sale_amount || 0,
          membership: "—", reward_points: 0,
          gender: found.gender || "—",
          source: found.source || "—",
          city: found.city || "—",
          packages: found.packages || [],
          wallet: found.wallet || 0
        });
        if (found.assigned_to) setSelectedEmployee(found.assigned_to);
      } else {
        setClientData(null);
        setAddToWallet(false);
      }
    } else {
      setClientData(null);
      setAddToWallet(false);
    }
    setAppliedPackageId("");
  }, [contactNumber, localLeads]);

  const selectLead = (lead) => {
    setClientName(lead.name || "");
    setContactNumber(lead.phone || "");
    setSearchLead("");
    setShowLeadDropdown(false);
    setShowPhoneDropdown(false);
    setClientData({
      name: lead.name, phone: lead.phone,
      branch: lead.branch || "—",
      total_visits: lead.visit_count || 0,
      total_spendings: lead.total_sale_amount || 0,
      membership: "—", reward_points: 0,
      gender: lead.gender || "—",
      source: lead.source || "—",
      city: lead.city || "—",
      packages: lead.packages || [],
      wallet: lead.wallet || 0
    });
    setAddToWallet(false);
    setAppliedPackageId("");
  };

  // Line item management
  const addLineItem = () => {
    setLineItems([...lineItems, {
      id: Date.now(),
      category: "",
      item_id: "",
      item_name: "",
      search_query: "",
      qty: 1,
      discount: 0,
      discount_type: "INR",
      service_provider: selectedEmployee || "",
      extra_providers: [],
      start_time: billTime,
      end_time: "",
      price: 0,
      type: "Service",
      package_id: null,
      deducted_from_package: false
    }]);
  };

  const addExtraProvider = (idx) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], extra_providers: [...(updated[idx].extra_providers || []), ""] };
      return updated;
    });
  };

  const updateExtraProvider = (idx, pIdx, value) => {
    setLineItems(prev => {
      const updated = [...prev];
      const providers = [...(updated[idx].extra_providers || [])];
      providers[pIdx] = value;
      updated[idx] = { ...updated[idx], extra_providers: providers };
      return updated;
    });
  };

  const removeExtraProvider = (idx, pIdx) => {
    setLineItems(prev => {
      const updated = [...prev];
      const providers = (updated[idx].extra_providers || []).filter((_, i) => i !== pIdx);
      updated[idx] = { ...updated[idx], extra_providers: providers };
      return updated;
    });
  };

  const updateLineItem = (idx, field, value) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };

      // Auto-fill price when item name matches or when qty/item_id changes
      if (field === "item_name") {
        const selected = catalogItems.find(i => i.name === value);
        if (selected) {
          updated[idx].item_id = selected.id;
          updated[idx].category = selected.category || "";
          updated[idx].type = selected.type || "Service";

          let price = selected.price || 0;
          let package_id = null;
          let deducted = false;

          if (appliedPackageId) {
            const activePkg = clientData?.packages?.find(p => p.id === appliedPackageId);
            if (activePkg) {
              const pkgSvc = activePkg.services?.find(s => s.service_name === selected.name);
              if (pkgSvc && pkgSvc.remaining_quantity >= updated[idx].qty) {
                price = 0;
                package_id = appliedPackageId;
                deducted = true;
              }
            }
          }

          updated[idx].price = price;
          updated[idx].package_id = package_id;
          updated[idx].deducted_from_package = deducted;
        } else {
          updated[idx].item_id = "";
          updated[idx].price = 0;
          updated[idx].package_id = null;
          updated[idx].deducted_from_package = false;
        }
      } else if (field === "item_id" || field === "qty") {
        const item_id = field === "item_id" ? value : updated[idx].item_id;
        const qty = field === "qty" ? value : updated[idx].qty;
        const selected = catalogItems.find(i => i.id === item_id);
        if (selected) {
          updated[idx].item_name = selected.name;
          updated[idx].category = selected.category || "";
          updated[idx].type = selected.type || "Service";

          let price = selected.price || 0;
          let package_id = null;
          let deducted = false;

          if (appliedPackageId) {
            const activePkg = clientData?.packages?.find(p => p.id === appliedPackageId);
            if (activePkg) {
              const pkgSvc = activePkg.services?.find(s => s.service_name === selected.name);
              if (pkgSvc && pkgSvc.remaining_quantity >= qty) {
                price = 0;
                package_id = appliedPackageId;
                deducted = true;
              }
            }
          }

          updated[idx].price = price;
          updated[idx].package_id = package_id;
          updated[idx].deducted_from_package = deducted;
        }
      }
      return updated;
    });
  };

  const removeLineItem = (idx) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  // Split Payments helpers
  const addSplitPaymentRow = () => {
    setSplitPayments(prev => [...prev, { method: "Cash", amount: 0, txnId: "" }]);
  };

  const removeSplitPaymentRow = (idx) => {
    setSplitPayments(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSplitPaymentRow = (idx, field, value) => {
    setSplitPayments(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  // Calculations
  const subtotal = useMemo(() => lineItems.reduce((acc, item) => {
    const lineTotal = item.price * item.qty;
    const disc = item.discount_type === "%" ? (lineTotal * item.discount / 100) : item.discount;
    return acc + lineTotal - disc;
  }, 0), [lineItems]);

  const selectedTaxOpt = TAX_OPTIONS.find(t => t.key === selectedTax) || TAX_OPTIONS[0];
  // taxAmount is always shown in the Taxes row for info
  const taxAmount = useMemo(() => {
    if (!selectedTaxOpt || !selectedTaxOpt.rate) return 0;
    if (selectedTaxOpt.inclusive) {
      // Tax already included in price — extract for display only
      return subtotal - subtotal / (1 + selectedTaxOpt.rate / 100);
    } else {
      // Exclusive — added on top
      return subtotal * selectedTaxOpt.rate / 100;
    }
  }, [subtotal, selectedTaxOpt]);

  // Only exclusive tax gets added to the total; inclusive is already in the price
  const taxAdded = selectedTaxOpt?.inclusive ? 0 : taxAmount;
  const totalAmount = Math.max(0, subtotal - discountAmt + taxAdded);

  const totalAmountPaid = useMemo(() => {
    return splitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [splitPayments]);

  const amountDue = Math.max(0, totalAmount - totalAmountPaid - (advanceReceived === "Yes" ? advanceAmount : 0));

  const excessAmount = useMemo(() => {
    const netPayable = totalAmount - (advanceReceived === "Yes" ? advanceAmount : 0);
    return Math.max(0, totalAmountPaid - netPayable);
  }, [totalAmount, totalAmountPaid, advanceReceived, advanceAmount]);

  const catalogItems = useMemo(() => {
    const mappedPkgs = (availablePackages || []).map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      category: "PACKAGES",
      price: pkg.price,
      type: "Package"
    }));
    return [...products, ...services, ...mappedPkgs];
  }, [products, services, availablePackages]);

  const categories = useMemo(() => {
    return [...new Set(catalogItems.map(i => i.category).filter(Boolean))];
  }, [catalogItems]);

  // Dynamically recalculate package prices when applied package changes
  useEffect(() => {
    setLineItems(prev => prev.map(item => {
      if (item.type !== "Service") return item;
      const selected = services.find(s => s.id === item.item_id);
      if (!selected) return item;

      let price = selected.price || 0;
      let package_id = null;
      let deducted = false;

      if (appliedPackageId) {
        const activePkg = clientData?.packages?.find(p => p.id === appliedPackageId);
        if (activePkg) {
          const pkgSvc = activePkg.services?.find(s => s.service_name === selected.name);
          if (pkgSvc && pkgSvc.remaining_quantity >= item.qty) {
            price = 0;
            package_id = appliedPackageId;
            deducted = true;
          }
        }
      }
      return { ...item, price, package_id, deducted_from_package: deducted };
    }));
  }, [appliedPackageId, clientData, services]);

  const generateBill = async () => {
    if (isSubmittingRef.current || isSubmitting) return; // prevent double-submit

    if (lineItems.length === 0) return toast.error("Please add at least one item");
    if (!clientName || !contactNumber) return toast.error("Client name & contact are required");
    if (!billTime) return toast.error("Please specify Time of Billing");
    if (lineItems.some(it => !it.service_provider)) return toast.error("Please select a provider/employee for all items");

    // Validate E-wallet payments
    let eWalletTotal = 0;
    for (const p of splitPayments) {
      if (p.method === "E-wallet") {
        eWalletTotal += Number(p.amount) || 0;
      }
    }

    if (eWalletTotal > 0) {
      if (!clientData) {
        return toast.error("Walk-in clients cannot use E-wallet payment method. Please select/create a client profile.");
      }
      const availableWallet = clientData.wallet || 0;
      if (eWalletTotal > availableWallet) {
        return toast.error(`E-wallet payment amount (₹${eWalletTotal}) cannot exceed the available wallet balance of ₹${availableWallet}`);
      }
    }

    const finalizeBill = async (finalSplitPayments) => {
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      try {
        const emp = serviceEmployees.find(e => e.id === selectedEmployee);

        const primaryPaymentMethod = finalSplitPayments.map(p => p.method).filter(Boolean).join(", ");
        const paymentNotesStr = finalSplitPayments.map(p => `${p.method}: ₹${p.amount}${p.txnId ? ` (TXN: ${p.txnId})` : ""}`).join(", ");

        const totalItemDiscount = lineItems.reduce((sum, it) => {
          const qty = it.qty || 1;
          const price = it.price || 0;
          const lineTotal = price * qty;
          const disc = it.discount_type === "%" ? (lineTotal * (it.discount || 0) / 100) : (it.discount || 0);
          return sum + disc;
        }, 0);
        const totalDiscount = (Number(discountAmt) || 0) + totalItemDiscount;

        const payload = {
          items: lineItems.map(item => ({
            product_id: item.item_id,
            quantity: item.qty,
            package_id: item.package_id || null,
            service_provider: item.service_provider || null,
            extra_providers: (item.extra_providers || []).filter(Boolean),
            discount: Number(item.discount) || 0,
            discount_type: item.discount_type || "INR"
          })),
          full_name: clientName,
          phone: contactNumber,
          address: "In-store",
          city: clientData?.city || "Vadodara",
          pincode: "000000",
          notes: `COMBINED BILLING | Discount: ₹${totalDiscount} | Tax: ${selectedTaxOpt?.label || "None"} | Payments: ${paymentNotesStr}${referredByClient ? ` | Referred by: ${referredByClient.name} (${referredByClient.phone})` : ""} | ${notes}`,
          employee_id: selectedEmployee || undefined,
          employee_name: emp ? emp.name : undefined,
          branch: emp?.branch || clientData?.branch || user?.branch || "Baroda",
          payment_method: primaryPaymentMethod,
          split_payments: finalSplitPayments.map(p => ({
            method: p.method,
            amount: Number(p.amount) || 0,
            txn_id: p.txnId || ""
          })),
          discount: totalDiscount,
          add_to_wallet: addToWallet,
          created_at: billDate ? (editOrder?.created_at ? (billDate + editOrder.created_at.slice(10)) : (billDate + "T12:00:00+05:30")) : undefined
        };

        let orderResp;
        if (editOrder) {
          orderResp = await api.patch(`/admin/orders/${editOrder.id}`, payload);
          const updatedOrderId = editOrder.id;
          setLastOrderId(updatedOrderId);
          setLastOrderPhone(contactNumber);
          setLastOrderClientName(clientName || clientData?.name || "Client");
          toast.success("Bill updated successfully!");
        } else {
          orderResp = await api.post("/orders", payload);
          const newOrderId = orderResp.data?.id || orderResp.data?.order_id || null;
          setLastOrderId(newOrderId);
          setLastOrderPhone(contactNumber);
          setLastOrderClientName(clientName || clientData?.name || "Client");
          toast.success("Bill generated successfully!");
        }

        // Auto-save new customer to leads if not already in system
        if (!clientData && clientName && contactNumber) {
          try {
            await api.post("/leads", {
              name: clientName,
              phone: contactNumber,
              branch: "Baroda",
              section: "Men & Women",
              source: "Billing",
              grade: "Warm",
              is_client: true,
              status: "client",
              notes: `Auto-created from Billing on ${new Date().toLocaleDateString("en-IN")}`
            });
            toast.info(`${clientName} saved as a new client for future billing.`);
          } catch (_) {
            // silently ignore — don't block the bill success flow
          }
        }

        // Refresh leads to fetch newly added packages and stats
        await refreshLeads();

        // Reset
        setLineItems([]);
        setClientName(""); setContactNumber("");
        setDiscountAmt(0); setSelectedTax("");
        setReferralCode("");
        setReferredByClient(null);
        setSearchReferredBy("");
        setSplitPayments([{ method: "Cash", amount: 0, txnId: "" }]);
        setNotes("");
        if (onClose) onClose();
      } catch (err) {
        console.error("Submit bill error detailed response:", err.response?.data || err);
        toast.error(err.response?.data?.detail || "Failed to submit bill");
      } finally {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
    };


    const razorpayPayment = splitPayments.find(p => p.method === "Razorpay");
    if (razorpayPayment && razorpayPayment.amount > 0) {
      try {
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) return toast.error("Razorpay SDK failed to load. Are you online?");

        const orderResp = await api.post("/razorpay/create_order", { amount: Number(razorpayPayment.amount) });
        const { id: razorpayOrderId, amount: orderAmount } = orderResp.data;

        let keyId = process.env.REACT_APP_RAZORPAY_KEY_ID;
        if (!keyId) {
          const configResp = await api.get("/razorpay/config");
          keyId = configResp.data.key_id;
        }

        const options = {
          key: keyId,
          amount: orderAmount,
          currency: "INR",
          name: "Eminence Salon",
          description: "Billing Payment",
          order_id: razorpayOrderId,
          prefill: {
            name: clientName || "Client",
            contact: contactNumber || ""
          },
          theme: { color: "#D4AF37" },
          handler: async function (response) {
            try {
              await api.post("/razorpay/verify", {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              });
              toast.success("Payment verified successfully!");
              const finalSplit = splitPayments.map(p => p.method === "Razorpay" ? { ...p, txnId: response.razorpay_payment_id } : p);
              await finalizeBill(finalSplit);
            } catch (err) {
              toast.error("Payment verification failed.");
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (response) {
          toast.error(`Payment failed: ${response.error.description}`);
          setIsSubmitting(false);
          isSubmittingRef.current = false;
        });
        rzp.open();
        return;
      } catch (err) {
        console.error(err);
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        return toast.error("Failed to initiate Razorpay: " + (err.response?.data?.detail || err.message));
      }
    } else {
      await finalizeBill(splitPayments);
    }
  };

  const filteredLeads = localLeads?.filter(l =>
    searchLead && (l.name?.toLowerCase().includes(searchLead.toLowerCase()) || l.phone?.includes(searchLead))
  ) || [];

  const filteredPhoneLeads = useMemo(() => {
    if (!contactNumber) return [];
    return localLeads?.filter(l => l.phone?.includes(contactNumber)) || [];
  }, [contactNumber, localLeads]);

  const inputCls = "w-full bg-eminence-surface border border-eminence-border px-3 py-2 text-sm rounded focus:outline-none focus:border-eminence-gold transition-colors";
  const labelCls = "text-[10px] text-eminence-muted uppercase font-bold tracking-widest mb-1 block";

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* MAIN BILLING AREA */}
        <div className="xl:col-span-3 space-y-5">

          {/* Header: Generate New Bill */}
          <div className="eminence-card p-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-eminence-text mb-4 flex items-center gap-2">
              <FileText size={15} className="text-eminence-gold" />
              Generate New Bill
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className={labelCls}>Date of Billing *</label>
                <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className={inputCls} />
              </div>
              <div className="relative">
                <label className={labelCls}>Contact Number *</label>
                <input
                  type="tel"
                  value={contactNumber}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, "");
                    setContactNumber(val);
                    setShowPhoneDropdown(true);
                    if (lastOrderId) {
                      setLastOrderId(null);
                      setLastOrderPhone("");
                      setLastOrderClientName("");
                    }
                  }}
                  onFocus={() => { if (contactNumber) setShowPhoneDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowPhoneDropdown(false), 200)}
                  className={inputCls}
                  placeholder="Client contact"
                />
                {showPhoneDropdown && filteredPhoneLeads.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-eminence-border rounded-lg shadow-xl max-h-40 overflow-y-auto">
                    {filteredPhoneLeads.slice(0, 8).map(l => (
                      <div
                        key={l.id}
                        onClick={() => { selectLead(l); setShowPhoneDropdown(false); }}
                        className="px-3 py-2 hover:bg-eminence-surface cursor-pointer text-sm flex justify-between"
                      >
                        <span className="font-medium">{l.name}</span>
                        <span className="text-eminence-muted text-xs">{l.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className={labelCls}>Client Name *</label>
                <input
                  type="text" value={clientName}
                  onChange={e => {
                    const val = e.target.value.replace(/[0-9]/g, "");
                    setClientName(val);
                    setSearchLead(val);
                    setShowLeadDropdown(true);
                    if (lastOrderId) {
                      setLastOrderId(null);
                      setLastOrderPhone("");
                      setLastOrderClientName("");
                    }
                  }}
                  onFocus={() => { if (clientName) { setSearchLead(clientName); setShowLeadDropdown(true); } }}
                  onBlur={() => setTimeout(() => setShowLeadDropdown(false), 200)}
                  className={inputCls} placeholder="Autocomplete (Phone)"
                />
                {showLeadDropdown && filteredLeads.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-eminence-border rounded-lg shadow-xl max-h-40 overflow-y-auto">
                    {filteredLeads.slice(0, 8).map(l => (
                      <div key={l.id} onClick={() => selectLead(l)} className="px-3 py-2 hover:bg-eminence-surface cursor-pointer text-sm flex justify-between">
                        <span className="font-medium">{l.name}</span><span className="text-eminence-muted text-xs">{l.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Time of Billing</label>
                <input type="time" value={billTime} onChange={e => setBillTime(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Service For</label>
                <select value={serviceFor} onChange={e => setServiceFor(e.target.value)} className={inputCls}>
                  {SERVICE_FOR_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Main Sales Employee</label>
                <select
                  value={selectedEmployee}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedEmployee(val);
                    setLineItems(prev => prev.map(item => {
                      if (item.type === "Product" && !item.service_provider) {
                        return { ...item, service_provider: val };
                      }
                      return item;
                    }));
                  }}
                  className={inputCls}
                >
                  <option value="">Choose Employee</option>
                  {serviceEmployees
                    .filter(emp => emp.role === "sales")
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))
                  }
                </select>
              </div>
              {clientData?.packages?.length > 0 && (
                <div>
                  <label className={labelCls}>Apply Active Package</label>
                  <select
                    value={appliedPackageId}
                    onChange={e => setAppliedPackageId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">No Package</option>
                    {clientData.packages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} (Exp: {pkg.expires_at})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="eminence-card overflow-hidden">
            <div className="px-6 py-4 border-b border-eminence-border/20 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-eminence-text">
                Services & Products
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[9px] text-eminence-muted uppercase tracking-wider bg-eminence-surface/30 border-b border-eminence-border/20">
                    <th className="px-3 py-3 text-left w-8">#</th>
                    <th className="px-3 py-3 text-left">Category</th>
                    <th className="px-3 py-3 text-left">Item</th>
                    <th className="px-3 py-3 text-center w-16">Qty</th>
                    <th className="px-3 py-3 text-center">Discount</th>
                    <th className="px-3 py-3 text-left">Provider/Employee</th>
                    <th className="px-3 py-3 text-center">Start & End Time</th>
                    <th className="px-3 py-3 text-right w-24">Price</th>
                    <th className="px-3 py-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={item.id} className="border-b border-eminence-border/10 hover:bg-eminence-surface/20">
                      <td className="px-3 py-2 text-xs text-eminence-muted">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <select value={item.category} onChange={e => updateLineItem(idx, "category", e.target.value)}
                          className="bg-eminence-surface border border-eminence-border rounded px-1.5 py-1 text-xs w-[95px] focus:outline-none focus:border-eminence-gold">
                          <option value="">Category</option>
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          list={`items-list-${idx}`}
                          placeholder="Search & select item..."
                          value={item.item_name || ""}
                          onChange={e => updateLineItem(idx, "item_name", e.target.value)}
                          className="bg-eminence-surface border border-eminence-border rounded px-2 py-1 text-xs w-full min-w-[120px] focus:outline-none focus:border-eminence-gold"
                        />
                        <datalist id={`items-list-${idx}`}>
                          {catalogItems
                            .filter(i => !item.category || i.category === item.category)
                            .map(i => (
                              <option key={i.id} value={i.name}>
                                ₹{i.price} {i.category ? `(${i.category})` : ""}
                              </option>
                            ))
                          }
                        </datalist>
                        {item.deducted_from_package && (
                          <span className="text-[10px] text-emerald-600 font-bold mt-1 block">
                            ✓ Deducted from Package
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="number" min={1} value={item.qty} onChange={e => updateLineItem(idx, "qty", Number(e.target.value) || 1)}
                          className="w-10 bg-eminence-surface border border-eminence-border rounded px-1 py-1 text-xs text-center focus:outline-none focus:border-eminence-gold" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 items-center">
                          <input type="number" min={0} value={item.discount} onChange={e => updateLineItem(idx, "discount", Number(e.target.value) || 0)}
                            className="w-11 bg-eminence-surface border border-eminence-border rounded px-1 py-1 text-xs text-center focus:outline-none focus:border-eminence-gold" />
                          <select value={item.discount_type} onChange={e => updateLineItem(idx, "discount_type", e.target.value)}
                            className="bg-eminence-surface border border-eminence-border rounded px-0.5 py-1 text-xs focus:outline-none focus:border-eminence-gold w-11">
                            <option value="INR">INR</option>
                            <option value="%">%</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <select value={item.service_provider} onChange={e => updateLineItem(idx, "service_provider", e.target.value)}
                              className="bg-eminence-surface border border-eminence-border rounded px-1 py-1 text-xs flex-1 min-w-[95px] focus:outline-none focus:border-eminence-gold">
                              <option value="">Provider</option>
                              {serviceEmployees
                                .filter(emp => emp.role === "service" || emp.role === "employee")
                                .map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))
                              }
                            </select>
                            <button
                              type="button"
                              onClick={() => addExtraProvider(idx)}
                              title="Add another service provider"
                              className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-eminence-gold text-white rounded text-xs font-bold hover:bg-eminence-gold/80 transition-colors"
                            >
                              +
                            </button>
                          </div>
                          {(item.extra_providers || []).map((ep, pIdx) => (
                            <div key={pIdx} className="flex items-center gap-1">
                              <select value={ep} onChange={e => updateExtraProvider(idx, pIdx, e.target.value)}
                                className="bg-eminence-surface border border-eminence-border rounded px-1 py-1 text-xs flex-1 min-w-[95px] focus:outline-none focus:border-eminence-gold">
                                <option value="">Provider {pIdx + 2}</option>
                                {serviceEmployees
                                  .filter(emp => emp.role === "service" || emp.role === "employee")
                                  .map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                  ))
                                }
                              </select>
                              <button
                                type="button"
                                onClick={() => removeExtraProvider(idx, pIdx)}
                                title="Remove this provider"
                                className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-rose-500 hover:bg-rose-50 border border-rose-200 rounded text-xs transition-colors"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 text-xs">
                          <input type="time" value={item.start_time} onChange={e => updateLineItem(idx, "start_time", e.target.value)}
                            className="bg-eminence-surface border border-eminence-border rounded px-0.5 py-1 text-[10px] focus:outline-none focus:border-eminence-gold w-[66px]" />
                          <span className="text-eminence-muted text-[10px]">to</span>
                          <input type="time" value={item.end_time} onChange={e => updateLineItem(idx, "end_time", e.target.value)}
                            className="bg-eminence-surface border border-eminence-border rounded px-0.5 py-1 text-[10px] focus:outline-none focus:border-eminence-gold w-[66px]" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-serif text-sm">₹{(item.price * item.qty).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => removeLineItem(idx)} className="text-rose-400 hover:text-rose-600 p-1 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 flex justify-end border-t border-eminence-border/10">
              <button onClick={addLineItem} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-emerald-700 transition-colors shadow-sm">
                <Plus size={14} /> Add Service/Product/Package
              </button>
            </div>
          </div>

          {/* Financials Section */}
          <div className="eminence-card p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex justify-between items-center col-span-2 md:col-span-4 border-b border-eminence-border/20 pb-3">
                <span className="text-xs text-eminence-muted uppercase font-bold tracking-widest">Subtotal</span>
                <span className="font-serif text-lg">INR {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Coupon, Discount, Tax, Total */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Coupon</span>
                <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} className="w-40 text-right bg-eminence-surface border border-eminence-border rounded px-2 py-1 text-xs focus:outline-none focus:border-eminence-gold" placeholder="Enter code" />
              </div>
              <div className="flex justify-between items-center relative">
                <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Referred By (Client Phone)</span>
                <div className="relative w-48">
                  <input
                    type="text"
                    value={searchReferredBy}
                    onChange={e => {
                      setSearchReferredBy(e.target.value);
                      setShowReferredDropdown(true);
                      if (!e.target.value) {
                        setReferredByClient(null);
                      }
                    }}
                    onFocus={() => setShowReferredDropdown(true)}
                    onBlur={() => setTimeout(() => setShowReferredDropdown(false), 200)}
                    className="w-full text-right bg-eminence-surface border border-eminence-border rounded px-2 py-1 text-xs focus:outline-none focus:border-eminence-gold"
                    placeholder="Search phone or name..."
                  />
                  {showReferredDropdown && searchReferredBy && (
                    <div className="absolute right-0 z-30 w-56 mt-1 bg-white border border-eminence-border rounded-lg shadow-xl max-h-40 overflow-y-auto text-left">
                      {(localLeads || [])
                        .filter(l => l.name?.toLowerCase().includes(searchReferredBy.toLowerCase()) || l.phone?.includes(searchReferredBy))
                        .slice(0, 5)
                        .map(l => (
                          <div
                            key={l.id}
                            onMouseDown={() => {
                              setReferredByClient(l);
                              setSearchReferredBy(l.phone);
                              setShowReferredDropdown(false);
                            }}
                            className="px-3 py-2 hover:bg-eminence-surface cursor-pointer text-xs flex justify-between"
                          >
                            <span className="font-medium text-gray-900">{l.name}</span>
                            <span className="text-eminence-muted font-mono">{l.phone}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Discount</span>
                <input type="number" min={0} value={discountAmt} onChange={e => setDiscountAmt(Number(e.target.value))} className="w-40 text-right bg-eminence-surface border border-eminence-border rounded px-2 py-1 text-xs focus:outline-none focus:border-eminence-gold" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Give Reward Points</span>
                <input type="text" value={giveRewardPoints} onChange={e => setGiveRewardPoints(e.target.value)} className="w-40 text-right bg-eminence-surface border border-eminence-border rounded px-2 py-1 text-xs focus:outline-none focus:border-eminence-gold" placeholder="XXXXXXX" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Taxes</span>
                <select
                  value={selectedTax}
                  onChange={e => setSelectedTax(e.target.value)}
                  className="w-48 text-right bg-eminence-surface border border-eminence-border rounded px-2 py-1 text-xs focus:outline-none focus:border-eminence-gold"
                >
                  <option value="">Select Taxes</option>
                  <optgroup label="── Inclusive Taxes">
                    <option value="inc_prod_18">Gst on Products (18%)</option>
                    <option value="inc_prod_5">Gst on Products (5%)</option>
                    <option value="inc_svc_18">Gst on Service (18%)</option>
                    <option value="inc_svc_5">Gst on Service (5%)</option>
                  </optgroup>
                  <optgroup label="── Exclusive Taxes">
                    <option value="exc_prod_18">Gst on Products (18%)</option>
                    <option value="exc_prod_5">Gst on Products (5%)</option>
                    <option value="exc_svc_18">Gst on Service (18%)</option>
                    <option value="exc_svc_5">Gst on Service (5%)</option>
                  </optgroup>
                </select>
                {taxAmount > 0 && (
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-eminence-muted">
                      Tax amount{selectedTaxOpt?.inclusive ? " (incl. in price — not added)" : " (added to total)"}
                    </span>
                    <span className={selectedTaxOpt?.inclusive ? "text-eminence-muted line-through" : "text-eminence-text font-semibold"}>
                      ₹{taxAmount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Advance Received</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" name="advance" value="Yes" checked={advanceReceived === "Yes"} onChange={e => setAdvanceReceived(e.target.value)} className="accent-eminence-gold" /> Yes
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="radio" name="advance" value="No" checked={advanceReceived === "No"} onChange={e => setAdvanceReceived(e.target.value)} className="accent-eminence-gold" /> No
                  </label>
                  {advanceReceived === "Yes" && (
                    <input type="number" min={0} value={advanceAmount} onChange={e => setAdvanceAmount(Number(e.target.value))} className="w-20 text-right bg-eminence-surface border border-eminence-border rounded px-2 py-1 text-xs focus:outline-none focus:border-eminence-gold" />
                  )}
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="border-y border-eminence-border/30 py-4 flex justify-between items-center">
              <span className="text-sm font-bold uppercase tracking-widest text-eminence-text">Total</span>
              <span className="font-serif text-2xl text-eminence-gold">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Amount Payable */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Amount Payable</span>
              <span className="font-serif text-base font-bold">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Split Payments Section */}
            <div className="border-t border-eminence-border/30 pt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-widest text-eminence-text">Split Payments</span>
                <button
                  type="button"
                  onClick={addSplitPaymentRow}
                  className="px-3 py-1.5 bg-eminence-gold text-white text-[10px] font-bold uppercase tracking-widest hover:bg-eminence-gold/90 transition-all rounded-lg"
                >
                  + Add Payment Mode
                </button>
              </div>

              <div className="space-y-3">
                {splitPayments.map((p, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-eminence-surface/30 p-3 rounded-xl border border-eminence-border/10">
                    <div className="flex-1 flex gap-2 items-center">
                      <span className="text-xs text-eminence-muted font-bold min-w-[20px]">{idx + 1}.</span>
                      <select
                        value={p.method}
                        onChange={e => updateSplitPaymentRow(idx, "method", e.target.value)}
                        className="bg-white border border-eminence-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold flex-1"
                      >
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div className="flex-1 flex gap-2 items-center">
                      <span className="text-xs text-eminence-muted font-bold">₹</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="Amount"
                        value={p.amount || ""}
                        onChange={e => updateSplitPaymentRow(idx, "amount", Number(e.target.value))}
                        className="w-full bg-white border border-eminence-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold text-right"
                      />
                    </div>

                    {p.method !== "Cash" && (
                      <div className="flex-2 flex-grow">
                        <input
                          type="text"
                          placeholder="TXN ID (Optional)"
                          value={p.txnId}
                          onChange={e => updateSplitPaymentRow(idx, "txnId", e.target.value)}
                          className="w-full bg-white border border-eminence-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-eminence-gold"
                        />
                      </div>
                    )}

                    {splitPayments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSplitPaymentRow(idx)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center border border-transparent hover:border-rose-100 self-end sm:self-center"
                        title="Remove payment mode"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Total Paid & Amount Due Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 text-sm border-t border-eminence-border/30 pt-4">
              <div className="flex justify-between items-center">
                <span className="text-eminence-muted text-xs font-bold uppercase tracking-widest">Total Amount Paid</span>
                <span className="font-serif text-base font-bold text-emerald-600">₹{totalAmountPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-widest text-eminence-text">Amount Due/Credit</span>
                <span className={`font-serif text-xl font-bold ${amountDue > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                  ₹{amountDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {excessAmount > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-emerald-700 font-bold uppercase tracking-wider text-xs">Change to Return:</span>
                  <span className="font-serif text-lg font-bold text-emerald-600">₹{excessAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addToWallet}
                    onChange={e => setAddToWallet(e.target.checked)}
                    className="rounded text-eminence-gold focus:ring-eminence-gold accent-eminence-gold w-4 h-4"
                  />
                  <div>
                    <span className="text-eminence-text font-semibold">Add change to customer's wallet</span>
                    {!clientData && (
                      <span className="block text-[10px] text-eminence-muted font-normal">Change will be credited to wallet after profile is linked</span>
                    )}
                  </div>
                </label>
              </div>
            )}

            {/* Notes */}
            <div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="2" placeholder="Write notes about billing here..."
                className="w-full bg-eminence-surface border border-eminence-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-eminence-gold resize-none" />
            </div>

            {/* Generate Button */}
            <button
              onClick={generateBill}
              disabled={isSubmitting}
              className={`w-full py-4 font-bold uppercase tracking-[0.2em] text-sm rounded-xl transition-colors flex items-center justify-center gap-2 ${isSubmitting
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-eminence-text text-white hover:bg-eminence-gold cursor-pointer"
                }`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <><IndianRupee size={16} /> {editOrder ? "Update Bill / Invoice" : "Generate Invoice"}</>
              )}
            </button>

            {/* Invoice Action Options – shows after successful bill */}
            {lastOrderId && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <button
                  onClick={async () => {
                    try {
                      await printOrderInvoice(api, lastOrderId);
                    } catch {
                      toast.error("Failed to trigger print.");
                    }
                  }}
                  className="py-3 bg-eminence-gold text-white font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-eminence-goldHover transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Printer size={14} /> Print
                </button>
                <button
                  onClick={async () => {
                    try {
                      await downloadOrderInvoice(api, lastOrderId);
                    } catch {
                      toast.error("Failed to download invoice.");
                    }
                  }}
                  className="py-3 border border-eminence-border text-eminence-text font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-eminence-surface transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Download size={14} /> Download
                </button>
                <button
                  onClick={() => {
                    const cleanPhone = (lastOrderPhone || "").replace(/[^0-9]/g, "");
                    if (!cleanPhone || cleanPhone.length < 10) {
                      toast.error("Invalid phone number for WhatsApp sharing.");
                      return;
                    }
                    const nameToUse = lastOrderClientName || "Client";
                    const invoiceUrl = `${window.location.origin}/api/orders/${lastOrderId}/invoice`;
                    const msg = `Hi ${nameToUse}! Thank you for visiting Eminence Salon. Here is your invoice: ${invoiceUrl}`;
                    const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
                    window.open(waUrl, "_blank");
                  }}
                  className="py-3 bg-emerald-600 text-white font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <MessageSquare size={14} /> WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CLIENT 360° VIEW SIDEBAR */}
        <div className="xl:col-span-1">
          <div className="eminence-card p-5 sticky top-24 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-eminence-gold flex items-center gap-2 mb-4">
              <User size={14} /> Client 360° View
            </h3>

            {!clientData ? (
              <p className="text-xs text-eminence-muted italic text-center py-10">Enter client contact to view details</p>
            ) : (
              <div className="space-y-2.5 text-xs">
                {[
                  { label: "Branch", value: clientData.branch },
                  { label: "Last Visit On", value: "—" },
                  { label: "Total Visits", value: clientData.total_visits },
                  { label: "Total Spendings", value: `₹${Number(clientData.total_spendings || 0).toLocaleString("en-IN")}` },
                  { label: "Membership", value: clientData.membership },
                  {
                    label: "Active Packages",
                    isCustom: true,
                    render: () => (
                      <div className="py-2.5 border-b border-eminence-border/10 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-eminence-muted font-medium">Active Packages:</span>
                          {!clientData.packages || clientData.packages.length === 0 ? (
                            <span className="font-bold text-eminence-text">None</span>
                          ) : null}
                        </div>
                        {clientData.packages?.length > 0 && (
                          <div className="space-y-2 mt-1">
                            {clientData.packages.map((pkg, idx) => (
                              <div key={idx} className="bg-amber-50/20 p-2.5 rounded-xl border border-amber-100/50 space-y-1.5">
                                <div className="font-bold text-gray-900 text-xs">{pkg.name}</div>
                                <div className="space-y-1 text-[11px] text-gray-600 font-medium">
                                  {pkg.services?.map((s, sIdx) => (
                                    <div key={sIdx} className="flex justify-between gap-2 border-b border-dashed border-gray-200/50 pb-0.5 last:border-0 last:pb-0">
                                      <span className="truncate max-w-[65%]">{s.service_name}</span>
                                      <span className="font-bold text-eminence-text flex-shrink-0">{s.remaining_quantity} / {s.total_quantity} left</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  },
                  { label: "Last Feedback", value: "—" },
                  { label: "My Wallet", value: `₹${Number(clientData.wallet || 0).toLocaleString("en-IN")}` },
                  { label: "Reward Points", value: clientData.reward_points },
                  { label: "Gender", value: clientData.gender },
                  { label: "Date of Birth", value: "—" },
                  { label: "Anniversary", value: "—" },
                  { label: "Source of Client", value: clientData.source },
                ].map((row, i) => {
                  if (row.isCustom) {
                    return <React.Fragment key={i}>{row.render()}</React.Fragment>;
                  }
                  return (
                    <div key={i} className="flex justify-between items-center py-1.5 border-b border-eminence-border/10">
                      <span className="text-eminence-muted font-medium">{row.label}:</span>
                      <span className="font-bold text-eminence-text text-right max-w-[55%] truncate">{row.value}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {clientData && availablePackages.length > 0 && (
              <div className="pt-4 border-t border-eminence-border/10 mt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-eminence-text uppercase tracking-widest">Sell / Assign Package</h4>
                <div className="flex gap-2">
                  <select
                    value={pkgToAssign}
                    onChange={e => setPkgToAssign(e.target.value)}
                    className="flex-1 bg-eminence-surface border border-eminence-border px-2 py-1.5 text-xs rounded focus:outline-none focus:border-eminence-gold"
                  >
                    <option value="">Choose Package</option>
                    {availablePackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>{pkg.name} (₹{pkg.price})</option>
                    ))}
                  </select>
                  <button
                    onClick={assignPackageToClient}
                    className="bg-eminence-gold hover:bg-opacity-95 text-white px-3 py-1.5 text-xs font-bold rounded transition-all"
                  >
                    Assign
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
