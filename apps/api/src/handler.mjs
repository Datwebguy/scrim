import { hash, requireThat, ScrimError } from '../../../packages/protocol/src/index.mjs';
const sessionCookie='__Host-scrim-session', stateCookie='__Host-scrim-auth-state';
const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const cookies=req=>Object.fromEntries(String(req.headers.cookie??'').split(';').map(x=>x.trim().split('=')));
export function makeHandler(getRuntime) {
  return async (req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    try {
      const rt=await getRuntime();
      const path=new URL(req.url,rt.origin).pathname.replace(/\/$/,'');
      requireThat(['GET','POST'].includes(req.method),'method_not_allowed',405);
      if(req.method==='POST') {
        requireThat(req.headers.origin===rt.origin,'origin_mismatch',403);
        requireThat(req.headers['content-type']?.split(';')[0]==='application/json','json_required',415);
        const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
        requireThat(Buffer.byteLength(raw)<=96000,'request_too_large',413);
        if(typeof req.body==='string') req.body=JSON.parse(req.body);
      }
      const body=req.body??{}, jar=cookies(req), sessionToken=jar[sessionCookie], csrf=req.headers['x-csrf-token'];
      // Vercel owns x-forwarded-for on hosted requests; local execution uses socket address.
      const ip=process.env.SCRIM_PROXY_SECRET ? String(req.headers['x-scrim-client-ip']??'unknown').split(',')[0].trim() :
        process.env.VERCEL ? String(req.headers['x-forwarded-for']??'unknown').split(',')[0].trim() : req.socket?.remoteAddress??'local';
      await rt.limiter(hash(ip),60,60);
      if(path==='/api/v1/auth/challenge' && req.method==='POST') {
        if(body.purpose && body.purpose!=='session') requireThat(typeof csrf==='string','csrf_required',403);
        const result=await rt.identity.issue({account:body.accountId,purpose:body.purpose,action:body.action,sessionToken,csrf});
        res.setHeader('Set-Cookie',cookie(stateCookie,result.state,300));
        return res.status(201).json(result);
      }
      if(path==='/api/v1/auth/verify' && req.method==='POST') {
        requireThat(typeof body.id==='string' && /^[a-f0-9-]{36}$/.test(body.id),'invalid_challenge');
        requireThat(typeof body.state==='string' && jar[stateCookie]===body.state,'state_mismatch',403);
        const c=await rt.repo.challenge(body.id);
        requireThat(c?.purpose==='session','wrong_challenge_purpose',403);
        const result=await rt.identity.authorize({...body,sessionToken});
        res.setHeader('Set-Cookie',[cookie(sessionCookie,result.sessionToken,900),cookie(stateCookie,'',0)]);
        const {sessionToken:_,...safe}=result; return res.status(200).json(safe);
      }
      const session=await rt.identity.authenticate(sessionToken,req.method==='POST'?csrf:undefined);
      if(req.method==='POST') requireThat(typeof csrf==='string','csrf_required',403);
      await rt.limiter(hash(session.accountId),30,60);
      if(path==='/api/v1/auth/session' && req.method==='GET') return res.status(200).json({accountId:session.accountId,network:session.network,expiresAt:session.expiresAt});
      if(path==='/api/v1/auth/logout' && req.method==='POST') {
        await rt.repo.revoke(hash(sessionToken)); res.setHeader('Set-Cookie',cookie(sessionCookie,'',0)); return res.status(200).json({revoked:true});
      }
      if(path==='/api/v1/treasuries' && req.method==='GET') return res.status(200).json({treasuries:await rt.repo.treasuries(session.accountId,session.network)});
      if(path==='/api/v1/treasuries' && req.method==='POST') {
        requireThat(typeof body.id==='string' && /^[a-f0-9-]{36}$/.test(body.id),'invalid_challenge');
        requireThat(jar[stateCookie]===body.state && typeof body.state==='string','state_mismatch',403);
        const c=await rt.repo.challenge(body.id); requireThat(c?.purpose==='treasury:create','wrong_challenge_purpose',403);
        const result=await rt.identity.authorize({...body,sessionToken,csrf,idempotencyKey:req.headers['idempotency-key']});
        res.setHeader('Set-Cookie',cookie(stateCookie,'',0)); return res.status(201).json(result);
      }
      const match=/^\/api\/v1\/treasuries\/([a-f0-9-]{36})\/confirm$/.exec(path);
      if(match && req.method==='POST') return res.status(200).json(await rt.treasury.confirm(match[1],session.accountId,body.transactionHash));
      throw new ScrimError('route_not_found',404);
    } catch(error) {
      // Never echo RPC exceptions, SQL, signatures, account details, or credentials.
      return res.status(error instanceof ScrimError ? error.status : 503).json({error:error instanceof ScrimError ? error.code : 'service_unavailable'});
    }
  };
}
