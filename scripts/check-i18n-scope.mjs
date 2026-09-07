import fs from 'node:fs';
import path from 'node:path';

const roots = [
  'src/components/dashboard',
  'src/components/widgets',
  'src/components/settings',
  'src/components/security',
  'src/components/apps',
];
const italian = /[àèéìòùÀÈÉÌÒÙ]|\b(?:Aggiungi|Annulla|Apri|Attività|Batteria|Cancella|Cerca|Chiudi|Conferma|Connessione|Dispositivo|Elimina|Entità|Imposta|Impostazioni|Modalità|Modifica|Nessun[aoie]?|Rimuovi|Ripristina|Salva|Scegli|Seleziona|Sensore|Serratura|Sistema|Stato|Telecamera|Ultim[aoie]?|Visualizza)\b/u;
const ignoredFiles = [
  /\.test\.[tj]sx?$/,
  /Settings/,
  /Mock\.[tj]sx?$/i,
  /ComingSoonAppDemo\.tsx$/,
  /irrigationConfigurationModel\.ts$/,
];
const findings = [];

function visit(target) {
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const fullPath = path.join(target, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (/\.[tj]sx?$/.test(entry.name) && !ignoredFiles.some((rule) => rule.test(entry.name))) {
      fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).forEach((line, index) => {
        if (italian.test(line) && !line.includes("t('") && !line.includes('t("') && !line.includes('i18n-audit-ignore')) {
          findings.push(`${fullPath}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

roots.forEach((root) => visit(root));
if (findings.length) {
  console.error(`Found ${findings.length} possible untranslated UI lines in the multilingual scope:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('No obvious untranslated Italian UI strings found in the multilingual scope.');
}
