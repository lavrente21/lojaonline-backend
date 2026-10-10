'use strict';
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..');
const roots = ['lojaonline-main', 'lojaonline-admin-main', 'lojaonline-backend-main'];
const ignoreDirs = new Set(['node_modules', '.git', 'coverage', '.netlify']);
const ignoreFiles = new Set(['package-lock.json']);
const findings = [];
const secretPatterns = [
  { name: 'chave privada PEM', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'token tipo JWT literal', regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/ },
  { name: 'chave de API CJ', regex: /\b(?:CJ_API_KEY|BUCKYDROP_APPSECRET|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i },
  { name: 'credencial Stripe secreta', regex: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'chave Resend', regex: /\bre_[A-Za-z0-9_]{24,}\b/ }
];
function visit(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(repo, full);
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) visit(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.toLowerCase().endsWith('.zip')) {
      findings.push(`${rel}: ZIP não permitido dentro das pastas de aplicação.`);
      continue;
    }
    if (entry.name === '.env' || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) {
      findings.push(`${rel}: ficheiro de ambiente real não permitido no repositório.`);
      continue;
    }
    if (ignoreFiles.has(entry.name) || /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|pdf|mp4)$/i.test(entry.name)) continue;
    let content;
    try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
    for (const p of secretPatterns) if (p.regex.test(content)) findings.push(`${rel}: possível ${p.name}.`);
  }
}
for (const root of roots) visit(path.join(repo, root));
if (findings.length) {
  console.error('CHECK DE SEGREDOS: FALHOU. Não são apresentados valores detetados.');
  for (const f of [...new Set(findings)]) console.error(`- ${f}`);
  process.exitCode = 1;
} else {
  console.log('CHECK DE SEGREDOS: passou nas verificações regex e ZIP das três pastas. Não substitui Gitleaks/TruffleHog nem análise do histórico Git.');
}
