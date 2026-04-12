import { createReadStream } from 'node:fs';
import { connect } from 'node:net';

const CHUNK_SIZE = 8192;
const INSTREAM_OPEN = Buffer.from('zINSTREAM\0');
const INSTREAM_END = Buffer.alloc(4, 0);

function parseResponse(data) {
  const text = data.toString('utf8').replace(/\0/g, '').trim();

  if (/^stream:\s*OK$/i.test(text)) {
    return { clean: true };
  }

  const found = text.match(/^stream:\s*(.+)\s+FOUND$/i);
  if (found) {
    return { clean: false, virus: found[1] };
  }

  const error = text.match(/^stream:\s*(.+)\s+ERROR$/i);
  if (error) {
    throw new Error(`ClamAV error: ${error[1]}`);
  }

  throw new Error(`Unexpected ClamAV response: ${text || '<empty>'}`);
}

function scanStream(filePath, { host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }, () => {
      socket.write(INSTREAM_OPEN);

      const fileStream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
      const chunks = [];

      fileStream.on('data', (chunk) => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      });

      fileStream.on('end', () => {
        socket.write(INSTREAM_END);
      });

      fileStream.on('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.on('data', (data) => {
        chunks.push(data);
      });

      socket.on('end', () => {
        resolve(parseResponse(Buffer.concat(chunks)));
      });
    });

    socket.setTimeout(timeoutMs);

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`ClamAV scan timed out after ${timeoutMs}ms`));
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}

export function createAvScanner({ host, port, timeoutMs }) {
  return {
    enabled: true,
    async scan(filePath) {
      return scanStream(filePath, { host, port, timeoutMs });
    }
  };
}

export function createNoopScanner() {
  return {
    enabled: false,
    async scan() {
      return { clean: true };
    }
  };
}
