const fs = require('fs');
const path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');
const startMarker = '{modoMixto && formData.almacenId && (\n          <motion.div className="md:col-span-2 bg-slate-100';
const startMarker2 = '{modoMixto && formData.almacenId && (\n          <div className="md:col-span-2 bg-slate-100';
const endMarker = '\n        <div>\n          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Motivo *</label>';

let i0 = content.indexOf(startMarker2);
if (i0 < 0) i0 = content.indexOf(startMarker);
if (i0 < 0) {
  console.error('start not found');
  process.exit(1);
}
const i1 = content.indexOf(endMarker, i0);
if (i1 < 0) {
  console.error('end not found');
  process.exit(1);
}

const replacement = `{modoMixto && formData.almacenId && (
          <div className="md:col-span-2 bg-slate-100 rounded-xl p-5 border border-slate-200 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 text-center">Resumen total de la salida</p>
            <p className="text-[11px] font-bold text-slate-600 text-center uppercase tracking-wide">
              Envases seleccionados: {resumenEnvases.count} | Kg envases: {formatNumber(resumenEnvases.totalPeso, 2)} kg
            </p>
            <p className="text-[11px] font-bold text-slate-600 text-center uppercase tracking-wide">
              Kg sin etiquetar: {formatNumber(resumenSinEtiqueta.totalKg, 2)} kg
            </p>
            <p className="text-sm font-black text-sleek-danger text-center uppercase tracking-widest pt-1 border-t border-slate-200">
              Total a descontar: {formatNumber(resumenTotal.pesoTotalKg, 2)} kg
            </p>
          </div>
        )}`;

content = content.slice(0, i0) + replacement + content.slice(i1);
fs.writeFileSync(path, content);
console.log('ok');
