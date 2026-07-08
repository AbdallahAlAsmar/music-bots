$dir = Join-Path $PSScriptRoot "svg"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function New-Icon {
  param([string]$Name, [string]$Body)
  $svg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <g fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
$Body
  </g>
</svg>
"@
    Set-Content -Path (Join-Path $dir ("$Name.svg")) -Value $svg -Encoding UTF8
}

$templates = @{}
$templates["pencil"] = @"
    <path d="M22 98h28"/>
    <path d="M34 90l44-44 16 16-44 44-20 4z"/>
    <path d="M78 46l8-8a8 8 0 0 1 12 0l4 4a8 8 0 0 1 0 12l-8 8"/>
"@
$templates["user"] = @"
    <circle cx="64" cy="42" r="16"/>
    <path d="M24 104c8-18 22-28 40-28s32 10 40 28"/>
"@
$templates["banner"] = @"
    <rect x="16" y="26" width="96" height="76" rx="8"/>
    <path d="M24 84l20-22 18 18 16-14 26 20"/>
    <circle cx="42" cy="46" r="6"/>
"@
$templates["mic"] = @"
    <path d="M52 34a12 12 0 0 1 24 0v20a12 12 0 0 1-24 0z"/>
    <path d="M40 58a24 24 0 0 0 48 0"/>
    <path d="M64 82v16"/>
    <path d="M48 98h32"/>
"@
$templates["pulse"] = @"
    <path d="M16 72h20l10-24 14 44 12-28h40"/>
"@
$templates["presence"] = @"
    <circle cx="64" cy="64" r="36"/>
    <circle cx="88" cy="88" r="8" fill="#FFFFFF" stroke="none"/>
"@
$templates["home"] = @"
    <path d="M20 58l44-30 44 30v42H20z"/>
    <path d="M48 100V74h32v26"/>
"@
$templates["shield"] = @"
    <path d="M64 20l30 12v24c0 24-18 38-30 46-12-8-30-22-30-46V32z"/>
    <path d="M64 44v24"/>
    <path d="M52 56h24"/>
"@
$templates["users"] = @"
    <circle cx="48" cy="46" r="12"/>
    <circle cx="82" cy="50" r="10"/>
    <path d="M24 98c6-14 14-22 24-22s18 8 24 22"/>
    <path d="M66 98c4-10 10-16 18-16s14 6 18 16"/>
"@
$templates["globe"] = @"
    <circle cx="64" cy="64" r="40"/>
    <path d="M24 64h80"/>
    <path d="M64 24c12 10 18 24 18 40s-6 30-18 40"/>
    <path d="M64 24c-12 10-18 24-18 40s6 30 18 40"/>
"@
$templates["log"] = @"
    <rect x="20" y="22" width="52" height="84" rx="6"/>
    <path d="M30 42h32M30 58h32M30 74h20"/>
    <path d="M76 66h32v24H92l-8 10v-10h-8z"/>
"@
$templates["restart"] = @"
    <path d="M98 50a34 34 0 1 0 2 28"/>
    <path d="M86 26h18v18"/>
"@
$templates["pause"] = @"
    <rect x="38" y="30" width="16" height="68" rx="4"/>
    <rect x="74" y="30" width="16" height="68" rx="4"/>
"@
$templates["play"] = @"
    <path d="M42 30l50 34-50 34z"/>
"@
$templates["skip"] = @"
    <path d="M30 30l34 34-34 34z"/>
    <path d="M64 30l34 34-34 34z"/>
    <path d="M104 30v68"/>
"@
$templates["shuffle"] = @"
    <path d="M20 36h16l52 56h20"/>
    <path d="M20 92h16l20-22"/>
    <path d="M88 36h20"/>
    <path d="M98 28l10 8-10 8"/>
    <path d="M98 84l10 8-10 8"/>
"@
$templates["loop"] = @"
    <path d="M24 44h64"/>
    <path d="M82 34l10 10-10 10"/>
    <path d="M104 84H40"/>
    <path d="M46 74l-10 10 10 10"/>
"@
$templates["vol_down"] = @"
    <path d="M20 74V54h16l20-18v56L36 74z"/>
    <path d="M70 72a18 18 0 0 0 0-16"/>
"@
$templates["vol_up"] = @"
    <path d="M20 74V54h16l20-18v56L36 74z"/>
    <path d="M70 78a26 26 0 0 0 0-28"/>
    <path d="M82 90a40 40 0 0 0 0-52"/>
"@
$templates["list"] = @"
    <circle cx="24" cy="36" r="2" fill="#FFFFFF" stroke="none"/>
    <circle cx="24" cy="58" r="2" fill="#FFFFFF" stroke="none"/>
    <circle cx="24" cy="80" r="2" fill="#FFFFFF" stroke="none"/>
    <path d="M34 36h70M34 58h70M34 80h70M34 102h54"/>
"@
$templates["note"] = @"
    <path d="M78 28v44"/>
    <path d="M78 28l24-6"/>
    <circle cx="54" cy="88" r="10"/>
    <circle cx="90" cy="82" r="10"/>
"@
$templates["stop"] = @"
    <rect x="34" y="34" width="60" height="60" rx="6"/>
"@
$templates["wrench"] = @"
    <path d="M74 28a18 18 0 0 0 20 24l-30 30-12-12 30-30A18 18 0 0 0 74 28z"/>
    <path d="M30 98l18-18"/>
    <circle cx="26" cy="102" r="6"/>
"@
$templates["arrow_in"] = @"
    <rect x="20" y="24" width="40" height="80" rx="6"/>
    <path d="M54 64h50"/>
    <path d="M84 44l20 20-20 20"/>
"@
$templates["arrow_out"] = @"
    <rect x="68" y="24" width="40" height="80" rx="6"/>
    <path d="M74 64H24"/>
    <path d="M44 44 24 64l20 20"/>
"@
$templates["power"] = @"
    <circle cx="64" cy="64" r="36"/>
    <path d="M64 28v20"/>
    <path d="M44 48a24 24 0 1 0 40 0"/>
"@
$templates["info"] = @"
    <circle cx="64" cy="64" r="40"/>
    <path d="M64 56v28"/>
    <circle cx="64" cy="42" r="4" fill="#FFFFFF" stroke="none"/>
"@
$templates["key"] = @"
    <circle cx="44" cy="64" r="16"/>
    <path d="M60 64h40"/>
    <path d="M88 64v10"/>
    <path d="M98 64v8"/>
"@
$templates["bot_select"] = @"
    <rect x="28" y="30" width="72" height="52" rx="8"/>
    <circle cx="50" cy="56" r="6"/>
    <circle cx="78" cy="56" r="6"/>
    <path d="M44 74h40"/>
    <path d="M52 94l12 12 12-12"/>
"@
$templates["gamepad"] = @"
    <rect x="26" y="48" width="76" height="36" rx="16"/>
    <path d="M44 66h16M52 58v16"/>
    <circle cx="82" cy="62" r="3" fill="#FFFFFF" stroke="none"/>
    <circle cx="90" cy="70" r="3" fill="#FFFFFF" stroke="none"/>
"@
$templates["headphones"] = @"
    <path d="M30 64a34 34 0 0 1 68 0"/>
    <rect x="26" y="64" width="14" height="24" rx="4"/>
    <rect x="88" y="64" width="14" height="24" rx="4"/>
"@
$templates["eye"] = @"
    <path d="M16 64s18-24 48-24 48 24 48 24-18 24-48 24-48-24-48-24z"/>
    <circle cx="64" cy="64" r="10"/>
"@
$templates["trophy"] = @"
    <path d="M42 26h44v14a22 22 0 0 1-44 0z"/>
    <path d="M46 90h36"/>
    <path d="M64 62v28"/>
    <path d="M30 30h12v10a12 12 0 0 1-12 12"/>
    <path d="M98 30H86v10a12 12 0 0 0 12 12"/>
"@
$templates["online"] = @"
    <circle cx="64" cy="64" r="34"/>
    <path d="M48 64l10 10 22-22"/>
"@
$templates["idle"] = @"
    <circle cx="64" cy="64" r="36"/>
    <path d="M64 44v22h16"/>
"@
$templates["dnd"] = @"
    <circle cx="64" cy="64" r="36"/>
    <path d="M46 64h36"/>
"@
$templates["offline"] = @"
    <circle cx="64" cy="64" r="36"/>
    <path d="M38 38l52 52"/>
"@
$templates["ar"] = @"
    <circle cx="64" cy="64" r="40"/>
  </g>
  <text x="64" y="74" font-family="Arial, sans-serif" font-size="26" text-anchor="middle" fill="#FFFFFF">AR</text>
  <g fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
"@
$templates["en"] = @"
    <circle cx="64" cy="64" r="40"/>
  </g>
  <text x="64" y="74" font-family="Arial, sans-serif" font-size="26" text-anchor="middle" fill="#FFFFFF">EN</text>
  <g fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
"@
$templates["disable"] = @"
    <rect x="24" y="28" width="80" height="56" rx="8"/>
    <path d="M40 100h48"/>
    <path d="M32 36l64 48"/>
"@

$map = @{
  "change_name" = "pencil"
  "change_avatar" = "user"
  "change_banner" = "banner"
  "assign_voice_room" = "mic"
  "change_activity" = "pulse"
  "change_presence" = "presence"
  "change_guild" = "home"
  "owner_manage" = "shield"
  "owner_list" = "users"
  "language" = "globe"
  "log_channel" = "log"
  "restart_bot" = "restart"

  "pause" = "pause"
  "resume" = "play"
  "skip" = "skip"
  "shuffle" = "shuffle"
  "loop" = "loop"
  "vol_down" = "vol_down"
  "vol_up" = "vol_up"
  "queue" = "list"
  "lyrics" = "note"
  "stop" = "stop"

  "setup" = "wrench"
  "come" = "arrow_in"
  "leave" = "arrow_out"

  "assign_voice" = "mic"
  "edit_name" = "pencil"
  "edit_avatar" = "user"
  "edit_status" = "pulse"
  "start_bot" = "power"
  "stop_bot" = "stop"
  "sub_info" = "info"
  "manage_access" = "key"
  "mybot_select" = "bot_select"

  "PLAYING" = "gamepad"
  "LISTENING" = "headphones"
  "WATCHING" = "eye"
  "COMPETING" = "trophy"

  "online" = "online"
  "idle" = "idle"
  "dnd" = "dnd"
  "invisible" = "offline"

  "ar" = "ar"
  "en" = "en"
  "none" = "disable"
}

foreach ($entry in $map.GetEnumerator()) {
  New-Icon -Name $entry.Key -Body $templates[$entry.Value]
}

$readme = @"
# SVG Icon Pack for Bot Actions

All icons are designed for conversion to PNG and upload as custom emojis.

## Naming Rule
- File name equals action key or menu value used in code.
- Example: change_name.svg maps to change_name.

## Included
change_name
change_avatar
change_banner
assign_voice_room
change_activity
change_presence
change_guild
owner_manage
owner_list
language
log_channel
restart_bot
pause
resume
skip
shuffle
loop
vol_down
vol_up
queue
lyrics
stop
setup
come
leave
assign_voice
edit_name
edit_avatar
edit_status
start_bot
stop_bot
sub_info
manage_access
mybot_select
PLAYING
LISTENING
WATCHING
COMPETING
online
idle
dnd
invisible
ar
en
none

## Suggested Export
- PNG: 128x128
- Transparent background
- Keep white icon color
"@
Set-Content -Path (Join-Path $dir "README.md") -Value $readme -Encoding UTF8

Get-ChildItem -Path $dir -File | Select-Object -ExpandProperty Name | Sort-Object