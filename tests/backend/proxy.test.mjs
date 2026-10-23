import test from 'node:test';
import assert from 'node:assert/strict';
import { proxy } from '../../apps/api/src/vercel-proxy.mjs';

function response() {
  return { code:200, headers:{}, setHeader(name,value){this.headers[name]=value;}, status(code){this.code=code;return this;}, json(value){this.body=value;return this;} };
}
test('Vercel proxy requires configuration and forwards only signed, selected headers',async()=>{
  const prior={upstream:process.env.SCRIM_API_UPSTREAM,secret:process.env.SCRIM_PROXY_SECRET,fetch:globalThis.fetch};
  try {
    delete process.env.SCRIM_API_UPSTREAM;delete process.env.SCRIM_PROXY_SECRET;
    const missing=response();await proxy({url:'/api/health',method:'GET',headers:{}},missing);
    assert.equal(missing.code,503);
    process.env.SCRIM_API_UPSTREAM='https://api.example.test';process.env.SCRIM_PROXY_SECRET='test-secret';
    let captured;
    globalThis.fetch=async(url,options)=>{captured={url:String(url),options};return new Response('{"ok":true}',{headers:{'content-type':'application/json','set-cookie':'__Host-scrim-session=opaque; Secure; Path=/'}})};
    const result=response();await proxy({url:'/api/v1/auth/challenge',method:'POST',headers:{origin:'https://scrim.example','content-type':'application/json',cookie:'old=opaque','x-forwarded-for':'203.0.113.7, 10.0.0.2',authorization:'must-not-forward'},body:{accountId:'alice.testnet'}},result);
    assert.equal(result.code,200);assert.deepEqual(result.body,{ok:true});
    assert.equal(captured.url,'https://api.example.test/api/v1/auth/challenge');
    assert.equal(captured.options.headers['x-scrim-proxy-secret'],'test-secret');
    assert.equal(captured.options.headers['x-scrim-client-ip'],'203.0.113.7');
    assert.equal(captured.options.headers.authorization,undefined);
    assert.equal(result.headers['Set-Cookie'].length,1);
  } finally {
    globalThis.fetch=prior.fetch;
    for(const [key,value] of [['SCRIM_API_UPSTREAM',prior.upstream],['SCRIM_PROXY_SECRET',prior.secret]]) value===undefined?delete process.env[key]:process.env[key]=value;
  }
});
