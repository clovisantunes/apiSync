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
        };

        console.log('📤 Payload:', JSON.stringify(payload, null, 2));

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
            console.error('Dados:', JSON.stringify(error.response.data, null, 2));
        }

        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message || 'Erro ao gerar Pix'
        });
    }
});

// ===== ROTA: VERIFICAR STATUS (CORRETA) =====
app.get('/api/status/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;

        console.log(`🔍 Verificando status: ${identifier}`);

        // Obtém token válido
        const token = await getToken();

        // Consulta a SyncPay
        const response = await axios.get(
            `${SYNC_CONFIG.baseURL}/api/partner/v1/cash-in/${identifier}/status`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        console.log(`📥 Status retornado:`, response.data);

        // Retorna o status real
        res.json({
            status: response.data.status,
            identifier: identifier,
            message: response.data.message || 'Status atualizado'
        });

    } catch (error) {
        console.error('❌ Erro ao verificar status:', error.message);

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Dados:', JSON.stringify(error.response.data, null, 2));
        }

        // Se não encontrar, retorna pending (não quebra o front)
        res.status(200).json({
            status: 'pending',
            identifier: req.params.identifier,
            message: 'Aguardando pagamento...'
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
module.exports = app;