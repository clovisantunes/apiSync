require('dotenv').config();
// =============================================
// BACKEND - INTEGRAÇÃO SYNCPAY (SEM SPLIT)
// =============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// ===== CONFIGURAÇÃO =====
const SYNC_CONFIG = {
    baseURL: process.env.SYNCPAY_BASE_URL,
    clientId: process.env.SYNCPAY_CLIENT_ID,
    clientSecret: process.env.SYNCPAY_CLIENT_SECRET,
    webhookUrl: process.env.SYNCPAY_WEBHOOK_URL
};

let bearerToken = null;
let tokenExpiresAt = null;

// ===== OBTER TOKEN =====
async function obterToken() {
    try {
        console.log('🔑 Gerando token...');

        const response = await axios.post(
            `${SYNC_CONFIG.baseURL}/api/partner/v1/auth-token`,
            {
                client_id: SYNC_CONFIG.clientId,
                client_secret: SYNC_CONFIG.clientSecret
            },
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        bearerToken = response.data.access_token;
        tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
        
        console.log('✅ Token gerado com sucesso!');
        return bearerToken;
        
    } catch (error) {
        console.error('❌ Erro ao gerar token:');

        if (error.response) {
            console.error('Dados:', error.response.data);
        }

        throw error;
    }
}

async function getToken() {
    if (!bearerToken || Date.now() >= tokenExpiresAt) {
        await obterToken();
    }

    return bearerToken;
}

// ===== MIDDLEWARES =====
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.options('*', cors());
app.use(express.json());

// ===== ROTA: GERAR PIX =====
app.post('/api/pagar', async (req, res) => {
    try {
        console.log('📍 Gerando Pix...');

        const {
            valor,
            descricao,
            nomeCliente,
            cpfCliente,
            emailCliente,
            telefoneCliente
        } = req.body;

        if (!valor || valor <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valor inválido'
            });
        }

        const token = await getToken();

        // ⚠️ SEM SPLIT - O DINHEIRO VAI DIRETO PRA VOCÊ!
        const payload = {
            amount: parseFloat(valor),
            description: descricao || 'Conteúdo exclusivo',
            webhook_url: SYNC_CONFIG.webhookUrl,
            client: {
                name: nomeCliente,
                cpf: cpfCliente.replace(/\D/g, ''),
                email: emailCliente,
                phone: telefoneCliente.replace(/\D/g, '')
            }
            // ← NÃO TEM SPLIT AQUI, PORRA!
        };

        console.log(
            '📤 Payload:',
            JSON.stringify(payload, null, 2)
        );

        const response = await axios.post(
            `${SYNC_CONFIG.baseURL}/api/partner/v1/cash-in`,
            payload,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Pix gerado com sucesso!');

        res.json({
            success: true,
            data: {
                identifier: response.data.identifier,
                pixCode: response.data.pix_code,
                amount: parseFloat(valor)
            }
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error(
                'Dados:',
                JSON.stringify(error.response.data, null, 2)
            );
        }

        res.status(500).json({
            success: false,
            error:
                error.response?.data?.message ||
                error.message ||
                'Erro ao gerar Pix'
        });
    }
});

// ===== ROTA: VERIFICAR STATUS =====
// ===== ROTA: VERIFICAR STATUS (SIMULADO) =====
app.get('/api/status/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;

        console.log(
            `🔍 Verificando status: ${identifier}`
        );

        // 🔥 SIMULAÇÃO - DEPOIS DE 10 SEGUNDOS, MARCA COMO PAGO
        // Na vida real, você usaria o webhook da SyncPay
        
        const dataCriacao =
            parseInt(identifier.split('_')[1]) || Date.now();

        const tempoPassado =
            Date.now() - dataCriacao;
        
        // Se passou mais de 10 segundos, considera pago (SIMULAÇÃO)
        const isPaid = tempoPassado > 10000;
        
        res.json({
            status: isPaid ? 'paid' : 'pending',
            identifier: identifier,
            message: isPaid
                ? 'Pagamento confirmado!'
                : 'Aguardando pagamento...'
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===== ROTA: HEALTH =====
app.get('/api/health', async (req, res) => {
    try {
        await getToken();

        res.json({
            status: 'online',
            tokenValido: !!bearerToken
        });

    } catch (error) {
        res.json({
            status: 'erro',
            message: error.message
        });
    }
});

// ===== VERCEL =====
// A Vercel executa o Express como Serverless Function.
// Não usamos app.listen() aqui.

module.exports = app;