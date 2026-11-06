import { seededRandom } from './handwriting.js';

// Generated transparent textures; provenance and prompts live in assets/generated-assets.json.
// All decoration stays outside record text and chat metadata.
const NS = 'http://www.w3.org/2000/svg';
const bounded = n => Math.max(0, Math.min(1, Number(n) || 0));
const asset = file => new URL(`./assets/${file}`, import.meta.url).href;
export const STAIN_SCENARIOS = {
    water: {
        spill: { label: '泼洒后干涸', src: asset('water-tidemark-generated-v1.png'), ratio: 1.5,
            term: '局部水浸', formation: '设计情境：水洒在纸面后向外渗开，干燥留下不规则的浅色边界。', features: '开放的大片边线、断续的干燥层次。' },
        rain: { label: '雨点洇湿', src: asset('water-rain-generated-v1.png'), ratio: 1.5,
            term: '散点洇湿', formation: '设计情境：零散雨点落到纸面，局部洇湿并干燥，留下大小不同的淡痕。', features: '散点分布、局部重叠、中央较浅。' },
        edge: { label: '纸边受潮', src: asset('water-edge-generated-v1.png'), ratio: 3,
            term: '边缘渗水', formation: '设计情境：纸边接触潮湿表面，水分沿纤维向内迁移，形成带状干湿边界。', features: '从纸边进入、波浪状的多层浅褐边线。' },
    },
    blood: {
        smear: { label: '接触擦蹭', src: asset('blood-transfer-generated-v1.png'), ratio: 1.5,
            term: 'Swipe · §2.33', formation: '可能的形成方式：带血表面擦过另一表面，将血转移并拉开。', features: '不均匀的擦蹭、断续细纹和渐淡区域。' },
        drops: { label: '重力滴落', src: asset('blood-drops-generated-v1.png'), ratio: 2 / 3,
            term: 'Drip stain · §2.16', formation: '可能的形成方式：血滴受重力作用下落，在接触纸面后沉积。', features: '离散滴点；纸面吸水会影响边缘形态。' },
        grip: { label: '手指沾染', src: asset('blood-grip-generated-v1.png'), ratio: 1,
            term: 'Transfer stain · §2.35', formation: '可能的形成方式：带血物体接触纸面并转移血液；此图设定为指腹接触。', features: '局部接触轮廓、断裂纹路和压力不均。' },
        flow: { label: '重力流淌', src: asset('blood-flow-generated-v1.png'), ratio: 2 / 3,
            term: 'Flow · §2.20', formation: '可能的形成方式：血液在重力或承载表面移动的作用下沿表面流动。', features: '细长流路、分支和末端聚集。' },
        wipe: { label: '湿迹拖抹', src: asset('blood-wipe-generated-v1.png'), ratio: 1.5,
            term: 'Wipe · §2.37', formation: '可能的形成方式：物体经过已经存在的湿血迹，改变原有痕迹。', features: '原有边缘残留，中部被带开，出现拖抹纹。' },
        soak: { label: '吸附浸染', src: asset('blood-soak-generated-v1.png'), ratio: 1,
            term: 'Saturation stain · §2.29', formation: '可能的形成方式：血液在可吸收材料中积聚并浸入。', features: '深色核心、向外洇开的不规则浅色边缘。' },
    },
};
function node(tag, attrs = {}, parent) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    parent?.append(element);
    return element;
}
function overlay(parent, name, width, height) {
    return node('svg', { class: name, viewBox: `0 0 ${width} ${height}`,
        width, height, 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' }, parent);
}
function paperStains(sheet, { water, blood, seed, waterScene, bloodScene }) {
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    const surface = sheet.querySelector('.u4d-paper-ink-layer') || sheet.querySelector(':scope > .u4d-paper-imprint') || sheet;
    const layer = overlay(surface, 'u4d-paper-effects', w, h);
    function texture(kind, scene, intensity, x, y, width) {
        const choice = STAIN_SCENARIOS[kind][scene];
        const random = seededRandom(`${kind}:${scene}:${seed}`);
        const group = node('g', { class: `u4d-${kind}-stains`, 'data-scene': scene, opacity: intensity }, layer);
        // Change position slightly only on explicit reshuffle. Slider input is stable.
        const jitter = seed ? (random() - 0.5) * 0.055 : 0;
        node('image', {
            href: choice.src, x: (x + jitter) * w, y: (y + jitter) * h,
            width: width * w, height: width * w / choice.ratio,
            preserveAspectRatio: 'xMidYMid meet',
        }, group);
    }
    if (water) {
        const placement = { spill: [0.57, 0.54, 0.48], rain: [0.52, 0.58, 0.46], edge: [0, 0.77, 1] };
        texture('water', waterScene, water, ...placement[waterScene]);
    }
    if (blood) {
        const placement = { smear: [0.79, 0.29, 0.24], drops: [0.82, 0.27, 0.17], grip: [0.86, 0.63, 0.21],
            flow: [0.86, 0.29, 0.13], wipe: [0.76, 0.57, 0.28], soak: [0.83, 0.68, 0.23] };
        texture('blood', bloodScene, Math.min(1, blood * 1.25), ...placement[bloodScene]);
    }
}
function strikeAndScribble(target, { strike, scribble, seed, ink }) {
    if (!target) return;
    target.querySelectorAll('.u4d-correction-effects').forEach(n => n.remove());
    if ((!strike && !scribble) || !target.textContent.trim()) return;
    // Layout boxes are unscaled. A mark stays attached to its words when the
    // sheet is zoomed, resized, reflowed or the note is scrolled.
    const lines = new Map();
    for (const glyph of target.querySelectorAll('.u4d-ink-glyph')) {
        const y = glyph.offsetTop;
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push({ x: glyph.offsetLeft, y, w: glyph.offsetWidth, h: glyph.offsetHeight });
    }
    const rows = [...lines.values()].filter(row => row.length >= 3);
    if (!rows.length) return;
    const layer = overlay(target, 'u4d-correction-effects', target.clientWidth, target.scrollHeight);
    const random = seededRandom(`correction:${target.textContent}:${seed}`);
    const segment = (row, start, length) => {
        const a = row[Math.min(start, row.length - 3)], b = row[Math.min(row.length - 1, start + length - 1)];
        return { x: a.x - 2, y: a.y + a.h * 0.54, w: Math.max(20, b.x + b.w - a.x + 3), h: a.h };
    };
    if (strike) {
        const box = segment(rows[0], 2 + Math.floor(random() * 2), 4);
        const group = node('g', { class: 'u4d-strike-marks', stroke: ink, fill: 'none', 'stroke-linecap': 'round', opacity: 0.55 + strike * 0.4 }, layer);
        node('path', { d: `M${box.x},${box.y + 2} q${box.w * 0.4},-3 ${box.w + 4},-1`, 'stroke-width': 0.8 + strike * 0.8 }, group);
        if (strike > 0.4) node('path', { d: `M${box.x + box.w + 1},${box.y + 3} q${-box.w * 0.45},1 ${-box.w - 2},-1`, 'stroke-width': 0.6 + strike * 0.5 }, group);
    }
    if (scribble) {
        const row = rows[Math.min(1, rows.length - 1)];
        const box = segment(row, rows.length > 1 ? 1 : Math.max(0, row.length - 5), 4);
        const group = node('g', { class: 'u4d-scribble-marks', fill: 'none', stroke: ink, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.45 + scribble * 0.5 }, layer);
        for (let pass = 0; pass < 3; pass++) {
            const points = Array.from({length: 64}, (_, i) => {
                const t = i / 63, angle = t * Math.PI * (12.5 + pass) + pass * 0.7;
                const advance = pass === 1 ? 1 - t : t;
                return [box.x + box.w * advance + Math.cos(angle) * box.h * 0.29 + (random() - 0.5) * 4,
                    box.y + Math.sin(angle) * box.h * (0.23 + random() * 0.18) + (random() - 0.5) * 3];
            });
            let d = `M${points[0].join(',')}`;
            for (let i = 1; i < points.length - 1; i++) {
                const a=points[i], b=points[i+1];
                d += ` Q${a.join(',')} ${(a[0]+b[0])/2},${(a[1]+b[1])/2}`;
            }
            node('path', { d, 'stroke-width': (0.65 + scribble * 0.85) * (0.75 + random() * 0.45) }, group);
        }
        node('path', { d: `M${box.x - 3},${box.y + 4} q${box.w * 0.3},-10 ${box.w + 6},-5`, 'stroke-width': 0.8 }, group);
    }
}

export function applyPaperEffects(sheet, target, options = {}) {
    const values = Object.fromEntries(['water', 'blood', 'strike', 'scribble'].map(key => [key, bounded(options[key])]));
    values.waterScene = Object.hasOwn(STAIN_SCENARIOS.water, options.waterScene) ? options.waterScene : 'spill';
    values.bloodScene = Object.hasOwn(STAIN_SCENARIOS.blood, options.bloodScene) ? options.bloodScene : 'smear';
    values.seed = Number(options.seed) || 0;
    values.ink = options.ink || '#263d56';
    sheet.querySelectorAll('.u4d-paper-effects').forEach(n => n.remove());
    if (values.water || values.blood) paperStains(sheet, values);
    strikeAndScribble(target, values);
}
