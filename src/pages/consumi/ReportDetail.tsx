import React from 'react';
import { motion } from 'framer-motion';
import { Download, FileText } from 'lucide-react';
import { DetailScaffold, IntervalKey, PreviewDataNotice } from './shared';

const PDF_REPORTS = [
  { id: 'pdf-1', name: 'Report Consumi Marzo 2026', date: '31 Mar 2026' },
  { id: 'pdf-2', name: 'Analisi Efficienza Acqua', date: '28 Mar 2026' },
  { id: 'pdf-3', name: 'Sintesi Gas Settimanale', date: '27 Mar 2026' },
  { id: 'pdf-4', name: 'Bilancio Energetico Casa', date: '25 Mar 2026' },
  { id: 'pdf-5', name: 'Confronto Tariffe Energia', date: '21 Mar 2026' },
];

export function ReportDetail({
  title,
  interval: _interval,
  onIntervalChange: _onIntervalChange,
  onBack,
}: {
  title: string;
  interval: IntervalKey;
  onIntervalChange: (value: IntervalKey) => void;
  onBack: () => void;
}) {
  const left = (
    <div className="relative h-full w-full overflow-hidden rounded-[1.5rem] bg-[#07131f] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2)_0%,#07131f_74%)]">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.02)_44%,rgba(15,23,42,0.22)_100%)]" />

      <motion.div
        className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-white/20 bg-white/10 backdrop-blur-xl"
        animate={{ boxShadow: ['0 0 0 rgba(56,189,248,0)', '0 0 40px rgba(56,189,248,0.38)', '0 0 0 rgba(56,189,248,0)'] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="flex h-full w-full items-center justify-center text-sky-200">
          <FileText size={112} />
        </div>
      </motion.div>

      <p className="absolute bottom-6 left-6 text-sm text-white/65">Archivio report scaricabili</p>
    </div>
  );

  const right = (
    <>
      <PreviewDataNotice>
        L’archivio seguente è un esempio visivo: i PDF non sono ancora generati dai dati reali.
      </PreviewDataNotice>
      <div className="rounded-[2rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-bg-elevated)] p-5 backdrop-blur-2xl shadow-[var(--ui-shadow-card)]">
      <p className="mb-4 text-sm font-medium uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">PDF Disponibili</p>
      <div className="space-y-3">
        {PDF_REPORTS.map((report) => (
          <button
            key={report.id}
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-4 py-3 text-left opacity-70"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[color:var(--ui-text-primary)]">{report.name}</p>
                <p className="text-xs text-[color:var(--ui-text-tertiary)]">{report.date}</p>
              </div>
              <Download size={16} className="text-[color:var(--ui-text-secondary)]" />
            </div>
          </button>
        ))}
      </div>
      </div>
    </>
  );

  return <DetailScaffold title={title} onBack={onBack} left={left} right={right} />;
}

export default ReportDetail;
