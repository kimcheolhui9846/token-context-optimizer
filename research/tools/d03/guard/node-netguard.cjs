// D03 offline guard for Node processes. Loaded with NODE_OPTIONS="--require=<this file>" so child Node processes
// inherit it. Blocks fetch, TCP/TLS/HTTP(S) connections, UDP sends and DNS lookups inside this process only; it does
// not change any system firewall. Every blocked attempt is appended to D03_NET_LOG (JSON lines) and throws.
"use strict";
const fs = require("node:fs");
const log = process.env.D03_NET_LOG || "";
function record(kind, detail) {
  if (log) {
    try {
      fs.appendFileSync(log, `${JSON.stringify({ event: "blocked", kind, detail: String(detail).slice(0, 80), pid: process.pid, lang: "node", step: process.env.D03_STEP || "" })}\n`);
    } catch {
      // logging must not hide the block
    }
  }
  const err = new Error(`D03 offline guard blocked ${kind}`);
  err.code = "D03_OFFLINE";
  return err;
}
if (log) {
  try {
    fs.appendFileSync(log, `${JSON.stringify({ event: "guard", pid: process.pid, lang: "node", step: process.env.D03_STEP || "" })}\n`);
  } catch {
    // ignore
  }
}
const net = require("node:net");
const tls = require("node:tls");
const dgram = require("node:dgram");
const dns = require("node:dns");
const http = require("node:http");
const https = require("node:https");
globalThis.fetch = async (input) => {
  throw record("fetch", typeof input === "string" ? "url" : "request");
};
net.Socket.prototype.connect = function connect() {
  throw record("net.connect", "socket");
};
net.connect = net.createConnection = () => {
  throw record("net.createConnection", "socket");
};
tls.connect = () => {
  throw record("tls.connect", "socket");
};
for (const mod of [http, https]) {
  mod.request = mod.get = () => {
    throw record(mod === http ? "http.request" : "https.request", "request");
  };
}
dgram.Socket.prototype.send = function send() {
  throw record("dgram.send", "udp");
};
for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"]) {
  dns[name] = () => {
    throw record(`dns.${name}`, "dns");
  };
  if (dns.promises && dns.promises[name]) {
    dns.promises[name] = async () => {
      throw record(`dns.promises.${name}`, "dns");
    };
  }
}
