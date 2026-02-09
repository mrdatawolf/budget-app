export interface TellerAccount {
    id: string;
    enrollment_id: string;
    name: string;
    type: 'depository' | 'credit';
    subtype: string;
    currency: string;
    last_four: string;
    status: 'open' | 'closed';
    institution: {
        id: string;
        name: string;
    };
    links: {
        self: string;
        balances: string;
        transactions: string;
    };
}
export interface TellerTransaction {
    id: string;
    account_id: string;
    amount: string;
    date: string;
    description: string;
    status: 'posted' | 'pending';
    type: string;
    running_balance: string | null;
    details: {
        processing_status: 'pending' | 'complete';
        category: string | null;
        counterparty: {
            name: string | null;
            type: 'organization' | 'person' | null;
        };
    };
    links: {
        self: string;
        account: string;
    };
}
export interface TellerBalance {
    account_id: string;
    ledger: string;
    available: string;
    links: {
        self: string;
        account: string;
    };
}
interface TellerClientConfig {
    accessToken: string;
}
declare class TellerClient {
    private accessToken;
    private cert;
    private key;
    constructor(config: TellerClientConfig);
    private request;
    listAccounts(): Promise<TellerAccount[]>;
    getAccount(accountId: string): Promise<TellerAccount>;
    getAccountBalance(accountId: string): Promise<TellerBalance>;
    listTransactions(accountId: string, options?: {
        count?: number;
        fromId?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<TellerTransaction[]>;
    deleteAccount(accountId: string): Promise<void>;
}
export declare function createTellerClient(accessToken: string): TellerClient;
export {};
