import { NextRequest, NextResponse } from "next/server";
import { CdpClient } from "@coinbase/cdp-sdk";
import { HTTPFacilitatorClient, x402ResourceServer, x402HTTPResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

// Initialize CDP client
const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  walletSecret: process.env.CDP_WALLET_SECRET!,
});

// Cache for server initialization
let payToAddress: string | null = null;
let httpServer: x402HTTPResourceServer | null = null;

async function initializeServer() {
  if (httpServer && payToAddress) {
    return { httpServer, payToAddress };
  }

  // Create or get account to receive payments
  const account = await cdp.evm.createAccount();
  payToAddress = account.address;

  // Initialize facilitator client for Base Sepolia testnet
  const facilitatorClient = new HTTPFacilitatorClient({
    url: "https://x402.org/facilitator",
  });

  // Create resource server with EVM support for Base Sepolia
  const resourceServer = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(resourceServer, {
    networks: ["eip155:84532"], // Base Sepolia
  });

  // Define route configuration
  const routesConfig = {
    "GET /api": {
      accepts: [
        {
          scheme: "exact" as const,
          price: "$0.01",
          network: "eip155:84532" as `${string}:${string}`,
          payTo: payToAddress,
        },
      ],
      description: "Access to API endpoint",
      mimeType: "application/json",
    },
  };

  // Create HTTP resource server
  httpServer = new x402HTTPResourceServer(resourceServer, routesConfig);
  await httpServer.initialize();

  return { httpServer, payToAddress };
}

export async function GET(request: NextRequest) {
  try {
    const { httpServer } = await initializeServer();

    // Create HTTP adapter for Next.js
    const adapter = {
      getHeader: (name: string) => request.headers.get(name) || undefined,
      getMethod: () => request.method,
      getPath: () => new URL(request.url).pathname,
      getUrl: () => request.url,
      getAcceptHeader: () => request.headers.get("accept") || "",
      getUserAgent: () => request.headers.get("user-agent") || "",
      getQueryParams: () => {
        const params: Record<string, string> = {};
        new URL(request.url).searchParams.forEach((value, key) => {
          params[key] = value;
        });
        return params;
      },
      getQueryParam: (name: string) => new URL(request.url).searchParams.get(name) || undefined,
      getBody: () => ({}),
    };

    // Create HTTP request context
    const context = {
      adapter,
      path: new URL(request.url).pathname,
      method: request.method,
    };

    // Process the request through x402
    const result = await httpServer.processHTTPRequest(context);

    if (result.type === "payment-error") {
      // Return 402 with payment error using the response instructions
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.response.headers)) {
        headers[key] = String(value);
      }

      return new NextResponse(
        JSON.stringify(result.response.body),
        {
          status: result.response.status,
          headers,
        }
      );
    }

    if (result.type === "payment-verified") {
      // Payment signature verified - now settle the payment on-chain
      console.log("[x402] Payment verified, initiating settlement...");

      const settlementResult = await httpServer.processSettlement(
        result.paymentPayload,
        result.paymentRequirements
      );

      if (!settlementResult.success) {
        console.error("[x402] Settlement failed:", settlementResult.errorReason);
        return NextResponse.json(
          {
            error: "Payment settlement failed",
            details: settlementResult.errorReason,
          },
          { status: 402 }
        );
      }

      console.log("[x402] Settlement successful:", settlementResult);

      // Extract transaction hash from settlement response
      const txHash = settlementResult.transaction;
      const network = result.paymentRequirements.network;

      // Determine the block explorer URL based on network
      const getExplorerUrl = (network: string, txHash: string) => {
        if (network === "eip155:84532") {
          // Base Sepolia
          return `https://sepolia.basescan.org/tx/${txHash}`;
        } else if (network === "eip155:8453") {
          // Base Mainnet
          return `https://basescan.org/tx/${txHash}`;
        }
        return null;
      };

      const explorerUrl = txHash ? getExplorerUrl(network, txHash) : null;

      // Build response with settlement headers
      const responseData = {
        success: true,
        message: "Payment settled successfully",
        data: {
          timestamp: new Date().toISOString(),
        },
        settlement: {
          transactionHash: txHash || null,
          network: network,
          explorerUrl: explorerUrl,
          settled: true,
        },
      };

      // Include settlement headers from the response
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...settlementResult.headers,
      };

      return new NextResponse(JSON.stringify(responseData), {
        status: 200,
        headers,
      });
    }

    // No payment required (shouldn't happen with our config, but handle it)
    return NextResponse.json({
      success: true,
      message: "Request processed",
    });
  } catch (error) {
    console.error("Payment processing error:", error);
    return NextResponse.json(
      {
        error: "Payment processing failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
