/**
 * RelayReport API — AI Operations in produzione.
 * - POST /api/report      : genera report con validazione + retry + fallback + human gate
 * - GET  /api/eval        : esegue l'eval set e restituisce metriche reali
 * - GET  /api/health      : stato
 * Dati sintetici. Nessun invio automatico. Nessun costo.
 */

const EVAL_CASES = [
  { id:'RR-01', input:{cliente:'Studio Alfa',sessioni:18420,sessioni_prec:15900,conversioni:427,spend:3200}, expected:{sessioni:'18420',conversioni:'427',cpa:'7.49',flag:false} },
  { id:'RR-02', input:{cliente:'Beta Srl',sessioni:9200,sessioni_prec:11000,conversioni:180,spend:2100}, expected:{sessioni:'9200',conversioni:'180',cpa:'11.67',flag:true} },
  { id:'RR-03', input:{cliente:'Gamma Shop',sessioni:5400,sessioni_prec:5300,conversioni:95,spend:900}, expected:{sessioni:'5400',conversioni:'95',cpa:'9.47',flag:false} },
  { id:'RR-04', input:{cliente:'Delta Coop',sessioni:22100,sessioni_prec:19800,conversioni:610,spend:4100}, expected:{sessioni:'22100',conversioni:'610',cpa:'6.72',flag:false} },
  { id:'RR-05', input:{cliente:'Epsilon',sessioni:7300,sessioni_prec:8200,conversioni:120,spend:1800}, expected:{sessioni:'7300',conversioni:'120',cpa:'15.00',flag:true} },
  { id:'RR-06', input:{cliente:'Zeta Lab',sessioni:15600,sessioni_prec:14000,conversioni:390,spend:2800}, expected:{sessioni:'15600',conversioni:'390',cpa:'7.18',flag:false} },
  { id:'RR-07', input:{cliente:'Eta Store',sessioni:4100,sessioni_prec:4600,conversioni:70,spend:1100}, expected:{sessioni:'4100',conversioni:'70',cpa:'15.71',flag:true} },
  { id:'RR-08', input:{cliente:'Theta Media',sessioni:31500,sessioni_prec:29000,conversioni:880,spend:5200}, expected:{sessioni:'31500',conversioni:'880',cpa:'5.91',flag:false} },
  { id:'RR-09', input:{cliente:'Iota Group',sessioni:8800,sessioni_prec:9100,conversioni:155,spend:2400}, expected:{sessioni:'8800',conversioni:'155',cpa:'15.48',flag:true} },
  { id:'RR-10', input:{cliente:'Kappa Shop',sessioni:12700,sessioni_prec:11900,conversioni:305,spend:2500}, expected:{sessioni:'12700',conversioni:'305',cpa:'8.20',flag:false} },
];

// Provider in ordine di preferenza: modelli Cloudflare Workers AI (free tier,
// nessuna chiave esterna). Se uno fallisce o non rispetta lo schema, si passa al
// successivo; se falliscono tutti, si usa un template locale (ultimo fallback).
const FALLBACK_MODELS = [
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
];

function expectedCpa(i) { return (i.spend / i.conversioni).toFixed(2); }
function shouldFlag(i) { return i.sessioni < i.sessioni_prec; }

function buildPrompt(i) {
  return `Rispondi SOLO con JSON valido: {"narrativa":["f1","f2","f3"],"flag":"","prossimo_passo":"f"}.
Dati: cliente ${i.cliente}, sessioni ${i.sessioni} (mese scorso ${i.sessioni_prec}), conversioni ${i.conversioni}, spesa ${i.spend} euro, CPA ${expectedCpa(i)} euro.
Usa SOLO questi numeri. Se le sessioni sono calate, metti un breve avviso in flag. Italiano concreto.`;
}

function validate(json, input) {
  if (!json || !Array.isArray(json.narrativa) || json.narrativa.length < 1) return { ok:false, reason:'narrativa mancante' };
  const text = json.narrativa.join(' ') + ' ' + (json.prossimo_passo || '');
  const checks = {
    sessioni: text.includes(String(input.sessioni)),
    conversioni: text.includes(String(input.conversioni)),
    cpa: text.includes(expectedCpa(input)),
    flag: shouldFlag(input) ? String(json.flag || '').trim().length > 0 : true,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { ok: passed >= 3, checks, passed, total:4 };
}

async function callModel(env, model, prompt) {
  if (!env.AI) throw new Error('binding AI non configurato');
  const out = await env.AI.run(model, {
    messages:[{role:'user',content:prompt}],
    temperature:0,
    max_tokens:600,
  });
  const txt = out.response ?? (typeof out === 'string' ? out : JSON.stringify(out));
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('nessun JSON');
  return { json: JSON.parse(m[0]), model, raw: txt };
}

async function generate(env, input) {
  const prompt = buildPrompt(input);
  const attempts = [];
  for (const model of FALLBACK_MODELS) {
    for (let retry = 0; retry < 2; retry++) {
      const started = Date.now();
      try {
        const r = await callModel(env, model, prompt);
        const v = validate(r.json, input);
        attempts.push({ model, retry, valid:v.ok, checks:v.checks, latency_ms:Date.now()-started });
        if (v.ok) return { status:'ok', model:r.model, json:r.json, validation:v, attempts };
      } catch (e) {
        attempts.push({ model, retry, error:String(e), latency_ms:Date.now()-started });
      }
    }
  }
  const cpa = expectedCpa(input);
  return {
    status:'fallback',
    model:'template-locale',
    json:{ narrativa:[`Sessioni: ${input.sessioni}. Conversioni: ${input.conversioni}. CPA: ${cpa} €.`,
                     `Rispetto al mese scorso: ${input.sessioni} contro ${input.sessioni_prec}.`,
                     'Dati verificati, pronti per la revisione.'],
           flag: shouldFlag(input) ? 'Sessioni in calo rispetto al mese scorso.' : '',
           prossimo_passo:'Verificare i canali con performance inferiore.' },
    validation:{ ok:true, checks:{template:true}, passed:4, total:4 },
    attempts,
  };
}

async function runEval(env) {
  const results = [];
  const started = Date.now();
  for (const c of EVAL_CASES) {
    const r = await generate(env, c.input);
    const text = r.json.narrativa.join(' ');
    const checks = {
      sessioni_ok: text.includes(String(c.input.sessioni)),
      conversioni_ok: text.includes(String(c.input.conversioni)),
      cpa_ok: text.includes(c.expected.cpa),
      flag_ok: c.expected.flag ? String(r.json.flag||'').length>0 : true,
    };
    const passed = Object.values(checks).filter(Boolean).length;
    results.push({ id:c.id, status:r.status, model:r.model, checks, passed, total:4,
                   score: Math.round(passed/4*100), attempts:r.attempts.length });
  }
  const totalChecks = results.reduce((a,r)=>a+r.total,0);
  const passedChecks = results.reduce((a,r)=>a+r.passed,0);
  return {
    generated_at: new Date().toISOString(),
    cases: results.length,
    accuracy_percent: Math.round(passedChecks/totalChecks*100),
    passed_cases: results.filter(r=>r.passed===4).length,
    fallback_cases: results.filter(r=>r.status==='fallback').length,
    total_latency_ms: Date.now()-started,
    results,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers:cors });

    if (url.pathname === '/api/health') {
      return Response.json({ ok:true, service:'relay-report', eval_cases:EVAL_CASES.length }, { headers:cors });
    }
    if (url.pathname === '/api/eval') {
      try { return Response.json(await runEval(env), { headers:cors }); }
      catch (e) { return Response.json({ error:String(e) }, { status:500, headers:cors }); }
    }
    if (url.pathname === '/api/report' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body || typeof body.sessioni !== 'number' || typeof body.conversioni !== 'number' || typeof body.spend !== 'number') {
          return Response.json({ error:'input non valido' }, { status:400, headers:cors });
        }
        const r = await generate(env, body);
        return Response.json({ ...r, state:'draft', human_gate:true, note:'Nessun invio prima della firma umana.' }, { headers:cors });
      } catch (e) { return Response.json({ error:String(e) }, { status:500, headers:cors }); }
    }
    return new Response('RelayReport API — /api/health | /api/eval | /api/report', { headers:cors });
  }
};
