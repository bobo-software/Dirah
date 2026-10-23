import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import { postgresSslOptions } from './postgresSsl';

const cert = {
  subjectaltname: 'DNS:db.internal, IP Address:102.218.215.251',
} as tls.PeerCertificate;

describe('postgresSslOptions', () => {
  it('checks an IP host against the certificate IP', () => {
    const options = postgresSslOptions('102.218.215.251');
    expect(options.checkServerIdentity?.('localhost', cert)).toBeUndefined();
  });

  it('rejects an IP that is not on the certificate', () => {
    const options = postgresSslOptions('10.0.0.8');
    expect(options.checkServerIdentity?.('localhost', cert)).toBeInstanceOf(Error);
  });

  it('leaves a DNS host for the driver to check by name', () => {
    const options = postgresSslOptions('db.internal', 'ca-pem');
    expect(options.checkServerIdentity).toBeUndefined();
    expect(options.servername).toBeUndefined();
    expect(options.ca).toBe('ca-pem');
    expect(options.rejectUnauthorized).toBe(true);
  });
});
