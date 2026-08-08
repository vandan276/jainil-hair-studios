import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ChevronRight, ChevronLeft, Play, X, Settings } from "lucide-react";
import api, { getMediaUrl } from "@/lib/api";
import ImageUpload from "@/components/ImageUpload";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";

export default function Consultancy() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = Client + Questionnaire, 2 = Staff Only
  const [lightbox, setLightbox] = useState(null); // { type, src }
  const [beforeAfter, setBeforeAfter] = useState({ images: [], videos: [] });
  const [clientReviews, setClientReviews] = useState({ images: [], videos: [] });
  const [gallery, setGallery] = useState([]);
  const [openFolder, setOpenFolder] = useState(null);
  const [editBeforeAfter, setEditBeforeAfter] = useState({ images: [], videos: [] });
  const [editClientReviews, setEditClientReviews] = useState({ images: [], videos: [] });
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  useEffect(() => {
    api.get("/consultation-media")
      .then(res => {
        setBeforeAfter(res.data.before_after || { images: [], videos: [] });
        setClientReviews(res.data.client_reviews || { images: [], videos: [] });
        setGallery(res.data.gallery || []);
      })
      .catch(err => {
        console.error("Failed to load consultation media:", err);
      });
  }, []);

  const [formData, setFormData] = useState({
    // Section 1: Customer Details
    date: new Date().toISOString().split('T')[0],
    location: "Baroda",
    name: "",
    phone: "",
    
    // Section 2: Questionnaire
    past_treatments: [],
    expected_look: "",
    lifestyle: "",
    reason: "",
    additional_questions: [],
    budget_range: "",
    
    // Section 3: Internal Details
    consulted_by: user?.name || "",
    status: "Warm",
    revenue: "",
    follow_up_date: "",
    source: "Direct",
    size_color: "",
    notes: ""
  });

  const handleCheckbox = (field, value) => {
    setFormData(prev => {
      const list = prev[field];
      if (list.includes(value)) {
        return { ...prev, [field]: list.filter(i => i !== value) };
      } else {
        return { ...prev, [field]: [...list, value] };
      }
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const goToNext = () => {
    if (!formData.name || !formData.phone) {
      toast.error("Please enter Name and WhatsApp Number before proceeding");
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toast.error("Please enter Name and WhatsApp Number");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/consultations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit consultation");
      
      toast.success("Consultation saved successfully!");
      const closed = formData.status === "Closed";
      const savedName = formData.name;
      const savedPhone = formData.phone;

      setStep(1);
      setFormData(prev => ({
        ...prev,
        name: "", phone: "", past_treatments: [], expected_look: "", lifestyle: "", reason: "", additional_questions: [], budget_range: "", revenue: "", follow_up_date: "", size_color: "", notes: ""
      }));

      if (closed) {
        navigate("/billing", { state: { clientName: savedName, contactNumber: savedPhone } });
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full border-b border-eminence-border py-2 px-1 focus:outline-none focus:border-eminence-gold bg-transparent";

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-light uppercase tracking-[0.2em] text-eminence-text mb-2">Consultation Form</h1>
        <p className="text-eminence-muted font-light tracking-widest text-sm">Help us understand your needs</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <button onClick={() => setStep(1)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${step === 1 ? "bg-eminence-gold text-white shadow-lg shadow-eminence-gold/20" : "bg-eminence-surface text-eminence-muted border border-eminence-border hover:border-eminence-gold/50"}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 1 ? "bg-white/20" : "bg-eminence-border/50"}`}>1</span>
          Client & Questionnaire
        </button>
        <ChevronRight size={16} className="text-eminence-muted" />
        <button onClick={() => { if (formData.name && formData.phone) setStep(2); }} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${step === 2 ? "bg-eminence-gold text-white shadow-lg shadow-eminence-gold/20" : "bg-eminence-surface text-eminence-muted border border-eminence-border hover:border-eminence-gold/50"}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 2 ? "bg-white/20" : "bg-eminence-border/50"}`}>2</span>
          Staff Only
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ===== STEP 1: Client Details + Questionnaire ===== */}
        {step === 1 && (
          <div className="space-y-10 bg-white p-8 border border-eminence-border shadow-sm animate-fade-in">
            {/* SECTION 1: CUSTOMER DETAILS */}
            <div className="space-y-6">
              <h2 className="text-lg uppercase tracking-[0.15em] border-b border-eminence-border pb-2">1. Client Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Date</label>
                  <input type="date" name="date" value={formData.date} onChange={handleChange} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Location</label>
                  <select name="location" value={formData.location} onChange={handleChange} className={`${inputCls} appearance-none`}>
                    <option value="Baroda">Baroda</option>
                    <option value="Surat">Surat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Client Name *</label>
                  <input type="text" name="name" value={formData.name} onChange={handleChange} required className={inputCls} placeholder="Full Name" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">WhatsApp Number *</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required className={inputCls} placeholder="+91..." />
                </div>
              </div>
            </div>

            {/* SECTION 2: QUESTIONNAIRE */}
            <div className="space-y-8">
              <h2 className="text-lg uppercase tracking-[0.15em] border-b border-eminence-border pb-2">2. Needs & Preferences</h2>
              
              {/* Q1 */}
              <div>
                <p className="text-sm font-medium mb-3">1 - Pehle Koi Treatment Try Kiya Hai?</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {["Hair Treatment", "Hair Transplant", "Wig Use Kiya Hai", "None"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.past_treatments.includes(opt)} onChange={() => handleCheckbox("past_treatments", opt)} className="accent-eminence-gold" />
                      <span className="text-eminence-muted hover:text-eminence-text transition-colors">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Q2 */}
              <div>
                <p className="text-sm font-medium mb-3">2 - Aaj Kaisa Look Expect Kar Rahe Hain?</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {["Natural (Daily Use)", "Professional (Formal)", "Stylish (Fashionable)", "Not Sure (Please Guide)"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="expected_look" value={opt} checked={formData.expected_look === opt} onChange={handleChange} className="accent-eminence-gold" />
                      <span className="text-eminence-muted hover:text-eminence-text transition-colors">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Q3 */}
              <div>
                <p className="text-sm font-medium mb-3">3 - Aapki Lifestyle Kaisi Hai?</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {["Office / Business", "Travelling / Outdoor", "Fitness / Gym", "Casual / Home Use"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="lifestyle" value={opt} checked={formData.lifestyle === opt} onChange={handleChange} className="accent-eminence-gold" />
                      <span className="text-eminence-muted hover:text-eminence-text transition-colors">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Q4 */}
              <div>
                <p className="text-sm font-medium mb-3">4 - Aaj Wig Kis Wajah Se Consider Kar Rahe Hain?</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {["Confidence Boost Karne Ke Liye", "Job / Business Growth Ke Liye", "Special Event (Wedding, Party)", "Medical Reason"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="reason" value={opt} checked={formData.reason === opt} onChange={handleChange} className="accent-eminence-gold" />
                      <span className="text-eminence-muted hover:text-eminence-text transition-colors">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Q5 */}
              <div>
                <p className="text-sm font-medium mb-3">5 - Additional Questions (Check if discussed)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {["Comfort & Fit (Kya yeh comfortable hoga?)", "Durability (Kitne time tak chalega?)", "Water & Sweat Resistance (Paani me ja sakte hain?)", "Natural Look (Kya yeh natural lagega?)", "Security (Kya yeh nikal nahi jaayega?)", "Service / Maintenance"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.additional_questions.includes(opt)} onChange={() => handleCheckbox("additional_questions", opt)} className="accent-eminence-gold" />
                      <span className="text-eminence-muted hover:text-eminence-text transition-colors">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Q6 */}
              <div>
                <p className="text-sm font-medium mb-3">6 - Budget Range</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "Basic", range: "₹10,000 to ₹18,000" },
                    { label: "Recommended Standard", range: "₹23,000 to ₹30,000" },
                    { label: "Premium", range: "More Than ₹30,000" }
                  ].map(opt => (
                    <label key={opt.label} className={`border p-4 text-center cursor-pointer transition-all ${formData.budget_range === opt.label ? 'border-eminence-gold bg-eminence-gold/5' : 'border-eminence-border hover:border-eminence-gold/50'}`}>
                      <input type="radio" name="budget_range" value={opt.label} checked={formData.budget_range === opt.label} onChange={handleChange} className="hidden" />
                      <div className="text-xs uppercase tracking-widest text-eminence-muted mb-2">{opt.label}</div>
                      <div className="font-medium text-eminence-text">{opt.range}</div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Media Gallery Folder View */}
            {!openFolder ? (
              <div className="space-y-6 pt-6">
                <div className="flex items-center justify-between border-b border-eminence-border pb-2">
                  <h2 className="text-lg uppercase tracking-[0.15em]">Videos & Images Gallery</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Folder: Men Before */}
                  {[{type:"before",gender:"men",label:"Men — Before",color:"bg-blue-50 border-blue-200 text-blue-700"},{type:"after",gender:"men",label:"Men — After",color:"bg-emerald-50 border-emerald-200 text-emerald-700"},{type:"before",gender:"women",label:"Women — Before",color:"bg-pink-50 border-pink-200 text-pink-700"},{type:"after",gender:"women",label:"Women — After",color:"bg-rose-50 border-rose-200 text-rose-700"}].map(folder => {
                    const folderItems = gallery.filter(item => item.type === folder.type && item.gender === folder.gender);
                    return (
                      <div
                        key={`${folder.type}_${folder.gender}`}
                        onClick={() => setOpenFolder(`${folder.type}_${folder.gender}`)}
                        className={`border ${folder.color} rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-lg transition-all group py-7`}
                      >
                        <div className={`w-14 h-14 rounded-2xl ${folder.color} flex items-center justify-center group-hover:scale-110 transition-transform mb-3 border`}>
                          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                        </div>
                        <h3 className="font-serif text-base text-gray-800 font-bold mb-1">{folder.label}</h3>
                        <p className="text-xs text-eminence-muted">{folderItems.length} photos inside</p>
                      </div>
                    );
                  })}
                </div>

                {/* Client Reviews (legacy) */}
                {(clientReviews.images.length > 0 || clientReviews.videos.length > 0) && (
                  <div
                    onClick={() => setOpenFolder("client_reviews")}
                    className="bg-white border border-eminence-border rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:border-eminence-gold hover:shadow-lg transition-all group py-7"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform mb-3">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    </div>
                    <h3 className="font-serif text-base text-gray-800 font-bold mb-1">Client Reviews</h3>
                    <p className="text-xs text-eminence-muted">{clientReviews.images.length + clientReviews.videos.length} items inside</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 pt-6">
                <div className="flex items-center justify-between border-b border-eminence-border pb-2">
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => setOpenFolder(null)}
                      className="flex items-center gap-1 text-xs uppercase tracking-widest font-bold text-eminence-muted hover:text-black transition-colors"
                    >
                      <ChevronLeft size={16} /> Back
                    </button>
                    <span className="text-eminence-border">|</span>
                    <h2 className="text-lg uppercase tracking-[0.15em]">
                      {openFolder === "client_reviews"
                        ? "Client Reviews"
                        : openFolder === "before_men" ? "Men — Before"
                        : openFolder === "after_men" ? "Men — After"
                        : openFolder === "before_women" ? "Women — Before"
                        : openFolder === "after_women" ? "Women — After"
                        : "Gallery"}
                    </h2>
                  </div>
                </div>

                {(() => {
                  // Legacy folder: client_reviews
                  if (openFolder === "client_reviews") {
                    const folderData = clientReviews;
                    return (
                      <div className="space-y-8 animate-fade-in">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-eminence-muted mb-3 font-bold text-center">Photos</p>
                          {folderData.images.length > 0 ? (
                            <Carousel className="w-full max-w-md mx-auto relative px-8" opts={{ align: "start", loop: true }}>
                              <CarouselContent className="-ml-3">
                                {folderData.images.map((src, idx) => (
                                  <CarouselItem key={idx} className="pl-3 basis-full">
                                    <div onClick={() => setLightbox({ type: "image", src: getMediaUrl(src) })} className="relative group cursor-pointer aspect-square overflow-hidden rounded-xl border border-eminence-border/30 hover:border-eminence-gold/50 transition-all hover:shadow-lg">
                                      <img src={getMediaUrl(src)} alt={`Review ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </CarouselItem>
                                ))}
                              </CarouselContent>
                              <CarouselPrevious className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/90 shadow hover:bg-white border-eminence-border" />
                              <CarouselNext className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 shadow hover:bg-white border-eminence-border" />
                            </Carousel>
                          ) : (
                            <p className="text-xs text-eminence-muted italic text-center">No photos in this folder.</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-eminence-muted mb-3 font-bold text-center">Videos</p>
                          {folderData.videos.length > 0 ? (
                            <Carousel className="w-full max-w-xl mx-auto relative px-8" opts={{ align: "start", loop: true }}>
                              <CarouselContent className="-ml-3">
                                {folderData.videos.map((src, idx) => (
                                  <CarouselItem key={idx} className="pl-3 basis-full">
                                    <div onClick={() => setLightbox({ type: "video", src: getMediaUrl(src) })} className="relative group cursor-pointer aspect-video overflow-hidden rounded-xl border border-eminence-border/30 hover:border-eminence-gold/50 transition-all hover:shadow-lg bg-black/5">
                                      <video src={getMediaUrl(src)} className="w-full h-full object-cover" muted preload="metadata" />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                                          <Play size={20} className="text-eminence-gold ml-0.5" fill="currentColor" />
                                        </div>
                                      </div>
                                    </div>
                                  </CarouselItem>
                                ))}
                              </CarouselContent>
                              <CarouselPrevious className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/90 shadow hover:bg-white border-eminence-border" />
                              <CarouselNext className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 shadow hover:bg-white border-eminence-border" />
                            </Carousel>
                          ) : (
                            <p className="text-xs text-eminence-muted italic text-center">No videos in this folder.</p>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // New gallery-based folders (before_men, after_men, before_women, after_women)
                  const [type, gender] = openFolder.split("_");
                  const folderItems = gallery.filter(item => item.type === type && item.gender === gender);
                  return (
                    <div className="space-y-4 animate-fade-in">
                      {folderItems.length === 0 ? (
                        <p className="text-xs text-eminence-muted italic text-center py-8">No photos in this folder yet.</p>
                      ) : (
                        <Carousel className="w-full max-w-md mx-auto relative px-8" opts={{ align: "start", loop: true }}>
                          <CarouselContent className="-ml-3">
                            {folderItems.map((item, idx) => (
                              <CarouselItem key={idx} className="pl-3 basis-full">
                                <div
                                  onClick={() => setLightbox({ type: "image", src: getMediaUrl(item.url) })}
                                  className="relative group cursor-pointer aspect-square overflow-hidden rounded-xl border border-eminence-border/30 hover:border-eminence-gold/50 transition-all hover:shadow-lg"
                                >
                                  <img src={getMediaUrl(item.url)} alt={`${type} ${gender} ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </CarouselItem>
                            ))}
                          </CarouselContent>
                          <CarouselPrevious className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/90 shadow hover:bg-white border-eminence-border" />
                          <CarouselNext className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 shadow hover:bg-white border-eminence-border" />
                        </Carousel>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Next Button */}
            <button 
              type="button" 
              onClick={goToNext}
              className="w-full bg-eminence-gold text-white uppercase tracking-[0.2em] text-sm py-4 hover:bg-black transition-colors flex justify-center items-center gap-2"
            >
              Next — Staff Details
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ===== STEP 2: Staff Only (Internal Details) ===== */}
        {step === 2 && (
          <div className="space-y-6 bg-white p-8 border border-eminence-border shadow-sm animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg uppercase tracking-[0.15em] border-b border-eminence-border pb-2 text-eminence-gold flex-1">3. Internal Details (Staff Only)</h2>
            </div>

            {/* Summary of client info from step 1 */}
            <div className="bg-eminence-surface/30 border border-eminence-border/20 rounded-xl p-4 flex flex-wrap gap-6 text-xs">
              <div>
                <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block">Client</span>
                <span className="font-medium">{formData.name}</span>
              </div>
              <div>
                <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block">Phone</span>
                <span className="font-medium">{formData.phone}</span>
              </div>
              <div>
                <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block">Location</span>
                <span className="font-medium">{formData.location}</span>
              </div>
              {formData.budget_range && (
                <div>
                  <span className="text-[10px] text-eminence-muted uppercase font-bold tracking-wider block">Budget</span>
                  <span className="font-medium text-eminence-gold">{formData.budget_range}</span>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Consulted By</label>
                <input type="text" name="consulted_by" value={formData.consulted_by} onChange={handleChange} className={inputCls} />
              </div>
              
              <div>
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Source</label>
                <select name="source" value={formData.source} onChange={handleChange} className={`${inputCls} appearance-none`}>
                  <option value="Direct">Direct</option>
                  <option value="DMT">DMT</option>
                  <option value="Repeat">Repeat</option>
                  <option value="Reference">Reference</option>
                  <option value="Facebook Ads">Facebook Ads</option>
                  <option value="WhatsApp Ads">WhatsApp</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Status</label>
                <select name="status" value={formData.status} onChange={handleChange} className={`${inputCls} appearance-none`}>
                  <option value="Hot">Hot</option>
                  <option value="Warm">Warm</option>
                  <option value="Cold">Cold</option>
                  <option value="Token">Token</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Revenue / Expected Revenue (₹)</label>
                <input type="number" name="revenue" value={formData.revenue} onChange={handleChange} className={inputCls} placeholder="e.g. 25000" />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Follow-up Date</label>
                <input type="date" name="follow_up_date" value={formData.follow_up_date} onChange={handleChange} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Size & Color (e.g., 9x7 | Natural Black)</label>
                <input type="text" name="size_color" value={formData.size_color} onChange={handleChange} className={inputCls} placeholder="Size x Size | Color" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-widest text-eminence-muted mb-2">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows="3" className="w-full border border-eminence-border p-3 focus:outline-none focus:border-eminence-gold bg-transparent resize-none" placeholder="Any additional details or observations..."></textarea>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 pt-2">
              <button 
                type="button" 
                onClick={goBack}
                className="flex-1 border border-eminence-border text-eminence-muted uppercase tracking-[0.2em] text-sm py-4 hover:bg-eminence-surface transition-colors flex justify-center items-center gap-2"
              >
                <ChevronLeft size={18} />
                Back
              </button>
              <button 
                type="submit" 
                disabled={loading}
                className="flex-[2] bg-eminence-gold text-white uppercase tracking-[0.2em] text-sm py-4 hover:bg-black transition-colors disabled:opacity-70 flex justify-center items-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? "Saving..." : "Save Consultation"}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Lightbox Modal */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-6 right-6 text-white/80 hover:text-white transition-colors z-10">
            <X size={28} />
          </button>
          <div className="max-w-4xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
            {lightbox.type === "image" ? (
              <img src={lightbox.src} alt="Consultation" className="w-full h-full object-contain rounded-xl" />
            ) : (
              <video src={lightbox.src} controls autoPlay className="w-full max-h-[85vh] rounded-xl" />
            )}
          </div>
        </div>
      )}

      {/* Admin Gallery Editor Modal */}
      {isEditorOpen && user?.role === "admin" && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden relative max-h-[90vh] flex flex-col animate-fade-in">
            <button onClick={() => setIsEditorOpen(false)} className="absolute top-4 right-4 text-eminence-muted hover:text-eminence-text transition-colors">
              <X size={20} />
            </button>
            <div className="p-8 border-b border-eminence-border">
              <h3 className="font-serif text-2xl text-eminence-text">Manage Consultation Gallery</h3>
              <p className="text-xs text-eminence-muted mt-1">Upload and configure photos and videos displayed on the consultation form.</p>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-8">
              {/* SECTION 1: Before & After */}
              <div className="border border-eminence-border/60 rounded-2xl p-6 bg-eminence-surface/10 space-y-6">
                <h4 className="font-serif text-lg text-eminence-text border-b border-eminence-border pb-2 text-eminence-gold">Before & After Folder</h4>
                
                {/* Before & After Photos */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-eminence-muted mb-3">Photos ({editBeforeAfter.images?.length || 0})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-4">
                    {(editBeforeAfter.images || []).map((img, i) => (
                      <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-eminence-border">
                        <img src={getMediaUrl(img)} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setEditBeforeAfter(prev => ({
                            ...prev,
                            images: prev.images.filter((_, idx) => idx !== i)
                          }))}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg transition-transform hover:scale-110"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white p-4 border border-dashed border-eminence-border rounded-xl">
                    <p className="text-xs font-bold text-eminence-muted uppercase mb-2">Add Photo to Before & After</p>
                    <ImageUpload 
                      value="" 
                      onChange={(url) => {
                        if (url) {
                          const relativeUrl = url.replace(/http:\/\/localhost:\d+/i, "").replace(/https?:\/\/[^\/]+/i, "");
                          setEditBeforeAfter(prev => ({
                            ...prev,
                            images: [...(prev.images || []), relativeUrl]
                          }));
                        }
                      }} 
                    />
                  </div>
                </div>

                {/* Before & After Videos */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-eminence-muted mb-3">Videos ({editBeforeAfter.videos?.length || 0})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                    {(editBeforeAfter.videos || []).map((vid, i) => (
                      <div key={i} className="relative group aspect-video rounded-lg overflow-hidden border border-eminence-border bg-black/5">
                        <video src={getMediaUrl(vid)} className="w-full h-full object-cover" muted />
                        <button
                          type="button"
                          onClick={() => setEditBeforeAfter(prev => ({
                            ...prev,
                            videos: prev.videos.filter((_, idx) => idx !== i)
                          }))}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg transition-transform hover:scale-110"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white p-4 border border-dashed border-eminence-border rounded-xl">
                    <p className="text-xs font-bold text-eminence-muted uppercase mb-2">Add Video to Before & After</p>
                    <ImageUpload 
                      value="" 
                      onChange={(url) => {
                        if (url) {
                          const relativeUrl = url.replace(/http:\/\/localhost:\d+/i, "").replace(/https?:\/\/[^\/]+/i, "");
                          setEditBeforeAfter(prev => ({
                            ...prev,
                            videos: [...(prev.videos || []), relativeUrl]
                          }));
                        }
                      }} 
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Client Reviews */}
              <div className="border border-eminence-border/60 rounded-2xl p-6 bg-eminence-surface/10 space-y-6">
                <h4 className="font-serif text-lg text-eminence-text border-b border-eminence-border pb-2 text-eminence-gold">Client Reviews Folder</h4>
                
                {/* Client Reviews Photos */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-eminence-muted mb-3">Photos ({editClientReviews.images?.length || 0})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-4">
                    {(editClientReviews.images || []).map((img, i) => (
                      <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-eminence-border">
                        <img src={getMediaUrl(img)} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setEditClientReviews(prev => ({
                            ...prev,
                            images: prev.images.filter((_, idx) => idx !== i)
                          }))}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg transition-transform hover:scale-110"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white p-4 border border-dashed border-eminence-border rounded-xl">
                    <p className="text-xs font-bold text-eminence-muted uppercase mb-2">Add Photo to Client Reviews</p>
                    <ImageUpload 
                      value="" 
                      onChange={(url) => {
                        if (url) {
                          const relativeUrl = url.replace(/http:\/\/localhost:\d+/i, "").replace(/https?:\/\/[^\/]+/i, "");
                          setEditClientReviews(prev => ({
                            ...prev,
                            images: [...(prev.images || []), relativeUrl]
                          }));
                        }
                      }} 
                    />
                  </div>
                </div>

                {/* Client Reviews Videos */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-eminence-muted mb-3">Videos ({editClientReviews.videos?.length || 0})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                    {(editClientReviews.videos || []).map((vid, i) => (
                      <div key={i} className="relative group aspect-video rounded-lg overflow-hidden border border-eminence-border bg-black/5">
                        <video src={getMediaUrl(vid)} className="w-full h-full object-cover" muted />
                        <button
                          type="button"
                          onClick={() => setEditClientReviews(prev => ({
                            ...prev,
                            videos: prev.videos.filter((_, idx) => idx !== i)
                          }))}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg transition-transform hover:scale-110"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white p-4 border border-dashed border-eminence-border rounded-xl">
                    <p className="text-xs font-bold text-eminence-muted uppercase mb-2">Add Video to Client Reviews</p>
                    <ImageUpload 
                      value="" 
                      onChange={(url) => {
                        if (url) {
                          const relativeUrl = url.replace(/http:\/\/localhost:\d+/i, "").replace(/https?:\/\/[^\/]+/i, "");
                          setEditClientReviews(prev => ({
                            ...prev,
                            videos: [...(prev.videos || []), relativeUrl]
                          }));
                        }
                      }} 
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-eminence-border bg-eminence-surface/30 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  api.get("/consultation-media").then(res => {
                    setBeforeAfter(res.data.before_after || { images: [], videos: [] });
                    setClientReviews(res.data.client_reviews || { images: [], videos: [] });
                    setIsEditorOpen(false);
                  });
                }}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest border border-eminence-border text-eminence-muted hover:bg-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.post("/admin/consultation-media", {
                      before_after: editBeforeAfter,
                      client_reviews: editClientReviews
                    });
                    setBeforeAfter(editBeforeAfter);
                    setClientReviews(editClientReviews);
                    toast.success("Consultation media gallery updated successfully!");
                    setIsEditorOpen(false);
                  } catch (err) {
                    toast.error("Failed to update media: " + err.message);
                  }
                }}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest bg-eminence-gold hover:bg-eminence-gold/90 text-white rounded-lg transition-colors shadow-lg shadow-eminence-gold/15"
              >
                Save Gallery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
