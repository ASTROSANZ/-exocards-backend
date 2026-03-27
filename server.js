const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PIXGO_API_KEY = process.env.PIXGO_API_KEY;
const PIXGO_WEBHOOK_SECRET = process.env.PIXGO_WEBHOOK_SECRET;
const PIXGO_BASE_URL = 'https://pixgo.org/api/v1';

// ─── Criar pagamento PIX ───────────────────────────────────────────────────
app.post('/api/criar-pagamento', async (req, res) => {
    const { valor, descricao } = req.body;

    if (!valor || isNaN(valor) || Number(valor) < 10) {
        return res.status(400).json({ success: false, message: 'Valor inválido. Mínimo R$10,00.' });
    }

    try {
        const response = await fetch(`${PIXGO_BASE_URL}/payment/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': PIXGO_API_KEY
            },
            body: JSON.stringify({
                amount: Number(valor),
                description: descricao || 'Compra EXOCARDS',
                external_id: `exocards_${Date.now()}`
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            return res.status(400).json({ success: false, message: data.message || 'Erro ao criar pagamento.' });
        }

        return res.json({
            success: true,
            payment_id: data.data.payment_id,
            qr_code: data.data.qr_code,
            qr_image_url: data.data.qr_image_url,
            expires_at: data.data.expires_at,
            amount: data.data.amount
        });

    } catch (err) {
        console.error('Erro ao criar pagamento:', err);
        return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

// ─── Verificar status do pagamento ────────────────────────────────────────
app.get('/api/status-pagamento/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const response = await fetch(`${PIXGO_BASE_URL}/payment/${id}/status`, {
            headers: { 'X-API-Key': PIXGO_API_KEY }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            return res.status(400).json({ success: false, message: 'Erro ao verificar status.' });
        }

        return res.json({
            success: true,
            status: data.data.status,
            payment_id: data.data.payment_id,
            amount: data.data.amount
        });

    } catch (err) {
        console.error('Erro ao verificar status:', err);
        return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

// ─── Webhook PixGo ─────────────────────────────────────────────────────────
app.post('/webhook/pixgo', express.raw({ type: 'application/json' }), (req, res) => {
    const timestamp = req.headers['x-webhook-timestamp'];
    const signature = req.headers['x-webhook-signature'];
    const payload = req.body.toString();

    const signaturePayload = timestamp + '.' + payload;
    const expected = crypto
        .createHmac('sha256', PIXGO_WEBHOOK_SECRET)
        .update(signaturePayload)
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
        return res.status(401).json({ error: 'Assinatura inválida' });
    }

    if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
        return res.status(401).json({ error: 'Timestamp expirado' });
    }

    const data = JSON.parse(payload);
    console.log(`[Webhook] Evento: ${data.event} | ID: ${data.data?.payment_id} | Valor: R$${data.data?.amount}`);

    // Aqui você pode salvar em banco, enviar email, etc.

    return res.status(200).json({ received: true });
});

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'EXOCARDS Backend' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EXOCARDS Backend rodando na porta ${PORT}`));
