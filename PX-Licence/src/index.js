require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('./database');
const { generateLicenseKey, isValidIP, formatDate } = require('./utils');
const { startAPI } = require('./api');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

const PREFIX = process.env.LICENSE_PREFIX || 'PX';
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

// Slash commands definition
const commands = [
    new SlashCommandBuilder()
        .setName('createlicense')
        .setDescription('Create a new license for a user (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to create a license for')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('server_ip')
                .setDescription('The server IP address')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('editlicense')
        .setDescription('Edit the IP of an existing license (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('license_key')
                .setDescription('The license key to edit')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('new_ip')
                .setDescription('The new IP address')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('change-ip')
        .setDescription('Change the IP address for your license (once per month)')
        .addStringOption(option =>
            option.setName('new_ip')
                .setDescription('The new IP address for your server')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('my-licenses')
        .setDescription('View all your active licenses'),
    new SlashCommandBuilder()
        .setName('license-info')
        .setDescription('Get information about a specific license')
        .addStringOption(option =>
            option.setName('license_key')
                .setDescription('The license key to check')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('all-licenses')
        .setDescription('View all licenses (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('revoke-license')
        .setDescription('Revoke a license (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('license_key')
                .setDescription('The license key to revoke')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('delete-license')
        .setDescription('Permanently delete a license (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('license_key')
                .setDescription('The license key to delete')
                .setRequired(true)
        )
].map(command => command.toJSON());

// Register slash commands
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('[BOT] Registering slash commands...');
        
        if (process.env.GUILD_ID) {
            // Register to specific guild (faster for development)
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
        } else {
            // Register globally
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
        }
        
        console.log('[BOT] ✅ Slash commands registered');
    } catch (error) {
        console.error('[BOT] ❌ Error registering commands:', error);
    }
}

// Check if user is admin
function isAdmin(member) {
    if (!ADMIN_ROLE_ID) {
        return member.permissions.has(PermissionFlagsBits.Administrator);
    }
    return member.roles.cache.has(ADMIN_ROLE_ID) || member.permissions.has(PermissionFlagsBits.Administrator);
}

// Send DM to user about their new license
async function sendLicenseDM(user, licenseKey, serverIp) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎉 License Created for You!')
        .setDescription('A license has been created for your FiveM server!')
        .addFields(
            { name: '🔑 License Key', value: `\`${licenseKey}\``, inline: false },
            { name: '🌐 Server IP', value: `\`${serverIp}\``, inline: false },
            { name: '📝 Instructions', value: 'Add this license key to your `config.lua` file in your FiveM resource.\n\n```lua\nLICENSE_KEY = "' + licenseKey + '"\n```', inline: false }
        )
        .setFooter({ text: `${PREFIX} License System` })
        .setTimestamp();

    try {
        await user.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.log(`[BOT] Could not DM user ${user.tag}: ${error.message}`);
        return false;
    }
}

// Handle message commands (prefix commands)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // !createlicense @user IP
    if (command === 'createlicense') {
        // Check if user is admin
        if (!isAdmin(message.member)) {
            return message.reply('❌ You do not have permission to create licenses.');
        }
        
        // Get mentioned user
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Please mention a user. Usage: `!createlicense @user IP`');
        }
        
        // Get IP address
        const serverIp = args[1];
        if (!serverIp || !isValidIP(serverIp)) {
            return message.reply('❌ Please provide a valid IP address. Usage: `!createlicense @user IP`');
        }
        
        // Generate license key
        const licenseKey = generateLicenseKey(PREFIX);
        
        // Create license in database
        const result = await db.createLicense(licenseKey, targetUser.id, targetUser.tag, serverIp);
        
        if (!result.success) {
            return message.reply(`❌ Failed to create license: ${result.error}`);
        }
        
        // Send confirmation embed in channel
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ License Created')
            .setDescription(`License created for ${targetUser}`)
            .addFields(
                { name: '🔑 License Key', value: `\`${licenseKey}\``, inline: false },
                { name: '🌐 Server IP', value: `\`${serverIp}\``, inline: false }
            )
            .setFooter({ text: `${PREFIX} License System` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        
        // Send DM to user
        const dmSent = await sendLicenseDM(targetUser, licenseKey, serverIp);
        if (!dmSent) {
            message.channel.send(`⚠️ Could not send DM to ${targetUser}. They may have DMs disabled.`);
        }
    }
    
    // !licenses - Show all licenses (admin only)
    if (command === 'licenses') {
        if (!isAdmin(message.member)) {
            return message.reply('❌ You do not have permission to view all licenses.');
        }
        
        const licenses = await db.getAllLicenses();
        
        if (licenses.length === 0) {
            return message.reply('📝 No licenses found.');
        }
        
        let description = '';
        for (const license of licenses.slice(0, 25)) { // Limit to 25
            const status = license.is_active ? '🟢' : '🔴';
            description += `${status} \`${license.license_key}\`\n`;
            description += `   User: <@${license.discord_user_id}> | IP: \`${license.server_ip}\`\n\n`;
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 All Licenses')
            .setDescription(description)
            .setFooter({ text: `Showing ${Math.min(licenses.length, 25)} of ${licenses.length} licenses` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options } = interaction;
    
    // /createlicense (Admin only)
    if (commandName === 'createlicense') {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to create licenses.', ephemeral: true });
        }
        
        const targetUser = options.getUser('user');
        const serverIp = options.getString('server_ip');
        
        if (!isValidIP(serverIp)) {
            return interaction.reply({ content: '❌ Please provide a valid IP address.', ephemeral: true });
        }
        
        // Generate license key
        const licenseKey = generateLicenseKey(PREFIX);
        
        // Create license in database
        const result = await db.createLicense(licenseKey, targetUser.id, targetUser.tag, serverIp);
        
        if (!result.success) {
            return interaction.reply({ content: `❌ Failed to create license: ${result.error}`, ephemeral: true });
        }
        
        // Send confirmation embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ License Created')
            .setDescription(`License created for ${targetUser}`)
            .addFields(
                { name: '🔑 License Key', value: `\`${licenseKey}\``, inline: false },
                { name: '🌐 Server IP', value: `\`${serverIp}\``, inline: false }
            )
            .setFooter({ text: `${PREFIX} License System` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        
        // Send DM to user
        const dmSent = await sendLicenseDM(targetUser, licenseKey, serverIp);
        if (!dmSent) {
            interaction.followUp({ content: `⚠️ Could not send DM to ${targetUser}. They may have DMs disabled.`, ephemeral: true });
        }
    }
    
    // /editlicense (Admin only - bypass 30 day limit)
    if (commandName === 'editlicense') {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to edit licenses.', ephemeral: true });
        }
        
        const licenseKey = options.getString('license_key');
        const newIp = options.getString('new_ip');
        
        if (!isValidIP(newIp)) {
            return interaction.reply({ content: '❌ Please provide a valid IP address.', ephemeral: true });
        }
        
        // Get the license first
        const license = await db.getLicenseByKey(licenseKey);
        
        if (!license) {
            return interaction.reply({ content: '❌ License not found.', ephemeral: true });
        }
        
        // Admin bypass - directly update IP without 30-day check
        const { error } = await require('@supabase/supabase-js')
            .createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
            .from('licenses')
            .update({ server_ip: newIp })
            .eq('license_key', licenseKey);
        
        if (error) {
            return interaction.reply({ content: `❌ Failed to update license: ${error.message}`, ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ License Updated')
            .addFields(
                { name: '🔑 License', value: `\`${licenseKey}\``, inline: false },
                { name: '🌐 Old IP', value: `\`${license.server_ip}\``, inline: true },
                { name: '🌐 New IP', value: `\`${newIp}\``, inline: true },
                { name: '👤 Owner', value: `<@${license.discord_user_id}>`, inline: false }
            )
            .setFooter({ text: 'Admin override - no cooldown applied' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
    
    // /change-ip
    if (commandName === 'change-ip') {
        const newIp = options.getString('new_ip');
        
        if (!isValidIP(newIp)) {
            return interaction.reply({ content: '❌ Please provide a valid IP address.', ephemeral: true });
        }
        
        // Get user's licenses
        const licenses = await db.getLicensesByUserId(interaction.user.id);
        
        if (licenses.length === 0) {
            return interaction.reply({ content: '❌ You do not have any active licenses.', ephemeral: true });
        }
        
        if (licenses.length === 1) {
            // Change IP for the only license
            const result = await db.changeIp(licenses[0].license_key, interaction.user.id, newIp);
            
            if (result.success) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ IP Changed Successfully')
                    .addFields(
                        { name: '🔑 License', value: `\`${licenses[0].license_key}\``, inline: false },
                        { name: '🌐 New IP', value: `\`${newIp}\``, inline: false }
                    )
                    .setFooter({ text: 'You can change your IP again in 30 days' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
            }
        } else {
            // Multiple licenses - show selection menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`change_ip_${newIp}`)
                .setPlaceholder('Select a license to change IP')
                .addOptions(
                    licenses.map(license => ({
                        label: license.license_key,
                        description: `Current IP: ${license.server_ip}`,
                        value: license.license_key
                    }))
                );
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            return interaction.reply({
                content: 'You have multiple licenses. Please select which one to update:',
                components: [row],
                ephemeral: true
            });
        }
    }
    
    // /my-licenses
    if (commandName === 'my-licenses') {
        const licenses = await db.getLicensesByUserId(interaction.user.id);
        
        if (licenses.length === 0) {
            return interaction.reply({ content: '📝 You do not have any active licenses.', ephemeral: true });
        }
        
        let description = '';
        for (const license of licenses) {
            const daysUntilChange = await db.getDaysUntilIpChange(license.license_key);
            const changeStatus = daysUntilChange > 0 ? `⏳ IP change available in ${daysUntilChange} days` : '✅ IP change available';
            
            description += `**License:** \`${license.license_key}\`\n`;
            description += `**IP:** \`${license.server_ip}\`\n`;
            description += `**Created:** ${formatDate(license.created_at)}\n`;
            description += `${changeStatus}\n\n`;
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔑 Your Licenses')
            .setDescription(description)
            .setFooter({ text: `${PREFIX} License System` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // /license-info
    if (commandName === 'license-info') {
        const licenseKey = options.getString('license_key');
        const license = await db.getLicenseByKey(licenseKey);
        
        if (!license) {
            return interaction.reply({ content: '❌ License not found.', ephemeral: true });
        }
        
        // Check if user owns this license or is admin
        if (license.discord_user_id !== interaction.user.id && !isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You can only view your own licenses.', ephemeral: true });
        }
        
        const daysUntilChange = await db.getDaysUntilIpChange(licenseKey);
        const changeStatus = daysUntilChange > 0 ? `⏳ ${daysUntilChange} days` : '✅ Available now';
        
        const embed = new EmbedBuilder()
            .setColor(license.is_active ? 0x00FF00 : 0xFF0000)
            .setTitle('🔍 License Information')
            .addFields(
                { name: '🔑 License Key', value: `\`${license.license_key}\``, inline: false },
                { name: '🌐 Server IP', value: `\`${license.server_ip}\``, inline: true },
                { name: '📊 Status', value: license.is_active ? '🟢 Active' : '🔴 Revoked', inline: true },
                { name: '📅 Created', value: formatDate(license.created_at), inline: true },
                { name: '🔄 IP Change', value: changeStatus, inline: true },
                { name: '👤 Owner', value: `<@${license.discord_user_id}>`, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // /all-licenses (Admin only)
    if (commandName === 'all-licenses') {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }
        
        const licenses = await db.getAllLicenses();
        
        if (licenses.length === 0) {
            return interaction.reply({ content: '📝 No licenses found.', ephemeral: true });
        }
        
        let description = '';
        for (const license of licenses.slice(0, 20)) {
            const status = license.is_active ? '🟢' : '🔴';
            description += `${status} \`${license.license_key}\`\n`;
            description += `   <@${license.discord_user_id}> • \`${license.server_ip}\`\n\n`;
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 All Licenses')
            .setDescription(description)
            .setFooter({ text: `Showing ${Math.min(licenses.length, 20)} of ${licenses.length} licenses` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // /revoke-license (Admin only)
    if (commandName === 'revoke-license') {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }
        
        const licenseKey = options.getString('license_key');
        const revoked = await db.revokeLicense(licenseKey);
        
        if (revoked) {
            return interaction.reply({ content: `✅ License \`${licenseKey}\` has been revoked.`, ephemeral: true });
        } else {
            return interaction.reply({ content: '❌ License not found.', ephemeral: true });
        }
    }
    
    // /delete-license (Admin only)
    if (commandName === 'delete-license') {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }
        
        const licenseKey = options.getString('license_key');
        const deleted = await db.deleteLicense(licenseKey);
        
        if (deleted) {
            return interaction.reply({ content: `✅ License \`${licenseKey}\` has been permanently deleted.`, ephemeral: true });
        } else {
            return interaction.reply({ content: '❌ License not found.', ephemeral: true });
        }
    }
});

// Handle select menu interactions (for multiple licenses IP change)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    
    if (interaction.customId.startsWith('change_ip_')) {
        const newIp = interaction.customId.replace('change_ip_', '');
        const licenseKey = interaction.values[0];
        
        const result = await db.changeIp(licenseKey, interaction.user.id, newIp);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ IP Changed Successfully')
                .addFields(
                    { name: '🔑 License', value: `\`${licenseKey}\``, inline: false },
                    { name: '🌐 New IP', value: `\`${newIp}\``, inline: false }
                )
                .setFooter({ text: 'You can change your IP again in 30 days' })
                .setTimestamp();
            
            return interaction.update({ embeds: [embed], components: [] });
        } else {
            return interaction.update({ content: `❌ ${result.message}`, components: [] });
        }
    }
});

// Bot ready event
client.once('ready', async () => {
    console.log(`[BOT] ✅ Logged in as ${client.user.tag}`);
    
    // Register slash commands
    await registerCommands();
    
    // Start the API server
    const apiPort = process.env.API_PORT || 20605;
    const apiHost = process.env.API_HOST || '0.0.0.0';
    await startAPI(apiPort, apiHost);
    
    console.log('[BOT] 🚀 PX License System is fully operational!');
});

// Error handling
client.on('error', (error) => {
    console.error('[BOT] Client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('[BOT] Unhandled rejection:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
