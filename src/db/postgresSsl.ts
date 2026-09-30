import net from 'node:net';
import tls from 'node:tls';

export function postgresSslOptions(host: string, ca?: string): tls.ConnectionOptions {
  const options: tls.ConnectionOptions = {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };

  // node-pg sets TLS servername only for DNS hosts. An IP is rejected as a
  // server name, and Node then verifies the certificate as "localhost".
  if (net.isIP(host) !== 0) {
    options.checkServerIdentity = (_hostname, cert) => tls.checkServerIdentity(host, cert);
  }

  return options;
}
