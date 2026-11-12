// Material coordinates match worn-paper-generated-v1.png at the 840 x 1120 sheet size.
// This changes the rendering layer only; the DOM text and stored record stay intact.
let surfaceSequence = 0;
const NS = 'http://www.w3.org/2000/svg';
const svgURL = body => 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1120" viewBox="0 0 840 1120" preserveAspectRatio="none">' + body + '</svg>');
// Trace the actual diagonal ridges in the upper-left of this paper, in material
// coordinates. These same paths drive displacement, rubbed ink and relief light.
const upperFolds = [
    { d: 'M17 46 C31 37 46 22 56 11', width: 5, wear: .4 },
    { d: 'M47 55 C72 43 102 28 140 14', width: 9, wear: .46 },
    { d: 'M13 95 C28 87 43 78 61 74', width: 4, wear: .5 },
];
const upperDisplacement = upperFolds.map(({d,width}) => `
    <path d="${d}" fill="none" stroke="rgb(173,204,128)" stroke-width="${width}"/>
    <path d="${d}" transform="translate(1.3 2.2)" fill="none" stroke="rgb(82,56,128)" stroke-width="${width*.4}"/>
`).join('');
// Editable authoring source. Keep fixed raster inputs in the transform path.
export const PAPER_CREASE_MAP_SVG = svgURL(`
    <rect width="840" height="1120" fill="rgb(128,128,128)"/>
    <path d="M8 742 C252 739 540 749 831 739 M654 1086 Q737 1078 812 1057"
        fill="none" stroke="rgb(128,215,128)" stroke-width="2.4"/>
    <path d="M8 745 C252 742 540 752 831 742 M654 1089 Q737 1081 812 1060"
        fill="none" stroke="rgb(128,42,128)" stroke-width="2.4"/>
    ${upperDisplacement}
`);
const creaseMap = new URL('./assets/crease-displacement-v1.png', import.meta.url).href;
const inkMask = new URL('./assets/paper-ink-mask-v1.png', import.meta.url).href;
// Fine edge abrasion: deterministic, never changes on a font/slider update.
const flecks = Array.from({length:140}, (_,i) => {
    const f = n => (Math.sin(n * 37.127 + 19.4) * 43758.5453) % 1;
    const p = n => Math.abs(f(n));
    const side = i % 4, along = p(i+1), inset = 13 + p(i+4) * 25;
    const x = side===0 ? inset : side===1 ? 840-inset : along*840;
    const y = side===2 ? inset : side===3 ? 1120-inset : along*1120;
    return `<ellipse cx="${x}" cy="${y}" rx="${0.3+p(i+8)*1.6}" ry="${0.25+p(i+11)*0.8}" fill="black" opacity="${0.15+p(i+15)*0.5}"/>`;
}).join('');
export const PAPER_WEAR_MAP_SVG = svgURL(`
    <defs>
        <linearGradient id="x"><stop stop-color="black" stop-opacity=".9"/><stop offset=".025" stop-color="black" stop-opacity=".24"/><stop offset=".055" stop-color="black" stop-opacity="0"/><stop offset=".945" stop-color="black" stop-opacity="0"/><stop offset=".975" stop-color="black" stop-opacity=".24"/><stop offset="1" stop-color="black" stop-opacity=".9"/></linearGradient>
        <linearGradient id="y" x2="0" y2="1"><stop stop-color="black" stop-opacity=".95"/><stop offset=".022" stop-color="black" stop-opacity=".25"/><stop offset=".045" stop-color="black" stop-opacity="0"/><stop offset=".955" stop-color="black" stop-opacity="0"/><stop offset=".98" stop-color="black" stop-opacity=".35"/><stop offset="1" stop-color="black" stop-opacity=".95"/></linearGradient>
        <radialGradient id="notch"><stop stop-color="black" stop-opacity=".82"/><stop offset=".42" stop-color="black" stop-opacity=".55"/><stop offset="1" stop-color="black" stop-opacity="0"/></radialGradient>
        <mask id="wear" maskUnits="userSpaceOnUse" x="0" y="0" width="840" height="1120" style="mask-type:luminance">
            <rect width="840" height="1120" fill="white"/>
            <rect width="840" height="1120" fill="url(#x)"/>
            <rect width="840" height="1120" fill="url(#y)"/>
            ${flecks}
            ${upperFolds.map(({d,wear})=>`<path d="${d}" fill="none" stroke="black" stroke-width="1.7" opacity="${wear}"/><path d="${d}" fill="none" stroke="black" stroke-width="4.5" opacity=".13"/>`).join('')}
            <ellipse cx="183" cy="32" rx="10" ry="17" fill="url(#notch)"/>
            <path d="M8 742 C252 739 540 749 831 739" fill="none" stroke="black" stroke-width="1.3" opacity=".34"/>
            <path d="M654 1086 Q737 1078 812 1057" fill="none" stroke="black" stroke-width="1.5" opacity=".3"/>
            <path d="M778 10 L839 60 L810 61 Q797 49 792 35 Z" fill="black"/>
        </mask>
    </defs>
    <rect width="840" height="1120" fill="white" mask="url(#wear)"/>
`);

export function applyPaperSurface(sheet) {
    if (sheet.querySelector(':scope > .u4d-paper-imprint')) return;
    const id = 'u4d-paper-crease-' + (++surfaceSequence);
    const imprint = document.createElement('div');
    imprint.className = 'u4d-paper-imprint';
    // Host style loaders can rebase relative CSS URLs to the document root.
    imprint.style.setProperty('--u4d-ink-mask', `url("${inkMask}")`);
    imprint.style.setProperty('--u4d-crease-filter', `url("#${id}")`);
    // Keep filtering and masking separate. The outer mask is a precomposed PNG:
    // Chrome can drop the entire ink surface when intersecting vector/raster
    // masks are re-rasterized during a drag or scale transform.
    const inkLayer = document.createElement('div');
    inkLayer.className = 'u4d-paper-ink-layer';
    // Keep the close control outside the damaged printing layer.
    for (const child of [...sheet.children]) {
        if (!child.classList.contains('u4d-sheet-close')) inkLayer.append(child);
    }
    imprint.append(inkLayer);
    const defs = document.createElementNS(NS, 'svg');
    defs.setAttribute('class', 'u4d-paper-filter-defs');
    defs.setAttribute('aria-hidden', 'true');
    defs.setAttribute('width', '0');
    defs.setAttribute('height', '0');
    defs.innerHTML = `<defs><filter id="${id}" x="0" y="0" width="840" height="1120" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage href="${creaseMap}" x="0" y="0" width="840" height="1120" preserveAspectRatio="none" result="crease"/>
        <feGaussianBlur in="crease" stdDeviation=".7" result="softCrease"/>
        <feDisplacementMap in="SourceGraphic" in2="softCrease" scale="6" xChannelSelector="R" yChannelSelector="G" result="creasedInk"/>
        <feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="2" seed="23" result="fiberNoise"/>
        <feColorMatrix in="fiberNoise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .14 0 0 0 .86" result="inkCoverage"/>
        <feComposite in="creasedInk" in2="inkCoverage" operator="in" result="fiberInk"/>
        <feGaussianBlur in="fiberInk" stdDeviation=".12"/>
    </filter></defs>`;
    const lighting = document.createElement('div');
    lighting.className = 'u4d-paper-lighting';
    lighting.setAttribute('aria-hidden', 'true');
    // Crease shadows follow the same material coordinates as the displaced ink.
    // This is an art-directed approximation of diffuse/raking light, not a 3D relight.
    lighting.innerHTML = `<svg class="u4d-paper-relief" xmlns="${NS}" viewBox="0 0 840 1120" preserveAspectRatio="none">
        <defs><filter id="${id}-relief"><feGaussianBlur stdDeviation="1.15"/></filter></defs>
        <g filter="url(#${id}-relief)">
            ${upperFolds.map(({d,width})=>`<path d="${d}" transform="translate(1.3 2.2)" fill="none" stroke="#534536" stroke-width="${width*.5}" opacity=".18"/><path d="${d}" fill="none" stroke="#fff7e4" stroke-width="1.5" opacity=".4"/>`).join('')}
            <path d="M8 745 C252 742 540 752 831 742 M654 1089 Q737 1081 812 1060" fill="none" stroke="#534536" stroke-width="3" opacity=".2"/>
            <path d="M8 741 C252 738 540 748 831 738 M654 1085 Q737 1077 812 1056" fill="none" stroke="#fff7e4" stroke-width="2" opacity=".42"/>
        </g>
    </svg>`;
    sheet.append(defs, imprint, lighting);
    setPaperLighting(sheet);
}

// A larger type setting can lengthen the preview paper. Keep the material maps
// aligned with the background instead of leaving the filter at its old height.
export function resizePaperSurface(sheet) {
    const filter = sheet.querySelector('.u4d-paper-filter-defs filter');
    if (!filter) return;
    const width = sheet.offsetWidth, height = sheet.offsetHeight;
    const map = filter.querySelector('feImage');
    for(const node of [filter,map])for(const [key,value]of [['width',width],['height',height]]){
        if(node.getAttribute(key)!==String(value))node.setAttribute(key,String(value));
    }
}

export function setPaperLighting(sheet, { mode = 'window', strength = .7 } = {}) {
    sheet.dataset.paperLight = ['diffuse', 'window', 'shade'].includes(mode) ? mode : 'window';
    const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : .7;
    sheet.style.setProperty('--u4d-light-strength', String(amount));
}
