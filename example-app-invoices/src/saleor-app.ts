import { APL } from "@saleor/app-sdk/APL";
import { FileAPL } from "@saleor/app-sdk/APL/file";
import { SaleorCloudAPL } from "@saleor/app-sdk/APL/saleor-cloud";
import { UpstashAPL } from "@saleor/app-sdk/APL/upstash";
import { AzureCacheRedisAPL } from "./lib/azure-cache-redis-apl"
import { SaleorApp } from "@saleor/app-sdk/saleor-app";

const aplType = process.env.APL ?? "file";

let apl: APL;

switch (aplType) {
  case "azure-cache-redis": // Add this case
    if (!process.env.AZURE_REDIS_HOST || !process.env.AZURE_REDIS_PORT) {
      throw new Error(
        "Azure Cache Redis APL is not configured - missing AZURE_REDIS_HOST or AZURE_REDIS_PORT"
      );
    }

    const useManagedIdentity =
      process.env.AZURE_USE_MANAGED_IDENTITY === "true";

    if (!useManagedIdentity && !process.env.AZURE_REDIS_PASSWORD) {
      throw new Error(
        "Azure Cache Redis APL requires either AZURE_REDIS_PASSWORD or AZURE_USE_MANAGED_IDENTITY=true"
      );
    }

    apl = new AzureCacheRedisAPL({
      host: process.env.AZURE_REDIS_HOST,
      port: parseInt(process.env.AZURE_REDIS_PORT),
      password: process.env.AZURE_REDIS_PASSWORD,
      useManagedIdentity,
      tls: true, // Always use TLS for security
    });
    break;

  case "upstash":
    if (
      !process.env.UPSTASH_REDIS_REST_URL ||
      !process.env.UPSTASH_REDIS_REST_TOKEN
    ) {
      throw new Error(
        "Upstash APL is not configured - missing env variables. Check saleor-app.ts"
      );
    }

    apl = new UpstashAPL({
      restURL: process.env.UPSTASH_REDIS_REST_URL,
      restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    break;
  case "file":
    apl = new FileAPL();

    break;
  case "rest": {
    if (!process.env.REST_APL_ENDPOINT || !process.env.REST_APL_TOKEN) {
      throw new Error(
        "Rest APL is not configured - missing env variables. Check saleor-app.ts"
      );
    }

    apl = new SaleorCloudAPL({
      resourceUrl: process.env.REST_APL_ENDPOINT,
      token: process.env.REST_APL_TOKEN,
    });

    break;
  }
  default: {
    throw new Error("Invalid APL config, ");
  }
}
export const saleorApp = new SaleorApp({
  apl,
});

export const REQUIRED_SALEOR_VERSION = ">=3.10 <4";
