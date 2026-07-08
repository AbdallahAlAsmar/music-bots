const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[DATABASE] ❌ SUPABASE_URL and SUPABASE_KEY are required in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('[DATABASE] ✅ Connected to Supabase');

// Create a new license
async function createLicense(licenseKey, discordUserId, discordUsername, serverIp) {
    try {
        const { data, error } = await supabase
            .from('licenses')
            .insert({
                license_key: licenseKey,
                discord_user_id: discordUserId,
                discord_username: discordUsername,
                server_ip: serverIp
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }
        
        return { success: true, id: data.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Get license by key
async function getLicenseByKey(licenseKey) {
    const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', licenseKey)
        .single();
    
    if (error) return null;
    return data;
}

// Get licenses by user ID
async function getLicensesByUserId(discordUserId) {
    const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('discord_user_id', discordUserId)
        .eq('is_active', true);
    
    if (error) return [];
    return data || [];
}

// Validate license (check key and IP)
async function validateLicense(licenseKey, serverIp) {
    const { data: license, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', licenseKey)
        .eq('is_active', true)
        .single();
    
    if (error || !license) {
        return { valid: false, message: 'License not found' };
    }
    
    if (license.server_ip !== serverIp) {
        return { valid: false, message: 'IP mismatch. License is registered to a different IP.' };
    }
    
    return { valid: true, license };
}

// Change IP for a license
async function changeIp(licenseKey, discordUserId, newIp) {
    // First check if user owns this license
    const license = await getLicenseByKey(licenseKey);
    
    if (!license) {
        return { success: false, message: 'License not found' };
    }
    
    if (license.discord_user_id !== discordUserId) {
        return { success: false, message: 'You do not own this license' };
    }
    
    // Check if IP was changed in the last 30 days
    if (license.last_ip_change) {
        const lastChange = new Date(license.last_ip_change);
        const now = new Date();
        const daysSinceChange = (now - lastChange) / (1000 * 60 * 60 * 24);
        
        if (daysSinceChange < 30) {
            const daysRemaining = Math.ceil(30 - daysSinceChange);
            return { 
                success: false, 
                message: `You can only change your IP once per month. Please wait ${daysRemaining} more day(s).` 
            };
        }
    }
    
    // Update the IP
    const { error } = await supabase
        .from('licenses')
        .update({ 
            server_ip: newIp, 
            last_ip_change: new Date().toISOString() 
        })
        .eq('license_key', licenseKey);
    
    if (error) {
        return { success: false, message: error.message };
    }
    
    return { success: true, message: 'IP updated successfully' };
}

// Revoke a license
async function revokeLicense(licenseKey) {
    const { data, error } = await supabase
        .from('licenses')
        .update({ is_active: false })
        .eq('license_key', licenseKey)
        .select();
    
    return !error && data && data.length > 0;
}

// Delete a license completely
async function deleteLicense(licenseKey) {
    const { data, error } = await supabase
        .from('licenses')
        .delete()
        .eq('license_key', licenseKey)
        .select();
    
    return !error && data && data.length > 0;
}

// Get all licenses (admin)
async function getAllLicenses() {
    const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) return [];
    return data || [];
}

// Check days until IP change is allowed
async function getDaysUntilIpChange(licenseKey) {
    const license = await getLicenseByKey(licenseKey);
    
    if (!license) return null;
    if (!license.last_ip_change) return 0;
    
    const lastChange = new Date(license.last_ip_change);
    const now = new Date();
    const daysSinceChange = (now - lastChange) / (1000 * 60 * 60 * 24);
    
    if (daysSinceChange >= 30) return 0;
    return Math.ceil(30 - daysSinceChange);
}

module.exports = {
    createLicense,
    getLicenseByKey,
    getLicensesByUserId,
    validateLicense,
    changeIp,
    revokeLicense,
    deleteLicense,
    getAllLicenses,
    getDaysUntilIpChange
};
