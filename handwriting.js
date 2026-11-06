export function seededRandom(seed) {
    let state = 2166136261;
    for (const char of seed) state = Math.imul(state ^ char.codePointAt(0), 16777619);
    return () => {
        state |= 0; state = (state + 0x6D2B79F5) | 0;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

// Bounded variation around the baseline. Same text/field keeps the same ink on rerender.
export function inkSamples(text, seed = "", words = false) {
    const random = seededRandom(`${seed}:${text}`);
    // Separate normal perturbations for size, advance, x/y and rotation, as in
    // the simulator's parameter presets. Bound tails to keep dense forms legible.
    const gaussian = () => Math.max(-2.2, Math.min(2.2,
        Math.sqrt(-2 * Math.log(Math.max(1e-8, random()))) * Math.cos(2 * Math.PI * random())));
    let segments = typeof Intl.Segmenter === "function"
        ? Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text), item => item.segment)
        : Array.from(text);
    if(words){
        const joined=[];
        for(const char of segments){
            const prev=joined.at(-1);
            if(/^[\p{Script=Latin}\p{M}\d'’-]+$/u.test(char)&&prev&&/^[\p{Script=Latin}\p{M}\d'’-]+$/u.test(prev)&&prev.length<20)joined[joined.length-1]+=char;
            else joined.push(char);
        }
        segments=joined;
    }
    let drift = 0;
    return segments.map(char => {
        drift = char === "\n" ? 0 : drift * 0.78 + gaussian() * 0.22;
        return { char, x: gaussian() * 0.42, y: gaussian() * 0.7 + drift,
            angle: gaussian() * 2.7, scale: 1 + gaussian() * 0.038,
            spacing: gaussian() * 0.38, skew: gaussian() * 3,
            opacity: 0.8 + random() * 0.2, blot: random() };
    });
}

export function styleHandwriting(target, seed = "", { strength = 2.4, messiness = 0, blur = 0 } = {}) {
    const samples = inkSamples(target.textContent, seed, true).filter(sample => !/\s/u.test(sample.char));
    const em = (parseFloat(getComputedStyle(target).fontSize) || 14) / 14;
    const amount = Math.max(0, Math.min(4, strength));
    const loose = Math.max(0, Math.min(1, messiness));
    const haze = Math.max(0, Math.min(1, blur));
    target.querySelectorAll('.u4d-ink-glyph').forEach((glyph, i) => {
        const s = samples[i]; if (!s) return;
        const scale = 1 + (s.scale - 1) * amount;
        const y = Math.max(-4.8, Math.min(4.8, s.y * amount * em));
        const angle = (s.angle * amount + s.skew * loose)*(s.char.length>1?.35:1);
        const skew = s.skew * loose * 2;
        glyph.style.setProperty('transform', `translate(${s.x * amount * em}px, ${y}px) rotate(${angle}deg) scale(${scale})${loose ? ` skewX(${skew}deg)` : ''}`, 'important');
        // Real advance varies too: letters no longer sit in an evenly spaced grid.
        glyph.style.marginRight = `${(s.spacing * amount + s.skew * loose * 0.13) * em}px`;
        glyph.style.opacity = String(Math.max(0.55, 1 - (1 - s.opacity) * (amount * 0.45 + loose * 0.4)));
        // A few wet/dragged patches, not a blur filter over the whole form.
        const patch = (Math.sin(i * 0.61 + s.blot * 0.3) + 1) / 2;
        const radius = haze * (patch > 0.58 ? 0.45 + s.blot * 1.25 : s.blot * 0.12);
        glyph.style.filter = radius > 0.015 ? `blur(${radius.toFixed(3)}px)` : 'none';
    });
}

// Only explicitly marked entries are handwriting. Form labels and options stay printed.
export const HANDWRITING_SELECTOR = '[data-u4d-writing="true"]';

export function applyHandwriting(sheet) {
    const targets = sheet.querySelectorAll(HANDWRITING_SELECTOR);
    for (const [index, target] of [...targets].entries()) {
        const text = target.textContent;
        if (!text || text === "未记录") {
            target.classList.remove("u4d-ink");
            continue;
        }
        target.classList.add("u4d-ink");
        // Long values remain available as text, with no unbounded DOM expansion.
        if (text.length > 1600) continue;
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const sample of inkSamples(text, String(index), true)) {
            const start = offset; offset += sample.char.length;
            if (/\s/u.test(sample.char)) { fragment.append(document.createTextNode(sample.char)); continue; }
            const glyph = document.createElement("span");
            glyph.className = "u4d-ink-glyph";
            glyph.textContent = sample.char;
            glyph.dataset.u4dStart = String(start);
            glyph.dataset.u4dEnd = String(offset);
            fragment.append(glyph);
        }
        target.replaceChildren(fragment);
        styleHandwriting(target, String(index));
    }
}
