const express = require('express');
const db = require('./database');
const { extractIP } = require('./utils');

const app = express();
app.use(express.json());

/**
 * License validation endpoint for FiveM servers
 * GET /validate
 * Query params: license, server_ip
 */
app.get('/validate', async (req, res) => {
    const licenseKey = req.query.license || req.headers.license;
    let serverIp = req.query.server_ip || req.headers.server_ip;
    
    console.log(`[API] Validation request - License: ${licenseKey}, IP: ${serverIp}`);
    
    if (!licenseKey) {
        return res.status(400).json({
            success: false,
            message: 'License key is required'
        });
    }
    
    if (!serverIp || serverIp === 'unknown') {
        // Try to get IP from request
        serverIp = req.ip || req.connection.remoteAddress;
    }
    
    // Extract just the IP if it includes a port
    serverIp = extractIP(serverIp);
    
    const result = await db.validateLicense(licenseKey, serverIp);
    
    if (result.valid) {
        console.log(`[API] ✅ License valid for ${licenseKey}`);
        return res.status(200).json({
            success: true,
            message: 'License is valid',
            data: {
                license_key: result.license.license_key,
                server_ip: result.license.server_ip,
                created_at: result.license.created_at
            }
        });
    } else {
        console.log(`[API] ❌ License invalid: ${result.message}`);
        return res.status(200).json({
            success: false,
            message: result.message
        });
    }
});

/**
 * Check license status (without IP validation)
 * GET /check
 */
app.get('/check', async (req, res) => {
    const licenseKey = req.query.license || req.headers.license;
    
    if (!licenseKey) {
        return res.status(400).json({
            success: false,
            message: 'License key is required'
        });
    }
    
    const license = await db.getLicenseByKey(licenseKey);
    
    if (license && license.is_active) {
        return res.status(200).json({
            success: true,
            exists: true,
            data: {
                server_ip: license.server_ip,
                created_at: license.created_at
            }
        });
    } else {
        return res.status(200).json({
            success: false,
            exists: false,
            message: 'License not found or inactive'
        });
    }
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'PX License API is running',
        timestamp: new Date().toISOString()
    });
});

/**
 * API info endpoint
 * GET /
 */
app.get('/', (req, res) => {
    res.status(200).json({
        name: 'PX License API',
        version: '1.0.0',
        endpoints: {
            validate: 'GET /validate?license=KEY&server_ip=IP',
            check: 'GET /check?license=KEY',
            health: 'GET /health'
        }
    });
});

function startAPI(port = 20605, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
            console.log(`[API] 🚀 License API running on http://${host}:${port}`);
            resolve(server);
        });
        
        server.on('error', (error) => {
            console.error('[API] ❌ Failed to start API:', error.message);
            reject(error);
        });
    });
}

module.exports = { app, startAPI };
