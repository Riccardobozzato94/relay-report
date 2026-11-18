// Test della logica del Worker con un mock di env.AI.
import fs from 'fs';
let src = fs.readFileSync('C:/Users/ric/Projects/portfolio-saas/relay-report/worker/index.js','utf8');
fs.writeFileSync('C:/Users/ric/AppData/Local/Temp/opencode/worker-test.mjs', src);
const { default: worker } = await import('file:///C:/Users/ric/AppData/Local/Temp/opencode/worker-test.mjs');

function mockAI(mode) {
  return {
    async run(model, input) {
      const prompt = input.messages[0].content;
      const m = prompt.match(/sessioni (\d+) \(mese scorso (\d+)\), conversioni (\d+), spesa (\d+) euro, CPA ([\d.]+)/);
      if (!m) return { response: 'nessun dato' };
      const [, sess, prec, conv, spend, cpa] = m;
      if (mode === 'bad-json') return { response: 'qui non cè alcun oggetto json' };
      if (mode === 'wrong-numbers') return { response: JSON.stringify({ narrativa:['Sessioni: 999999.'], flag:'', prossimo_passo:'x' }) };
      const calo = Number(sess) < Number(prec);
      return { response: JSON.stringify({
        narrativa: [`Sessioni: ${sess}.`, `Conversioni: ${conv}.`, `CPA: ${cpa} €.`],
        flag: calo ? 'Sessioni in calo.' : '',
        prossimo_passo: 'Verificare i canali.'
      }) };
    }
  };
}

async function call(path, mode) {
  const req = new Request('https://test.workers.dev' + path);
  const res = await worker.fetch(req, { AI: mockAI(mode) });
  return { status: res.status, body: await res.json() };
}

for (const mode of ['valid','wrong-numbers','bad-json']) {
  const r = await call('/api/eval', mode);
  console.log('\nMOCK:', mode);
  console.log('  accuracy:', r.body.accuracy_percent + '%',
              '| casi perfetti:', r.body.passed_cases + '/10',
              '| fallback:', r.body.fallback_cases,
              '| latenza:', r.body.total_latency_ms + 'ms');
  if (mode === 'valid') console.log('  primo risultato:', JSON.stringify(r.body.results[0].checks));
}
const h = await call('/api/health','valid');
console.log('\nHEALTH:', JSON.stringify(h.body));
