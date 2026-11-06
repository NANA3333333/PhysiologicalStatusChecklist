import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright-core");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const output = process.env.QA_OUTPUT || "../../work/status-qa";
await mkdir(output, { recursive: true });
const checks = [];
try {
    await page.goto("http://127.0.0.1:4186");
    await page.waitForFunction(() => window.ready);
    const fold = page.locator(".u4d-status-fold");
    assert.equal(await fold.count(), 1);
    assert.equal(await fold.evaluate(node => node.open), false);
    assert.doesNotMatch(await page.locator(".mes_text").innerText(), /STATUS|末梢触觉仍保留/);
    await fold.locator("summary").click();
    assert.match(await fold.locator("pre").innerText(), /末梢触觉仍保留/);
    await fold.locator("summary").click();
    const state = await page.evaluate(async () => {
        await window.emit("MESSAGE_RECEIVED", 2);
        await window.emit("CHARACTER_MESSAGE_RENDERED", 2);
        const chat = window.context.chat.map(m => ({ role: m.is_user ? "user" : "assistant", content: m.mes }));
        await window.emit("GENERATION_STARTED");
        chat.unshift({ role: "system", content: window.prompts.u4d_status_panel_prompt });
        await window.emit("CHAT_COMPLETION_PROMPT_READY", { chat });
        return { chat, saved: window.context.chat, reads: window.memoryReads, requests: window.requests };
    });
    assert.match(state.chat[0].content, /\[STATUS: 字段=值/);
    assert.doesNotMatch(JSON.stringify(state.chat), /末梢触觉仍保留|旧剧情记忆/);
    assert.doesNotMatch(JSON.stringify(state.reads), /STATUS|末梢触觉仍保留|旧剧情记忆/);
    assert.ok(state.saved[2].extra.u4d_status_fields);
    assert.equal(state.requests.length, 0);
    checks.push("folded fields, narrative isolation, memory/vector listener ordering, no extra model call");

    await page.locator("#u4d-status-launcher").click();
    assert.match(await page.locator("#u4d-inspection-root").innerText(), /肢端冰冷/);
    assert.equal(await page.locator(".u4d-date-ledger-row[data-day-key]").count(), 2);
    assert.ok(await page.locator(".u4d-ink-glyph").count() > 100);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
    const glyphs = await page.locator(".u4d-ink-glyph").evaluateAll(nodes => nodes.map(node => node.style.cssText));
    await page.reload(); await page.waitForFunction(() => window.ready);
    assert.equal(await page.locator(".u4d-status-fold").count(), 1);
    await page.locator("#u4d-status-launcher").click();
    assert.deepEqual(await page.locator(".u4d-ink-glyph").evaluateAll(nodes => nodes.map(node => node.style.cssText)), glyphs);
    checks.push("persist/reload, complete history despite pagination, stable handwriting");

    // Use the actual zoom and drag interactions, with enough viewport room for a close-up.
    await page.setViewportSize({ width: 2200, height: 1800 });
    await page.locator(".u4d-date-sheet .u4d-sheet-close").focus();
    await page.keyboard.press("Enter");
    for (let i = 0; i < 8; i++) await page.locator(".u4d-report-stack").first().dispatchEvent("wheel", { deltaY: -100, bubbles: true });
    const header = await page.locator(".u4d-case-header").first().boundingBox();
    await page.mouse.move(header.x + 80, header.y + 10);
    await page.mouse.down(); await page.mouse.move(100, 100, { steps: 5 }); await page.mouse.up();
    await page.mouse.move(0, 0);
    await page.locator(".u4d-exam-sheet").first().screenshot({ path: `${output}/paper-detail.png` });
    await page.reload(); await page.waitForFunction(() => window.ready);
    await page.locator("#u4d-status-launcher").click();
    for (const [width, height] of [[375, 812], [768, 1024], [1280, 900], [1920, 1080]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(80);
        for (const box of await page.locator(".u4d-inspection-window").evaluateAll(nodes => nodes.filter(n => !n.hidden).map(n => ({ x: n.getBoundingClientRect().x, right: n.getBoundingClientRect().right }))))
            assert.ok(box.x >= -1 && box.right <= width + 1, `paper fits ${width}px: ${JSON.stringify(box)}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (width === 375) await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
    }
    checks.push("375/768/1280/1920px responsive paper layout");

    const firstDay = page.locator('.u4d-date-ledger-row[data-day-key="story:1"]');
    await firstDay.focus(); await firstDay.press("Enter");
    assert.match(await page.locator(".u4d-report-meta").innerText(), /第1天/);
    await page.locator(".u4d-status-fold summary").click();
    await page.waitForTimeout(50);
    assert.match(await page.locator(".u4d-report-meta").innerText(), /第1天/);
    // Reopening intentionally returns to the latest record.
    await page.keyboard.press("Escape"); await page.locator("#u4d-status-launcher").click();
    assert.match(await page.locator(".u4d-report-meta").innerText(), /第2天/);
    checks.push("historical date selection survives chat DOM updates and keyboard navigation");

    await page.evaluate(async () => {
        const m = window.context.chat[2];
        m.swipe_id = 0;
        m.swipes = [m.mes, "他已恢复温暖。\n[STATUS: 日期=第2天·午后 | 体温=正常 | 身体=体温恢复]"];
        m.swipe_info = [{ extra: structuredClone(m.extra) }, {}];
        await window.emit("GENERATION_ENDED");
        m.swipe_id = 1; m.mes = m.swipes[1]; m.extra = structuredClone(m.swipe_info[1].extra);
        window.renderChat(); await window.emit("MESSAGE_SWIPED", 2);
    });
    await page.waitForFunction(() => document.querySelector(".u4d-lined-value")?.textContent === "体温恢复");
    assert.doesNotMatch(await page.locator(".u4d-status-fold pre").textContent(), /肢端冰冷/);
    await page.evaluate(async () => {
        window.context.chat[2].mes = "修改后的普通正文。";
        window.renderChat(); await window.emit("MESSAGE_EDITED", 2);
    });
    assert.equal(await page.locator(".u4d-status-fold").count(), 0);
    assert.doesNotMatch(await page.locator("#u4d-inspection-root").innerText(), /体温恢复/);
    checks.push("reroll, per-swipe fields, edit invalidation");

    await page.evaluate(async () => {
        window.context.chat.push({ name: "Orion", mes: '正常正文。\n[STATUS:\n日期=第3天 | 身体=<img src=x onerror=alert(1)>\n]' });
        window.renderChat(); await window.emit("MESSAGE_RECEIVED", 3);
    });
    assert.equal(await page.locator(".u4d-status-fold img").count(), 0);
    assert.equal(await page.locator(".u4d-date-ledger-row[data-day-key]").count(), 2);
    await page.evaluate(() => {
        window.context.chat.push({ name: "Orion", mes: "流式正文。\n[STATUS: 体温=偏低" });
        window.renderChat();
    });
    await page.waitForTimeout(50);
    assert.match(await page.evaluate(() => window.context.chat.at(-1).mes), /STATUS/);
    assert.doesNotMatch(await page.locator(".mes_text").innerText(), /STATUS/);
    await page.evaluate(async () => {
        window.context.chat.at(-1).mes += "]";
        window.renderChat(); await window.emit("MESSAGE_RECEIVED", 4);
    });
    assert.equal(await page.evaluate(() => window.context.chat.at(-1).mes), "流式正文。");
    await page.evaluate(async () => {
        window.context.chat.at(-1).mes = `流式正文。\n[STATUS: 体温=偏低，${"长备注可滚动。".repeat(40)}]`;
        window.renderChat(); await window.emit("MESSAGE_EDITED", 4);
    });
    const longNote = page.locator(".u4d-checklist-note").first();
    assert.ok(await longNote.evaluate(node => node.scrollHeight > node.clientHeight));
    await longNote.dispatchEvent("wheel", { deltaY: 100, bubbles: true });
    assert.ok(await longNote.evaluate(node => node.scrollTop > 0));
    checks.push("streaming does not rewrite unfinished host messages; long notes remain scrollable");
    await page.evaluate(async () => {
        window.context.chat = [{ name: "Orion", mes: "新聊天的正文。" }];
        window.context.chatId = "new"; window.context.chatMetadata = {};
        window.renderChat(); await window.emit("CHAT_CHANGED");
    });
    assert.equal(await page.locator(".u4d-status-fold").count(), 0);
    assert.equal(await page.locator(".u4d-date-ledger-row[data-day-key]").count(), 0);
    await page.evaluate(async () => {
        window.characters[0].data.extensions.u4d_status_panel = { enabled: false };
        await window.emit("GENERATION_STARTED");
    });
    assert.equal(await page.evaluate(() => window.prompts.u4d_status_panel_prompt), "");
    checks.push("multiline parsing, safe text rendering, chat switch isolation");
    assert.deepEqual(errors, []);
    await writeFile(`${output}/browser-results.json`, JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2));
    console.log(`Browser checks passed: ${checks.join("; ")}`);
} finally { await browser.close(); }
