--[[
    PX License Verification System
    This script validates your license on server start
]]

-- API URL (hardcoded - do not modify)
local API_URL = "https://3rd81l1n-20605.euw.devtunnels.ms"

-- Flag to track license status
local licenseValid = false

-- Function to shutdown server (FiveM compatible)
local function shutdownServer(reason)
    print("^1[PX LICENSE] ====================================^0")
    print("^1[PX LICENSE] " .. reason .. "^0")
    print("^1[PX LICENSE] SERVER BLOCKED - LICENSE INVALID^0")
    print("^1[PX LICENSE] ====================================^0")
    
    -- Block the server by stopping all player connections
    AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
        deferrals.defer()
        deferrals.done("[PX LICENSE] Server is not licensed. Contact the server owner.")
    end)
    
    -- Kick all current players
    for _, playerId in ipairs(GetPlayers()) do
        DropPlayer(playerId, "[PX LICENSE] Server license validation failed.")
    end
    
    -- Stop all other resources to make server unusable
    Citizen.CreateThread(function()
        Citizen.Wait(1000)
        for i = 0, GetNumResources() - 1 do
            local resourceName = GetResourceByFindIndex(i)
            if resourceName and resourceName ~= GetCurrentResourceName() and resourceName ~= "hardcap" and resourceName ~= "sessionmanager" then
                StopResource(resourceName)
            end
        end
    end)
end

-- Load license key from config
local function loadLicenseKey()
    local configFile = LoadResourceFile(GetCurrentResourceName(), "config.lua")
    if not configFile then
        print("^1[PX LICENSE] ERROR: config.lua not found^0")
        return nil
    end
    
    -- Extract LICENSE_KEY
    local licenseKey = string.match(configFile, 'LICENSE_KEY%s*=%s*["\']([^"\']+)["\']')
    
    if not licenseKey then
        print("^1[PX LICENSE] ERROR: LICENSE_KEY not found in config.lua^0")
        return nil
    end
    
    return licenseKey
end

-- Get server's public IP using external service
local serverIP = nil

local function fetchServerIP(callback)
    -- Use multiple IP detection services as fallback
    local ipServices = {
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://icanhazip.com"
    }
    
    local function tryService(index)
        if index > #ipServices then
            -- All services failed, try to get from convars
            local endpoint = GetConvar("sv_listingHostOverride", "")
            if endpoint and endpoint ~= "" then
                local ip = string.match(endpoint, "([%d%.]+)")
                if ip then
                    callback(ip)
                    return
                end
            end
            
            -- Try web_baseUrl
            local webUrl = GetConvar("web_baseUrl", "")
            if webUrl and webUrl ~= "" then
                local ip = string.match(webUrl, "([%d]+%.[%d]+%.[%d]+%.[%d]+)")
                if ip then
                    callback(ip)
                    return
                end
            end
            
            callback(nil)
            return
        end
        
        PerformHttpRequest(ipServices[index], function(statusCode, response, headers)
            if statusCode == 200 and response then
                local ip = string.match(response, "([%d]+%.[%d]+%.[%d]+%.[%d]+)")
                if ip then
                    callback(ip)
                    return
                end
            end
            -- Try next service
            tryService(index + 1)
        end, "GET")
    end
    
    tryService(1)
end

-- Main verification function
local function verifyLicense()
    local licenseKey = loadLicenseKey()
    
    if not licenseKey then
        shutdownServer("CONFIGURATION ERROR!")
        return
    end
    
    if licenseKey == "PX-YOUR-LICENSE-KEY-HERE" then
        shutdownServer("Please replace the default license key!")
        return
    end
    
    print("^3[PX LICENSE] Detecting server IP...^0")
    
    fetchServerIP(function(detectedIP)
        if not detectedIP then
            shutdownServer("FAILED TO DETECT SERVER IP!")
            return
        end
        
        serverIP = detectedIP
        
        local validateUrl = API_URL .. "/validate?license=" .. licenseKey .. "&server_ip=" .. serverIP
        
        print("^3[PX LICENSE] Validating license...^0")
        print("^3[PX LICENSE] License: " .. licenseKey .. "^0")
        print("^3[PX LICENSE] Server IP: " .. serverIP .. "^0")
        
        PerformHttpRequest(validateUrl, function(statusCode, response, headers)
            if statusCode == 200 then
                local data = json.decode(response)
                if data and data.success then
                    print("^2[PX LICENSE] ====================================^0")
                    print("^2[PX LICENSE] ✓ LICENSE VERIFIED SUCCESSFULLY!^0")
                    print("^2[PX LICENSE] License: " .. licenseKey .. "^0")
                    print("^2[PX LICENSE] Server IP: " .. serverIP .. "^0")
                    print("^2[PX LICENSE] ====================================^0")
                else
                    local errorMsg = data and data.message or "Unknown error"
                    shutdownServer("LICENSE VERIFICATION FAILED: " .. errorMsg)
                end
            else
                shutdownServer("FAILED TO CONNECT TO LICENSE SERVER! Status: " .. tostring(statusCode))
            end
        end, "GET", "", {
            ["Content-Type"] = "application/json"
        })
    end)
end

-- Run verification on resource start
Citizen.CreateThread(function()
    Citizen.Wait(2000) -- Wait for server to fully initialize
    verifyLicense()
end)

-- Command to manually re-verify license (console only)
RegisterCommand("pxverify", function(source, args, rawCommand)
    if source == 0 then
        verifyLicense()
    else
        print("^1[PX LICENSE] This command can only be run from the console.^0")
    end
end, true)

-- Command to check current detected IP (console only)
RegisterCommand("pxip", function(source, args, rawCommand)
    if source == 0 then
        if serverIP then
            print("^2[PX LICENSE] Current Server IP: " .. serverIP .. "^0")
        else
            print("^3[PX LICENSE] Server IP not yet detected. Run 'pxverify' first.^0")
        end
    end
end, true)

print("^5[PX LICENSE] PX License System Loaded^0")
