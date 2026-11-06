#!/usr/bin/env node
import { register } from "node:module";

// stdout carries MCP messages, so the engine's logs go to stderr.
console.log = console.info = console.debug = console.error;
register(new URL("../../scripts/extensionless-loader.mjs", import.meta.url));

const { StdioServerTransport } = await import(
  "@modelcontextprotocol/sdk/server/stdio.js"
);
const { createMcpServer } = await import("./server.js");

await createMcpServer().connect(new StdioServerTransport());
