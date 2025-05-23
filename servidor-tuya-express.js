const express = require('express');
const cors = require('cors');
const qs = require('qs');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Servir archivos estáticos

// Configuración de Tuya
const config = {
    host: 'https://openapi.tuyaus.com',
    accessKey: process.env.TUYA_ACCESS_KEY || 'a7fy5t5vwayqe85tp4hq',
    secretKey: process.env.TUYA_SECRET_KEY || '7f9b1392ba3349968d92c64ecc3a11b0',
    deviceId: process.env.TUYA_DEVICE_ID || 'eb375f2eacf9c57a235qdq',
};

let token = '';

const httpClient = axios.create({
    baseURL: config.host,
    timeout: 10000,
});

// Función para obtener token
async function getToken() {
    try {
        const method = 'GET';
        const timestamp = Date.now().toString();
        const signUrl = '/v1.0/token?grant_type=1';
        const contentHash = crypto.createHash('sha256').update('').digest('hex');
        const stringToSign = [method, contentHash, '', signUrl].join('\n');
        const signStr = config.accessKey + timestamp + stringToSign;

        const headers = {
            t: timestamp,
            sign_method: 'HMAC-SHA256',
            client_id: config.accessKey,
            sign: await encryptStr(signStr, config.secretKey),
        };

        const { data: login } = await httpClient.get('/v1.0/token?grant_type=1', { headers });

        if (!login || !login.success) {
            throw new Error(`fetch failed: ${login.msg}`);
        }

        token = login.result.access_token;
        console.log('Token obtenido exitosamente');
        return token;
    } catch (error) {
        console.error('Error obteniendo token:', error.message);
        throw error;
    }
}

// Función para encriptar
async function encryptStr(str, secret) {
    return crypto.createHmac('sha256', secret).update(str, 'utf8').digest('hex').toUpperCase();
}

// Función para generar firma de petición
async function getRequestSign(path, method, headers = {}, query = {}, body = {}) {
    const t = Date.now().toString();
    const [uri, pathQuery] = path.split('?');
    const queryMerged = Object.assign(query, qs.parse(pathQuery));
    const sortedQuery = {};

    Object.keys(queryMerged)
        .sort()
        .forEach((i) => (sortedQuery[i] = queryMerged[i]));

    const querystring = decodeURIComponent(qs.stringify(sortedQuery));
    const url = querystring ? `${uri}?${querystring}` : uri;
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const stringToSign = [method, contentHash, '', url].join('\n');
    const signStr = config.accessKey + token + t + stringToSign;

    return {
        t,
        path: url,
        client_id: config.accessKey,
        sign: await encryptStr(signStr, config.secretKey),
        sign_method: 'HMAC-SHA256',
        access_token: token,
    };
}

// Función para controlar el dispositivo
async function controlDevice(deviceId, command, value) {
    try {
        // Verificar si tenemos token válido
        if (!token) {
            await getToken();
        }

        const body = {
            commands: [
                {
                    code: command,
                    value: value
                }
            ]
        };

        const method = 'POST';
        const url = `/v1.0/devices/${deviceId}/commands`;
        const reqHeaders = await getRequestSign(url, method, {}, {}, body);

        const { data } = await httpClient.request({
            method,
            data: body,
            params: {},
            headers: reqHeaders,
            url: reqHeaders.path,
        });

        if (!data || !data.success) {
            throw new Error(`request api failed: ${data.msg}`);
        }

        return data;
    } catch (error) {
        console.error('Error controlando dispositivo:', error.message);
        throw error;
    }
}

// Función para obtener información del dispositivo
async function getDeviceInfo(deviceId) {
    try {
        if (!token) {
            await getToken();
        }

        const method = 'GET';
        const url = `/v1.0/devices/${deviceId}`;
        const reqHeaders = await getRequestSign(url, method, {}, {}, {});

        const { data } = await httpClient.request({
            method,
            params: {},
            headers: reqHeaders,
            url: reqHeaders.path,
        });

        if (!data || !data.success) {
            throw new Error(`request api failed: ${data.msg}`);
        }

        return data;
    } catch (error) {
        console.error('Error obteniendo info del dispositivo:', error.message);
        throw error;
    }
}

// ENDPOINTS

// Ruta principal - servir la interfaz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        hasToken: !!token,
        config: {
            hasAccessKey: !!config.accessKey,
            hasSecretKey: !!config.secretKey,
            hasDeviceId: !!config.deviceId,
            environment: process.env.NODE_ENV || 'development'
        }
    });
});

// Endpoint para encender el dispositivo
app.post('/device/on', async (req, res) => {
    try {
        const result = await controlDevice(config.deviceId, 'switch_led', true);
        res.json({
            success: true,
            message: 'Dispositivo encendido',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error encendiendo dispositivo',
            error: error.message
        });
    }
});

// Endpoint para apagar el dispositivo
app.post('/device/off', async (req, res) => {
    try {
        const result = await controlDevice(config.deviceId, 'switch_led', false);
        res.json({
            success: true,
            message: 'Dispositivo apagado',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error apagando dispositivo',
            error: error.message
        });
    }
});

// Endpoint para controlar el dispositivo con parámetros personalizados
app.post('/device/control', async (req, res) => {
    try {
        const { command, value, deviceId } = req.body;

        if (!command || value === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Faltan parámetros: command y value son requeridos'
            });
        }

        const targetDeviceId = deviceId || config.deviceId;
        const result = await controlDevice(targetDeviceId, command, value);

        res.json({
            success: true,
            message: 'Comando enviado exitosamente',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error controlando dispositivo',
            error: error.message
        });
    }
});

// Endpoint para obtener información del dispositivo
app.get('/device/info', async (req, res) => {
    try {
        const result = await getDeviceInfo(config.deviceId);
        res.json({
            success: true,
            message: 'Información obtenida exitosamente',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo información del dispositivo',
            error: error.message
        });
    }
});

// Endpoint para obtener información de dispositivo específico
app.get('/device/:deviceId/info', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const result = await getDeviceInfo(deviceId);
        res.json({
            success: true,
            message: 'Información obtenida exitosamente',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error obteniendo información del dispositivo',
            error: error.message
        });
    }
});

// Endpoint para renovar token manualmente
app.post('/token/refresh', async (req, res) => {
    try {
        await getToken();
        res.json({
            success: true,
            message: 'Token renovado exitosamente'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error renovando token',
            error: error.message
        });
    }
});

// Middleware para manejo de errores
app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
    });
});

// Inicializar servidor
async function startServer() {
    try {
        // Obtener token inicial
        await getToken();
        console.log('Token inicial obtenido');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor corriendo en puerto ${PORT}`);
            console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Endpoints disponibles:`);
            console.log(`  GET  / - Interfaz web`);
            console.log(`  GET  /health - Estado del servidor`);
            console.log(`  POST /device/on - Encender dispositivo`);
            console.log(`  POST /device/off - Apagar dispositivo`);
            console.log(`  POST /device/control - Control personalizado`);
            console.log(`  GET  /device/info - Info del dispositivo`);
            console.log(`  GET  /device/:deviceId/info - Info de dispositivo específico`);
            console.log(`  POST /token/refresh - Renovar token`);
        });
    } catch (error) {
        console.error('Error iniciando servidor:', error);
        process.exit(1);
    }
}

// Renovar token cada 2 horas
setInterval(async () => {
    try {
        await getToken();
        console.log('Token renovado automáticamente');
    } catch (error) {
        console.error('Error renovando token automáticamente:', error);
    }
}, 2 * 60 * 60 * 1000); // 2 horas

startServer();