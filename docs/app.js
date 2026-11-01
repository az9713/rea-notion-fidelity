(() => {
  // src/core.mjs
  var FORMAT = "research-block-fidelity";
  var LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, documentBytes: 2 * 1024 * 1024, depth: 40, documentDepth: 36, nodes: 1e5, documentNodes: 45e3, blocks: 2e3, text: 1e5, runs: 1e3 });
  var TYPES = Object.freeze(["paragraph", "heading_1", "heading_2", "heading_3", "quote", "bulleted_list_item", "numbered_list_item", "equation"]);
  var COLORS = Object.freeze(["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red", ...["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"].map((c) => c + "_background")]);
  var FLAGS = ["bold", "italic", "strikethrough", "underline", "code"];
  var BAD = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  var obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var own = (o, k) => Object.hasOwn(o, k);
  var clone = (v) => structuredClone(v);
  var pointer = (segments) => segments.length ? "/" + segments.map((s) => String(s).replaceAll("~", "~0").replaceAll("/", "~1")).join("/") : "";
  function fail(message) {
    throw new Error(message);
  }
  function validString(s) {
    if (s.length > LIMITS.text) fail("String exceeds the 100,000-code-unit limit.");
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 55296 && c <= 56319) {
        const n = s.charCodeAt(++i);
        if (!(n >= 56320 && n <= 57343)) fail("Ill-formed Unicode surrogate rejected.");
      } else if (c >= 56320 && c <= 57343) fail("Ill-formed Unicode surrogate rejected.");
    }
    return s;
  }
  function parseJSON(text2, scope = "input") {
    if (typeof text2 !== "string" || new TextEncoder().encode(text2).byteLength > LIMITS.bytes) fail("JSON exceeds the 5 MiB input limit.");
    let i = 0, nodes = 0;
    const ws = () => {
      while (/[\x20\n\r\t]/.test(text2[i] ?? "!")) i++;
    };
    function str() {
      const start = i++;
      let closed = false;
      while (i < text2.length) {
        const c = text2[i++];
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) fail("Unterminated JSON string.");
      return validString(JSON.parse(text2.slice(start, i)));
    }
    function value(depth) {
      if (depth > (scope === "document" ? LIMITS.documentDepth : LIMITS.depth) || ++nodes > (scope === "document" ? LIMITS.documentNodes : LIMITS.nodes)) fail("JSON depth or node limit exceeded.");
      ws();
      const c = text2[i];
      if (c === '"') return str();
      if (c === "{") {
        i++;
        ws();
        const out = /* @__PURE__ */ Object.create(null);
        if (text2[i] === "}") {
          i++;
          return out;
        }
        while (true) {
          ws();
          if (text2[i] !== '"') fail("Expected an object key.");
          const k = str();
          if (BAD.has(k)) fail(`Unsafe object key rejected: ${k}`);
          if (own(out, k)) fail(`Duplicate object key rejected: ${k}`);
          ws();
          if (text2[i++] !== ":") fail("Expected colon.");
          out[k] = value(depth + 1);
          ws();
          if (text2[i] === "}") {
            i++;
            return out;
          }
          if (text2[i++] !== ",") fail("Expected object comma.");
        }
      }
      if (c === "[") {
        i++;
        ws();
        const out = [];
        if (text2[i] === "]") {
          i++;
          return out;
        }
        while (true) {
          out.push(value(depth + 1));
          ws();
          if (text2[i] === "]") {
            i++;
            return out;
          }
          if (text2[i++] !== ",") fail("Expected array comma.");
        }
      }
      for (const [literal, v] of [["true", true], ["false", false], ["null", null]]) if (text2.startsWith(literal, i)) {
        i += literal.length;
        return v;
      }
      const match = text2.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) fail("Invalid JSON value.");
      i += match[0].length;
      const num = Number(match[0]);
      if (!Number.isFinite(num) || Number.isInteger(num) && !Number.isSafeInteger(num) || Object.is(num, -0)) fail("Non-finite, negative-zero or unsafe integer JSON number rejected.");
      return num;
    }
    const result = value(0);
    ws();
    if (i !== text2.length) fail("Unexpected trailing JSON data.");
    return result;
  }
  function bounded(value) {
    return parseJSON(JSON.stringify(value), "document");
  }
  function rootEntries(document2) {
    if (Array.isArray(document2)) return document2.map((b, i) => ({ b, path: [i] }));
    if (obj(document2) && document2.object === "list" && Array.isArray(document2.results)) return document2.results.map((b, i) => ({ b, path: ["results", i] }));
    if (obj(document2) && typeof document2.type === "string") return [{ b: document2, path: [] }];
    fail("Import a block, block array, or Notion list object with a results array. Page exports and Markdown are not block JSON.");
  }
  function childEntries(b, path) {
    const body = b[b.type];
    if (own(b, "children") && own(body, "children")) fail("Ambiguous child storage: both block.children and type.children exist.");
    const key = own(b, "children") ? ["children"] : own(body, "children") ? [b.type, "children"] : null;
    if (!key) return [];
    let children = b;
    for (const k of key) children = children[k];
    if (!Array.isArray(children)) fail("children must be an array of blocks.");
    return children.map((child, i) => ({ b: child, path: [...path, ...key, i] }));
  }
  function blockEntries(document2) {
    const entries = [];
    function walk({ b, path }, depth) {
      if (!obj(b) || typeof b.type !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(b.type) || !obj(b[b.type])) fail(`Invalid block shape at ${pointer(path)}.`);
      if (entries.length >= LIMITS.blocks) fail("Block limit exceeded (2,000).");
      const supported = TYPES.includes(b.type);
      const entry = { block: b, path, depth, supported };
      entries.push(entry);
      if (supported) for (const child of childEntries(b, path)) walk(child, depth + 1);
    }
    for (const e of rootEntries(document2)) walk(e, 0);
    return entries;
  }
  function validateDocument(document2) {
    if (new TextEncoder().encode(JSON.stringify(document2)).byteLength > LIMITS.documentBytes) fail("Document exceeds the 2 MiB compact JSON limit; native projects reserve room for the baseline.");
    const safe = bounded(document2);
    blockEntries(safe);
    return safe;
  }
  function importDocument(text2) {
    const parsed = parseJSON(text2);
    if (obj(parsed) && parsed.format === FORMAT) {
      if (parsed.version !== 1 || !own(parsed, "document") || !own(parsed, "baseline")) fail("Unsupported native project version/shape.");
      const keys = Object.keys(parsed);
      if (keys.some((k) => !["format", "version", "baseline", "document"].includes(k))) fail("Unknown native envelope field; refuse to silently discard it.");
      validateDocument(parsed.baseline);
      validateDocument(parsed.document);
      return parsed;
    }
    const document2 = validateDocument(parsed);
    return { format: FORMAT, version: 1, baseline: clone(document2), document: document2 };
  }
  function nativeJSON(project2) {
    return JSON.stringify(project2) + "\n";
  }
  function blockJSON(project2) {
    return JSON.stringify(project2.document) + "\n";
  }
  function at(document2, path) {
    let target = document2;
    for (const k of path) {
      if (!Array.isArray(target) && !obj(target)) fail("Stale block path.");
      if (!own(target, k) || BAD.has(String(k))) fail("Invalid block path.");
      target = target[k];
    }
    return target;
  }
  function editableRun(run) {
    if (!obj(run)) return { ok: false, reason: "Malformed rich-text object; preserved opaque." };
    if (run.type === "text" && obj(run.text) && typeof run.text.content === "string") return { ok: true, kind: "text", value: run.text.content };
    if (run.type === "equation" && obj(run.equation) && typeof run.equation.expression === "string") return { ok: true, kind: "equation", value: run.equation.expression };
    return { ok: false, reason: `${run.type ?? "unknown"} rich-text is opaque; no flattening.` };
  }
  function editRun(project2, path, index, value, annotations = null) {
    validString(value);
    const next = clone(project2);
    const b = at(next.document, path);
    if (!TYPES.includes(b.type) || b.type === "equation") fail("Block is opaque or not a rich-text block.");
    const runs = b[b.type].rich_text;
    if (!Array.isArray(runs) || runs.length > LIMITS.runs || !Number.isInteger(index) || index < 0 || index >= runs.length) fail("Invalid rich-text run index or bounds.");
    const run = runs[index], editable = editableRun(run);
    if (!editable.ok) fail(editable.reason);
    if (own(run, "plain_text") && typeof run.plain_text !== "string") fail("Malformed cached plain_text cannot be safely rewritten.");
    if (value.length > (editable.kind === "text" ? 2e3 : 1e3)) fail("Edited text/equation exceeds the documented request-value length. No automatic splitting.");
    run[editable.kind][editable.kind === "text" ? "content" : "expression"] = value;
    if (own(run, "plain_text")) run.plain_text = value;
    if (annotations !== null) {
      if (!obj(annotations)) fail("Annotations must be an object.");
      if (own(run, "annotations") && !obj(run.annotations)) fail("Malformed annotations are opaque; cannot rewrite.");
      run.annotations ??= {};
      for (const [k, v] of Object.entries(annotations)) {
        if (FLAGS.includes(k) && typeof v === "boolean") run.annotations[k] = v;
        else if (k === "color" && COLORS.includes(v)) run.annotations.color = v;
        else fail("Unsupported annotation edit.");
      }
    }
    validateDocument(next.document);
    return next;
  }
  function editEquation(project2, path, value) {
    validString(value);
    if (value.length > 1e3) fail("Equation exceeds the 1,000-code-unit edit limit.");
    const next = clone(project2), b = at(next.document, path);
    if (b.type !== "equation" || typeof b.equation.expression !== "string") fail("Equation block is not editable.");
    b.equation.expression = value;
    validateDocument(next.document);
    return next;
  }
  function appendBlock(project2, type) {
    if (!TYPES.includes(type)) fail("Unsupported new block type.");
    const next = clone(project2);
    const b = { object: "block", type, [type]: type === "equation" ? { expression: "E = mc^2" } : { rich_text: [{ type: "text", text: { content: "New research note", link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }], color: "default" } };
    if (Array.isArray(next.document)) next.document.push(b);
    else if (next.document.object === "list") next.document.results.push(b);
    else fail("Single-block document: import an array/list to append peers.");
    validateDocument(next.document);
    return next;
  }
  function semanticDiff(before, after) {
    const result = [];
    function walk(a, b, path) {
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (obj(a) && obj(b)) {
        for (const key of /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (!own(a, key)) result.push({ path: pointer([...path, key]), change: "added", after: b[key] });
          else if (!own(b, key)) result.push({ path: pointer([...path, key]), change: "removed", before: a[key] });
          else walk(a[key], b[key], [...path, key]);
        }
      } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        for (let i = 0; i < a.length; i++) walk(a[i], b[i], [...path, i]);
      } else result.push({ path: pointer(path), change: "changed", before: a, after: b });
    }
    walk(before, after, []);
    return result;
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  var mdEscape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/[\\`*_{}\[\]()#+\-.!|$~]/g, "\\$&").replaceAll("\r", "&#13;").replaceAll("\n", "  \n");
  function safeURL(value) {
    if (typeof value !== "string" || /[\x00-\x20\x7f]/.test(value)) return null;
    try {
      const u = new URL(value);
      return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  }
  function projectExport(document2, format) {
    if (!["markdown", "html"].includes(format)) fail("Unknown projection format.");
    const html = format === "html", losses = [], represented = /* @__PURE__ */ new Set(), messages = [], entries = blockEntries(document2);
    const mark = (p) => represented.add(pointer(p));
    const issue = (p, reason, severity = "loss") => losses.push({ path: pointer(p), severity, reason });
    function leaves(v, p) {
      if (Array.isArray(v)) {
        if (!v.length) issue(p, "Empty array has no recoverable representation.", "structure");
        for (let i = 0; i < v.length; i++) leaves(v[i], [...p, i]);
      } else if (obj(v)) {
        if (!Object.keys(v).length) issue(p, "Empty object has no recoverable representation.", "structure");
        for (const [k, val] of Object.entries(v)) leaves(val, [...p, k]);
      } else if (!represented.has(pointer(p))) issue(p, "Field is retained in native JSON but omitted from this projection.");
    }
    function rich(run, p) {
      const editable = editableRun(run);
      let value;
      if (!editable.ok) {
        issue(p, "Opaque rich-text object becomes a visible placeholder; its payload is not exported.");
        return html ? '<span class="opaque">[opaque rich text]</span>' : "[opaque rich text]";
      }
      const kind = editable.kind, key = kind === "text" ? "content" : "expression";
      mark([...p, "type"]);
      mark([...p, kind, key]);
      if (own(run, "plain_text")) {
        if (run.plain_text === editable.value) mark([...p, "plain_text"]);
        else issue([...p, "plain_text"], "Cached plain_text contradicts content/expression and is not trusted.");
      }
      if (kind === "equation") {
        issue([...p, "equation", "expression"], "LaTeX source is emitted without math rendering or semantic validation.", "transform");
        value = html ? `<code class="math">${escapeHTML(editable.value)}</code>` : `[LaTeX source: ${mdEscape(editable.value)}]`;
      } else value = html ? escapeHTML(editable.value).replaceAll("\n", "<br>") : mdEscape(editable.value);
      if (editable.value.includes("\n") || editable.value.includes("\r")) issue([...p, kind, key], "Text line breaks use projection syntax; original rich-text run boundaries require native JSON.", "transform");
      const ann = obj(run.annotations) ? run.annotations : {};
      for (const flag of FLAGS) {
        if (own(ann, flag)) {
          if (typeof ann[flag] !== "boolean") {
            issue([...p, "annotations", flag], "Malformed annotation is not interpreted.");
            continue;
          }
          mark([...p, "annotations", flag]);
          if (ann[flag]) {
            if (html) {
              const tag = { bold: "strong", italic: "em", strikethrough: "s", underline: "u", code: "code" }[flag];
              value = `<${tag}>${value}</${tag}>`;
            } else if (flag === "underline" || flag === "strikethrough" || flag === "code") {
              issue([...p, "annotations", flag], `${flag} is omitted by this conservative CommonMark projection.`);
            } else value = (flag === "bold" ? "**" : "*") + value + (flag === "bold" ? "**" : "*");
          } else issue([...p, "annotations", flag], "Explicit false annotation is implicit in the projection; field presence is not retained.", "structure");
        }
      }
      if (own(ann, "color")) {
        mark([...p, "annotations", "color"]);
        issue([...p, "annotations", "color"], ann.color === "default" ? "Explicit default color is implicit; field presence is not retained." : "Notion text/background color is omitted by this portable projection.", ann.color === "default" ? "structure" : "loss");
      }
      const link = obj(run.text?.link) ? run.text.link.url : null;
      if (run.type === "text" && own(run.text, "link")) {
        if (run.text.link === null) {
          mark([...p, "text", "link"]);
          issue([...p, "text", "link"], "Explicit null link is omitted; field presence is not retained.", "structure");
        } else if (safeURL(link)) {
          mark([...p, "text", "link", "url"]);
          if (safeURL(link) !== link) issue([...p, "text", "link", "url"], "URL is normalized by the browser URL parser.", "transform");
          value = html ? `<a href="${escapeHTML(safeURL(link))}" rel="noopener noreferrer">${value}</a>` : `[${value}](<${safeURL(link).replaceAll("<", "%3C").replaceAll(">", "%3E")}>)`;
        } else issue([...p, "text", "link"], "Unsafe or unsupported URL is retained only in native JSON; never activated.");
      }
      if (own(run, "href")) {
        mark([...p, "href"]);
        issue([...p, "href"], "Cached href field is omitted; text.link is authoritative for this projection.", "structure");
      }
      return value;
    }
    function render2({ b, path }, depth = 0) {
      if (!TYPES.includes(b.type)) {
        issue(path, `Opaque ${b.type} block is a placeholder; all original fields remain in native JSON.`);
        return html ? `<aside class="opaque">[Opaque ${escapeHTML(b.type)} block \u2014 see native JSON]</aside>` : `[Opaque ${mdEscape(b.type)} block \u2014 see native JSON]`;
      }
      mark([...path, "type"]);
      const body = b[b.type], bodyPath = [...path, b.type];
      let text2;
      if (b.type === "equation") {
        if (typeof body.expression !== "string") {
          issue(bodyPath, "Malformed equation body; not rendered.");
          text2 = "[Malformed equation]";
        } else {
          mark([...bodyPath, "expression"]);
          issue([...bodyPath, "expression"], "Equation is exported as escaped LaTeX source, without rendering/validation.", "transform");
          text2 = html ? `<pre class="math">${escapeHTML(body.expression)}</pre>` : `[LaTeX source]

${body.expression.split(/\r?\n/).map((line) => "    " + line).join("\n")}`;
        }
      } else {
        if (!Array.isArray(body.rich_text) || body.rich_text.length > LIMITS.runs) {
          issue([...bodyPath, "rich_text"], "Missing, malformed or oversized rich text is an opaque placeholder.");
          text2 = "[Opaque rich text]";
        } else {
          text2 = body.rich_text.map((run, i) => rich(run, [...bodyPath, "rich_text", i])).join("");
          issue([...bodyPath, "rich_text"], "Rich-text object/run segmentation is not recoverable from this projection.", "structure");
        }
        if (html) {
          const tag = { paragraph: "p", heading_1: "h1", heading_2: "h2", heading_3: "h3", quote: "blockquote", bulleted_list_item: "li", numbered_list_item: "li" }[b.type];
          text2 = `<${tag}>${text2}</${tag}>`;
          if (b.type.endsWith("list_item")) text2 = `<${b.type === "numbered_list_item" ? "ol" : "ul"}>${text2}</${b.type === "numbered_list_item" ? "ol" : "ul"}>`;
        } else {
          const prefix = { paragraph: "", heading_1: "# ", heading_2: "## ", heading_3: "### ", quote: "> ", bulleted_list_item: "- ", numbered_list_item: "1. " }[b.type];
          text2 = prefix + text2;
        }
      }
      if (own(body, "color")) {
        mark([...bodyPath, "color"]);
        issue([...bodyPath, "color"], "Explicit block color field is omitted.");
      }
      const children = childEntries(b, path);
      if (b.has_children === true && !children.length) issue([...path, "has_children"], "Child content was not included. Retrieve children recursively/paginate before claiming a complete document.", "incomplete");
      if (children.length) {
        issue(path, "Nested child content is emitted after its parent; native parent-child identity/layout is not preserved.", "structure");
        text2 += "\n\n" + children.map((e) => render2(e, depth + 1)).join("\n\n");
      }
      return text2;
    }
    let content = rootEntries(document2).map((e) => render2(e)).join("\n\n");
    leaves(document2, []);
    if (obj(document2) && document2.has_more === true) {
      issue(["has_more"], "Input is a partial paginated response; additional blocks are missing.", "incomplete");
      messages.push("Partial response: has_more=true. This app does not fetch missing pages.");
    }
    if (html) content = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Research block projection</title><style>body{max-width:850px;margin:3rem auto;padding:1rem;font:18px/1.7 system-ui;color:#e4eaf4;background:#111822}a{color:#9dccfa}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}.opaque{border:1px dashed #ab8753;padding:1rem}blockquote{border-left:3px solid #8dc4c0;padding-left:1rem}li{margin:.3rem 0}</style></head><body>
${content}
</body></html>
`;
    const unique = [...new Map(losses.map((x) => [`${x.path}|${x.severity}|${x.reason}`, x])).values()];
    return { content, report: { format, contract: "Portable projection produced by this app; not Notion-flavored Markdown, a Notion write payload, or a reversible export.", blockCount: entries.length, losses: unique, messages, nativeRecommendation: "Save the native .fidelity.json project to retain all imported JSON values and baseline edits." } };
  }

  // src/fixture.mjs
  var annotation = (extra = {}) => ({ bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default", ...extra });
  var text = (content, extra = {}) => ({ type: "text", text: { content, link: null }, annotations: annotation(), plain_text: content, href: null, ...extra });
  var block = (type, payload, id) => ({ object: "block", id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, created_time: "2026-10-31T12:00:00.000Z", has_children: false, type, [type]: payload });
  var fixture = { object: "list", type: "block", block: {}, has_more: false, next_cursor: null, synthetic_fixture: true, results: [
    block("heading_1", { rich_text: [text("Research survives format changes.")], color: "default", is_toggleable: false }, 1),
    block("paragraph", { rich_text: [text("The interesting part is not the text. ", { annotations: annotation({ bold: true }) }), text("It is what the text carries.", { annotations: annotation({ italic: true, color: "blue" }) })], color: "default", future_payload: { method: "synthetic", revision: 7 } }, 2),
    block("quote", { rich_text: [text("A conversion is a model of a document, not the document itself.", { annotations: annotation({ underline: true }) })], color: "yellow_background" }, 3),
    { ...block("bulleted_list_item", { rich_text: [text("Preserve the original structured evidence.")], color: "default", children: [block("paragraph", { rich_text: [text("Nested observations retain their identities in native JSON.")], color: "default" }, 5)] }, 4), has_children: true },
    block("numbered_list_item", { rich_text: [text("Inspect exactly which fields a portable export omits.")], color: "default" }, 6),
    block("paragraph", { rich_text: [text("Inline relation: "), { type: "equation", equation: { expression: "\\nabla\\cdot\\mathbf{E}=\\rho/\\varepsilon_0" }, annotations: annotation(), plain_text: "\\nabla\\cdot\\mathbf{E}=\\rho/\\varepsilon_0", href: null }, text(" ; synthetic reference: "), { type: "mention", mention: { type: "page", page: { id: "00000000-0000-4000-8000-000000000099" } }, annotations: annotation(), plain_text: "Imaginary field notes", href: null }], color: "default" }, 7),
    block("equation", { expression: "i\\hbar\\frac{\\partial}{\\partial t}\\Psi=\\hat{H}\\Psi" }, 8),
    block("callout", { rich_text: [text("This unsupported callout remains an opaque JSON object.")], icon: { type: "emoji", emoji: "!" }, color: "gray_background", future_setting: { preserve_me: true } }, 9),
    block("paragraph", { rich_text: [text("Official block schema", { text: { content: "Official block schema", link: { url: "https://developers.notion.com/reference/block" } }, href: "https://developers.notion.com/reference/block" })], color: "default" }, 10)
  ] };

  // src/app.mjs
  var $ = (s) => document.querySelector(s);
  var project = importDocument(JSON.stringify(fixture));
  var selected = 0;
  var history = [];
  var saved = nativeJSON(project);
  var projection = "html";
  var el = (tag, text2, cls) => {
    const n = document.createElement(tag);
    if (text2 !== void 0) n.textContent = text2;
    if (cls) n.className = cls;
    return n;
  };
  var notify = (text2, error = false) => {
    $("#notice").textContent = text2;
    $("#notice").className = error ? "notice error" : "notice";
  };
  var button = (text2, fn, cls) => {
    const n = el("button", text2, cls);
    n.type = "button";
    n.onclick = fn;
    return n;
  };
  function commit(next, message = "Edit applied. Native JSON retains unknown fields.") {
    history.push(clone(project));
    if (history.length > 20) history.shift();
    project = next;
    notify(message);
    render();
  }
  function action(fn) {
    try {
      fn();
    } catch (error) {
      notify(error.message, true);
    }
  }
  function download(name, text2, type = "application/json") {
    const url = URL.createObjectURL(new Blob([text2], { type }));
    const a = el("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  }
  function load(text2) {
    const next = importDocument(text2);
    if (nativeJSON(project) !== saved && !confirm("Replace the current document and discard unsaved in-memory edits? Save a native project first to preserve them.")) return;
    history = [];
    project = next;
    selected = 0;
    saved = nativeJSON(next);
    $("#json-input").value = "";
    notify("Imported locally. No credentials, upload or Notion connection.");
    render();
  }
  function renderOutline(entries) {
    const list = $("#outline");
    list.replaceChildren();
    entries.forEach((entry, i) => {
      const b = entry.block;
      const summary = b.type === "equation" ? b.equation.expression : Array.isArray(b[b.type].rich_text) ? b[b.type].rich_text.map((r) => editableRun(r).value ?? `[${r?.type ?? "opaque"}]`).join("") : JSON.stringify(b[b.type]);
      const item = button("", () => {
        selected = i;
        render();
      }, `outline-item ${i === selected ? "selected" : ""}`);
      item.setAttribute("aria-pressed", String(i === selected));
      item.style.paddingLeft = `${14 + Math.min(entry.depth, 8) * 13}px`;
      item.append(el("span", b.type, "block-type"), el("span", summary?.slice(0, 80) ?? "Opaque block", "block-snippet"));
      if (!entry.supported) item.append(el("span", "OPAQUE", "small-badge"));
      list.append(item);
    });
  }
  function renderEditor(entry) {
    const root = $("#editor");
    root.replaceChildren();
    if (!entry) {
      root.append(el("p", "No blocks yet. Add a block to begin."));
      return;
    }
    const { block: b, path, supported } = entry;
    root.append(el("div", `${b.type} \xB7 ${pointer(path) || "(root)"}`, "eyebrow"), el("h2", supported ? "Edit the known fields." : "Opaque means untouched."));
    if (!supported) {
      root.append(el("p", "This block is preserved as an opaque JSON object. Its fields and nested content are not interpreted, rendered or editable. Native project/API-shaped JSON export retains it.", "muted"));
      const pre = el("pre", JSON.stringify(b, null, 2));
      root.append(pre);
      return;
    }
    const body = b[b.type];
    if (b.type === "equation") {
      if (typeof body.expression !== "string") {
        root.append(el("p", "Malformed equation body: retained but not editable.", "warning"));
        return;
      }
      const label = el("label", "LaTeX source (not rendered/validated)");
      const input = el("textarea");
      input.value = body.expression;
      input.maxLength = 1e3;
      input.id = "equation-input";
      label.append(input);
      root.append(label, button("Apply equation", () => action(() => commit(editEquation(project, path, input.value)))));
      return;
    }
    if (!Array.isArray(body.rich_text) || body.rich_text.length > LIMITS.runs) {
      root.append(el("p", "Malformed or oversized rich_text is retained opaque. Edit through a valid source export.", "warning"));
      return;
    }
    if (!body.rich_text.length) root.append(el("p", "This block has an empty rich_text array. Its empty state is preserved; add a separate block to write text.", "muted"));
    body.rich_text.forEach((run, index) => {
      const card = el("div", void 0, "run-card");
      const info = editableRun(run);
      card.append(el("div", `RUN ${index + 1} \xB7 ${info.kind ?? run?.type ?? "unknown"}`, "eyebrow"));
      if (!info.ok) {
        card.append(el("p", info.reason, "warning"), el("pre", JSON.stringify(run, null, 2)));
        root.append(card);
        return;
      }
      const label = el("label", info.kind === "equation" ? "Inline LaTeX source" : "Text content");
      const input = el("textarea");
      input.value = info.value;
      input.maxLength = info.kind === "text" ? 2e3 : 1e3;
      input.dataset.run = String(index);
      input.setAttribute("aria-label", `Run ${index + 1} content`);
      label.append(input);
      card.append(label);
      const controls = el("div", void 0, "annotations");
      const changes = {};
      const annotations = run.annotations;
      if (annotations === void 0 || annotations !== null && typeof annotations === "object" && !Array.isArray(annotations)) {
        for (const [flag, name] of [["bold", "Bold"], ["italic", "Italic"], ["underline", "Underline"], ["strikethrough", "Strike"], ["code", "Code"]]) {
          const check = el("input");
          check.type = "checkbox";
          check.checked = annotations?.[flag] === true;
          check.onchange = () => {
            changes[flag] = check.checked;
          };
          const wrapper = el("label", name);
          wrapper.prepend(check);
          controls.append(wrapper);
        }
        const color = el("select");
        color.setAttribute("aria-label", `Run ${index + 1} color`);
        for (const value of COLORS) {
          const option = el("option", value);
          option.value = value;
          color.append(option);
        }
        if (COLORS.includes(annotations?.color)) color.value = annotations.color;
        color.onchange = () => {
          changes.color = color.value;
        };
        controls.append(color);
      } else card.append(el("p", "Malformed annotations are preserved; formatting controls disabled.", "warning"));
      card.append(controls, button("Apply run", () => action(() => commit(editRun(project, path, index, input.value, Object.keys(changes).length ? changes : null))), "primary"));
      if (run.text?.link !== void 0) card.append(el("p", `Link metadata retained: ${JSON.stringify(run.text.link)}`, "muted tiny"));
      const details2 = el("details");
      details2.append(el("summary", "All original run fields"), el("pre", JSON.stringify(run, null, 2)));
      card.append(details2);
      root.append(card);
    });
    const details = el("details");
    details.append(el("summary", "Complete block JSON (read only)"), el("pre", JSON.stringify(b, null, 2)));
    root.append(details);
  }
  function renderReports() {
    const format = $("#export-format").value;
    const result = projectExport(project.document, format);
    const report = $("#loss-report");
    report.replaceChildren();
    $("#loss-count").textContent = String(result.report.losses.length);
    $("#projection-name").textContent = format === "html" ? "HTML projection" : "CommonMark projection";
    const critical = result.report.losses.filter((l) => l.severity === "incomplete");
    $("#coverage").textContent = critical.length ? "Incomplete source content" : "Imported content only";
    $("#coverage").className = critical.length ? "warning" : "muted";
    for (const loss of result.report.losses.slice(0, 160)) {
      const row = el("li");
      row.append(el("code", loss.path || "(root)"), el("span", loss.reason), el("small", loss.severity));
      report.append(row);
    }
    if (result.report.losses.length > 160) report.append(el("li", `Showing first 160 of ${result.report.losses.length}. Download the full report for every field.`));
    const changes = semanticDiff(project.baseline, project.document);
    $("#diff-count").textContent = String(changes.length);
    const diff = $("#diff");
    diff.replaceChildren();
    if (!changes.length) diff.append(el("p", "No semantic changes since import.", "muted"));
    else for (const change of changes.slice(0, 100)) {
      const row = el("div", void 0, "diff-row");
      row.append(el("code", change.path || "(root)"), el("pre", JSON.stringify(change, null, 2)));
      diff.append(row);
    }
    if (projection === "html") {
      $("#preview-frame").hidden = false;
      $("#markdown-preview").hidden = true;
      $("#preview-frame").srcdoc = projectExport(project.document, "html").content;
    } else {
      $("#preview-frame").hidden = true;
      $("#markdown-preview").hidden = false;
      $("#markdown-preview").textContent = projectExport(project.document, "markdown").content;
    }
    $("#undo").disabled = !history.length;
    $("#dirty").textContent = nativeJSON(project) === saved ? "Native project is saved/imported" : "Unsaved in-memory edits";
  }
  function render() {
    const entries = blockEntries(project.document);
    selected = Math.min(selected, Math.max(0, entries.length - 1));
    $("#block-count").textContent = String(entries.length);
    $("#opaque-count").textContent = String(entries.filter((e) => !e.supported).length);
    renderOutline(entries);
    renderEditor(entries[selected]);
    renderReports();
  }
  $("#import-json").onclick = () => action(() => load($("#json-input").value));
  $("#open-file").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > LIMITS.bytes) throw Error("File exceeds 5 MiB.");
      load(await file.text());
    } catch (error) {
      notify(error.message, true);
    } finally {
      event.target.value = "";
    }
  };
  $("#load-demo").onclick = () => load(JSON.stringify(fixture));
  $("#undo").onclick = () => {
    if (history.length) {
      project = history.pop();
      notify("Previous in-memory state restored.");
      render();
    }
  };
  $("#save-project").onclick = () => action(() => {
    const text2 = nativeJSON(project);
    download("research-notes.fidelity.json", text2);
    saved = text2;
    notify("Native project downloaded with original baseline and all current JSON fields.");
    renderReports();
  });
  $("#export-json").onclick = () => download("research-blocks.json", blockJSON(project));
  $("#download-report").onclick = () => download("projection-loss-report.json", JSON.stringify(projectExport(project.document, $("#export-format").value).report, null, 2));
  $("#export-portable").onclick = () => action(() => {
    const format = $("#export-format").value, result = projectExport(project.document, format);
    if (!$("#accept-loss").checked) throw Error("Review the report and acknowledge projection losses before downloading.");
    download(format === "html" ? "research-projection.html" : "research-projection.md", result.content, format === "html" ? "text/html" : "text/markdown");
    notify(`Downloaded ${format}; save the separate loss report and native project to retain provenance.`);
  });
  $("#export-format").onchange = () => {
    $("#accept-loss").checked = false;
    renderReports();
  };
  $("#preview-mode").onchange = () => {
    projection = $("#preview-mode").value;
    renderReports();
  };
  $("#add-block").onclick = () => action(() => commit(appendBlock(project, $("#add-type").value), "New block appended. Undo is available."));
  for (const type of TYPES) {
    const option = el("option", type);
    option.value = type;
    $("#add-type").append(option);
  }
  window.addEventListener("beforeunload", (event) => {
    if (nativeJSON(project) !== saved) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  render();
})();
