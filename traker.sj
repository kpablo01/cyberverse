(function() {
    const MI_API_URL = 'https://cyberverse-excs.onrender.com/api/update-market-snapshot';
    const nativeSend = WebSocket.prototype.send;

    WebSocket.prototype.send = function(data) {
        if (!this.addedMarketListener) {
            this.addEventListener('message', function(msg) {
                // Filtramos el mensaje que contiene la lista "ls"
                if (msg.data.includes('"ls":[')) {
                    try {
                        const cleanData = msg.data.replace(/^\d+/, '');
                        const parsed = JSON.parse(cleanData);
                        const marketData = parsed[2]; 

                        if (marketData && marketData.ls) {
                            console.log(`📦 Capturados ${marketData.ls.length} items. Sincronizando...`);

                            fetch(MI_API_URL, {
                                method: 'POST',
                                mode: 'cors', // Importante para evitar bloqueos
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ls: marketData.ls })
                            })
                            .then(r => r.json())
                            .then(res => {
                                console.log(`✅ Backend: ${res.processed} procesados, ${res.updated_materials} materiales actualizados.`);
                            })
                            .catch(e => console.error("❌ Error enviando a la API:", e));
                        }
                    } catch (e) {
                        // Mensaje no procesable, ignorar
                    }
                }
            });
            this.addedMarketListener = true;
            console.log("🛰️ Interceptor de Market activo. Escuchando paquetes...");
        }
        return nativeSend.apply(this, arguments);
    };
})();