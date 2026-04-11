import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { API_CONFIG } from "./config";
import { buildMcpTools } from "./shared";

const server = new McpServer({
  name: API_CONFIG.name,
  version: API_CONFIG.version,
});

const tools = buildMcpTools(API_CONFIG.routes);
const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";

for (const tool of tools) {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema as any,
    async (params: Record<string, unknown>) => {
      const route = tool._route;
      const url = `${API_BASE}${route.path}`;

      const response = await fetch(url, {
        method: route.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
