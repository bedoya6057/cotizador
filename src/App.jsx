import React, { useState, useMemo, useEffect } from 'react';
import { 
  Upload, CheckCircle, Search, Wrench, Cpu, Database, Download, AlertTriangle, FileSpreadsheet,
  Hash, X, Layers, Activity, Zap, RefreshCw, BrainCircuit, Eye, ClipboardList, Trash2,
  RotateCcw, Check, FileCheck, Calendar, Clock, MessageSquare, Package, FilePlus,
  Archive, SearchCode, History, ThumbsDown, FileSearch, Loader2, Eraser, Edit3, Save, User,
  FileDigit, FileJson, CheckSquare, ArrowRightCircle, FileOutput
} from 'lucide-react';

// --- CONFIGURACIÓN DE LIBRERÍAS EXTERNAS ---
const XLSX_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const MAMMOTH_SCRIPT_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
const SUPABASE_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

// --- CREDENCIALES DEL PROYECTO (SUPABASE) ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ""; 
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ""; 

// RECUERDA: Coloca tu API Key de Gemini aquí para que el "cerebro" funcione en tu servidor
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ""; 

/**
 * Agente Web Electromecánico v15.0
 * Sistema de conciliación técnica con memoria compartida en Supabase.
 */
export default function App() {
  // --- 1. ESTADOS PRINCIPALES ---
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('analysis'); // Vistas: analysis, history, tarifario
  const [results, setResults] = useState([]);
  const [searchTerm, setSearchTerm] = useState(""); 
  const [errorMsg, setErrorMsg] = useState(null);
  const [libLoaded, setLibLoaded] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState(null);
  
  // Datos locales de archivos
  const [tarifario, setTarifario] = useState([]);
  const [tarifarioFileName, setTarifarioFileName] = useState(null);
  const [reportText, setReportText] = useState("");
  const [reportFileName, setReportFileName] = useState(null);
  const [cotFileName, setCotFileName] = useState(null);

  // Memoria en la nube
  const [otHistory, setOtHistory] = useState([]); 
  const [learningLog, setLearningLog] = useState([]); 
  const [currentSourceContent, setCurrentSourceContent] = useState(null); 
  
  // Estados de Modales
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showRegenerationModal, setShowRegenerationModal] = useState(false);
  const [correctingId, setCorrectingId] = useState(null);
  const [manualSearch, setManualSearch] = useState("");
  const [generalRejectionText, setGeneralRejectionText] = useState("");
  const [selectedHistoryOT, setSelectedHistoryOT] = useState(null);

  const [diagnostics, setDiagnostics] = useState([]);
  const addLog = (msg) => setDiagnostics(prev => [...prev.slice(-4), { msg, time: new Date().toLocaleTimeString() }]);

  const [globalFichero, setGlobalFichero] = useState({
    ot: "", fecha: "", hora: "", causa: "", cantidad: "1"
  });

  // --- 2. UTILIDADES DE APOYO ---
  const approvedCount = useMemo(() => {
    return Array.isArray(results) ? results.filter(r => r.selected).length : 0;
  }, [results]);

  const normalize = (val) => {
    if (!val) return "";
    return val.toString().trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });

  const toggleSelect = (uid) => {
    setResults(prev => prev.map(r => r.uid === uid ? { ...r, selected: !r.selected } : r));
  };

  const removeResult = (uid) => {
    setResults(prev => prev.filter(r => r.uid !== uid));
  };

  const openCorrection = (uid) => {
    setCorrectingId(uid);
    setManualSearch("");
    setShowCorrectionModal(true);
  };

  const applyCorrection = (newPartida) => {
    setResults(prev => prev.map(r => r.uid === correctingId ? { ...r, info: newPartida, selected: true } : r));
    setShowCorrectionModal(false);
  };

  // --- 3. INICIALIZACIÓN DE LIBRERÍAS Y SINCRONIZACIÓN ---
  useEffect(() => {
    const initApp = async () => {
      const loadScript = (url) => new Promise((res) => {
        if (document.querySelector(`script[src="${url}"]`)) return res();
        const s = document.createElement("script"); s.src = url; s.onload = res; document.body.appendChild(s);
      });

      try {
        await Promise.all([
          loadScript(XLSX_SCRIPT_URL), 
          loadScript(MAMMOTH_SCRIPT_URL),
          loadScript(SUPABASE_SCRIPT_URL)
        ]);

        if (window.supabase) {
          const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          setSupabaseClient(client);
          syncCloudData(client);
        }
        setLibLoaded(true);
      } catch (e) {
        setErrorMsg("Error al conectar con las librerías del sistema.");
      }
    };
    initApp();
  }, []);

  const syncCloudData = async (client) => {
    try {
        const { data: history } = await client.from('ot_history').select('*').order('created_at', { ascending: false });
        if (history) setOtHistory(history);
        const { data: rules } = await client.from('learning_rules').select('*');
        if (rules) setLearningLog(rules);
    } catch (e) {
        console.error("Error al sincronizar con la base de datos Supabase.");
    }
  };

  // --- 4. MOTOR DE LÓGICA DE IA ---
  const callGemini = async (payload, maxRetries = 3) => {
    if (!GEMINI_API_KEY) {
      throw new Error("Falta la GEMINI_API_KEY. Configúrala al inicio del archivo.");
    }
    
    // Fallback de modelos: Si uno falla, intenta con el siguiente en la lista.
    const fallbackModels = [
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ];

    addLog(`Llamando a Gemini (${payload.contents[0].parts[0].text.substring(0, 30)}...)`);
    
    let attempt = 0;
    while (attempt < maxRetries) {
      const currentModel = fallbackModels[Math.min(attempt, fallbackModels.length - 1)];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${GEMINI_API_KEY}`;

      const startTime = Date.now();
      try {
        const response = await fetch(url, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
        });
        const endTime = Date.now();
        const duration = (endTime - startTime)/1000;
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || 'Error desconocido';
            
            if (response.status === 503 || response.status === 429 || response.status >= 500) {
               attempt++;
               addLog(`Error ${response.status} en ${currentModel}. Alternando modelo (${attempt}/${maxRetries})...`);
               if (attempt < maxRetries) {
                 await new Promise(res => setTimeout(res, 1500));
                 continue;
               }
            }
            
            addLog(`Error definitivo en ${currentModel}: ${response.status} - ${errMsg}`);
            throw new Error("Error en la API: " + errMsg);
        }
        
        addLog(`Gemini (${currentModel}) respondió en ${duration}s`);
        return await response.json();
      } catch (e) {
        if (e.message.includes("Error en la API") || attempt >= maxRetries - 1) {
            throw e;
        }
        attempt++;
        const nextModel = fallbackModels[Math.min(attempt, fallbackModels.length - 1)];
        addLog(`Fallo de conexión. Alternando a ${nextModel} (${attempt}/${maxRetries})...`);
        await new Promise(res => setTimeout(res, 1500));
      }
    }
  };

  const processAnalysis = async (content, feedback = "", existingFicheroItems = []) => {
    if (tarifario.length === 0) return setErrorMsg("Carga el tarifario maestro para habilitar el mapeo.");
    setLoading(true);
    if (feedback) setResults([]);

    try {
      addLog("Preparando contexto de tarifario...");
      // Reducimos el slice a 800 para mayor agilidad sin perder precisión
      // Incluimos posicion para que la IA tenga más contexto de identificación
      const context = tarifario.filter(t => t.descripcion_servicio).slice(0, 800).map(t => ({ 
        id: t.posicion,
        desc: t.descripcion_servicio, 
        pre: t.importe_unitario,
        ctr: t.contrato
      }));
      addLog(`Enviando ${context.length} partidas a IA para análisis...`);

      const memoryRules = learningLog.map(l => `[REGLA]: Para '${l.supplier_item}', NO USAR '${l.partida_desc}'. Razón: ${l.reason}`).join('\n');
      
      // Añadimos memoria de éxitos recientes (los últimos 3 archivos validados)
      const pastSuccesses = otHistory.slice(0, 3).map(ot => 
        ot.items.slice(0, 5).map(it => `[ÉXITO PASADO]: '${it.supplier_item}' -> '${it.info.descripcion_servicio}'`).join('\n')
      ).join('\n');

      const isRefining = existingFicheroItems.length > 0;
      
      const sysPrompt = `Eres un INGENIERO ELECTROMECÁNICO experto.
        ${isRefining ? `
        MODO EDICIÓN QUIRÚRGICA: Tienes un fichero ya validado.
        PARTIDAS ACTUALES: ${JSON.stringify(existingFicheroItems.map(it => ({ cotiz: it.supplier_item, partida: it.info.descripcion_servicio })))}
        FEEDBACK DEL EQUIPO: "${feedback}"
        REGLAS: 1. ELIMINAR lo que se pida (quítalo del JSON final). 2. MODIFICAR solo lo indicado. 3. NO AGREGUES ítems nuevos de la imagen si no se solicita explícitamente.
        ` : `Analiza la cotización y mapea cada ítem al tarifario oficial.`}
        ${memoryRules ? `REGLAS DE APRENDIZAJE (EVITAR):\n${memoryRules}` : ""}
        ${pastSuccesses ? `EJEMPLOS DE ÉXITOS PASADOS (IMITAR SI APLICA):\n${pastSuccesses}` : ""}
        TARIFARIO OFICIAL: ${JSON.stringify(context)}.
        INSTRUCCIÓN CRÍTICA: En 'client_partida_id' DEBES colocar el valor exacto del campo 'desc' que aparece en el TARIFARIO OFICIAL. 
        Si el ítem no existe, intenta aproximarlo pero usa el 'desc' exacto del objeto más cercano.
        Devuelve JSON puro: {"matches": [{"supplier_item", "client_partida_id", "reasoning"}]}`;

      const payload = {
        contents: [{ parts: [
          { text: sysPrompt },
          content.type === 'image' 
            ? { inlineData: { mimeType: content.mime, data: content.data } }
            : { text: `Contenido extraído: ${content.data}` }
        ]}],
        generationConfig: { responseMimeType: "application/json", temperature: 0 }
      };

      const result = await callGemini(payload);
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("La IA no devolvió partidas válidas.");

      const aiRes = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      const rawMatches = Array.isArray(aiRes.matches) ? aiRes.matches : [];

      const mapped = rawMatches.map((m, i) => {
        const targetNorm = normalize(m.client_partida_id);
        // Búsqueda robusta: exacta o por inclusión
        const found = tarifario.find(t => normalize(t.descripcion_servicio) === targetNorm) || 
                      tarifario.find(t => normalize(t.descripcion_servicio).startsWith(targetNorm)) ||
                      tarifario.find(t => normalize(t.descripcion_servicio).includes(targetNorm)) ||
                      tarifario.find(t => normalize(t.posicion) === targetNorm);

        return {
          uid: Date.now() + i,
          supplier_item: String(m.supplier_item),
          reasoning: String(m.reasoning),
          selected: isRefining ? true : false,
          info: found || { descripcion_servicio: String(m.client_partida_id), importe_unitario: "0", contrato: "N/A", posicion: "N/A", familia: "N/A" }
        };
      });

      setResults(mapped);
      setLoading(false);
    } catch (e) { 
        console.error(e);
        setErrorMsg("Error en el análisis de ingeniería. Reintenta."); 
        setLoading(false); 
    }
  };

  // --- 5. FUNCIONES DE INTERACCIÓN ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setCotFileName(file.name);
    try {
        const base64 = await fileToBase64(file);
        const content = { type: 'image', mime: file.type || "image/jpeg", data: base64 };
        setCurrentSourceContent(content); 
        await processAnalysis(content);
        e.target.value = "";
    } catch (e) { setErrorMsg("Error al leer el archivo."); setLoading(false); }
  };

  const downloadCSVFile = (items, meta) => {
    const rows = items.map(r => ({
      'CIF': '20414766308',
      'Número de la Orden': String(meta.ot),
      'Fecha Atención': String(meta.fecha),
      'Hora Atención': String(meta.hora || ""),
      'Fecha Realización': '', 'Hora Realización': '',
      'Causa de la Actuación': String(meta.causa),
      'PRRLL': 'X',
      'Contrato': String(r.info.contrato),
      'Posicion': String(r.info.posicion),
      'Sub Pos.': '', 'Material': '', 'Servicio': '',
      'Cantidad': String(meta.cantidad || "1"),
      'Ind.Impuesto': 'L1', 'Familia': String(r.info.familia || ""),
      'Unidad': 'UN',
      'Importe unitario': String(r.info.importe_unitario),
      'Texto Material': String(r.info.descripcion_servicio),
      'Moneda': 'PEN'
    }));

    const ws = window.XLSX.utils.json_to_sheet(rows);
    const csvContent = window.XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `REPORTE_SODEXO_OT_${meta.ot || 'TEMP'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSelectedAsCSV = async () => {
    const selectedItems = results.filter(r => r.selected);
    if (selectedItems.length === 0) return;

    if (supabaseClient) {
      await supabaseClient.from('ot_history').insert([{
        ot_number: String(globalFichero.ot),
        date_atencion: String(globalFichero.fecha),
        items_count: selectedItems.length,
        items: selectedItems,
        source_content: currentSourceContent,
        meta: globalFichero
      }]);
      syncCloudData(supabaseClient);
    }

    downloadCSVFile(selectedItems, globalFichero);
    setShowGlobalModal(false);
  };

  const handleHistoryRegeneration = async () => {
    if (!selectedHistoryOT || !generalRejectionText) return;
    
    if (supabaseClient) {
      await supabaseClient.from('learning_rules').insert([{
        supplier_item: "Lote OT " + selectedHistoryOT.ot_number,
        partida_desc: "General",
        reason: generalRejectionText
      }]);
      syncCloudData(supabaseClient);
    }

    setView('analysis');
    setResults([]);
    setShowRegenerationModal(false);
    await processAnalysis(selectedHistoryOT.source_content, generalRejectionText, selectedHistoryOT.items);
  };

  // --- 6. RENDERIZADO ---
  const filteredHistory = useMemo(() => otHistory.filter(ot => 
    String(ot.ot_number).toLowerCase().includes(searchTerm.toLowerCase())
  ), [otHistory, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans p-4 md:p-8 text-xs">
      
      {errorMsg && (
        <div className="fixed top-4 right-4 z-[1000] bg-white border-l-4 border-red-500 shadow-2xl p-6 rounded-r-3xl flex items-start gap-4 animate-in slide-in-from-top max-md border border-red-100">
          <AlertTriangle className="text-red-500 w-6 h-6 shrink-0" />
          <div className="flex-1"><p className="font-black text-red-900 mb-1 uppercase text-[10px]">Error del Sistema</p><p className="text-[11px] text-slate-600 leading-relaxed font-medium">{errorMsg}</p></div>
          <button onClick={() => setErrorMsg(null)}><X className="w-5 h-5 text-slate-300" /></button>
        </div>
      )}

      {/* MODAL REGENERACIÓN */}
      {showRegenerationModal && (
        <div className="fixed inset-0 z-[500] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 animate-in zoom-in duration-300">
                <div className="bg-red-700 p-10 text-white flex justify-between items-center relative overflow-hidden">
                    <div className="absolute -right-6 -bottom-6 opacity-20 rotate-12"><RefreshCw className="w-48 h-48" /></div>
                    <div className="relative z-10">
                        <h3 className="text-3xl font-black uppercase italic leading-none mb-2 tracking-tighter">Regenerar con Rechazo</h3>
                        <p className="text-red-100 font-bold uppercase tracking-[0.3em] text-[9px]">Corrigiendo sobre fichero de la OT #{selectedHistoryOT?.ot_number}</p>
                    </div>
                    <button onClick={() => setShowRegenerationModal(false)} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 transition-all z-20"><X className="w-6 h-6" /></button>
                </div>
                <div className="p-12 space-y-8">
                    <div className="bg-red-50 p-6 rounded-3xl border border-red-100 flex items-start gap-4">
                        <Eraser className="w-6 h-6 text-red-600 shrink-0" />
                        <div><p className="font-black text-red-900 uppercase text-[10px] mb-1">Modo Edición Estricta</p><p className="text-red-700 text-[11px] italic">Indica partidas a borrar o modificar. No se añadirán ítems nuevos automáticamente.</p></div>
                    </div>
                    <textarea className="w-full bg-slate-50 border-4 border-slate-100 rounded-[2.5rem] px-8 py-6 font-bold text-base outline-none focus:border-red-600 transition-all h-48 resize-none shadow-inner" placeholder="Ej: Elimina la partida X. Modifica la de pintura para que sea el código de muros..." value={generalRejectionText} onChange={(e) => setGeneralRejectionText(e.target.value)} />
                    <button onClick={handleHistoryRegeneration} className="w-full py-6 rounded-[2rem] font-black uppercase bg-red-600 text-white hover:bg-red-700 shadow-2xl flex items-center justify-center gap-3"><RefreshCw className="w-6 h-6" /> VALIDAR Y RE-ANALIZAR</button>
                </div>
            </div>
        </div>
      )}

      {/* BUSCADOR MANUAL */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-[600] bg-blue-950/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] border border-white/20">
            <div className="bg-blue-600 p-10 text-white flex justify-between items-center relative"><h3 className="text-3xl font-black uppercase italic tracking-tighter leading-none">Buscador del Maestro</h3><button onClick={() => setShowCorrectionModal(false)} className="p-4 bg-white/10 rounded-3xl hover:bg-white/20 transition-all"><X className="w-8 h-8" /></button></div>
            <div className="p-10 space-y-6 flex-1 flex flex-col min-h-0">
               <input type="text" placeholder="Filtrar tarifario por descripción..." className="w-full px-8 py-6 bg-slate-50 border-4 border-slate-100 rounded-[2.5rem] text-lg font-bold outline-none focus:border-blue-600 shadow-inner" value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} />
               <div className="flex-1 overflow-y-auto custom-scrollbar border-4 border-slate-50 rounded-[3rem] p-4 space-y-2">
                  {tarifario.filter(i => normalize(i.descripcion_servicio).includes(normalize(manualSearch))).slice(0, 40).map((item, idx) => (
                    <button key={idx} onClick={() => applyCorrection(item)} className="w-full p-6 rounded-[2rem] hover:bg-blue-600 hover:text-white transition-all text-left flex justify-between items-center border border-slate-100 group shadow-sm shadow-inner"><div className="flex-1"><p className="font-black text-sm uppercase leading-tight group-hover:text-white">{String(item.descripcion_servicio)}</p><p className="text-[10px] opacity-60 font-mono mt-1">POS: {String(item.posicion)} | CTR: {String(item.contrato)}</p></div><p className="font-black text-lg italic shrink-0">S/ {String(item.importe_unitario)}</p></button>
                  ))}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* FORMULARIO FINAL */}
      {showGlobalModal && (
        <div className="fixed inset-0 z-[400] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 animate-in zoom-in duration-300">
                <div className="bg-blue-900 p-12 text-white flex justify-between items-center relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12"><Archive className="w-56 h-56" /></div>
                    <div className="relative z-10"><h3 className="text-3xl font-black uppercase italic leading-none mb-2 tracking-tighter">Armar Fichero</h3><p className="text-blue-300 font-bold uppercase tracking-[0.4em] text-[9px]">Lote de {approvedCount} partidas validadas</p></div>
                    <button onClick={() => setShowGlobalModal(false)} className="bg-white/10 p-4 rounded-3xl hover:bg-white/20 transition-all z-20"><X className="w-8 h-8" /></button>
                </div>
                <div className="p-12 space-y-8 bg-gradient-to-b from-white to-slate-50">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-2"><label className="font-black text-slate-400 uppercase text-[9px] px-1 flex items-center gap-2"><Hash className="w-3 h-3 text-blue-600"/> Número Orden</label><input type="text" className="w-full bg-white border-2 border-slate-200 rounded-[1.5rem] px-6 py-5 font-bold outline-none focus:border-blue-600 transition-all" value={globalFichero.ot} onChange={(e) => setGlobalFichero({...globalFichero, ot: e.target.value})} /></div>
                        <div className="space-y-2"><label className="font-black text-slate-400 uppercase text-[9px] px-1 flex items-center gap-2"><Calendar className="w-3 h-3 text-blue-600"/> Fecha Atención</label><input type="date" className="w-full bg-white border-2 border-slate-200 rounded-[1.5rem] px-6 py-5 font-bold outline-none focus:border-blue-600 transition-all" value={globalFichero.fecha} onChange={(e) => setGlobalFichero({...globalFichero, fecha: e.target.value})} /></div>
                        <div className="space-y-2"><label className="font-black text-slate-400 uppercase text-[9px] px-1 flex items-center gap-1 font-bold"><Clock className="w-3 h-3 text-blue-600"/> Hora Atención</label><input type="time" className="w-full bg-white border-2 border-slate-200 rounded-[1.5rem] px-6 py-5 font-bold outline-none focus:border-blue-600 transition-all" value={globalFichero.hora} onChange={(e) => setGlobalFichero({...globalFichero, hora: e.target.value})} /></div>
                        <div className="space-y-2"><label className="font-black text-slate-400 uppercase text-[9px] px-1 flex items-center gap-1 font-bold"><Package className="w-3 h-3 text-blue-600"/> Cantidad Global</label><input type="number" className="w-full bg-white border-2 border-slate-200 rounded-[1.5rem] px-6 py-5 font-bold outline-none focus:border-blue-600 transition-all" value={globalFichero.cantidad} onChange={(e) => setGlobalFichero({...globalFichero, cantidad: e.target.value})} /></div>
                    </div>
                    <div className="space-y-2"><label className="font-black text-slate-400 uppercase text-[9px] px-1">Causa de la Actuación</label><textarea className="w-full bg-white border-2 border-slate-200 rounded-[1.5rem] px-6 py-5 font-bold outline-none h-32 resize-none shadow-inner" value={globalFichero.causa} onChange={(e) => setGlobalFichero({...globalFichero, causa: e.target.value})} /></div>
                    <button onClick={exportSelectedAsCSV} className="w-full py-6 bg-green-600 text-white font-black uppercase rounded-[2rem] shadow-2xl hover:bg-green-700 tracking-widest text-[11px] flex items-center justify-center gap-3 shadow-green-100 transition-all"><Download className="w-6 h-6" /> PROCESA Y GUARDA EN LA NUBE</button>
                </div>
            </div>
        </div>
      )}

      {/* HEADER DINÁMICO */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-10 mb-12">
        <div className="flex items-center gap-6">
          <div className="bg-blue-900 p-5 rounded-[2rem] shadow-2xl shadow-blue-100 rotate-3"><BrainCircuit className="text-white w-10 h-10" /></div>
          <div><h1 className="text-4xl font-black text-slate-800 italic uppercase tracking-tighter leading-none mb-2">Conciliador Pro</h1><p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.4em] flex items-center gap-2"><Database className="w-3 h-3 text-blue-600" /> Sincronización Supabase v15.0</p></div>
        </div>
        <div className="flex bg-white p-2 rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
          <button onClick={() => setView('analysis')} className={`px-10 py-4 rounded-[1.5rem] font-black transition-all text-[10px] tracking-widest ${view === 'analysis' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}>ANÁLISIS</button>
          <button onClick={() => setView('history')} className={`px-10 py-4 rounded-[1.5rem] font-black transition-all text-[10px] tracking-widest ${view === 'history' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}>BUSCADOR OT ({otHistory.length})</button>
          <button onClick={() => setView('tarifario')} className={`px-10 py-4 rounded-[1.5rem] font-black transition-all text-[10px] tracking-widest ${view === 'tarifario' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>MAESTRO</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-10">
        <aside className="lg:col-span-1 space-y-8">
          {/* BASE MAESTRA */}
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
            <h2 className="text-[11px] font-black mb-8 uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 font-mono"><FileSpreadsheet className="w-4 h-4 text-green-500" /> 1. BASE MAESTRA</h2>
            {!tarifarioFileName ? (
              <div className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 text-center hover:border-blue-500 cursor-pointer bg-slate-50/50 group transition-all" onClick={() => document.getElementById('tarifario-input').click()}>
                <input id="tarifario-input" type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => {
                    const file = e.target.files[0]; if (!file || !libLoaded) return; setLoading(true); setTarifarioFileName(file.name);
                    const reader = new FileReader(); reader.onload = (evt) => {
                        const bstr = evt.target.result; const wb = window.XLSX.read(bstr, { type: 'binary' }); const ws = wb.Sheets[wb.SheetNames[0]];
                        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
                        const TARGETS = { desc: "DESCRIPCION DEL SERVICIO", fam: "FAMILIA", con: "CONTRATO", pos: "POSICION", pre: "IMPORTE UNITARIO" };
                        let headerIdx = -1, colMap = {};
                        for (let i = 0; i < Math.min(rows.length, 100); i++) {
                            const row = rows[i]; let matches = 0, temp = {}; row.forEach((cell, idx) => { const norm = normalize(cell); Object.entries(TARGETS).forEach(([k, v]) => { if (norm === normalize(v)) { temp[k] = idx; matches++; } }); });
                            if (matches >= 4) { headerIdx = i; colMap = temp; break; }
                        }
                        const processed = rows.slice(headerIdx + 1).filter(r => r[colMap.desc] || r[colMap.pre]).map((row) => ({ descripcion_servicio: String(row[colMap.desc] || "").trim(), familia: String(row[colMap.fam] || "").trim(), contrato: String(row[colMap.con] || "").trim(), posicion: String(row[colMap.pos] || "").trim(), importe_unitario: String(row[colMap.pre] || "").trim() }));
                        setTarifario(processed); setLoading(false);
                    }; reader.readAsBinaryString(file);
                }} />
                <Database className="text-blue-900 w-12 h-12 mx-auto mb-4 group-hover:scale-110 transition-transform" /><p className="font-black text-slate-700 text-[11px] uppercase">Cargar Maestro</p>
              </div>
            ) : (
              <div className="bg-blue-50/50 p-7 rounded-[2rem] border border-blue-100 flex flex-col items-center text-center"><CheckCircle className="text-blue-600 w-8 h-8 mb-4 shadow-sm" /><p className="text-[11px] font-black text-blue-900 truncate uppercase w-full mb-1">{String(tarifarioFileName)}</p><button onClick={() => {setTarifario([]); setTarifarioFileName(null); setResults([]);}} className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-red-500 uppercase tracking-widest hover:bg-red-50 py-3 rounded-2xl transition-all border border-red-100 mt-4">Cambiar Base</button></div>
            )}
          </div>

          {/* INFORME CONTEXTO */}
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
            <h2 className="text-[11px] font-black mb-8 uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 font-mono"><ClipboardList className="w-4 h-4 text-orange-500" /> 2. INFORME (CONTEXTO)</h2>
            {!reportFileName ? (
              <div className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 text-center hover:border-orange-500 cursor-pointer bg-slate-50/50 group transition-all" onClick={() => document.getElementById('report-input').click()}>
                <input id="report-input" type="file" className="hidden" accept="image/*,application/pdf,.docx" onChange={async (e) => {
                    const file = e.target.files[0]; if (!file) return; setLoading(true); setReportFileName(file.name);
                    if (file.name.endsWith('.docx')) {
                        const reader = new FileReader(); reader.onload = async (ev) => { const result = await window.mammoth.extractRawText({ arrayBuffer: ev.target.result }); setReportText(result.value); setLoading(false); }; reader.readAsArrayBuffer(file);
                    } else {
                        const base64 = await fileToBase64(file);
                        console.log(`Enviando informe descriptivo a IA (${file.name}, ${file.size} bytes)...`);
                        const result = await callGemini({ contents: [{ parts: [{ text: "Analiza este informe de mantenimiento y devuelve un resumen técnico MUY CONCISO extrayendo: 1. Equipos afectados, 2. Problemas detectados. Sé directo." }, { inlineData: { mimeType: file.type || "application/pdf", data: base64 } }]}] });
                        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo extraer el texto del informe.";
                        setReportText(text);
                        setLoading(false);
                    }
                }} />
                <button className="w-full py-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 hover:border-orange-500 transition-all flex flex-col items-center gap-3 shadow-sm shadow-inner"><Eye className="text-orange-400 w-8 h-8" /><span className="font-black text-slate-700 text-[11px] uppercase italic">Añadir Informe</span></button>
              </div>
            ) : (
              <div className="bg-orange-50/50 p-7 rounded-[2rem] border border-orange-100"><div className="flex items-center justify-between mb-5"><p className="text-[11px] font-black text-orange-800 uppercase truncate pr-4">{String(reportFileName)}</p><button onClick={() => {setReportText(""); setReportFileName(null);}} className="text-orange-400 hover:text-red-500 transition-colors p-1 bg-white rounded-lg shadow-sm"><X className="w-5 h-5" /></button></div><button onClick={() => {setReportText(""); setReportFileName(null);}} className="w-full py-3 bg-white text-[10px] font-black text-orange-600 rounded-2xl border border-orange-200 uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-100 transition-all shadow-sm">Borrar contexto</button></div>
            )}
          </div>

          {/* PANEL DIAGNÓSTICO */}
          <div className="bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl border border-slate-800 overflow-hidden">
             <div className="flex items-center gap-3 mb-4 opacity-50"><Activity className="text-blue-400 w-4 h-4" /><h3 className="text-[9px] font-black text-white uppercase tracking-[0.3em]">Monitor de Latencia</h3></div>
             <div className="space-y-3">
                {diagnostics.length === 0 && <p className="text-slate-600 italic text-[10px]">Esperando actividad...</p>}
                {diagnostics.map((log, i) => (
                    <div key={i} className="flex justify-between items-start gap-4 border-l-2 border-blue-500/30 pl-3">
                        <p className="text-[10px] text-slate-300 leading-tight font-mono">{log.msg}</p>
                        <span className="text-[8px] text-slate-500 font-bold shrink-0">{log.time}</span>
                    </div>
                ))}
             </div>
          </div>
        </aside>

        <section className="lg:col-span-3">
          {view === 'analysis' ? (
            <div className="bg-white p-12 rounded-[5rem] shadow-sm border border-slate-100 min-h-[650px] relative overflow-hidden">
              <div className="flex items-center justify-between mb-16 flex-wrap gap-6 relative z-50">
                <div><h2 className="text-4xl font-black text-slate-800 tracking-tighter leading-none mb-3">Auditoría Técnica</h2>{results.length > 0 && <p className="text-[11px] text-blue-600 font-black uppercase tracking-[0.4em]">{approvedCount} partidas en el fichero actual</p>}</div>
                <div className="flex gap-4">
                   {approvedCount > 0 && <button onClick={() => setShowGlobalModal(true)} className="px-12 py-5 rounded-[2rem] font-black text-[12px] bg-green-600 text-white shadow-2xl hover:scale-105 transition-all flex items-center gap-3 ring-8 ring-green-50 animate-in fade-in zoom-in"><FilePlus className="w-6 h-6" /> GENERAR FICHERO</button>}
                   {results.length > 0 && <button onClick={() => {setResults([]); setCotFileName(null); setStatus('idle');}} className="px-8 py-5 rounded-[1.5rem] font-black text-[11px] bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all flex items-center gap-2 shadow-sm active:scale-95"><RotateCcw className="w-5 h-5" /> LIMPIAR</button>}
                   <div className="relative group">
                    <button onClick={() => tarifario.length > 0 && document.getElementById('cot-input').click()} className={`px-12 py-5 rounded-[2rem] font-black text-[11px] transition-all ${tarifario.length > 0 && !loading ? 'bg-blue-600 text-white shadow-2xl hover:scale-105 border-b-4 border-blue-800' : 'bg-slate-100 text-slate-300 shadow-inner'}`} disabled={loading || tarifario.length === 0}>
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-6" />} 
                        {cotFileName ? String(cotFileName).substring(0, 15) + "..." : "3. CARGAR COTIZACIÓN"}
                    </button>
                    <input id="cot-input" type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
                   </div>
                </div>
              </div>

              {loading && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center animate-in fade-in duration-500 text-center"><Zap className="w-16 h-16 text-blue-600 animate-bounce mb-6" /><h3 className="text-3xl font-black text-slate-800 uppercase italic mb-2 tracking-tighter">Ingeniero Analizando</h3><p className="text-slate-400 text-[11px] uppercase tracking-[0.4em] animate-pulse font-bold">Consolidando datos estrictamente sobre el fichero...</p></div>
              )}

              <div className="space-y-16 relative">
                {results.map((res) => (
                  <div key={res.uid} className={`group border rounded-[2rem] p-6 transition-all flex flex-col md:flex-row items-center gap-6 relative overflow-visible ${res.selected ? 'bg-green-50/40 border-green-200 border-l-[15px] border-l-green-500 shadow-lg' : 'bg-white border-slate-100 hover:shadow-xl border-l-[15px] border-l-blue-600 shadow-sm'}`}>
                    
                    {/* ACCIONES COMPACTAS */}
                    <div className="absolute -top-4 right-8 flex gap-3 z-[80]">
                        <button onClick={() => openCorrection(res.uid)} className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all border-2 border-white shadow-md"><Search className="w-4 h-4" /></button>
                        <button onClick={() => toggleSelect(res.uid)} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-xl border-4 border-white ${res.selected ? 'bg-green-600 text-white' : 'bg-white text-slate-200 hover:text-green-500'}`}><Check className="w-8 h-8 stroke-[3]" /></button>
                        <button onClick={() => removeResult(res.uid)} className="w-10 h-10 rounded-xl bg-white text-slate-300 flex items-center justify-center hover:text-red-500 transition-all border-2 border-slate-50 shadow-md"><Trash2 className="w-4 h-4" /></button>
                    </div>

                    {/* FUENTE (IZQUIERDA) */}
                    <div className="md:w-1/3 space-y-2">
                        <span className="text-[8px] font-black text-slate-300 uppercase block tracking-widest font-mono">PROVEEDOR:</span>
                        <p className="text-sm font-black text-slate-800 leading-tight uppercase font-mono truncate" title={String(res.supplier_item)}>{String(res.supplier_item)}</p>
                        <div className="text-[9px] text-slate-400 italic leading-tight line-clamp-2" title={String(res.reasoning)}>"{String(res.reasoning)}"</div>
                    </div>

                    {/* PROPUESTA (DERECHA) */}
                    <div className={`flex-1 p-5 rounded-[1.5rem] border flex items-center justify-between gap-6 ${res.selected ? 'bg-white border-green-100' : 'bg-slate-50/50 border-slate-100'}`}>
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-950 text-[11px] leading-tight uppercase font-mono truncate" title={String(res.info?.descripcion_servicio)}>{String(res.info?.descripcion_servicio) || "Sin mapear"}</p>
                            <div className="flex gap-4 mt-2">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">POS: <b className="text-slate-700">{String(res.info?.posicion)}</b></span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[150px]">CTR: <b className="text-slate-700">{String(res.info?.contrato)}</b></span>
                            </div>
                        </div>
                        <div className={`px-6 py-3 rounded-2xl text-center min-w-[100px] ${res.selected ? 'bg-green-600 text-white' : 'bg-blue-950 text-white'}`}>
                            <span className="text-[7px] font-bold uppercase block opacity-70 mb-1">IMPORTE</span>
                            <span className="font-black text-xs">S/ {String(res.info?.importe_unitario)}</span>
                        </div>
                    </div>
                  </div>
                ))}
                {results.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center h-[550px] text-slate-200 border-[10px] border-dashed border-slate-100 rounded-[10rem] animate-pulse group hover:border-blue-50 transition-colors"><Layers className="w-32 h-32 mb-12 opacity-5 transition-opacity" /><p className="font-black text-center italic text-lg uppercase tracking-[0.6em] mb-4">Ingeniería Sodexo v15.0</p><p className="text-[12px] text-slate-400 font-bold uppercase tracking-widest text-center">Sube la cotización para iniciar el análisis con aprendizaje continuo</p></div>
                )}
              </div>
            </div>
          ) : view === 'history' ? (
            <div className="bg-white p-16 rounded-[6rem] shadow-sm border border-slate-200 flex flex-col min-h-[750px]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-12 mb-14 px-4"><div className="flex items-center gap-10"><div className="bg-blue-900 p-8 rounded-[3rem] shadow-2xl"><History className="text-white w-14 h-14" /></div><div><h2 className="text-4xl font-black text-slate-800 italic uppercase tracking-tighter leading-none mb-2 text-blue-900 text-center">Buscador de OT</h2><p className="text-[12px] text-slate-400 font-black uppercase tracking-[0.5em] text-center">Base de Datos compartida Supabase</p></div></div><div className="relative"><Search className="absolute left-10 top-1/2 -translate-y-1/2 w-8 h-8 text-slate-400" /><input type="text" placeholder="Filtrar por OT..." className="pl-24 pr-12 py-8 bg-slate-50 border-4 border-slate-100 rounded-[3.5rem] text-xl focus:ring-[20px] focus:ring-blue-50 w-full md:w-[600px] font-black outline-none shadow-sm transition-all shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                 {filteredHistory.map((ot) => (
                    <div key={ot.id} className="group bg-slate-50/50 border-2 border-slate-100 p-10 rounded-[4rem] hover:bg-white hover:shadow-2xl transition-all relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10"><FileSearch className="w-40 h-40" /></div><div className="flex justify-between items-start mb-10 relative z-10"><div><span className="bg-blue-100 text-blue-600 px-6 py-2 rounded-full font-black text-[10px] uppercase mb-4 inline-block shadow-sm tracking-widest font-mono">OT #{String(ot.ot_number)}</span><h3 className="text-3xl font-black text-slate-800 italic uppercase tracking-tighter leading-tight font-mono">{String(ot.meta?.causa || "Servicios Generales").substring(0, 45)}...</h3></div><div className="text-right shrink-0"><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{String(ot.date_atencion)}</p><p className="text-[9px] font-bold text-blue-400 mt-1 uppercase">{String(ot.items_count)} Partidas</p></div></div>
                    <div className="flex gap-4 relative z-10"><button onClick={() => {setSelectedHistoryOT(ot); setShowRegenerationModal(true);}} className="flex-[2] py-5 bg-white border-2 border-red-100 text-red-500 rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95"><ThumbsDown className="w-5 h-5" /> RECHAZAR</button><button onClick={() => downloadCSVFile(ot.items, ot.meta)} className="flex-1 py-5 bg-blue-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95 shadow-blue-100"><FileOutput className="w-5 h-5" /> BAJAR CSV</button></div></div>
                 ))}
                 {otHistory.length === 0 && <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-200 border-8 border-dashed border-slate-50 rounded-[5rem] animate-pulse"><Archive className="w-24 h-24 mb-6 opacity-10" /><p className="font-black uppercase tracking-[0.5em] text-center">Nube Supabase Vacía</p></div>}
              </div>
            </div>
          ) : (
            <div className="bg-white p-16 rounded-[6rem] shadow-sm border border-slate-200 flex flex-col h-[850px]"><div className="flex flex-col md:flex-row md:items-center justify-between gap-12 mb-14 px-4"><div className="flex items-center gap-10"><div className="bg-blue-50 p-8 rounded-[3rem]"><Database className="text-blue-600 w-14 h-14" /></div><div><h2 className="text-4xl font-black text-slate-800 italic uppercase tracking-tighter leading-none mb-2">Base Maestro Sodexo</h2></div></div><input type="text" placeholder="Buscar..." className="pl-12 pr-12 py-8 bg-slate-50 border-4 border-slate-100 rounded-[3.5rem] text-xl focus:ring-[20px] focus:ring-blue-50 w-full md:w-[600px] font-black outline-none shadow-sm shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><div className="overflow-x-auto flex-1 border-4 border-slate-50 rounded-[5rem] bg-white shadow-inner overflow-y-auto custom-scrollbar p-8"><table className="w-full text-left border-collapse table-auto"><thead className="sticky top-0 bg-white shadow-sm z-10 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] border-b-4 border-slate-100"><tr><th className="py-14 px-16 min-w-[500px]">DESCRIPCION</th><th className="py-14 px-16 text-right">UNITARIO</th></tr></thead><tbody>{tarifario.filter(i => i.descripcion_servicio.toLowerCase().includes(searchTerm.toLowerCase())).map((item, idx) => (<tr key={idx} className="hover:bg-blue-50/50 transition-all border-b-4 border-slate-50"><td className="py-14 px-16 font-black text-slate-800 uppercase text-lg leading-tight">{String(item.descripcion_servicio)}</td><td className="py-14 px-16 text-right font-black text-blue-950 text-xl whitespace-nowrap">S/ {String(item.importe_unitario)}</td></tr>))}</tbody></table></div></div>
          )}
        </section>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .custom-scrollbar::-webkit-scrollbar { width: 12px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 50px; border: 4px solid #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}
