import { existsSync, readFileSync } from 'node:fs';
import type { ServerOptions as HttpsServerOptions } from 'node:https';
import path from 'node:path';

const LOCAL_CERTIFICATE_PATH = path.join('.cert', 'localhost.pem');
const LOCAL_CERTIFICATE_KEY_PATH = path.join('.cert', 'localhost-key.pem');

export function loadLocalHttpsOptions(projectRoot: string): HttpsServerOptions | undefined {
  const certificatePath = path.resolve(projectRoot, LOCAL_CERTIFICATE_PATH);
  const certificateKeyPath = path.resolve(projectRoot, LOCAL_CERTIFICATE_KEY_PATH);

  if (!existsSync(certificatePath) || !existsSync(certificateKeyPath)) {
    return undefined;
  }

  return {
    cert: readFileSync(certificatePath),
    key: readFileSync(certificateKeyPath),
  };
}
