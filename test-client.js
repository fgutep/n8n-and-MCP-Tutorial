#!/usr/bin/env node

/**
 * Simple MCP Client Test Script
 * This demonstrates how to interact with the Post-It Board MCP server
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runDemo() {
  console.log("🚀 Starting Post-It Board MCP Demo\n");

  // Create client and connect to server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["server.js"],
  });

  const client = new Client(
    {
      name: "postit-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  console.log("✅ Connected to MCP server\n");

  // List available tools
  console.log("📋 Available Tools:");
  const tools = await client.listTools();
  tools.tools.forEach((tool) => {
    console.log(`   - ${tool.name}: ${tool.description}`);
  });
  console.log();

  // Demo: Create some post-its
  console.log("📝 Creating post-its...\n");

  const postit1 = await client.callTool("create_postit", {
    title: "Welcome to MCP!",
    description: "This is your first post-it note created via MCP",
    author: "Demo Script",
    color: "yellow",
  });
  console.log("Created:", JSON.parse(postit1.content[0].text));
  console.log();

  const postit2 = await client.callTool("create_postit", {
    title: "Learn CRUD Operations",
    description: "Create, Read, Update, Delete - the basics of data manipulation",
    author: "MCP Teacher",
    color: "blue",
  });
  console.log("Created:", JSON.parse(postit2.content[0].text));
  console.log();

  const postit3 = await client.callTool("create_postit", {
    title: "MCP is Powerful",
    description: "Connect AI to any tool or service you can imagine!",
    author: "Enthusiast",
    color: "pink",
  });
  console.log("Created:", JSON.parse(postit3.content[0].text));
  console.log();

  // Demo: List all post-its
  console.log("📜 Listing all post-its...\n");
  const allPostits = await client.callTool("list_postits", {});
  const postits = JSON.parse(allPostits.content[0].text);
  console.log(`Found ${postits.length} post-its:`);
  postits.forEach((p) => {
    console.log(`   #${p.id}: ${p.title} (by ${p.author})`);
  });
  console.log();

  // Demo: Get specific post-it
  console.log("🔍 Getting post-it #2...\n");
  const getResult = await client.callTool("get_postit", { id: 2 });
  console.log(JSON.parse(getResult.content[0].text));
  console.log();

  // Demo: Update a post-it
  console.log("✏️  Updating post-it #1...\n");
  const updateResult = await client.callTool("update_postit", {
    id: 1,
    description: "This post-it has been updated to show how MCP tools work!",
    color: "green",
  });
  console.log("Updated:", JSON.parse(updateResult.content[0].text));
  console.log();

  // Demo: Delete a post-it
  console.log("🗑️  Deleting post-it #3...\n");
  const deleteResult = await client.callTool("delete_postit", { id: 3 });
  console.log(JSON.parse(deleteResult.content[0].text));
  console.log();

  // Final list
  console.log("📜 Final post-its on board...\n");
  const finalList = await client.callTool("list_postits", {});
  const finalPostits = JSON.parse(finalList.content[0].text);
  console.log(`Remaining: ${finalPostits.length} post-its`);
  finalPostits.forEach((p) => {
    console.log(`   #${p.id}: ${p.title}`);
  });

  console.log("\n✨ Demo completed successfully!");

  await client.close();
  process.exit(0);
}

// Run the demo
runDemo().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});