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
    
        // Protección principal: si metrics NO es un array válido
        if (!metrics || !Array.isArray(metrics)) {
            console.error("renderMetrics recibió algo que NO es un array:", metrics);
            console.log("Tipo recibido:", typeof metrics, metrics);
    
            // Mostrar mensaje visible en la interfaz en lugar de romper todo
            elements.metrics.innerHTML = `
                <div class="p-6 bg-red-950/70 border border-red-700/70 rounded-xl text-red-300 text-center shadow-lg">
                    <p class="text-lg font-bold mb-3">Error al cargar las tarjetas del mercado</p>
                    <p>No se recibió un listado válido de ítems desde el servidor.</p>
                    <p class="text-sm mt-4 opacity-80">
                        Revisa la consola (F12 → Console) y la pestaña Network para ver la respuesta de <code>/api/market-metrics</code>.<br>
                        Intenta recargar la página o espera unos minutos.
                    </p>
                </div>`;
            return;
        }
    
        // Si llega hasta acá, metrics ES un array → podemos seguir
    
        // Ordenamos: primero los más baratos vs última venta, luego los que más subieron
        const sortedMetrics = [...metrics].sort((a, b) => {
            const devUltA = Number(a.desviacion_vs_ultima || 0);
            const devUltB = Number(b.desviacion_vs_ultima || 0);
            const volA = Number(a.volume_cypx_recent || 0);
            const volB = Number(b.volume_cypx_recent || 0);
    
            // Prioridad 1: los que están muy baratos vs última venta
            if (devUltA < -20 && devUltB >= -20) return -1;
            if (devUltA >= -20 && devUltB < -20) return 1;
    
            // Prioridad 2: mayor desviación absoluta (más extrema)
            const diffAbs = Math.abs(devUltB) - Math.abs(devUltA);
            if (diffAbs !== 0) return diffAbs;
    
            // Desempate: mayor volumen
            return volB - volA;
        });
    
        // Calcular volumen total (solo si hay datos)
        const totalVol = sortedMetrics.reduce((acc, m) => acc + Number(m.volume_cypx_recent || 0), 0);
    
        const volEl = document.getElementById('stat-volume');
        if (volEl) {
            volEl.textContent = totalVol > 0 ? `${totalVol.toLocaleString()} CYPX` : "0 CYPX";
            volEl.title = "Volumen total CYPX en ventas confirmadas (últimos 7 días)";
        }
    
        // Ayuda (solo se agrega una vez)
        if (!document.getElementById('metrics-help')) {
            const help = document.createElement('div');
            help.id = 'metrics-help';
            help.className = 'text-[11px] text-gray-300 bg-gray-900/50 p-3 rounded-lg mb-4 border border-gray-700/60 shadow-sm';
            help.innerHTML = `
                <strong>Guía rápida de oportunidades</strong><br>
                • Solo se muestran ítems con al menos 4 ventas y volumen decente (≥800 CYPX).<br>
                • <span class="text-green-400">OPORTUNIDAD</span> → listado mucho más barato que la última venta conocida<br>
                • <span class="text-amber-400">SUBIENDO</span> → precio actual significativamente más alto que la última venta<br>
                • En mercados pequeños priorizamos la <strong>última venta</strong> sobre promedios históricos.<br>
                • Pasá el mouse por encima para ver detalles.
            `;
            elements.metrics.parentNode.insertBefore(help, elements.metrics);
        }
    
        // Render de las tarjetas (máximo 8)
        elements.metrics.innerHTML = sortedMetrics.slice(0, 8).map(m => {
            const devUlt = Number(m.desviacion_vs_ultima || 0);
            const isOportunidad = devUlt < -20;
            const isSubiendo    = devUlt > 35;
            const isRiesgoso    = Number(m.sales_count_recent || 0) <= 6 || Number(m.volume_cypx_recent || 0) < 1200;
    
            const barWidth = Math.min(Math.abs(devUlt) * 1.6, 100);
            let barColor = 'bg-amber-500';
            let borderColor = 'border-gray-700/50';
    
            if (isOportunidad) { 
                barColor = 'bg-green-500'; 
                borderColor = 'border-green-600/60'; 
            }
            if (isSubiendo) { 
                barColor = 'bg-amber-500'; 
                borderColor = 'border-amber-600/60'; 
            }
    
            let badge = '';
            if (isOportunidad) {
                badge = `<span class="absolute top-2 right-2 bg-green-700/95 text-white text-[9px] px-2.5 py-1 rounded-full font-bold shadow cursor-help" title="Muy por debajo de la última venta conocida – buena chance de compra">OPORTUNIDAD</span>`;
            } else if (isSubiendo) {
                badge = `<span class="absolute top-2 right-2 bg-amber-600/95 text-white text-[9px] px-2.5 py-1 rounded-full font-bold shadow cursor-help" title="Precio actual mucho más alto que la última venta – posible subida">SUBIENDO</span>`;
            }
            if (isRiesgoso && !badge) {
                badge = `<span class="absolute top-2 right-2 bg-gray-600/80 text-white text-[9px] px-2 py-0.5 rounded-full font-medium shadow cursor-help" title="Bajo volumen de ventas → mayor riesgo / volatilidad">bajo vol</span>`;
            }
    
            return `
                <div class="relative bg-gray-900/70 border ${borderColor} p-4 rounded-xl overflow-hidden hover:border-purple-500/50 transition group shadow-md">
                    ${badge}
                    <div class="flex items-center gap-3 mb-3">
                        <img src="${m.imagen_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 object-contain rounded-md" alt="${m.nombre || 'Ítem'}">
                        <div class="min-w-0">
                            <h4 class="text-[10px] font-black text-gray-500 uppercase tracking-wider truncate" title="${m.nombre || 'Sin nombre'}">
                                ${m.nombre || 'Ítem desconocido'}
                            </h4>
                            <div class="text-2xl font-mono font-extrabold text-white leading-none">
                                ${Number(m.current_min_price || 0).toFixed(2)} CYPX
                            </div>
                        </div>
                    </div>
                    <div class="space-y-1.5 text-[9.5px] font-mono">
                        <div class="flex justify-between items-center" title="Diferencia porcentual vs última venta conocida">
                            <span class="text-gray-400">vs última venta</span>
                            <span class="${devUlt < 0 ? 'text-green-400' : devUlt > 0 ? 'text-orange-300' : 'text-gray-400'} font-bold">
                                ${devUlt > 0 ? '+' : ''}${devUlt.toFixed(1)}%
                            </span>
                        </div>
                        <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div class="${barColor} h-full transition-all duration-700" style="width: ${barWidth}%"></div>
                        </div>
                        <div class="flex justify-between text-gray-400">
                            <span>Última venta</span>
                            <span>${Number(m.last_sale_price || '?').toFixed(2)} CYPX</span>
                        </div>
                        <div class="flex justify-between text-gray-400 pt-1 border-t border-gray-700/40">
                            <span>Volumen 7d</span>
                            <span class="text-cyan-300 font-medium">${Number(m.volume_cypx_recent || 0).toLocaleString()} CYPX</span>
                        </div>
                    </div>
                </div>`;
        }).join('');
    };

    // --- RENDERIZADO DE VENTAS ---
    const renderSalesData = (sales) => {
        const salesContainer = document.getElementById('sales-list') || elements.sales;
        if (!salesContainer) return;

        // Cartel explicativo para ventas
        if (!document.getElementById('sales-help') && sales.length > 0) {
        const helpDiv = document.createElement('div');
        helpDiv.id = 'sales-help';
        helpDiv.className = 'text-[11px] text-gray-300 bg-gray-900/50 p-3 rounded-lg mb-3 border border-gray-700/60 shadow-sm';
        helpDiv.innerHTML = `
            <strong>Ventas recientes destacadas</strong><br>
            • Lista de ventas confirmadas importantes.<br>
            • <span class="text-purple-400">WHALE</span> = ventas muy grandes (> 2500 CYPX).<br>
            • Pasá el mouse para ver detalles de cada venta.
        `;
        salesContainer.parentNode.insertBefore(helpDiv, salesContainer);
        }
        
        if (sales.length === 0) {
            salesContainer.innerHTML = `<div class="text-center text-gray-600 text-[10px] py-20 italic">No hay ventas destacadas recientes...</div>`;
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

            const isWhale = Number(totalVenta) > 2500;
            const containerClass = isWhale 
                ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse border-l-4' 
                : 'border-cyan-500/30 bg-gray-900/40 border-l-2';

            return `
                <div class="group ${containerClass} p-3 rounded-r-lg mb-2 flex items-center gap-3 transition-all cursor-help" title="Venta confirmada: ${cantidad} unidades de ${s.nombre} a ${precio} CYPX cada una = ${totalVenta} CYPX total">
                    <div class="relative flex-shrink-0">
                        <img src="${s.imagen_url}" class="w-9 h-9 object-contain ${isWhale ? 'scale-110' : 'opacity-80'} group-hover:opacity-100 transition" title="Ítem vendido">
                        ${isWhale ? '<span class="absolute -top-2 -left-2 text-[12px]" title="Venta grande (whale)">🐋</span>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-mono ${isWhale ? 'text-purple-400 font-black' : 'text-cyan-400 font-bold'}" title="${isWhale ? 'Venta whale (>2500 CYPX)' : 'Venta normal'}">
                                ${isWhale ? 'WHALE: ' : ''}${totalVenta} CYPX
                            </span>
                            <span class="text-[9px] text-gray-500 font-mono" title="Fecha y hora exacta en que se detectó la venta">${horaVenta}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <div class="text-[10px] text-gray-100 font-bold truncate pr-2" title="Nombre del ítem vendido">${s.nombre}</div>
                            <div class="text-[10px] text-white font-mono bg-black/40 px-2 py-0.5 rounded" title="Cantidad vendida en esta transacción">x${cantidad}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    };

    // --- RENDERIZADO DE FILAS (tabla principal) ---
    const renderRows = (data, liquidityData = []) => {
        if (!elements.tbody) return;

        // Cartel explicativo para la tabla
        if (!document.getElementById('table-help')) {
        const helpDiv = document.createElement('div');
        helpDiv.id = 'table-help';
        helpDiv.className = 'text-[11px] text-gray-300 bg-gray-900/50 p-3 rounded-lg mb-3 border border-gray-700/60 shadow-sm';
        helpDiv.innerHTML = `
            <strong>Tabla de ofertas activas</strong><br>
            • Lista de ítems que alguien está vendiendo ahora mismo.<br>
            • Click en el nombre → ves el gráfico de precios de los últimos 30 días.<br>
            • <strong>[🔥 RECIÉN]</strong> = oferta muy nueva y fresca.<br>
            • Pasá el mouse por cualquier celda para ver qué significa.
        `;
        elements.tbody.parentNode.parentNode.insertBefore(helpDiv, elements.tbody.parentNode);
        }
        
        elements.tbody.innerHTML = data.map(item => {
            const fechaFull = new Date(item.listed_at).toLocaleString('es-AR', { 
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
            });
            const precio = Number(item.price).toFixed(2);
            
            const liq = liquidityData.find(l => l.game_id === item.game_id);
            let liqHTML = '';
            
            if (liq) {
                const min = Math.round(liq.minutos_desde_ultima);
                const color = min < 15 ? 'text-green-400' : (min < 60 ? 'text-yellow-500' : 'text-gray-600');
                const label = min < 1 ? 'RECIÉN' : `${min}m`;
                liqHTML = `<span class="${color} text-[9px] font-black tracking-tighter" title="Tiempo desde la última vez que se vio esta oferta actualizada">🔥 ${label}</span>`;
            } else {
                liqHTML = `<span class="text-gray-800 text-[9px] font-mono" title="Oferta antigua o sin actualización reciente en los últimos snapshots">[STALE]</span>`;
            }

            if (item.nombre) {
                return `
                <tr class="hover:bg-white/5 transition border-b border-gray-800/50 group cursor-help" title="Oferta activa de ${item.nombre}: ${item.amount} unidades a ${precio} CYPX cada una">
                    <td class="p-3 font-mono text-cyan-700 text-[10px]" title="ID único del ítem dentro del juego">${item.game_id}</td>
                    <td class="p-3 cursor-pointer group-hover:bg-white/[0.02]" onclick="verHistorialMensual(${item.game_id}, '${item.nombre}')">
                        <div class="flex items-center gap-2">
                            <img src="${item.imagen_url}" class="w-6 h-6 object-contain" title="Imagen del ítem">
                            <div class="flex flex-col leading-tight">
                                <span class="text-sm text-gray-200 font-bold group-hover:text-purple-400 transition" title="Click aquí para ver el gráfico de precios históricos de este ítem (últimos 30 días)">${item.nombre}</span>
                                ${liqHTML}
                            </div>
                        </div>
                    </td>
                    <td class="p-3 font-mono text-green-400 font-bold text-base" title="Precio unitario más bajo de esta oferta actual">${precio} CYPX</td>
                    <td class="p-3 text-xs text-gray-500 font-mono" title="Cantidad total disponible en esta oferta/listado">${item.amount} unidades</td>
                    <td class="p-3 text-[10px] text-gray-600 text-right font-mono" title="Fecha y hora en que se publicó esta oferta">${fechaFull}</td>
                </tr>`;
            } 

            const selector = isAdmin ? `
                <select onchange="vincularGameID(${item.game_id}, this.value)" 
                        class="bg-black text-[9px] border border-red-500/30 rounded p-1 w-full text-red-200 outline-none" title="Selecciona el ítem correspondiente para vincular este game_id">
                    <option value="">❓ VINCULAR...</option>
                    ${materialesLocales.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}
                </select>
            ` : `<span class="text-[9px] text-red-900 font-black" title="Este ID de juego aún no está asociado a ningún ítem conocido en la base">UNKNOWN_ID</span>`;

            return `
            <tr class="bg-red-500/5 border-b border-red-900/20 opacity-70" title="Oferta sin ítem vinculado (solo visible en modo administrador)">
                <td class="p-3 font-mono text-red-500 text-[10px]">${item.game_id}</td>
                <td class="p-3">${selector}</td>
                <td class="p-3 font-mono text-red-400/80 font-bold" title="Precio de la oferta no vinculada">${precio} CYPX</td>
                <td class="p-3 text-xs text-red-300/50" title="Cantidad en esta oferta">${item.amount}</td>
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
        const res = await fetch(`/api/market-history/${gameId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!data || data.length === 0) return;

        // Datos base
        const compra = Number(data[0].compra) || 0;
        let porcentaje = 140;
        let targetTarea = compra * (porcentaje / 100);

        // Preparar datos con relleno de huecos
        const fechas = data.map(d => d.fecha);
        const preciosMinimos = data.map(d => d.precio_minimo ?? null);
        const preciosPromedio = data.map(d => d.precio_promedio ?? null);

        function forwardFill(arr) {
            let ultimo = null;
            return arr.map(v => (v !== null ? (ultimo = v) : ultimo));
        }
        function backwardFill(arr) {
            let primero = null;
            for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i] !== null) { primero = arr[i]; break; }
            }
            return arr.map(v => v ?? primero);
        }

        const preciosMinRellenos = backwardFill(forwardFill(preciosMinimos));
        const preciosPromRellenos = backwardFill(forwardFill(preciosPromedio));

        // Función para colores dinámicos (verde = mercado mejor | rojo = tarea mejor)
        function getMinLineColors(minPrices, target) {
            return minPrices.map(price => {
                const netoMercado = (price || 0) * 0.95; // 5% fee
                return netoMercado >= target ? '#10b981' : '#ef4444';
            });
        }

        // ────────────────────────────────────────────────
        // Controles + recomendación
        // ────────────────────────────────────────────────
        const controlsHTML = `
            <div style="margin:15px 0; text-align:center; color:#9ca3af; font-size:0.95em;">
                <label>Límite tarea: <span id="porcentajeValor">${porcentaje}%</span> de compra (${compra.toFixed(2)})</label><br>
                <input type="range" id="porcentajeTarea" min="50" max="200" value="${porcentaje}" step="5"
                       style="width:70%; accent-color:#f59e0b; margin:8px 0;"><br>
                <small>Valor calculado: <strong id="targetValor">${targetTarea.toFixed(2)}</strong></small><br><br>
                
                <div id="recomendacionHoy" style="font-weight:bold; font-size:1.05em;">
                    <!-- se actualiza con JS -->
                </div>
            </div>
        `;

        const canvas = document.getElementById('canvas-monthly-detail');
        const container = canvas.parentElement;
        let controlsDiv = document.getElementById('controles-porcentaje');

        if (!controlsDiv) {
            controlsDiv = document.createElement('div');
            controlsDiv.id = 'controles-porcentaje';
            controlsDiv.innerHTML = controlsHTML;
            container.insertBefore(controlsDiv, canvas);
        } else {
            controlsDiv.innerHTML = controlsHTML;
        }

        // ────────────────────────────────────────────────
        // Crear gráfico
        // ────────────────────────────────────────────────
        const ctx = canvas.getContext('2d');
        if (detailChart) detailChart.destroy();

        const minColors = getMinLineColors(preciosMinRellenos, targetTarea);

        detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: fechas,
                datasets: [
                    {
                        label: 'Precio Mínimo',
                        data: preciosMinRellenos,
                        borderColor: minColors,
                        borderWidth: 3,
                        tension: 0.25,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: `Tarea (${porcentaje}%): ${targetTarea.toFixed(2)}`,
                        data: Array(fechas.length).fill(targetTarea),
                        borderColor: '#f59e0b',
                        borderDash: [8, 4],
                        pointRadius: 0,
                        borderWidth: 2,
                        fill: false
                    },
                    {
                        label: 'Promedio',
                        data: preciosPromRellenos,
                        borderColor: '#a855f7',
                        borderDash: [4, 2],
                        pointRadius: 0,
                        borderWidth: 2,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: {
                    y: { grid: { color: '#1f2937' }, ticks: { color: '#9ca3af' }, suggestedMax: Math.max(targetTarea * 1.35, 10) },
                    x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
                }
            }
        });

        // ────────────────────────────────────────────────
        // Actualizar recomendación y colores
        // ────────────────────────────────────────────────
        function actualizarRecomendacion() {
            const hoyIndex = preciosMinRellenos.length - 1;
            const precioMinHoy = preciosMinRellenos[hoyIndex] || 0;
            const netoHoy = precioMinHoy * 0.95;
            const diffPct = targetTarea > 0 ? ((netoHoy - targetTarea) / targetTarea) * 100 : 0;

            const recDiv = document.getElementById('recomendacionHoy');
            if (netoHoy >= targetTarea) {
                recDiv.innerHTML = `✅ <span style="color:#10b981">CONVIENE MERCADO</span> (+${diffPct.toFixed(1)}%)`;
            } else {
                recDiv.innerHTML = `❌ <span style="color:#ef4444">CONVIENE TAREA</span> (${diffPct.toFixed(1)}%)`;
            }
        }

        actualizarRecomendacion(); // inicial

        // Listener del slider
        const slider = document.getElementById('porcentajeTarea');
        const porcentajeSpan = document.getElementById('porcentajeValor');
        const targetSpan = document.getElementById('targetValor');

        slider.addEventListener('input', (e) => {
            porcentaje = Number(e.target.value);
            targetTarea = compra * (porcentaje / 100);

            porcentajeSpan.textContent = `${porcentaje}%`;
            targetSpan.textContent = targetTarea.toFixed(2);

            // Actualizar línea naranja
            detailChart.data.datasets[1].label = `Límite Tarea (${porcentaje}%): ${targetTarea.toFixed(2)}`;
            detailChart.data.datasets[1].data = Array(fechas.length).fill(targetTarea);

            // Actualizar colores de la línea de Precio Mínimo
            detailChart.data.datasets[0].borderColor = getMinLineColors(preciosMinRellenos, targetTarea);

            // Ajustar escala Y
            detailChart.options.scales.y.suggestedMax = Math.max(targetTarea * 1.35, 10);

            detailChart.update();
            actualizarRecomendacion();
        });

    } catch (err) {
        console.error("Error al cargar historial:", err);
    }
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