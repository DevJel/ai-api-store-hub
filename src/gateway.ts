import type { Env } from './types';
import { getModelPrice, calculateCost, customerChargeCentavos, getUsdPhpRate, reserveWallet, settleWalletReservation, refundWalletReservation, recordUsage } from './billing';

interface ChatMessage { role: string; content: string; }
interface ChatRequest { model: string; messages: ChatMessage[]; stream?: boolean; max_tokens?: number; temperature?: number; }

export async function handleChatCompletions(env:Env,body:ChatRequest,tenantId:string,apiKeyId?:string):Promise<Response>{
  const start=Date.now(), requestId=crypto.randomUUID();
  if(!body || !Array.isArray(body.messages) || body.messages.length===0 || body.messages.some(m=>typeof m.content!=="string" || !["system","user","assistant"].includes(m.role))){
    return Response.json({error:{message:"A valid messages array is required",type:"invalid_request_error"}},{status:400});
  }
  const model=body.model||"@cf/meta/llama-3.1-8b-instruct";
  const maxTokens=Math.min(4096,Math.max(1,Math.floor(Number(body.max_tokens)||1024)));
  let reserved=0;
  try{
    const prices=await getModelPrice(env,model), rate=getUsdPhpRate(env);
    // Conservative character-to-token estimate plus the full requested output allowance.
    const inputEstimate=Math.ceil(body.messages.reduce((n,m)=>n+m.content.length,0)/2);
    const estimatedCost=calculateCost(inputEstimate,maxTokens,prices);
    reserved=customerChargeCentavos(estimatedCost,rate);
    const ok=await reserveWallet(env,tenantId,requestId,reserved);
    if(!ok) return Response.json({error:{message:"Insufficient PHP wallet balance. Please top up.",type:"billing_error"}},{status:402});
    const result=await env.AI.run(model as any,{
      messages:body.messages,max_tokens:maxTokens,temperature:typeof body.temperature==="number"?Math.max(0,Math.min(2,body.temperature)):0.7,
    } as any,{gateway:env.AI_GATEWAY_ID?{id:env.AI_GATEWAY_ID}:undefined} as any);
    const responseText=typeof result==="object"&&result!==null&&"response" in result?(result as any).response:JSON.stringify(result);
    const inputTokens=Math.ceil(body.messages.reduce((n,m)=>n+m.content.length,0)/3);
    const outputTokens=Math.ceil(String(responseText).length/3);
    const actualCost=calculateCost(inputTokens,outputTokens,prices);
    const actualCharge=customerChargeCentavos(actualCost,rate);
    await settleWalletReservation(env,tenantId,requestId,reserved,actualCharge);
    const platformShare = Math.floor(actualCharge * 30 / 100);
    const providerShare = actualCharge - platformShare;
    await env.DB.prepare(`INSERT OR IGNORE INTO revenue_allocations (id,request_id,tenant_id,provider_code,customer_charge_cents,platform_share_cents,provider_share_cents) VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),requestId,tenantId,'workers-ai',actualCharge,platformShare,providerShare).run();
    await recordUsage(env,{tenantId,apiKeyId,model,inputTokens,outputTokens,cost:actualCost,latencyMs:Date.now()-start,status:"success",requestId});
    return Response.json({
      id:"chatcmpl-"+requestId,object:"chat.completion",created:Math.floor(Date.now()/1000),model,
      choices:[{index:0,message:{role:"assistant",content:responseText},finish_reason:"stop"}],
      usage:{prompt_tokens:inputTokens,completion_tokens:outputTokens,total_tokens:inputTokens+outputTokens},
    });
  }catch(error){
    if(reserved>0) await refundWalletReservation(env,tenantId,requestId,reserved).catch(()=>undefined);
    return Response.json({error:{message:error instanceof Error?error.message:"Model request failed",type:"api_error"}},{status:500});
  }
}
