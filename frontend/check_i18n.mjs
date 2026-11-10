// Verifies that every t.key used in the sources exists in en, fr and ar.
import { readFileSync, readdirSync } from "node:fs";
import I18N from "./src/i18n.js";
const used = new Set();
for (const f of readdirSync("./src").filter((f) => f.endsWith(".jsx")))
  for (const m of readFileSync("./src/" + f, "utf8").matchAll(/\bt\.([a-z_0-9]+)/g)) used.add(m[1]);
["kind_tutor", "kind_quiz", "kind_peer", "kind_arena", "motivate_start", "motivate_streak", "motivate_quiz_good", "motivate_keep"].forEach((k) => used.add(k));
let bad = 0;
for (const [l, d] of Object.entries(I18N)) for (const k of used) if (!(k in d)) { console.log("MISSING", l, k); bad++; }
const ks = Object.keys(I18N.en);
for (const l of ["fr", "ar"]) for (const k of ks) if (!(k in I18N[l])) { console.log("MISSING", l, k); bad++; }
console.log(bad ? "FAIL" : "i18n OK (" + used.size + " keys used)");
process.exit(bad ? 1 : 0);
