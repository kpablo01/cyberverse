let materialesLocales = [];
let globalChart = null;
let detailChart = null;
let marketDataFull = [];

export async function initMarketLiveTab(config = { mode: 'read' }) {
    const isAdmin = config.mode === 'admin';

    const elements = {
        status: document.getElementById('market-status'),
        tbody: document.getElementById('market-live-tbody'),
        metrics: document.getElementById('metrics-container'),
        sales: document.getElementById('sales-container'),
        refresh: document.getElementById('btn-refresh-market'),
        search: document.getElementById('market-search')
    };

    // --- RENDERIZADO DE MÉTRICAS ---
    const renderMetrics = (metrics) => {
        if (!elements.metrics) return;
        const totalVol = metrics.reduce((acc, m) => acc + (Number(m.current_min_price) * Number(m.current_total_supply)), 0);
        const volEl = document.getElementById('stat-volume');
        if (volEl) volEl.textContent = `${totalVol.toLocaleString()} CYPX`;
    
        elements.metrics.innerHTML = metrics.slice(0, 8).map(m => {
            const pct = Number(m.desviacion_porcentaje);
            const isCheap = pct < -5;
            const barWidth = Math.min(Math.abs(pct) * 2, 100);
            return `
                <div class="bg-gray-900/40 border ${isCheap ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-gray-800/50'} p-4 rounded-xl relative overflow-hidden group">
                    <div class="flex items-center gap-3 mb-3">
                        <img src="${m.imagen_url}" class="w-10 h-10 object-contain">
                        <div class="truncate">
                            <h4 class="text-[9px] font-black text-gray-500 uppercase tracking-tighter truncate">${m.nombre}</h4>
                            <div class="text-lg font-mono font-bold text-white leading-none">${Number(m.current_min_price).toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="space-y-1">
                        <div class="flex justify-between text-[8px] font-mono">
                            <span class="text-gray-600">VOLATILITY</span>
                            <span class="${pct < 0 ? 'text-green-400' : 'text-red-400'} font-bold">${pct > 0 ? '+' : ''}${pct.toFixed(1)}%</span>
                        </div>
                        <div class="h-[2px] w-full bg-gray-800 rounded-full overflow-hidden">
                            <div class="h-full ${pct < 0 ? 'bg-green-500' : 'bg-red-500'}" style="width: ${barWidth}%"></div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    };

    // --- RENDERIZADO DE VENTAS ---
    const renderSalesData = (sales) => {
        const salesContainer = document.getElementById('sales-list') || elements.sales;
        if (!salesContainer) return;
        
        if (sales.length === 0) {
            salesContainer.innerHTML = `<div class="text-center text-gray-600 text-[10px] py-20 italic">No incoming data...</div>`;
            return;
        }
        
        salesContainer.innerHTML = sales.map(s => {
            const precio = Number(s.precio_venta) || 0;
            const cantidad = Number(s.volumen_vendido) || 0;
            const totalVenta = (cantidad * precio).toFixed(0);
            
            const fechaObj = s.ultima_venta ? new Date(s.ultima_venta) : null;
            const horaVenta = fechaObj 
                ? fechaObj.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                : '--/-- --:--';
    
            // LÓGICA DE WHALE: Venta > 2500 CYPX
            const isWhale = Number(totalVenta) > 2500;
            const containerClass = isWhale 
                ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse border-l-4' 
                : 'border-cyan-500/30 bg-gray-900/40 border-l-2';
    
            return `
                <div class="group ${containerClass} p-2 rounded-r-lg mb-2 flex items-center gap-3 transition-all">
                    <div class="relative flex-shrink-0">
                        <img src="${s.imagen_url}" class="w-8 h-8 object-contain ${isWhale ? 'scale-110' : 'opacity-80'} group-hover:opacity-100 transition">
                        ${isWhale ? '<span class="absolute -top-2 -left-2 text-[10px] drop-shadow-md">🐋</span>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-0.5">
                            <span class="text-[9px] font-mono ${isWhale ? 'text-purple-400 font-black' : 'text-cyan-400 font-bold'}">
                                ${isWhale ? 'WHALE: ' : ''}${totalVenta} CYPX
                            </span>
                            <span class="text-[8px] text-gray-500 font-mono">${horaVenta}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <div class="text-[10px] text-gray-100 font-bold truncate pr-1">${s.nombre}</div>
                            <div class="text-[10px] text-white font-mono bg-black/40 px-1 rounded">x${cantidad}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    };
    
    // --- RENDERIZADO DE FILAS ---
    const renderRows = (data, liquidityData = []) => {
        if (!elements.tbody) return;
        
        elements.tbody.innerHTML = data.map(item => {
            const fechaFull = new Date(item.listed_at).toLocaleString('es-AR', { 
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
            });
            const precio = Number(item.price).toFixed(2);
            
            // LÓGICA DE LIQUIDEZ
            const liq = liquidityData.find(l => l.game_id === item.game_id);
            let liqHTML = '';
            
            if (liq) {
                const min = Math.round(liq.minutos_desde_ultima);
                const color = min < 15 ? 'text-green-400' : (min < 60 ? 'text-yellow-500' : 'text-gray-600');
                const label = min < 1 ? 'RECIÉN' : `${min}m`;
                liqHTML = `<span class="${color} text-[9px] font-black tracking-tighter">[🔥 ${label}]</span>`;
            } else {
                liqHTML = `<span class="text-gray-800 text-[9px] font-mono">[STALE]</span>`;
            }
    
            if (item.nombre) {
                return `
                <tr class="hover:bg-white/5 transition border-b border-gray-800/50 group">
                    <td class="p-3 font-mono text-cyan-700 text-[10px]">${item.game_id}</td>
                    <td class="p-3 cursor-pointer group-hover:bg-white/[0.02]" onclick="verHistorialMensual(${item.game_id}, '${item.nombre}')">
                        <div class="flex items-center gap-2">
                            <img src="${item.imagen_url}" class="w-6 h-6 object-contain">
                            <div class="flex flex-col leading-tight">
                                <span class="text-sm text-gray-200 font-bold group-hover:text-purple-400 transition">${item.nombre}</span>
                                ${liqHTML}
                            </div>
                        </div>
                    </td>
                    <td class="p-3 font-mono text-green-400 font-bold text-base">${precio}</td>
                    <td class="p-3 text-xs text-gray-500 font-mono">vol: ${item.amount}</td>
                    <td class="p-3 text-[10px] text-gray-600 text-right font-mono">${fechaFull}</td>
                </tr>`;
            } 
    
            // Caso: Ítem no vinculado (Admin mode)
            const selector = isAdmin ? `
                <select onchange="vincularGameID(${item.game_id}, this.value)" 
                        class="bg-black text-[9px] border border-red-500/30 rounded p-1 w-full text-red-200 outline-none">
                    <option value="">❓ VINCULAR...</option>
                    ${materialesLocales.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}
                </select>
            ` : `<span class="text-[9px] text-red-900 font-black">UNKNOWN_ID</span>`;
    
            return `
            <tr class="bg-red-500/5 border-b border-red-900/20 opacity-70">
                <td class="p-3 font-mono text-red-500 text-[10px]">${item.game_id}</td>
                <td class="p-3">${selector}</td>
                <td class="p-3 font-mono text-red-400/80 font-bold">${precio}</td>
                <td class="p-3 text-xs text-red-300/50">${item.amount}</td>
                <td class="p-3 text-[10px] text-gray-800 text-right font-mono">${fechaFull}</td>
            </tr>`;
        }).join('');
    };

    // --- CARGA DE DATOS ---
    const loadData = async () => {
        if (elements.status) elements.status.textContent = 'SYNCING...';
        try {
            const [resMats, resMetrics, resMarket, resSales, resLiq] = await Promise.all([
                fetch('/api/materiales').then(r => r.json()),
                fetch('/api/market-metrics').then(r => r.json()),
                fetch('/api/market-live').then(r => r.json()),
                fetch('/api/market-sales-tracker').then(r => r.json()),
                fetch('/api/market-liquidity').then(r => r.json())
            ]);

            materialesLocales = resMats;
            marketDataFull = resMarket;

            renderMetrics(resMetrics);
            renderRows(resMarket, resLiq);
            renderSalesData(resSales);

            if (elements.status) elements.status.textContent = `LIVE | ${new Date().toLocaleTimeString('es-AR')}`;
        } catch (err) {
            console.error(err);
            if (elements.status) elements.status.textContent = 'LINK ERROR';
        }
    };

    // --- EVENTOS ---
    elements.search?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        if (!term) {
            renderRows(marketDataFull);
            return;
        }
        const filtered = marketDataFull.filter(item => {
            const nombre = (item.nombre || "").toLowerCase();
            const id = (item.game_id || "").toString();
            return nombre.includes(term) || id.includes(term);
        });
        renderRows(filtered);
    });

    elements.refresh?.addEventListener('click', loadData);
    
    loadData();
}

// --- FUNCIONES GLOBALES (FUERA DE LA PESTAÑA) ---

window.verHistorialMensual = async function(gameId, nombre) {
    const modal = document.getElementById('modal-grafico');
    modal.classList.remove('hidden');
    document.getElementById('grafico-titulo').textContent = `${nombre} - Historial 30 Días`;

    try {
        const res = await fetch(`/api/market-history-monthly/${gameId}`);
        const data = await res.json();
        
        const precioBase = data.length > 0 ? Number(data[0].precio_base) : 0;
        const targetTarea = precioBase * 1.4;

        const ctx = document.getElementById('canvas-monthly-detail').getContext('2d');
        if (detailChart) detailChart.destroy();
        
        detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.fecha),
                datasets: [
                    { label: 'Precio Mínimo', data: data.map(d => d.precio_min), borderColor: '#10b981', fill: true, backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.3 },
                    { label: `Límite Tarea (140%): ${targetTarea.toFixed(2)}`, data: data.map(() => targetTarea), borderColor: '#f59e0b', borderDash: [10, 5], pointRadius: 0, fill: false },
                    { label: 'Promedio Market', data: data.map(d => d.precio_avg), borderColor: '#a855f7', borderDash: [3, 3], fill: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: { 
                    y: { grid: { color: '#1f2937' }, ticks: { color: '#9ca3af' }, suggestedMax: targetTarea * 1.1 }, 
                    x: { ticks: { color: '#9ca3af' } } 
                }
            }
        });
    } catch (err) { console.error(err); }
};

window.vincularGameID = async function(gameId, localId) {
    if (!localId || !confirm(`¿Vincular ID ${gameId}?`)) return;
    try {
        const res = await fetch(`/api/materiales/link-game-id/${localId}`, { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ game_id: gameId }) 
        });
        if (res.ok) location.reload();
    } catch (e) {}
};