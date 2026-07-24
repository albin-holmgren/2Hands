// Debug script to check AI transport configuration
// Run this in your Vercel deployment or add temporarily to an API route

export function checkAiConfig() {
  const gatewayKey = (process.env.AI_GATEWAY_API_KEY || '').trim();
  const oidcToken = (process.env.VERCEL_OIDC_TOKEN || '').trim();
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  
  console.log('=== AI Transport Debug ===');
  console.log('AI_GATEWAY_API_KEY exists:', Boolean(gatewayKey));
  console.log('AI_GATEWAY_API_KEY length:', gatewayKey.length);
  console.log('AI_GATEWAY_API_KEY prefix:', gatewayKey.substring(0, 10) + '...');
  console.log('VERCEL_OIDC_TOKEN exists:', Boolean(oidcToken));
  console.log('ANTHROPIC_API_KEY exists:', Boolean(anthropicKey));
  console.log('Selected transport:', gatewayKey || oidcToken ? 'gateway' : 'direct');
  console.log('========================');
  
  return {
    hasGatewayKey: Boolean(gatewayKey),
    hasOidcToken: Boolean(oidcToken),
    hasAnthropicKey: Boolean(anthropicKey),
    transport: gatewayKey || oidcToken ? 'gateway' : 'direct',
  };
}
