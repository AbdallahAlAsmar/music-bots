const { v4: uuidv4 } = require('uuid');

/**
 * Generate a license key in format: PX-xxxxxxxxxxxxxxxx
 * @param {string} prefix - The prefix for the license key (default: PX)
 * @returns {string} - Generated license key
 */
function generateLicenseKey(prefix = 'PX') {
    const uniqueId = uuidv4().replace(/-/g, '').substring(0, 16);
    return `${prefix}-${uniqueId}`;
}

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} - Whether the IP is valid
 */
function isValidIP(ip) {
    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    
    if (!ipv4Pattern.test(ip)) {
        return false;
    }
    
    // Check each octet is 0-255
    const octets = ip.split('.');
    for (const octet of octets) {
        const num = parseInt(octet, 10);
        if (num < 0 || num > 255) {
            return false;
        }
    }
    
    return true;
}

/**
 * Format a date for display
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Extract IP from FiveM server endpoint format
 * Handles formats like "31.56.120.34:30120" or just "31.56.120.34"
 * @param {string} endpoint - Server endpoint
 * @returns {string} - Extracted IP address
 */
function extractIP(endpoint) {
    if (!endpoint) return null;
    
    // Remove port if present
    const ip = endpoint.split(':')[0];
    return ip;
}

module.exports = {
    generateLicenseKey,
    isValidIP,
    formatDate,
    extractIP
};
