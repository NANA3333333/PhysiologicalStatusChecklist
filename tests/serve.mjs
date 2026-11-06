import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
// Optional personal font trial files are deliberately outside the plugin/release.
const personalFonts = fileURLToPath(new URL("../../../work/preview-private-fonts/", import.meta.url));
const personalNames = new Set(["SentyFountainPen.ttf", "HanyiSentyJournal.ttf"]);
const prefix = "/scripts/extensions/third-party/UnknownFourDimensionalStatusPanel/";
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".png": "image/png", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };
createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname.startsWith("/personal-font-trial/")) {
            const name = url.pathname.slice("/personal-font-trial/".length);
            if (!personalNames.has(name)) { res.writeHead(404).end(); return; }
            const body = await readFile(path.join(personalFonts, name));
            res.writeHead(200, { "Content-Type": "font/ttf", "Cache-Control": "no-store" });
            res.end(body); return;
        }
        const relative = url.pathname === "/" ? "tests/host.html" : url.pathname === "/script.js" ? "tests/host-script.js" :
            url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : url.pathname.slice(1);
        const file = path.resolve(root, relative);
        if (!file.startsWith(root) || relative.split(/[\\/]/).includes(".git")) { res.writeHead(403).end(); return; }
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(body);
    } catch { res.writeHead(404).end(); }
}).listen(4186, "127.0.0.1", () => console.log("Status QA: http://127.0.0.1:4186"));
