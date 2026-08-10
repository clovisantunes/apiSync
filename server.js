const app = require('./api/index');

const PORT = 3000;

app.listen(PORT, async () => {
    console.log(`🚀 Servidor em http://localhost:${PORT}`);
    console.log(`📍 /api/pagar - Gerar Pix`);
    console.log(`📍 /api/status/:id - Verificar status`);

    try {
        console.log('🔑 Obtendo token inicial...');
        
        // O token será obtido automaticamente
        // na primeira requisição para /api/pagar ou /api/health
        
        console.log('✅ Servidor iniciado com sucesso!');
    } catch (error) {
        console.log('❌ ERRO AO INICIAR:', error.message);
    }
});