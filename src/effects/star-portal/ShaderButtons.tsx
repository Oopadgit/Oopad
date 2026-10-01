import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { starPortalDocument } from './document';
import './styles.css';

const selector = 'button, a.button, a.header-launch, a.mobile-launch, a.wallet-install, a.source-use, a.repo-draft-link, .opening-links a, label.file-picker, [role="button"]';

type Control = { element: HTMLElement; visible: boolean; frame: HTMLIFrameElement | null };

// The native application button owns focus, accessible name, disabled state and
// trusted clicks. Sandboxed artwork cannot trigger wallet or navigation actions.
export function ShaderButtonSystem() {
  useEffect(() => {
    const controls = new Map<HTMLElement, Control>();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let pending = 0;
    let disposed = false;
    const removeFrame = (control: Control) => {
      control.frame?.remove();
      control.frame = null;
    };
    const syncFrame = (control: Control) => {
      const element = control.element;
      const disabled = element.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]');
      const active = control.visible && !document.hidden && !disabled && element.checkVisibility();
      if (!active) { removeFrame(control); return; }
      if (control.frame?.parentElement === element) return;
      removeFrame(control);
      const frame = document.createElement('iframe');
      frame.className = 'oopad-star-art';
      frame.title = 'Star Portal button artwork';
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('inert', '');
      frame.srcdoc = starPortalDocument();
      element.append(frame);
      control.frame = frame;
    };
    const intersection = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const control = controls.get(entry.target as HTMLElement);
        if (control) { control.visible = entry.isIntersecting; syncFrame(control); }
      }
    });
    const reconcile = () => {
      pending = 0;
      if (disposed) return;
      for (const [element, control] of controls) {
        if (!element.isConnected) {
          removeFrame(control);
          intersection.unobserve(element);
          controls.delete(element);
        } else syncFrame(control);
      }
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        if (controls.has(element) || element.closest('[data-star-portal="off"]')) continue;
        if (getComputedStyle(element).position === 'static') element.setAttribute('data-shader-position', 'static');
        element.setAttribute('data-shader-button', 'star-portal');
        const control = { element, visible: false, frame: null };
        controls.set(element, control);
        intersection.observe(element);
      }
    };
    const schedule = () => { if (!pending && !disposed) pending = requestAnimationFrame(reconcile); };
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => !(node instanceof HTMLIFrameElement && node.classList.contains('oopad-star-art'))))) schedule();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'open', 'class', 'hidden'] });
    const visibility = () => { controls.forEach(syncFrame); };
    const preference = () => { controls.forEach(removeFrame); schedule(); };
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', preference);
    reconcile();
    return () => {
      disposed = true;
      cancelAnimationFrame(pending);
      mutations.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', preference);
      controls.forEach(control => { removeFrame(control); control.element.removeAttribute('data-shader-button'); control.element.removeAttribute('data-shader-position'); });
      controls.clear();
    };
  }, []);
  return null;
}

const AuthoredFamily = lazy(() => import('./authored/ShaderButtons-BHnt6Snj.js').then(module => ({ default: module.ShaderButtons })));

export type ShaderButtonVariant = 'star-portal' | 'ignition-button' | 'induction-button' | 'plasma-button' | 'tactile-button' | 'thinking-button' | 'raking-light-pill' | 'liquid-glass' | 'intelligence' | 'holo-foil' | 'particles' | 'voice-orb' | 'water' | 'dither-hold' | 'lava-lamp' | 'gold' | 'ink';

// The complete original family stays available for explicitly selected studies.
// Application controls use ShaderButtonSystem so clicks never cross an iframe.
export function ShaderButtons(props: { variant?: ShaderButtonVariant; mode?: 'dark' | 'light'; hue?: number; saturation?: number; brightness?: number; className?: string; style?: CSSProperties }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let intersecting = false;
    const sync = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; sync(); });
    if (host.current) observer.observe(host.current);
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return <div ref={host} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>{visible && <Suspense fallback={null}><AuthoredFamily {...props} /></Suspense>}</div>;
}
