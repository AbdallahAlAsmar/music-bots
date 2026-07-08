import { ApplicationCommandOptionType, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

export const controlCommands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  {
    name: "addbot",
    description: "Admin: Add and start a managed music bot",
    options: [
      { name: "token", description: "Bot token", type: ApplicationCommandOptionType.String, required: true },
      { name: "owner_id", description: "Owner Discord ID", type: ApplicationCommandOptionType.String, required: true },
      {
        name: "guild_id",
        description: "Guild ID where this bot should run",
        type: ApplicationCommandOptionType.String,
        required: true
      },
      {
        name: "plan_days",
        description: "Subscription plan",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        choices: [
          { name: "1 day", value: 1 },
          { name: "7 days", value: 7 },
          { name: "30 days", value: 30 },
          { name: "3 months", value: 90 }
        ]
      }
    ]
  },
  {
    name: "removebot",
    description: "Admin: Remove a managed bot",
    options: [{ name: "bot_id", description: "Bot ID or PX ID", type: ApplicationCommandOptionType.String, required: true }]
  },
  { name: "listbots", description: "Admin: List all managed bots" },
  {
    name: "botinfo",
    description: "Admin: Inspect managed bot",
    options: [{ name: "bot_id", description: "Bot ID or PX ID", type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: "sublookup",
    description: "Admin: Lookup subscription by PX ID",
    options: [{ name: "px_id", description: "PX subscription ID", type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: "extendsub",
    description: "Admin: Extend a bot subscription",
    options: [
      { name: "bot_id", description: "Bot ID or PX ID", type: ApplicationCommandOptionType.String, required: true },
      {
        name: "plan_days",
        description: "Extension plan",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        choices: [
          { name: "1 day", value: 1 },
          { name: "7 days", value: 7 },
          { name: "30 days", value: 30 },
          { name: "3 months", value: 90 }
        ]
      }
    ]
  },
  {
    name: "pausebot",
    description: "Admin: Pause a managed bot",
    options: [{ name: "bot_id", description: "Bot ID or PX ID", type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: "resumebot",
    description: "Admin: Resume a managed bot",
    options: [{ name: "bot_id", description: "Bot ID or PX ID", type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: "suspendbot",
    description: "Admin: Suspend a managed bot",
    options: [{ name: "bot_id", description: "Bot ID or PX ID", type: ApplicationCommandOptionType.String, required: true }]
  },
  { name: "health", description: "Admin: Show platform health" },
  { name: "mybot", description: "Open your bot control panel" }
];
