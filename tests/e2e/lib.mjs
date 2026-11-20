// Gemeinsame Hilfsfunktionen für die Browser-Tests (Edge headless über DevTools-Protokoll)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function startBrowser(
  OUT,
  PORT,
  { mobile = true, dark = false, extraArgs = [] } = {},
) {
  mkdirSync(OUT, { recursive: true });
  // Edge-Pfad (Windows-Standard); anderer Browser auf Chromium-Basis: Umgebungsvariable EDGE_PATH
  const EDGE =
    process.env["EDGE_PATH"] ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const edge = spawn(EDGE, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(OUT, "profile")}`,
    "--no-first-run",
    "--disable-extensions",
    ...extraArgs,
    "about:blank",
  ]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(
        (t) => t.type === "page",
      );
    } catch {
      // Browser noch nicht bereit – gleich nochmal versuchen
    }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let nextId = 1;
  const pending = new Map();
  const problems = [];
  const dialogs = [];
  const results = [];
  const hooks = {};
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (hooks.onMessage) void hooks.onMessage(msg);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === "Page.javascriptDialogOpening") {
      dialogs.push(msg.params.message);
      ws.send(
        JSON.stringify({
          id: nextId++,
          method: "Page.handleJavaScriptDialog",
          params: { accept: true },
        }),
      );
    }
    if (msg.method === "Runtime.exceptionThrown")
      problems.push(
        "EXCEPTION: " +
          msg.params.exceptionDetails.text +
          " " +
          (msg.params.exceptionDetails.exception?.description ?? ""),
      );
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type))
      problems.push("CONSOLE: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level))
      problems.push(
        `LOG ${msg.params.entry.source}: ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`,
      );
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, (m) =>
        m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result),
      );
      ws.send(JSON.stringify({ id, method, params }));
    });
  const shot = async (name) => {
    await sleep(400);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, name + ".png"), Buffer.from(data, "base64"));
  };
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      console.log(results.join("\n"));
      await shot("fehler");
      throw new Error(
        "Eval: " +
          JSON.stringify(r.exceptionDetails.exception?.description) +
          "\n  bei: " +
          expr.slice(0, 160),
      );
    }
    return r.result.value;
  };
  const helpers = `
    window.__t = {
      scope: () => document.querySelector('[role=dialog]') ?? document,
      btn: (text) => [...__t.scope().querySelectorAll('button')].find(b => b.textContent.replace(/\\u00AD/g, '').trim().replace(/^[0-9]+/, '') === text || b.getAttribute('aria-label') === text),
      click: (text) => { const b = __t.btn(text); if (!b) throw new Error('Knopf fehlt: ' + text); b.click(); },
      nav: (text) => { const b = [...document.querySelectorAll('nav button')].find(b => b.textContent.replace(/\\u00AD/g, '').trim().replace(/^[0-9]+/, '') === text); b.click(); },
      setEl: (el, value) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
      set: (label, value) => { const l = [...__t.scope().querySelectorAll('label')].find(l => l.querySelector('span')?.textContent.trim().startsWith(label)); if (!l) throw new Error('Feld fehlt: ' + label); __t.setEl(l.querySelector('input,select,textarea'), value); },
      aria: (label, value) => { const el = __t.scope().querySelector('[aria-label="' + label + '"]'); if (!el) throw new Error('aria fehlt: ' + label); __t.setEl(el, value); },
      radio: (text) => { const b = [...__t.scope().querySelectorAll('[role=radio]')].find(b => b.textContent.replace(/\\u00AD/g, '').trim() === text); if (!b) throw new Error('Auswahl fehlt: ' + text); b.click(); },
      text: () => document.body.innerText.replace(/\\u00AD/g, ''),
      dialogText: () => __t.scope().innerText.replace(/\\u00AD/g, ''),
      rows: () => [...document.querySelectorAll('main li')].map(l => l.innerText.replace(/\\n/g, ' ')).join(' | '),
      bg: (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor,
    };`;
  const step = async (code, wait = 350) => {
    await evaluate(code);
    await sleep(wait);
  };
  const check = async (name, expr) =>
    results.push(`${(await evaluate(expr)) ? "OK  " : "FAIL"} ${name}`);
  const open = async (url) => {
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("DOM.enable");
    await send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: join(OUT, "downloads"),
    });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile,
    });
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }],
    });
    await send("Page.navigate", { url });
    await sleep(2500);
    await evaluate(helpers);
  };
  const reload = async () => {
    await send("Page.reload");
    await sleep(2000);
    await evaluate(helpers);
  };
  const finish = () => {
    console.log(results.join("\n"));
    console.log(
      "\nKonsole/CSP-Probleme: " + (problems.length ? "\n  " + problems.join("\n  ") : "keine"),
    );
    ws.close();
    edge.kill();
  };
  return Object.assign(hooks, {
    send,
    evaluate,
    step,
    check,
    shot,
    open,
    reload,
    finish,
    results,
    dialogs,
    problems,
    sleep,
  });
}
