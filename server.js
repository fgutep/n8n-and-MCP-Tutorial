#!/usr/bin/env node

/**
 * Post-It Board MCP Server
 * A simple MCP server for teaching MCP concepts with a visual post-it note board
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ... } from '@modelcontextprotocol/sdk/server/http.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "http";
import fs from "fs";
import path from "path";

// In-memory storage for post-it notes
const postItNotes = new Map();
let nextId = 1;

// --- Create some dummy data for demonstration ---
postItNotes.set(nextId, { id: nextId++, title: "Welcome!", description: "This is your first post-it. You can create, update, and delete these notes.", author: "MCP Server", color: "yellow", createdAt: new Date().toISOString() });
postItNotes.set(nextId, { id: nextId++, title: "MCP Tools", description: "Use the MCP tools like `create_postit` or `list_postits` to interact with this board.", author: "MCP Server", color: "blue", createdAt: new Date().toISOString() });
postItNotes.set(nextId, { id: nextId++, title: "Collaboration", description: "Anyone with the URL can see your changes in real-time!", author: "MCP Server", color: "pink", createdAt: new Date().toISOString() });
// ------------------------------------------------

// Create the MCP server
const server = new Server(
  {
    name: "postit-board",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_postit",
        description: "Create a new post-it note on the board",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the post-it note",
            },
            description: {
              type: "string",
              description: "The content/description of the post-it note",
            },
            author: {
              type: "string",
              description: "Who created this post-it note",
            },
            color: {
              type: "string",
              description: "Color of the post-it (yellow, pink, blue, green, orange)",
              enum: ["yellow", "pink", "blue", "green", "orange"],
            },
          },
          required: ["title", "description", "author"],
        },
      },
      {
        name: "list_postits",
        description: "List all post-it notes on the board",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_postit",
        description: "Get a specific post-it note by ID",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "The ID of the post-it note",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "update_postit",
        description: "Update an existing post-it note",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "The ID of the post-it note to update",
            },
            title: {
              type: "string",
              description: "New title (optional)",
            },
            description: {
              type: "string",
              description: "New description (optional)",
            },
            color: {
              type: "string",
              description: "New color (optional)",
              enum: ["yellow", "pink", "blue", "green", "orange"],
            },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_postit",
        description: "Delete a post-it note from the board",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "The ID of the post-it note to delete",
            },
          },
          required: ["id"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "create_postit": {
      const postIt = {
        id: nextId++,
        title: args.title,
        description: args.description,
        author: args.author,
        color: args.color || "yellow",
        createdAt: new Date().toISOString(),
      };
      postItNotes.set(postIt.id, postIt);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(postIt, null, 2),
          },
        ],
      };
    }

    case "list_postits": {
      const allNotes = Array.from(postItNotes.values());
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(allNotes, null, 2),
          },
        ],
      };
    }

    case "get_postit": {
      const postIt = postItNotes.get(args.id);
      if (!postIt) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Post-it not found" }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(postIt, null, 2),
          },
        ],
      };
    }

    case "update_postit": {
      const postIt = postItNotes.get(args.id);
      if (!postIt) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Post-it not found" }),
            },
          ],
          isError: true,
        };
      }

      if (args.title !== undefined) postIt.title = args.title;
      if (args.description !== undefined) postIt.description = args.description;
      if (args.color !== undefined) postIt.color = args.color;
      postIt.updatedAt = new Date().toISOString();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(postIt, null, 2),
          },
        ],
      };
    }

    case "delete_postit": {
      const existed = postItNotes.delete(args.id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: existed,
              message: existed
                ? `Post-it ${args.id} deleted`
                : "Post-it not found",
            }),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "Unknown tool" }),
          },
        ],
        isError: true,
      };
  }
});

// --- HTTP Server Setup ---
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const httpServer = http.createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        // Serve the demo client
        const filePath = path.join(process.cwd(), 'demo-client.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading demo-client.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (req.url === '/mcp' && req.method === 'POST') {
        // The transport will handle the MCP request
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start the server
async function main() {
  const transport = new HttpServerTransport({
      server: httpServer,
      path: '/mcp',
  });
  await server.connect(transport);

  httpServer.listen(PORT, HOST, () => {
    console.log(`Post-It Board server running!`);
    console.log(`- Dashboard: http://localhost:${PORT}`);
    console.log(`- MCP Endpoint: http://localhost:${PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
