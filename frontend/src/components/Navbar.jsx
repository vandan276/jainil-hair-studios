import React, { useState, useEffect } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useLang, LANGUAGES } from "@/context/LanguageContext";
import { ShoppingBag, Menu, X, User, Globe, LogOut } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  const isHero = location.pathname === "/" || location.pathname === "/men";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isEmployee = user && ["admin", "sales", "service", "employee", "receptionist"].includes(user.role);
  
  const links = user && user.role === "receptionist" ? [
    { to: "/receptionist-panel", label: "Receptionist Panel" },
    { to: "/billing", label: t("billing") || "Billing" }
  ] : user && user.role === "service" ? [
    { to: "/service-panel", label: "Service Panel" },
    { to: "/billing", label: t("billing") || "Billing" }
  ] : isEmployee ? [
    { to: "/billing", label: t("billing") || "Billing" }
  ] : [
    { to: "/", label: t("home") },
    { to: "/men", label: t("men") },
    { to: "/shop", label: t("shop") },
  ];

  const solid = !isHero || scrolled || open;
  const isMenPage = location.pathname === "/men";
  const txt = solid ? "text-eminence-text" : (isMenPage ? "text-eminence-text" : "text-white");

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className={`transition-all duration-500 ${solid ? "bg-white/95 backdrop-blur-md border-b border-eminence-border" : "bg-transparent"}`}>
        <div className="max-w-[1500px] mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <nav className="hidden lg:flex items-center gap-10 flex-1">
            {links.map((l) => {
              const isStaffPath = l.to.startsWith("/billing") || l.to.startsWith("/consultancy") || l.to.startsWith("/admin") || l.to.endsWith("-panel");
              return isStaffPath ? (
                <a
                  key={l.to}
                  href={l.to}
                  className={`text-[12px] uppercase tracking-[0.18em] font-medium transition-colors duration-300 ${location.pathname === l.to ? "text-eminence-gold" : `${txt} hover:opacity-70`}`}
                >
                  {l.label}
                </a>
              ) : (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === "/"}
                  data-testid={`nav-${l.to.replace("/", "") || "home"}`}
                  className={({ isActive }) =>
                    `text-[12px] uppercase tracking-[0.18em] font-medium transition-colors duration-300 ${isActive ? "text-eminence-gold" : `${txt} hover:opacity-70`}`
                  }
                >
                  {l.label}
                </NavLink>
              );
            })}
          </nav>

          <Link to="/" className="flex flex-col items-center justify-center text-center lg:absolute lg:left-1/2 lg:-translate-x-1/2 group py-1" data-testid="nav-logo">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2.5 h-[1px] bg-eminence-gold"></span>
              <span className="font-serif tracking-[0.28em] text-lg md:text-xl font-bold uppercase text-eminence-text leading-none">
                JAINIL HAIR
              </span>
              <span className="w-2.5 h-[1px] bg-eminence-gold"></span>
            </div>
            <span className="text-[9px] md:text-[10px] tracking-[0.45em] uppercase font-light text-eminence-gold block -mt-0.5">
              studio
            </span>
          </Link>

          <div className="flex items-center gap-5 lg:flex-1 lg:justify-end">
            {/* Language switcher */}
            <div className="relative">
              <button onClick={() => setLangOpen(!langOpen)} className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] font-medium ${txt} hover:opacity-70`} data-testid="nav-language">
                <Globe size={14} />
                <span>{LANGUAGES.find((l) => l.code === lang)?.label || "EN"}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-eminence-border min-w-[140px] shadow-lg z-50" data-testid="lang-dropdown">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLang(l.code); setLangOpen(false); }}
                      data-testid={`lang-${l.code}`}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-eminence-surface ${lang === l.code ? "text-eminence-gold font-semibold" : "text-eminence-text"}`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {user ? (
              <>
                <a 
                  href={user.role === "admin" ? "/admin" : (user.role === "sales" ? "/sales-panel" : (user.role === "service" ? "/service-panel" : (user.role === "receptionist" ? "/receptionist-panel" : "/dashboard")))} 
                  className={`hidden md:flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-medium ${txt} hover:opacity-70`} 
                  data-testid="nav-dashboard"
                >
                  <User size={16} /> {user.role === "admin" ? t("admin") : (user.role === "sales" ? t("salesPanel") : (user.role === "service" ? "Service Panel" : (user.role === "receptionist" ? "Receptionist Panel" : t("account"))))}
                </a>
                <button onClick={() => { logout(); nav("/"); }} className="hidden md:flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold border border-rose-400/40 text-rose-500 px-4 py-1.5 rounded-full hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-lg hover:shadow-rose-500/20 transition-all duration-300" data-testid="nav-logout">
                  <LogOut size={13} />
                  {t("signOut")}
                </button>
              </>
            ) : (
              <Link to="/login" className={`hidden md:flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-medium ${txt} hover:opacity-70`} data-testid="nav-login">
                <User size={16} /> {t("signIn")}
              </Link>
            )}

            {!isEmployee && (
              <Link to="/cart" className={`relative ${txt} hover:opacity-70 transition-opacity`} data-testid="nav-cart">
                <ShoppingBag size={20} />
                {count > 0 && (
                  <span className="absolute -top-2 -right-2 bg-eminence-gold text-white text-[10px] w-4 h-4 flex items-center justify-center font-semibold">
                    {count}
                  </span>
                )}
              </Link>
            )}

            <button onClick={() => setOpen(!open)} className={`lg:hidden ${txt}`} data-testid="nav-menu-toggle">
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="lg:hidden border-t border-eminence-border bg-white">
            <div className="px-6 py-6 flex flex-col gap-4">
              {links.map((l) => {
                const isStaffPath = l.to.startsWith("/billing") || l.to.startsWith("/consultancy") || l.to.startsWith("/admin") || l.to.endsWith("-panel");
                return isStaffPath ? (
                  <a key={l.to} href={l.to}
                    className="text-sm font-medium text-eminence-text hover:text-eminence-gold uppercase tracking-[0.18em]">
                    {l.label}
                  </a>
                ) : (
                  <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)}
                    className="text-sm font-medium text-eminence-text hover:text-eminence-gold uppercase tracking-[0.18em]">
                    {l.label}
                  </NavLink>
                );
              })}
              {user ? (
                <>
                  <a 
                    href={user.role === "admin" ? "/admin" : (user.role === "sales" ? "/sales-panel" : (user.role === "service" ? "/service-panel" : (user.role === "receptionist" ? "/receptionist-panel" : "/dashboard")))} 
                    className="text-sm font-medium text-eminence-text uppercase tracking-[0.18em]"
                  >
                    {user.role === "admin" ? t("admin") : (user.role === "sales" ? t("salesPanel") : (user.role === "service" ? "Service Panel" : (user.role === "receptionist" ? "Receptionist Panel" : t("account"))))}
                  </a>
                  <button onClick={() => { logout(); setOpen(false); nav("/"); }} className="flex items-center gap-2 text-sm font-bold text-rose-500 uppercase tracking-[0.18em] border border-rose-400/30 px-4 py-2 rounded-full hover:bg-rose-500 hover:text-white transition-all">
                    <LogOut size={15} />
                    {t("signOut")}
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={() => setOpen(false)} className="text-sm font-medium text-eminence-text uppercase tracking-[0.18em]">{t("signIn")}</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
