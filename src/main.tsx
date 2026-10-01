import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  ArrowUpRight,
  Menu,
  X,
  Layers,
  Code2,
  Plus,
  BookOpen,
} from "lucide-react";
import { WalletProvider } from "./wallet/WalletContext";
import { DataProvider } from "./data";
import { WalletControl } from "./UI";
import { ShaderButtonSystem } from "./effects/star-portal/ShaderButtons";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "./style.css";
import "./oopad.css";
import "./header.css";
const Home = lazy(() => import("./Home"));
const Launch = lazy(() => import("./Launch"));
const Agent = lazy(() => import("./Agent"));
const Markets = lazy(() => import("./Markets"));
const Token = lazy(() => import("./Token"));
const Docs = lazy(() => import("./Docs"));
class Boundary extends React.Component<any, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="recovery">
        <h1>This page could not load</h1>
        <p>Your wallet has not been asked to sign anything</p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload page
        </button>
        <Link to="/">Return home</Link>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Oopad home">
      <span className="brand-symbol">
        <img src="/oopad.png" alt="" />
      </span>
      <b>oopad</b>
    </Link>
  );
}
function Shell() {
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const update = () => setScrolled(scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    setOpen(false);
    if (!hash) scrollTo(0, 0);
  }, [pathname, hash]);
  useEffect(() => {
    if (!open) return;
    header.current?.querySelector<HTMLAnchorElement>("#main-navigation a")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (!header.current?.contains(e.target as Node)) setOpen(false);
    };
    const desktop = () => {
      if (innerWidth > 900) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", desktop);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", desktop);
    };
  }, [open]);
  return (
    <>
      <ShaderButtonSystem />
      <header
        ref={header}
        className="header oopad-header"
        data-scrolled={scrolled}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
        }}
      >
        <Brand />
        <nav id="main-navigation" className={open ? "nav-open" : ""} aria-label="Main navigation">
          <NavLink to="/markets">
            <Layers size={16} />
            <span>Markets</span>
            <ArrowUpRight className="nav-direction" size={18} />
          </NavLink>
          <NavLink to="/agent">
            <Code2 size={16} />
            <span>Discover</span>
            <ArrowUpRight className="nav-direction" size={18} />
          </NavLink>
          <NavLink to="/docs">
            <BookOpen size={16} />
            <span>Docs</span>
            <ArrowUpRight className="nav-direction" size={18} />
          </NavLink>
          <NavLink to="/launch" className="mobile-launch">
            <Plus size={18} />
            <span>Launch a token</span>
            <ArrowUpRight className="nav-direction" size={18} />
          </NavLink>
        </nav>
        <div className="header-actions">
          <NavLink to="/launch" className="header-launch">
            <span>Launch a token</span><Plus size={18} />
          </NavLink>
          <WalletControl />
          <button
            ref={toggle}
            className="icon mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <Boundary key={pathname}>
        <Suspense
          fallback={
            <main className="route-loading" role="status">
              Opening Oopad
            </main>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/launch" element={<Launch />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/token/:address" element={<Token />} />
            <Route path="/docs" element={<Docs />} />
            <Route
              path="*"
              element={
                <main className="recovery">
                  <h1>Page not found</h1>
                  <Link to="/" className="button primary">
                    Return to Oopad <ArrowUpRight size={16} />
                  </Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </Boundary>
      <footer className="footer">
        <div>
          <Brand />
          <p>Open ideas deserve a considered beginning</p>
        </div>
        <div>
          <Link to="/agent">Find a repository</Link>
          <Link to="/launch">Create a token</Link>
          <Link to="/docs">How it works</Link>
        </div>
        <span>Built for Robinhood Chain</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <DataProvider>
          <Shell />
        </DataProvider>
      </WalletProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
