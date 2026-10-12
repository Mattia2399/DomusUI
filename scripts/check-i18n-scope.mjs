import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const roots = ['src/components', 'src/pages'];
const ignoredFiles = [
  /\.test\.[tj]sx?$/,
  /fixtures?\.[tj]sx?$/,
  /Mock\.[tj]sx?$/i,
  // Development-only visual lab, loaded exclusively behind import.meta.env.DEV.
  /GridTestView\.tsx$/,
];
const translatedCalls = new Set([
  't',
  'c',
  'cl',
  'translateConsumption',
  'translateConsumptionLoose',
  'translateForLocale',
  'bt',
]);
const italian = /[àèéìòùÀÈÉÌÒÙ]|\b(?:Abbiamo|Aggiungi|Alcun[oaie]?|Annulla|Apri|Attività|Avanti|Batteria|Cancella|Casa|Cerca|Chiudi|Completa|Conferma|Configurazione|Configura|Consumi|Contatore|Correggi|Dati|Dettagli|Dispositiv[oi]|Energia|Entità|Fatto|Fotovoltaico|Impianto|Imposta|Impostazioni|Indietro|Lettura|Modalità|Modifica|Nessun[oaie]?|Potenza|Produzione|Rete|Rilevamento|Rimuovi|Ripristina|Salva|Scelgo|Scegli|Seleziona|Sensore|Sensori|Serratura|Sistema|Stato|Storico|Tariffa|Telecamera|Ultim[oaie]?|Verifica|Visualizza)\b/u;
const findings = [];

function filesIn(target) {
  if (!fs.existsSync(target)) return [];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(target, entry.name);
    if (entry.isDirectory() && fullPath.replaceAll('\\', '/').endsWith('src/components/site')) return [];
    if (entry.isDirectory()) return filesIn(fullPath);
    if (!/\.[tj]sx?$/.test(entry.name) || ignoredFiles.some((rule) => rule.test(entry.name))) return [];
    return [fullPath];
  });
}

function callName(node) {
  if (!ts.isCallExpression(node)) return undefined;
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return undefined;
}

function isInsideTranslation(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current) && translatedCalls.has(callName(current))) return true;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isSourceFile(current)) return false;
  }
  return false;
}

function isStructuralLiteral(node) {
  const parent = node.parent;
  return (
    ts.isImportDeclaration(parent)
    || ts.isExportDeclaration(parent)
    || ts.isLiteralTypeNode(parent)
    || (ts.isPropertyAssignment(parent) && parent.name === node)
    || (ts.isPropertySignature(parent) && parent.name === node)
    || (ts.isElementAccessExpression(parent) && parent.argumentExpression === node)
  );
}

function isInsideJsx(node) {
  if (ts.isJsxText(node)) return true;
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current) || ts.isJsxExpression(current)) return true;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isSourceFile(current)) return false;
  }
  return false;
}

function literalText(node) {
  if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('…');
  }
  return '';
}

function isCandidate(node) {
  if (!(ts.isJsxText(node) || ts.isStringLiteralLike(node) || ts.isTemplateExpression(node))) return false;
  if (!isInsideJsx(node) || isInsideTranslation(node) || isStructuralLiteral(node)) return false;
  return italian.test(literalText(node).replace(/\s+/g, ' ').trim());
}

for (const file of roots.flatMap(filesIn)) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (isCandidate(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const value = literalText(node).replace(/\s+/g, ' ').trim();
      findings.push(`${file}:${position.line + 1}:${position.character + 1}: ${value}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (findings.length) {
  console.error(`Found ${findings.length} possible untranslated Italian UI strings:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('No obvious untranslated Italian UI strings found in components or pages.');
}
