import source from './sources/imaginie-starfield.html?raw';

const cache = new Map<number, string>();

// Keep the archived document immutable. This boundary removes the demo website,
// not the two authored Canvas 2D renderers or their particle behavior.
export function starPortalDocument() {
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const cached = cache.get(pixelRatio);
  if (cached) return cached;
  const original = new DOMParser().parseFromString(source, 'text/html');
  const script = [...original.scripts].find(node => node.textContent?.includes('function drawStars()'))?.textContent;
  if (!script) throw new Error('Missing authored Star Portal renderer');
  const doc = document.implementation.createHTMLDocument('Oopad Star Portal');
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'";
  doc.head.append(policy);
  const style = doc.createElement('style');
  style.textContent = `html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
    canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
    #ambient-starfield{opacity:.45}#portal-stars{mix-blend-mode:screen}
    [data-demo]{display:none}`;
  doc.head.append(style);
  const lifecycle = doc.createElement('script');
  lifecycle.textContent = `
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const schedule = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => reduced ? 0 : schedule(callback);
    window.__oopadStarPortal = {frames:0, reduced};
    const count = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => count(time => { window.__oopadStarPortal.frames++; callback(time); });
  `;
  doc.head.append(lifecycle);
  for (const id of ['ambient-starfield', 'portal-stars']) {
    const canvas = doc.createElement('canvas');
    canvas.id = id;
    doc.body.append(canvas);
  }
  // The original script also animates its demo headline; retain inert targets so
  // it can run verbatim without loading unrelated media, fonts or CDN scripts.
  for (const id of ['hero-title', 'hero-desc', 'hero-actions', 'hero-proof']) {
    const dummy = doc.createElement('div');
    dummy.id = id;
    dummy.setAttribute('data-demo', '');
    doc.body.append(dummy);
  }
  const renderer = doc.createElement('script');
  renderer.textContent = script;
  doc.body.append(renderer);
  const resolution = doc.createElement('script');
  resolution.textContent = `
    const hostScale = ${pixelRatio};
    const portalResize = resizePortalCanvas;
    const ambientResize = resizeAmbientCanvas;
    function backing(canvas, context) {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(hostScale, devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      context.setTransform(ratio,0,0,ratio,0,0);
    }
    resizePortalCanvas = function() { portalResize(); backing(portalCanvas,ctxPortal); };
    // Ambient code uses canvas.width/height as its logical bounds. A scaled
    // backing would change its authored particle distribution, so CSS-pixel
    // bounds are retained through a canvas-local width/height accessor.
    const dimensions = Object.getOwnPropertyDescriptors(HTMLCanvasElement.prototype);
    let logicalWidth = 1, logicalHeight = 1;
    Object.defineProperties(ambientCanvas, {
      width: {get:()=>logicalWidth, set:value=>{logicalWidth=value;dimensions.width.set.call(ambientCanvas,Math.round(value*hostScale));}},
      height: {get:()=>logicalHeight, set:value=>{logicalHeight=value;dimensions.height.set.call(ambientCanvas,Math.round(value*hostScale));}}
    });
    resizeAmbientCanvas = function() { ambientResize(); ctxAmbient.setTransform(hostScale,0,0,hostScale,0,0); };
    resizePortalCanvas(); resizeAmbientCanvas();
    if(reduced) { drawStars(); drawAmbientStars(); }
    if(reduced) addEventListener('resize',()=>{drawStars();drawAmbientStars();});
    new ResizeObserver(()=>window.dispatchEvent(new Event('resize'))).observe(document.documentElement);
    for(const canvas of [portalCanvas,ambientCanvas]) {
      canvas.addEventListener('contextrestored',()=>window.dispatchEvent(new Event('resize')));
    }
  `;
  doc.body.append(resolution);
  const result = '<!doctype html>' + doc.documentElement.outerHTML;
  cache.set(pixelRatio, result);
  return result;
}
