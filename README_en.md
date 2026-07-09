# civ6-ai-copilot

Language: [Simplified Chinese](README.md) | [English](README_en.md)

`civ6-ai-copilot` is an AI turn copilot for Civilization VI. It adds an in-game briefing panel that turns the current game state into material your AI agent can analyze, helping you get clearer advice for cities, technologies, civics, policies, military defense, naval play, and settling.

It does not play the game for you, and it does not change rules, maps, units, resources, diplomacy, production, saves, or network sync state.

## Install

1. Subscribe to the Steam Workshop Mod:
   <https://steamcommunity.com/sharedfiles/filedetails/?id=3760876275>
2. Start Civilization VI.
3. Enable `Civ6 AI Copilot` in `Additional Content`.
4. Start or load a game.

If the Mod does not appear, restart Steam and Civ6, then make sure the Workshop item has finished downloading.

## Install the AI Skill

Send this prompt to your local agent, such as Codex or Claude Code:

```text
Please install or update the civ6-ai-copilot Agent Skill and local helper tools from https://github.com/KroMiose/civ6-ai-copilot.
Prefer the latest GitHub Release. If no Release is available yet, install the skill/ folder and required tooling from the repository.
When finished, tell me the skill version, local tooling directory, and whether I need to restart the client or open a new chat.
```

For later updates, you can simply say:

```text
Please update my civ6-ai-copilot skill and local helper tools to the latest version.
```

## First Use

1. Enter a Civ6 game.
2. Click the Copilot entry in the upper-left UI.
3. In the briefing panel, choose the full turn briefing action.
4. Return to your agent and send:

```text
I just summarized this Civ6 turn in the briefing panel. Please use the civ6-ai-copilot skill to read the latest briefing and tell me what I should do this turn.
```

If your agent says a type of information is missing, return to the briefing panel, click the action it asks for, then continue the conversation.

## What to Ask

```text
What should each city build next?
```

```text
Which technology and civic should I choose next?
```

```text
Am I ready to start a war? If not, how should I defend the front?
```

```text
Which policy cards should I use, and how should I spend my resources?
```

```text
Is the coast east of my capital, the river area, or the small southern island good for settling?
```

## When Information Is Missing

The agent will tell you which briefing information it needs. Return to Civ6, open the briefing panel, and follow the requested action:

- `Update map intel`: map, front line, navy, scouting, settling, and war decisions.
- `City operations`: production, housing, districts, and yields by city.
- `Military posture`: unit actions, defense, and troop movement.
- `Tech and civics`: technology, civic, Eureka, and Inspiration routes.
- `Government and policies`: government, policy slots, and active policy cards.
- `Resources`: strategic resources, luxuries, upgrades, maintenance, and trades.
- `Public diplomacy`: met civilizations, public relationships, and public military scores.
- `Full turn briefing`: first use, version changes, diagnostic issues, or multiple topics that need refreshing.

## Multiplayer

If your multiplayer room restricts UI or utility Mods, follow the room rules first. This project is for turn planning assistance, not cheating.

## More Docs

- [Developer and maintainer docs](docs/README.md)

Current version: `0.1.0`.
