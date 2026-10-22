import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function codeHashes(bytes) {
  const digest=createHash('sha256').update(bytes).digest();
  let n=BigInt('0x'+digest.toString('hex')),base58='';
  while(n){base58=alphabet[Number(n%58n)]+base58;n/=58n;}
  for(const b of digest){if(b!==0)break;base58='1'+base58;}
  return {sha256:digest.toString('hex'),nearCodeHash:base58};
}
export async function manifest(wasmPath,commit,runId) {
  const bytes=await readFile(wasmPath);
  if(!bytes.subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0])))throw Error('Invalid WASM header');
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Source commit is required');
  return {version:1,contract:'scrim-treasury-policy',sourceCommit:commit,runId:String(runId),sdk:'near-sdk 5.29.1',byteLength:bytes.length,...codeHashes(bytes)};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const [wasmPath,out]=process.argv.slice(2);
  if(!wasmPath||!out)throw Error('Usage: node scripts/release-manifest.mjs WASM OUTPUT');
  const result=await manifest(wasmPath,process.env.GITHUB_SHA,process.env.GITHUB_RUN_ID);
  result.rustc=execFileSync('rustc',['--version'],{encoding:'utf8'}).trim();
  await writeFile(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
