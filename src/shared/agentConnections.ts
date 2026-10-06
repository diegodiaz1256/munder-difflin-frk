/**
 * What an agent is TOLD about the connections and variables it has. Having them
 * wired in (an MCP server in its config, a variable in its env) is not enough:
 * an agent that was never told they exist reaches for web scraping, asks the
 * human for a key, or guesses. These lines go into its system prompt at spawn.
 * Names and descriptions only; no value ever passes through here.
 */

export interface PromptConnection {
  /** Connection id; the agent's MCP server is `munder-<id>`. */
  id: string;
  label: string;
  serviceLabel: string;
  description: string;
  examples: string[];
}

/** The MCP server name an agent sees for a connection. */
export const connectionServerName = (id: string): string => `munder-${id}`;

export function connectionsPromptLine(connections: PromptConnection[] | undefined): string {
  if (!connections || !connections.length) return '';
  const list = connections.map((c) => {
    const same = connections.filter((o) => o.serviceLabel === c.serviceLabel).length > 1;
    const name = same ? `${c.serviceLabel} "${c.label}"` : c.serviceLabel;
    return `${name} (MCP server \`${connectionServerName(c.id)}\`: ${c.description.replace(/\s+/g, ' ').trim()})`;
  }).join('; ');
  return `CONNECTIONS: the human already connected these outside services for you: ${list}. They are ready — the credentials are held by the harness and you never see them. `
    + 'USE THEM BY DEFAULT: when a task touches one of these services, call its MCP tools straight away instead of asking for a key, scraping the web, or guessing from memory. '
    + 'When a service has several connections, pick by its name (or ask which one if the task does not say). '
    + 'If a task needs a service that is not listed, ask the human to add it under Connections — never ask for the key itself.';
}

export function envPromptLine(names: string[] | undefined): string {
  if (!names || !names.length) return '';
  return `ENVIRONMENT: the human set these variables for you (already in your environment, values are plain settings): ${names.join(', ')}. Use them instead of hard-coding the values.`;
}
