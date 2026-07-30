import net from "node:net";

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function choose(preferred, used, start, end) {
  if (preferred) {
    if (used.has(preferred) || !(await canListen(preferred))) {
      throw new Error(`指定端口 ${preferred} 已被占用`);
    }
    return preferred;
  }
  for (let port = start; port <= end; port += 1) {
    if (!used.has(port) && (await canListen(port))) return port;
  }
  throw new Error(`在 ${start}-${end} 范围内未找到空闲端口`);
}

const studioPreferred = Number(process.env.STUDIO_PORT || 0);
const opencodePreferred = Number(process.env.OPENCODE_PORT || 0);
const used = new Set();

try {
  const studio = await choose(studioPreferred, used, 4173, 4999);
  used.add(studio);
  const opencode = await choose(opencodePreferred, used, 4096, 4999);
  process.stdout.write(`${studio} ${opencode}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
