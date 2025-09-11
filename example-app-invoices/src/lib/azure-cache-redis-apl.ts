import { APL, AuthData } from "@saleor/app-sdk/APL";
import { createClient, RedisClientType } from 'redis';
import { DefaultAzureCredential } from '@azure/identity';

interface AzureCacheRedisConfig {
  host: string;
  port: number;
  password?: string;
  useManagedIdentity?: boolean;
  tls?: boolean;
}

// * Define the expected return types based on APL interface
type AplReadyResult = { ready: true } | { ready: false; error: Error };
type AplConfiguredResult = { configured: true } | { configured: false; error: Error };

export class AzureCacheRedisAPL implements APL {
  private client: RedisClientType | null = null;
  private config: AzureCacheRedisConfig;

  constructor(config: AzureCacheRedisConfig) {
    this.config = {
      tls: true, // * Default to TLS for security
      ...config
    };
  }

  private async createRedisClient(): Promise<RedisClientType> {
    const clientConfig: any = {
      socket: {
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        connectTimeout: 10000,
        commandTimeout: 5000,
      },
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    };

    // * Choose authentication method
    if (this.config.useManagedIdentity) {
      // * Use Azure Managed Identity (recommended for production)
      const credential = new DefaultAzureCredential();
      const token = await credential.getToken('https://redis.azure.com/.default');
      clientConfig.password = token.token;
    } else if (this.config.password) {
      // * Use access key authentication
      clientConfig.password = this.config.password;
    } else {
      throw new Error('Either password or managed identity must be configured for Azure Cache Redis');
    }

    const client = createClient(clientConfig);

    client.on('error', (err) => {
      console.error('Azure Cache Redis connection error:', err);
    });

    client.on('connect', () => {
      console.log('Azure Cache Redis connected successfully');
    });

    return client as RedisClientType;
  }

  private async ensureConnection(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = await this.createRedisClient();
    }
    
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    
    return this.client;
  }

  async get(saleorApiUrl: string): Promise<AuthData | undefined> {
    try {
      const client = await this.ensureConnection();
      const key = this.createKey(saleorApiUrl);
      const data = await client.get(key);
      
      return data ? JSON.parse(data) : undefined;
    } catch (error) {
      console.error('Azure Cache Redis get error:', error);
      return undefined;
    }
  }

  async set(authData: AuthData): Promise<void> {
    try {
      const client = await this.ensureConnection();
      const key = this.createKey(authData.saleorApiUrl);
      await client.set(key, JSON.stringify(authData));
    } catch (error) {
      console.error('Azure Cache Redis set error:', error);
      throw error;
    }
  }

  async delete(saleorApiUrl: string): Promise<void> {
    try {
      const client = await this.ensureConnection();
      const key = this.createKey(saleorApiUrl);
      await client.del(key);
    } catch (error) {
      console.error('Azure Cache Redis delete error:', error);
      throw error;
    }
  }

  async getAll(): Promise<AuthData[]> {
    try {
      const client = await this.ensureConnection();
      const keys = await client.keys("saleor-app:*");
      
      if (keys.length === 0) return [];
      
      const values = await client.mGet(keys);
      
      return values
        .filter((value): value is string => value !== null)
        .map(value => JSON.parse(value));
    } catch (error) {
      console.error('Azure Cache Redis getAll error:', error);
      return [];
    }
  }

  async isReady(): Promise<AplReadyResult> {
    try {
      const client = await this.ensureConnection();
      const result = await client.ping();
      
      if (result === 'PONG') {
        return { ready: true };
      } else {
        return { ready: false, error: new Error('Redis ping did not return PONG') };
      }
    } catch (error) {
      console.error('Azure Cache Redis isReady error:', error);
      return { ready: false, error: error instanceof Error ? error : new Error('Unknown error') };
    }
  }

  async isConfigured(): Promise<AplConfiguredResult> {
    try {
      // * Check if we have the minimum required configuration
      if (!this.config.host || !this.config.port) {
        return { 
          configured: false, 
          error: new Error('Missing required configuration: host or port') 
        };
      }

      if (!this.config.useManagedIdentity && !this.config.password) {
        return { 
          configured: false, 
          error: new Error('Missing authentication: either password or managed identity required') 
        };
      }

      // * Test the connection
      const readyResult = await this.isReady();
      if (readyResult.ready) {
        return { configured: true };
      } else {
        return { configured: false, error: readyResult.error };
      }
    } catch (error) {
      console.error('Azure Cache Redis isConfigured error:', error);
      return { 
        configured: false, 
        error: error instanceof Error ? error : new Error('Unknown configuration error') 
      };
    }
  }

  private createKey(saleorApiUrl: string): string {
    return `saleor-app:${saleorApiUrl}`;
  }

  // * Cleanup method for graceful shutdown
  async disconnect(): Promise<void> {
    if (this.client && this.client.isOpen) {
      try {
        await this.client.quit();
      } catch (error) {
        console.error('Error disconnecting Azure Cache Redis client:', error);
      } finally {
        this.client = null;
      }
    }
  }
}