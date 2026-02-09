import https from 'https';
import fs from 'fs';
import path from 'path';
class TellerClient {
    accessToken;
    cert;
    key;
    constructor(config) {
        this.accessToken = config.accessToken;
        // Load certificates for mTLS
        const certPath = path.resolve(process.env.TELLER_CERTIFICATE_PATH || './certificates/certificate.pem');
        const keyPath = path.resolve(process.env.TELLER_PRIVATE_KEY_PATH || './certificates/private_key.pem');
        this.cert = fs.readFileSync(certPath);
        this.key = fs.readFileSync(keyPath);
    }
    request(endpoint, method = 'GET') {
        return new Promise((resolve, reject) => {
            const authHeader = Buffer.from(`${this.accessToken}:`).toString('base64');
            const options = {
                hostname: 'api.teller.io',
                port: 443,
                path: endpoint,
                method,
                cert: this.cert,
                key: this.key,
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/json',
                },
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 204) {
                        resolve({});
                        return;
                    }
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        }
                        catch {
                            reject(new Error(`Failed to parse response: ${data}`));
                        }
                    }
                    else {
                        reject(new Error(`Teller API error: ${res.statusCode} ${res.statusMessage} - ${data}`));
                    }
                });
            });
            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });
            req.end();
        });
    }
    // List all accounts for the access token
    async listAccounts() {
        return this.request('/accounts');
    }
    // Get a single account
    async getAccount(accountId) {
        return this.request(`/accounts/${accountId}`);
    }
    // Get account balance
    async getAccountBalance(accountId) {
        return this.request(`/accounts/${accountId}/balances`);
    }
    // List transactions for an account
    async listTransactions(accountId, options) {
        const params = new URLSearchParams();
        if (options?.count)
            params.append('count', options.count.toString());
        if (options?.fromId)
            params.append('from_id', options.fromId);
        if (options?.startDate)
            params.append('start_date', options.startDate);
        if (options?.endDate)
            params.append('end_date', options.endDate);
        const queryString = params.toString();
        const endpoint = `/accounts/${accountId}/transactions${queryString ? `?${queryString}` : ''}`;
        return this.request(endpoint);
    }
    // Delete/disconnect an account
    async deleteAccount(accountId) {
        await this.request(`/accounts/${accountId}`, 'DELETE');
    }
}
// Factory function to create a Teller client
export function createTellerClient(accessToken) {
    return new TellerClient({ accessToken });
}
